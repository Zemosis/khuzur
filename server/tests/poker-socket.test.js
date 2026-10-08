// Poker over real sockets: starts server/index.js on a free port with the
// database off and fast timers, then hosts, joins, plays, leaves and closes
// poker tables with real socket.io clients.

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io as connectClient } from "socket.io-client";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TURN_MS = 1500;
const KICK_MS = 300;

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
      JWT_SECRET: "poker-socket-secret",
      DISCONNECT_GRACE_MS: "400",
      POKER_DELAY_MS: "5",
      POKER_TURN_MS: String(TURN_MS),
      POKER_KICK_MS: String(KICK_MS),
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
async function guest(name = `P${++count}`) {
  const sock = connectClient(url, { auth: { name, tag: String(2000 + count) }, forceNew: true, transports: ["websocket"] });
  sock.views = [];
  sock.on("poker_state", (v) => sock.views.push(v));
  open.push(sock);
  await new Promise((resolve, reject) => {
    sock.once("connect", resolve);
    sock.once("connect_error", reject);
  });
  return sock;
}

/** Resolves with the first event (or poker_state view) passing `test`. */
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

async function host() {
  const sock = await guest();
  sock.emit("create_lobby", { lobbyName: "Felt", gameType: "poker" });
  const { lobbyId } = await waitFor(sock, "lobby_joined");
  await waitFor(sock, "poker_state");
  return { sock, lobbyId };
}

describe("poker tables online", () => {
  it("the host sits at seat 0 of a waiting table", async () => {
    const { sock } = await host();
    const v = latest(sock);
    expect(v).toMatchObject({ mySeat: 0, phase: "WAITING", started: false, amHost: true });
    expect(v.seats[0]).toMatchObject({ name: expect.stringMatching(/^P\d+ #\d+$/), stack: 1000, key: null });
  });

  it("CPUs and START deal hands; your move goes through, a bad one is turned away", async () => {
    const { sock, lobbyId } = await host();
    sock.emit("add_cpu", { lobbyId, seat: 1, level: "EASY" });
    await waitFor(sock, "poker_state", (v) => v.seats[1]?.type === "AI");
    sock.emit("start_game", { lobbyId });
    const mine = await waitFor(sock, "poker_state", (v) => v.phase === "BETTING" && v.turn === 0);
    expect(mine.seats[1].hole).toEqual([{ hidden: true }, { hidden: true }]);
    expect(mine.seats[0].hole.every((c) => c.id)).toBe(true);
    expect(mine.turnMsLeft).toBeGreaterThan(0);
    sock.emit("poker_move", { lobbyId, move: { type: "raise", amount: 3 } });
    const { reason } = await waitFor(sock, "move_rejected");
    expect(reason).toMatch(/Raise to at least/);
    sock.emit("poker_move", { lobbyId, move: { type: "fold" } });
    await waitFor(sock, "poker_state", (v) => v.handNumber === mine.handNumber && v.seats[0].folded);
  });

  it("someone joining mid-hand gets a seat and is dealt in from the next hand", async () => {
    const { sock, lobbyId } = await host();
    sock.emit("add_cpu", { lobbyId, seat: 1 });
    sock.emit("start_game", { lobbyId });
    const during = await waitFor(sock, "poker_state", (v) => v.phase === "BETTING");
    const late = await guest();
    late.emit("join_lobby", { lobbyId });
    const first = await waitFor(late, "poker_state", (v) => v.mySeat === 2);
    if (first.handNumber === during.handNumber && first.phase !== "WAITING") expect(first.seats[2].inHand).toBe(false);
    await waitFor(late, "poker_state", (v) => v.seats[2]?.inHand, 15000);
  });

  it("leaving empties your seat — no CPU takes it", async () => {
    const { sock, lobbyId } = await host();
    const other = await guest();
    other.emit("join_lobby", { lobbyId });
    await waitFor(sock, "poker_state", (v) => !!v.seats[1]);
    other.emit("leave_lobby", { lobbyId });
    const after = await waitFor(sock, "poker_state", (v) => v.seats[1] === null);
    expect(after.seats.filter(Boolean)).toHaveLength(1);
  });

  it("only the host adds CPUs, starts or closes the table", async () => {
    const { sock, lobbyId } = await host();
    const other = await guest();
    other.emit("join_lobby", { lobbyId });
    await waitFor(other, "poker_state");
    for (const ev of ["add_cpu", "start_game", "close_table"]) {
      other.emit(ev, { lobbyId, seat: 3 });
      expect((await waitFor(other, "move_rejected")).reason).toBe("Only the host can do that");
    }
    sock.emit("close_table", { lobbyId });
    expect(await waitFor(other, "table_left")).toEqual({ reason: "closed" });
    other.emit("join_lobby", { lobbyId });
    expect(await waitFor(other, "error_message")).toBe("Lobby not found");
  });

  it("let the clock run out twice and you sit out; sit out too long and you're off the table", async () => {
    const { sock, lobbyId } = await host();
    sock.emit("add_cpu", { lobbyId, seat: 1, level: "MEDIUM" });
    sock.emit("start_game", { lobbyId });
    await waitFor(sock, "poker_state", (v) => v.seats[0].sittingOut, TURN_MS * 6);
    expect(await waitFor(sock, "table_left", () => true, KICK_MS + 4000)).toEqual({ reason: "away" });
  }, 20000);

  it("the public list shows poker tables with their seated count", async () => {
    const { sock, lobbyId } = await host();
    sock.emit("add_cpu", { lobbyId, seat: 2 });
    await waitFor(sock, "poker_state", (v) => !!v.seats[2]);
    const watcher = await guest();
    watcher.emit("get_public_lobbies", { gameType: "poker" });
    const list = await waitFor(watcher, "public_lobbies_update", (l) => l.some((t) => t.id === lobbyId));
    expect(list.find((t) => t.id === lobbyId)).toMatchObject({ gameType: "poker", current: 2, max: 6, inProgress: false });
  });
});
