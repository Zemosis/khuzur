// The blackjack LOG tab: each event as a sentence (eventLine) and as what the
// tab draws (eventEntry): who, a coloured chip, the cards, the total.

import { describe, it, expect } from "vitest";
import { eventEntry, eventLine, withContext } from "../../src/utils/blackjack/log.js";
import { cards } from "../helpers/blackjack.js";

const names = ["NOVSH #0001", "BOB #0002", "CAT #0003"];
const [five] = cards("5♠");

describe("blackjack log lines", () => {
  it("says every move in words", () => {
    expect(eventLine({ type: "bet", seat: 0, amount: 1000 }, names)).toBe("NOVSH bets 1,000");
    expect(eventLine({ type: "hit", seat: 1, card: five, total: 15 }, names)).toBe("BOB hits 5♠ for 15");
    expect(eventLine({ type: "double", seat: 1, card: five, before: 11, total: 16 }, names)).toBe("BOB doubles on 11 and draws 5♠");
    expect(eventLine({ type: "dealt", seat: 0, cards: cards("A♠ 7♦"), total: 18 }, names)).toBe("NOVSH is dealt A♠ 7♦");
    expect(eventLine({ type: "dealer_up", card: five }, names)).toBe("Dealer shows 5♠");
    expect(eventLine({ type: "dealer_reveal", card: five, total: 16 }, names)).toBe("Dealer turns over 5♠ for 16");
    expect(eventLine({ type: "dealer_hit", card: five, total: 21 }, names)).toBe("Dealer draws 5♠ for 21");
    expect(eventLine({ type: "dealer_blackjack", total: 21 }, names)).toBe("Dealer has blackjack");
    expect(eventLine({ type: "shuffle" }, names)).toBe("New shoe");
    expect(eventLine({ type: "result", seat: 2, hand: 0, amount: 800, bet: 400 }, names)).toBe("CAT wins 400");
    expect(eventLine({ type: "result", seat: 2, hand: 0, amount: 0, bet: 400 }, names)).toBe("CAT loses 400");
    expect(eventLine({ type: "result", seat: 2, hand: 0, amount: 400, bet: 400 }, names)).toBe("CAT pushes");
  });

  it("logs nothing for what the log doesn't show", () => {
    expect(eventLine({ type: "leave", seat: 0 }, names)).toBeNull(); // the server logs it: "ANN left the table."
    expect(eventLine({ type: "ready", seat: 0 }, names)).toBeNull();
    expect(eventEntry({ type: "leave", seat: 0 }, names)).toBeNull();
    expect(eventEntry({ type: "bet", seat: 0, amount: 0 }, names)).toBeNull();
  });
});

describe("blackjack log entries", () => {
  it("a round's header, and a new shoe as a divider", () => {
    expect(eventEntry({ type: "round", roundNumber: 5 }, names)).toMatchObject({ kind: "round", label: "ROUND 5" });
    expect(eventEntry({ type: "shuffle" }, names)).toMatchObject({ kind: "pot", text: "New shoe" });
  });

  it("a bet is a chip and its amount, not a decision", () => {
    expect(eventEntry({ type: "bet", seat: 0, amount: 1000 }, names)).toMatchObject({ kind: "action", name: "NOVSH", action: "bet", amount: "1,000", move: false });
  });

  it("the deal shows a player's cards and total", () => {
    const hand = cards("A♠ 7♦");
    expect(eventEntry({ type: "dealt", seat: 0, cards: hand, total: 18 }, names)).toMatchObject({ kind: "play", name: "NOVSH", combo: "18", cards: hand, move: false });
  });

  it("a hit, a double and a split are moves with their cards", () => {
    expect(eventEntry({ type: "hit", seat: 1, card: five, total: 15 }, names)).toMatchObject({ kind: "action", action: "hit", cards: [five], total: 15 });
    expect(eventEntry({ type: "double", seat: 1, card: five, total: 16 }, names)).toMatchObject({ kind: "action", action: "double", cards: [five], total: 16 });
    expect(eventEntry({ type: "stand", seat: 1, total: 18 }, names)).toMatchObject({ kind: "action", action: "stand", total: 18 });
    const split = eventEntry({ type: "split", seat: 1, ranks: ["8", "8"] }, names);
    expect(split).toMatchObject({ kind: "action", action: "split" });
    expect(split.move).toBeUndefined();
  });

  it("the dealer's cards are their own strip", () => {
    expect(eventEntry({ type: "dealer_up", card: five }, names)).toMatchObject({ kind: "street", label: "DEALER SHOWS", cards: [five] });
    expect(eventEntry({ type: "dealer_reveal", card: five, total: 16 }, names)).toMatchObject({ kind: "street", label: "HOLE CARD · 16", cards: [five] });
    expect(eventEntry({ type: "dealer_hit", card: five, total: 21 }, names)).toMatchObject({ kind: "street", label: "DEALER DRAWS · 21", cards: [five] });
  });

  it("the dealer's stand and bust name the dealer", () => {
    expect(eventEntry({ type: "dealer_stand", total: 17 }, names)).toMatchObject({ kind: "action", name: "DEALER", action: "stand", total: 17, move: false });
    expect(eventEntry({ type: "dealer_bust", total: 25 }, names)).toMatchObject({ kind: "action", name: "DEALER", action: "bust", total: 25, move: false });
    expect(eventEntry({ type: "dealer_blackjack", total: 21 }, names)).toMatchObject({ kind: "action", name: "DEALER", action: "blackjack", move: false });
  });

  it("a player's own blackjack and bust aren't decisions", () => {
    expect(eventEntry({ type: "blackjack", seat: 0, total: 21 }, names)).toMatchObject({ action: "blackjack", move: false });
    expect(eventEntry({ type: "bust", seat: 0, total: 24 }, names)).toMatchObject({ action: "bust", total: 24, move: false });
  });

  it("a win is a gold banner, a blackjack named on it; a loss and a push are chips", () => {
    expect(eventEntry({ type: "result", seat: 0, hand: 0, amount: 200, bet: 100, result: "win" }, names)).toMatchObject({ kind: "win", name: "NOVSH", amount: "100", hand: null });
    expect(eventEntry({ type: "result", seat: 0, hand: 0, amount: 250, bet: 100, result: "blackjack" }, names)).toMatchObject({ kind: "win", amount: "150", hand: "Blackjack" });
    expect(eventEntry({ type: "result", seat: 0, hand: 0, amount: 0, bet: 100, result: "lose" }, names)).toMatchObject({ kind: "action", action: "lose", amount: "100", move: false });
    expect(eventEntry({ type: "result", seat: 0, hand: 0, amount: 100, bet: 100, result: "push" }, names)).toMatchObject({ kind: "action", action: "push", amount: null, move: false });
  });

  it("a result with no hand to measure it against gets no entry", () => {
    expect(eventEntry({ type: "result", seat: 0, hand: 0, amount: 200 }, names)).toBeNull();
  });
});

describe("withContext", () => {
  it("a result learns its bet and how it ended", () => {
    const seats = [{ hands: [{ cards: cards("A♠ K♦"), bet: 100, result: "blackjack" }] }];
    expect(withContext({ type: "result", seat: 0, hand: 0, amount: 250 }, seats)).toMatchObject({ bet: 100, result: "blackjack" });
  });
});
