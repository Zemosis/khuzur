import { describe, it, expect } from "vitest";
import { COPIES, cards, ids } from "../helpers/cards.js";

describe.each(COPIES)("handEvaluator (%s)", (_name, { evaluator: E, constants: C }) => {
  const T = C.COMBO_TYPES;
  const combo = (s) => E.identifyCombination(cards(s));
  const beats = (a, b) => E.canBeatCombination(combo(a), combo(b));

  describe("identifyCombination: valid kinds", () => {
    it.each([
      ["single", "7♠", T.SINGLE],
      ["pair", "9♦ 9♠", T.PAIR],
      ["triple", "Q♣ Q♥ Q♠", T.TRIPLE],
      ["four of a kind", "5♦ 5♣ 5♥ 5♠", T.FOUR_OF_A_KIND],
      ["straight", "3♦ 4♣ 5♥ 6♠ 7♦", T.STRAIGHT],
      ["straight out of order", "7♦ 5♥ 3♦ 6♠ 4♣", T.STRAIGHT],
      ["highest straight J-Q-K-A-2", "J♦ Q♣ K♥ A♠ 2♦", T.STRAIGHT],
      ["wraparound A-2-3-4-5", "A♦ 2♣ 3♥ 4♠ 5♦", T.STRAIGHT],
      ["wraparound 2-3-4-5-6", "2♦ 3♣ 4♥ 5♠ 6♦", T.STRAIGHT],
      ["flush", "3♥ 7♥ 9♥ J♥ K♥", T.FLUSH],
      ["full house", "8♦ 8♣ 8♠ 4♥ 4♠", T.FULL_HOUSE],
      ["full house, pair above triple", "4♦ 4♣ 4♠ K♥ K♠", T.FULL_HOUSE],
      ["straight flush", "5♣ 6♣ 7♣ 8♣ 9♣", T.STRAIGHT_FLUSH],
      ["straight flush J-Q-K-A-2", "J♠ Q♠ K♠ A♠ 2♠", T.STRAIGHT_FLUSH],
      ["straight flush A-2-3-4-5", "A♣ 2♣ 3♣ 4♣ 5♣", T.STRAIGHT_FLUSH],
      ["straight flush 2-3-4-5-6", "2♥ 3♥ 4♥ 5♥ 6♥", T.STRAIGHT_FLUSH],
      ["royal flush", "10♥ J♥ Q♥ K♥ A♥", T.ROYAL_FLUSH],
    ])("%s", (_label, hand, type) => {
      const c = combo(hand);
      expect(c).not.toBeNull();
      expect(c.type).toBe(type);
      expect(c.cards).toHaveLength(hand.split(" ").length);
    });

    it("returns the cards sorted and records the high card", () => {
      const c = combo("9♠ 9♦");
      expect(ids(c.cards)).toEqual(["9♦", "9♠"]);
      expect(c.highCard.id).toBe("9♠");
      expect(c.rank).toBe(C.RANK_VALUES["9"]);
    });

    it("full house records triple and pair ranks", () => {
      const c = combo("4♦ 4♣ 4♠ K♥ K♠");
      expect(c.rank).toBe(C.RANK_VALUES["4"]);
      expect(c.pairRank).toBe(C.RANK_VALUES["K"]);
      expect(c.highCard.id).toBe("4♠");
    });

    it("a wraparound straight's top card is the end of the run, not the 2", () => {
      expect(combo("A♦ 2♠ 3♥ 4♣ 5♦").highCard.id).toBe("5♦");
      expect(combo("A♦ 2♠ 3♥ 4♣ 5♦").rank).toBe(C.RANK_VALUES["5"]);
      expect(combo("2♠ 3♥ 4♣ 5♦ 6♣").highCard.id).toBe("6♣");
    });

    it("5-card hands carry a strength", () => {
      expect(combo("3♦ 4♣ 5♥ 6♠ 7♦").strength).toBe(C.POKER_COMBO_STRENGTH[T.STRAIGHT]);
      expect(combo("10♥ J♥ Q♥ K♥ A♥").strength).toBe(C.POKER_COMBO_STRENGTH[T.ROYAL_FLUSH]);
    });
  });

  describe("identifyCombination: invalid", () => {
    it.each([
      ["empty", ""],
      ["mismatched pair", "9♦ 10♠"],
      ["mixed triple", "Q♣ Q♥ K♠"],
      ["four that isn't a set", "5♦ 5♣ 5♥ 6♠"],
      ["4-card straight", "3♦ 4♣ 5♥ 6♠"],
      ["K-A-2-3-4 wraparound (only A and 2 may wrap)", "K♦ A♣ 2♥ 3♠ 4♦"],
      ["Q-K-A-2-3 wraparound", "Q♦ K♣ A♥ 2♠ 3♦"],
      ["5 unrelated cards", "3♦ 5♣ 9♥ J♠ K♦"],
      ["two pair plus one", "3♦ 3♣ 9♥ 9♠ K♦"],
      ["four of a kind plus kicker", "5♦ 5♣ 5♥ 5♠ 9♦"],
      ["6 cards", "3♦ 4♣ 5♥ 6♠ 7♦ 8♣"],
      ["13 cards", "3♦ 4♦ 5♦ 6♦ 7♦ 8♦ 9♦ 10♦ J♦ Q♦ K♦ A♦ 2♦"],
    ])("%s", (_label, hand) => {
      expect(combo(hand)).toBeNull();
    });

    it("null and undefined input", () => {
      expect(E.identifyCombination(null)).toBeNull();
      expect(E.identifyCombination(undefined)).toBeNull();
    });
  });

  describe("canBeatCombination: same kind", () => {
    it.each([
      ["higher single rank", "8♦", "7♠", true],
      ["same rank, higher suit", "7♠", "7♥", true],
      ["same rank, lower suit", "7♥", "7♠", false],
      ["2 beats ace", "2♦", "A♠", true],
      ["2♠ beats 2♥", "2♠", "2♥", true],
      ["3 loses to 4", "3♠", "4♦", false],
      ["higher pair", "10♦ 10♣", "9♥ 9♠", true],
      ["pair with the spade wins the tie", "9♦ 9♠", "9♣ 9♥", true],
      ["pair without the spade loses the tie", "9♣ 9♥", "9♦ 9♠", false],
      ["higher triple", "K♦ K♣ K♥", "Q♣ Q♥ Q♠", true],
      ["lower triple", "5♦ 5♣ 5♥", "Q♣ Q♥ Q♠", false],
      ["higher four", "6♦ 6♣ 6♥ 6♠", "5♦ 5♣ 5♥ 5♠", true],
      ["lower four", "4♦ 4♣ 4♥ 4♠", "5♦ 5♣ 5♥ 5♠", false],
    ])("%s", (_label, a, b, expected) => {
      expect(beats(a, b)).toBe(expected);
    });

    it("identical play never beats itself", () => {
      expect(beats("7♠", "7♠")).toBe(false);
      expect(beats("3♦ 4♣ 5♥ 6♠ 7♦", "3♦ 4♣ 5♥ 6♠ 7♦")).toBe(false);
    });
  });

  describe("canBeatCombination: different kinds never beat", () => {
    it.each([
      ["pair on a single", "3♦ 3♣", "2♠"],
      ["single on a pair", "2♠", "3♦ 3♣"],
      ["triple on a pair", "4♦ 4♣ 4♥", "3♦ 3♣"],
      ["four of a kind on a 2 (no bombs)", "3♦ 3♣ 3♥ 3♠", "2♦"],
      ["four of a kind on a pair of 2s", "3♦ 3♣ 3♥ 3♠", "2♦ 2♣"],
      ["four of a kind on a triple", "3♦ 3♣ 3♥ 3♠", "2♦ 2♣ 2♥"],
      ["5-card hand on a single", "3♦ 4♣ 5♥ 6♠ 7♦", "4♦"],
      ["four on a straight", "A♦ A♣ A♥ A♠", "3♦ 4♣ 5♥ 6♠ 7♦"],
    ])("%s", (_label, a, b) => {
      expect(beats(a, b)).toBe(false);
    });

    it("null combos never beat", () => {
      expect(E.canBeatCombination(null, combo("3♦"))).toBe(false);
      expect(E.canBeatCombination(combo("3♦"), null)).toBe(false);
    });
  });

  describe("canBeatCombination: 5-card hands", () => {
    const ladder = [
      ["straight", "10♦ J♣ Q♥ K♠ A♦"],
      ["flush", "3♥ 5♥ 7♥ 9♥ J♥"],
      ["full house", "3♦ 3♣ 3♠ 4♥ 4♠"],
      ["straight flush", "3♣ 4♣ 5♣ 6♣ 7♣"],
      ["royal flush", "10♦ J♦ Q♦ K♦ A♦"],
    ];
    ladder.forEach(([lowName, low], i) => {
      ladder.slice(i + 1).forEach(([highName, high]) => {
        it(`any ${highName} beats any ${lowName}`, () => {
          expect(beats(high, low)).toBe(true);
          expect(beats(low, high)).toBe(false);
        });
      });
    });

    it.each([
      ["straight: higher top card", "4♦ 5♣ 6♥ 7♠ 8♦", "3♦ 4♣ 5♥ 6♠ 7♠", true],
      ["straight: same top rank, higher top suit", "3♦ 4♣ 5♥ 6♠ 7♠", "3♣ 4♦ 5♦ 6♦ 7♥", true],
      ["straight: same top rank, lower top suit", "3♣ 4♦ 5♦ 6♦ 7♥", "3♦ 4♣ 5♥ 6♠ 7♠", false],
      ["straight: J-Q-K-A-2 is the highest", "J♦ Q♣ K♥ A♠ 2♦", "10♠ J♠ Q♥ K♥ A♠", true],
      ["straight: 2-3-4-5-6 beats A-2-3-4-5", "2♦ 3♣ 4♥ 5♠ 6♦", "A♠ 2♠ 3♥ 4♥ 5♠", true],
      ["straight: 3-4-5-6-7 beats 2-3-4-5-6", "3♦ 4♣ 5♥ 6♠ 7♦", "2♠ 3♠ 4♠ 5♥ 6♠", true],
      ["straight: 2-3-4-5-6 loses to 3-4-5-6-7", "2♠ 3♠ 4♠ 5♥ 6♠", "3♦ 4♣ 5♥ 6♠ 7♦", false],
      ["straight: wraps tie-break on the top card's suit", "A♦ 2♦ 3♦ 4♣ 5♠", "A♠ 2♠ 3♣ 4♦ 5♥", true],
      ["flush: a 2-high flush beats a king-high one", "4♥ 8♥ 9♥ 10♥ 2♥", "3♣ 4♣ 5♣ 6♣ K♣", true],
      ["flush: higher suit wins over a higher top card", "3♣ 5♣ 7♣ 9♣ J♣", "4♦ 6♦ 8♦ 10♦ A♦", true],
      ["flush: lower suit loses whatever its top card", "4♦ 6♦ 8♦ 10♦ 2♦", "3♣ 5♣ 7♣ 9♣ J♣", false],
      ["flush: same top rank, higher suit", "3♠ 5♠ 7♠ 9♠ A♠", "4♥ 6♥ 8♥ 10♥ A♥", true],
      ["flush: same suit, higher top card", "4♥ 6♥ 8♥ 10♥ K♥", "3♥ 5♥ 7♥ 9♥ Q♥", true],
      ["flush: same suit, lower top card", "3♥ 5♥ 7♥ 9♥ Q♥", "4♥ 6♥ 8♥ 10♥ K♥", false],
      ["full house: higher triple", "9♦ 9♣ 9♠ 3♥ 3♠", "8♦ 8♣ 8♠ A♥ A♠", true],
      ["full house: lower triple", "8♦ 8♣ 8♠ A♥ A♠", "9♦ 9♣ 9♠ 3♥ 3♠", false],
      ["straight flush: higher top card", "4♥ 5♥ 6♥ 7♥ 8♥", "3♠ 4♠ 5♠ 6♠ 7♠", true],
      ["straight flush J-Q-K-A-2 still below royal", "J♠ Q♠ K♠ A♠ 2♠", "10♦ J♦ Q♦ K♦ A♦", false],
      ["straight flush A-2-3-4-5 is the lowest", "A♠ 2♠ 3♠ 4♠ 5♠", "3♦ 4♦ 5♦ 6♦ 7♦", false],
      ["royal flush: spades over hearts", "10♠ J♠ Q♠ K♠ A♠", "10♥ J♥ Q♥ K♥ A♥", true],
    ])("%s", (_label, a, b, expected) => {
      expect(beats(a, b)).toBe(expected);
    });
  });

  describe("validatePlay", () => {
    it("a lead accepts any valid combination", () => {
      ["3♦", "2♠", "5♦ 5♣", "3♦ 4♣ 5♥ 6♠ 7♦", "5♦ 5♣ 5♥ 5♠"].forEach((h) => {
        const r = E.validatePlay(cards(h), null);
        expect(r.valid).toBe(true);
        expect(r.combination).not.toBeNull();
      });
    });

    it("rejects an invalid combination with a reason", () => {
      const r = E.validatePlay(cards("3♦ 5♣"), null);
      expect(r).toEqual({ valid: false, reason: "Invalid combination", combination: null });
    });

    it("rejects a play that doesn't beat the table", () => {
      const r = E.validatePlay(cards("5♦"), combo("9♠"));
      expect(r.valid).toBe(false);
      expect(r.reason).toBe("Must play a stronger combination");
      expect(r.combination.type).toBe(T.SINGLE);
    });

    it("accepts a play that beats the table", () => {
      expect(E.validatePlay(cards("10♦"), combo("9♠")).valid).toBe(true);
      expect(E.validatePlay(cards("3♥ 5♥ 7♥ 9♥ J♥"), combo("3♦ 4♣ 5♥ 6♠ 7♦")).valid).toBe(true);
    });

    it("rejects a wrong card count against the table", () => {
      expect(E.validatePlay(cards("2♦ 2♠"), combo("3♦")).valid).toBe(false);
    });
  });

  describe("findValidPlays", () => {
    const hand = cards("4♦ 9♣ 9♠ K♥ K♠ 2♦");

    it("returns no plays when leading (current behaviour)", () => {
      expect(E.findValidPlays(hand, null)).toEqual([]);
    });

    it("lists every single that beats the table", () => {
      const plays = E.findValidPlays(hand, combo("9♥"));
      expect(plays.map((p) => p.cards[0].id).sort()).toEqual(["2♦", "9♠", "K♥", "K♠"].sort());
    });

    it("lists every pair that beats the table", () => {
      const plays = E.findValidPlays(hand, combo("9♦ 9♥"));
      expect(plays.map((p) => ids(p.cards).join(" ")).sort()).toEqual(["9♣ 9♠", "K♥ K♠"]);
    });

    it("finds a 5-card answer and nothing when none exists", () => {
      const five = cards("3♥ 5♥ 7♥ 9♥ J♥ 4♠");
      expect(E.findValidPlays(five, combo("3♦ 4♣ 5♦ 6♠ 7♦")).map((p) => p.type)).toContain(T.FLUSH);
      expect(E.findValidPlays(cards("3♦ 5♣"), combo("2♠"))).toEqual([]);
    });
  });
});
