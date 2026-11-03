// What the blackjack table says about a view: the dealer's lines through a
// round, and the callouts each seat's moves pop over its plate.

import { describe, it, expect } from "vitest";
import { act, closeBetting, createTable, deal, dealerStep, openBetting, placeBet, setReady, sit, viewFor } from "../../src/utils/blackjack/engine.js";
import { SEAT_SIZE, beforeResults, dealerLine, fanStep, fitHands, handLanes } from "../../src/components/blackjack/tableInfo.js";
import { calloutsBetween } from "../../src/components/blackjack/seatCallouts.js";
import { riggedShoe } from "../helpers/blackjack.js";

/** ANN at seat 0 and BOB at seat 1, betting, on a rigged shoe. */
function table(shoe) {
  let s = createTable({ shoe: riggedShoe(shoe) });
  s = sit(sit(s, 0, { name: "ANN" }), 1, { name: "BOB" });
  return openBetting(s);
}
const dealt = (s) => deal(closeBetting(setReady(setReady(placeBet(placeBet(s, 0, 100), 1, 50), 0), 1)));
const view = (s) => viewFor(s, 0);
const labels = (prev, next) => calloutsBetween(view(prev), view(next)).map((c) => [c.seat, c.label]);

describe("dealer lines", () => {
  it("follow the round: bets, the upcard, the hole card, each draw, the stand", () => {
    // ANN 10 7, BOB 9 8; the dealer K up, 6 in the hole, then draws a 2.
    let s = table("10♠ 9♥ K♣ 7♦ 8♠ 6♥ 2♦");
    expect(dealerLine(view(s))).toBe("PLACE YOUR BETS");
    s = dealt(s);
    expect(dealerLine(view(s))).toBe("DEALER SHOWS KING");
    s = act(act(s, 0, "STAND"), 1, "STAND");
    s = dealerStep(s);
    expect(dealerLine(view(s))).toBe("HOLE CARD · 16");
    s = dealerStep(s);
    expect(dealerLine(view(s))).toBe("DEALER DRAWS · 18");
    s = dealerStep(s);
    expect(dealerLine(view(s))).toBe("DEALER HAS 18");
  });

  it("names a numbered upcard as it is", () => {
    const s = dealt(table("10♠ 9♥ 7♣ 7♦ 8♠ 6♥"));
    expect(dealerLine(view(s))).toBe("DEALER SHOWS 7");
  });
});

describe("seat callouts", () => {
  it("picking chips says nothing; DEAL announces the bet, once", () => {
    const s = table("10♠ 9♥ K♣ 7♦ 8♠ 6♥");
    const chips = placeBet(s, 1, 50);
    const more = placeBet(chips, 1, 150);
    expect(labels(s, chips)).toEqual([]);
    expect(labels(chips, more)).toEqual([]);
    // DEAL sends the bet again, then READY: two views, one announcement.
    const again = placeBet(more, 1, 150);
    expect(labels(more, again)).toEqual([]);
    expect(labels(again, setReady(again, 1))).toEqual([[1, "BET 150"]]);
  });

  it("the last DEAL still announces when the deal arrives in the same breath", () => {
    // Everyone's in, so betting closes at once: the views land together and only the last is drawn.
    const s = placeBet(table("10♠ 9♥ K♣ 7♦ 8♠ 6♥"), 0, 100);
    const ready = setReady(s, 0);
    const next = deal(closeBetting(ready));
    expect(labels(s, next)).toEqual([[0, "BET 100"]]);
    expect(labels(ready, next)).toEqual([]); // already announced
  });

  it("a bet changed after DEAL is announced again at the next DEAL", () => {
    const s = table("10♠ 9♥ K♣ 7♦ 8♠ 6♥");
    const ready = setReady(placeBet(s, 1, 50), 1);
    const changed = placeBet(ready, 1, 100);
    expect(labels(ready, changed)).toEqual([]);
    expect(labels(changed, setReady(changed, 1))).toEqual([[1, "BET 100"]]);
  });

  it("clearing a bet is only news if it had been announced", () => {
    const s = table("10♠ 9♥ K♣ 7♦ 8♠ 6♥");
    const chips = placeBet(s, 1, 50);
    expect(labels(chips, placeBet(chips, 1, 0))).toEqual([]);
    const ready = setReady(chips, 1);
    expect(labels(ready, placeBet(ready, 1, 0))).toEqual([[1, "BET CLEARED"]]);
  });

  it("moves show at once; a bust waits for the card to land", () => {
    // ANN 10 6 hits a K and busts.
    const s = dealt(table("10♠ 9♥ K♣ 6♦ 8♠ 6♥ K♦"));
    const hit = act(s, 0, "HIT");
    const fresh = calloutsBetween(view(s), view(hit));
    expect(fresh.map((c) => [c.seat, c.label])).toEqual([
      [0, "HIT"],
      [0, "BUST"],
    ]);
    expect(fresh[0].delay).toBe(0);
    expect(fresh[1].delay).toBeGreaterThan(0);
    expect(new Set(fresh.map((c) => c.id)).size).toBe(2);
  });

  it("a blackjack in the deal waits for the deal", () => {
    const s = setReady(setReady(placeBet(placeBet(table("A♠ 9♥ 7♣ K♦ 8♠ 6♥"), 0, 100), 1, 50), 0), 1);
    const next = deal(closeBetting(s));
    const fresh = calloutsBetween(view(s), view(next));
    expect(fresh.map((c) => [c.seat, c.label])).toEqual([[0, "BLACKJACK!"]]);
    expect(fresh[0].delay).toBeGreaterThan(1000);
  });
});

describe("a settled round held back", () => {
  it("shows every card but no result, payout or record, and the balances before the payout", () => {
    // ANN 10 7 stands and wins 100 against the dealer's 16 + K (bust); BOB 9 8 too, for 50.
    let s = table("10♠ 9♥ K♣ 7♦ 8♠ 6♥ K♦");
    s = dealt(s);
    s = act(act(s, 0, "STAND"), 1, "STAND");
    while (s.phase === "DEALER") s = dealerStep(s);
    expect(s.phase).toBe("ROUND_OVER");
    const settled = view(s);
    const held = beforeResults(settled);

    expect(held.phase).toBe("DEALER");
    expect(held.dealer.cards).toEqual(settled.dealer.cards);
    expect(held.events.some((e) => e.type === "result")).toBe(false);
    expect(held.seats[0].hands[0]).toMatchObject({ result: null, payout: 0, cards: settled.seats[0].hands[0].cards });
    // Bets were out of the bankroll: 1,000 − 100, before the 200 came back.
    expect(settled.seats[0]).toMatchObject({ bankroll: 1100, net: 100, rounds: 1, won: 1 });
    expect(held.seats[0]).toMatchObject({ bankroll: 900, net: 0, rounds: 0, won: 0 });
    expect(held.seats[1]).toMatchObject({ bankroll: 950, net: 0, rounds: 0, won: 0 });
  });

  it("leaves a credit table's balances alone (settling there doesn't pay into them)", () => {
    let s = createTable({ credit: true, shoe: riggedShoe("10♠ K♣ 7♦ 6♥ K♦") });
    s = openBetting(sit(s, 0, { name: "ANN", bankroll: 500 }));
    s = deal(closeBetting(setReady(placeBet(s, 0, 100), 0)));
    s = act(s, 0, "STAND");
    while (s.phase === "DEALER") s = dealerStep(s);
    expect(beforeResults(view(s)).seats[0]).toMatchObject({ bankroll: 400, net: 0 });
  });
});

describe("hands fit their lane", () => {
  const size = SEAT_SIZE.full;
  const hand = (n) => ({ cards: Array.from({ length: n }, () => ({})) });
  const span = ({ cardW, step }, hands) => hands.reduce((w, h) => w + cardW + (h.cards.length - 1) * step + 6, (hands.length - 1) * 8);

  it("a hand with room keeps its full size and half-card fan", () => {
    expect(fitHands([hand(3)], 400, size)).toMatchObject({ cardW: size.card, step: 38 });
    expect(fitHands([hand(3)], null, size)).toMatchObject({ cardW: size.card, step: 38 });
  });

  it("split hands start at the split size", () => {
    expect(fitHands([hand(3), hand(3)], 400, size).cardW).toBe(size.splitCard);
  });

  it("a long hand overlaps tighter before its cards shrink", () => {
    const fit = fitHands([hand(6)], 220, size);
    expect(fit.cardW).toBe(size.card);
    expect(fit.step).toBeLessThan(38);
    expect(fit.width).toBeLessThanOrEqual(220);
  });

  it("11 low cards stay inside a narrow lane, at any cost", () => {
    for (const room of [220, 140, 90]) {
      const hands = [hand(11)];
      const fit = fitHands(hands, room, size);
      expect(fit.cardW).toBeLessThan(size.card);
      expect(span(fit, hands)).toBeLessThanOrEqual(room + 0.01);
    }
  });

  it("four split hands share a lane", () => {
    const hands = [hand(3), hand(2), hand(3), hand(2)];
    const fit = fitHands(hands, 300, size);
    expect(span(fit, hands)).toBeLessThanOrEqual(300.01);
  });

  it("reports the width it comes to", () => {
    const hands = [hand(3), hand(3)];
    const fit = fitHands(hands, 400, size);
    expect(fit.width).toBe(span(fit, hands));
  });

  it("the dealer's cards keep their gap until they run out of room", () => {
    expect(fanStep(3, 80, 86, null)).toBe(86);
    expect(fanStep(3, 80, 86, 500)).toBe(86);
    expect(fanStep(6, 80, 86, 380)).toBe(60);
    expect(fanStep(1, 80, 86, 10)).toBe(86);
  });
});

describe("hand lanes", () => {
  // Seat 0 at the right, as on the table.
  const centres = [840, 690, 500, 310, 160];
  const bounds = [100, 900];

  it("a seat alone may spread to the shoe and the tray", () => {
    expect(handLanes(centres, [true, false, false, false, false], bounds)[0]).toEqual({ left: 100, right: 900 });
  });

  it("neighbours playing split the space between them, with a gap", () => {
    const lanes = handLanes(centres, [true, true, false, false, false], bounds);
    expect(lanes[0]).toEqual({ left: 769, right: 900 });
    expect(lanes[1]).toEqual({ left: 100, right: 761 });
  });

  it("an empty seat between two players doesn't count", () => {
    const lanes = handLanes(centres, [true, false, true, false, false], bounds);
    expect(lanes[0].left).toBe(674);
    expect(lanes[2].right).toBe(666);
  });

  it("only seats in the same row get in each other's way", () => {
    const stacked = [290, 260, 195, 130, 100]; // a phone: 0 and 1 nearly one above the other
    const lanes = handLanes(stacked, [true, true, true, true, true], [90, 300], [0, 1, 2, 1, 0]);
    expect(lanes[0]).toEqual({ left: 199, right: 300 });
    expect(lanes[1]).toEqual({ left: 199, right: 300 });
    expect(lanes[2]).toEqual({ left: 90, right: 300 });
  });

  it("a seat's own limit keeps it out of the dealer's cards", () => {
    const limits = [[704, Infinity], [-Infinity, Infinity], [-Infinity, Infinity], [-Infinity, Infinity], [-Infinity, 360]];
    const lanes = handLanes(centres, [true, false, false, false, true], bounds, undefined, limits);
    expect(lanes[0].left).toBe(704);
    expect(lanes[4].right).toBe(360);
  });
});
