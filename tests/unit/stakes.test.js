import { describe, it, expect } from "vitest";
import { STAKES, isStakeTier, matchWinners, settlement } from "../../src/utils/stakes.js";

const seat = (id, score, eaten) => ({ id, score, eaten });

describe("STAKES", () => {
  it("is 100 / 500 / 2,000", () => {
    expect(STAKES).toEqual({ LOW: 100, MID: 500, HIGH: 2000 });
    expect(isStakeTier("MID")).toBe(true);
    expect(isStakeTier("toString")).toBe(false);
  });
});

describe("matchWinners", () => {
  it("in Thirteen is the last player not eliminated", () => {
    const out = (isEliminated) => ({ score: 0, isEliminated });
    expect(matchWinners("thirteen", { players: [out(true), out(false), out(true)] })).toEqual([1]);
  });

  it("is the one lowest score", () => {
    expect(matchWinners("muushig", { players: [seat(0, 3, 1), seat(1, -1, 2), seat(2, 0, 4), seat(3, 9, 0), seat(4, 7, 0)] })).toEqual([1]);
  });

  it("breaks a score tie on piles eaten in the last round", () => {
    expect(matchWinners("muushig", { players: [seat(0, 0, 1), seat(1, 0, 3), seat(2, 4, 0), seat(3, 9, 0), seat(4, 7, 0)] })).toEqual([1]);
  });

  it("is everyone tied on score and piles", () => {
    expect(matchWinners("muushig", { players: [seat(0, 5, 0), seat(1, 0, 2), seat(2, 6, 0), seat(3, 0, 2), seat(4, 7, 0)] })).toEqual([1, 3]);
  });
});

describe("settlement", () => {
  const humans = (...ids) => [0, 1, 2, 3, 4].map((i) => ({ userId: ids[i] ?? null, forfeited: false }));

  it("gives a human winner the whole pot", () => {
    expect(settlement({ stake: 500, seats: humans("a", "b", "c"), winners: [1] })).toEqual({
      pot: 1500,
      payouts: [{ seat: 1, userId: "b", amount: 1500 }],
      cpuTake: 0,
    });
  });

  it("loses the pot to a bot", () => {
    expect(settlement({ stake: 100, seats: humans("a", "b"), winners: [3] })).toEqual({ pot: 200, payouts: [], cpuTake: 200 });
  });

  it("loses the pot when the winning seat was forfeited", () => {
    const seats = humans("a", "b");
    seats[0].forfeited = true;
    expect(settlement({ stake: 100, seats, winners: [0] })).toEqual({ pot: 200, payouts: [], cpuTake: 200 });
  });

  it("splits a tie, the odd credit to the lowest seat", () => {
    expect(settlement({ stake: 100, seats: humans("a", "b", "c"), winners: [2, 0] })).toEqual({
      pot: 300,
      payouts: [
        { seat: 0, userId: "a", amount: 150 },
        { seat: 2, userId: "c", amount: 150 },
      ],
      cpuTake: 0,
    });
    const odd = settlement({ stake: 2000, seats: humans("a", "b", "c"), winners: [0, 1, 4] });
    expect(odd.payouts).toEqual([
      { seat: 0, userId: "a", amount: 2000 },
      { seat: 1, userId: "b", amount: 2000 },
    ]);
    expect(odd.cpuTake).toBe(2000);
  });

  it("hands the credits left over by an uneven split to the lowest seats, one each", () => {
    const r = settlement({ stake: 100, seats: humans("a", "b"), winners: [0, 1, 2] });
    expect(r.payouts).toEqual([
      { seat: 0, userId: "a", amount: 67 },
      { seat: 1, userId: "b", amount: 67 },
    ]);
    expect(r.cpuTake).toBe(66);
    expect(r.payouts.reduce((t, p) => t + p.amount, 0) + r.cpuTake).toBe(r.pot);
  });
});

describe("potText", () => {
  it("names who took a credit match's pot, a covered seat by its player", async () => {
    const { potText } = await import("../../src/components/credits/potText.js");
    const names = ["ANN #0001", "BOB #0002 (CPU)", "Bot Saturn"];
    expect(potText({ pot: 300, payouts: [{ seat: 1, amount: 300 }], void: false }, names)).toBe("BOB wins the 300 pot.");
    expect(potText({ pot: 1500, payouts: [], void: false }, names)).toBe("A bot won: the 1,500 pot is lost.");
    expect(potText({ pot: 300, payouts: [{ seat: 0, amount: 150 }, { seat: 1, amount: 150 }], void: false }, names)).toBe("ANN and BOB split the 300 pot.");
    expect(potText({ pot: 300, payouts: [], void: true }, names)).toBe("The match didn't count: every stake went back.");
  });
});
