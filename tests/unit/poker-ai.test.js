import { describe, it, expect } from "vitest";
import { chenScore, chooseAction, equity, madeStrength, position } from "../../src/utils/poker/ai.js";
import { act, viewFor } from "../../src/utils/poker/engine.js";
import { tableWith, dealt, pc, seededRandom } from "../helpers/poker.js";

// Six players, button on seat 0: 1 and 2 post the blinds, 3 acts first.
const six = (holes, board) => dealt(tableWith([1000, 1000, 1000, 1000, 1000, 1000]), { button: 0, holes, board });

describe("poker CPU", () => {
  it("scores starting hands with the Chen formula", () => {
    expect(chenScore(pc("A♠ A♦"))).toBe(20);
    expect(chenScore(pc("K♠ K♦"))).toBe(16);
    expect(chenScore(pc("A♠ K♠"))).toBe(12);
    expect(chenScore(pc("7♠ 2♦"))).toBe(-1);
  });

  it("knows where each seat acts from", () => {
    const v = viewFor(six(), 3);
    expect([1, 2, 3, 4, 5, 0].map((seat) => position(v, seat))).toEqual(["blind", "blind", "early", "middle", "late", "late"]);
  });

  it("MEDIUM raises aces and folds seven-deuce first to act", () => {
    const aces = six({ 3: "A♠ A♦" });
    expect(chooseAction(viewFor(aces, 3), 3, "MEDIUM", seededRandom(1))).toEqual({ type: "raise", amount: 30 });
    const junk = six({ 3: "7♠ 2♦" });
    expect(chooseAction(viewFor(junk, 3), 3, "MEDIUM", seededRandom(1))).toEqual({ type: "fold" });
  });

  it("rates top pair above a weaker pair, and a set above both", () => {
    expect(madeStrength(pc("A♠ K♦"), pc("K♣ 7♦ 2♥"))).toBe(0.65);
    expect(madeStrength(pc("A♠ 7♣"), pc("K♣ 7♦ 2♥"))).toBe(0.45);
    expect(madeStrength(pc("7♠ 7♣"), pc("K♣ 7♦ 2♥"))).toBe(0.8);
  });

  it("aces win about 85% heads-up", () => {
    expect(equity(pc("A♠ A♦"), [], 1, 2000, seededRandom(3))).toBeCloseTo(0.85, 1);
  });

  it("every level only makes legal moves", () => {
    for (const level of ["EASY", "MEDIUM", "HARD"]) {
      const rng = seededRandom(level.length);
      let s = six(undefined, "2♣ 7♦ 9♥ J♠ 3♣");
      for (let i = 0; i < 40 && s.phase === "BETTING"; i++) {
        s = act(s, s.turn, chooseAction(viewFor(s, s.turn), s.turn, level, rng)); // act throws on an illegal move
      }
    }
  });
});
