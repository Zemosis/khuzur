// The Blackjack table over time, on fake timers: the betting window, the deal
// pause, insurance and turn clocks, the dealer's steps, the results pause,
// sit-out kicks, and a credit table's money hooks (beforeDeal, fund,
// beforeNextRound).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BlackjackTable, DEFAULT_BLACKJACK_DELAYS, SKIPS_BEFORE_KICK } from "../../src/utils/blackjack/table.js";
import { PHASES, insure as engineInsure, setBankroll as engineSetBankroll } from "../../src/utils/blackjack/engine.js";
import { riggedShoe } from "../helpers/blackjack.js";

const DELAYS = { betting: 100, insurance: 50, turn: 50, deal: 10, dealerStep: 5, results: 20, saveRetry: 10, slowSave: 15 };

let table;
let rounds;
let kicked;
let closed;
const make = (shoeIds, options = {}) => {
  table?.destroy();
  rounds = [];
  kicked = [];
  closed = 0;
  table = new BlackjackTable({
    delays: DELAYS,
    shoe: shoeIds ? riggedShoe(shoeIds) : undefined,
    onRoundEnd: (summary) => rounds.push(summary),
    onKick: (seat) => kicked.push(seat),
    onClosed: () => (closed += 1),
    ...options,
  });
  return table;
};
const player = (key, extra = {}) => ({ key, name: key, avatar: null, ...extra });
const hand = (seat, h = 0) => table.state.seats[seat].hands[h];
/** Lets pending promises (the money hooks) settle without moving the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);
/** A deferred promise the test resolves by hand. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  table?.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("blackjack table", () => {
  it("has the spec's delays and kick count", () => {
    expect(DEFAULT_BLACKJACK_DELAYS).toEqual({
      betting: 15_000,
      insurance: 8_000,
      turn: 15_000,
      deal: 2_500,
      dealerStep: 800,
      results: 5_000,
      saveRetry: 3_000,
      slowSave: 1_000,
    });
    expect(SKIPS_BEFORE_KICK).toBe(5);
  });

  it("opens betting when the first player sits, and deals when the clock runs out", () => {
    make("10♠ 9♥ 7♣ 8♦");
    expect(table.state.phase).toBe(PHASES.WAITING);
    expect(table.phaseMsLeft()).toBeNull();
    expect(table.firstFreeSeat()).toBe(0);
    expect(table.sit(player("A"))).toEqual({ ok: true, seat: 0 });
    expect(table.firstFreeSeat()).toBe(1);
    expect(table.state.phase).toBe(PHASES.BETTING);
    expect(table.phaseMsLeft()).toBe(100);
    expect(table.bet(0, 100)).toEqual({ ok: true });

    // A second player sitting down doesn't restart the clock.
    vi.advanceTimersByTime(60);
    table.sit(player("B"));
    expect(table.phaseMsLeft()).toBe(40);
    vi.advanceTimersByTime(39);
    expect(table.state.phase).toBe(PHASES.BETTING);
    vi.advanceTimersByTime(1);

    expect(table.state.phase).toBe(PHASES.TURNS);
    expect(table.state.turn).toEqual({ seat: 0, hand: 0 });
    expect(hand(0).cards.map((c) => c.id)).toEqual(["10♠.0", "7♣.0"]);
    expect(table.state.dealer.cards).toHaveLength(2);
    expect(table.state.seats[0].bankroll).toBe(900);
    expect(table.state.seats[1].inRound).toBe(false); // B didn't bet: sits the round out
    expect(table.state.seats[1].skipped).toBe(1);
    expect(table.dealMsLeft()).toBe(0);
  });

  it("closes betting early once everyone with a bet is READY", () => {
    make("10♠ 10♥ 9♥ 7♣ 8♣ 8♦");
    table.sit(player("A"));
    table.sit(player("B"));
    expect(table.ready(0)).toEqual({ ok: false, error: "Place a bet first" });
    table.bet(0, 100);
    table.ready(0);
    expect(table.state.phase).toBe(PHASES.BETTING); // B can still bet
    table.bet(1, 50);
    expect(table.state.phase).toBe(PHASES.BETTING);
    expect(table.ready(1)).toEqual({ ok: true });
    expect(table.state.phase).toBe(PHASES.TURNS);
    expect(table.state.seats[0].bankroll).toBe(900);
    expect(table.state.seats[1].bankroll).toBe(950);
    expect(hand(1).cards).toHaveLength(2);
  });

  it("a player who never bets keeps the seat; five skipped windows call onKick", () => {
    make();
    table.sit(player("A"));
    for (let i = 1; i < SKIPS_BEFORE_KICK; i++) {
      vi.advanceTimersByTime(DELAYS.betting);
      expect(table.state.phase).toBe(PHASES.BETTING); // nobody bet: the window reopens
      expect(table.state.seats[0].skipped).toBe(i);
    }
    expect(kicked).toEqual([]);
    vi.advanceTimersByTime(DELAYS.betting);
    expect(kicked).toEqual([0]);
    expect(table.state.seats[0].name).toBe("A"); // standing them up is the owner's call
    vi.advanceTimersByTime(DELAYS.betting * 3);
    expect(kicked).toEqual([0]); // once

    // Rounds played by others count too; the owner stands them up when told.
    make("2♣", {
      onKick: (seat) => {
        kicked.push(seat);
        table.standUp(seat);
      },
    });
    table.sit(player("A"));
    table.sit(player("B"));
    for (let i = 0; i < SKIPS_BEFORE_KICK; i++) {
      // B plays every round and stands at once; A never bets.
      table.bet(1, 10);
      table.ready(1);
      expect(table.state.phase).toBe(PHASES.BETTING); // A hasn't bet: the clock decides
      vi.advanceTimersByTime(DELAYS.betting);
      expect(table.state.phase).toBe(PHASES.TURNS);
      table.move(1, "STAND");
      for (let t = 0; t < 100 && table.state.phase !== PHASES.BETTING; t++) vi.advanceTimersByTime(5);
      expect(table.state.phase).toBe(PHASES.BETTING);
    }
    expect(kicked).toEqual([0]);
    expect(table.state.seats[0]).toBeNull();
    expect(table.state.seats[1].name).toBe("B");
  });

  it("a turn clock running out stands the hand", () => {
    make("10♠ 9♥ 2♣ 8♦ 3♠");
    table.sit(player("A"));
    table.bet(0, 100);
    table.ready(0);
    expect(table.state.phase).toBe(PHASES.TURNS);
    // The clock starts once the deal has had its moment.
    expect(table.phaseMsLeft()).toBe(DELAYS.turn);
    vi.advanceTimersByTime(DELAYS.deal);
    expect(table.phaseMsLeft()).toBe(DELAYS.turn);
    vi.advanceTimersByTime(30);
    expect(table.phaseMsLeft()).toBe(20);

    // Each decision gets a fresh clock.
    return table.move(0, "HIT").then((r) => {
      expect(r).toEqual({ ok: true });
      expect(hand(0).cards).toHaveLength(3);
      expect(table.phaseMsLeft()).toBe(DELAYS.turn);
      vi.advanceTimersByTime(DELAYS.turn - 1);
      expect(table.state.phase).toBe(PHASES.TURNS);
      vi.advanceTimersByTime(1);
      expect(hand(0).done).toBe(true);
      expect(table.state.events.some((e) => e.type === "stand" && e.seat === 0)).toBe(true);
      expect(table.state.phase).toBe(PHASES.DEALER);
      expect(table.phaseMsLeft()).toBeNull();
    });
  });

  it("plays the dealer step by step, then waits results before the next betting window", async () => {
    make("10♠ 6♥ 7♣ 10♦ 5♠");
    table.sit(player("A"));
    table.bet(0, 100);
    table.ready(0);
    vi.advanceTimersByTime(DELAYS.deal);
    await table.move(0, "STAND");
    expect(table.state.phase).toBe(PHASES.DEALER);
    expect(table.state.dealer.revealed).toBe(false);
    vi.advanceTimersByTime(DELAYS.dealerStep);
    expect(table.state.dealer.revealed).toBe(true);
    expect(table.state.dealer.cards).toHaveLength(2);
    vi.advanceTimersByTime(DELAYS.dealerStep);
    expect(table.state.dealer.cards).toHaveLength(3); // 16 hits: 21
    expect(table.state.phase).toBe(PHASES.DEALER);
    vi.advanceTimersByTime(DELAYS.dealerStep);
    expect(table.state.phase).toBe(PHASES.ROUND_OVER);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].seatResults[0]).toMatchObject({ seat_index: 0, player_key: "A", staked: 100, returned: 0, net: -100 });
    expect(rounds[0].dealer.total).toBe(21);

    vi.advanceTimersByTime(DELAYS.results - 1);
    expect(table.state.phase).toBe(PHASES.ROUND_OVER);
    vi.advanceTimersByTime(1);
    expect(table.state.phase).toBe(PHASES.BETTING);
    expect(table.state.seats[0]).toMatchObject({ bankroll: 900, bet: 0, lastBet: 100, hands: [], inRound: false });
    expect(table.state.dealer.cards).toEqual([]);
    expect(table.phaseMsLeft()).toBe(DELAYS.betting);
  });

  it("an insurance window closes on its clock, or early once everyone answered", async () => {
    make("10♠ 10♥ A♥ 7♣ 8♣ 9♦ 10♣ 10♦ A♠ 7♥ 8♥ 9♠");
    table.sit(player("A"));
    table.sit(player("B"));
    table.bet(0, 100);
    table.bet(1, 100);
    table.ready(0);
    table.ready(1);
    expect(table.state.phase).toBe(PHASES.INSURANCE);
    expect(table.phaseMsLeft()).toBe(DELAYS.insurance);
    expect(await table.insure(0, true)).toEqual({ ok: true });
    expect(table.state.seats[0].bankroll).toBe(850);
    vi.advanceTimersByTime(DELAYS.deal + DELAYS.insurance - 1);
    expect(table.state.phase).toBe(PHASES.INSURANCE);
    vi.advanceTimersByTime(1);
    expect(table.state.phase).toBe(PHASES.TURNS); // B never answered: NO
    expect(table.state.seats[1].insurance).toBeNull();

    // Next round: both answer, and the window closes at once.
    await table.move(0, "STAND");
    await table.move(1, "STAND");
    for (let t = 0; t < 100 && table.state.phase !== PHASES.BETTING; t++) vi.advanceTimersByTime(5);
    table.bet(0, 100);
    table.bet(1, 100);
    table.ready(0);
    table.ready(1);
    expect(table.state.phase).toBe(PHASES.INSURANCE);
    await table.insure(0, false);
    expect(table.state.phase).toBe(PHASES.INSURANCE);
    expect(await table.insure(0, false)).toEqual({ ok: false, error: "You already answered" });
    await table.insure(1, false);
    expect(table.state.phase).toBe(PHASES.TURNS);
  });

  it("credit: beforeDeal's refused seats sit the round out", async () => {
    const gate = deferred();
    const beforeDeal = vi.fn(() => gate.promise);
    make("10♠ 9♥ 7♣ 8♦", { credit: true, beforeDeal });
    table.sit(player("A", { bankroll: 1000 }));
    table.sit(player("B", { bankroll: 1000 }));
    table.bet(0, 100);
    table.bet(1, 200);
    table.ready(0);
    table.ready(1);
    expect(table.state.phase).toBe(PHASES.DEALING); // waits for the credits to move
    expect(beforeDeal).toHaveBeenCalledTimes(1);
    expect(beforeDeal).toHaveBeenCalledWith([
      { seat: 0, key: "A", amount: 100 },
      { seat: 1, key: "B", amount: 200 },
    ]);
    vi.advanceTimersByTime(1000);
    expect(table.state.phase).toBe(PHASES.DEALING);

    gate.resolve([1]);
    await flush();
    expect(table.state.phase).toBe(PHASES.TURNS);
    expect(hand(0).cards.map((c) => c.id)).toEqual(["10♠.0", "7♣.0"]);
    expect(table.state.seats[1]).toMatchObject({ inRound: false, bankroll: 1000, bet: 0, hands: [] });
  });

  it("credit: a DOUBLE waits for fund, and a second DOUBLE while it funds is refused", async () => {
    const gate = deferred();
    const fund = vi.fn(() => gate.promise);
    make("6♠ 9♥ 5♣ 7♦ 10♠", { credit: true, beforeDeal: async () => [], fund });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    await flush();
    expect(table.state.phase).toBe(PHASES.TURNS);

    const first = table.move(0, "DOUBLE");
    expect(await table.move(0, "DOUBLE")).toEqual({ ok: false, error: "Not your turn" });
    expect(await table.move(0, "HIT")).toEqual({ ok: false, error: "Not your turn" });
    expect(fund).toHaveBeenCalledTimes(1);
    expect(fund).toHaveBeenCalledWith({ seat: 0, key: "A", amount: 100, kind: "double" });
    expect(hand(0)).toMatchObject({ bet: 100, doubled: false });

    // The turn clock running out while the credits move doesn't stand the hand.
    vi.advanceTimersByTime(DELAYS.deal + DELAYS.turn + 10);
    expect(table.state.phase).toBe(PHASES.TURNS);
    expect(hand(0).done).toBe(false);

    gate.resolve({ ok: true });
    expect(await first).toEqual({ ok: true });
    expect(hand(0)).toMatchObject({ bet: 200, doubled: true, done: true });
    expect(hand(0).cards).toHaveLength(3);
    expect(table.state.seats[0].bankroll).toBe(800);
    expect(table.state.phase).toBe(PHASES.DEALER);
    expect(fund).toHaveBeenCalledTimes(1);
  });

  it("credit: a refused fund leaves the hand as it was, with the reason", async () => {
    const fund = vi.fn(async () => ({ ok: false, error: "You don't have enough credits" }));
    make("8♠ 9♥ 8♣ 7♦ 2♠", { credit: true, beforeDeal: async () => [], fund });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    await flush();

    expect(await table.move(0, "SPLIT")).toEqual({ ok: false, error: "You don't have enough credits" });
    expect(fund).toHaveBeenCalledWith({ seat: 0, key: "A", amount: 100, kind: "split" });
    expect(table.state.seats[0].hands).toHaveLength(1);
    expect(hand(0)).toMatchObject({ bet: 100, done: false });
    expect(hand(0).cards).toHaveLength(2);
    expect(table.state.seats[0].bankroll).toBe(900);
    expect(table.state.turn).toEqual({ seat: 0, hand: 0 });

    // An illegal move never reaches fund.
    expect(await table.move(1, "DOUBLE")).toEqual({ ok: false, error: "Not your turn" });
    expect(fund).toHaveBeenCalledTimes(1);

    // The hand can still be played, and its clock still runs.
    expect(await table.move(0, "HIT")).toEqual({ ok: true });
    expect(hand(0).done).toBe(false);
    vi.advanceTimersByTime(DELAYS.deal + DELAYS.turn);
    expect(hand(0).done).toBe(true);
  });

  it("credit: a refused fund after the clock ran out stands the hand", async () => {
    const gate = deferred();
    make("8♠ 9♥ 3♣ 7♦ 10♠", { credit: true, beforeDeal: async () => [], fund: () => gate.promise });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    await flush();
    const pending = table.move(0, "DOUBLE");
    vi.advanceTimersByTime(DELAYS.deal + DELAYS.turn);
    expect(hand(0).done).toBe(false);
    gate.resolve({ ok: false, error: "No credits" });
    expect(await pending).toEqual({ ok: false, error: "No credits" });
    expect(hand(0)).toMatchObject({ done: true, doubled: false, bet: 100 });
    expect(table.state.phase).toBe(PHASES.DEALER);
  });

  it("credit: insurance waits for fund", async () => {
    const gate = deferred();
    const fund = vi.fn(() => gate.promise);
    make("10♠ A♥ 7♣ 9♦", { credit: true, beforeDeal: async () => [], fund });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    await flush();
    expect(table.state.phase).toBe(PHASES.INSURANCE);
    const first = table.insure(0, true);
    expect(await table.insure(0, true)).toEqual({ ok: false, error: "Not your turn" });
    expect(fund).toHaveBeenCalledWith({ seat: 0, key: "A", amount: 50, kind: "insurance" });
    // The window's clock waits for the move too.
    vi.advanceTimersByTime(DELAYS.deal + DELAYS.insurance + 10);
    expect(table.state.phase).toBe(PHASES.INSURANCE);
    gate.resolve({ ok: true });
    expect(await first).toEqual({ ok: true });
    expect(table.state.seats[0].insurance).toBe(50);
    expect(table.state.phase).toBe(PHASES.TURNS); // everyone answered
    expect(fund).toHaveBeenCalledTimes(1);
  });

  it("credit: the next betting window waits for beforeNextRound and shows saving after slowSave", async () => {
    const gate = deferred();
    const beforeNextRound = vi.fn().mockRejectedValueOnce(new Error("db down")).mockImplementationOnce(() => gate.promise);
    const states = [];
    make("10♠ 9♥ 10♣ 8♦", { credit: true, beforeDeal: async () => [], beforeNextRound, onState: (t) => states.push(t.saving) });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    await flush();
    await table.move(0, "STAND");
    await vi.advanceTimersByTimeAsync(DELAYS.deal + DELAYS.dealerStep * 2);
    expect(table.state.phase).toBe(PHASES.ROUND_OVER);
    expect(table.state.seats[0].bankroll).toBe(900); // a credit table doesn't pay into bankroll
    expect(beforeNextRound).toHaveBeenCalledTimes(1);
    expect(beforeNextRound).toHaveBeenCalledWith(rounds[0]);

    await vi.advanceTimersByTimeAsync(DELAYS.saveRetry);
    expect(beforeNextRound).toHaveBeenCalledTimes(2); // retried

    await vi.advanceTimersByTimeAsync(DELAYS.results - DELAYS.saveRetry);
    expect(table.state.phase).toBe(PHASES.ROUND_OVER); // results over, the save isn't
    expect(table.saving).toBe(false);
    await vi.advanceTimersByTimeAsync(DELAYS.slowSave - 1);
    expect(table.saving).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(table.saving).toBe(true);
    expect(states.at(-1)).toBe(true);

    gate.resolve();
    await flush();
    expect(table.saving).toBe(false);
    expect(table.state.phase).toBe(PHASES.BETTING);
    expect(table.state.seats[0].hands).toEqual([]);
  });

  it("credit: a setBankroll for a seat whose move is funding waits for the move", async () => {
    const gate = deferred();
    const fund = vi.fn(() => gate.promise);
    make("6♠ 9♥ 5♣ 7♦ 10♠", { credit: true, beforeDeal: async () => [], fund });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    await flush();
    const pending = table.move(0, "DOUBLE");
    expect(table.setBankroll(0, 300)).toEqual({ ok: true });
    expect(table.state.seats[0].bankroll).toBe(900); // not yet
    gate.resolve({ ok: true });
    expect(await pending).toEqual({ ok: true });
    expect(hand(0)).toMatchObject({ doubled: true, bet: 200 });
    expect(table.state.seats[0].bankroll).toBe(300); // then the resync lands
    expect(fund).toHaveBeenCalledTimes(1);
  });

  it("credit: a funded move or insurance the table can no longer apply answers funded: true", async () => {
    let gate = deferred();
    make("6♠ 9♥ 5♣ 7♦ 10♠", { credit: true, beforeDeal: async () => [], fund: () => gate.promise });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    await flush();
    const pending = table.move(0, "DOUBLE");
    table.state = engineSetBankroll(table.state, 0, 50); // the state moved under the pending move
    gate.resolve({ ok: true });
    expect(await pending).toEqual({ ok: false, funded: true, error: "You can't double now" });
    expect(hand(0)).toMatchObject({ doubled: false, bet: 100 });

    gate = deferred();
    make("10♠ A♥ 7♣ 9♦", { credit: true, beforeDeal: async () => [], fund: () => gate.promise });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    await flush();
    const insuring = table.insure(0, true);
    table.state = engineInsure(table.state, 0, false);
    gate.resolve({ ok: true });
    expect(await insuring).toEqual({ ok: false, funded: true, error: "You already answered" });
    expect(table.state.seats[0].insurance).toBeNull();
  });

  it("credit: closeAfterRound while the bets move, and every bet refused: the table closes, no new round", async () => {
    const gate = deferred();
    make("10♠ 9♥ 7♣ 8♦", { credit: true, beforeDeal: () => gate.promise });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    expect(table.state.phase).toBe(PHASES.DEALING);
    table.closeAfterRound();
    await flush();
    expect(closed).toBe(0);
    gate.resolve([0]);
    await flush();
    expect(table.state.phase).toBe(PHASES.WAITING);
    expect(table.state.seats[0]).toMatchObject({ bankroll: 1000, inRound: false });
    expect(closed).toBe(1);
    expect(table.phaseMsLeft()).toBeNull();
    expect(table.bet(0, 100)).toEqual({ ok: false, error: "Betting is closed" });
    await vi.advanceTimersByTimeAsync(DELAYS.betting * 3);
    expect(table.state.phase).toBe(PHASES.WAITING);
    expect(rounds).toHaveLength(0);
  });

  it("an owner callback that throws never stalls the table", async () => {
    const boom = () => {
      throw new Error("owner bug");
    };
    // onState and onKick throw; A never bets while B plays every round.
    make("2♣", { onState: boom, onKick: (seat) => (kicked.push(seat), boom()) });
    expect(table.sit(player("A"))).toEqual({ ok: true, seat: 0 });
    table.sit(player("B"));
    for (let i = 0; i < SKIPS_BEFORE_KICK; i++) {
      table.bet(1, 10);
      table.ready(1);
      vi.advanceTimersByTime(DELAYS.betting);
      expect(table.state.phase).toBe(PHASES.TURNS); // dealt, even as onKick threw on the 5th
      expect(await table.move(1, "STAND")).toEqual({ ok: true });
      for (let t = 0; t < 100 && table.state.phase !== PHASES.BETTING; t++) vi.advanceTimersByTime(5);
      expect(table.state.phase).toBe(PHASES.BETTING);
    }
    expect(kicked).toEqual([0]);

    // onRoundEnd throws from a dealer step (a timer): the save still runs and betting reopens.
    const beforeNextRound = vi.fn(async () => {});
    make("10♠ 9♥ 10♣ 8♦", { credit: true, beforeDeal: async () => [], beforeNextRound, onRoundEnd: boom });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    await flush();
    await table.move(0, "STAND");
    await vi.advanceTimersByTimeAsync(DELAYS.deal + DELAYS.dealerStep * 2);
    expect(table.state.phase).toBe(PHASES.ROUND_OVER);
    expect(beforeNextRound).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DELAYS.results);
    expect(table.state.phase).toBe(PHASES.BETTING);

    // ...and from the deal itself (a dealer blackjack at the peek).
    const save = vi.fn(async () => {});
    make("10♠ K♥ 9♣ A♦", { credit: true, beforeDeal: async () => [], beforeNextRound: save, onRoundEnd: boom });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    await flush();
    expect(table.state.phase).toBe(PHASES.ROUND_OVER);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DELAYS.deal + DELAYS.results);
    expect(table.state.phase).toBe(PHASES.BETTING);
  });

  it.each([
    ["0", 0],
    ["an object", { refused: [] }],
    ["seats that aren't numbers", ["0", null]],
  ])("credit: beforeDeal resolving %s counts as nobody refused", async (_label, answer) => {
    make("10♠ 9♥ 7♣ 8♦", { credit: true, beforeDeal: async () => answer });
    table.sit(player("A", { bankroll: 1000 }));
    table.bet(0, 100);
    table.ready(0);
    await flush();
    expect(table.state.phase).toBe(PHASES.TURNS);
    expect(hand(0).cards).toHaveLength(2);
  });

  it("closeAfterRound finishes the round, then onClosed; no new betting window", async () => {
    make("10♠ 9♥ 10♣ 8♦");
    table.sit(player("A"));
    table.bet(0, 100);
    table.ready(0);
    expect(table.state.phase).toBe(PHASES.TURNS);
    table.closeAfterRound();
    expect(table.closing).toBe(true);
    await flush();
    expect(closed).toBe(0);
    await table.move(0, "STAND");
    await vi.advanceTimersByTimeAsync(DELAYS.deal + DELAYS.dealerStep * 2);
    expect(table.state.phase).toBe(PHASES.ROUND_OVER);
    expect(rounds).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(DELAYS.results);
    expect(closed).toBe(1);
    expect(table.state.phase).toBe(PHASES.WAITING);
    await vi.advanceTimersByTimeAsync(DELAYS.betting * 5);
    expect(table.state.phase).toBe(PHASES.WAITING);
    expect(closed).toBe(1);

    // With no round running, it closes at once.
    make();
    table.sit(player("A"));
    table.bet(0, 100);
    table.closeAfterRound();
    await flush();
    expect(closed).toBe(1);
    await vi.advanceTimersByTimeAsync(DELAYS.betting * 2);
    expect(table.state.phase).toBe(PHASES.BETTING);
    expect(table.state.seats[0].inRound).toBe(false);
  });

  it("standUp in WAITING/BETTING empties the seat; mid-round it marks leaving and the round plays on", async () => {
    make("10♠ 10♥ 9♥ 7♣ 8♣ 8♦");
    table.sit(player("A"));
    table.sit(player("B"));
    table.bet(1, 100);
    expect(table.standUp(1)).toEqual({ ok: true });
    expect(table.state.seats[1]).toBeNull();
    expect(table.state.phase).toBe(PHASES.BETTING);
    expect(table.standUp(0)).toEqual({ ok: true });
    expect(table.state.phase).toBe(PHASES.WAITING); // nobody left: no clock

    table.sit(player("A"));
    table.sit(player("B"));
    table.bet(0, 100);
    table.bet(1, 100);
    table.ready(0);
    table.ready(1);
    expect(table.state.turn).toEqual({ seat: 0, hand: 0 });
    table.standUp(1);
    expect(table.state.seats[1]).toMatchObject({ leaving: true, inRound: true });
    expect(hand(1).done).toBe(true);
    expect(table.state.phase).toBe(PHASES.TURNS);

    // The player on turn leaving moves the turn on at once.
    table.standUp(0);
    expect(table.state.phase).toBe(PHASES.DEALER);
    await vi.advanceTimersByTimeAsync(DELAYS.deal + DELAYS.dealerStep * 3);
    expect(table.state.phase).toBe(PHASES.ROUND_OVER);
    expect(rounds[0].seatResults.map((r) => r.seat_index)).toEqual([0, 1]);
    await vi.advanceTimersByTimeAsync(DELAYS.results);
    expect(table.state.seats).toEqual([null, null, null, null, null]);
    expect(table.state.phase).toBe(PHASES.WAITING);
  });
});
