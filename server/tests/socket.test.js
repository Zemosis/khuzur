// End-to-end over real sockets: starts server/index.js on a free port with the
// database off and fast game timers, then plays through lobbies, moves, chat,
// leaving, reconnecting and a whole match with real socket.io clients.

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io as connectClient } from "socket.io-client";
import { aiAction } from "../game/muushig/ai.js";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRACE_MS = 400;

let server;
let url;
const open = [];

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

beforeAll(async () => {
  const port = await freePort();
  url = `http://localhost:${port}`;
  server = spawn(process.execPath, ["index.js"], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: "",
      JWT_SECRET: "socket-test-secret",
      DISCONNECT_GRACE_MS: String(GRACE_MS),
      AI_TURN_DELAY_MS: "2",
      DEAL_DELAY_MS: "2",
      ROUND_END_DELAY_MS: "2",
      MUUSHIG_DELAY_MS: "2",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 15000);
    server.stdout.on("data", (d) => {
      if (String(d).includes("RUNNING ON PORT")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.on("exit", (code) => reject(new Error(`server exited with ${code}`)));
  });
});

afterEach(() => {
  while (open.length) open.pop().disconnect();
});

afterAll(() => server?.kill());

// ---------- client helpers ----------

let guestCount = 0;
const guest = async (name = `G${++guestCount}`, tag = String(1000 + guestCount), avatar) => {
  const sock = connectClient(url, { auth: { name, tag, avatar }, forceNew: true, transports: ["websocket"] });
  sock.states = [];
  sock.on("game_state_update", (s) => sock.states.push(s));
  sock.tables = [];
  sock.on("table_update", (t) => sock.tables.push(t));
  sock.muushig = [];
  sock.on("muushig_state", (v) => sock.muushig.push(v));
  open.push(sock);
  await new Promise((resolve, reject) => {
    sock.once("connect", resolve);
    sock.once("connect_error", reject);
  });
  return sock;
};

/** Resolves with the next `event` payload that satisfies `match`. */
const next = (sock, event, match = () => true, timeout = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeout);
    const handler = (data) => {
      if (!match(data)) return;
      clearTimeout(timer);
      sock.off(event, handler);
      resolve(data);
    };
    sock.on(event, handler);
  });

/** Like next(), but also accepts a matching state that already arrived. */
const stateWhere = (sock, match = () => true, timeout) => {
  const seen = [...sock.states].reverse().find(match);
  return seen ? Promise.resolve(seen) : next(sock, "game_state_update", match, timeout);
};

/** Like stateWhere(), for the waiting table's `table_update`. */
const tableWhere = (sock, match = () => true, timeout) => {
  const seen = [...sock.tables].reverse().find(match);
  return seen ? Promise.resolve(seen) : next(sock, "table_update", match, timeout);
};

const ack = (sock, event) => new Promise((resolve) => sock.emit(event, resolve));

const createLobby = async (host, opts = {}) => {
  const joined = next(host, "lobby_joined");
  host.emit("create_lobby", { lobbyName: "Test Table", isPrivate: false, ...opts });
  return (await joined).lobbyId;
};

const joinLobby = async (sock, lobbyId) => {
  const joined = next(sock, "lobby_joined");
  sock.emit("join_lobby", { lobbyId });
  return joined;
};

/** Host presses START; resolves with each socket's first dealt state. */
const startMatch = async (host, lobbyId, others = []) => {
  const firsts = [host, ...others].map((s) => next(s, "game_state_update"));
  host.emit("start_game", { lobbyId });
  return Promise.all(firsts);
};

/** Thirteen's START leaves empty seats empty: seat a CPU in each first, then start. */
const startFull = async (host, lobbyId, others = []) => {
  const t = await tableWhere(host, (t) => t.lobbyId === lobbyId && t.seats.filter(Boolean).length === 1 + others.length);
  t.seats.forEach((s, seat) => s || host.emit("add_cpu", { lobbyId, seat }));
  return startMatch(host, lobbyId, others);
};

const mySeat = (state) => state.players.findIndex((p) => p.hand.length && !p.hand[0].hidden);
const lowest = (hand) => [...hand].sort((a, b) => a.rankValue * 4 + a.suitValue - (b.rankValue * 4 + b.suitValue))[0];

// ---------- tests ----------

describe("connection", () => {
  it("answers ping_check and get_stats", async () => {
    const a = await guest();
    await expect(ack(a, "ping_check")).resolves.toBeUndefined();
    const stats = await ack(a, "get_stats");
    expect(stats.online).toBeGreaterThanOrEqual(1);
    expect(typeof stats.tables).toBe("number");
  });

  it("get_stats counts open public lobbies per game", async () => {
    const a = await guest();
    const before = await ack(a, "get_stats");
    expect(before.lobbies).toEqual({ thirteen: before.tables, muushig: 0 });

    const host = await guest("HOST");
    await createLobby(host, { lobbyName: "Counted" });
    await createLobby(await guest(), { lobbyName: "Hidden", isPrivate: true });
    const after = await ack(a, "get_stats");
    expect(after.lobbies.thirteen).toBe(before.lobbies.thirteen + 1);
    expect(after.lobbies.muushig).toBe(0);
  });
});

describe("lobbies", () => {
  it("a public lobby is listed and joinable by its 6-character code", async () => {
    const host = await guest("HOST");
    const lobbyId = await createLobby(host, { lobbyName: "Public Hall" });
    expect(lobbyId).toMatch(/^PUB-[A-Z0-9]{6}$/);

    const b = await guest();
    const list = next(b, "public_lobbies_update");
    b.emit("get_public_lobbies");
    const entry = (await list).find((l) => l.id === lobbyId);
    expect(entry).toMatchObject({ name: "Public Hall", current: 1, max: 4, inProgress: false });
    expect(entry.host).toMatch(/^HOST #/);

    const joined = await joinLobby(b, lobbyId.replace("PUB-", ""));
    expect(joined).toMatchObject({ lobbyId, isHost: false });
  });

  it("a private lobby is not listed but can be joined by code", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host, { isPrivate: true });
    expect(lobbyId).toMatch(/^[A-Z0-9]{6}$/);
    const b = await guest();
    const list = next(b, "public_lobbies_update");
    b.emit("get_public_lobbies");
    expect((await list).some((l) => l.id === lobbyId)).toBe(false);
    expect(await joinLobby(b, lobbyId)).toMatchObject({ lobbyId, isHost: false });
  });

  it("rejects unknown and full lobbies", async () => {
    const a = await guest();
    const err = next(a, "error_message");
    a.emit("join_lobby", { lobbyId: "NOPE42" });
    expect(await err).toBe("Lobby not found");

    const host = await guest();
    const lobbyId = await createLobby(host);
    for (let i = 0; i < 3; i++) await joinLobby(await guest(), lobbyId);
    const late = await guest();
    const full = next(late, "error_message");
    late.emit("join_lobby", { lobbyId });
    expect(await full).toBe("Lobby is full");
  });
});

describe("the table list", () => {
  const browse = async (sock) => {
    const list = next(sock, "public_lobbies_update");
    sock.emit("get_public_lobbies");
    return list;
  };
  /** Collects every list update a socket gets from now on. */
  const overhear = (sock) => {
    const heard = [];
    sock.on("public_lobbies_update", (l) => heard.push(l));
    return heard;
  };
  /** Creates a table and resolves once a browsing watcher has seen it listed. */
  const listedTable = async (watcher, lobbyName) => {
    const seen = next(watcher, "public_lobbies_update", (l) => l.some((t) => t.name === lobbyName));
    await createLobby(await guest(), { lobbyName });
    await seen;
    // Other sockets' copies of the same update may still be in flight.
    await new Promise((r) => setTimeout(r, 100));
  };

  it("updates go only to players looking at the list", async () => {
    const watcher = await guest();
    await browse(watcher);
    const elsewhere = overhear(await guest());
    await listedTable(watcher, "Fresh Table");
    expect(elsewhere).toEqual([]);
  });

  it("leaving the list, hosting a table or joining one stops its updates", async () => {
    const [leaver, hoster, joiner, watcher] = await Promise.all([guest(), guest(), guest(), guest()]);
    for (const s of [leaver, hoster, joiner, watcher]) await browse(s);
    leaver.emit("leave_public_lobbies");
    const lobbyId = await createLobby(hoster);
    await joinLobby(joiner, lobbyId);
    const heard = [leaver, hoster, joiner].map(overhear);
    await listedTable(watcher, "Another Table");
    expect(heard).toEqual([[], [], []]);
  });
});

describe("the waiting table", () => {
  it("a new table waits: the host is seated alone and nothing is dealt", async () => {
    const host = await guest("WAITER", "0101");
    const lobbyId = await createLobby(host, { lobbyName: "Patience" });
    host.emit("check_game_status", { lobbyId });
    const t = await tableWhere(host);
    expect(t).toMatchObject({
      lobbyId,
      name: "Patience",
      isPrivate: false,
      status: "waiting",
      code: lobbyId.replace("PUB-", ""),
      mySeat: 0,
      isHost: true,
    });
    expect(t.seats).toHaveLength(4);
    expect(t.seats[0]).toMatchObject({ kind: "human", name: "WAITER #0101", isHost: true, connected: true });
    expect(t.seats.slice(1)).toEqual([null, null, null]);
    expect(JSON.stringify(t)).not.toMatch(/guest:/);
    await new Promise((r) => setTimeout(r, 150));
    expect(host.states).toHaveLength(0);
  });

  it("a joiner is seated and everyone sees them; the joiner is not host", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest("BEE", "0202");
    await joinLobby(b, lobbyId);
    const mine = await tableWhere(b, (t) => t.mySeat === 1);
    expect(mine.isHost).toBe(false);
    const seen = await tableWhere(host, (t) => t.seats[1]?.name === "BEE #0202");
    expect(seen.seats[1]).toMatchObject({ kind: "human", isHost: false, connected: true });
  });

  it("only the host can start; START deals to the seated players", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);

    const r = next(b, "move_rejected");
    b.emit("start_game", { lobbyId });
    expect((await r).reason).toBe("Only the host can do that");

    const [hs, bs] = await startMatch(host, lobbyId, [b]);
    expect(hs.gameState).toBe("PLAYING");
    expect(mySeat(hs)).toBe(0);
    expect(mySeat(bs)).toBe(1);
    expect(hs.players.map((p) => p.type)).toEqual(["HUMAN", "HUMAN"]);
  });

  it("start_game twice is rejected and does not re-deal", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const [first] = await startFull(host, lobbyId);
    const r = next(host, "move_rejected");
    host.emit("start_game", { lobbyId });
    expect((await r).reason).toBe("The game has already started");
    // The host never plays, so their 13 cards only change if a new game dealt.
    await new Promise((r2) => setTimeout(r2, 100));
    const ids = (st) => st.players[0].hand.map((c) => c.id).sort();
    expect(ids(host.states.at(-1))).toEqual(ids(first));
  });

  it("check_game_status on a playing table sends the game state", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    await startFull(host, lobbyId);
    const again = next(host, "game_state_update");
    host.emit("check_game_status", { lobbyId });
    expect((await again).gameState).toBeDefined();
  });

  it("the host adds and removes CPUs; everyone sees it", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);

    // Waits that follow an action use next(), never tableWhere(): an older
    // recorded update could already satisfy the predicate.
    const bothAdded = next(b, "table_update", (t) => t.seats[2] && t.seats[3]);
    host.emit("add_cpu", { lobbyId, seat: 2 });
    host.emit("add_cpu", { lobbyId, seat: 3 });
    const both = await bothAdded;
    expect(both.seats[2]).toEqual({ kind: "cpu", name: "Bot Saturn", level: "MEDIUM" });
    expect(both.seats[3]).toEqual({ kind: "cpu", name: "Bot Venus", level: "MEDIUM" });

    const removedP = next(b, "table_update", (t) => t.seats[2] === null);
    host.emit("remove_cpu", { lobbyId, seat: 2 });
    expect((await removedP).seats[3].name).toBe("Bot Venus");

    // The freed name is reused.
    const readded = next(b, "table_update", (t) => t.seats[2] !== null);
    host.emit("add_cpu", { lobbyId, seat: 2 });
    expect((await readded).seats[2].name).toBe("Bot Saturn");
  });

  it("rejects CPU commands from non-hosts and for bad seats", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);

    let r = next(b, "move_rejected");
    b.emit("add_cpu", { lobbyId, seat: 2 });
    expect((await r).reason).toBe("Only the host can do that");

    for (const seat of [0, 1, -1, 4, "2", null]) {
      r = next(host, "move_rejected");
      host.emit("add_cpu", { lobbyId, seat });
      expect((await r).reason).toBe("That seat isn't empty");
    }
    for (const seat of [0, 2, 9]) {
      r = next(host, "move_rejected");
      host.emit("remove_cpu", { lobbyId, seat });
      expect((await r).reason).toBe("There's no CPU in that seat");
    }
    const now = next(host, "table_update");
    host.emit("check_game_status", { lobbyId });
    expect((await now).seats.slice(2)).toEqual([null, null]);
  });

  it("CPU commands are rejected once the game has started", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    await startFull(host, lobbyId);
    const r = next(host, "move_rejected");
    host.emit("add_cpu", { lobbyId, seat: 1 });
    expect((await r).reason).toBe("The game has already started");
  });

  it("a joiner bumps a CPU when no seat is empty; a fifth human is turned away", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const allCpus = next(host, "table_update", (t) => t.seats.every(Boolean));
    for (const seat of [1, 2, 3]) host.emit("add_cpu", { lobbyId, seat });
    await allCpus;

    const b = await guest("BUMP", "0303");
    await joinLobby(b, lobbyId);
    const t = await tableWhere(b, (x) => x.mySeat != null);
    expect(t.mySeat).toBe(1);
    expect(t.seats.map((s) => s.kind)).toEqual(["human", "human", "cpu", "cpu"]);

    for (let i = 0; i < 2; i++) await joinLobby(await guest(), lobbyId);
    const late = await guest();
    const full = next(late, "error_message");
    late.emit("join_lobby", { lobbyId });
    expect(await full).toBe("Lobby is full");
  });

  it("a non-host leaving frees their seat (empty, not a CPU)", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);
    await tableWhere(host, (t) => t.seats[1]);
    const freed = next(host, "table_update", (x) => x.seats[1] === null);
    b.emit("leave_lobby", { lobbyId });
    const t = await freed;
    expect(t.seats).toEqual([expect.objectContaining({ kind: "human" }), null, null, null]);
  });

  it("the host leaving passes host to the next seated human, who is told", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const cpuIn = next(host, "table_update", (t) => t.seats[1]);
    host.emit("add_cpu", { lobbyId, seat: 1 });
    await cpuIn;
    const b = await guest("NEXT", "0404");
    await joinLobby(b, lobbyId);
    expect((await tableWhere(b, (t) => t.mySeat != null)).mySeat).toBe(2);

    host.emit("leave_lobby", { lobbyId });
    const t = await tableWhere(b, (x) => x.isHost);
    expect(t.seats[0]).toBeNull();
    expect(t.seats[2]).toMatchObject({ name: "NEXT #0404", isHost: true });

    const started = next(b, "game_state_update");
    b.emit("start_game", { lobbyId });
    expect((await started).gameState).toBe("PLAYING");
  });

  it("the last human leaving closes the table even with CPUs seated", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host, { lobbyName: "Ghost Town" });
    const cpuIn = next(host, "table_update", (t) => t.seats[1]);
    host.emit("add_cpu", { lobbyId, seat: 1 });
    await cpuIn;
    host.emit("leave_lobby", { lobbyId });
    const c = await guest();
    const err = next(c, "error_message");
    c.emit("join_lobby", { lobbyId });
    expect(await err).toBe("Lobby not found");
  });

  it("a host who refreshes inside the grace period gets the same table back", async () => {
    const host = await guest("REFRESH", "0505");
    const lobbyId = await createLobby(host);
    const cpuIn = next(host, "table_update", (t) => t.seats[3]);
    host.emit("add_cpu", { lobbyId, seat: 3 });
    await cpuIn;
    const watcher = await guest();
    await joinLobby(watcher, lobbyId);

    host.disconnect();
    const away = await tableWhere(watcher, (t) => t.seats[0] && !t.seats[0].connected);
    expect(away.seats[0]).toMatchObject({ name: "REFRESH #0505", isHost: true, connected: false });

    const back = await guest("REFRESH", "0505");
    const joined = await joinLobby(back, lobbyId);
    expect(joined.isHost).toBe(true);
    const t = await tableWhere(back, (x) => x.seats[0]?.connected);
    expect(t).toMatchObject({ mySeat: 0, isHost: true });
    expect(t.seats[3]).toEqual({ kind: "cpu", name: "Bot Saturn", level: "MEDIUM" });
  });

  it("staying away past the grace period frees the seat", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);
    await tableWhere(host, (t) => t.seats[1]);
    const freed = next(host, "table_update", (x) => x.seats[1] === null, GRACE_MS * 5);
    b.disconnect();
    expect((await freed).seats[1]).toBeNull();
  });

  it("leaving the page (browser Back) holds the seat like a disconnect, then frees it", async () => {
    const host = await guest("BACKER", "0606");
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);
    await tableWhere(b, (t) => t.seats[0]);

    const away = next(b, "table_update", (t) => t.seats[0] && !t.seats[0].connected);
    host.emit("leave_page", { lobbyId });
    expect((await away).seats[0].name).toBe("BACKER #0606");

    // Nobody came back: the seat empties and host passes on.
    const handed = next(b, "table_update", (t) => t.isHost, GRACE_MS * 5);
    expect((await handed).seats[0]).toBeNull();
  });

  it("coming back to the page inside the grace period keeps the seat", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);
    await tableWhere(b, (t) => t.seats[0]);
    b.emit("leave_page", { lobbyId });
    await joinLobby(b, lobbyId);
    const back = await tableWhere(b, (t) => t.seats[1]?.connected);
    expect(back.mySeat).toBe(1);
    await new Promise((r) => setTimeout(r, GRACE_MS * 1.5));
    const now = next(host, "table_update");
    host.emit("check_game_status", { lobbyId });
    expect((await now).seats[1]).toMatchObject({ connected: true });
  });
});

describe("CPU levels and short Thirteen tables", () => {
  it("the host seats CPUs at a level and changes it; everyone sees it", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);
    host.emit("add_cpu", { lobbyId, seat: 2, level: "HARD" });
    host.emit("add_cpu", { lobbyId, seat: 3 }); // an older browser: no level
    const t = await tableWhere(b, (t) => t.seats[3]?.kind === "cpu");
    expect(t.seats[2]).toMatchObject({ kind: "cpu", level: "HARD" });
    expect(t.seats[3]).toMatchObject({ kind: "cpu", level: "MEDIUM" });
    host.emit("set_cpu_level", { lobbyId, seat: 2, level: "EASY" });
    const changed = await tableWhere(b, (t) => t.seats[2]?.level === "EASY");
    expect(changed.seats[2].name).toBe(t.seats[2].name);
  });

  it("rejects a bad level, a non-host, and a seat without a CPU", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);
    const reason = async (sock, event, payload) => {
      const r = next(sock, "move_rejected");
      sock.emit(event, { lobbyId, ...payload });
      return (await r).reason;
    };
    expect(await reason(host, "add_cpu", { seat: 2, level: "GODLIKE" })).toBe("Pick EASY, MEDIUM or HARD");
    host.emit("add_cpu", { lobbyId, seat: 2, level: "EASY" });
    await tableWhere(host, (t) => t.seats[2]?.kind === "cpu");
    expect(await reason(host, "set_cpu_level", { seat: 2, level: "NOPE" })).toBe("Pick EASY, MEDIUM or HARD");
    expect(await reason(b, "set_cpu_level", { seat: 2, level: "HARD" })).toBe("Only the host can do that");
    expect(await reason(host, "set_cpu_level", { seat: 1, level: "HARD" })).toBe("There's no CPU in that seat");
  });

  it("a Thirteen table won't start with the host alone", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    await tableWhere(host);
    const r = next(host, "move_rejected");
    host.emit("start_game", { lobbyId });
    expect((await r).reason).toBe("Add a player or a CPU to start");
    expect(host.states).toEqual([]);
  });

  it("two seated players start a 2-player game; seats close up and moves reach the right player", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    for (const seat of [1, 2]) host.emit("add_cpu", { lobbyId, seat });
    await tableWhere(host, (t) => t.seats[2]);
    const b = await guest();
    await joinLobby(b, lobbyId); // takes seat 3, the first empty one
    for (const seat of [1, 2]) host.emit("remove_cpu", { lobbyId, seat });
    await tableWhere(b, (t) => t.mySeat === 3 && !t.seats[1] && !t.seats[2]);

    const [hs, bs] = await startMatch(host, lobbyId, [b]);
    expect(hs.players.map((p) => p.type)).toEqual(["HUMAN", "HUMAN"]);
    expect(mySeat(hs)).toBe(0);
    expect(mySeat(bs)).toBe(1);
    expect(hs.players.map((p) => p.hand.length)).toEqual([13, 13]);

    await new Promise((r) => setTimeout(r, hs.dealMsLeft));
    const turn = hs.currentPlayerIndex;
    const actor = turn === 0 ? host : b;
    const card = lowest((turn === 0 ? hs : bs).players[turn].hand);
    const seen = [host, b].map((s) => next(s, "game_state_update", (st) => st.currentPlay));
    actor.emit("request_move", { lobbyId, action: "play", data: { cards: [card.id] } });
    (await Promise.all(seen)).forEach((st) => expect(st.currentPlay.cards[0].id).toBe(card.id));
  });

  it("CPUs start at the level the host gave them", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    host.emit("add_cpu", { lobbyId, seat: 1, level: "HARD" });
    const [state] = await startMatch(host, lobbyId);
    expect(state.players.map((p) => p.level)).toEqual([null, "HARD"]);
  });
});

describe("who is host, as each player's game state says", () => {
  it("a player promoted at the waiting table is host in the game (can rematch)", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);
    host.emit("leave_lobby", { lobbyId });
    await tableWhere(b, (t) => t.isHost);
    const [bs] = await startFull(b, lobbyId);
    expect(bs.amHost).toBe(true);
  });

  it("host hand-off mid-match reaches the new host's state", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);
    const [hs, bs] = await startMatch(host, lobbyId, [b]);
    expect(hs.amHost).toBe(true);
    expect(bs.amHost).toBe(false);
    const promoted = next(b, "game_state_update", (s) => s.amHost);
    host.emit("leave_lobby", { lobbyId });
    expect((await promoted).amHost).toBe(true);
  });
});

describe("malformed payloads", () => {
  it("null payloads are ignored instead of crashing the server", async () => {
    const a = await guest();
    const events = [
      "create_lobby", "join_lobby", "leave_lobby", "leave_page", "check_game_status", "add_cpu",
      "remove_cpu", "set_cpu_level", "start_game", "request_move", "request_rematch", "send_chat", "get_public_lobbies", "leave_public_lobbies",
      "muushig_move",
    ];
    for (const ev of events) a.emit(ev, null);
    await new Promise((r) => setTimeout(r, 100));
    const b = await guest();
    await expect(ack(b, "ping_check")).resolves.toBeUndefined();
  });
});

describe("a running match", () => {
  const fourHumans = async () => {
    const socks = [await guest()];
    const lobbyId = await createLobby(socks[0]);
    for (let i = 0; i < 3; i++) {
      const s = await guest();
      await joinLobby(s, lobbyId);
      socks.push(s);
    }
    const states = await startMatch(socks[0], lobbyId, socks.slice(1));
    // Nobody moves before the deal is over (see ThirteenGame.dealMsLeft).
    await new Promise((r) => setTimeout(r, Math.max(...states.map((s) => s.dealMsLeft))));
    return { socks, lobbyId, states };
  };

  it("each player sees only their own hand; CPUs the host seated play too", async () => {
    const host = await guest("SOLO");
    const lobbyId = await createLobby(host);
    const [state] = await startFull(host, lobbyId);
    expect(mySeat(state)).toBe(0);
    expect(state.players[0].hand).toHaveLength(13);
    expect(state.players.slice(1).map((p) => p.type)).toEqual(["AI", "AI", "AI"]);
    state.players.slice(1).forEach((p) => p.hand.forEach((c) => expect(c).toEqual({ hidden: true })));
  });

  it("four humans each get their own redacted view", async () => {
    const { states } = await fourHumans();
    states.forEach((s, seat) => {
      expect(mySeat(s)).toBe(seat);
      expect(s.players.every((p) => p.type === "HUMAN")).toBe(true);
    });
    expect(new Set(states.map((s) => s.currentPlayerIndex)).size).toBe(1);
  });

  it("illegal moves are rejected with a reason; a legal one reaches everyone", async () => {
    const { socks, lobbyId, states } = await fourHumans();
    const turn = states[0].currentPlayerIndex;
    const other = socks[(turn + 1) % 4];
    const actor = socks[turn];

    let rejected = next(other, "move_rejected");
    other.emit("request_move", { lobbyId, action: "play", data: { cards: ["3♦"] } });
    expect((await rejected).reason).toBe("Not your turn");

    rejected = next(actor, "move_rejected");
    actor.emit("request_move", { lobbyId, action: "pass" });
    expect((await rejected).reason).toMatch(/must play/);

    rejected = next(actor, "move_rejected");
    const notMine = states[(turn + 1) % 4].players[(turn + 1) % 4].hand[0].id;
    actor.emit("request_move", { lobbyId, action: "play", data: { cards: [notMine] } });
    expect((await rejected).reason).toBe("Those cards are not in your hand");

    const card = lowest(states[turn].players[turn].hand);
    const updates = socks.map((s) => next(s, "game_state_update", (st) => st.currentPlay));
    actor.emit("request_move", { lobbyId, action: "play", data: { cards: [card.id] } });
    const after = await Promise.all(updates);
    after.forEach((st) => {
      expect(st.currentPlay.cards[0].id).toBe(card.id);
      expect(st.players[turn].hand).toHaveLength(12);
      expect(st.currentPlayerIndex).toBe((turn + 1) % 4);
    });
  });

  it("chat reaches the whole table and empty messages are dropped", async () => {
    const { socks, lobbyId } = await fourHumans();
    const got = socks.map((s) => next(s, "receive_chat"));
    socks[1].emit("send_chat", { lobbyId, message: "   " });
    socks[1].emit("send_chat", { lobbyId, message: "gl hf" });
    const msgs = await Promise.all(got);
    msgs.forEach((m) => expect(m).toMatchObject({ type: "CHAT", text: "gl hf" }));
    expect(msgs[0].sender).toMatch(/ #/);
    // A random UUID: nothing that exposes the server's Math.random, which could predict deals.
    expect(msgs[0].id).toMatch(/^msg-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("a chat flood is cut off for the sender only; the table never sees the extra messages", async () => {
    const { socks, lobbyId } = await fourHumans();
    const [spammer, reader] = socks;
    const received = [];
    reader.on("receive_chat", (m) => received.push(m.text));
    const rejected = next(spammer, "chat_rejected");
    for (let i = 0; i < 8; i++) spammer.emit("send_chat", { lobbyId, message: `spam ${i}` });
    const r = await rejected;
    expect(r).toMatchObject({ reason: "slow" });
    expect(r.retryInMs).toBeGreaterThan(0);
    // Someone else at the table can still talk.
    const fromReader = next(socks[2], "receive_chat", (m) => m.text === "calm down");
    reader.emit("send_chat", { lobbyId, message: "calm down" });
    await fromReader;
    expect(received.filter((t) => t.startsWith("spam"))).toEqual(["spam 0", "spam 1", "spam 2", "spam 3", "spam 4", "spam 5"]);
  });

  it("only the host can ask for a rematch, and only after game over", async () => {
    const { socks, lobbyId } = await fourHumans();
    let r = next(socks[1], "move_rejected");
    socks[1].emit("request_rematch", { lobbyId });
    expect((await r).reason).toBe("Only the host can start a rematch");
    r = next(socks[0], "move_rejected");
    socks[0].emit("request_rematch", { lobbyId });
    expect((await r).reason).toBe("Match is still in progress");
  });

  it("leaving mid-match hands the seat to a CPU", async () => {
    const { socks, lobbyId } = await fourHumans();
    const update = next(socks[0], "game_state_update", (s) => s.players[2].type === "AI");
    socks[2].emit("leave_lobby", { lobbyId });
    const s = await update;
    expect(s.players[2].name).toMatch(/\(CPU\)$/);
  });

  it("a disconnect keeps the seat through the grace period and rejoin reclaims it", async () => {
    const { socks, lobbyId } = await fourHumans();
    const leaver = socks[3];
    // Re-derive the guest identity the server keyed this seat by.
    const auth = leaver.io.opts.auth;
    leaver.disconnect();
    await new Promise((r) => setTimeout(r, GRACE_MS / 4));
    const back = await guest(auth.name, auth.tag);
    const joined = await joinLobby(back, lobbyId);
    expect(joined.isHost).toBe(false);
    const state = await stateWhere(back);
    expect(mySeat(state)).toBe(3);
    expect(state.players[3].type).toBe("HUMAN");
    await new Promise((r) => setTimeout(r, GRACE_MS * 1.5));
    expect(socks[0].states.at(-1).players[3].type).toBe("HUMAN");
  });

  it("staying away past the grace period hands the seat to a CPU", async () => {
    const { socks } = await fourHumans();
    const update = next(socks[0], "game_state_update", (s) => s.players[1].type === "AI", GRACE_MS * 5);
    socks[1].disconnect();
    expect((await update).players[1].name).toMatch(/\(CPU\)$/);
  });

  it("a new player joining mid-match takes over a CPU seat", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    await startFull(host, lobbyId);
    const late = await guest("LATE", "0042", "3");
    const joined = await joinLobby(late, lobbyId);
    expect(joined.isHost).toBe(false);
    const s = await stateWhere(late, (st) => mySeat(st) > 0);
    expect(s.players[mySeat(s)]).toMatchObject({ type: "HUMAN", name: "LATE #0042", avatar: { variant: "3", custom: null } });
    // The rest of the table sees the new face too, not a stock CPU one.
    const seen = await stateWhere(host, (st) => st.players[mySeat(s)].type === "HUMAN");
    expect(seen.players[mySeat(s)].avatar).toEqual({ variant: "3", custom: null });
  });
});

describe("a whole match over sockets", () => {
  it("one human against three CPUs plays to game over, then rematches", async () => {
    const host = await guest("FULL");
    const lobbyId = await createLobby(host);

    // Simple bot: lead the lowest card, otherwise pass.
    let lastMoveKey = null;
    const autoplay = (s) => {
      if (s.gameState !== "PLAYING" || s.currentPlayerIndex !== 0) return;
      const key = `${s.roundNumber}:${s.moveHistory.length}`;
      if (key === lastMoveKey) return;
      lastMoveKey = key;
      // Like the browser, wait out the deal first.
      setTimeout(() => {
        if (s.currentPlay) host.emit("request_move", { lobbyId, action: "pass" });
        else host.emit("request_move", { lobbyId, action: "play", data: { cards: [lowest(s.players[0].hand).id] } });
      }, s.dealMsLeft);
    };
    host.on("game_state_update", autoplay);
    const rejections = [];
    host.on("move_rejected", ({ reason }) => rejections.push(reason));

    const over = next(host, "game_state_update", (s) => s.gameState === "GAME_OVER", 25000);
    for (const seat of [1, 2, 3]) host.emit("add_cpu", { lobbyId, seat });
    host.emit("start_game", { lobbyId });
    const final = await over;
    expect(final.players.filter((p) => !p.isEliminated)).toHaveLength(1);
    expect(final.matchWins.reduce((a, b) => a + b, 0)).toBe(1);
    expect(final.roundNumber).toBeGreaterThan(1);
    expect(rejections).toEqual([]);

    host.off("game_state_update", autoplay);
    const rematch = next(host, "game_state_update", (s) => s.matchNumber === 2);
    host.emit("request_rematch", { lobbyId });
    const second = await rematch;
    expect(second).toMatchObject({ gameState: "PLAYING", roundNumber: 1 });
    expect(second.matchWins).toEqual(final.matchWins);
    expect(second.players.every((p) => p.score === 0)).toBe(true);
  }, 30000);
});

describe("muushig tables", () => {
  const ACTION_PHASES = new Set(["DRAW", "DECIDE", "SWAP", "TRUMP", "PLAY"]);
  const createMuushig = (host, opts = {}) => createLobby(host, { gameType: "muushig", ...opts });
  /** Like stateWhere(), for Muushig views. */
  const viewWhere = (sock, match = () => true, timeout) => {
    const seen = [...sock.muushig].reverse().find(match);
    return seen ? Promise.resolve(seen) : next(sock, "muushig_state", match, timeout);
  };
  it("START fills empty seats with MEDIUM CPUs and keeps the levels the host chose", async () => {
    const host = await guest();
    const lobbyId = await createMuushig(host);
    host.emit("add_cpu", { lobbyId, seat: 1, level: "HARD" });
    await tableWhere(host, (t) => t.seats[1]?.level === "HARD");
    const first = next(host, "muushig_state");
    host.emit("start_game", { lobbyId });
    expect((await first).players.map((p) => p.level)).toEqual([null, "HARD", "MEDIUM", "MEDIUM", "MEDIUM"]);
  });

  /** Plays this socket's turns with the CPU's own choice, read off its redacted view. */
  const autoplay = (sock, lobbyId) => {
    let last = null;
    const play = (v) => {
      if (!ACTION_PHASES.has(v.phase) || v.turn !== v.mySeat) return;
      const key = `${v.matchNumber}:${v.events.length}`;
      if (key === last) return;
      last = key;
      const { seat, ...move } = aiAction(v);
      // Like the browser, wait out the round's opening first.
      setTimeout(() => sock.emit("muushig_move", { lobbyId, move }), v.dealMsLeft);
    };
    sock.on("muushig_state", play);
    if (sock.muushig.length) play(sock.muushig.at(-1)); // a turn that already arrived
    return () => sock.off("muushig_state", play);
  };

  it("a Muushig table has 5 seats, its own list, and says which game it is", async () => {
    const host = await guest("MUHOST");
    const joined = next(host, "lobby_joined");
    host.emit("create_lobby", { lobbyName: "Ger", isPrivate: false, gameType: "muushig" });
    const { lobbyId, gameType } = await joined;
    expect(gameType).toBe("muushig");
    expect((await tableWhere(host)).seats).toHaveLength(5);

    const a = await guest();
    const muList = next(a, "public_lobbies_update");
    a.emit("get_public_lobbies", { gameType: "muushig" });
    expect((await muList).find((l) => l.id === lobbyId)).toMatchObject({ name: "Ger", max: 5, gameType: "muushig" });
    const b = await guest();
    const thirteenList = next(b, "public_lobbies_update");
    b.emit("get_public_lobbies", {});
    expect((await thirteenList).some((l) => l.id === lobbyId)).toBe(false);

    const stats = await new Promise((resolve) => b.emit("get_stats", resolve));
    expect(stats.lobbies.muushig).toBeGreaterThanOrEqual(1);

    // A code typed in either lobby, or an invite link, finds the game it belongs to.
    expect(await joinLobby(b, lobbyId.replace("PUB-", ""))).toMatchObject({ lobbyId, gameType: "muushig", isHost: false });
  });

  it("Thirteen tables still say they're Thirteen", async () => {
    const host = await guest();
    const joined = next(host, "lobby_joined");
    host.emit("create_lobby", { lobbyName: "T" });
    expect(await joined).toMatchObject({ gameType: "thirteen" });
    expect((await tableWhere(host)).seats).toHaveLength(4);
  });

  it("the host can seat a CPU in the 5th seat; START fills the rest with bots and sends each player their own view", async () => {
    const host = await guest("ONE");
    const lobbyId = await createMuushig(host);
    const b = await guest("TWO");
    await joinLobby(b, lobbyId);
    let t = next(host, "table_update", (x) => x.seats[4]?.kind === "cpu");
    host.emit("add_cpu", { lobbyId, seat: 4 });
    expect((await t).seats[4]).toEqual({ kind: "cpu", name: "Bot Saturn", level: "MEDIUM" });

    const first = [host, b].map((sock) => next(sock, "muushig_state"));
    host.emit("start_game", { lobbyId });
    const [hv, bv] = await Promise.all(first);
    expect(hv.mySeat).toBe(0);
    expect(bv.mySeat).toBe(1);
    expect(hv.players.map((p) => p.name.split(" #")[0])).toEqual(["ONE", "TWO", "Bot Venus", "Bot Mars", "Bot Saturn"]);
    expect(hv.players.map((p) => p.type)).toEqual(["HUMAN", "HUMAN", "AI", "AI", "AI"]);
    expect(hv.amHost).toBe(true);
    expect(bv.amHost).toBe(false);
    // The deal pile's order is secret: only its size is sent.
    expect(hv.dealDeck).toHaveLength(32);
    expect(hv.dealDeck.every((c) => c.hidden)).toBe(true);

    // Both humans draw for the deal; once dealt, each sees their own hand and
    // only card backs for the others.
    const stops = [autoplay(host, lobbyId), autoplay(b, lobbyId)];
    const dealt = await viewWhere(b, (v) => v.roundNumber === 1 && v.phase !== "DRAW");
    stops.forEach((stop) => stop());
    expect(dealt.players[1].hand.every((c) => c.id)).toBe(true);
    for (const seat of [0, 2, 3, 4]) expect(dealt.players[seat].hand.every((c) => c.hidden)).toBe(true);
  });

  it("moves come in as muushig_move; out of turn, bad or at the wrong table they are rejected", async () => {
    const host = await guest();
    const lobbyId = await createMuushig(host);
    const first = next(host, "muushig_state");
    host.emit("start_game", { lobbyId });
    await first;

    const myDraw = await viewWhere(host, (v) => v.phase === "DRAW" && v.turn === v.mySeat);
    const drew = next(host, "muushig_state", (v) => v.dealDraws.some((d) => d.seat === v.mySeat));
    host.emit("muushig_move", { lobbyId, move: { type: "drawForDeal", depth: myDraw.dealDeck.length + 1 } });
    expect((await next(host, "move_rejected")).reason).toMatch(/^Draw a card between 1 and/);
    host.emit("muushig_move", { lobbyId, move: { type: "drawForDeal", depth: 2 } });
    expect((await drew).dealDraws.find((d) => d.seat === myDraw.mySeat).depth).toBe(2);

    host.emit("muushig_move", { lobbyId, move: { type: "drawForDeal", depth: 1 } });
    expect((await next(host, "move_rejected")).reason).toMatch(/Not the DRAW phase|Not your turn/);
    // Thirteen's move event does nothing at a Muushig table.
    const before = host.muushig.length;
    host.emit("request_move", { lobbyId, action: "pass" });
    await new Promise((r) => setTimeout(r, 100));
    expect(host.muushig.slice(before).every((v) => v.events.every((e) => e.type !== "pass"))).toBe(true);
  });

  it("a whole online match plays to the end; only the host can rematch", async () => {
    const host = await guest("SOLOHOST");
    const lobbyId = await createMuushig(host);
    const stop = autoplay(host, lobbyId);
    const rejections = [];
    host.on("move_rejected", ({ reason }) => rejections.push(reason));
    const over = next(host, "muushig_state", (v) => v.phase === "MATCH_OVER", 25000);
    host.emit("start_game", { lobbyId });
    const final = await over;
    stop();
    expect(final.players.some((p) => p.score <= 0)).toBe(true);
    expect(final.matchWinner).not.toBeNull();
    expect(rejections).toEqual([]);

    const rematch = next(host, "muushig_state", (v) => v.matchNumber === 2);
    host.emit("request_rematch", { lobbyId });
    expect(await rematch).toMatchObject({ phase: "DRAW", roundNumber: 0 });
  }, 30000);

  it("a player who leaves mid-match is replaced by a CPU that plays on", async () => {
    const host = await guest("STAYS");
    const lobbyId = await createMuushig(host);
    const b = await guest("GOES");
    await joinLobby(b, lobbyId);
    const started = next(host, "muushig_state");
    host.emit("start_game", { lobbyId });
    await started;
    const stop = autoplay(host, lobbyId);
    const replaced = next(host, "muushig_state", (v) => v.players[1].type === "AI");
    b.emit("leave_lobby", { lobbyId });
    expect((await replaced).players[1].name).toBe("GOES (CPU)");
    // The match carries on through that seat: it gets past the draw for the deal.
    await viewWhere(host, (v) => v.roundNumber >= 1 && v.events.some((e) => e.type === "playIn" || e.type === "fold"), 15000);
    stop();
  }, 20000);
});
