import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { TEST_DATABASE_URL, loadDb, truncateAll, makePlayer } from "./setup.js";

const T1 = "00000000-0000-4000-8000-000000000001";

describe.skipIf(!TEST_DATABASE_URL)("credits routes (Postgres)", () => {
  let m;
  let A;
  let L;
  let app;
  let onTable = () => null;
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
    A = await import("../../credits/accounts.js");
    L = await import("../../credits/leaderboard.js");
    const { creditsRouter } = await import("../../credits/routes.js");
    app = express().use("/api/credits", creditsRouter({ onTableFor: (id) => onTable(id) }));
  });
  beforeEach(async () => {
    await truncateAll(m.pool);
    L.clearLeaderboardCache();
    onTable = () => null;
  });
  afterAll(() => m?.pool.end());

  const bearer = (id) => ({ Authorization: `Bearer ${m.signToken({ id, email: "x@test.dev" })}` });
  /** A player on the board: has played a hand, holds `total`. */
  async function ranked(name, total) {
    const id = await makePlayer(m.pool, name);
    await A.me(id);
    await m.pool.query("update credit_accounts set balance = $2, first_hand_at = now() where user_id = $1", [id, total]);
    return id;
  }

  it("/me needs a session and shows the balance, claim and rank", async () => {
    expect((await request(app).get("/api/credits/me")).status).toBe(401);
    const ann = await makePlayer(m.pool, "ANN");
    const res = await request(app).get("/api/credits/me").set(bearer(ann));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ balance: 1000, canPlay: true, claim: { state: "over" }, rank: null, seat: null });
  });

  it("/me counts what the table in memory says you hold", async () => {
    const ann = await makePlayer(m.pool, "ANN");
    await A.buyIn(ann, { tableId: T1, tableName: "Felt", tier: "LOW", amount: 800 });
    onTable = () => 650;
    expect((await request(app).get("/api/credits/me").set(bearer(ann))).body).toMatchObject({ balance: 200, onTable: 650, claim: { state: "wait" } });
  });

  it("CLAIM refuses with a reason, and tops up once the day has passed", async () => {
    const ann = await makePlayer(m.pool, "ANN");
    const no = await request(app).post("/api/credits/claim").set(bearer(ann));
    expect(no.status).toBe(400);
    expect(no.body.error).toBe("You have 1,000 or more: nothing to claim");
    await A.me(ann);
    await m.pool.query("update credit_accounts set balance = 100, last_claim_at = now() - interval '25 hours' where user_id = $1", [ann]);
    const yes = await request(app).post("/api/credits/claim").set(bearer(ann));
    expect(yes.status).toBe(200);
    expect(yes.body).toMatchObject({ balance: 1000, claim: { state: "over" } });
  });

  it("the leaderboard ranks balance plus table, ties share a rank, and leaves out the frozen and the unplayed", async () => {
    const ann = await ranked("ANN", 3000);
    await ranked("BOB", 2000);
    await ranked("CAT", 2000);
    await ranked("DAN", 500);
    await A.buyIn(ann, { tableId: T1, tableName: "Felt", tier: "LOW", amount: 500 }); // 2,500 + 500 at a table
    const frozen = await ranked("EVE", 9000);
    await m.pool.query("update credit_accounts set frozen_at = now() where user_id = $1", [frozen]);
    const idle = await makePlayer(m.pool, "IDLE");
    await A.me(idle);
    const res = await request(app).get("/api/credits/leaderboard");
    expect(res.status).toBe(200);
    expect(res.body.top.map((r) => [r.rank, r.name, r.total])).toEqual([
      [1, "ANN", 3000],
      [2, "BOB", 2000],
      [2, "CAT", 2000],
      [4, "DAN", 500],
    ]);
    expect(res.body.top[0]).toMatchObject({ atTable: true, me: false });
    expect(res.body.top[0]).not.toHaveProperty("userId");
    expect(res.body.me).toBeNull();
  });

  it("someone outside the top 100 sees the 5 above and below them", async () => {
    const ids = [];
    for (let i = 0; i < 110; i++) ids.push(await ranked(`P${i}`, 100_000 - i * 10));
    const me = ids[104]; // rank 105
    const res = await request(app).get("/api/credits/leaderboard").set(bearer(me));
    expect(res.body.top).toHaveLength(100);
    expect(res.body.me).toMatchObject({ rank: 105, total: 100_000 - 1040 });
    expect(res.body.me.around.map((r) => r.rank)).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
    expect(res.body.me.around.find((r) => r.me).rank).toBe(105);
    const inTop = await request(app).get("/api/credits/leaderboard").set(bearer(ids[3]));
    expect(inTop.body.me).toMatchObject({ rank: 4, around: null });
    expect(inTop.body.top[3].me).toBe(true);
    expect((await request(app).get("/api/credits/me").set(bearer(me))).body.rank).toBe(105);
  });

  it("createSession records a credit table's tier", async () => {
    const id = await m.createSession({ gameType: "poker", lobbyId: "PUB-CR0001", lobbyName: "Felt", isPrivate: false, hostDisplayName: "ANN #0001", maxPlayers: 6, pokerTier: "MID" });
    expect((await m.pool.query("select poker_tier from game_sessions where id = $1", [id])).rows[0].poker_tier).toBe("MID");
  });
});
