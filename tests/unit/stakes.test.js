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

describe("Khuzur: 1st takes the pot", () => {
  it("the winners are every seat of the 1st-place team", () => {
    const state = { table: { perTeam: 2, teams: 2 }, places: [2, 1], players: [0, 1, 2, 3].map((id) => ({ id, team: id % 2 })) };
    expect(matchWinners("khuzur", state)).toEqual([1, 3]);
  });

  it("with humansOnly, the team's people split the whole pot", () => {
    const seats = [{ userId: "a" }, { userId: "b" }, { userId: null }, { userId: "d" }];
    // 1st: seats 1 and 3 (b and d); 3 stakes of 100 in the pot.
    expect(settlement({ stake: 100, seats, winners: [1, 3], humansOnly: true })).toEqual({
      pot: 300,
      payouts: [
        { seat: 1, userId: "b", amount: 150 },
        { seat: 3, userId: "d", amount: 150 },
      ],
      cpuTake: 0,
    });
  });

  it("a person teamed with a bot takes the pot alone", () => {
    const seats = [{ userId: "a" }, { userId: "b" }, { userId: null }, { userId: null }];
    expect(settlement({ stake: 100, seats, winners: [0, 2], humansOnly: true }).payouts).toEqual([{ seat: 0, userId: "a", amount: 200 }]);
  });

  it("an odd split sends the extra credit to the lowest seat", () => {
    const seats = [{ userId: "a" }, { userId: "b" }, { userId: "c" }, { userId: "d" }, { userId: "e" }, { userId: null }];
    const r = settlement({ stake: 100, seats, winners: [0, 2, 4], humansOnly: true });
    expect(r.payouts.map((p) => p.amount)).toEqual([167, 167, 166]);
    expect(r.cpuTake).toBe(0);
  });

  it("1st place with no people in it: the pot is lost", () => {
    const seats = [{ userId: "a" }, { userId: null }, { userId: "c", forfeited: true }, { userId: null }];
    expect(settlement({ stake: 100, seats, winners: [1, 3], humansOnly: true })).toEqual({ pot: 200, payouts: [], cpuTake: 200 });
    // A player who left and didn't come back counts as a bot.
    expect(settlement({ stake: 100, seats, winners: [0, 2], humansOnly: true }).payouts).toEqual([{ seat: 0, userId: "a", amount: 200 }]);
  });
});
