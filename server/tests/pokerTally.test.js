// A player's record at a poker table, built from real hands.

import { describe, it, expect } from "vitest";
import { tallyHand, LOGGED_HANDS } from "../game/pokerTally.js";
import { act as play, handSummary } from "../game/poker/engine.js";
import { tableWith, dealt } from "../../tests/helpers/poker.js";

// P0 on the button heads-up against P2, both holding pairs; the board pairs neither.
const showdown = () => {
  let s = dealt(tableWith([1000, null, 1000, null, null, null]), { button: 0, holes: { 0: "A♠ A♦", 2: "K♠ K♦" }, board: "2♣ 7♦ 9♥ J♠ 3♣" });
  s = play(s, 0, { type: "call" });
  s = play(s, 2, { type: "check" });
  for (let street = 0; street < 3; street++) {
    s = play(s, 2, { type: "check" });
    s = play(s, 0, { type: "check" });
  }
  return handSummary(s);
};

describe("tallyHand", () => {
  it("counts the hand, logs it with the cards, and tallies the rank shown down", () => {
    const hand = showdown();
    const winner = tallyHand(null, hand, hand.seatResults.find((r) => r.seat_index === 0));
    expect(winner).toMatchObject({ hands_played: 1, hands_won: 1, net: 10, biggest_pot: 20, vpip_hands: 1, showdowns: 1, showdowns_won: 1, showdown_ranks: { PAIR: { shown: 1, won: 1 } } });
    expect(winner.hands).toEqual([
      {
        n: hand.roundNumber,
        net: 10,
        won: 20,
        hole: ["A♠", "A♦"],
        board: ["2♣", "7♦", "9♥", "J♠", "3♣"],
        folded: null,
        showdown: true,
        rank: "PAIR",
        shown: "Pair of aces",
        winners: [{ name: "P0", hand: "Pair of aces" }],
      },
    ]);
    const loser = tallyHand(null, hand, hand.seatResults.find((r) => r.seat_index === 2));
    expect(loser).toMatchObject({ hands_won: 0, net: -10, showdowns: 1, showdowns_won: 0 });
    // Checked through, P2 (left of the button) showed first, so the kings count as shown, not won.
    expect(loser.showdown_ranks).toEqual({ PAIR: { shown: 1, won: 0 } });
  });

  it("a fold is logged with its street and no rank", () => {
    let s = dealt(tableWith([1000, null, 1000, null, null, null]), { button: 0, holes: { 0: "7♣ 2♦" } });
    s = play(s, 0, { type: "fold" });
    const hand = handSummary(s);
    const t = tallyHand(null, hand, hand.seatResults.find((r) => r.seat_index === 0));
    expect(t.hands[0]).toMatchObject({ net: -5, folded: "PREFLOP", showdown: false, rank: null, hole: ["7♣", "2♦"] });
    expect(t.showdown_ranks).toBeUndefined();
  });

  it("keeps only the latest hands in the log, while the counts keep everything", () => {
    const hand = showdown();
    const me = hand.seatResults.find((r) => r.seat_index === 0);
    let t = null;
    for (let i = 0; i < LOGGED_HANDS + 3; i++) t = tallyHand(t, { ...hand, roundNumber: i + 1 }, me);
    expect(t.hands_played).toBe(LOGGED_HANDS + 3);
    expect(t.hands).toHaveLength(LOGGED_HANDS);
    expect(t.hands[0].n).toBe(4);
  });
});
