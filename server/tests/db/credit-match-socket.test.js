// Credit matches (Muushig, Thirteen) over real sockets against Postgres: a
// spawned server, signed-in players staking, the waiting table, matches
// played out by the players themselves, leaving and coming back, forfeiting,
// playing again, and a restart that sends every stake home.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { io as connectClient } from "socket.io-client";
import { TEST_DATABASE_URL, loadDb, truncateAll, makePlayer } from "./setup.js";
import { aiAction } from "../../game/muushig/ai.js";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = "credit-muushig-secret";
const GRACE_MS = 300;
const ACTION_PHASES = new Set(["DRAW", "DECIDE", "SWAP", "TRUMP", "PLAY"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!TEST_DATABASE_URL)("credit matches over sockets (Postgres)", () => {
  let m;
  let server;
  let port;
  let url;
  let n = 0;
  const open = [];

  const freePort = () =>
    new Promise((resolve) => {
      const s = net.createServer().listen(0, () => {
        const { port: p } = s.address();
        s.close(() => resolve(p));
      });
    });

  async function startServer() {
    server = spawn(process.execPath, ["index.js"], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: String(port), DATABASE_URL: TEST_DATABASE_URL, JWT_SECRET: SECRET, DISCONNECT_GRACE_MS: String(GRACE_MS), MUUSHIG_DELAY_MS: "1", AI_TURN_DELAY_MS: "2", DEAL_DELAY_MS: "2", ROUND_END_DELAY_MS: "2", CREDIT_RETRY_MS: "50" },
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
      server.once("exit", (code) => reject(new Error(`server exited with ${code}`)));
    });
  }

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
    await truncateAll(m.pool);
    port = await freePort();
    url = `http://localhost:${port}`;
    await startServer();
  });
  afterEach(() => {
    while (open.length) open.pop().disconnect();
  });
  afterAll(async () => {
    server?.kill();
    await m?.pool.end();
  });

  const player = (opts) => makePlayer(m.pool, `M${++n}`, opts);
  const token = (id) => jwt.sign({ sub: id, email: `${id}@test.dev` }, SECRET);
  const balance = async (id) => {
    const { rows } = await m.pool.query("select balance from credit_accounts where user_id = $1", [id]);
    return rows[0] ? Number(rows[0].balance) : 1000;
  };
  const economy = async () => (await import("../../credits/check.js")).economyCheck();
  const me = async (id) => (await fetch(`${url}/api/credits/me`, { headers: { Authorization: `Bearer ${token(id)}` } })).json();

  async function client(userId) {
    const sock = connectClient(url, { auth: userId ? { token: token(userId) } : { name: "GUEST", tag: "9999" }, forceNew: true, transports: ["websocket"] });
    sock.views = [];
    sock.tables = [];
    sock.on("muushig_state", (v) => sock.views.push(v));
    sock.on("game_state_update", (v) => sock.views.push(v));
    sock.logs = [];
    sock.on("receive_chat", (msg) => msg.type === "SYSTEM" && sock.logs.push(msg));
    sock.on("table_update", (t) => sock.tables.push(t));
    open.push(sock);
    await new Promise((resolve, reject) => {
      sock.once("connect", resolve);
      sock.once("connect_error", reject);
    });
    return sock;
  }
  /** The next `event` passing `test`; for states and tables, one already seen counts. */
  function waitFor(sock, event, test = () => true, ms = 20000) {
    const seen = { muushig_state: sock.views, game_state_update: sock.views, table_update: sock.tables, receive_chat: sock.logs }[event]?.findLast(test);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        sock.off(event, on);
        reject(new Error(`timed out waiting for ${event}`));
      }, ms);
      const on = (data) => {
        if (!test(data)) return;
        clearTimeout(timer);
        sock.off(event, on);
        resolve(data);
      };
      sock.on(event, on);
    });
  }
  async function host(userId, { tier = "LOW", buyIn = 100, isPrivate = false, gameType = "muushig" } = {}) {
    const sock = await client(userId);
    sock.emit("create_lobby", { gameType, tier, buyIn, lobbyName: "Ger", isPrivate });
    const { lobbyId } = await waitFor(sock, "lobby_joined");
    await waitFor(sock, "table_update", (t) => t.mySeat === 0);
    return { sock, lobbyId };
  }
  async function join(userId, lobbyId, buyIn = 100) {
    const sock = await client(userId);
    sock.emit("join_lobby", { lobbyId, buyIn });
    await waitFor(sock, "lobby_joined");
    return sock;
  }
  /** Plays this socket's turns with the CPU's own choice, read off its view. */
  const autoplay = (sock, lobbyId) => {
    let last = null;
    const play = (v) => {
      if (!ACTION_PHASES.has(v.phase) || v.turn !== v.mySeat) return;
      const key = `${v.roundNumber}:${v.events.length}`;
      if (key === last) return;
      last = key;
      const { seat: _seat, ...move } = aiAction(v);
      setTimeout(() => sock.emit("muushig_move", { lobbyId, move }), v.dealMsLeft);
    };
    sock.on("muushig_state", play);
    if (sock.views.length) play(sock.views.at(-1));
  };
  const settled = (v) => !!v.credit?.result;

  it("hosting stakes: the balance drops 100, the table shows the pot, and the list shows the stake", async () => {
    const ann = await player();
    const { sock, lobbyId } = await host(ann);
    expect(await balance(ann)).toBe(900);
    expect(sock.tables.at(-1).credit).toMatchObject({ tier: "LOW", stake: 100, pot: 100, staked: 1, deciding: 0 });
    const watcher = await client(null);
    watcher.emit("get_public_lobbies", { gameType: "muushig" });
    const list = await waitFor(watcher, "public_lobbies_update", (l) => l.some((t) => t.id === lobbyId));
    expect(list.find((t) => t.id === lobbyId)).toMatchObject({ tier: "LOW", stake: 100, current: 1, max: 5 });
  });

  it("turns away guests, email-only accounts, unknown tiers and a balance under the stake", async () => {
    const guest = await client(null);
    guest.emit("create_lobby", { gameType: "muushig", tier: "LOW", buyIn: 100 });
    expect(await waitFor(guest, "error_message")).toBe("Sign in to play for credits");
    const emma = await client(await player({ linked: false }));
    emma.emit("create_lobby", { gameType: "muushig", tier: "LOW", buyIn: 100 });
    expect(await waitFor(emma, "error_message")).toBe("Link Google or Discord to play for credits");
    emma.emit("create_lobby", { gameType: "muushig", tier: "HUGE", buyIn: 100 });
    expect(await waitFor(emma, "error_message")).toBe("Pick LOW, MID or HIGH");
    const fay = await client(await player());
    fay.emit("create_lobby", { gameType: "muushig", tier: "HIGH", buyIn: 2000 });
    expect(await waitFor(fay, "error_message")).toBe("Your balance is 1,000; this table's stake is 2,000");
  });

  it("joining asks for the stake first, refuses another amount, and the pot grows", async () => {
    const { sock: a, lobbyId } = await host(await player(), { tier: "MID", buyIn: 500 });
    const bob = await player();
    const b = await client(bob);
    b.emit("join_lobby", { lobbyId });
    expect(await waitFor(b, "credit_table_info")).toEqual({ lobbyId, name: "Ger", tier: "MID", gameType: "muushig", stake: 500 });
    b.emit("join_lobby", { lobbyId, buyIn: 100 });
    expect(await waitFor(b, "error_message")).toBe("This table's stake is 500");
    expect(await balance(bob)).toBe(1000);
    b.emit("join_lobby", { lobbyId, buyIn: 500 });
    await waitFor(b, "lobby_joined");
    expect(await balance(bob)).toBe(500);
    expect((await waitFor(a, "table_update", (t) => t.credit.staked === 2)).credit.pot).toBe(1000);
  });

  it("the host can't seat CPUs, and START needs 2 staked", async () => {
    const { sock: a, lobbyId } = await host(await player());
    a.emit("add_cpu", { lobbyId, seat: 1, level: "EASY" });
    expect(await waitFor(a, "move_rejected")).toEqual({ reason: "Credit tables seat Hard bots" });
    a.emit("start_game", { lobbyId });
    expect(await waitFor(a, "move_rejected")).toEqual({ reason: "Needs 2 players with stakes in" });
  });

  it("standing up before the deal gives the stake back; the last one out closes the table", async () => {
    const ann = await player();
    const bob = await player();
    const { sock: a, lobbyId } = await host(ann);
    const b = await join(bob, lobbyId);
    b.emit("leave_lobby", { lobbyId });
    await waitFor(a, "table_update", (t) => t.credit.staked === 1);
    await until(async () => (await balance(bob)) === 1000);
    a.emit("leave_lobby", { lobbyId });
    await until(async () => (await balance(ann)) === 1000);
    const c = await client(await player());
    c.emit("join_lobby", { lobbyId, buyIn: 100 });
    expect(await waitFor(c, "error_message")).toBe("Lobby not found");
    expect((await economy()).ok).toBe(true);
  });

  it("a full match: Hard CPUs fill the seats, the winner takes the pot, then PLAY AGAIN stakes the next one", async () => {
    const ann = await player();
    const bob = await player();
    const { sock: a, lobbyId } = await host(ann);
    const b = await join(bob, lobbyId);
    autoplay(a, lobbyId);
    autoplay(b, lobbyId);
    a.emit("start_game", { lobbyId });
    const first = await waitFor(a, "muushig_state");
    expect(first.players.map((p) => p.level)).toEqual([null, null, "HARD", "HARD", "HARD"]);
    expect(first.credit).toMatchObject({ stake: 100, pot: 200, staked: 2 });
    const end = await waitFor(a, "muushig_state", settled, 60000);
    const { payouts, cpuTake, pot } = end.credit.result;
    expect(pot).toBe(200);
    const paid = Object.fromEntries(payouts.map((p) => [p.seat, p.amount]));
    expect([await balance(ann), await balance(bob)]).toEqual([900 + (paid[0] ?? 0), 900 + (paid[1] ?? 0)]);
    expect(payouts.reduce((t, p) => t + p.amount, 0) + cpuTake).toBe(200);
    expect(await economy()).toMatchObject({ ok: true });
    // Back at the waiting table, nobody seated until they stake again.
    const waiting = await waitFor(a, "table_update", (t) => t.mySeat == null && t.credit.deciding === 2);
    expect(waiting.credit).toMatchObject({ staked: 0, pot: 0 });
    b.tables.length = 0;
    b.emit("credit_restake", { lobbyId });
    const bobBack = await waitFor(b, "table_update", (t) => t.mySeat != null);
    expect(bobBack).toMatchObject({ isHost: true, credit: { staked: 1, deciding: 1 } });
    a.emit("credit_restake", { lobbyId });
    await waitFor(b, "table_update", (t) => t.credit.staked === 2);
    expect(await balance(ann)).toBe(800 + (paid[0] ?? 0));
  }, 90000);

  it("leaving mid-match: a Hard CPU covers the seat, /me offers the way back, and coming back takes it again", async () => {
    const ann = await player();
    const bob = await player();
    const { sock: a, lobbyId } = await host(ann);
    const b = await join(bob, lobbyId);
    a.emit("start_game", { lobbyId });
    await waitFor(b, "muushig_state");
    b.emit("leave_lobby", { lobbyId });
    const covered = await waitFor(a, "muushig_state", (v) => v.players[1].type === "AI");
    expect(covered.players[1].level).toBe("HARD");
    expect(covered.credit.seats[1]).toMatchObject({ away: true, forfeited: false, roundsLeft: 2 });
    const bobName = covered.players[1].name.replace(" (CPU)", "");
    expect(await waitFor(a, "receive_chat", (l) => l.tone === "away")).toMatchObject({
      type: "SYSTEM",
      kind: "table",
      text: `${bobName} left. A Hard bot plays their seat: they have 2 rounds to come back.`,
    });
    expect(await balance(bob)).toBe(900);
    expect((await me(bob)).rejoin).toEqual({ gameType: "muushig", code: lobbyId.replace("PUB-", ""), tableName: "Ger" });
    const stranger = await client(await player());
    stranger.emit("join_lobby", { lobbyId, buyIn: 100 });
    expect(await waitFor(stranger, "error_message")).toBe("This table's match is under way. Try again when it ends");
    const back = await client(bob);
    back.emit("join_lobby", { lobbyId });
    await waitFor(back, "lobby_joined");
    const seated = await waitFor(back, "muushig_state", (v) => v.mySeat === 1 && v.players[1].type === "HUMAN");
    expect(seated.credit.seats[1]).toMatchObject({ away: false });
    expect((await waitFor(a, "receive_chat", (l) => l.tone === "back")).text).toBe(`${bobName} is back in their seat.`);
    expect((await me(bob)).rejoin).toBeNull();
  });

  it("away for 2 rounds forfeits the seat: no way back", async () => {
    const ann = await player();
    const bob = await player();
    const { sock: a, lobbyId } = await host(ann);
    const b = await join(bob, lobbyId);
    autoplay(a, lobbyId);
    a.emit("start_game", { lobbyId });
    await waitFor(b, "muushig_state");
    b.emit("leave_lobby", { lobbyId });
    const covered = await waitFor(a, "muushig_state", (v) => v.players[1].type === "AI");
    const seen = await waitFor(a, "muushig_state", (v) => v.credit.seats?.[1]?.forfeited || settled(v), 60000);
    if (settled(seen)) {
      // The match ended before the CPU had finished 2 rounds for him: the seat was still his.
      expect(seen.roundNumber - covered.roundNumber).toBeLessThan(2);
      return;
    }
    expect(seen.roundNumber - covered.roundNumber).toBeGreaterThanOrEqual(1);
    expect((await waitFor(a, "receive_chat", (l) => l.tone === "gone")).text).toMatch(/^M\d+ was away 2 rounds: the seat is the bot's now, and the stake stays in the pot\.$/);
    expect((await me(bob)).rejoin).toBeNull();
    const back = await client(bob);
    back.emit("join_lobby", { lobbyId });
    expect(await waitFor(back, "error_message")).toBe("This table's match is under way. Try again when it ends");
    // A forfeited seat that wins pays nobody.
    const end = await waitFor(a, "muushig_state", settled, 60000);
    expect(end.credit.result.payouts.some((p) => p.seat === 1)).toBe(false);
  }, 90000);

  describe("Thirteen", () => {
    const lowest = (hand) => [...hand].sort((a, b) => a.rankValue * 4 + a.suitValue - (b.rankValue * 4 + b.suitValue))[0];
    /** Plays this socket's Thirteen turns: lead the lowest card, else pass. */
    const autoplay13 = (sock, lobbyId) => {
      let last = null;
      const play = (s) => {
        const me = s.players?.findIndex((p) => p.socketId === sock.id);
        if (s.gameState !== "PLAYING" || me < 0 || s.currentPlayerIndex !== me) return;
        const key = `${s.roundNumber}:${s.moveHistory.length}`;
        if (key === last) return;
        last = key;
        setTimeout(() => {
          if (s.currentPlay) sock.emit("request_move", { lobbyId, action: "pass" });
          else sock.emit("request_move", { lobbyId, action: "play", data: { cards: [lowest(s.players[me].hand).id] } });
        }, s.dealMsLeft);
      };
      sock.on("game_state_update", play);
      if (sock.views.length) play(sock.views.at(-1));
    };
    const host13 = (id, opts) => host(id, { ...opts, gameType: "thirteen" });

    it("is for people only: no CPUs, and the list and table show the stake", async () => {
      const { sock: a, lobbyId } = await host13(await player(), { tier: "MID", buyIn: 500 });
      expect(a.tables.at(-1).credit).toMatchObject({ tier: "MID", stake: 500, pot: 500, botsFill: false });
      a.emit("add_cpu", { lobbyId, seat: 1, level: "HARD" });
      expect(await waitFor(a, "move_rejected")).toEqual({ reason: "Credit tables are for people only" });
      const b = await client(await player());
      b.emit("join_lobby", { lobbyId });
      expect(await waitFor(b, "credit_table_info")).toEqual({ lobbyId, name: "Ger", tier: "MID", gameType: "thirteen", stake: 500 });
    });

    it("two players play it out: only they are dealt in, the last one standing takes the pot", async () => {
      const ann = await player();
      const bob = await player();
      const { sock: a, lobbyId } = await host13(ann);
      const b = await join(bob, lobbyId);
      autoplay13(a, lobbyId);
      autoplay13(b, lobbyId);
      a.emit("start_game", { lobbyId });
      const first = await waitFor(a, "game_state_update");
      expect(first.players).toHaveLength(2);
      expect(first.credit).toMatchObject({ stake: 100, pot: 200, staked: 2, botsFill: false });
      const end = await waitFor(a, "game_state_update", settled, 60000);
      const winner = end.players.findIndex((p) => !p.isEliminated);
      expect(end.credit.result).toMatchObject({ pot: 200, payouts: [{ seat: winner, amount: 200 }], cpuTake: 0, winners: [winner] });
      const winnerId = end.players[winner].socketId === a.id ? ann : bob;
      expect(await balance(winnerId)).toBe(1100);
      expect(await balance(winnerId === ann ? bob : ann)).toBe(900);
      expect(await economy()).toMatchObject({ ok: true });
      b.tables.length = 0;
      b.emit("credit_restake", { lobbyId });
      expect(await waitFor(b, "table_update", (t) => t.mySeat != null)).toMatchObject({ credit: { staked: 1, botsFill: false } });
    }, 90000);

    it("a player who leaves mid-match is covered by a Hard CPU, and can come back", async () => {
      const ann = await player();
      const bob = await player();
      const { sock: a, lobbyId } = await host13(ann);
      const b = await join(bob, lobbyId);
      a.emit("start_game", { lobbyId });
      await waitFor(b, "game_state_update");
      b.emit("leave_lobby", { lobbyId });
      const covered = await waitFor(a, "game_state_update", (s) => s.players[1].type === "AI");
      expect(covered.players[1].level).toBe("HARD");
      expect(covered.credit.seats[1]).toMatchObject({ away: true, roundsLeft: 2 });
      const back = await client(bob);
      back.emit("join_lobby", { lobbyId });
      await waitFor(back, "lobby_joined");
      const seated = await waitFor(back, "game_state_update", (s) => s.players[1].type === "HUMAN" && s.players[1].socketId === back.id);
      expect(seated.credit.seats[1]).toMatchObject({ away: false });
    });
  });

  // Last: it restarts the server.
  it("a restart mid-match sends every stake home and says so", async () => {
    const ann = await player();
    const bob = await player();
    const { sock: a, lobbyId } = await host(ann, { tier: "MID", buyIn: 500 });
    await join(bob, lobbyId, 500);
    a.emit("start_game", { lobbyId });
    await waitFor(a, "muushig_state");
    const exited = new Promise((r) => server.once("exit", r));
    server.kill("SIGKILL");
    await exited;
    await startServer();
    expect([await balance(ann), await balance(bob)]).toEqual([1000, 1000]);
    expect((await me(bob)).notice).toEqual({ amount: 500, tableName: "Ger" });
    expect((await economy()).ok).toBe(true);
  });

  async function until(fn, ms = 8000) {
    const end = Date.now() + ms;
    for (;;) {
      if (await fn()) return;
      if (Date.now() > end) throw new Error("timed out");
      await sleep(20);
    }
  }
});
