// Solo match reports: the browser tells the server how a game against CPUs
// ended. These are the checks a report must pass before it is recorded, and
// the placing the server works out from it (it never trusts a reported place).

import { describe, it, expect } from "vitest";
import { parseSoloReport, rankSolo } from "../solo.js";

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

const thirteen = (over = {}) => ({
  matchId: "SOLO-ABC123-1",
  gameType: "thirteen",
  startedAt: iso(20 * 60_000),
  finishedAt: iso(1000),
  me: 0,
  rounds: 6,
  players: [
    { score: 12, eliminated: false },
    { score: 27, eliminated: true },
    { score: 25, eliminated: true },
    { score: 31, eliminated: true },
  ],
  stats: { rounds_played: 6, rounds_won: 3, cards_left_total: 12, hands: { SINGLE: 20, PAIR: 6, STRAIGHT: 1 } },
  ...over,
});

const muushig = (over = {}) => ({
  matchId: "MU-7f3a9c-2",
  gameType: "muushig",
  startedAt: iso(15 * 60_000),
  finishedAt: iso(500),
  me: 0,
  rounds: 9,
  players: [
    { score: 3, lastEaten: 1 },
    { score: -1, lastEaten: 3 },
    { score: 0, lastEaten: 2 },
    { score: 8, lastEaten: 0 },
    { score: 3, lastEaten: 2 },
  ],
  stats: { rounds_played: 9, rounds_won: 2, eaten: 11, gone_in: 7, folded: 2, sweeps: 1 },
  ...over,
});

describe("parseSoloReport", () => {
  it("accepts a well-formed Thirteen and Muushig report", () => {
    expect(parseSoloReport(thirteen())).toMatchObject({ ok: true });
    expect(parseSoloReport(muushig())).toMatchObject({ ok: true });
  });

  it("keeps only known stat keys and hand types", () => {
    const r = parseSoloReport(thirteen({ stats: { ...thirteen().stats, coins: 999, hands: { PAIR: 2, CHEAT: 9 } } }));
    expect(r.ok).toBe(true);
    expect(r.value.stats).toEqual({ rounds_played: 6, rounds_won: 3, cards_left_total: 12, hands: { PAIR: 2 } });
  });

  it.each([
    ["an unknown game", { gameType: "poker" }],
    ["the wrong number of players", { players: thirteen().players.slice(0, 3) }],
    ["a seat that isn't at the table", { me: 4 }],
    ["a non-integer seat", { me: "0" }],
    ["a score out of range", { players: [{ score: 1e6, eliminated: false }, ...thirteen().players.slice(1)] }],
    ["a match that isn't over (no one eliminated)", { players: thirteen().players.map((p) => ({ ...p, eliminated: false })) }],
    ["a finish before the start", { startedAt: iso(1000), finishedAt: iso(60_000) }],
    ["an impossibly short match", { startedAt: iso(3000), finishedAt: iso(1000) }],
    ["a finish in the future", { finishedAt: new Date(now + 10 * 60_000).toISOString() }],
    ["more rounds won than played", { stats: { ...thirteen().stats, rounds_won: 7 } }],
    ["a bad match id", { matchId: "x" }],
    ["a negative hand count", { stats: { ...thirteen().stats, hands: { PAIR: -1 } } }],
  ])("rejects %s", (_label, over) => {
    const r = parseSoloReport(thirteen(over));
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe("string");
  });

  it("rejects a Muushig match nobody finished, and inconsistent round counts", () => {
    expect(parseSoloReport(muushig({ players: muushig().players.map((p) => ({ ...p, score: 4 })) })).ok).toBe(false);
    expect(parseSoloReport(muushig({ stats: { ...muushig().stats, gone_in: 8 } })).ok).toBe(false);
    expect(parseSoloReport(muushig({ stats: { ...muushig().stats, sweeps: 8 } })).ok).toBe(false);
  });

  it("rejects things that aren't reports at all", () => {
    for (const body of [null, undefined, "hi", 42, [], {}]) expect(parseSoloReport(body).ok).toBe(false);
  });
});

describe("reports built by the game pages", () => {
  it("pass these checks for both games", async () => {
    const { thirteenSoloReport, muushigSoloReport } = await import("../../src/utils/soloReport.js");
    const times = { matchId: "SOLO-XYZ789-1", startedAt: iso(10 * 60_000), finishedAt: iso(1000) };
    const t = thirteenSoloReport(
      {
        roundNumber: 1,
        players: [{ score: 0 }, { score: 26, isEliminated: true }, { score: 26, isEliminated: true }, { score: 30, isEliminated: true }],
        moveHistory: [
          { type: "PLAY", playerIndex: 0, combination: { type: "PAIR" } },
          { type: "ROUND_END", winnerIndex: 0, scores: [{ id: 0, score: 0, eliminated: false }] },
        ],
      },
      times,
    );
    expect(parseSoloReport(t)).toMatchObject({ ok: true });

    const m = muushigSoloReport(
      {
        roundNumber: 1,
        players: [{ score: 10 }, { score: 0 }, { score: 15 }, { score: 15 }, { score: 15 }],
        events: [
          {
            type: "roundEnd",
            roundWinner: 1,
            results: [0, 1, 2, 3, 4].map((seat) => ({ seat, eaten: seat === 1 ? 5 : 0, folded: seat > 1 })),
          },
        ],
      },
      { ...times, matchId: "MU-XYZ789-1" },
    );
    expect(parseSoloReport(m)).toMatchObject({ ok: true });
  });
});

describe("rankSolo", () => {
  it("Thirteen: the last player standing first, then lowest score", () => {
    expect(rankSolo("thirteen", thirteen().players)).toEqual([1, 3, 2, 4]);
  });

  it("Muushig: lowest score first, ties broken by last-round piles then seat", () => {
    // Seat 1 (-1) wins, seat 2 (0), then seats 0 and 4 tie on 3: seat 4 ate more.
    expect(rankSolo("muushig", muushig().players)).toEqual([4, 1, 2, 5, 3]);
  });
});

describe("khuzur reports", () => {
  const khuzur = (over = {}) => ({
    matchId: "KZ-7f3a9c-1",
    gameType: "khuzur",
    startedAt: iso(15 * 60_000),
    finishedAt: iso(1000),
    me: 0,
    rounds: 1,
    table: { perTeam: 2, teams: 2, handSize: 5 },
    players: [{ place: 1 }, { place: 2 }, { place: 1 }, { place: 2 }],
    stats: { leads: 9, beats: 12, pickups: 2, picked_up: 7, rounds_played: 1, rounds_won: 1 },
    ...over,
  });

  it("accepts a finished match and places you with your team", () => {
    const r = parseSoloReport(khuzur());
    expect(r.ok).toBe(true);
    expect(r.value.table).toEqual({ perTeam: 2, teams: 2, handSize: 5 });
    expect(rankSolo("khuzur", r.value.players)).toEqual([1, 2, 1, 2]);
  });

  it("rejects places that don't fit the table", () => {
    expect(parseSoloReport(khuzur({ players: [{ place: 1 }, { place: 2 }, { place: 2 }, { place: 2 }] })).ok).toBe(false);
    expect(parseSoloReport(khuzur({ players: [{ place: 1 }, { place: 3 }, { place: 1 }, { place: 3 }] })).ok).toBe(false);
    expect(parseSoloReport(khuzur({ table: { perTeam: 3, teams: 3, handSize: 5 } })).ok).toBe(false);
    expect(parseSoloReport(khuzur({ players: [{ place: 1 }, { place: 2 }] })).ok).toBe(false);
  });

  it("free for all: every place once", () => {
    const ffa = khuzur({ table: { perTeam: 1, teams: 3, handSize: 7 }, players: [{ place: 3 }, { place: 1 }, { place: 2 }], stats: { leads: 1, beats: 1, pickups: 0, picked_up: 0, rounds_played: 1, rounds_won: 0 } });
    expect(parseSoloReport(ffa).ok).toBe(true);
    expect(parseSoloReport({ ...ffa, players: [{ place: 1 }, { place: 1 }, { place: 2 }] }).ok).toBe(false);
  });
});
