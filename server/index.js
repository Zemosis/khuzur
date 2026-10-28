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
import { PokerTable, DEFAULT_POKER_DELAYS } from "./game/poker/table.js";
import { viewFor } from "./game/poker/engine.js";
import { tallyHand } from "./game/pokerTally.js";
import { pokerHandReward, POKER_REWARD_SPACING_MS } from "./game/progression.js";
import { BOT_NAMES } from "./game/constants.js";
import { createSession, finishSession, closeOrphanedSessions, grantProgress } from "./persistence.js";
import { authRouter, socketIdentity } from "./auth.js";
import { oauthRouter } from "./oauth.js";
import { createChatGuard, cleanChat } from "./chatGuard.js";
import { matchesRouter } from "./matches.js";
import { shopRouter } from "./shop.js";
import { migrate, pool } from "./db/index.js";
import { CreditTable, returnSeatsAfterRestart } from "./credits/tables.js";
import { CreditMatch } from "./credits/matchTables.js";
import { CreditBlackjack } from "./credits/blackjackTables.js";
import { BlackjackTable } from "./game/blackjack/table.js";
import { FREE_CHIPS } from "./game/blackjack/rules.js";
import { tallyRound } from "./game/blackjackTally.js";
import { BLACKJACK_DELAYS, blackjackView, registerBlackjackHandlers } from "./blackjackRoom.js";
import { creditsRouter } from "./credits/routes.js";
import { adminRouter } from "./credits/admin.js";
import { economyCheck } from "./credits/check.js";
import { isTier } from "./game/poker/tiers.js";
import { isStakeTier, MIN_STAKED, FORFEIT_ROUNDS } from "./game/stakes.js";

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
// Poker: the test suite sets every pause to POKER_DELAY_MS, and the turn
// clock and the sit-out kick on their own.
const POKER_DELAYS = {
  ...(process.env.POKER_DELAY_MS
    ? Object.fromEntries(["thinkMin", "thinkMax", "deal", "runout", "handGap", "firstHand"].map((k) => [k, envMs("POKER_DELAY_MS", 0)]))
    : {}),
  turn: envMs("POKER_TURN_MS", DEFAULT_POKER_DELAYS.turn),
  sitOutKick: envMs("POKER_KICK_MS", DEFAULT_POKER_DELAYS.sitOutKick),
};

/** A poker table as one seat sees it: its turn clock and the countdown to the next hand, whether START was pressed, and a credit table's tier and save / close state. */
const pokerView = (state, seat, table) => ({
  ...viewFor(state, seat),
  turnMsLeft: table?.turnMsLeft() ?? null,
  nextHandMsLeft: table?.nextHandMsLeft() ?? null,
  started: !!table?.started,
  tier: table?.info?.tier ?? null,
  saving: !!table?.saving,
  closingAfterHand: !!table?.closing,
});

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
  // A poker table is made with its lobby (createPokerTable) and seats people
  // itself: there is no waiting table, and no match end or rematch.
  poker: {
    seats: 6,
    stateEvent: "poker_state",
    view: pokerView,
  },
  // Blackjack too: its table (createBlackjackTable) deals on its own, with no START.
  blackjack: {
    seats: 5,
    stateEvent: "blackjack_state",
    view: blackjackView,
  },
};
// Tables that seat people themselves (lobby.game from creation): no waiting
// table, no CPU taking over a seat, no match end or rematch.
const SELF_SEATING = new Set(["poker", "blackjack"]);
const gameTypeOf = (type) => (Object.hasOwn(GAMES, type) ? type : "thirteen");
// Games whose credit tables are a stake per match, the winner taking the pot.
const STAKE_GAMES = new Set(["muushig", "thirteen"]);
/** A credit table played for a stake per match (CreditMatch), not for chips. */
const isCreditMatch = (lobby) => lobby.credits instanceof CreditMatch;

const app = express();
app.use(cors({ origin: CORS_ORIGINS }));
app.get("/", (_req, res) => res.json({ ok: true, service: "card-game-server" }));
// Before the accounts router, which answers JSON errors for its whole path.
app.use("/api/auth/oauth", oauthRouter);
app.use("/api/auth", authRouter);
app.use("/api/credits", creditsRouter({ onTableFor, rejoinFor }));
app.use("/api/admin", adminRouter({ standUp: standUpCreditPlayer }));
app.use("/api/matches", matchesRouter());
app.use("/api/shop", shopRouter());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"] },
});

/**
 * lobbies: Map<lobbyId, {
 *   id, gameType ("thirteen" | "muushig" | "poker" | "blackjack"), name, isPrivate, maxPlayers,
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
 *   game: ThirteenGame | MuushigGame | PokerTable | BlackjackTable | null
 *   tier: "LOW" | "MID" | "HIGH" | "HOUSE" | null,   // a credit table's stakes (HOUSE: blackjack)
 *   credits: CreditTable | CreditMatch | CreditBlackjack | null,
 *     // poker: a CreditTable wrapping `game` (its .table); blackjack: a
 *     // CreditBlackjack wrapping it the same way; muushig: a
 *     // CreditMatch holding the stakes beside it (see isCreditMatch)
 * }>
 *
 * `members` is the LIVE connection map and loses a player the moment they quit.
 * `roster` is the recording ledger: every seat ever occupied for the current
 * match, kept until the session is written. Recording from `members` is what
 * previously made quitters vanish from match history entirely.
 */
const lobbies = new Map();

// Each signed-in player's level (userId → level), shown beside their name at
// the table. Read from the profile when they connect, and kept up to date as
// matches and poker hands pay them (noteLevel).
const xpLevels = new Map();
const noteLevel = (reward) => reward?.levelAfter && xpLevels.set(reward.userId, reward.levelAfter);
const levelOf = (member) => (member?.userId && xpLevels.get(member.userId)) || null;

/** Each seated player's level for the game state: { seat: level }, people only. */
function levelsOf(lobby) {
  const levels = {};
  for (const m of lobby.members.values()) if (m.seatIndex != null && levelOf(m)) levels[m.seatIndex] = levelOf(m);
  return levels;
}

// ---------- AUTH MIDDLEWARE ----------
// Signed-in players pass their JWT from /api/auth; guests pass name + tag.
// Identity (playerKey) is what survives refreshes and reconnects.
io.use(async (socket, next) => {
  const { userId, name, tag, avatar, level } = await socketIdentity(socket.handshake.auth);
  if (userId && level) xpLevels.set(userId, level);
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

// Chat floods are turned away (see chatGuard.js); quiet players are forgotten.
const chatGuard = createChatGuard();
setInterval(() => chatGuard.prune(60_000), 60_000).unref();

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
    // A credit match: its stake and pot, and how many members haven't staked for the next match.
    credit: isCreditMatch(lobby) ? { ...lobby.credits.view(), deciding: [...lobby.members.values()].filter((m) => m.seatIndex == null).length } : null,
    seats: lobby.seats.map((s) => {
      if (!s) return null;
      if (s.kind === "cpu") return { kind: "cpu", name: s.name, level: s.level };
      const m = lobby.members.get(s.key);
      return {
        kind: "human",
        name: m?.displayName || "?",
        avatar: m?.avatar || null,
        xpLevel: levelOf(m),
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
    .filter((l) => !l.isPrivate && l.gameType === gameType && !l.game?.closing)
    .map((l) => {
      const host = l.members.get(l.hostKey);
      return {
        id: l.id,
        gameType: l.gameType,
        name: l.name,
        host: host?.displayName || "?",
        // Poker and blackjack seat players at the table itself; a seat whose player has left is free.
        current:
          SELF_SEATING.has(l.gameType)
            ? l.game.state.seats.filter((p) => p && !p.leaving).length
            : isCreditMatch(l)
              ? l.seats.filter((s) => s?.kind === "human").length
              : l.members.size,
        max: l.maxPlayers,
        inProgress: l.gameType === "poker" ? l.game.started : l.gameType === "blackjack" ? l.game.state.phase !== "WAITING" : !!l.game,
        tier: l.tier ?? null,
        stake: isCreditMatch(l) ? l.credits.stake : null,
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
      ...view(game.state, member.seatIndex ?? -1, game),
      amHost: lobby.hostKey === member.key,
      dealMsLeft: game.dealMsLeft(),
      ...creditViewOf(lobby),
      ...rewardViewOf(lobby, member),
      levels: levelsOf(lobby),
    });
  }
}

function sendStateTo(lobby, socket) {
  if (!lobby.game) return;
  const { view, stateEvent } = GAMES[lobby.gameType];
  const member = lobby.members.get(socket.data.playerKey);
  socket.emit(stateEvent, {
    ...view(lobby.game.state, member?.seatIndex ?? -1, lobby.game),
    amHost: !!member && lobby.hostKey === member.key,
    dealMsLeft: lobby.game.dealMsLeft(),
    ...creditViewOf(lobby),
    ...rewardViewOf(lobby, member),
    levels: levelsOf(lobby),
  });
}

/**
 * A line in the table's log for everyone there: who left, who a CPU now plays
 * for, who came back, whose seat was forfeited. tone: "away" | "back" | "gone".
 * (A credit match's pot is logged by each browser as it shows the result, so
 * the log never tells the ending before the table does.)
 */
function tableLog(lobby, text, tone) {
  io.to(lobby.id).emit("receive_chat", {
    id: `log-${randomUUID()}`,
    type: "SYSTEM",
    kind: "table",
    tone,
    text,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });
}

/** A credit match's stake, pot, covered seats and result, for the game state. */
const creditViewOf = (lobby) => (isCreditMatch(lobby) ? { credit: lobby.credits.view() } : {});

/**
 * What the match paid this member, once it's saved (see closeSession):
 * { reward } with their XP and gold, or { reward: null } if it paid them
 * nothing. Before then, nothing, which the browser reads as "adding up".
 */
const rewardViewOf = (lobby, member) =>
  lobby.rewards ? { reward: (member?.userId && lobby.rewards.get(member.userId)) || null } : {};

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
  if (!lobby.sessionPromise || lobby.recorded) return Promise.resolve([]);
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

  // → what each signed-in player earned; never rejects.
  return lobby.sessionPromise
    .then((sessionId) => (sessionId ? finishSession({ sessionId, ...snapshot }) : []))
    .catch((err) => {
      console.error("[db] finishSession failed:", err);
      return [];
    });
}

/**
 * The match is over: save it, then show each player what it paid them. The
 * rewards stay on the lobby until the next match's session opens, so a
 * player who reconnects still sees them.
 */
function recordMatch(lobby, game) {
  const session = lobby.sessionPromise;
  lobby.rewardsSaved = closeSession(lobby, { completed: true, endedReason: "completed" }).then((rewards) => {
    rewards.forEach(noteLevel);
    if (lobby.sessionPromise !== session) return; // a rematch already began
    lobby.rewards = new Map(rewards.map((r) => [r.userId, r]));
    if (lobby.game === game) broadcastState(lobby, game);
  });
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
  lobby.rewards = null;
  for (const member of lobby.members.values()) rosterEnter(lobby, member);

  const host = lobby.members.get(lobby.hostKey);
  lobby.sessionPromise = createSession({
    gameType: lobby.gameType,
    lobbyId: lobby.id,
    lobbyName: lobby.name,
    isPrivate: lobby.isPrivate,
    hostUserId: host?.userId || null,
    hostDisplayName: host?.displayName || "?",
    // The seats actually dealt in: a Thirteen table can start with 2 or 3, and
    // profiles read "2nd of N" and "dead last" from this.
    maxPlayers: lobby.game?.state?.players?.length ?? lobby.maxPlayers,
    playerCount: lobby.roster.size,
    startedAt: lobby.game?.startedAt,
    creditTier: lobby.tier ?? null,
    seats: seatsOf(lobby.game?.state),
  }).catch((err) => {
    console.error("[db] createSession failed:", err);
    return null;
  });
}

/** Who sat where as a Thirteen or Muushig match starts, for its match page. Poker tables change seats as they go: null. */
function seatsOf(state) {
  if (!Array.isArray(state?.players)) return null;
  return state.players.map((p, seat) => ({
    seat,
    name: p.name,
    kind: p.type === "AI" ? "cpu" : "human",
    level: p.type === "AI" ? p.level || "MEDIUM" : null,
  }));
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
  // Muushig always seats 5: empty seats become MEDIUM CPUs (HARD at a credit table).
  const fill = isCreditMatch(lobby) ? "HARD" : "MEDIUM";
  lobby.seats = lobby.seats.map((s) => s ?? { kind: "cpu", name: null, level: fill });
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
    onRoundEnd: (round) => {
      lobby.rounds.push(round);
      if (!isCreditMatch(lobby)) return;
      for (const userId of lobby.credits.roundEnded()) {
        const name = lobby.roster.get(userId)?.name ?? "A player";
        tableLog(lobby, `${name} was away ${FORFEIT_ROUNDS} rounds: the seat is the bot's now, and the stake stays in the pot.`, "gone");
      }
    },
    onGameOver: (game) => {
      recordMatch(lobby, game);
      if (isCreditMatch(lobby)) settleCreditMatch(lobby);
    },
    // A credit table's CPUs, and any that covers a player who left, play HARD.
    // (Thirteen's `level` is only for those covering.)
    ...(isCreditMatch(lobby) ? { level: "HARD" } : {}),
  });

  beginSession(lobby);
  console.log(`${lobby.gameType} started in lobby ${lobby.id} (${lobby.members.size} humans)`);
  broadcastLobbyList(lobby.gameType);
}

/** The poker table for a new lobby. Its seats are its own; see sitAtPoker. */
function createPokerTable(lobby) {
  return new PokerTable({
    delays: POKER_DELAYS,
    onState: (table) => broadcastState(lobby, table),
    onHandEnd: (hand) => recordHand(lobby, hand),
    onKick: (seat) => kickFromTable(lobby, seat),
  });
}

/** A credit table: its PokerTable (lobby.game) runs inside a CreditTable (lobby.credits). */
function createCreditTable(lobby) {
  lobby.credits = new CreditTable({
    name: lobby.name,
    tier: lobby.tier,
    isPrivate: lobby.isPrivate,
    sessionId: () => lobby.sessionPromise ?? Promise.resolve(null),
    delays: POKER_DELAYS,
    onState: (table) => broadcastState(lobby, table),
    onHandEnd: (hand) => recordHand(lobby, hand),
    onKick: (seat) => kickFromTable(lobby, seat),
    onClosed: () => endCreditTable(lobby),
  });
  return lobby.credits.table;
}

/** A free blackjack table for a new lobby. Its seats are its own; see sitAtBlackjack. */
function createBlackjackTable(lobby) {
  return new BlackjackTable({
    delays: BLACKJACK_DELAYS,
    onState: (table) => broadcastState(lobby, table),
    onRoundEnd: (summary) => recordRound(lobby, summary),
    onKick: (seat) => kickFromTable(lobby, seat),
  });
}

/** A credit blackjack table: its BlackjackTable (lobby.game) runs inside a CreditBlackjack (lobby.credits). */
function createCreditBlackjack(lobby) {
  lobby.credits = new CreditBlackjack({
    name: lobby.name,
    isPrivate: lobby.isPrivate,
    sessionId: () => lobby.sessionPromise ?? Promise.resolve(null),
    // A bet refused as betting closed: that player sits the round out, and is told why.
    onRefused: (key, error) => {
      const m = lobby.members.get(key);
      if (m?.connected && m.socketId) io.to(m.socketId).emit("move_rejected", { reason: error });
    },
    delays: BLACKJACK_DELAYS,
    onState: (table) => broadcastState(lobby, table),
    onRoundEnd: (summary) => recordRound(lobby, summary),
    onKick: (seat) => kickFromTable(lobby, seat),
    onClosed: () => endCreditTable(lobby),
  });
  return lobby.credits.table;
}

/** Sat out too long (poker or blackjack): off the table, out of its chat, back to the lobby. */
function kickFromTable(lobby, seat) {
  const member = [...lobby.members.values()].find((m) => m.seatIndex === seat);
  if (!member) {
    const key = lobby.game.state.seats[seat]?.key;
    return lobby.credits ? lobby.credits.leave(key) : lobby.game.standUp(seat);
  }
  if (member.connected && member.socketId) io.to(member.socketId).emit("table_left", { reason: "away" });
  io.sockets.sockets.get(member.socketId)?.leave(lobby.id);
  removeMember(lobby, member);
}

/** A credit table has closed (the host, or the last player out): everyone's credits home, everyone to the lobby. */
async function endCreditTable(lobby) {
  for (const m of lobby.members.values()) {
    if (m.connected && m.socketId) io.to(m.socketId).emit("table_left", { reason: "closed" });
    io.sockets.sockets.get(m.socketId)?.leave(lobby.id);
  }
  await lobby.credits.release();
  destroyLobby(lobby);
  broadcastLobbyList(lobby.gameType);
}

/** Why this socket can't host or join a credit table at `tier`, or null. A linked login and frozen accounts are checked with the buy-in. */
function creditRefusal(socket, tier, gameType = "poker") {
  if (!pool) return "Credit tables aren't available right now";
  if (shuttingDown) return "The server is restarting. Try again in a minute.";
  // HOUSE marks a blackjack credit table, and only that.
  if (gameType === "blackjack") {
    if (tier !== "HOUSE") return "Blackjack credit tables play against the house";
  } else if (!(STAKE_GAMES.has(gameType) ? isStakeTier(tier) : isTier(tier))) return "Pick LOW, MID or HIGH";
  if (!socket.data.userId) return "Sign in to play for credits";
  return null;
}

/** Buys a member in at a credit table and seats them. False (with the reason sent to them) when it fails. */
async function sitWithCredits(lobby, member, socket, buyIn) {
  const result = await lobby.credits.sit({ userId: member.userId, name: member.displayName, avatar: member.avatar }, buyIn, (seat) => {
    member.seatIndex = seat; // before the table announces them: their view needs the seat
  });
  if (result.ok) return true;
  socket.emit("error_message", result.error);
  socket.leave(lobby.id);
  if (lobby.members.get(member.key) === member) removeMember(lobby, member);
  return false;
}

/**
 * Stakes a member at a credit match's waiting table and seats them. On a
 * refusal the reason goes to them and, unless `stay`, they leave the table.
 */
async function stakeAndSeat(lobby, member, socket, amount, { stay = false } = {}) {
  const fail = (error) => {
    socket.emit(stay ? "move_rejected" : "error_message", stay ? { reason: error } : error);
    if (stay) return false;
    socket.leave(lobby.id);
    if (lobby.members.get(member.key) === member) removeMember(lobby, member);
    return false;
  };
  const result = await lobby.credits.sit(member.userId, amount);
  if (!result.ok) return fail(result.error);
  // The table may have started or filled while the stake was placed: it comes back.
  if (lobby.game || lobby.members.get(member.key) !== member || !takeSeat(lobby, member)) {
    lobby.credits.standUp(member.userId);
    return fail(lobby.game ? "The match has started" : "The table is full");
  }
  return true;
}

/**
 * join_lobby at a credit match, for someone not at the table: stake and sit
 * while it waits; mid-match only a staked player coming back to their seat.
 */
async function joinCreditMatch(socket, lobby, buyIn) {
  const userId = socket.data.userId;
  if (lobby.game) {
    if (!userId || !lobby.credits.canReturn(userId)) return socket.emit("error_message", "This table's match is under way. Try again when it ends");
    const member = addMember(lobby, socket);
    member.seatIndex = lobby.credits.seatOf(userId);
    lobby.credits.back(userId);
    enterRoom(socket, lobby.id);
    lobby.game.replaceSeat(member.seatIndex, { type: "HUMAN", name: member.displayName, socketId: socket.id, avatar: member.avatar });
    rosterEnter(lobby, member);
    tableLog(lobby, `${member.name} is back in their seat.`, "back");
    socket.emit("lobby_joined", { lobbyId: lobby.id, gameType: lobby.gameType, isHost: false, mySocketId: socket.id });
    broadcastState(lobby);
    return;
  }
  if (lobby.seats.every(Boolean)) return socket.emit("error_message", "Lobby is full");
  const why = creditRefusal(socket, lobby.tier, lobby.gameType);
  if (why) return socket.emit("error_message", why);
  // The stake panel needs to know the table first.
  if (buyIn == null) return socket.emit("credit_table_info", { lobbyId: lobby.id, name: lobby.name, tier: lobby.tier, gameType: lobby.gameType, stake: lobby.credits.stake });
  const member = addMember(lobby, socket);
  if (!(await stakeAndSeat(lobby, member, socket, buyIn))) return;
  enterRoom(socket, lobby.id);
  console.log(`${socket.data.displayName} staked at ${lobby.id}`);
  socket.emit("lobby_joined", { lobbyId: lobby.id, gameType: lobby.gameType, isHost: false, mySocketId: socket.id });
  broadcastTable(lobby);
  broadcastLobbyList(lobby.gameType);
}

/**
 * A credit match is over: the pot to the winner, everyone sees the result,
 * and the table waits for the next match with nobody seated (PLAY AGAIN
 * stakes and seats you). With nobody left at it, the table closes.
 */
async function settleCreditMatch(lobby) {
  const game = lobby.game;
  broadcastState(lobby, game); // "Saving…"
  const sessionId = await (lobby.sessionPromise ?? null);
  await lobby.credits.settle(game.state, { sessionId, rounds: lobby.rounds });
  await lobby.rewardsSaved; // the last state this table sends has the rewards too
  broadcastState(lobby, game);
  game.destroy();
  if (lobby.game !== game) return;
  lobby.game = null;
  lobby.seats = Array(lobby.maxPlayers).fill(null);
  for (const m of lobby.members.values()) m.seatIndex = null;
  if (lobby.members.size === 0) {
    lobby.credits.release("stake_back");
    destroyLobby(lobby);
  } else broadcastTable(lobby);
  broadcastLobbyList(lobby.gameType);
}

/** A credit match this player can go back to (a CPU covers their seat): { gameType, code, tableName }, or null. */
function rejoinFor(userId) {
  for (const lobby of lobbies.values()) {
    if (!isCreditMatch(lobby) || !lobby.game || !lobby.credits.canReturn(userId)) continue;
    if (lobby.members.get(userId)?.connected) continue;
    return { gameType: lobby.gameType, code: shareCode(lobby.id), tableName: lobby.name };
  }
  return null;
}

/** What a player holds at a credit table right now (stack, chips waiting, chips in the pot), or null. */
function onTableFor(userId) {
  for (const lobby of lobbies.values()) {
    const held = lobby.credits?.onTable(userId);
    if (held != null) return held;
  }
  return null;
}

/** An admin froze or reversed this player: off any credit table. Resolves once their credits are home. */
async function standUpCreditPlayer(userId, reason) {
  for (const lobby of lobbies.values()) {
    // Mid-match their stake stays in the pot, and the seat is no longer theirs.
    if (isCreditMatch(lobby)) lobby.credits.forfeit(userId);
    const member = lobby.credits && lobby.members.get(userId);
    if (!member) continue;
    if (member.connected && member.socketId) io.to(member.socketId).emit("table_left", { reason });
    io.sockets.sockets.get(member.socketId)?.leave(lobby.id);
    removeMember(lobby, member);
    await member.cashedOut;
  }
}

/** Seats a member at a poker table, in the first empty seat. False when it's full. */
function sitAtPoker(lobby, member) {
  const seat = lobby.game.firstFreeSeat();
  if (seat === -1) return false;
  // Set first: the table broadcasts as they sit, and their view needs the seat.
  member.seatIndex = seat;
  const result = lobby.game.sit({ name: member.displayName, type: "HUMAN", avatar: member.avatar, key: member.key }, seat);
  if (!result.ok) member.seatIndex = null;
  return result.ok;
}

/**
 * Seats a member at a blackjack table in the first empty seat: at a credit
 * table through the bridge (a seat row holding 0), at a free one with
 * FREE_CHIPS. False (with the reason sent to them, and off the table) when it fails.
 */
async function sitAtBlackjack(lobby, member, socket) {
  let result;
  if (lobby.credits) {
    result = await lobby.credits.sit({ userId: member.userId, name: member.displayName, avatar: member.avatar }, (seat) => {
      member.seatIndex = seat; // before the table announces them: their view needs the seat
    });
    // Already seated (another tab) never calls back: the seat is in the answer.
    if (result.ok) member.seatIndex = result.seat;
  } else {
    const seat = lobby.game.firstFreeSeat();
    member.seatIndex = seat === -1 ? null : seat; // first, as above
    result = seat === -1 ? { ok: false, error: "Lobby is full" } : lobby.game.sit({ key: member.key, name: member.displayName, avatar: member.avatar, bankroll: FREE_CHIPS }, seat);
  }
  if (result.ok) return true;
  member.seatIndex = null;
  socket.emit("error_message", result.error);
  socket.leave(lobby.id);
  if (lobby.members.get(member.key) === member) removeMember(lobby, member);
  return false;
}

/**
 * A blackjack round is over: keep it for the record, add it to each player's
 * tally at this table (see blackjackTally.js), and pay the signed-in players
 * who had a bet in it, alone at the table or not.
 */
function recordRound(lobby, summary) {
  if (!lobby.sessionPromise) return;
  lobby.rounds.push({
    roundNumber: summary.roundNumber,
    winnerSeat: null,
    // Player keys stay in the roster.
    seatResults: summary.seatResults.map(({ player_key: _key, ...result }) => result),
  });
  for (const r of summary.seatResults) {
    const entry = r.player_key && lobby.roster.get(r.player_key);
    if (!entry) continue;
    entry.blackjack = tallyRound(entry.blackjack, summary, r);
    payTableRound(lobby, entry, r.net > 0);
  }
}

/**
 * A poker hand is over: keep it for the record, add it to each player's
 * tally at this table (see pokerTally.js), and pay the signed-in players.
 * A hand pays only if at least two people were dealt in: against CPUs alone
 * it's the same as practice, which pays nothing.
 */
function recordHand(lobby, hand) {
  if (!lobby.sessionPromise) return;
  lobby.rounds.push({
    ...hand,
    // Player keys stay in the roster, and hole cards with their own player.
    seatResults: hand.seatResults.map(({ player_key: _key, hole: _hole, ...result }) => result),
  });
  const withPeople = hand.seatResults.filter((r) => r.player_key && !r.cpu).length >= 2;
  for (const r of hand.seatResults) {
    const entry = r.player_key && lobby.roster.get(r.player_key);
    if (!entry) continue;
    entry.poker = tallyHand(entry.poker, hand, r);
    if (withPeople) payTableRound(lobby, entry, r.won > 0);
  }
}

/**
 * A poker hand's or blackjack round's XP and gold, paid at once and sent to
 * the player as `progress_reward`. It pays only if it ends
 * POKER_REWARD_SPACING_MS after their last paid one here, so folding hand
 * after hand (or betting the minimum round after round) earns little.
 */
function payTableRound(lobby, entry, won, now = Date.now()) {
  if (!entry.userId || now - (entry.lastPaidAt ?? -Infinity) < POKER_REWARD_SPACING_MS) return;
  entry.lastPaidAt = now;
  const pay = pokerHandReward({ won });
  entry.earned = { xp: (entry.earned?.xp ?? 0) + pay.xp, gold: (entry.earned?.gold ?? 0) + pay.gold };
  grantProgress(entry.userId, pay)
    .then((reward) => {
      noteLevel(reward);
      const member = lobby.members.get(entry.playerKey);
      if (reward && member?.connected && member.socketId) io.to(member.socketId).emit("progress_reward", reward);
    })
    .catch((err) => console.error("[db] grantProgress failed:", err));
}

function removeMember(lobby, member, { convertSeat = true } = {}) {
  if (member.disconnectTimer) clearTimeout(member.disconnectTimer);
  lobby.members.delete(member.key);

  // Waiting table: the seat simply empties (CPUs only fill in at START).
  if (!lobby.game && member.seatIndex != null && lobby.seats[member.seatIndex]?.key === member.key) {
    lobby.seats[member.seatIndex] = null;
  }

  // Poker: the seat empties (the hand in play folds). A credit seat's credits
  // go home now, or when the hand they're in is saved. leave() is queued behind
  // any buy-in still in flight, so it's always called and pays out whatever got seated.
  // A credit match: waiting, the stake comes back; mid-match it stays in the
  // pot while a CPU covers the seat, until they come back or forfeit it.
  if (isCreditMatch(lobby)) {
    if (lobby.game && member.seatIndex != null) lobby.credits.away(member.userId);
    else member.cashedOut = lobby.credits.standUp(member.userId);
  } else if (lobby.credits) member.cashedOut = lobby.credits.leave(member.userId);
  else if (SELF_SEATING.has(lobby.gameType) && member.seatIndex != null) lobby.game.standUp(member.seatIndex);

  // Mid-game: a CPU inherits the seat and hand so the match can continue.
  const cpuTookOver = !!(convertSeat && lobby.game && !SELF_SEATING.has(lobby.gameType) && member.seatIndex != null);
  if (cpuTookOver) {
    lobby.game.replaceSeat(member.seatIndex, {
      type: "AI",
      name: `${member.name} (CPU)`,
      socketId: null,
    });
    tableLog(
      lobby,
      isCreditMatch(lobby)
        ? `${member.name} left. A Hard bot plays their seat: they have ${FORFEIT_ROUNDS} rounds to come back.`
        : `${member.name} left. A CPU plays their seat.`,
      "away",
    );
  } else if (SELF_SEATING.has(lobby.gameType) && member.seatIndex != null) {
    tableLog(lobby, `${member.name} left the table.`, "away");
  }

  // The ledger keeps the seat so the result is still attributed to them.
  if (lobby.game) rosterLeave(lobby, member, { cpuTookOver });

  if (lobby.members.size === 0) {
    if (isCreditMatch(lobby)) {
      // Mid-match the CPUs play it out and settleCreditMatch closes the table; waiting, every stake goes home.
      if (!lobby.game) {
        lobby.credits.release("stake_back");
        destroyLobby(lobby);
      }
    }
    // A credit table finishes the hand (or round) in play and saves it first; endCreditTable then destroys it.
    else if (lobby.credits) closeAfterPlay(lobby);
    else destroyLobby(lobby);
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

/** A credit poker or blackjack table: no more hands or rounds; the one in play finishes and is saved, then endCreditTable. */
function closeAfterPlay(lobby) {
  if (lobby.gameType === "blackjack") lobby.game.closeAfterRound();
  else lobby.game.closeAfterHand();
}

function destroyLobby(lobby) {
  // Everyone left before the match ended — record it rather than losing it.
  // A poker or blackjack table has no end of its own: everyone leaving is how it finishes.
  closeSession(lobby, SELF_SEATING.has(lobby.gameType) ? { completed: true, endedReason: "completed" } : { completed: false, endedReason: "all_left" });
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

  socket.on("create_lobby", async ({ lobbyName, isPrivate, gameType, tier, buyIn } = {}) => {
    const type = gameTypeOf(gameType);
    // A blackjack table is a credit table only at HOUSE, its one tier.
    const credit = type === "blackjack" ? tier === "HOUSE" : tier != null && (type === "poker" || STAKE_GAMES.has(type));
    if (credit) {
      const why = creditRefusal(socket, tier, type);
      if (why) return socket.emit("error_message", why);
    }
    // One lobby per player: leaving any previous one keeps the list clean. A
    // credit seat is paid out before buying in anywhere else.
    const existing = findMembership(socket);
    if (existing) {
      removeMember(existing.lobby, existing.member);
      await existing.member.cashedOut;
    }

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
      tier: credit ? tier : null,
      credits: null,
    };
    if (type === "poker") lobby.game = credit ? createCreditTable(lobby) : createPokerTable(lobby);
    else if (type === "blackjack") lobby.game = credit ? createCreditBlackjack(lobby) : createBlackjackTable(lobby);
    // Muushig always seats 5, so CPUs fill a credit match; Thirteen's is for people only.
    else if (credit) lobby.credits = new CreditMatch({ name: lobby.name, tier, isPrivate: lobby.isPrivate, gameType: type, botsFill: type === "muushig" });
    const member = addMember(lobby, socket);
    lobbies.set(lobbyId, lobby);
    // A credit table's room is entered once the buy-in succeeds: a refused one
    // leaves the player watching the table list, where they were.
    if (isCreditMatch(lobby)) {
      if (!(await stakeAndSeat(lobby, member, socket, buyIn))) return;
      enterRoom(socket, lobbyId);
    } else if (type === "blackjack") {
      if (!(await sitAtBlackjack(lobby, member, socket))) return;
      enterRoom(socket, lobbyId);
      beginSession(lobby); // there's no START: the table deals as soon as someone bets
    } else if (credit) {
      if (!(await sitWithCredits(lobby, member, socket, buyIn))) return;
      enterRoom(socket, lobbyId);
    } else {
      enterRoom(socket, lobbyId);
      if (type === "poker") sitAtPoker(lobby, member);
      else takeSeat(lobby, member);
    }
    console.log(`${type} lobby created: ${lobbyId} by ${socket.data.displayName}`);
    socket.emit("lobby_joined", { lobbyId, gameType: type, isHost: true, mySocketId: socket.id });
    sendTableTo(lobby, socket);
    broadcastLobbyList(type);
  });

  socket.on("join_lobby", async ({ lobbyId, buyIn } = {}) => {
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
      if (lobby.game && !SELF_SEATING.has(lobby.gameType) && member.seatIndex != null) {
        if (isCreditMatch(lobby)) lobby.credits.back(member.userId);
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

    if (isCreditMatch(lobby)) return joinCreditMatch(socket, lobby, buyIn);
    const full = SELF_SEATING.has(lobby.gameType) ? lobby.game.firstFreeSeat() === -1 : lobby.members.size >= lobby.maxPlayers;
    if (full) {
      socket.emit("error_message", "Lobby is full");
      return;
    }
    if (lobby.credits) {
      const why = lobby.game.closing ? "This table is closing" : creditRefusal(socket, lobby.tier, lobby.gameType);
      if (why) return socket.emit("error_message", why);
      // The buy-in comes from a panel that needs to know the table first (blackjack has none: each bet comes from the balance).
      if (buyIn == null && lobby.gameType !== "blackjack") return socket.emit("credit_table_info", { lobbyId: lobby.id, name: lobby.name, tier: lobby.tier });
    }

    member = addMember(lobby, socket);
    if (!lobby.credits) enterRoom(socket, lobbyId); // a credit table's, once the buy-in succeeds
    console.log(`${socket.data.displayName} joined ${lobbyId}`);
    if (lobby.gameType === "blackjack") {
      if (!(await sitAtBlackjack(lobby, member, socket))) return;
      enterRoom(socket, lobbyId);
      rosterEnter(lobby, member);
    } else if (lobby.credits) {
      if (!(await sitWithCredits(lobby, member, socket, buyIn))) return;
      enterRoom(socket, lobbyId);
      if (lobby.sessionPromise) rosterEnter(lobby, member);
    } else if (lobby.gameType === "poker") {
      // Dealt in from the next hand; counted in the record from now.
      sitAtPoker(lobby, member);
      if (lobby.sessionPromise) rosterEnter(lobby, member);
    } else if (!lobby.game) takeSeat(lobby, member);

    // Game already running: take over the first free CPU seat.
    if (lobby.game && !SELF_SEATING.has(lobby.gameType)) {
      const takenSeats = new Set(
        [...lobby.members.values()].map((m) => m.seatIndex).filter((i) => i != null),
      );
      const seatIdx = lobby.game.state.players.findIndex(
        (p, i) => p.type === "AI" && !takenSeats.has(i),
      );
      if (seatIdx !== -1) {
        member.seatIndex = seatIdx;
        const cpu = lobby.game.state.players[seatIdx].name;
        lobby.game.replaceSeat(seatIdx, {
          type: "HUMAN",
          name: member.displayName,
          socketId: socket.id,
          avatar: member.avatar,
        });
        rosterEnter(lobby, member);
        tableLog(lobby, cpu === `${member.name} (CPU)` ? `${member.name} is back in their seat.` : `${member.name} joined, taking over ${cpu}'s seat.`, "back");
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

  /** The lobby, if this socket is its host and it is still waiting (a poker or blackjack table: any time). */
  const hostCommand = (lobbyId) => {
    const lobby = lobbies.get(lobbyId);
    const member = lobby?.members.get(socket.data.playerKey);
    if (!lobby || !member) return null;
    if (lobby.hostKey !== member.key) {
      socket.emit("move_rejected", { reason: "Only the host can do that" });
      return null;
    }
    if (lobby.game && !SELF_SEATING.has(lobby.gameType)) {
      socket.emit("move_rejected", { reason: "The game has already started" });
      return null;
    }
    return lobby;
  };

  const reject = (reason) => socket.emit("move_rejected", { reason });

  socket.on("start_game", async ({ lobbyId } = {}) => {
    const lobby = hostCommand(lobbyId);
    if (!lobby) return;
    if (lobby.gameType === "blackjack") return reject("Blackjack deals on its own");
    if (isCreditMatch(lobby)) return startCreditMatch(lobby);
    if (lobby.gameType === "poker") {
      const result = lobby.game.start();
      if (!result.ok) return reject(result.error);
      beginSession(lobby);
      broadcastState(lobby); // shows the table started, even before 2 can play
      broadcastLobbyList(lobby.gameType);
      return;
    }
    if (lobby.gameType === "thirteen" && lobby.seats.filter(Boolean).length < 2) {
      socket.emit("move_rejected", { reason: "Add a player or a CPU to start" });
      return;
    }
    startGame(lobby);
  });

  /** START at a credit match: everyone staked is dealt in, members who didn't stake go back to the lobby. */
  async function startCreditMatch(lobby) {
    if (lobby.seats.filter((s) => s?.kind === "human").length < MIN_STAKED) return reject(`Needs ${MIN_STAKED} players with stakes in`);
    // The seats as staked, in the game's order: Thirteen deals only the filled ones.
    const taken = lobby.seats.map((s) => (s?.kind === "human" ? { ...s, member: lobby.members.get(s.key) } : s));
    const order = lobby.gameType === "thirteen" ? taken.filter(Boolean) : taken;
    const result = await lobby.credits.begin(order.map((s) => s?.member?.userId ?? null));
    if (!result.ok) return reject(result.error);
    if (lobby.game) return;
    for (const m of [...lobby.members.values()]) {
      if (m.seatIndex != null) continue;
      if (m.connected && m.socketId) io.to(m.socketId).emit("table_left", { reason: "started" });
      io.sockets.sockets.get(m.socketId)?.leave(lobby.id);
      removeMember(lobby, m);
    }
    // Anyone who stood up while the match began is in it, a CPU covering their stake from the first deal.
    const gone = order.map((s) => s?.member && lobby.members.get(s.key) !== s.member);
    lobby.seats = order.map((s, i) => (gone[i] ? { kind: "cpu", name: `${s.member.name} (CPU)`, level: "HARD" } : s && (s.kind === "human" ? { kind: "human", key: s.key } : s)));
    startGame(lobby);
    order.forEach((s, i) => gone[i] && lobby.credits.away(s.member.userId));
    broadcastState(lobby);
  }

  const isSeat = (lobby, seat) => Number.isInteger(seat) && seat >= 0 && seat < lobby.seats.length;

  socket.on("add_cpu", ({ lobbyId, seat, level = "MEDIUM" } = {}) => {
    const lobby = hostCommand(lobbyId);
    if (!lobby) return;
    if (lobby.gameType === "blackjack") return reject("Blackjack has no CPU players");
    if (isCreditMatch(lobby)) return reject(lobby.credits.botsFill ? "Credit tables seat Hard bots" : "Credit tables are for people only");
    if (lobby.gameType === "poker") {
      if (lobby.credits) return reject("Credit tables are for people only");
      if (!CPU_LEVELS.includes(level)) return reject("Pick EASY, MEDIUM or HARD");
      const named = lobby.game.state.seats.map((p) => (p?.type === "AI" ? { kind: "cpu", name: p.name } : null));
      const result = lobby.game.sit({ name: nextCpuName(named), type: "AI", level }, seat);
      if (!result.ok) return reject(result.error);
      broadcastLobbyList(lobby.gameType);
      return;
    }
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
    if (lobby.gameType === "blackjack") return reject("Blackjack has no CPU players");
    if (isCreditMatch(lobby)) return reject(lobby.credits.botsFill ? "Credit tables seat Hard bots" : "Credit tables are for people only");
    if (lobby.gameType === "poker") {
      if (lobby.game.state.seats[seat]?.type !== "AI") return reject("There's no CPU in that seat");
      lobby.game.standUp(seat);
      broadcastLobbyList(lobby.gameType);
      return;
    }
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
    if (lobby.gameType === "blackjack") return reject("Blackjack has no CPU players");
    if (isCreditMatch(lobby)) return reject(lobby.credits.botsFill ? "Credit tables seat Hard bots" : "Credit tables are for people only");
    if (lobby.gameType === "poker") return reject("Remove the CPU and add one at the new level");
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

  /** This socket's seat at a poker table: { lobby, seat }, or null. */
  const pokerSeat = (lobbyId) => {
    const lobby = lobbies.get(lobbyId);
    const member = lobby?.members.get(socket.data.playerKey);
    return lobby?.gameType === "poker" && member?.seatIndex != null ? { lobby, seat: member.seatIndex } : null;
  };
  const answer = (result) => !result.ok && reject(result.error);

  // A poker move: { type: fold | check | call | raise | allin, amount? }. The seat is the socket's.
  socket.on("poker_move", ({ lobbyId, move } = {}) => {
    const at = pokerSeat(lobbyId);
    if (!at) return;
    const safe = move && typeof move === "object" ? { type: move.type, amount: move.amount } : null;
    answer(at.lobby.game.move(at.seat, safe));
  });

  socket.on("poker_rebuy", ({ lobbyId } = {}) => {
    const at = pokerSeat(lobbyId);
    if (!at) return;
    if (at.lobby.credits) return reject("Use ADD CHIPS to rebuy at a credit table");
    answer(at.lobby.game.rebuy(at.seat));
  });

  // ADD CHIPS / REBUY at a credit table: { amount } from the balance, landing before the next deal.
  socket.on("poker_add_chips", async ({ lobbyId, amount } = {}) => {
    const at = pokerSeat(lobbyId);
    if (!at?.lobby.credits) return;
    answer(await at.lobby.credits.addChips(socket.data.userId, amount));
  });

  socket.on("poker_sit_in", ({ lobbyId } = {}) => {
    const at = pokerSeat(lobbyId);
    if (at) answer(at.lobby.game.sitIn(at.seat));
  });

  // The host ends a poker or blackjack table: everyone goes back to the lobby.
  socket.on("close_table", ({ lobbyId } = {}) => {
    const lobby = hostCommand(lobbyId);
    if (!lobby || !SELF_SEATING.has(lobby.gameType)) return;
    if (lobby.credits) {
      // The hand (or round) in play finishes and is saved; endCreditTable then sends everyone home.
      closeAfterPlay(lobby);
      broadcastLobbyList(lobby.gameType);
      return;
    }
    for (const m of lobby.members.values()) {
      if (m.connected && m.socketId) io.to(m.socketId).emit("table_left", { reason: "closed" });
      io.sockets.sockets.get(m.socketId)?.leave(lobby.id);
    }
    destroyLobby(lobby);
    broadcastLobbyList(lobby.gameType);
  });

  socket.on("request_rematch", ({ lobbyId } = {}) => {
    const lobby = lobbies.get(lobbyId);
    const member = lobby?.members.get(socket.data.playerKey);
    if (!lobby?.game || SELF_SEATING.has(lobby.gameType) || !member) return;
    if (isCreditMatch(lobby)) return reject("Press PLAY AGAIN to stake for the next match");
    if (lobby.hostKey !== member.key) {
      socket.emit("move_rejected", { reason: "Only the host can start a rematch" });
      return;
    }
    // The rematch's first state goes out from rematch(), so the last match's rewards go first.
    const rewards = lobby.rewards;
    lobby.rewards = null;
    const result = lobby.game.rematch();
    if (!result.ok) {
      lobby.rewards = rewards;
      socket.emit("move_rejected", { reason: result.error });
      return;
    }
    beginSession(lobby);
  });

  // PLAY AGAIN at a credit match: stake for the next match and take a seat.
  socket.on("credit_restake", async ({ lobbyId, amount } = {}) => {
    const lobby = lobbies.get(lobbyId);
    const member = lobby?.members.get(socket.data.playerKey);
    if (!lobby || !member || !isCreditMatch(lobby)) return;
    if (member.seatIndex != null) return;
    if (lobby.game) return reject("The match is still being settled");
    const why = creditRefusal(socket, lobby.tier, lobby.gameType);
    if (why) return reject(why);
    if (!(await stakeAndSeat(lobby, member, socket, amount ?? lobby.credits.stake, { stay: true }))) return;
    // The host leads the next match only if they stake for it too: else the first who does.
    const host = lobby.members.get(lobby.hostKey);
    if (!host || host.seatIndex == null) lobby.hostKey = member.key;
    broadcastTable(lobby);
    broadcastLobbyList(lobby.gameType);
  });

  registerBlackjackHandlers(socket, { lobbies });

  socket.on("send_chat", ({ lobbyId, message } = {}) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || !lobby.members.has(socket.data.playerKey)) return;
    const text = cleanChat(message);
    if (!text) return;
    const verdict = chatGuard.check(socket.data.playerKey, text);
    if (!verdict.ok) {
      socket.emit("chat_rejected", { reason: verdict.reason, retryInMs: verdict.retryInMs });
      return;
    }
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
    if (!lobby || !member) return;
    if (member.socketId !== socket.id) {
      // An older tab of the same player. At a poker or blackjack table its EXIT
      // still leaves (a seat left behind would keep posting blinds, or sitting
      // out), and the tab holding the seat is told.
      if (!SELF_SEATING.has(lobby.gameType)) return;
      if (member.connected && member.socketId) io.to(member.socketId).emit("table_left", { reason: "left" });
      io.sockets.sockets.get(member.socketId)?.leave(lobbyId);
    }
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

// A deploy starts the new server before this one is told to stop (SIGTERM).
// The new one sends seats home at boot, but this one could still take buy-ins
// meanwhile — so, told to stop, refuse new ones and send every credit seat home
// (a hand in play doesn't count) before exiting.
let shuttingDown = false;
async function shutDown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  const tables = [...lobbies.values()].filter((l) => l.credits);
  console.log(`[credits] ${signal}: sending ${tables.length} credit table(s) home before exiting`);
  const released = Promise.all(tables.map((l) => l.credits.release("restart_return")));
  await Promise.race([released, new Promise((resolve) => setTimeout(resolve, 10_000))]);
  process.exit(0);
}
process.on("SIGTERM", () => shutDown("SIGTERM"));
process.on("SIGINT", () => shutDown("SIGINT"));

// Schema first: a server that accepted players before its tables existed would
// fail every match write. No credit table survives a restart, so their seats'
// credits go home before anyone can sit down again.
await migrate();
await closeOrphanedSessions();
if (pool) {
  await returnSeatsAfterRestart();
  const check = await economyCheck();
  if (!check.ok) console.error("[credits] ECONOMY MISMATCH:", check);
}
server.listen(PORT, () => {
  console.log(`CARD GAME SERVER RUNNING ON PORT ${PORT}`);
});
