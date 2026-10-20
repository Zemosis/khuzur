// The CPU's card numbers and combinations must agree with the rulebook's
// handEvaluator exactly, or it would plan with plays the table rejects.

import { describe, it, expect } from "vitest";
import { COPIES, cards, seededRandom } from "../helpers/cards.js";

describe.each(COPIES)("aiCombos (%s)", (_name, { combos: C, evaluator: E, deck: D }) => {
  const deck = D.createDeck();
  const byInt = new Map(deck.map((c) => [C.cardInt(c), c]));
  const toCards = (ints) => ints.map((v) => byInt.get(v));
  const ints = (s) => cards(s).map(C.cardInt).sort((a, b) => a - b);
  const rand = seededRandom(13);
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const hands = Array.from({ length: 150 }, () => shuffle(deck).slice(0, 13).map(C.cardInt).sort((a, b) => a - b));

  it("numbers cards from 3♦ (0) to 2♠ (51)", () => {
    expect(ints("3♦ 3♠ A♥ 2♠")).toEqual([0, 3, 46, 51]);
  });

  it("names every combination in a hand the way the rulebook does", () => {
    for (const hand of hands) {
      for (const c of C.combosOf(hand)) {
        expect(E.identifyCombination(toCards(c.cards))?.type).toBe(c.kind);
      }
    }
  });

  it("turns down what the rulebook turns down", () => {
    for (let i = 0; i < 3000; i++) {
      const picked = shuffle(deck).slice(0, 2 + Math.floor(rand() * 4));
      const mine = C.classify(picked.map(C.cardInt).sort((a, b) => a - b));
      expect(mine?.kind ?? null).toBe(E.identifyCombination(picked)?.type ?? null);
    }
  });

  it("more power beats less, exactly when the rulebook says it beats", () => {
    const pool = hands.flatMap((h) => C.combosOf(h)).filter((c) => c.size === 5 || rand() < 0.05);
    for (let i = 0; i < 20000; i++) {
      const a = pool[Math.floor(rand() * pool.length)];
      const b = pool[Math.floor(rand() * pool.length)];
      if (a.size !== b.size || a.cards.some((v) => b.cards.includes(v))) continue;
      const beats = E.canBeatCombination(E.identifyCombination(toCards(a.cards)), E.identifyCombination(toCards(b.cards)));
      expect(a.power > b.power, `${a.kind} vs ${b.kind}`).toBe(beats);
    }
  });

  it("finds the wraparound straights, topped by their 5 and 6", () => {
    const low = C.classify(ints("A♦ 2♣ 3♥ 4♠ 5♦"));
    const next = C.classify(ints("2♦ 3♣ 4♥ 5♠ 6♦"));
    const plain = C.classify(ints("3♦ 4♣ 5♥ 6♠ 7♦"));
    expect([low.kind, next.kind]).toEqual(["STRAIGHT", "STRAIGHT"]);
    expect(low.power < next.power && next.power < plain.power).toBe(true);
  });

  it("plans the fewest plays: a straight and a pair, not seven singles", () => {
    const hand = ints("3♦ 4♣ 5♥ 6♠ 7♦ 9♣ 9♥");
    const planner = C.makePlanner(hand, C.combosOf(hand), () => 1);
    expect(planner.value()).toBe(2);
    expect(planner.plays().map((c) => c.kind).sort()).toEqual(["PAIR", "STRAIGHT"]);
    // And answers for part of the hand: without the 9♥, the 9♣ is a single.
    expect(planner.value(planner.all ^ (1 << 6))).toBe(2);
  });

  it("a quick plan uses every card once", () => {
    for (const hand of hands.slice(0, 50)) {
      const used = C.greedyPlan(hand).flatMap((c) => c.cards).sort((a, b) => a - b);
      expect(used).toEqual(hand);
    }
  });
});
