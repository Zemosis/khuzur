// KHUZUR CARD HALL — authoritative game server.
// All game state lives in RAM here. Clients only send move requests; the
// server validates everything and emits redacted state (hidden hands stripped).

import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { randomInt, randomUUID } from "node:crypto";
import { ThirteenGame, redactState, DEFAULT_DELAYS } from "./game/engine.js";
import { MuushigGame, muushigView, DEFAULT_MUUSHIG_DELAYS } from "./game/muushigGame.js";
import { BOT_NAMES } from "./game/constants.js";
import { createSession, finishSession, closeOrphanedSessions } from "./persistence.js";
import { authRouter, socketIdentity } from "./auth.js";
import { oauthRouter } from "./oauth.js";
import { migrate, pool } from "./db/index.js";

const PORT = process.env.PORT || 3001;
const CORS_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

const envMs = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name] !== "" ? n : fallback;
};

// How long a disconnected player keeps their seat before a CPU takes over.
const DISCONNECT_GRACE_MS = envMs("DISCONNECT_GRACE_MS", 60_000);
// Engine pacing. Unset means the engine's defaults; the test suite shortens them.
const GAME_DELAYS = {
  aiTurn: envMs("AI_TURN_DELAY_MS", DEFAULT_DELAYS.aiTurn),
  roundEnd: envMs("ROUND_END_DELAY_MS", DEFAULT_DELAYS.roundEnd),
  deal: envMs("DEAL_DELAY_MS", DEFAULT_DELAYS.deal),
};
// Muushig paces itself to the browser's animations; the test suite sets every
// step to MUUSHIG_DELAY_MS at once.
const MUUSHIG_DELAYS = process.env.MUUSHIG_DELAY_MS
  ? Object.fromEntries(Object.keys(DEFAULT_MUUSHIG_DELAYS).map((k) => [k, envMs("MUUSHIG_DELAY_MS", 0)]))
  : DEFAULT_MUUSHIG_DELAYS;

/**
 * Each game the hall serves: seats at a table, its engine, what each player is
 * sent (their redacted view) and on which event.
 */
const GAMES = {
  thirteen: {
    seats: 4,
    stateEvent: "game_state_update",
    view: redactState,
    create: (seats, hooks) => new ThirteenGame({ seats, delays: GAME_DELAYS, ...hooks }),
  },
  muushig: {
    seats: 5,
    stateEvent: "muushig_state",
    view: muushigView,
    create: (seats, hooks) => new MuushigGame({ seats, delays: MUUSHIG_DELAYS, ...hooks }),
  },
};
const gameTypeOf = (type) => (Object.hasOwn(GAMES, type) ? type : "thirteen");

const app = express();
app.use(cors({ origin: CORS_ORIGINS }));
app.get("/", (_req, res) => res.json({ ok: true, service: "card-game-server" }));
// Before the accounts router, which answers JSON errors for its whole path.
app.use("/api/auth/oauth", oauthRouter);
app.use("/api/auth", authRouter);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"] },
});

/**
 * lobbies: Map<lobbyId, {
 *   id, gameType ("thirteen" | "muushig"), name, isPrivate, maxPlayers,
 *   hostKey, createdAt, startedAt,
 *   members: Map<playerKey, {
 *     key, userId, name, tag, displayName,
 *     socketId, connected, seatIndex, disconnectTimer
 *   }>,
 *   seats: Array(4 or 5) of { kind: "human", key } | { kind: "cpu", name, level } | null,
 *     // who sits where while the table waits; frozen into the game at start
 *   roster: Map<playerKey, seat ledger>,   // never pruned — see below
 *   rounds: Array<round summary>,
 *   sessionPromise, recorded,
 *   game: ThirteenGame | MuushigGame | null
 * }>
 *
 * `members` is the LIVE connection map and loses a player the moment they quit.
 * `roster` is the recording ledger: every seat ever occupied for the current
 * match, kept until the session is written. Recording from `members` is what
 * previously made quitters vanish from match history entirely.
 */
const lobbies = new Map();

// ---------- AUTH MIDDLEWARE ----------
// Signed-in players pass their JWT from /api/auth; guests pass name + tag.
// Identity (playerKey) is what survives refreshes and reconnects.
io.use(async (socket, next) => {
  const { userId, name, tag, avatar } = await socketIdentity(socket.handshake.auth);
  socket.data.userId = userId;
  socket.data.name = name;
  socket.data.tag = tag;
  socket.data.displayName = `${name} #${tag}`;
  socket.data.playerKey = userId || `guest:${name}#${tag}`;
  socket.data.avatar = avatar;
  next();
});

// ---------- HELPERS ----------

// Codes and ids come from crypto, never Math.random: its outputs would let a
// player work out the generator's state and predict the next shuffle.
const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const makeLobbyId = (isPrivate) => {
  const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
  return isPrivate ? code : `PUB-${code}`;
};

// The 6 characters people type or share; public ids carry a "PUB-" prefix.
const shareCode = (id) => id.replace(/^PUB-/, "");

const CPU_LEVELS = ["EASY", "MEDIUM", "HARD"];

/** The first BOT_NAMES name not already used at this table ("Bot n" past the list). */
function nextCpuName(seats) {
  const used = new Set(seats.filter((s) => s?.kind === "cpu").map((s) => s.name));
  const free = BOT_NAMES.find((name) => !used.has(name));
  if (free) return free;
  let n = BOT_NAMES.length + 1;
  while (used.has(`Bot ${n}`)) n++;
  return `Bot ${n}`;
}

/** Seats a member at a waiting table: first empty seat, else bumps a CPU. */
function takeSeat(lobby, member) {
  let i = lobby.seats.findIndex((s) => s === null);
  if (i === -1) i = lobby.seats.findIndex((s) => s?.kind === "cpu");
  if (i === -1) return false;
  lobby.seats[i] = { kind: "human", key: member.key };
  member.seatIndex = i;
  return true;
}

/** The waiting table as one member sees it. Never includes player keys. */
function tableViewFor(lobby, member) {
  return {
    lobbyId: lobby.id,
    gameType: lobby.gameType,
    name: lobby.name,
    isPrivate: lobby.isPrivate,
    status: "waiting",
    code: shareCode(lobby.id),
    mySeat: member.seatIndex,
    isHost: lobby.hostKey === member.key,
    seats: lobby.seats.map((s) => {
      if (!s) return null;
      if (s.kind === "cpu") return { kind: "cpu", name: s.name, level: s.level };
      const m = lobby.members.get(s.key);
      return {
        kind: "human",
        name: m?.displayName || "?",
        avatar: m?.avatar || null,
        isHost: lobby.hostKey === s.key,
        connected: !!m?.connected,
      };
    }),
  };
}

/** Sends every connected member of a WAITING table their view of it. */
function broadcastTable(lobby) {
  if (lobby.game) return;
  for (const member of lobby.members.values()) {
    if (!member.connected || !member.socketId) continue;
    io.to(member.socketId).emit("table_update", tableViewFor(lobby, member));
  }
}

function sendTableTo(lobby, socket) {
  if (lobby.game) return;
  const member = lobby.members.get(socket.data.playerKey);
  if (member) socket.emit("table_update", tableViewFor(lobby, member));
}

function publicLobbyList(gameType) {
  return [...lobbies.values()]
    .filter((l) => !l.isPrivate && l.gameType === gameType)
    .map((l) => {
      const host = l.members.get(l.hostKey);
      return {
        id: l.id,
        gameType: l.gameType,
        name: l.name,
        host: host?.displayName || "?",
        current: l.members.size,
        max: l.maxPlayers,
        inProgress: !!l.game,
      };
    });
}

// Sockets looking at a game's table list. Only they get its updates: sending
// every change to every connected player would grow with tables x players.
const browsing = (gameType) => `browsing:${gameType}`;

function broadcastLobbyList(gameType) {
  io.to(browsing(gameType)).emit("public_lobbies_update", publicLobbyList(gameType));
}

function stopBrowsing(socket) {
  for (const type of Object.keys(GAMES)) socket.leave(browsing(type));
}

/** Seats a socket in a table's room; at a table it no longer watches the lists. */
function enterRoom(socket, lobbyId) {
  stopBrowsing(socket);
  socket.join(lobbyId);
}

function addMember(lobby, socket) {
  const member = {
    key: socket.data.playerKey,
    userId: socket.data.userId,
    name: socket.data.name,
    tag: socket.data.tag,
    displayName: socket.data.displayName,
    avatar: socket.data.avatar,
    socketId: socket.id,
    connected: true,
    seatIndex: null,
    disconnectTimer: null,
  };
  lobby.members.set(member.key, member);
  return member;
}

/**
 * Sends each lobby member their own redacted view of the game state.
 *
 * `game` is passed explicitly because the very first broadcast happens INSIDE
 * the ThirteenGame constructor, before `lobby.game` has been assigned. Reading
 * lobby.game here dropped that initial deal on every single match: clients only
 * recovered when the first AI move triggered another broadcast ~4s later, and
 * when a human held the opening turn no AI was scheduled, so nothing ever
 * arrived and the board stayed blank.
 */
function broadcastState(lobby, game = lobby.game) {
  if (!game) return;
  const { view, stateEvent } = GAMES[lobby.gameType];
  for (const member of lobby.members.values()) {
    if (!member.connected || !member.socketId) continue;
    io.to(member.socketId).emit(stateEvent, {
      ...view(game.state, member.seatIndex ?? -1),
      amHost: lobby.hostKey === member.key,
      dealMsLeft: game.dealMsLeft(),
    });
  }
}

function sendStateTo(lobby, socket) {
  if (!lobby.game) return;
  const { view, stateEvent } = GAMES[lobby.gameType];
  const member = lobby.members.get(socket.data.playerKey);
  socket.emit(stateEvent, {
    ...view(lobby.game.state, member?.seatIndex ?? -1),
    amHost: !!member && lobby.hostKey === member.key,
    dealMsLeft: lobby.game.dealMsLeft(),
  });
}

/** Adds (or refreshes) a seat in the recording ledger. Never removes. */
function rosterEnter(lobby, member) {
  if (member.seatIndex == null) return;
  const existing = lobby.roster.get(member.key);
  if (existing) {
    // Rejoined: they are back in a seat, so this is no longer an early exit.
    existing.seatIndex = member.seatIndex;
    existing.leftAt = null;
    existing.leftEarly = false;
    return;
  }
  lobby.roster.set(member.key, {
    playerKey: member.key,
    userId: member.userId,
    name: member.name,
    tag: member.tag,
    seatIndex: member.seatIndex,
    joinedAt: new Date(),
    leftAt: null,
    leftEarly: false,
    cpuTookOver: false,
    disconnectCount: 0,
  });
}

/** Marks a seat as vacated. The entry stays so the loss is still recorded. */
function rosterLeave(lobby, member, { cpuTookOver = false } = {}) {
  const entry = lobby.roster.get(member.key);
  if (!entry) return;
  entry.leftAt = new Date();
  entry.leftEarly = true;
  if (cpuTookOver) entry.cpuTookOver = true;
}

/**
 * Writes the session outcome exactly once. Called on game over and again if the
 * lobby dies first, so an abandoned match still leaves a record.
 */
function closeSession(lobby, { completed, endedReason }) {
  if (!lobby.sessionPromise || lobby.recorded) return;
  lobby.recorded = true;

  // Snapshot now: the lobby may be torn down before the insert resolves.
  const snapshot = {
    gameType: lobby.gameType,
    completed,
    endedReason,
    finishedAt: lobby.game?.finishedAt || new Date(),
    roster: [...lobby.roster.values()],
    rounds: [...lobby.rounds],
    state: lobby.game?.state || null,
  };

  lobby.sessionPromise
    .then((sessionId) => sessionId && finishSession({ sessionId, ...snapshot }))
    .catch((err) => console.error("[db] finishSession failed:", err));
}

/**
 * Opens a fresh recording session for the match now running in this lobby.
 * Called for the first match AND for every rematch — a rematch is a separate
 * match and gets its own session row.
 *
 * The row is written at match start, not at game over, so a match that is
 * abandoned still leaves a trace.
 */
function beginSession(lobby) {
  lobby.roster.clear();
  lobby.rounds = [];
  lobby.recorded = false;
  for (const member of lobby.members.values()) rosterEnter(lobby, member);

  const host = lobby.members.get(lobby.hostKey);
  lobby.sessionPromise = createSession({
    gameType: lobby.gameType,
    lobbyId: lobby.id,
    lobbyName: lobby.name,
    isPrivate: lobby.isPrivate,
    hostUserId: host?.userId || null,
    hostDisplayName: host?.displayName || "?",
    maxPlayers: lobby.maxPlayers,
    playerCount: lobby.roster.size,
    startedAt: lobby.game?.startedAt,
  }).catch((err) => {
    console.error("[db] createSession failed:", err);
    return null;
  });
}

function startGame(lobby) {
  if (lobby.gameType === "thirteen") {
    // Thirteen plays with the filled seats only. Close the gaps so lobby seat
    // i is still engine player i, and tell each member their new seat.
    lobby.seats = lobby.seats.filter(Boolean);
    lobby.seats.forEach((s, i) => {
      if (s.kind === "human") lobby.members.get(s.key).seatIndex = i;
    });
  }
  // Muushig always seats 5: empty seats become MEDIUM CPUs.
  lobby.seats = lobby.seats.map((s) => s ?? { kind: "cpu", name: null, level: "MEDIUM" });
  for (const s of lobby.seats) if (s.kind === "cpu" && !s.name) s.name = nextCpuName(lobby.seats);
  const seats = lobby.seats.map((s) => {
    if (s.kind === "cpu") return { type: "AI", name: s.name, socketId: null, level: s.level };
    const m = lobby.members.get(s.key);
    return { type: "HUMAN", name: m.displayName, socketId: m.socketId, avatar: m.avatar };
  });

  lobby.game = GAMES[lobby.gameType].create(seats, {
    // The engine hands us itself, which is what makes the constructor-time
    // broadcast work -- see broadcastState.
    onState: (game) => broadcastState(lobby, game),
    // Fires before onGameOver, so the final round is captured before the
    // session is closed out.
    onRoundEnd: (round) => lobby.rounds.push(round),
    onGameOver: () => closeSession(lobby, { completed: true, endedReason: "completed" }),
  });

  beginSession(lobby);
  console.log(`${lobby.gameType} started in lobby ${lobby.id} (${lobby.members.size} humans)`);
  broadcastLobbyList(lobby.gameType);
}

function removeMember(lobby, member, { convertSeat = true } = {}) {
  if (member.disconnectTimer) clearTimeout(member.disconnectTimer);
  lobby.members.delete(member.key);

  // Waiting table: the seat simply empties (CPUs only fill in at START).
  if (!lobby.game && member.seatIndex != null && lobby.seats[member.seatIndex]?.key === member.key) {
    lobby.seats[member.seatIndex] = null;
  }

  // Mid-game: a CPU inherits the seat and hand so the match can continue.
  const cpuTookOver = !!(convertSeat && lobby.game && member.seatIndex != null);
  if (cpuTookOver) {
    lobby.game.replaceSeat(member.seatIndex, {
      type: "AI",
      name: `${member.name} (CPU)`,
      socketId: null,
    });
  }

  // The ledger keeps the seat so the result is still attributed to them.
  if (lobby.game) rosterLeave(lobby, member, { cpuTookOver });

  if (lobby.members.size === 0) {
    destroyLobby(lobby);
  } else {
    if (lobby.hostKey === member.key) {
      // Waiting: next human by seat order. Playing: first remaining member.
      const seated = !lobby.game && lobby.seats.find((s) => s?.kind === "human");
      lobby.hostKey = seated ? seated.key : lobby.members.keys().next().value;
      broadcastState(lobby); // mid-match: the new host's state now says so
    }
    broadcastTable(lobby);
  }
  broadcastLobbyList(lobby.gameType);
}

function destroyLobby(lobby) {
  // Everyone left before the match ended — record it rather than losing it.
  closeSession(lobby, { completed: false, endedReason: "all_left" });
  if (lobby.game) lobby.game.destroy();
  for (const m of lobby.members.values()) {
    if (m.disconnectTimer) clearTimeout(m.disconnectTimer);
  }
  lobbies.delete(lobby.id);
  console.log(`Lobby destroyed: ${lobby.id}`);
}

/**
 * Holds a member's seat while they are away (disconnected, or left the page),
 * then removes them unless they rejoined. Rejoining clears the timer.
 */
function holdSeat(lobby, member) {
  member.connected = false;
  if (member.disconnectTimer) clearTimeout(member.disconnectTimer);
  member.disconnectTimer = setTimeout(() => {
    member.disconnectTimer = null;
    if (!member.connected) removeMember(lobby, member);
  }, DISCONNECT_GRACE_MS);
  broadcastTable(lobby); // the waiting table shows them as reconnecting
}

function findMembership(socket) {
  for (const lobby of lobbies.values()) {
    const member = lobby.members.get(socket.data.playerKey);
    if (member && member.socketId === socket.id) return { lobby, member };
  }
  return null;
}

// ---------- SOCKET HANDLERS ----------

io.on("connection", (socket) => {
  // Handlers destructure their payload with a `= {}` default, which only covers
  // undefined. A null payload would throw outside any try and kill the process.
  socket.use((packet, next) => {
    if (packet[1] === null) packet[1] = undefined;
    next();
  });

  console.log(`Connected: ${socket.id} (${socket.data.displayName}${socket.data.userId ? ", auth" : ", guest"})`);

  // Asking for a game's list subscribes to its updates until
  // leave_public_lobbies or taking a seat.
  socket.on("get_public_lobbies", ({ gameType } = {}) => {
    const type = gameTypeOf(gameType);
    stopBrowsing(socket);
    socket.join(browsing(type));
    socket.emit("public_lobbies_update", publicLobbyList(type));
  });

  socket.on("leave_public_lobbies", () => stopBrowsing(socket));

  // Latency probe — client measures round-trip via the ack callback.
  socket.on("ping_check", (ack) => {
    if (typeof ack === "function") ack();
  });

  socket.on("get_stats", (ack) => {
    if (typeof ack !== "function") return;
    const open = [...lobbies.values()].filter((l) => !l.isPrivate);
    ack({
      online: io.engine.clientsCount,
      tables: open.length,
      // Open public lobbies per game.
      lobbies: Object.fromEntries(Object.keys(GAMES).map((type) => [type, open.filter((l) => l.gameType === type).length])),
    });
  });

  socket.on("create_lobby", ({ lobbyName, isPrivate, gameType } = {}) => {
    // One lobby per player: leaving any previous one keeps the list clean.
    const existing = findMembership(socket);
    if (existing) removeMember(existing.lobby, existing.member);

    const type = gameTypeOf(gameType);
    const seatCount = GAMES[type].seats;
    const lobbyId = makeLobbyId(!!isPrivate);
    const lobby = {
      id: lobbyId,
      gameType: type,
      name: String(lobbyName || `${socket.data.displayName}'s Lobby`).slice(0, 40),
      isPrivate: !!isPrivate,
      maxPlayers: seatCount,
      hostKey: socket.data.playerKey,
      createdAt: new Date(),
      members: new Map(),
      roster: new Map(),
      rounds: [],
      sessionPromise: null,
      recorded: false,
      game: null,
      seats: Array(seatCount).fill(null),
    };
    takeSeat(lobby, addMember(lobby, socket));
    lobbies.set(lobbyId, lobby);
    enterRoom(socket, lobbyId);
    console.log(`${type} lobby created: ${lobbyId} by ${socket.data.displayName}`);
    socket.emit("lobby_joined", { lobbyId, gameType: type, isHost: true, mySocketId: socket.id });
    sendTableTo(lobby, socket);
    broadcastLobbyList(type);
  });

  socket.on("join_lobby", ({ lobbyId } = {}) => {
    // A shared code is the 6 characters either way; public ids carry a
    // "PUB-" prefix the player doesn't have to type.
    const lobby = lobbies.get(lobbyId) || lobbies.get(`PUB-${lobbyId}`);
    if (lobby) lobbyId = lobby.id;
    if (!lobby) {
      socket.emit("error_message", "Lobby not found");
      return;
    }

    let member = lobby.members.get(socket.data.playerKey);
    if (member) {
      // Rejoin (page refresh / reconnect): re-bind the new socket id.
      if (member.disconnectTimer) {
        clearTimeout(member.disconnectTimer);
        member.disconnectTimer = null;
      }
      member.socketId = socket.id;
      member.connected = true;
      enterRoom(socket, lobbyId);
      if (lobby.game && member.seatIndex != null) {
        lobby.game.replaceSeat(member.seatIndex, {
          type: "HUMAN",
          name: member.displayName,
          socketId: socket.id,
          avatar: member.avatar,
        });
        rosterEnter(lobby, member);
      }
      socket.emit("lobby_joined", {
        lobbyId,
        gameType: lobby.gameType,
        isHost: lobby.hostKey === member.key,
        mySocketId: socket.id,
      });
      sendStateTo(lobby, socket);
      broadcastTable(lobby); // shows them connected again
      return;
    }

    if (lobby.members.size >= lobby.maxPlayers) {
      socket.emit("error_message", "Lobby is full");
      return;
    }

    member = addMember(lobby, socket);
    enterRoom(socket, lobbyId);
    console.log(`${socket.data.displayName} joined ${lobbyId}`);
    if (!lobby.game) takeSeat(lobby, member);

    // Game already running: take over the first free CPU seat.
    if (lobby.game) {
      const takenSeats = new Set(
        [...lobby.members.values()].map((m) => m.seatIndex).filter((i) => i != null),
      );
      const seatIdx = lobby.game.state.players.findIndex(
        (p, i) => p.type === "AI" && !takenSeats.has(i),
      );
      if (seatIdx !== -1) {
        member.seatIndex = seatIdx;
        lobby.game.replaceSeat(seatIdx, {
          type: "HUMAN",
          name: member.displayName,
          socketId: socket.id,
          avatar: member.avatar,
        });
        rosterEnter(lobby, member);
      }
    }

    socket.emit("lobby_joined", { lobbyId, gameType: lobby.gameType, isHost: false, mySocketId: socket.id });
    sendStateTo(lobby, socket);
    broadcastTable(lobby);
    broadcastLobbyList(lobby.gameType);
  });

  // Game page asks where things stand: the waiting table, or the live game.
  socket.on("check_game_status", ({ lobbyId } = {}) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) {
      socket.emit("error_message", "Lobby not found");
      return;
    }
    if (!lobby.members.has(socket.data.playerKey)) return;
    if (lobby.game) sendStateTo(lobby, socket);
    else sendTableTo(lobby, socket);
  });

  /** The lobby, if this socket is its host and it is still waiting. */
  const hostCommand = (lobbyId) => {
    const lobby = lobbies.get(lobbyId);
    const member = lobby?.members.get(socket.data.playerKey);
    if (!lobby || !member) return null;
    if (lobby.hostKey !== member.key) {
      socket.emit("move_rejected", { reason: "Only the host can do that" });
      return null;
    }
    if (lobby.game) {
      socket.emit("move_rejected", { reason: "The game has already started" });
      return null;
    }
    return lobby;
  };

  socket.on("start_game", ({ lobbyId } = {}) => {
    const lobby = hostCommand(lobbyId);
    if (!lobby) return;
    if (lobby.gameType === "thirteen" && lobby.seats.filter(Boolean).length < 2) {
      socket.emit("move_rejected", { reason: "Add a player or a CPU to start" });
      return;
    }
    startGame(lobby);
  });

  const isSeat = (lobby, seat) => Number.isInteger(seat) && seat >= 0 && seat < lobby.seats.length;

  socket.on("add_cpu", ({ lobbyId, seat, level = "MEDIUM" } = {}) => {
    const lobby = hostCommand(lobbyId);
    if (!lobby) return;
    if (!isSeat(lobby, seat) || lobby.seats[seat] !== null) {
      socket.emit("move_rejected", { reason: "That seat isn't empty" });
      return;
    }
    if (!CPU_LEVELS.includes(level)) {
      socket.emit("move_rejected", { reason: "Pick EASY, MEDIUM or HARD" });
      return;
    }
    lobby.seats[seat] = { kind: "cpu", name: nextCpuName(lobby.seats), level };
    broadcastTable(lobby);
  });

  socket.on("remove_cpu", ({ lobbyId, seat } = {}) => {
    const lobby = hostCommand(lobbyId);
    if (!lobby) return;
    if (!isSeat(lobby, seat) || lobby.seats[seat]?.kind !== "cpu") {
      socket.emit("move_rejected", { reason: "There's no CPU in that seat" });
      return;
    }
    lobby.seats[seat] = null;
    broadcastTable(lobby);
  });

  socket.on("set_cpu_level", ({ lobbyId, seat, level } = {}) => {
    const lobby = hostCommand(lobbyId);
    if (!lobby) return;
    if (!isSeat(lobby, seat) || lobby.seats[seat]?.kind !== "cpu") {
      socket.emit("move_rejected", { reason: "There's no CPU in that seat" });
      return;
    }
    if (!CPU_LEVELS.includes(level)) {
      socket.emit("move_rejected", { reason: "Pick EASY, MEDIUM or HARD" });
      return;
    }
    lobby.seats[seat] = { ...lobby.seats[seat], level };
    broadcastTable(lobby);
  });

  socket.on("request_move", ({ lobbyId, action, data } = {}) => {
    const lobby = lobbies.get(lobbyId);
    const member = lobby?.members.get(socket.data.playerKey);
    if (!lobby?.game || lobby.gameType !== "thirteen" || !member || member.seatIndex == null) return;

    const result = lobby.game.handleMove(member.seatIndex, action, data?.cards);
    if (!result.ok) {
      socket.emit("move_rejected", { reason: result.error });
    }
  });

  // A Muushig move: { type, ...payload }. The seat is the socket's, never the payload's.
  socket.on("muushig_move", ({ lobbyId, move } = {}) => {
    const lobby = lobbies.get(lobbyId);
    const member = lobby?.members.get(socket.data.playerKey);
    if (!lobby?.game || lobby.gameType !== "muushig" || !member || member.seatIndex == null) return;
    const result = lobby.game.move(member.seatIndex, move);
    if (!result.ok) socket.emit("move_rejected", { reason: result.error });
  });

  socket.on("request_rematch", ({ lobbyId } = {}) => {
    const lobby = lobbies.get(lobbyId);
    const member = lobby?.members.get(socket.data.playerKey);
    if (!lobby?.game || !member) return;
    if (lobby.hostKey !== member.key) {
      socket.emit("move_rejected", { reason: "Only the host can start a rematch" });
      return;
    }
    const result = lobby.game.rematch();
    if (!result.ok) {
      socket.emit("move_rejected", { reason: result.error });
      return;
    }
    beginSession(lobby);
  });

  socket.on("send_chat", ({ lobbyId, message } = {}) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || !lobby.members.has(socket.data.playerKey)) return;
    const text = String(message || "").slice(0, 300);
    if (!text.trim()) return;
    io.to(lobbyId).emit("receive_chat", {
      id: `msg-${randomUUID()}`,
      type: "CHAT",
      sender: socket.data.displayName,
      text,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  });

  socket.on("leave_lobby", ({ lobbyId } = {}) => {
    const lobby = lobbies.get(lobbyId);
    const member = lobby?.members.get(socket.data.playerKey);
    if (!lobby || !member || member.socketId !== socket.id) return;
    socket.leave(lobbyId);
    removeMember(lobby, member);
  });

  // The game page closed without EXIT (browser Back, route change). The socket
  // stays up in a single-page app, so treat it like a disconnect. Coming back
  // re-sends join_lobby, which reclaims the seat.
  socket.on("leave_page", ({ lobbyId } = {}) => {
    const lobby = lobbies.get(lobbyId);
    const member = lobby?.members.get(socket.data.playerKey);
    if (!lobby || !member || member.socketId !== socket.id || !member.connected) return;
    holdSeat(lobby, member);
  });

  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id}`);
    const found = findMembership(socket);
    if (!found) return;
    const { lobby, member } = found;

    const entry = lobby.roster.get(member.key);
    if (entry) entry.disconnectCount += 1;

    // Grace period, waiting or playing: a refresh/rejoin within it keeps the seat.
    holdSeat(lobby, member);
  });
});

// Schema first: a server that accepted players before its tables existed would
// fail every match write.
await migrate();
await closeOrphanedSessions();
server.listen(PORT, () => {
  console.log(`CARD GAME SERVER RUNNING ON PORT ${PORT}`);
});
