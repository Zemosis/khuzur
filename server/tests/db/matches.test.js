import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { TEST_DATABASE_URL, loadDb, truncateAll, makeUser } from "./setup.js";

// A finished match's page: who may open it, and what it says about every seat.
describe.skipIf(!TEST_DATABASE_URL)("match page (Postgres)", () => {
  let m;
  let app;
  let alice;
  let bob;
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
    const { matchesRouter } = await import("../../matches.js");
    app = express().use("/api/matches", matchesRouter());
  });
  beforeEach(async () => {
    await truncateAll(m.pool);
    alice = await makeUser(m.pool, "alice@test.dev", { username: "ALICE", tag: "0001" });
    bob = await makeUser(m.pool, "bob@test.dev", { username: "BOB", tag: "0002" });
  });
  afterAll(() => m?.pool.end());

  const get = (id, user) => {
    const req = request(app).get(`/api/matches/${id}`);
    return user ? req.set("Authorization", `Bearer ${m.signToken({ id: user.id })}`) : req;
  };
  const roster = (seatIndex, user, extra = {}) => ({
    playerKey: user ? user.id : `guest:G${seatIndex}#000${seatIndex}`,
    userId: user?.id ?? null,
    name: user ? null : `G${seatIndex}`,
    tag: user ? null : `000${seatIndex}`,
    seatIndex,
    joinedAt: new Date(Date.now() - 60_000),
    leftAt: null,
    leftEarly: false,
    cpuTookOver: false,
    disconnectCount: 0,
    ...extra,
  });

  // Muushig, alice in seat 0 and a guest in seat 1, three CPUs. Seat 3 (a CPU)
  // reaches 0 and wins; seat 1 beats seat 0 on the tie by eating more last round.
  async function muushigMatch({ isPrivate = false, seats = true, highlights = true } = {}) {
    const result = (seat, eaten, score, folded = false) => ({ seat, eaten, folded, delta: 0, score });
    const r1 = [result(0, 1, 9), result(1, 1, 9), result(2, 0, 12, true), result(3, 3, 2), result(4, 0, 20)];
    const r2 = [result(0, 0, 4), result(1, 2, 4), result(2, 1, 9), result(3, 2, 0), result(4, 0, 20, true)];
    const summary = (n, results, winnerSeat, hl) => ({
      roundNumber: n,
      winnerSeat,
      seatResults: results.map((r) => ({ seat_index: r.seat, eaten: r.eaten, folded: r.folded, points_gained: r.delta, score_after: r.score, eliminated: false })),
      highlights: highlights ? hl : undefined,
    });
    const id = await m.createSession({
      gameType: "muushig",
      lobbyId: "PUB-MATCH1",
      lobbyName: "Table",
      isPrivate,
      hostUserId: alice.id,
      hostDisplayName: "ALICE #0001",
      maxPlayers: 5,
      playerCount: 2,
      startedAt: new Date(Date.now() - 600_000),
      seats: seats
        ? [
            { seat: 0, name: "ALICE #0001", kind: "human", level: null },
            { seat: 1, name: "G1 #0001", kind: "human", level: null },
            { seat: 2, name: "Bot Saturn", kind: "cpu", level: "EASY" },
            { seat: 3, name: "Bot Venus", kind: "cpu", level: "HARD" },
            { seat: 4, name: "Bot Mars", kind: "cpu", level: "MEDIUM" },
          ]
        : null,
    });
    await m.finishSession({
      sessionId: id,
      gameType: "muushig",
      completed: true,
      endedReason: "completed",
      finishedAt: new Date(),
      roster: [roster(0, alice), roster(1, null)],
      rounds: [
        summary(1, r1, 3, [{ type: "in", seat: 0 }, { type: "eat", seat: 3, trick: 1, card: { rank: "A", suit: "♠" } }]),
        summary(2, r2, null, [{ type: "fold", seat: 4 }]),
      ],
      state: {
        roundNumber: 2,
        players: [4, 4, 9, 0, 20].map((score) => ({ score })),
        roundResults: { results: r2, roundWinner: null },
        events: [
          { type: "roundEnd", round: 1, results: r1, roundWinner: 3 },
          { type: "roundEnd", round: 2, results: r2, roundWinner: null },
        ],
      },
    });
    return id;
  }

  it("a public match opens for anyone: every seat in place order, CPUs named, rounds with key plays", async () => {
    const id = await muushigMatch();
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, gameType: "muushig", roundCount: 2, isPrivate: false, you: null });
    expect(res.body.durationSeconds).toBeGreaterThanOrEqual(590);
    expect(res.body.standings.map((s) => [s.place, s.seat, s.name, s.kind, s.level])).toEqual([
      [1, 3, "Bot Venus", "cpu", "HARD"],
      [2, 1, "G1 #0001", "human", null],
      [3, 0, "ALICE #0001", "human", null],
      [4, 2, "Bot Saturn", "cpu", "EASY"],
      [5, 4, "Bot Mars", "cpu", "MEDIUM"],
    ]);
    expect(res.body.standings[0]).toMatchObject({ score: 0, roundsWon: 2, stats: null }); // most piles in both rounds (a tie counts)
    expect(res.body.rounds).toHaveLength(2);
    expect(res.body.rounds[0]).toMatchObject({
      number: 1,
      winnerSeat: 3,
      highlights: [{ type: "in", seat: 0 }, { type: "eat", seat: 3, trick: 1, card: { rank: "A", suit: "♠" } }],
    });
    expect(res.body.rounds[1].results[4]).toMatchObject({ seat: 4, folded: true, scoreAfter: 20 });
  });

  it("a credit match says what it was played for and each staked seat's net", async () => {
    const id = await muushigMatch();
    expect((await get(id)).body.credit).toBeNull();
    // The CPU in seat 3 won: alice's 100 is lost with the pot.
    await m.pool.query("insert into credit_accounts (user_id, balance) values ($1, 900)", [alice.id]);
    await m.pool.query(
      `insert into credit_hands (table_id, session_id, tier, hand_number, seats, game_type, cpu_take)
       values ('00000000-0000-4000-8000-000000000009', $1, 'LOW', 1, $2, 'muushig', 100)`,
      [id, JSON.stringify([{ seat: 0, user_id: alice.id, stack_before: 100, net: -100 }, { seat: 3, user_id: null, cpu: true }])],
    );
    const { body } = await get(id);
    expect(body.credit).toEqual({ tier: "LOW", stake: 100, pot: 100, cpuTake: 100, nets: { 0: -100 } });
    expect(JSON.stringify(body)).not.toContain(alice.id);
  });

  it("never sends user ids, player keys or emails", async () => {
    const id = await muushigMatch();
    const text = JSON.stringify((await get(id, alice)).body);
    expect(text).not.toContain(alice.id);
    expect(text).not.toContain("guest:");
    expect(text).not.toContain("@test.dev");
  });

  it("knows your seat when you played in it", async () => {
    const id = await muushigMatch();
    expect((await get(id, alice)).body.you).toBe(0);
    expect((await get(id, bob)).body.you).toBeNull();
  });

  it("a private match opens only for a signed-in player who sat in it", async () => {
    const id = await muushigMatch({ isPrivate: true });
    expect((await get(id)).status).toBe(404);
    expect((await get(id, bob)).status).toBe(404);
    expect((await get(id, alice)).status).toBe(200);
  });

  it("a match recorded before seats and key plays still opens: CPUs unnamed, placed from the last round", async () => {
    const id = await muushigMatch({ seats: false, highlights: false });
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.body.standings.map((s) => [s.place, s.seat, s.name, s.kind])).toEqual([
      [1, 3, null, "cpu"],
      [2, 1, "G1 #0001", "human"],
      [3, 0, "ALICE #0001", "human"],
      [4, 2, null, "cpu"],
      [5, 4, null, "cpu"],
    ]);
    expect(res.body.rounds[0].highlights).toBeNull();
  });

  it("a seat a CPU took over shows the leaver and the CPU that finished for them", async () => {
    const id = await m.createSession({ lobbyId: "PUB-T1", lobbyName: "T", isPrivate: false, hostDisplayName: "ALICE #0001", startedAt: new Date(Date.now() - 60_000) });
    const results = [0, 1, 2, 3].map((seat) => ({ seat_index: seat, cards_left: seat, points_gained: seat, score_after: [0, 12, 5, 30][seat], eliminated: seat === 3 }));
    await m.finishSession({
      sessionId: id,
      completed: true,
      endedReason: "completed",
      roster: [roster(0, alice), roster(1, bob, { leftEarly: true, cpuTookOver: true, leftAt: new Date() })],
      rounds: [{ roundNumber: 1, winnerSeat: 0, seatResults: results }],
      state: { roundNumber: 1, players: [0, 12, 5, 30].map((score, i) => ({ score, isEliminated: i === 3 })) },
    });
    const { standings } = (await get(id)).body;
    expect(standings.filter((s) => s.seat === 1).map((s) => [s.kind, s.leftEarly])).toEqual([
      ["human", true],
      ["cpu", false],
    ]);
    expect(standings.find((s) => s.seat === 3)).toMatchObject({ kind: "cpu", place: 4, score: 30 });
  });

  it("is a 404 for a bad id, an unknown match, an abandoned one and a solo one", async () => {
    expect((await get("not-a-uuid")).status).toBe(404);
    expect((await get("00000000-0000-4000-8000-000000000000")).status).toBe(404);

    const abandoned = await m.createSession({ lobbyId: "PUB-A", lobbyName: "A", hostDisplayName: "X", startedAt: new Date() });
    await m.finishSession({ sessionId: abandoned, completed: false, endedReason: "abandoned", roster: [roster(0, alice)], rounds: [], state: null });
    expect((await get(abandoned)).status).toBe(404);

    await m.recordSoloMatch(alice.id, {
      matchId: "SOLO-1",
      gameType: "thirteen",
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      finishedAt: new Date().toISOString(),
      me: 0,
      rounds: 1,
      players: [10, 26, 27, 30].map((score) => ({ score, eliminated: score >= 25 })),
      stats: { rounds_played: 1, rounds_won: 1 },
    });
    const solo = (await m.pool.query("select id from game_sessions where solo")).rows[0].id;
    expect((await get(solo, alice)).status).toBe(404);
  });

  it("records the seats at the start and each round's key plays", async () => {
    const id = await muushigMatch();
    const s = (await m.pool.query("select seats from game_sessions where id = $1", [id])).rows[0];
    expect(s.seats[2]).toEqual({ seat: 2, name: "Bot Saturn", kind: "cpu", level: "EASY" });
    const r = (await m.pool.query("select highlights from game_rounds where session_id = $1 order by round_number", [id])).rows;
    expect(r.map((x) => x.highlights.length)).toEqual([2, 1]);
  });

  // A poker table: alice (with her hand log) and bob, and a CPU named in the hands.
  async function pokerTable({ tier = null } = {}) {
    const id = await m.createSession({
      gameType: "poker",
      lobbyId: "PUB-PK0001",
      lobbyName: "High Rollers",
      isPrivate: false,
      hostDisplayName: "ALICE #0001",
      maxPlayers: 6,
      playerCount: 2,
      startedAt: new Date(Date.now() - 600_000),
      creditTier: tier,
    });
    const log = [
      { n: 1, net: 40, won: 60, hole: ["A♠", "A♦"], board: ["2♣", "7♦", "9♥", "J♠", "3♣"], folded: null, showdown: true, rank: "PAIR", shown: "Pair of aces", winners: [{ name: "ALICE #0001", hand: "Pair of aces" }] },
      { n: 2, net: -10, won: 0, hole: ["7♣", "2♦"], board: [], folded: "PREFLOP", showdown: false, rank: null, shown: null, winners: [{ name: "Bot Saturn", hand: null }] },
    ];
    const tally = { hands_played: 2, hands_won: 1, net: 30, biggest_pot: 60, vpip_hands: 1, showdowns: 1, showdowns_won: 1, showdown_ranks: { PAIR: { shown: 1, won: 1 } }, hands: log };
    const seat = (i, name, net, cpu = false) => ({ seat_index: i, name, cpu, net, won: net > 0 ? net : 0 });
    await m.finishSession({
      sessionId: id,
      gameType: "poker",
      completed: true,
      endedReason: "completed",
      roster: [roster(0, alice, { poker: tally }), roster(1, bob, { poker: { hands_played: 2, hands_won: 0, net: -40, biggest_pot: 0 } })],
      rounds: [
        { roundNumber: 1, winnerSeat: 0, seatResults: [seat(0, "ALICE #0001", 40), seat(1, "BOB #0002", -30), seat(2, "Bot Saturn", -10, true)] },
        { roundNumber: 2, winnerSeat: 2, seatResults: [seat(0, "ALICE #0001", -10), seat(1, "BOB #0002", -10), seat(2, "Bot Saturn", 20, true)] },
      ],
      state: { handNumber: 2 },
    });
    return id;
  }

  it("a poker table's page is your time there: your tally and hand log, everyone's chips", async () => {
    const id = await pokerTable();
    const res = await get(id, alice);
    expect(res.status).toBe(200);
    const t = res.body;
    expect(t).toMatchObject({ gameType: "poker", table: "High Rollers", tier: null, handCount: 2 });
    expect(t.you).toMatchObject({ name: "ALICE #0001", net: 30, handsPlayed: 2, handsWon: 1, biggestPot: 60, showdowns: 1, showdownsWon: 1, showdownRanks: { PAIR: { shown: 1, won: 1 } } });
    expect(t.you.seconds).toBeGreaterThan(0);
    expect(t.you.hands.map((h) => h.hole)).toEqual([["A♠", "A♦"], ["7♣", "2♦"]]);
    expect(t.players).toEqual([
      { name: "ALICE #0001", kind: "human", net: 30, hands: 2, you: true },
      { name: "Bot Saturn", kind: "cpu", net: 10, hands: 2, you: false },
      { name: "BOB #0002", kind: "human", net: -40, hands: 2, you: false },
    ]);
    // Bob sees his own page, never alice's cards.
    const bob_ = (await get(id, bob)).body;
    expect(bob_.you).toMatchObject({ name: "BOB #0002", net: -40, hands: null });
    expect(JSON.stringify(bob_)).not.toContain("A♦");
  });

  it("a poker table's page opens only for a signed-in player who sat at it", async () => {
    const id = await pokerTable();
    expect((await get(id)).status).toBe(404);
    const carol = await makeUser(m.pool, "carol@test.dev", { username: "CAROL", tag: "0003" });
    expect((await get(id, carol)).status).toBe(404);
    const body = JSON.stringify((await get(id, alice)).body);
    expect(body).not.toContain(alice.id);
    expect(body).not.toContain("guest:");
  });
});
