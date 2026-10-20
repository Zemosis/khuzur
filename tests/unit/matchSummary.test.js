// The match page's figures: one player against the table, and the score lines.

import { describe, it, expect } from "vitest";
import { seatName, summaryRows, scoreLines } from "../../src/utils/matchSummary";

const r = (seat, extra) => ({ seat, points: 0, scoreAfter: 0, cardsLeft: null, eaten: null, folded: null, eliminated: false, ...extra });

describe("seatName", () => {
  it("drops the tag, and names an unnamed CPU by its seat", () => {
    expect(seatName({ seat: 0, name: "ANN #0002" })).toBe("ANN");
    expect(seatName({ seat: 2, name: "Bot Saturn" })).toBe("Bot Saturn");
    expect(seatName({ seat: 2, name: null })).toBe("CPU · seat 3");
  });
});

describe("summaryRows — Thirteen", () => {
  // Three rounds, three seats. Seat 2 is out after round 2.
  const rounds = [
    { number: 1, winnerSeat: 0, results: [r(0, { cardsLeft: 0, points: 0, scoreAfter: 0 }), r(1, { cardsLeft: 4, points: 4, scoreAfter: 4 }), r(2, { cardsLeft: 13, points: 26, scoreAfter: 26 })] },
    { number: 2, winnerSeat: 1, results: [r(0, { cardsLeft: 2, points: 2, scoreAfter: 2 }), r(1, { cardsLeft: 0, points: 0, scoreAfter: 4 }), r(2, { cardsLeft: 3, points: 3, scoreAfter: 29, eliminated: true })] },
    { number: 3, winnerSeat: 0, results: [r(0, { cardsLeft: 0, points: 0, scoreAfter: 2 }), r(1, { cardsLeft: 6, points: 6, scoreAfter: 10 }), r(2, { cardsLeft: 0, points: 0, scoreAfter: 29, eliminated: true })] },
  ];

  it("one player's figures beside the table average, skipping rounds a seat sat out after going out", () => {
    const rows = Object.fromEntries(summaryRows("thirteen", rounds, 0).map((x) => [x.label, x]));
    expect(rows["Rounds won"]).toMatchObject({ mine: 2, avg: 1, better: "high" });
    expect(rows["Avg cards left when caught"]).toMatchObject({ mine: 2, better: "low" });
    // Seat 1 was caught with 4 and 6 (avg 5); seat 2 with 13 and 3 (avg 8).
    expect(rows["Avg cards left when caught"].avg).toBeCloseTo((2 + 5 + 8) / 3);
    expect(rows["Points taken"]).toMatchObject({ mine: 2, better: "low" });
    expect(rows["Points taken"].avg).toBeCloseTo((2 + 10 + 29) / 3);
  });

  it("a player never caught has no average cards left", () => {
    const won = rounds.map((x) => ({ ...x, winnerSeat: 0, results: x.results.map((y) => (y.seat === 0 ? { ...y, cardsLeft: 0 } : y)) }));
    const row = summaryRows("thirteen", won, 0).find((x) => x.label === "Avg cards left when caught");
    expect(row.mine).toBeNull();
  });
});

describe("summaryRows — Muushig", () => {
  const rounds = [
    { number: 1, winnerSeat: 1, results: [r(0, { eaten: 0, folded: true }), r(1, { eaten: 5 }), r(2, { eaten: 0 })] },
    { number: 2, winnerSeat: null, results: [r(0, { eaten: 3 }), r(1, { eaten: 2 }), r(2, { eaten: 0, folded: true })] },
  ];

  it("piles eaten, rounds gone in and folded, sweeps and rounds won", () => {
    const rows = Object.fromEntries(summaryRows("muushig", rounds, 1).map((x) => [x.label, x]));
    expect(rows["Piles eaten"]).toMatchObject({ mine: 7, better: "high" });
    expect(rows["Piles eaten"].avg).toBeCloseTo(10 / 3);
    expect(rows["Rounds gone in"]).toMatchObject({ mine: 2 });
    expect(rows["Rounds folded"]).toMatchObject({ mine: 0 });
    expect(rows["Sweeps"]).toMatchObject({ mine: 1 });
    expect(rows["Rounds won"]).toMatchObject({ mine: 1 });
  });
});

describe("scoreLines", () => {
  it("a line per seat from the starting score: 0 in Thirteen, 15 in Muushig", () => {
    const rounds = [
      { number: 1, results: [r(0, { scoreAfter: 3 }), r(1, { scoreAfter: 0 })] },
      { number: 2, results: [r(0, { scoreAfter: 5 }), r(1, { scoreAfter: 7 })] },
    ];
    expect(scoreLines("thirteen", rounds, [0, 1])).toEqual({ 0: [0, 3, 5], 1: [0, 0, 7] });
    expect(scoreLines("muushig", rounds, [0, 1])).toEqual({ 0: [15, 3, 5], 1: [15, 0, 7] });
  });
});
