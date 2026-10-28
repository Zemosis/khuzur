import { describe, it, expect } from "vitest";
import * as E from "../../src/utils/blackjack/engine.js";
import { riggedShoe } from "../helpers/blackjack.js";

const player = (seat, extra = {}) => ({ key: `key-${seat}`, name: `P${seat}`, avatar: null, ...extra });
const ids = (cs) => cs.map((c) => (c ? c.id : c));

/** Seats every bettor (bets: { seat: amount }), opens betting, bets, readies, closes betting. */
function bet(shoeIds, bets, { credit = false, bankrolls = {}, others = [] } = {}) {
  let s = E.createTable({ credit, shoe: riggedShoe(shoeIds) });
  const seats = [...Object.keys(bets).map(Number), ...others];
  for (const seat of seats) s = E.sit(s, seat, player(seat, bankrolls[seat] != null ? { bankroll: bankrolls[seat] } : {}));
  s = E.openBetting(s);
  for (const [seat, amount] of Object.entries(bets)) {
    s = E.placeBet(s, Number(seat), amount);
    s = E.setReady(s, Number(seat));
  }
  return E.closeBetting(s);
}

/** bet(...) and deal. */
const play = (shoeIds, bets, opts) => E.deal(bet(shoeIds, bets, opts));

/** Runs the dealer until the round is over. */
function dealerOut(s) {
  while (s.phase === E.PHASES.DEALER) s = E.dealerStep(s);
  return s;
}

describe("blackjack engine", () => {
  it("deals first base first, the dealer up card, round two, then the hole card", () => {
    const s = play("2♠ 3♠ 4♠ 5♠ 6♠ 7♠", { 0: 100, 2: 100 });
    expect(ids(s.seats[0].hands[0].cards)).toEqual(["2♠.0", "5♠.0"]);
    expect(ids(s.seats[2].hands[0].cards)).toEqual(["3♠.0", "6♠.0"]);
    expect(ids(s.dealer.cards)).toEqual(["4♠.0", "7♠.0"]);
    expect(s.dealer.revealed).toBe(false);
    expect(s.dealt).toBe(6);
    expect(s.roundNumber).toBe(1);
    expect(s.phase).toBe(E.PHASES.TURNS);
    expect(s.turn).toEqual({ seat: 0, hand: 0 });
  });

  it("bets come out of the bankroll at closeBetting; non-bettors get a skip", () => {
    let s = E.createTable({ shoe: riggedShoe("2♠") });
    s = E.sit(s, 0, player(0));
    s = E.sit(s, 1, player(1));
    s = E.openBetting(s);
    expect(s.phase).toBe(E.PHASES.BETTING);
    s = E.placeBet(s, 0, 100);
    expect(s.seats[0].bankroll).toBe(1000); // not taken yet
    s = E.closeBetting(s);
    expect(s.phase).toBe(E.PHASES.DEALING);
    expect(s.seats[0]).toMatchObject({ bankroll: 900, inRound: true, lastBet: 100, skipped: 0 });
    expect(s.seats[0].hands).toHaveLength(1);
    expect(s.seats[0].hands[0]).toMatchObject({ cards: [], bet: 100, doubled: false, fromSplit: false, done: false });
    expect(s.seats[1]).toMatchObject({ bankroll: 1000, inRound: false, skipped: 1, hands: [] });

    // Nobody bets: betting reopens and everyone seated gets a skip.
    let t = E.openBetting(E.createTable({ shoe: riggedShoe("2♠") }));
    expect(t.phase).toBe(E.PHASES.WAITING);
    t = E.openBetting(E.sit(t, 3, player(3)));
    t = E.closeBetting(t);
    expect(t.phase).toBe(E.PHASES.BETTING);
    expect(t.seats[3].skipped).toBe(1);
  });

  it("refuseBet puts the seat out of the round with its bet back", () => {
    let s = bet("9♠ 8♠ 7♠ 6♠ 5♠ 4♠", { 0: 100, 1: 50 });
    s = E.refuseBet(s, 0);
    expect(s.seats[0]).toMatchObject({ bankroll: 1000, inRound: false, hands: [] });
    s = E.deal(s);
    expect(s.seats[0].hands).toEqual([]);
    expect(ids(s.seats[1].hands[0].cards)).toEqual(["9♠.0", "7♠.0"]);

    // Nobody left in the round: dealing reopens betting.
    let t = E.refuseBet(bet("9♠", { 0: 100 }), 0);
    t = E.deal(t);
    expect(t.phase).toBe(E.PHASES.BETTING);
    expect(t.dealt).toBe(0);
    expect(() => E.refuseBet(t, 0)).toThrow();
  });

  it("offers insurance on an Ace and pays 2:1 when the dealer has blackjack", () => {
    let s = play("10♠ A♣ 9♥ K♣", { 0: 100 });
    expect(s.phase).toBe(E.PHASES.INSURANCE);
    expect(E.insuranceDone(s)).toBe(false);
    s = E.insure(s, 0, true);
    expect(s.seats[0].bankroll).toBe(850);
    expect(s.seats[0].insurance).toBe(50);
    expect(E.insuranceDone(s)).toBe(true);
    expect(() => E.insure(s, 0, false)).toThrow();
    s = E.closeInsurance(s);
    expect(s.phase).toBe(E.PHASES.ROUND_OVER);
    expect(s.dealer.revealed).toBe(true);
    expect(s.seats[0].hands[0]).toMatchObject({ result: "lose", payout: 0 });
    expect(s.seats[0].bankroll).toBe(1000); // 850 + 3 × 50
    expect(s.events.map((e) => e.type)).toContain("dealer_blackjack");
    const sum = E.roundSummary(s);
    expect(sum.seatResults[0]).toMatchObject({ staked: 150, returned: 150, net: 0, insurance: 50, insurancePayout: 150 });
    expect(sum.houseNet).toBe(0);
  });

  it("loses insurance and goes to turns when the dealer has no blackjack", () => {
    let s = play("10♠ 10♦ A♣ 9♥ 8♦ 7♣", { 0: 100, 1: 100 });
    expect(s.phase).toBe(E.PHASES.INSURANCE);
    s = E.insure(s, 0, true);
    s = E.closeInsurance(s); // seat 1 never answered: declined
    expect(s.seats[1]).toMatchObject({ insurance: null, answered: true, bankroll: 900 });
    expect(s.phase).toBe(E.PHASES.TURNS);
    expect(s.dealer.revealed).toBe(false);
    expect(s.turn).toEqual({ seat: 0, hand: 0 });
    s = E.act(s, 0, "STAND");
    s = dealerOut(E.act(s, 1, "STAND"));
    // Dealer soft 18: seat 0 (19) wins, seat 1 (18) pushes.
    expect(s.seats[0].bankroll).toBe(1050); // 1000 - 100 - 50 + 200
    const r = E.roundSummary(s).seatResults[0];
    expect(r).toMatchObject({ staked: 150, returned: 200, net: 50, insurancePayout: 0 });
  });

  it("ends the round at the peek on a dealer blackjack under a 10, original bets only", () => {
    const s = play("9♠ K♣ 9♥ A♣", { 0: 100 });
    expect(s.phase).toBe(E.PHASES.ROUND_OVER);
    expect(s.dealer.revealed).toBe(true);
    expect(s.seats[0].hands[0]).toMatchObject({ result: "lose", payout: 0, bet: 100 });
    expect(s.seats[0].bankroll).toBe(900);
    expect(E.roundSummary(s).seatResults[0].net).toBe(-100);
    expect(() => E.act(s, 0, "DOUBLE")).toThrow("Not your turn");
  });

  it("a player blackjack is done at once and pays 3:2 at the end", () => {
    let s = play("A♠ 9♦ 10♣ K♥ 8♦ 7♣", { 0: 100, 2: 100 });
    expect(s.seats[0].hands[0].done).toBe(true);
    expect(s.events).toContainEqual(expect.objectContaining({ type: "blackjack", seat: 0, hand: 0 }));
    expect(s.turn).toEqual({ seat: 2, hand: 0 });
    s = dealerOut(E.act(s, 2, "STAND"));
    expect(s.seats[0].hands[0]).toMatchObject({ result: "blackjack", payout: 250 });
    expect(s.seats[0].bankroll).toBe(1150);
    expect(s.seats[2].hands[0]).toMatchObject({ result: "push", payout: 100 });
    expect(s.seats[2].bankroll).toBe(1000);
  });

  it("HIT to bust ends the hand and moves the turn to the next seat", () => {
    let s = play("10♠ 9♦ 10♣ 6♠ 8♦ 7♣ K♠", { 0: 100, 1: 100 });
    s = E.act(s, 0, "HIT");
    expect(ids(s.seats[0].hands[0].cards)).toEqual(["10♠.0", "6♠.0", "K♠.0"]);
    expect(s.seats[0].hands[0].done).toBe(true);
    expect(s.events.map((e) => e.type)).toEqual(["hit", "bust"]);
    expect(s.events[0]).toMatchObject({ seat: 0, hand: 0, total: 26 });
    expect(s.turn).toEqual({ seat: 1, hand: 0 });
    expect(() => E.act(s, 0, "HIT")).toThrow("Not your turn");
  });

  it("DOUBLE takes one card, doubles the bet and ends the hand", () => {
    let s = play("6♠ 10♣ 5♠ 7♣ 9♥", { 0: 100 });
    expect(E.legalActions(s, 0)).toEqual({ hit: true, stand: true, double: true, split: false });
    s = E.act(s, 0, "DOUBLE");
    expect(s.seats[0].hands[0]).toMatchObject({ bet: 200, doubled: true, done: true });
    expect(s.seats[0].hands[0].cards).toHaveLength(3);
    expect(s.seats[0].bankroll).toBe(800);
    expect(s.phase).toBe(E.PHASES.DEALER);
    s = dealerOut(s);
    expect(s.seats[0].hands[0]).toMatchObject({ result: "win", payout: 400 });
    expect(s.seats[0].bankroll).toBe(1200);
  });

  it("SPLIT 8s plays two hands in order, each with its own bet", () => {
    let s = play("8♠ 10♣ 8♥ 7♣ 3♦ 10♦ 9♠", { 0: 100 });
    expect(E.legalActions(s, 0).split).toBe(true);
    s = E.act(s, 0, "SPLIT");
    const [h0, h1] = s.seats[0].hands;
    expect(ids(h0.cards)).toEqual(["8♠.0", "3♦.0"]);
    expect(ids(h1.cards)).toEqual(["8♥.0"]); // draws when its turn comes
    expect(h0).toMatchObject({ bet: 100, fromSplit: true, done: false });
    expect(h1).toMatchObject({ bet: 100, fromSplit: true, done: false });
    expect(s.seats[0].bankroll).toBe(800);
    expect(s.turn).toEqual({ seat: 0, hand: 0 });
    expect(E.legalActions(s, 0).double).toBe(true); // double after split
    s = E.act(s, 0, "HIT"); // 21 ends the hand; hand 1 draws
    expect(s.seats[0].hands[0].done).toBe(true);
    expect(ids(s.seats[0].hands[1].cards)).toEqual(["8♥.0", "9♠.0"]);
    expect(s.turn).toEqual({ seat: 0, hand: 1 });
    s = dealerOut(E.act(s, 0, "STAND"));
    expect(s.seats[0].hands[0]).toMatchObject({ result: "win", payout: 200 });
    expect(s.seats[0].hands[1]).toMatchObject({ result: "push", payout: 100 });
    expect(s.seats[0].bankroll).toBe(1100);
  });

  it("split Aces take one card each, can't be hit or resplit, and 21 is not blackjack", () => {
    let s = play("A♠ 10♣ A♥ 7♣ K♦ A♦", { 0: 100 });
    s = E.act(s, 0, "SPLIT");
    const [h0, h1] = s.seats[0].hands;
    expect(ids(h0.cards)).toEqual(["A♠.0", "K♦.0"]);
    expect(ids(h1.cards)).toEqual(["A♥.0", "A♦.0"]);
    expect(h0).toMatchObject({ splitAces: true, done: true });
    expect(h1).toMatchObject({ splitAces: true, done: true }); // a pair of Aces again, but no resplit
    expect(s.phase).toBe(E.PHASES.DEALER);
    expect(E.legalActions(s, 0)).toEqual({ hit: false, stand: false, double: false, split: false });
    expect(() => E.act(s, 0, "HIT")).toThrow("Not your turn");
    s = dealerOut(s);
    expect(s.seats[0].hands[0]).toMatchObject({ result: "win", payout: 200 });
    expect(s.seats[0].hands[1]).toMatchObject({ result: "lose", payout: 0 });
  });

  it("K and 10 can be split; a fifth hand can't", () => {
    let s = play("K♠ 9♣ 10♥ 8♣ 10♦ Q♦ J♦", { 0: 100 });
    s = E.act(s, 0, "SPLIT"); // [K 10♦] [10♥]
    expect(E.legalActions(s, 0).split).toBe(true);
    s = E.act(s, 0, "SPLIT"); // [K Q] [10♦] [10♥]
    s = E.act(s, 0, "SPLIT"); // [K J] [Q] [10♦] [10♥]
    expect(s.seats[0].hands.map((h) => ids(h.cards))).toEqual([["K♠.0", "J♦.0"], ["Q♦.0"], ["10♦.0"], ["10♥.0"]]);
    expect(s.seats[0].bankroll).toBe(600);
    expect(E.legalActions(s, 0).split).toBe(false);
    expect(() => E.act(s, 0, "SPLIT")).toThrow("You can't split now");
  });

  it("can't double or split without the bankroll to cover it", () => {
    const s = play("8♠ 10♣ 8♥ 7♣", { 0: 100 }, { bankrolls: { 0: 150 } });
    expect(s.seats[0].bankroll).toBe(50);
    expect(E.legalActions(s, 0)).toEqual({ hit: true, stand: true, double: false, split: false });
    expect(() => E.act(s, 0, "DOUBLE")).toThrow("You can't double now");
    expect(() => E.act(s, 0, "SPLIT")).toThrow("You can't split now");
    expect(() => E.act(s, 0, "WIN")).toThrow();
  });

  it("the dealer reveals, hits 16, stands on soft 17", () => {
    let s = E.act(play("10♠ 10♣ 9♠ 6♣ 5♣", { 0: 100 }), 0, "STAND");
    expect(s.phase).toBe(E.PHASES.DEALER);
    s = E.dealerStep(s);
    expect(s.dealer.revealed).toBe(true);
    expect(s.events.at(-1)).toMatchObject({ type: "dealer_reveal", total: 16 });
    s = E.dealerStep(s);
    expect(s.events.at(-1)).toMatchObject({ type: "dealer_hit", total: 21 });
    expect(s.phase).toBe(E.PHASES.DEALER);
    s = E.dealerStep(s);
    expect(s.events.map((e) => e.type)).toContain("dealer_stand");
    expect(s.phase).toBe(E.PHASES.ROUND_OVER);
    expect(s.seats[0].hands[0].result).toBe("lose");

    let t = E.act(play("10♠ 6♣ 9♠ A♣", { 0: 100 }), 0, "STAND");
    t = E.dealerStep(E.dealerStep(t)); // reveal, then stand on soft 17
    expect(t.phase).toBe(E.PHASES.ROUND_OVER);
    expect(t.dealer.cards).toHaveLength(2);
    expect(t.events.at(-2)).toMatchObject({ type: "dealer_stand", total: 17 });
    expect(t.seats[0].hands[0].result).toBe("win");

    let u = E.act(play("10♠ 10♣ 9♠ 6♣ K♣", { 0: 100 }), 0, "STAND");
    u = dealerOut(u);
    expect(u.events.map((e) => e.type)).toContain("dealer_bust");
    expect(u.events.map((e) => e.type)).not.toContain("dealer_stand");
    expect(u.seats[0].hands[0].result).toBe("win");
  });

  it("skips the dealer's draw when every hand busted", () => {
    const s = E.act(play("10♠ 10♣ 6♠ 6♣ K♠", { 0: 100 }), 0, "HIT");
    expect(s.phase).toBe(E.PHASES.ROUND_OVER);
    expect(s.dealer.revealed).toBe(true);
    expect(s.dealer.cards).toHaveLength(2);
    expect(s.dealt).toBe(5);
    expect(s.seats[0].hands[0]).toMatchObject({ result: "lose", payout: 0 });
  });

  it("roundSummary: staked, returned, net and houseNet add up", () => {
    let s = play("A♠ 6♠ 8♠ 10♣ K♥ 5♠ 8♥ 7♣ 4♦ 10♦ 3♦ 9♦", { 0: 100, 1: 100, 2: 100 });
    expect(s.turn).toEqual({ seat: 1, hand: 0 });
    s = E.act(s, 1, "DOUBLE"); // 15
    s = E.act(s, 2, "SPLIT"); // [8 10] [8]
    s = E.act(s, 2, "STAND"); // hand 1 draws: [8 3]
    s = E.act(s, 2, "HIT"); // 20
    s = dealerOut(E.act(s, 2, "STAND"));
    const sum = E.roundSummary(s);
    expect(sum.roundNumber).toBe(1);
    expect(sum.dealer).toEqual({ cards: ["10♣.0", "7♣.0"], total: 17 });
    const [r0, r1, r2] = sum.seatResults;
    expect(r0).toMatchObject({ seat_index: 0, player_key: "key-0", name: "P0", staked: 100, returned: 250, net: 150, blackjack: true, doubled: false, split: false });
    expect(r0.hands).toEqual([{ cards: ["A♠.0", "K♥.0"], bet: 100, result: "blackjack", payout: 250 }]);
    expect(r1).toMatchObject({ staked: 200, returned: 0, net: -200, doubled: true, insurance: null, insurancePayout: 0 });
    expect(r2).toMatchObject({ staked: 200, returned: 400, net: 200, split: true });
    expect(sum.houseNet).toBe(-150);
    expect(sum.seatResults.reduce((n, r) => n + r.net, 0)).toBe(-sum.houseNet);
    expect(s.seats.slice(0, 3).map((p) => p.bankroll)).toEqual([1150, 800, 1200]);
  });

  it("credit tables settle without touching the bankroll", () => {
    const s = dealerOut(E.act(play("10♠ 10♣ 9♠ 7♣", { 0: 100 }, { credit: true, bankrolls: { 0: 500 } }), 0, "STAND"));
    expect(s.seats[0].hands[0]).toMatchObject({ result: "win", payout: 200 });
    expect(s.seats[0].bankroll).toBe(400);
  });

  it("reshuffles before the deal once the cut card is passed", () => {
    let s = bet("2♠", { 0: 100 });
    s = { ...s, dealt: 234 };
    const before = s.shoe;
    s = E.deal(s, () => 0.3);
    expect(s.events[0].type).toBe("shuffle");
    expect(s.dealt).toBe(4);
    expect(s.shoe).toHaveLength(312);
    expect(s.shoe).not.toBe(before);

    // A table made without a shoe shuffles one at its first deal.
    let t = E.createTable();
    expect(t.shoe).toEqual([]);
    expect(t.dealt).toBe(234);
    t = E.openBetting(E.sit(t, 0, player(0)));
    t = E.deal(E.closeBetting(E.placeBet(t, 0, 10)), () => 0.7);
    expect(t.events[0].type).toBe("shuffle");
    expect(t.dealt).toBe(4);
  });

  it("standUp mid-turn stands the hands and passes the turn", () => {
    let s = play("10♠ 9♦ 10♣ 6♠ 8♦ 7♣", { 0: 100, 1: 100 }, { others: [3] });
    s = E.standUp(s, 3); // not in the round: the seat empties
    expect(s.seats[3]).toBeNull();
    s = E.standUp(s, 0);
    expect(s.seats[0]).toMatchObject({ leaving: true, inRound: true });
    expect(s.seats[0].hands[0].done).toBe(true);
    expect(s.events).toContainEqual(expect.objectContaining({ type: "leave", seat: 0 }));
    expect(s.turn).toEqual({ seat: 1, hand: 0 });
    s = E.standUp(s, 1); // the last hand: the dealer plays
    expect(s.phase).toBe(E.PHASES.DEALER);
    s = dealerOut(s);
    expect(s.seats[0].hands[0]).toMatchObject({ result: "lose", payout: 0 }); // 16 vs 17
    expect(s.seats[1].hands[0]).toMatchObject({ result: "push", payout: 100 });
    s = E.clearRound(s);
    expect(s.seats[0]).toBeNull();
    expect(s.seats[1]).toBeNull();
    expect(s.phase).toBe(E.PHASES.WAITING);

    // Insurance not yet answered counts as declined.
    let t = play("10♠ A♣ 9♥ 7♣", { 0: 100 });
    t = E.standUp(t, 0);
    expect(t.seats[0]).toMatchObject({ answered: true, insurance: null });
    expect(E.insuranceDone(t)).toBe(true);
  });

  it("viewFor hides the hole card, the shoe and player keys", () => {
    let s = play("10♠ 9♦ 10♣ 6♠ 8♦ 7♥", { 0: 100, 1: 100 });
    const v = E.viewFor(s, 0);
    const json = JSON.stringify(v);
    expect(json).not.toContain("7♥.0");
    expect(json).not.toContain("key-0");
    expect(json).not.toContain("key-1");
    expect(v.shoe).toBeUndefined();
    expect(v.dealer.cards[0].id).toBe("10♣.0");
    expect(v.dealer.cards[1]).toBeNull();
    expect(v.dealerTotal).toBe(10);
    expect(v.mySeat).toBe(0);
    expect(v.legal).toEqual({ hit: true, stand: true, double: true, split: false });
    expect(E.viewFor(s, 1).legal.hit).toBe(false);
    expect(s.dealer.cards[1].id).toBe("7♥.0"); // the state itself is untouched

    s = E.dealerStep(E.act(E.act(s, 0, "STAND"), 1, "STAND"));
    const after = E.viewFor(s, -1);
    expect(after.dealer.cards[1].id).toBe("7♥.0");
    expect(after.dealerTotal).toBe(17);
  });

  it("a changed bet clears ready; the same amount keeps it", () => {
    let s = E.createTable({ shoe: riggedShoe("2♠") });
    s = E.openBetting(E.sit(s, 0, player(0, { bankroll: 1000 })));
    s = E.setReady(E.placeBet(s, 0, 100), 0);
    expect(E.placeBet(s, 0, 100).seats[0].ready).toBe(true);
    expect(E.placeBet(s, 0, 150).seats[0].ready).toBe(false);
    expect(E.placeBet(s, 0, 0).seats[0].ready).toBe(false);
  });

  it("refuses bad amounts: 9, 10.5, '100', more than the bankroll", () => {
    let s = E.createTable({ shoe: riggedShoe("2♠") });
    s = E.openBetting(E.sit(s, 0, player(0, { bankroll: 340 })));
    expect(() => E.placeBet(s, 0, 9)).toThrow("The minimum bet is 10");
    expect(() => E.placeBet(s, 0, 10.5)).toThrow("Pick an amount");
    expect(() => E.placeBet(s, 0, "100")).toThrow("Pick an amount");
    expect(() => E.placeBet(s, 0, -10)).toThrow("Pick an amount");
    expect(() => E.placeBet(s, 0, null)).toThrow("Pick an amount");
    expect(() => E.placeBet(s, 0, 500)).toThrow("You have 340");
    expect(() => E.setReady(s, 0)).toThrow();
    s = E.setReady(E.placeBet(s, 0, 340), 0);
    expect(s.seats[0]).toMatchObject({ bet: 340, ready: true });
    expect(E.bettingDone(s)).toBe(true);
    s = E.placeBet(s, 0, 0);
    expect(s.seats[0]).toMatchObject({ bet: 0, ready: false });
    expect(E.bettingDone(s)).toBe(false);
    expect(() => E.placeBet(E.closeBetting(E.placeBet(s, 0, 10)), 0, 20)).toThrow();
  });

  it("rebuy only below the minimum, only at a free table", () => {
    let s = E.sit(E.createTable(), 0, player(0, { bankroll: 9 }));
    s = E.rebuy(s, 0);
    expect(s.seats[0].bankroll).toBe(1000);
    expect(() => E.rebuy(E.setBankroll(s, 0, 10), 0)).toThrow();

    const credit = E.sit(E.createTable({ credit: true }), 0, player(0, { bankroll: 0 }));
    expect(() => E.rebuy(credit, 0)).toThrow();

    // In a round, even when broke.
    const inRound = play("10♠ 10♣ 9♠ 7♣", { 0: 1000 });
    expect(inRound.seats[0].bankroll).toBe(0);
    expect(() => E.rebuy(inRound, 0)).toThrow();
  });

  it("seats: taken seats, moving between rounds, and the free default bankroll", () => {
    let s = E.sit(E.createTable(), 0, player(0));
    expect(s.seats[0]).toMatchObject({ bankroll: 1000, bet: 0, ready: false, hands: [], insurance: null, skipped: 0, inRound: false, leaving: false });
    expect(() => E.sit(s, 0, player(9))).toThrow("That seat is taken");
    expect(() => E.sit(s, 7, player(9))).toThrow();
    s = E.moveSeat(E.openBetting(s), 0, 4);
    expect(s.seats[0]).toBeNull();
    expect(s.seats[4].name).toBe("P0");
    expect(() => E.moveSeat(E.placeBet(s, 4, 10), 4, 1)).toThrow("Move seats between rounds");
  });

  it("clearRound clears last round's bets and READY, so seats can move again", () => {
    let s = dealerOut(E.act(play("10♠ 10♣ 9♠ 7♣", { 0: 100 }), 0, "STAND"));
    s = E.clearRound(s);
    expect(s.phase).toBe(E.PHASES.WAITING);
    expect(s.seats[0]).toMatchObject({ bet: 0, ready: false, lastBet: 100, hands: [], inRound: false });
    s = E.moveSeat(s, 0, 3);
    expect(s.seats[0]).toBeNull();
    expect(s.seats[3]).toMatchObject({ name: "P0", bet: 0, ready: false });
  });

  it("keeps each seat's record since sitting down: net, rounds played, rounds won", () => {
    // Round 1: P0 18 beats the dealer's 17 (+100); P2 15 loses to it (-200).
    let s = dealerOut(E.act(E.act(play("10♠ 10♣ 10♦ 8♠ 5♣ 7♥", { 0: 100, 2: 200 }), 0, "STAND"), 2, "STAND"));
    expect(s.seats[0]).toMatchObject({ net: 100, rounds: 1, won: 1 });
    expect(s.seats[2]).toMatchObject({ net: -200, rounds: 1, won: 0 });

    // Round 2 on, carrying the record: P0 is insured against a dealer blackjack and breaks even.
    s = E.openBetting(E.clearRound(s));
    s = { ...s, shoe: riggedShoe("10♠ A♣ 9♥ K♣"), dealt: 0 };
    s = E.deal(E.closeBetting(E.setReady(E.placeBet(s, 0, 100), 0)));
    s = E.closeInsurance(E.insure(s, 0, true));
    expect(s.seats[0]).toMatchObject({ net: 100, rounds: 2, won: 1 });
    expect(s.seats[2]).toMatchObject({ net: -200, rounds: 1 }); // sat this one out
  });

  it("counts the record at a credit table too, where settling leaves the bankroll alone", () => {
    // A blackjack against the dealer's 17 pays 150.
    const s = dealerOut(play("A♠ 10♣ K♠ 7♥", { 0: 100 }, { credit: true, bankrolls: { 0: 500 } }));
    expect(s.seats[0]).toMatchObject({ net: 150, rounds: 1, won: 1, bankroll: 400 });
  });

  it("a rebuy tops up the chips but keeps the record: the loss stays in the net", () => {
    // P0 bets everything on 15 against the dealer's 17 and loses it.
    let s = dealerOut(E.act(play("10♠ 10♦ 5♣ 7♥", { 0: 1000 }), 0, "STAND"));
    expect(s.seats[0]).toMatchObject({ bankroll: 0, net: -1000, rounds: 1, rebuys: 0 });
    s = E.rebuy(E.openBetting(E.clearRound(s)), 0);
    expect(s.seats[0]).toMatchObject({ bankroll: 1000, net: -1000, rounds: 1, rebuys: 1 });
  });
});
