import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { TEST_DATABASE_URL, loadDb, truncateAll } from "./setup.js";

// A poker table's record: each player's chips and tally of hands, no places
// or rewards, kept out of the placement stats and read back by /stats.
describe.skipIf(!TEST_DATABASE_URL)("poker tables (Postgres)", () => {
  let m;
  let app;
  let token;
  let userId;
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
    app = express().use(express.json()).use("/api/auth", m.authRouter);
  });
  beforeEach(async () => {
    await truncateAll(m.pool);
    token = (await request(app).post("/api/auth/signup").send({ email: "poker@test.dev", password: "secret1" })).body.token;
    userId = (await m.pool.query("select id from users where email = 'poker@test.dev'")).rows[0].id;
  });
  afterAll(() => m?.pool.end());

  const tally = (over = {}) => ({ hands_played: 10, hands_won: 4, net: 250, biggest_pot: 400, vpip_hands: 6, showdowns: 3, showdowns_won: 2, ...over });
  const entry = (seatIndex, extra) => ({
    playerKey: `guest:P${seatIndex}#000${seatIndex}`,
    userId: null,
    name: `P${seatIndex}`,
    tag: `000${seatIndex}`,
    seatIndex,
    joinedAt: new Date(Date.now() - 600_000),
    leftAt: null,
    leftEarly: false,
    cpuTookOver: false,
    disconnectCount: 0,
    ...extra,
  });
  async function recordTable() {
    const sessionId = await m.createSession({
      gameType: "poker",
      lobbyId: "PUB-PK0001",
      lobbyName: "Felt",
      isPrivate: false,
      hostDisplayName: "HOST #0001",
      maxPlayers: 6,
      playerCount: 2,
      startedAt: new Date(Date.now() - 600_000),
    });
    await m.finishSession({
      sessionId,
      gameType: "poker",
      completed: true,
      endedReason: "completed",
      roster: [entry(0, { playerKey: userId, userId, poker: tally() }), entry(1, { poker: tally({ net: -250, hands_won: 6 }) })],
      rounds: [{ roundNumber: 1, winnerSeat: 0, seatResults: [{ seat_index: 0, net: 15 }, { seat_index: 1, net: -15 }] }],
      state: { handNumber: 10 },
    });
    return sessionId;
  }

  it("records chips won or lost and the hands tally, with no places, coins or exp", async () => {
    const before = (await m.pool.query("select coins, exp, games_played from profiles where id = $1", [userId])).rows[0];
    const sessionId = await recordTable();
    const { rows: [session] } = await m.pool.query("select status, round_count from game_sessions where id = $1", [sessionId]);
    expect(session).toEqual({ status: "finished", round_count: 10 });
    const { rows: [me] } = await m.pool.query("select * from game_players where player_id = $1", [userId]);
    expect(me).toMatchObject({ final_score: 250, final_position: null, is_winner: false, coins_earned: 0, exp_earned: 0, rounds_won: 4 });
    expect(me.stats).toEqual(tally());
    const after = (await m.pool.query("select coins, exp, games_played from profiles where id = $1", [userId])).rows[0];
    expect(after).toEqual(before);
  });

  it("stays out of the placement history, and has its own stats", async () => {
    await recordTable();
    expect((await m.pool.query("select count(*)::int as n from player_match_history where player_id = $1", [userId])).rows[0].n).toBe(0);
    const { rows: [p] } = await m.pool.query("select * from player_poker_stats where player_id = $1", [userId]);
    expect(p).toMatchObject({ sessions: "1", hands_played: "10", hands_won: "4", net: "250", biggest_pot: 400, vpip_hands: "6", showdowns: "3", showdowns_won: "2" });
  });

  it("/stats has a poker view; the overall view doesn't count poker", async () => {
    await recordTable();
    const body = (await request(app).get("/api/auth/stats").set({ Authorization: `Bearer ${token}` })).body;
    expect(body.overall.games).toBe(0);
    expect(body.poker).toMatchObject({ sessions: 1, hands: 10, handsWon: 4, winRate: 40, net: 250, biggestPot: 400, vpip: 60, showdowns: 3, showdownsWon: 2 });
    expect(body.poker.time.totalSeconds).toBeGreaterThan(0);
  });
});
