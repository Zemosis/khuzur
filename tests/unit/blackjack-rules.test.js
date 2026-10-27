import { describe, it, expect } from "vitest";
import * as R from "../../src/utils/blackjack/rules.js";
import { cards } from "../helpers/blackjack.js";
const hand = (ids, extra = {}) => ({ cards: cards(ids), bet: 100, fromSplit: false, ...extra });

describe("blackjack rules", () => {
  it("builds a 6-deck shoe of 312 distinct ids", () => {
    const shoe = R.createShoe(() => 0.5);
    expect(shoe).toHaveLength(312);
    expect(new Set(shoe.map((c) => c.id)).size).toBe(312);
  });
  it("counts aces soft and hard", () => {
    expect(R.handTotal(cards("A♠ 6♣"))).toEqual({ total: 17, soft: true });
    expect(R.handTotal(cards("A♠ 6♣ 10♦"))).toEqual({ total: 17, soft: false });
    expect(R.handTotal(cards("A♠ A♥ 9♦"))).toEqual({ total: 21, soft: true });
    expect(R.handTotal(cards("K♠ Q♥ 5♦"))).toEqual({ total: 25, soft: false });
  });
  it("a split 21 is not blackjack", () => {
    expect(R.isBlackjack(hand("A♠ K♥"))).toBe(true);
    expect(R.isBlackjack(hand("A♠ K♥", { fromSplit: true }))).toBe(false);
    expect(R.isBlackjack(hand("7♠ 7♥ 7♦"))).toBe(false);
  });
  it("the dealer stands on soft 17", () => {
    expect(R.dealerShouldHit(cards("A♠ 6♣"))).toBe(false);
    expect(R.dealerShouldHit(cards("10♠ 6♣"))).toBe(true);
  });
  it("insurance costs half the bet, rounded down", () => {
    expect(R.insuranceCost(25)).toBe(12);
    expect(R.insuranceCost(1)).toBe(0);
  });
  it("pays 3:2, 1:1, push and loss", () => {
    expect(R.settleHand(hand("A♠ K♥"), cards("10♠ 9♣"))).toEqual({ result: "blackjack", payout: 250 });
    expect(R.settleHand(hand("A♠ K♥", { bet: 25 }), cards("10♠ 9♣"))).toEqual({ result: "blackjack", payout: 62 });
    expect(R.settleHand(hand("10♠ 9♥"), cards("10♣ 8♣"))).toEqual({ result: "win", payout: 200 });
    expect(R.settleHand(hand("10♠ 8♥"), cards("10♣ 8♣"))).toEqual({ result: "push", payout: 100 });
    expect(R.settleHand(hand("10♠ 6♥ 9♦"), cards("10♣ 6♣ 9♣"))).toEqual({ result: "lose", payout: 0 }); // player busts first
    expect(R.settleHand(hand("10♠ 7♥"), cards("10♣ 6♣ 9♣"))).toEqual({ result: "win", payout: 200 });
    expect(R.settleHand(hand("A♠ K♥"), cards("A♣ Q♣"))).toEqual({ result: "push", payout: 100 });
    expect(R.settleHand(hand("7♠ 7♥ 7♦"), cards("A♣ Q♣"))).toEqual({ result: "lose", payout: 0 });
  });
});
