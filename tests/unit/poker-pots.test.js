import { describe, it, expect } from "vitest";
import { buildPots, awardPots, fromLeftOf } from "../../src/utils/poker/pots.js";

const live = (...seats) => Array.from({ length: 6 }, (_, i) => seats.includes(i));

describe("poker pots", () => {
  it("one pot when nobody is all-in for less", () => {
    expect(buildPots([100, 100, 100, 0, 0, 0], live(0, 1, 2))).toEqual([{ amount: 300, eligible: [0, 1, 2] }]);
  });

  it("an all-in for less opens a side pot it can't win", () => {
    expect(buildPots([50, 200, 200, 0, 0, 0], live(0, 1, 2))).toEqual([
      { amount: 150, eligible: [0, 1, 2] },
      { amount: 300, eligible: [1, 2] },
    ]);
  });

  it("folded chips count toward the pots but win nothing", () => {
    expect(buildPots([50, 200, 200, 30, 0, 0], live(0, 1, 2))).toEqual([
      { amount: 180, eligible: [0, 1, 2] },
      { amount: 300, eligible: [1, 2] },
    ]);
  });

  it("chips a folder put in above every live player go in the last pot", () => {
    expect(buildPots([40, 40, 100, 0, 0, 0], live(0, 1))).toEqual([{ amount: 180, eligible: [0, 1] }]);
  });

  it("several all-ins make several pots", () => {
    const pots = buildPots([10, 20, 30, 30, 0, 0], live(0, 1, 2, 3));
    expect(pots.map((p) => p.amount)).toEqual([40, 30, 20]);
    expect(pots.map((p) => p.eligible)).toEqual([[0, 1, 2, 3], [1, 2, 3], [2, 3]]);
  });

  it("pays each pot to its best eligible hand", () => {
    const pots = buildPots([50, 200, 200, 0, 0, 0], live(0, 1, 2));
    const { won, results } = awardPots(pots, [9, 5, 7, null, null, null], 0, 6);
    expect(won).toEqual([150, 0, 300, 0, 0, 0]);
    expect(results).toEqual([
      { amount: 150, winners: [0] },
      { amount: 300, winners: [2] },
    ]);
  });

  it("splits a tie, odd chips to the winners first left of the button", () => {
    const { won } = awardPots([{ amount: 25, eligible: [0, 2] }], [5, null, 5, null, null, null], 0, 6);
    expect(won).toEqual([12, 0, 13, 0, 0, 0]);
  });

  it("fromLeftOf lists every seat, starting left of the button", () => {
    expect(fromLeftOf(4, 6)).toEqual([5, 0, 1, 2, 3, 4]);
  });
});
