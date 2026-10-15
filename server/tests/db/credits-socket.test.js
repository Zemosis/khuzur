// Credit tables over real sockets against Postgres: a spawned server, signed-in
// players buying in, playing, adding chips, leaving, closing, reconnecting,
// and a restart that sends every seat's credits home.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { io as connectClient } from "socket.io-client";
import { TEST_DATABASE_URL, loadDb, truncateAll, makePlayer } from "./setup.js";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = "credits-socket-secret";
const GRACE_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!TEST_DATABASE_URL)("credit tables over sockets (Postgres)", () => {
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
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_URL: TEST_DATABASE_URL,
        JWT_SECRET: SECRET,
        DISCONNECT_GRACE_MS: String(GRACE_MS),
        POKER_DELAY_MS: "5",
        POKER_TURN_MS: "60000",
        POKER_KICK_MS: "60000",
        CREDIT_RETRY_MS: "50",
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

  // Every test makes its own players, so tables from earlier tests can wind down alongside.
  const player = (opts) => makePlayer(m.pool, `P${++n}`, opts);
  const token = (id) => jwt.sign({ sub: id, email: `${id}@test.dev` }, SECRET);
  /** The balance; an account never opened yet holds the starting 1000. */
  const balance = async (id) => {
    const { rows } = await m.pool.query("select balance from credit_accounts where user_id = $1", [id]);
    return rows[0] ? Number(rows[0].balance) : 1000;
  };
  const seatRow = async (id) => (await m.pool.query("select stack::int, pending::int from credit_seats where user_id = $1", [id])).rows[0] ?? null;
  const economy = async () => (await import("../../credits/check.js")).economyCheck();
  const until = async (fn, ms = 8000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error("timed out");
      await sleep(20);
    }
  };

  async function client(userId) {
    const sock = connectClient(url, {
      auth: userId ? { token: token(userId) } : { name: "GUEST", tag: "9999" },
      forceNew: true,
      transports: ["websocket"],
    });
    sock.views = [];
    sock.on("poker_state", (v) => sock.views.push(v));
    open.push(sock);
    await new Promise((resolve, reject) => {
      sock.once("connect", resolve);
      sock.once("connect_error", reject);
    });
    return sock;
  }
  function waitFor(sock, event, test = () => true, ms = 8000) {
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
      if (event === "poker_state") {
        const seen = sock.views.find(test);
        if (seen) {
          clearTimeout(timer);
          return resolve(seen);
        }
      }
      sock.on(event, on);
    });
  }
  const latest = (sock) => sock.views.at(-1);
  async function hostTable(userId, { tier = "LOW", buyIn = 500 } = {}) {
    const sock = await client(userId);
    sock.emit("create_lobby", { gameType: "poker", tier, buyIn, lobbyName: "Felt" });
    const { lobbyId } = await waitFor(sock, "lobby_joined");
    await waitFor(sock, "poker_state", (v) => v.mySeat === 0 && !!v.seats[0]);
    return { sock, lobbyId };
  }
  async function joinTable(userId, lobbyId, buyIn = 500) {
    const sock = await client(userId);
    sock.emit("join_lobby", { lobbyId, buyIn });
    await waitFor(sock, "lobby_joined");
    await waitFor(sock, "poker_state", (v) => v.mySeat >= 0 && !!v.seats[v.mySeat]);
    return sock;
  }
  /** These sockets check or call whenever it's their turn. */
  const autoPlay = (lobbyId, ...socks) =>
    socks.forEach((sock) =>
      sock.on("poker_state", (v) => {
        if (v.legal && v.turn === v.mySeat) sock.emit("poker_move", { lobbyId, move: { type: v.legal.canCheck ? "check" : "call" } });
      }),
    );

  it("hosting a LOW table buys in: the balance drops, the seat holds the stack, and the list shows the tier", async () => {
    const ann = await player();
    const { sock, lobbyId } = await hostTable(ann);
    expect(latest(sock)).toMatchObject({ mySeat: 0, tier: "LOW", saving: false, closingAfterHand: false, smallBlind: 5, bigBlind: 10 });
    expect(latest(sock).seats[0]).toMatchObject({ stack: 500, waitingForBB: true, key: null });
    expect(await balance(ann)).toBe(500);
    const watcher = await client(null);
    watcher.emit("get_public_lobbies", { gameType: "poker" });
    const list = await waitFor(watcher, "public_lobbies_update", (l) => l.some((t) => t.id === lobbyId));
    expect(list.find((t) => t.id === lobbyId)).toMatchObject({ tier: "LOW", current: 1, max: 6 });
  });

  it("guests, email-only accounts and unknown tiers are turned away with a reason", async () => {
    const guest = await client(null);
    guest.emit("create_lobby", { gameType: "poker", tier: "LOW", buyIn: 500 });
    expect(await waitFor(guest, "error_message")).toBe("Sign in to play for credits");
    const emma = await client(await player({ linked: false }));
    emma.emit("create_lobby", { gameType: "poker", tier: "LOW", buyIn: 500 });
    expect(await waitFor(emma, "error_message")).toBe("Link Google or Discord to play for credits");
    emma.emit("create_lobby", { gameType: "poker", tier: "HUGE", buyIn: 500 });
    expect(await waitFor(emma, "error_message")).toBe("Pick LOW, MID or HIGH");
  });

  it("joining asks which buy-in first, and turns away amounts that aren't whole credits in range", async () => {
    const { lobbyId } = await hostTable(await player());
    const bob = await player();
    const b = await client(bob);
    b.emit("join_lobby", { lobbyId });
    expect(await waitFor(b, "credit_table_info")).toEqual({ lobbyId, name: "Felt", tier: "LOW" });
    for (const buyIn of ["500", 500.5, -10, 1e9]) {
      b.emit("join_lobby", { lobbyId, buyIn });
      expect(await waitFor(b, "error_message")).toMatch(/Pick an amount|minimum|maximum/);
    }
    expect(await balance(bob)).toBe(1000);
    expect(await seatRow(bob)).toBeNull();
    b.emit("join_lobby", { lobbyId, buyIn: 300 });
    await waitFor(b, "lobby_joined");
    expect(await balance(bob)).toBe(700);
  });

  it("two players play hands; leaving pays the stack out once, and the record says LOW", async () => {
    const ann = await player();
    const bob = await player();
    const { sock: a, lobbyId } = await hostTable(ann);
    const b = await joinTable(bob, lobbyId);
    autoPlay(lobbyId, a, b);
    a.emit("start_game", { lobbyId });
    await waitFor(a, "poker_state", (v) => v.handNumber >= 3, 15000);
    b.emit("leave_lobby", { lobbyId });
    await until(async () => !(await seatRow(bob)));
    const { rows } = await m.pool.query("select amount::int from credit_ledger where user_id = $1 and kind = 'cash_out'", [bob]);
    expect(rows).toHaveLength(1);
    expect(await balance(bob)).toBe(500 + rows[0].amount);
    a.emit("leave_lobby", { lobbyId });
    await until(async () => !(await seatRow(ann)));
    const session = await until(async () => (await m.pool.query("select status, poker_tier from game_sessions where lobby_code = $1 and status = 'finished'", [lobbyId])).rows[0]);
    expect(session).toEqual({ status: "finished", poker_tier: "LOW" });
    const { rows: players } = await m.pool.query("select player_id from game_players gp join game_sessions gs on gs.id = gp.session_id where gs.lobby_code = $1", [lobbyId]);
    expect(players.map((p) => p.player_id).sort()).toEqual([ann, bob].sort());
    expect((await economy()).ok).toBe(true);
  });

  it("ADD CHIPS lands before the next deal; mid-hand, or as a string, it's refused", async () => {
    const ann = await player();
    const { sock: a, lobbyId } = await hostTable(ann, { buyIn: 400 });
    await joinTable(await player(), lobbyId);
    a.emit("poker_add_chips", { lobbyId, amount: 300 });
    await waitFor(a, "poker_state", (v) => v.seats[0].pending === 300);
    expect(await balance(ann)).toBe(300);
    a.emit("poker_add_chips", { lobbyId, amount: "50" });
    expect((await waitFor(a, "move_rejected")).reason).toBe("Pick an amount");
    a.emit("poker_rebuy", { lobbyId });
    expect((await waitFor(a, "move_rejected")).reason).toBe("Use ADD CHIPS to rebuy at a credit table");
    a.emit("add_cpu", { lobbyId, seat: 3, level: "EASY" });
    expect((await waitFor(a, "move_rejected")).reason).toBe("Credit tables are for people only");
    a.emit("start_game", { lobbyId });
    const dealt = await waitFor(a, "poker_state", (v) => v.phase === "BETTING");
    expect(dealt.seats[0].stack + dealt.seats[0].committed).toBe(700);
    a.emit("poker_add_chips", { lobbyId, amount: 10 });
    expect((await waitFor(a, "move_rejected")).reason).toBe("Add chips between hands");
  });

  it("CLOSE TABLE lets the hand finish, then sends everyone home with their credits", async () => {
    const ann = await player();
    const bob = await player();
    const { sock: a, lobbyId } = await hostTable(ann);
    const b = await joinTable(bob, lobbyId);
    a.emit("start_game", { lobbyId });
    await waitFor(a, "poker_state", (v) => v.phase === "BETTING");
    a.emit("close_table", { lobbyId });
    await waitFor(b, "poker_state", (v) => v.closingAfterHand);
    const leftA = waitFor(a, "table_left", (d) => d.reason === "closed");
    const leftB = waitFor(b, "table_left", (d) => d.reason === "closed");
    autoPlay(lobbyId, a, b);
    a.emit("poker_move", { lobbyId, move: { type: "fold" } });
    b.emit("poker_move", { lobbyId, move: { type: "fold" } });
    await Promise.all([leftA, leftB]);
    await until(async () => !(await seatRow(ann)) && !(await seatRow(bob)));
    expect((await balance(ann)) + (await balance(bob))).toBe(2000);
    expect((await economy()).ok).toBe(true);
  });

  it("a browser that closes right after asking to buy in gets its credits back after the grace", async () => {
    const { lobbyId } = await hostTable(await player());
    const bob = await player();
    const b = await client(bob);
    b.emit("join_lobby", { lobbyId, buyIn: 400 });
    b.disconnect();
    await until(async () => {
      const { rows } = await m.pool.query("select kind from credit_ledger where user_id = $1 order by id", [bob]);
      return rows.map((r) => r.kind).join() === "grant,buy_in,cash_out";
    }, GRACE_MS + 5000);
    expect(await seatRow(bob)).toBeNull();
    expect(await balance(bob)).toBe(1000);
  });

  it("a refused buy-in leaves you watching the table list", async () => {
    const { lobbyId } = await hostTable(await player());
    const b = await client(await player());
    b.emit("get_public_lobbies", { gameType: "poker" });
    await waitFor(b, "public_lobbies_update", (l) => l.some((t) => t.id === lobbyId));
    b.emit("join_lobby", { lobbyId, buyIn: 50 });
    expect(await waitFor(b, "error_message")).toBe("This table's minimum is 200");
    const next = waitFor(b, "public_lobbies_update", (l) => l.some((t) => t.id !== lobbyId && t.tier === "MID"));
    const host2 = await client(await player());
    host2.emit("create_lobby", { gameType: "poker", tier: "MID", buyIn: 1000, lobbyName: "Felt" });
    await next;
  });

  it("LEAVE sent while the buy-in is still going through pays the credits straight back", async () => {
    const { lobbyId } = await hostTable(await player());
    const bob = await player();
    const b = await client(bob);
    b.emit("join_lobby", { lobbyId, buyIn: 400 });
    b.emit("leave_lobby", { lobbyId });
    await until(async () => {
      const { rows } = await m.pool.query("select kind from credit_ledger where user_id = $1 order by id", [bob]);
      return rows.map((r) => r.kind).join() === "grant,buy_in,cash_out";
    }, 4000);
    expect(await seatRow(bob)).toBeNull();
    expect(await balance(bob)).toBe(1000);
  });

  it("the same account in two tabs: LEAVE in one pays out once, and the other can't play on", async () => {
    const ann = await player();
    const { sock: tab1, lobbyId } = await hostTable(ann);
    await joinTable(await player(), lobbyId);
    const tab2 = await client(ann);
    tab2.emit("join_lobby", { lobbyId });
    await waitFor(tab2, "lobby_joined");
    tab2.emit("leave_lobby", { lobbyId });
    await until(async () => !(await seatRow(ann)));
    tab1.emit("poker_add_chips", { lobbyId, amount: 100 });
    tab1.emit("leave_lobby", { lobbyId });
    await sleep(300);
    const { rows } = await m.pool.query("select kind from credit_ledger where user_id = $1 order by id", [ann]);
    expect(rows.map((r) => r.kind)).toEqual(["grant", "buy_in", "cash_out"]);
    expect(await balance(ann)).toBe(1000);
  });

  it("LEAVE from an older tab of the same account still leaves, and the newer tab is told", async () => {
    const ann = await player();
    const { sock: tab1, lobbyId } = await hostTable(ann);
    await joinTable(await player(), lobbyId);
    const tab2 = await client(ann);
    tab2.emit("join_lobby", { lobbyId });
    await waitFor(tab2, "lobby_joined");
    const told = waitFor(tab2, "table_left", (d) => d.reason === "left");
    tab1.emit("leave_lobby", { lobbyId });
    await told;
    await until(async () => !(await seatRow(ann)));
    expect(await balance(ann)).toBe(1000);
  });

  it("reconnecting mid-hand finds your seat, your cards and your stack", async () => {
    const ann = await player();
    const { sock: a, lobbyId } = await hostTable(ann);
    await joinTable(await player(), lobbyId);
    a.emit("start_game", { lobbyId });
    const during = await waitFor(a, "poker_state", (v) => v.phase === "BETTING");
    a.disconnect();
    const again = await client(ann);
    again.emit("join_lobby", { lobbyId });
    const v = await waitFor(again, "poker_state", (x) => x.mySeat === 0 && x.handNumber === during.handNumber);
    expect(v.seats[0].hole.every((c) => c.id)).toBe(true);
    expect(v.seats[0].stack).toBe(during.seats[0].stack);
  });

  it("told to stop (a deploy), the server sends every seat home before it exits", async () => {
    const ann = await player();
    const bob = await player();
    const { sock: a, lobbyId } = await hostTable(ann, { buyIn: 600 });
    await joinTable(bob, lobbyId, 400);
    a.emit("start_game", { lobbyId });
    await waitFor(a, "poker_state", (v) => v.phase === "BETTING");
    const exited = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    await exited;
    // Before any new server boots: nothing left at a table, everyone paid at the stack their hand started with.
    expect(await seatRow(ann)).toBeNull();
    expect([await balance(ann), await balance(bob)]).toEqual([1000, 1000]);
    const { rows } = await m.pool.query("select kind from credit_ledger where user_id = $1 order by id desc limit 1", [ann]);
    expect(rows[0].kind).toBe("restart_return");
    await startServer();
    const me = await (await fetch(`${url}/api/credits/me`, { headers: { Authorization: `Bearer ${token(ann)}` } })).json();
    expect(me.notice).toEqual({ amount: 600, tableName: "Felt" });
  });

  // Last: it restarts the server.
  it("a restart mid-hand sends every seat home at the stack its hand started with, and says so until dismissed", async () => {
    const ann = await player();
    const bob = await player();
    const { sock: a, lobbyId } = await hostTable(ann, { buyIn: 600 });
    await joinTable(bob, lobbyId, 400);
    a.emit("start_game", { lobbyId });
    await waitFor(a, "poker_state", (v) => v.phase === "BETTING");
    const exited = new Promise((r) => server.once("exit", r));
    server.kill("SIGKILL");
    await exited;
    await startServer();
    expect([await balance(ann), await balance(bob)]).toEqual([1000, 1000]);
    expect(await seatRow(ann)).toBeNull();
    const me = await (await fetch(`${url}/api/credits/me`, { headers: { Authorization: `Bearer ${token(ann)}` } })).json();
    expect(me.notice).toEqual({ amount: 600, tableName: "Felt" });
    const again = await (await fetch(`${url}/api/credits/me`, { headers: { Authorization: `Bearer ${token(ann)}` } })).json();
    expect(again.notice).toEqual({ amount: 600, tableName: "Felt" });
    const dismissed = await (await fetch(`${url}/api/credits/notice`, { method: "POST", headers: { Authorization: `Bearer ${token(ann)}` } })).json();
    expect(dismissed.notice).toBeNull();
    expect((await economy()).ok).toBe(true);
  });
});
