import { describe, it, expect } from "vitest";
import {
  PHASES,
  act,
  advance,
  canStartHand,
  handSummary,
  legalActions,
  potSize,
  rebuy,
  setSittingOut,
  sit,
  standUp,
  startHand,
  viewFor,
} from "../../src/utils/poker/engine.js";
import { tableWith, dealt } from "../helpers/poker.js";

// Three players: seat 0 the button, 1 the small blind, 2 the big blind.
const three = (stacks = [1000, 1000, 1000], opts = {}) =>
  dealt(tableWith([...stacks, null, null, null]), { button: 0, ...opts });
const play = (s, ...moves) => moves.reduce((st, [seat, type, amount]) => act(st, seat, { type, amount }), s);

describe("starting a hand", () => {
  it("posts the blinds left of the button and starts left of the big blind", () => {
    const s = three();
    expect(s.phase).toBe(PHASES.BETTING);
    expect(s.seats.map((p) => p?.bet)).toEqual([0, 5, 10, undefined, undefined, undefined]);
    expect(s.turn).toBe(0);
    expect(s.seats[0].hole).toHaveLength(2);
    expect(s.events[0]).toMatchObject({ type: "hand", handNumber: 1, button: 0 });
  });

  it("heads-up the button posts the small blind and acts first, then last after the flop", () => {
    let s = dealt(tableWith([1000, null, 1000, null, null, null]), { button: 0 });
    expect(s.seats[0].bet).toBe(5);
    expect(s.seats[2].bet).toBe(10);
    expect(s.turn).toBe(0);
    s = play(s, [0, "call"], [2, "check"]);
    expect(s.street).toBe("FLOP");
    expect(s.turn).toBe(2);
  });

  it("moves the button past empty seats and players sitting out", () => {
    let s = tableWith([1000, null, 1000, 1000, null, 1000]);
    s = setSittingOut(s, 2, true);
    s = { ...s, button: 0 };
    s = startHand(s, () => 0);
    expect(s.button).toBe(3);
    expect(s.seats[2].inHand).toBe(false);
  });

  it("a short big blind goes all-in for what it has; the others still call the full blind", () => {
    const s = three([1000, 1000, 4]);
    expect(s.seats[2]).toMatchObject({ bet: 4, allIn: true, stack: 0 });
    expect(legalActions(s, 0).toCall).toBe(10);
  });

  it("needs two players with chips", () => {
    expect(canStartHand(tableWith([1000, null, null, null, null, null]))).toBe(false);
    expect(() => startHand(tableWith([1000, null, null, null, null, null]))).toThrow(/two players/);
  });
});

describe("betting", () => {
  it("a raise must be at least the last raise", () => {
    let s = three();
    s = play(s, [0, "raise", 30]); // raises by 20
    expect(legalActions(s, 1)).toMatchObject({ toCall: 25, minRaiseTo: 50, canRaise: true });
    expect(() => act(s, 1, { type: "raise", amount: 45 })).toThrow("Raise to at least 50");
  });

  it("checking into a bet, acting out of turn and made-up moves are refused", () => {
    const s = three();
    expect(() => act(s, 0, { type: "check" })).toThrow(/can't check/);
    expect(() => act(s, 1, { type: "call" })).toThrow("Not your turn");
    expect(() => act(s, 0, { type: "dance" })).toThrow("Unknown move");
  });

  it("the big blind gets the option when everyone just calls", () => {
    let s = three();
    s = play(s, [0, "call"], [1, "call"]);
    expect(s.turn).toBe(2);
    expect(legalActions(s, 2)).toMatchObject({ canCheck: true, canRaise: true });
    s = play(s, [2, "check"]);
    expect(s.street).toBe("FLOP");
    expect(s.board).toHaveLength(3);
    expect(s.turn).toBe(1); // first after the button
  });

  it("an all-in short of a full raise doesn't let players who acted raise again", () => {
    let s = three([1000, 130, 1000]);
    s = play(s, [0, "raise", 100], [1, "allin"]); // 30 more than 100: short of the 90 raise
    expect(s.currentBet).toBe(130);
    expect(legalActions(s, 2).canRaise).toBe(true); // hadn't acted yet
    s = play(s, [2, "call"]);
    expect(legalActions(s, 0)).toMatchObject({ toCall: 30, canRaise: false });
  });

  it("a full raise reopens the betting", () => {
    let s = three([1000, 1000, 1000]);
    s = play(s, [0, "raise", 30], [1, "raise", 60]);
    s = play(s, [2, "call"]);
    expect(legalActions(s, 0).canRaise).toBe(true);
  });

  it("everyone folding to one player wins them the pot without showing", () => {
    let s = three();
    s = play(s, [0, "raise", 40], [1, "fold"], [2, "fold"]);
    expect(s.phase).toBe(PHASES.HAND_OVER);
    expect(s.result.won[0]).toBe(25); // the blinds; the unmatched 30 of the raise comes back
    expect(s.events).toContainEqual({ type: "return", seat: 0, amount: 30 });
    expect(s.result.hands).toEqual({});
    expect(s.seats[0].stack).toBe(1015);
    expect(s.events.filter((e) => e.type === "show")).toEqual([]);
  });
});

describe("all-in and showdown", () => {
  it("all-in before the flop shows both hands and runs the board out one street at a time", () => {
    let s = dealt(tableWith([1000, null, 1000, null, null, null]), {
      button: 0,
      holes: { 0: "A♠ A♦", 2: "K♠ K♦" },
      board: "2♣ 7♦ 9♥ J♠ 3♣",
    });
    s = play(s, [0, "allin"], [2, "call"]);
    expect(s.phase).toBe(PHASES.RUNOUT);
    expect(s.seats[0].shown && s.seats[2].shown).toBe(true);
    s = advance(s);
    expect(s.board.map((c) => c.id)).toEqual(["2♣", "7♦", "9♥"]);
    s = advance(advance(s));
    expect(s.board).toHaveLength(5);
    s = advance(s);
    expect(s.phase).toBe(PHASES.HAND_OVER);
    expect(s.result.won[0]).toBe(2000);
    expect(s.seats[2]).toMatchObject({ stack: 0, sittingOut: true }); // busted: sits out until a rebuy
  });

  it("at a checked-down showdown the first player left of the button shows; a loser after them mucks", () => {
    let s = three([1000, 1000, 1000], {
      holes: { 0: "2♦ 3♣", 1: "A♠ A♦", 2: "K♠ K♦" },
      board: "7♣ 8♦ 9♥ J♠ 4♣",
    });
    s = play(s, [0, "fold"], [1, "call"], [2, "check"]);
    for (let street = 0; street < 3; street++) s = play(s, [1, "check"], [2, "check"]);
    expect(s.phase).toBe(PHASES.HAND_OVER);
    expect(Object.keys(s.result.hands)).toEqual(["1"]); // seat 1 showed first and won; 2 mucked
    expect(s.result.hands[1].name).toBe("Pair of aces");
    expect(s.seats[2].shown).toBe(false);
  });

  it("the river's last bettor shows first", () => {
    let s = three([1000, 1000, 1000], {
      holes: { 0: "2♦ 3♣", 1: "A♠ A♦", 2: "K♠ K♦" },
      board: "7♣ 8♦ 9♥ J♠ 4♣",
    });
    s = play(s, [0, "fold"], [1, "call"], [2, "check"]);
    for (let street = 0; street < 2; street++) s = play(s, [1, "check"], [2, "check"]);
    s = play(s, [1, "check"], [2, "raise", 50], [1, "call"]);
    expect(s.result.hands[2]).toBeDefined(); // the bettor showed, and lost
    expect(s.result.hands[1]).toBeDefined(); // the winner shows
  });

  it("a tie splits the pot, the odd chip to the first winner left of the button", () => {
    let s = three([1000, 1000, 1000], {
      holes: { 0: "2♦ 3♣", 1: "4♦ 4♣", 2: "5♦ 5♣" },
      board: "A♠ K♠ Q♠ J♠ 10♠",
    });
    s = play(s, [0, "call"], [1, "fold"], [2, "check"]);
    for (let street = 0; street < 3; street++) s = play(s, [2, "check"], [0, "check"]);
    expect(potSize(s)).toBe(25);
    expect(s.result.won).toEqual([12, 0, 13, 0, 0, 0]);
  });
});

describe("uncalled chips", () => {
  it("chips nobody could match go back to the bettor, not counted as a win", () => {
    let s = dealt(tableWith([300, null, 1000, null, null, null]), {
      button: 0,
      holes: { 0: "A♠ A♦", 2: "K♠ K♦" },
      board: "2♣ 7♦ 9♥ J♠ 3♣",
    });
    s = play(s, [0, "call"], [2, "allin"], [0, "call"]);
    while (s.phase === PHASES.RUNOUT) s = advance(s);
    expect(s.result.won).toEqual([600, 0, 0, 0, 0, 0]);
    expect(s.seats[2].stack).toBe(700);
    expect(s.events).toContainEqual({ type: "return", seat: 2, amount: 700 });
    expect(s.result.pots).toEqual([{ amount: 600, winners: [0] }]);
    const sum = handSummary(s);
    expect(sum.seatResults.find((r) => r.seat_index === 2)).toMatchObject({ won: 0, net: -300 });
    expect(sum.seatResults.find((r) => r.seat_index === 0)).toMatchObject({ won: 600, net: 300 });
  });

  it("a big blind all-in for less than the small blind only wins what it matched", () => {
    let s = dealt(tableWith([1000, null, 3, null, null, null]), { button: 0 });
    s = play(s, [0, "fold"]);
    expect(s.result.won[2]).toBe(6);
    expect(s.seats[0].stack).toBe(997);
  });

  it("someone leaving after betting more than everyone left takes the extra home", () => {
    let s = dealt(tableWith([1000, null, 50, null, null, null]), { button: 0 });
    s = play(s, [0, "allin"], [2, "call"]);
    s = standUp(s, 0);
    expect(s.result.won[2]).toBe(100);
    expect(s.seats[0].stack).toBe(950);
  });
});

describe("players coming and going", () => {
  it("someone sitting down mid-hand waits for the next one", () => {
    let s = three();
    s = sit(s, 4, { name: "LATE", stack: 1000 });
    expect(s.seats[4].inHand).toBe(false);
    s = play(s, [0, "fold"], [1, "fold"]);
    s = startHand(s, () => 0);
    expect(s.seats[4].inHand).toBe(true);
  });

  it("leaving on your turn folds you and moves the turn on", () => {
    let s = three();
    s = standUp(s, 0);
    expect(s.seats[0]).toMatchObject({ folded: true, leaving: true });
    expect(s.turn).toBe(1);
    s = play(s, [1, "fold"]);
    s = startHand(s, () => 0);
    expect(s.seats[0]).toBeNull();
  });

  it("the last opponent leaving wins the hand for whoever is left", () => {
    let s = dealt(tableWith([1000, null, 1000, null, null, null]), { button: 0 });
    s = standUp(s, 2);
    expect(s.phase).toBe(PHASES.HAND_OVER);
    expect(s.result.won[0]).toBe(10); // the leaver's unmatched 5 of the big blind goes home with them
    expect(s.seats[2].stack).toBe(995);
  });

  it("a busted player rebuys back into the next hand; with chips they can't", () => {
    let s = tableWith([1000, 1000, null, null, null, null]);
    expect(() => rebuy(s, 0)).toThrow("You still have chips");
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, stack: 0, sittingOut: true } : p)) };
    s = rebuy(s, 0);
    expect(s.seats[0]).toMatchObject({ stack: 1000, bought: 2000, sittingOut: false });
  });
});

describe("what players see and what is recorded", () => {
  it("a view hides other hands, the deck and every player key", () => {
    const s = three();
    const v = viewFor(s, 1);
    expect(v.seats[1].hole.every((c) => c.id)).toBe(true);
    expect(v.seats[0].hole).toEqual([{ hidden: true }, { hidden: true }]);
    expect(v.deck).toEqual([]);
    expect(v.seats.filter(Boolean).every((p) => p.key === null)).toBe(true);
    expect(v.legal).toBeNull(); // not seat 1's turn
    expect(viewFor(s, 0).legal).toMatchObject({ toCall: 10 });
  });

  it("a hand's summary nets to zero and marks who put money in by choice", () => {
    let s = three();
    s = play(s, [0, "raise", 40], [1, "fold"], [2, "fold"]);
    const sum = handSummary(s);
    expect(sum.roundNumber).toBe(1);
    expect(sum.winnerSeat).toBe(0);
    expect(sum.seatResults.reduce((a, r) => a + r.net, 0)).toBe(0);
    expect(sum.seatResults.find((r) => r.seat_index === 0)).toMatchObject({ player_key: "k0", net: 15, vpip: true, showdown: false });
    expect(sum.seatResults.find((r) => r.seat_index === 1)).toMatchObject({ net: -5, vpip: false, folded_street: "PREFLOP" });
  });
});
