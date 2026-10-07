// A real server writing to the test database: what a started table records.
// Runs server/index.js on a free port against TEST_DATABASE_URL.

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io as connectClient } from "socket.io-client";
import { TEST_DATABASE_URL, loadDb, truncateAll } from "./setup.js";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe.skipIf(!TEST_DATABASE_URL)("started tables (Postgres)", () => {
  let server;
  let url;
  let db;
  const open = [];

  const freePort = () =>
    new Promise((resolve) => {
      const s = net.createServer().listen(0, () => {
        const { port } = s.address();
        s.close(() => resolve(port));
      });
    });

  beforeAll(async () => {
    db = await loadDb();
    const port = await freePort();
    url = `http://localhost:${port}`;
    server = spawn(process.execPath, ["index.js"], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: String(port), DATABASE_URL: TEST_DATABASE_URL, JWT_SECRET: "db-test-secret" },
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
    });
  }, 20000);

  // Other suites leave their rows behind: start clean.
  beforeEach(() => truncateAll(db.pool));
  afterEach(() => {
    while (open.length) open.pop().disconnect();
  });

  afterAll(async () => {
    server?.kill();
    await db?.pool.end();
  });

  const guest = async (name) => {
    const sock = connectClient(url, { auth: { name, tag: "0001" }, forceNew: true, transports: ["websocket"] });
    open.push(sock);
    await new Promise((resolve, reject) => {
      sock.once("connect", resolve);
      sock.once("connect_error", reject);
    });
    return sock;
  };
  const next = (sock, event) => new Promise((resolve) => sock.once(event, resolve));

  it("a 2-player Thirteen match is recorded as a table of 2, not 4", async () => {
    const host = await guest("DUO");
    const joined = next(host, "lobby_joined");
    host.emit("create_lobby", { lobbyName: "Duo", isPrivate: false });
    const { lobbyId } = await joined;
    const dealt = next(host, "game_state_update");
    host.emit("add_cpu", { lobbyId, seat: 1, level: "EASY" });
    host.emit("start_game", { lobbyId });
    expect((await dealt).players).toHaveLength(2);

    let rows = [];
    for (let i = 0; i < 50 && !rows.length; i++) {
      ({ rows } = await db.pool.query("select max_players, current_player_count from game_sessions where lobby_code = $1", [lobbyId]));
      if (!rows.length) await new Promise((r) => setTimeout(r, 50));
    }
    expect(rows).toEqual([{ max_players: 2, current_player_count: 1 }]);
  });
});
