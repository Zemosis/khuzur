// Khuzur's recorded tallies: each seat's place, and leads, beats and pick-ups
// read from the event log (server/game/khuzurStats.js).

import { describe, it, expect } from "vitest";
import { khuzurPlaces, khuzurSeatStats, khuzurSummary } from "../../server/game/khuzurStats.js";

const state = {
  table: { perTeam: 2, teams: 2 },
  places: [2, 1],
  players: [0, 1, 2, 3].map((id) => ({ id, team: id % 2, hand: id === 0 ? [{}, {}] : [] })),
  events: [
    { type: "lead", seat: 0, cards: [{}, {}, {}] },
    { type: "beat", seat: 1, cards: [{}, {}, {}] },
    { type: "pickUp", seat: 2, count: 6 },
    { type: "lead", seat: 3, cards: [{}] },
    { type: "beat", seat: 0, cards: [{}] },
    { type: "out", seat: 3, team: 1, place: 1 },
  ],
};

describe("khuzurPlaces", () => {
  it("gives each seat its team's place", () => {
    expect(khuzurPlaces(state)).toEqual({ 0: 2, 1: 1, 2: 2, 3: 1 });
  });
});

describe("khuzurSeatStats", () => {
  it("counts leads, beats, pick-ups and cards picked up", () => {
    expect(khuzurSeatStats(state, 0)).toEqual({ leads: 1, beats: 1, pickups: 0, picked_up: 0, rounds_played: 1, rounds_won: 0 });
    expect(khuzurSeatStats(state, 2)).toEqual({ leads: 0, beats: 0, pickups: 1, picked_up: 6, rounds_played: 1, rounds_won: 0 });
    expect(khuzurSeatStats(state, 3)).toMatchObject({ rounds_won: 1 });
  });
});

describe("khuzurSummary", () => {
  it("is the match as one round: who went out first, and each seat's place and cards left", () => {
    expect(khuzurSummary(state)).toEqual({
      roundNumber: 1,
      winnerSeat: 3,
      seatResults: [
        { seat_index: 0, place: 2, cards_left: 2, eliminated: false },
        { seat_index: 1, place: 1, cards_left: 0, eliminated: false },
        { seat_index: 2, place: 2, cards_left: 0, eliminated: false },
        { seat_index: 3, place: 1, cards_left: 0, eliminated: false },
      ],
      highlights: null,
    });
  });
});
