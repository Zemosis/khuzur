// What the blackjack table says about a view: the dealer's lines through a
// round, and the callouts each seat's moves pop over its plate.

import { describe, it, expect } from "vitest";
import { act, closeBetting, createTable, deal, dealerStep, openBetting, placeBet, setReady, sit, viewFor } from "../../src/utils/blackjack/engine.js";
import { beforeResults, dealerLine } from "../../src/components/blackjack/tableInfo.js";
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
  it("a bet and READY pop over the seat that made them", () => {
    const s = table("10♠ 9♥ K♣ 7♦ 8♠ 6♥");
    const bet = placeBet(s, 1, 50);
    expect(labels(s, bet)).toEqual([[1, "BET 50"]]);
    expect(labels(bet, setReady(bet, 1))).toEqual([[1, "READY"]]);
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
    const s = table("A♠ 9♥ 7♣ K♦ 8♠ 6♥");
    const next = dealt(s);
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
