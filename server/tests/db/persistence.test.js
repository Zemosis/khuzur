import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { TEST_DATABASE_URL, loadDb, truncateAll, makeUser } from "./setup.js";

describe.skipIf(!TEST_DATABASE_URL)("match recording (Postgres)", () => {
  let m;
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
  });
  beforeEach(() => truncateAll(m.pool));
  afterAll(() => m?.pool.end());

  const session = (overrides = {}) =>
    m.createSession({
      lobbyId: "PUB-ABC123",
      lobbyName: "Table",
      isPrivate: false,
      hostDisplayName: "HOST #0001",
      playerCount: 4,
      startedAt: new Date(Date.now() - 60_000),
      ...overrides,
    });

  const seat = (seatIndex, extra = {}) => ({
    playerKey: `guest:P${seatIndex}#000${seatIndex}`,
    userId: null,
    name: `P${seatIndex}`,
    tag: `000${seatIndex}`,
    seatIndex,
    joinedAt: new Date(Date.now() - 60_000),
    leftAt: null,
    leftEarly: false,
    cpuTookOver: false,
    disconnectCount: 0,
    ...extra,
  });

  // Seat 2 wins; then 0 (5 pts), 3 (26, out), 1 (30, out).
  const finalState = {
    roundNumber: 3,
    players: [
      { score: 5, isEliminated: false },
      { score: 30, isEliminated: true },
      { score: 0, isEliminated: false },
      { score: 26, isEliminated: true },
    ],
  };
  const rounds = [1, 2, 3].map((n) => ({
    roundNumber: n,
    winnerSeat: 2,
    seatResults: [0, 1, 2, 3].map((i) => ({ seat_index: i, cards_left: i === 2 ? 0 : i + 1, points_gained: 0, score_after: 0, eliminated: n === 3 && (i === 1 || i === 3) })),
  }));

  it("migrate() is idempotent", async () => {
    const before = (await m.pool.query("select count(*)::int as n from schema_migrations")).rows[0].n;
    await m.migrate();
    const after = (await m.pool.query("select count(*)::int as n from schema_migrations")).rows[0].n;
    expect(after).toBe(before);
    expect(after).toBeGreaterThanOrEqual(1);
  });

  it("createSession writes an in-progress row", async () => {
    const id = await session();
    const { rows } = await m.pool.query("select * from game_sessions where id = $1", [id]);
    expect(rows[0]).toMatchObject({ status: "in_progress", lobby_code: "PUB-ABC123", name: "Table", current_player_count: 4, game_type: "thirteen" });
  });

  it("a completed match ranks seats, pays rewards and stores rounds, with no rating anywhere", async () => {
    const alice = await makeUser(m.pool, "alice@test.dev");
    const bob = await makeUser(m.pool, "bob@test.dev", { coins: 5, exp: 90 });
    const id = await session({ hostUserId: alice.id });
    await m.finishSession({
      sessionId: id,
      completed: true,
      endedReason: "completed",
      finishedAt: new Date(),
      roster: [
        seat(0, { playerKey: alice.id, userId: alice.id }),
        seat(1, { leftEarly: true, cpuTookOver: true, leftAt: new Date(), disconnectCount: 2 }),
        seat(2, { playerKey: bob.id, userId: bob.id }),
        seat(3),
      ],
      rounds,
      state: finalState,
    });

    const s = (await m.pool.query("select * from game_sessions where id = $1", [id])).rows[0];
    expect(s).toMatchObject({ status: "finished", ended_reason: "completed", round_count: 3, current_player_count: 4 });

    const players = (await m.pool.query("select * from game_players where session_id = $1 order by seat_index", [id])).rows;
    expect(players.map((p) => p.final_position)).toEqual([2, 4, 1, 3]);
    expect(players.map((p) => p.is_winner)).toEqual([false, false, true, false]);
    expect(players.map((p) => p.coins_earned)).toEqual([50, 10, 100, 25]);
    expect(players[1]).toMatchObject({ guest_name: "P1", guest_tag: "0001", left_early: true, cpu_took_over: true, disconnect_count: 2, player_id: null });
    expect(players[2]).toMatchObject({ player_id: bob.id, rounds_won: 3 });
    expect(Object.keys(players[2]).some((k) => k.includes("rating"))).toBe(false); // credits are the ranked play
    expect(players[0].stats).toMatchObject({ rounds_played: 3, rounds_won: 0, cards_left_total: 3, best_round_cards_left: 1, eliminated_at_round: null });
    expect(players[3].stats.eliminated_at_round).toBe(3);

    const profiles = Object.fromEntries((await m.pool.query("select * from profiles")).rows.map((p) => [p.id, p]));
    expect(profiles[bob.id]).toMatchObject({ coins: 105, exp: 150, level: 2, wins: 1, games_played: 1 });
    expect(profiles[alice.id]).toMatchObject({ coins: 50, exp: 35, level: 1, wins: 0, games_played: 1 });
    expect(profiles[bob.id]).not.toHaveProperty("rating");

    const r = (await m.pool.query("select * from game_rounds where session_id = $1 order by round_number", [id])).rows;
    expect(r.map((x) => x.round_number)).toEqual([1, 2, 3]);
    expect(r[0].seat_results).toHaveLength(4);

    const history = (await m.pool.query("select * from player_match_history where player_id = $1", [bob.id])).rows;
    expect(history).toHaveLength(1);
    expect(Object.keys(history[0]).some((k) => k.includes("rating"))).toBe(false);
  });

  it("a completed Muushig match is placed by Muushig's rules and tallies piles, not hands", async () => {
    const carol = await makeUser(m.pool, "carol@test.dev");
    const dave = await makeUser(m.pool, "dave@test.dev");
    const id = await session({ gameType: "muushig", maxPlayers: 5, playerCount: 5 });
    const result = (seat, eaten, folded = false) => ({ seat, eaten, folded, delta: folded ? 0 : eaten ? -eaten : 5, score: 0 });
    // Round 1: seat 3 sweeps. Round 2: seat 3 eats 3, seat 1 eats 2, seat 4 folds.
    const r1 = [result(0, 0), result(1, 0), result(2, 0, true), result(3, 5), result(4, 0)];
    const r2 = [result(0, 0), result(1, 2), result(2, 0), result(3, 3), result(4, 0, true)];
    const state = {
      roundNumber: 2,
      // Seat 3 reaches 0. Seats 0 and 1 tie on 4: seat 1 ate more last round.
      players: [4, 4, 9, 0, 20].map((score) => ({ score })),
      roundResults: { results: r2, roundWinner: null },
      events: [
        { type: "roundEnd", round: 1, results: r1, roundWinner: 3 },
        { type: "roundEnd", round: 2, results: r2, roundWinner: null },
      ],
    };
    const summary = (n, results, winnerSeat) => ({
      roundNumber: n,
      winnerSeat,
      seatResults: results.map((r) => ({ seat_index: r.seat, eaten: r.eaten, folded: r.folded, points_gained: r.delta, score_after: 0, eliminated: false })),
    });
    await m.finishSession({
      sessionId: id,
      gameType: "muushig",
      completed: true,
      endedReason: "completed",
      finishedAt: new Date(),
      roster: [0, 1, 2, 3, 4].map((i) =>
        i === 3 ? seat(3, { playerKey: carol.id, userId: carol.id }) : i === 1 ? seat(1, { playerKey: dave.id, userId: dave.id }) : seat(i),
      ),
      rounds: [summary(1, r1, 3), summary(2, r2, null)],
      state,
    });

    const s = (await m.pool.query("select * from game_sessions where id = $1", [id])).rows[0];
    expect(s).toMatchObject({ game_type: "muushig", status: "finished", round_count: 2, max_players: 5 });
    const players = (await m.pool.query("select * from game_players where session_id = $1 order by seat_index", [id])).rows;
    expect(players.map((p) => p.final_position)).toEqual([3, 2, 4, 1, 5]);
    expect(players.map((p) => p.is_winner)).toEqual([false, false, false, true, false]);
    expect(players.map((p) => p.coins_earned)).toEqual([25, 50, 10, 100, 10]); // 5th gets the last reward
    expect(players[3]).toMatchObject({ player_id: carol.id, rounds_won: 2, final_score: 0 });
    expect(players[3].stats).toEqual({ rounds_played: 2, rounds_won: 2, eaten: 8, gone_in: 2, folded: 0, sweeps: 1 });
    expect(players[4].stats).toEqual({ rounds_played: 2, rounds_won: 0, eaten: 0, gone_in: 1, folded: 1, sweeps: 0 });
    const r = (await m.pool.query("select * from game_rounds where session_id = $1 order by round_number", [id])).rows;
    expect(r.map((x) => x.winner_seat)).toEqual([3, null]);
    expect(r[0].seat_results).toHaveLength(5);
  });

  it("counts each player's hands played by type, for the profile's hand tally", async () => {
    const id = await session();
    const play = (playerIndex, type) => ({ type: "PLAY", playerIndex, cards: [], combination: { type } });
    await m.finishSession({
      sessionId: id,
      completed: true,
      roster: [seat(0), seat(1), seat(2), seat(3)],
      rounds,
      state: {
        ...finalState,
        moveHistory: [
          play(0, "SINGLE"),
          play(1, "PAIR"),
          { type: "PASS", playerIndex: 2 },
          play(0, "SINGLE"),
          play(0, "STRAIGHT"),
          { type: "ROUND_END", winnerIndex: 0 },
        ],
      },
    });
    const players = (await m.pool.query("select stats from game_players where session_id = $1 order by seat_index", [id])).rows;
    expect(players[0].stats.hands).toEqual({ SINGLE: 2, STRAIGHT: 1 });
    expect(players[1].stats.hands).toEqual({ PAIR: 1 });
    expect(players[2].stats.hands).toEqual({});
  });

  it("an abandoned match is recorded without positions or rewards", async () => {
    const alice = await makeUser(m.pool, "alice@test.dev");
    const id = await session();
    await m.finishSession({
      sessionId: id,
      completed: false,
      endedReason: "all_left",
      roster: [seat(0, { playerKey: alice.id, userId: alice.id, leftEarly: true })],
      rounds: [],
      state: finalState,
    });
    const s = (await m.pool.query("select status, ended_reason from game_sessions where id = $1", [id])).rows[0];
    expect(s).toEqual({ status: "abandoned", ended_reason: "all_left" });
    const p = (await m.pool.query("select * from game_players where session_id = $1", [id])).rows[0];
    expect(p).toMatchObject({ final_position: null, is_winner: false, coins_earned: 0, stats: null });
    const prof = (await m.pool.query("select * from profiles where id = $1", [alice.id])).rows[0];
    expect(prof).toMatchObject({ coins: 0, games_played: 0 });
  });

  it("closeOrphanedSessions closes only in-progress sessions", async () => {
    const open = await session();
    const done = await session();
    await m.finishSession({ sessionId: done, completed: true, roster: [seat(0)], rounds: [], state: finalState });
    await m.closeOrphanedSessions();
    const rows = Object.fromEntries((await m.pool.query("select id, status, ended_reason from game_sessions")).rows.map((r) => [r.id, r]));
    expect(rows[open]).toMatchObject({ status: "abandoned", ended_reason: "abandoned" });
    expect(rows[done]).toMatchObject({ status: "finished" });
  });

  it("a failed write rolls back the whole result", async () => {
    const id = await session();
    await expect(
      m.finishSession({ sessionId: id, completed: true, roster: [seat(0), seat(-1)], rounds, state: finalState }),
    ).rejects.toThrow();
    const players = (await m.pool.query("select count(*)::int as n from game_players")).rows[0].n;
    const rs = (await m.pool.query("select count(*)::int as n from game_rounds")).rows[0].n;
    const s = (await m.pool.query("select status from game_sessions where id = $1", [id])).rows[0];
    expect({ players, rs, status: s.status }).toEqual({ players: 0, rs: 0, status: "in_progress" });
  });
});
