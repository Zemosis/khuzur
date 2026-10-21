import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { TEST_DATABASE_URL, loadDb, truncateAll } from "./setup.js";

// Solo reports in, per-game stats out, through the real HTTP routes.
describe.skipIf(!TEST_DATABASE_URL)("solo matches and per-game stats (Postgres)", () => {
  let m;
  let app;
  let token;
  beforeAll(async () => {
    m = await loadDb();
    app = express().use(express.json()).use("/api/auth", m.authRouter);
  });
  beforeEach(async () => {
    await truncateAll(m.pool);
    token = (await request(app).post("/api/auth/signup").send({ email: "solo@test.dev", password: "secret1" })).body.token;
  });
  afterAll(() => m?.pool.end());

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString();
  let seq = 0;

  // `place` is where seat 0 (you) should finish; `endedAgo` orders matches.
  const thirteen = (place, endedAgo = 1) => {
    const scores = { 1: [10, 26, 27, 30], 4: [30, 26, 27, 10] }[place];
    return {
      matchId: `SOLO-T${++seq}`,
      gameType: "thirteen",
      startedAt: minutesAgo(endedAgo + 12),
      finishedAt: minutesAgo(endedAgo),
      me: 0,
      rounds: 5,
      players: scores.map((score) => ({ score, eliminated: score >= 25 })),
      stats: { rounds_played: 5, rounds_won: place === 1 ? 3 : 1, cards_left_total: 9, hands: { SINGLE: 10, PAIR: 3, FLUSH: 1 } },
    };
  };
  const muushig = (place, endedAgo = 1) => {
    const scores = { 2: [0, -2, 4, 6, 9], 5: [9, -2, 0, 4, 6] }[place];
    return {
      matchId: `MU-SOLO-${++seq}`,
      gameType: "muushig",
      startedAt: minutesAgo(endedAgo + 10),
      finishedAt: minutesAgo(endedAgo),
      me: 0,
      rounds: 8,
      players: scores.map((score) => ({ score, lastEaten: 1 })),
      stats: { rounds_played: 8, rounds_won: 2, eaten: 9, gone_in: 6, folded: 2, sweeps: 1 },
    };
  };
  const report = (body) => request(app).post("/api/auth/matches").set(auth()).send(body);
  const stats = async () => (await request(app).get("/api/auth/stats").set(auth())).body;

  it("records a solo match with the server's own placing and no rewards", async () => {
    const res = await report(thirteen(1));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ recorded: true, place: 1 });

    const { rows } = await m.pool.query(
      "select gs.solo, gs.max_players, gp.final_position, gp.coins_earned, gp.exp_earned from game_players gp join game_sessions gs on gs.id = gp.session_id",
    );
    expect(rows).toEqual([{ solo: true, max_players: 4, final_position: 1, coins_earned: 0, exp_earned: 0 }]);
    const { rows: [profile] } = await m.pool.query("select coins, exp from profiles");
    expect(profile).toMatchObject({ coins: 0, exp: 0 });
  });

  it("records a repeated report of the same match only once", async () => {
    const body = thirteen(1);
    await report(body);
    const again = await report(body);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ recorded: false, place: 1 });
    expect((await stats()).thirteen.games).toBe(1);
  });

  it("rejects bad reports, guests, and too many reports at once", async () => {
    const bad = await report({ ...thirteen(1), me: 9 });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/seat/i);

    expect((await request(app).post("/api/auth/matches").send(thirteen(1))).status).toBe(401);

    let last;
    for (let i = 0; i < 11; i++) last = await report(thirteen(1));
    expect(last.status).toBe(429);
  });

  it("a new player gets every view at zero", async () => {
    const s = await stats();
    for (const view of ["overall", "thirteen", "muushig"]) {
      expect(s[view]).toMatchObject({
        games: 0,
        wins: 0,
        losses: 0,
        deadLast: 0,
        winRate: null,
        avgFinish: null,
        streak: { current: 0, bestWin: 0 },
        placements: [],
        rounds: { won: 0, played: 0 },
        recent: [],
      });
    }
    expect(s.thirteen.hands).toEqual({});
  });

  it("splits stats by game and adds them up overall", async () => {
    await report(thirteen(1, 40)); // oldest: a win
    await report(thirteen(4, 30)); // dead last (4th of 4)
    await report(muushig(2, 20));
    await report(muushig(5, 10)); // newest: dead last (5th of 5)
    const s = await stats();

    expect(s.overall).toMatchObject({ games: 4, wins: 1, losses: 3, deadLast: 2, winRate: 25, avgFinish: 3 });
    expect(s.overall.streak).toEqual({ current: -3, bestWin: 1 });
    expect(s.overall.placements).toEqual([
      { place: 1, times: 1 },
      { place: 2, times: 1 },
      { place: 4, times: 1 },
      { place: 5, times: 1 },
    ]);
    expect(s.overall.recent.map((r) => [r.game, r.place, r.of, r.solo])).toEqual([
      ["muushig", 5, 5, true],
      ["muushig", 2, 5, true],
      ["thirteen", 4, 4, true],
      ["thirteen", 1, 4, true],
    ]);
    expect(s.overall.rounds).toEqual({ won: 8, played: 26 });
    expect(s.overall.time.totalSeconds).toBeGreaterThan(0);

    expect(s.thirteen).toMatchObject({ games: 2, wins: 1, deadLast: 1, avgFinish: 2.5 });
    expect(s.thirteen.hands).toEqual({ SINGLE: 20, PAIR: 6, FLUSH: 2 });
    expect(s.thirteen.extras).toMatchObject({ rounds_played: 10, rounds_won: 4, cards_left_total: 18 });

    expect(s.muushig).toMatchObject({ games: 2, wins: 0, deadLast: 1, avgFinish: 3.5 });
    expect(s.muushig.extras).toMatchObject({ eaten: 18, gone_in: 12, folded: 4, sweeps: 2 });
    expect(s.muushig.streak).toEqual({ current: -2, bestWin: 0 });
  });

  it("splits free and credit matches, with what the credit ones came to", async () => {
    await report(thirteen(1, 40)); // free
    await report(thirteen(4, 30)); // made a credit match below: lost the stake
    await report(thirteen(1, 20)); // made a credit match below: won the pot
    const {
      rows: [me],
    } = await m.pool.query("select id from users where email = 'solo@test.dev'");
    const { rows: sessions } = await m.pool.query(
      "select gp.session_id from game_players gp join game_sessions gs on gs.id = gp.session_id where gp.player_id = $1 order by gs.finished_at",
      [me.id],
    );
    const credit = async (sessionId, n, net, won) => {
      await m.pool.query("update game_sessions set credit_tier = 'MID' where id = $1", [sessionId]);
      await m.pool.query(
        `insert into credit_hands (table_id, session_id, tier, hand_number, seats, game_type)
         values ('00000000-0000-4000-8000-00000000000${n}', $1, 'MID', 1, $2, 'thirteen')`,
        [sessionId, JSON.stringify([{ seat: 0, user_id: me.id, stack_before: 500, net, won }])],
      );
    };
    await credit(sessions[1].session_id, 1, -500, 0);
    await credit(sessions[2].session_id, 2, 1000, 1500);
    const forStakes = async (stakes) => (await request(app).get(`/api/auth/stats?stakes=${stakes}`).set(auth())).body;

    const all = await forStakes("all");
    expect(all.stakes).toBe("all");
    expect(all.thirteen).toMatchObject({ games: 3, wins: 2, credits: { games: 2, net: 500, potsWon: 1, biggestPot: 1500 } });
    expect(all.thirteen.recent.map((r) => [r.place, r.tier, r.net])).toEqual([
      [1, "MID", 1000],
      [4, "MID", -500],
      [1, null, null],
    ]);
    const free = await forStakes("free");
    expect(free.thirteen).toMatchObject({ games: 1, wins: 1, credits: { games: 0, net: 0 } });
    const credits = await forStakes("credits");
    expect(credits.overall).toMatchObject({ games: 2, wins: 1, losses: 1, credits: { net: 500, potsWon: 1 } });
    expect(credits.muushig.games).toBe(0);
    expect((await forStakes("nonsense")).stakes).toBe("all");
  });

  it("never exposes rating", async () => {
    await report(thirteen(1));
    expect(JSON.stringify(await stats())).not.toMatch(/rating/i);
  });
});
