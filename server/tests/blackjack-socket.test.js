// Blackjack over real sockets: starts server/index.js on a free port with the
// database off and fast timers, then hosts, joins, bets, plays, leaves and
// rejoins free blackjack tables with real socket.io clients. The shoe is
// random, so tests that need a moment (your turn) play rounds until it comes.

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io as connectClient } from "socket.io-client";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IN_ROUND = ["DEALING", "INSURANCE", "TURNS", "DEALER"];

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
      JWT_SECRET: "blackjack-socket-secret",
      DISCONNECT_GRACE_MS: "400",
      BLACKJACK_DELAY_MS: "5",
      BLACKJACK_TURN_MS: "200",
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

let count = 0;
async function guest(name = `B${++count}`, tag = String(3000 + count)) {
  const sock = connectClient(url, { auth: { name, tag }, forceNew: true, transports: ["websocket"] });
  sock.identity = { name, tag };
  sock.views = [];
  sock.on("blackjack_state", (v) => sock.views.push(v));
  open.push(sock);
  await new Promise((resolve, reject) => {
    sock.once("connect", resolve);
    sock.once("connect_error", reject);
  });
  return sock;
}

/** Resolves with the first event (or blackjack_state view, seen ones included) passing `test`. */
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
/** Like waitFor, but only views arriving from now on. */
function nextState(sock, test = () => true, ms = 8000) {
  const from = sock.views.length;
  return waitFor(sock, "blackjack_state", (v) => sock.views.indexOf(v) >= from && test(v), ms);
}
const latest = (sock) => sock.views.at(-1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function host() {
  const sock = await guest();
  sock.emit("create_lobby", { lobbyName: "Felt", gameType: "blackjack" });
  const { lobbyId } = await waitFor(sock, "lobby_joined");
  await waitFor(sock, "blackjack_state", (v) => v.mySeat === 0 && v.phase === "BETTING");
  return { sock, lobbyId };
}

async function join(lobbyId) {
  const sock = await guest();
  sock.emit("join_lobby", { lobbyId });
  await waitFor(sock, "lobby_joined");
  await waitFor(sock, "blackjack_state", (v) => v.mySeat >= 0 && !!v.seats[v.mySeat]);
  return sock;
}

/** Bets `amount` and presses READY once in every betting window from now on. Returns a stop function. */
function autoBet(sock, lobbyId, amount = 100) {
  let lastRound = null;
  const on = (v) => {
    if (v.phase !== "BETTING" || v.mySeat < 0 || !v.seats[v.mySeat] || lastRound === v.roundNumber) return;
    if (v.seats[v.mySeat].bankroll < amount) return;
    lastRound = v.roundNumber;
    sock.emit("bj_bet", { lobbyId, amount });
    sock.emit("bj_ready", { lobbyId });
  };
  sock.on("blackjack_state", on);
  const now = latest(sock);
  if (now) on(now);
  return () => sock.off("blackjack_state", on);
}

const myTurn = (v) => v.phase === "TURNS" && v.turn?.seat === v.mySeat && v.legal.stand;

describe("blackjack tables online", () => {
  it("creating a free table seats the host with 1,000 chips and opens betting", async () => {
    const { sock } = await host();
    const v = latest(sock);
    expect(v).toMatchObject({ mySeat: 0, phase: "BETTING", amHost: true, credit: false, saving: false, closingAfterRound: false });
    expect(v.seats[0]).toMatchObject({ name: expect.stringMatching(/^B\d+ #\d+$/), bankroll: 1000, bet: 0 });
    expect(v.seats[0]).not.toHaveProperty("key");
    expect(v.seats.slice(1)).toEqual([null, null, null, null]);
    expect(v.phaseMsLeft).toBeGreaterThan(0);
    expect(v).not.toHaveProperty("shoe");
  });

  it("two players bet, READY deals at once, and the round settles into the next betting window", async () => {
    const { sock, lobbyId } = await host();
    const other = await join(lobbyId);
    expect(latest(other).mySeat).toBe(1);
    const start = latest(sock).roundNumber;
    const t0 = Date.now();
    sock.emit("bj_bet", { lobbyId, amount: 100 });
    other.emit("bj_bet", { lobbyId, amount: 50 });
    await waitFor(sock, "blackjack_state", (v) => v.seats[0].bet === 100 && v.seats[1].bet === 50);
    sock.emit("bj_ready", { lobbyId });
    other.emit("bj_ready", { lobbyId });
    // The betting window is 15 s: dealing well before then means READY closed it.
    await waitFor(sock, "blackjack_state", (v) => IN_ROUND.includes(v.phase) || v.phase === "ROUND_OVER");
    expect(Date.now() - t0).toBeLessThan(3000);
    const over = await waitFor(sock, "blackjack_state", (v) => v.phase === "ROUND_OVER");
    expect(over.roundNumber).toBe(start + 1);
    expect(over.dealer.revealed).toBe(true);
    for (const seat of [0, 1]) {
      const p = over.seats[seat];
      expect(p.hands.length).toBeGreaterThan(0);
      expect(p.hands.every((h) => h.result != null)).toBe(true);
    }
    const next = await waitFor(sock, "blackjack_state", (v) => v.phase === "BETTING" && v.roundNumber === over.roundNumber);
    for (const [seat, bet] of [
      [0, 100],
      [1, 50],
    ]) {
      const p = over.seats[seat];
      expect(p.insurance || 0).toBe(0); // nobody answered insurance: declined
      const staked = p.hands.reduce((s, h) => s + h.bet, 0);
      const paid = p.hands.reduce((s, h) => s + h.payout, 0);
      expect(staked).toBeGreaterThanOrEqual(bet);
      expect(p.bankroll).toBe(1000 - staked + paid);
      expect(next.seats[seat]).toMatchObject({ bankroll: p.bankroll, bet: 0, ready: false });
    }
  });

  it("a rejoin mid-round gets a view without the hole card", async () => {
    const { sock, lobbyId } = await host();
    // The same player in a second tab, connected before the moment comes.
    const tab = await guest(sock.identity.name, sock.identity.tag);
    autoBet(sock, lobbyId);
    await waitFor(sock, "blackjack_state", myTurn, 20000);
    tab.emit("join_lobby", { lobbyId });
    const v = await waitFor(tab, "blackjack_state");
    expect(v.mySeat).toBe(0);
    expect(v.phase).toBe("TURNS");
    expect(v.dealer.revealed).toBe(false);
    expect(v.dealer.cards).toHaveLength(2);
    expect(v.dealer.cards[0]).toMatchObject({ id: expect.any(String) });
    expect(v.dealer.cards[1]).toBeNull();
    expect(v.seats[0].hands[0].cards.every((c) => c?.id)).toBe(true);
    expect(v).not.toHaveProperty("shoe");
  });

  it("junk bj_ payloads are refused", async () => {
    const { sock, lobbyId } = await host();
    await sleep(50);
    const seen = sock.views.length;
    for (const amount of ["500", -10, 10.5, null]) {
      sock.emit("bj_bet", { lobbyId, amount });
      expect((await waitFor(sock, "move_rejected")).reason).toEqual(expect.any(String));
    }
    sock.emit("bj_action", { lobbyId, type: "WIN" });
    expect((await waitFor(sock, "move_rejected")).reason).toEqual(expect.any(String));
    sock.emit("bj_sit", { lobbyId, seat: 9 });
    expect((await waitFor(sock, "move_rejected")).reason).toEqual(expect.any(String));
    sock.emit("bj_insurance", { lobbyId, take: "yes" });
    expect((await waitFor(sock, "move_rejected")).reason).toEqual(expect.any(String));
    await sleep(50);
    expect(sock.views.length).toBe(seen);
    expect(latest(sock)).toMatchObject({ mySeat: 0, phase: "BETTING" });
    expect(latest(sock).seats[0]).toMatchObject({ bet: 0, bankroll: 1000 });
  });

  it("bj_sit moves to an empty seat between rounds, refused mid-round", async () => {
    const { sock, lobbyId } = await host();
    sock.emit("bj_sit", { lobbyId, seat: 3 });
    const moved = await waitFor(sock, "blackjack_state", (v) => v.mySeat === 3);
    expect(moved.seats[0]).toBeNull();
    expect(moved.seats[3]).toMatchObject({ bankroll: 1000 });
    autoBet(sock, lobbyId);
    await waitFor(sock, "blackjack_state", myTurn, 20000);
    sock.emit("bj_sit", { lobbyId, seat: 1 });
    expect((await waitFor(sock, "move_rejected")).reason).toBe("Move seats between rounds");
    expect(latest(sock).mySeat).toBe(3);
    expect(latest(sock).seats[1]).toBeNull();
  });

  it("leaving mid-turn stands the hand and the round finishes", async () => {
    const { sock, lobbyId } = await host();
    const other = await join(lobbyId);
    autoBet(sock, lobbyId);
    autoBet(other, lobbyId);
    const turn = await waitFor(sock, "blackjack_state", myTurn, 20000);
    const logged = waitFor(other, "receive_chat", (m) => m.type === "SYSTEM");
    sock.emit("leave_lobby", { lobbyId });
    const left = await nextState(other, (v) => v.roundNumber === turn.roundNumber && v.seats[0]?.leaving);
    expect(left.seats[0].hands.every((h) => h.done)).toBe(true);
    expect(left.turn?.seat).not.toBe(0);
    const over = await waitFor(other, "blackjack_state", (v) => v.roundNumber === turn.roundNumber && v.phase === "ROUND_OVER");
    expect(over.seats[0].hands.every((h) => h.result != null)).toBe(true);
    const next = await waitFor(other, "blackjack_state", (v) => v.phase === "BETTING" && v.roundNumber === turn.roundNumber);
    expect(next.seats[0]).toBeNull();
    expect(next.amHost).toBe(true);
    expect(await logged).toMatchObject({ kind: "table", tone: "away", text: `${sock.identity.name} left the table.` });
  });

  it("start_game and add_cpu are refused at a blackjack table", async () => {
    const { sock, lobbyId } = await host();
    sock.emit("start_game", { lobbyId });
    expect((await waitFor(sock, "move_rejected")).reason).toBe("Blackjack deals on its own");
    for (const ev of ["add_cpu", "remove_cpu", "set_cpu_level"]) {
      sock.emit(ev, { lobbyId, seat: 2, level: "EASY" });
      expect((await waitFor(sock, "move_rejected")).reason).toBe("Blackjack has no CPU players");
    }
  });

  it("the public list shows a blackjack table with current/max = 1/5", async () => {
    const { lobbyId } = await host();
    const watcher = await guest();
    watcher.emit("get_public_lobbies", { gameType: "blackjack" });
    const list = await waitFor(watcher, "public_lobbies_update", (l) => l.some((t) => t.id === lobbyId));
    expect(list.find((t) => t.id === lobbyId)).toMatchObject({ gameType: "blackjack", name: "Felt", current: 1, max: 5, tier: null });
  });

  it("the host closes a free table and everyone goes back to the lobby", async () => {
    const { sock, lobbyId } = await host();
    const other = await join(lobbyId);
    other.emit("close_table", { lobbyId });
    expect((await waitFor(other, "move_rejected")).reason).toBe("Only the host can do that");
    sock.emit("close_table", { lobbyId });
    expect(await waitFor(other, "table_left")).toEqual({ reason: "closed" });
    other.emit("join_lobby", { lobbyId });
    expect(await waitFor(other, "error_message")).toBe("Lobby not found");
  });
});
