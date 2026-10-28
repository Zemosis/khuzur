// Credit blackjack over real sockets against Postgres: a spawned server,
// signed-in players at HOUSE tables, bets from the balance, leaving, one credit
// table at a time, a bet refused as betting closes, and an admin freeze.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { io as connectClient } from "socket.io-client";
import { TEST_DATABASE_URL, loadDb, truncateAll, makePlayer } from "./setup.js";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = "blackjack-socket-secret";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!TEST_DATABASE_URL)("credit blackjack over sockets (Postgres)", () => {
  let m;
  let server;
  let url;
  let admin;
  let n = 0;
  const open = [];

  const freePort = () =>
    new Promise((resolve) => {
      const s = net.createServer().listen(0, () => {
        const { port } = s.address();
        s.close(() => resolve(port));
      });
    });

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
    await truncateAll(m.pool);
    admin = await makePlayer(m.pool, "ADMIN");
    const port = await freePort();
    url = `http://localhost:${port}`;
    server = spawn(process.execPath, ["index.js"], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_URL: TEST_DATABASE_URL,
        JWT_SECRET: SECRET,
        ADMIN_USER_IDS: admin,
        DISCONNECT_GRACE_MS: "400",
        BLACKJACK_DELAY_MS: "5",
        BLACKJACK_TURN_MS: "200",
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
  });
  afterEach(() => {
    while (open.length) open.pop().disconnect();
  });
  afterAll(async () => {
    server?.kill();
    await m?.pool.end();
  });

  const player = () => makePlayer(m.pool, `BJ${++n}`);
  const token = (id) => jwt.sign({ sub: id, email: `${id}@test.dev` }, SECRET);
  const balance = async (id) => {
    const { rows } = await m.pool.query("select balance from credit_accounts where user_id = $1", [id]);
    return rows[0] ? Number(rows[0].balance) : 1000;
  };
  const seatRow = async (id) => (await m.pool.query("select stack::int, tier, game_type from credit_seats where user_id = $1", [id])).rows[0] ?? null;
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
    const sock = connectClient(url, { auth: { token: token(userId) }, forceNew: true, transports: ["websocket"] });
    sock.views = [];
    sock.on("blackjack_state", (v) => sock.views.push(v));
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
      if (event === "blackjack_state") {
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
  async function hostHouse(userId) {
    const sock = await client(userId);
    sock.emit("create_lobby", { gameType: "blackjack", tier: "HOUSE", lobbyName: "Pit" });
    const { lobbyId } = await waitFor(sock, "lobby_joined");
    await waitFor(sock, "blackjack_state", (v) => v.mySeat === 0 && v.phase === "BETTING");
    return { sock, lobbyId };
  }

  it("a HOUSE table seats the host on their balance with a seat row holding 0; a round settles to the balance, and leaving clears the seat", async () => {
    const ann = await player();
    const { sock, lobbyId } = await hostHouse(ann);
    expect(latest(sock)).toMatchObject({ credit: true, saving: false, closingAfterRound: false });
    expect(latest(sock).seats[0]).toMatchObject({ bankroll: 1000 });
    expect(await seatRow(ann)).toEqual({ stack: 0, tier: "HOUSE", game_type: "blackjack" });
    sock.emit("bj_bet", { lobbyId, amount: 100 });
    sock.emit("bj_ready", { lobbyId });
    const over = await waitFor(sock, "blackjack_state", (v) => v.phase === "ROUND_OVER");
    const p = over.seats[0];
    const net = p.hands.reduce((s, h) => s + h.payout - h.bet, 0);
    const next = await waitFor(sock, "blackjack_state", (v) => v.phase === "BETTING" && v.roundNumber === over.roundNumber, 10000);
    expect(next.seats[0].bankroll).toBe(1000 + net);
    expect(await balance(ann)).toBe(1000 + net);
    expect(await seatRow(ann)).toMatchObject({ stack: 0 });
    sock.emit("leave_lobby", { lobbyId });
    await until(async () => (await seatRow(ann)) === null);
    const { rows: [session] } = await m.pool.query("select id, game_type, credit_tier from game_sessions where lobby_code = $1", [lobbyId]);
    expect(session).toMatchObject({ game_type: "blackjack", credit_tier: "HOUSE" });
    const row = await until(async () => (await m.pool.query("select final_score, stats from game_players where session_id = $1 and player_id = $2", [session.id, ann])).rows[0]);
    expect(row.final_score).toBe(net);
    expect(row.stats).toMatchObject({ rounds_played: 1, net });
    const { rows: [round] } = await m.pool.query("select winner_seat, highlights from game_rounds where session_id = $1", [session.id]);
    expect(round).toEqual({ winner_seat: null, highlights: [{ type: "dealer", cards: over.dealer.cards.map((c) => c.id), total: over.dealerTotal }] });
    expect((await economy()).ok).toBe(true);
  });

  it("seated at a HOUSE table counts as your one credit table", async () => {
    const { lobbyId } = await hostHouse(await player());
    const bob = await player();
    await hostHouse(bob);
    const b2 = await client(bob);
    b2.emit("join_lobby", { lobbyId });
    expect(await waitFor(b2, "error_message")).toMatch(/table/i);
    expect((await m.pool.query("select count(*)::int as n from credit_seats where user_id = $1", [bob])).rows[0].n).toBe(1);
  });

  it("a guest can't host a HOUSE table, and HOUSE is no tier for poker", async () => {
    const guest = connectClient(url, { auth: { name: "GUEST", tag: "9999" }, forceNew: true, transports: ["websocket"] });
    open.push(guest);
    await new Promise((resolve) => guest.once("connect", resolve));
    guest.emit("create_lobby", { gameType: "blackjack", tier: "HOUSE" });
    expect(await waitFor(guest, "error_message")).toBe("Sign in to play for credits");
    const cat = await client(await player());
    cat.emit("create_lobby", { gameType: "poker", tier: "HOUSE", buyIn: 500 });
    expect(await waitFor(cat, "error_message")).toBe("Pick LOW, MID or HIGH");
  });

  it("an admin freeze stands a blackjack player up and clears their seat row", async () => {
    const dan = await player();
    const { sock } = await hostHouse(dan);
    const left = waitFor(sock, "table_left"); // sent before the response
    const res = await fetch(`${url}/api/admin/freeze`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token(admin)}` },
      body: JSON.stringify({ userId: dan, frozen: true, note: "test" }),
    });
    expect(res.status).toBe(200);
    expect(await left).toEqual({ reason: "frozen" });
    expect(await seatRow(dan)).toBeNull();
    expect(await balance(dan)).toBe(1000);
  });

  it("a bet the balance no longer covers is refused as betting closes, with the reason", async () => {
    const eve = await player();
    const { sock, lobbyId } = await hostHouse(eve);
    sock.emit("bj_bet", { lobbyId, amount: 100 });
    await waitFor(sock, "blackjack_state", (v) => v.seats[0].bet === 100);
    // Spent elsewhere meanwhile (another tab's shop, say).
    const before = await balance(eve);
    await m.pool.query("insert into credit_accounts (user_id, balance) values ($1, 50) on conflict (user_id) do update set balance = 50", [eve]);
    sock.emit("bj_ready", { lobbyId });
    expect((await waitFor(sock, "move_rejected")).reason).toBe("Your balance is 50");
    expect(await seatRow(eve)).toMatchObject({ stack: 0 });
    await m.pool.query("update credit_accounts set balance = $2 where user_id = $1", [eve, before]);
  });
});
