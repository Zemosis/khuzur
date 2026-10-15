// The rules a credit table turns on: newcomers wait for the big blind, chips
// added mid-session land before the next deal, and an all-in hand plays out
// after its player leaves. Free tables keep the old rules.

import { describe, it, expect } from "vitest";
import * as E from "../../src/utils/poker/engine.js";
import { chooseAction } from "../../src/utils/poker/ai.js";
import { seededRandom, tableWith, dealt } from "../helpers/poker.js";

const CREDIT = { waitForBigBlind: true, allInPlaysOut: true };
const credit = (stacks) => tableWith(stacks, CREDIT);
const first = () => 0;
/** Checks or calls every turn until the hand is over. */
const finish = (s) => {
  while (s.phase !== E.PHASES.HAND_OVER) {
    s = s.phase === E.PHASES.RUNOUT ? E.advance(s) : E.act(s, s.turn, { type: E.legalActions(s, s.turn).canCheck ? "check" : "call" });
  }
  return s;
};
const dealtIn = (s) => s.seats.flatMap((p, i) => (p?.inHand ? [i] : []));
const blinds = (s) => Object.fromEntries(s.events.filter((e) => e.type === "blind").map((e) => [e.kind, e.seat]));
const newcomer = (s, seat) => E.sit(s, seat, { name: "NEW", key: "new", stack: 1000 });

describe("waiting for the big blind", () => {
  it("deals everyone in on a table's first hand", () => {
    const s = E.startHand(credit([1000, 1000, 1000, null, null, null]), first);
    expect(dealtIn(s)).toEqual([0, 1, 2]);
    expect(s.seats.filter(Boolean).every((p) => !p.waitingForBB)).toBe(true);
  });

  it("a newcomer sits out until the big blind reaches them, then posts it", () => {
    let s = finish(E.startHand(credit([1000, null, 1000, null, 1000, null]), first)); // button 0, blinds 2 and 4
    s = newcomer(s, 1);
    expect(s.seats[1].waitingForBB).toBe(true);
    s = finish(E.startHand(s, first)); // button 2, blinds 4 and 0
    expect(dealtIn(s)).toEqual([0, 2, 4]);
    s = E.startHand(s, first); // button 4, small blind 0, big blind reaches seat 1
    expect(s.button).toBe(4);
    expect(blinds(s)).toEqual({ small: 0, big: 1 });
    expect(dealtIn(s)).toEqual([0, 1, 2, 4]);
    expect(s.seats[1].waitingForBB).toBe(false);
  });

  it("with two playing, a newcomer the big blind reaches next is dealt straight in", () => {
    let s = finish(E.startHand(credit([1000, null, 1000, null, null, null]), first)); // heads-up, button 0
    s = E.startHand(newcomer(s, 1), first);
    expect({ button: s.button, ...blinds(s) }).toEqual({ button: 2, small: 0, big: 1 });
    expect(dealtIn(s)).toEqual([0, 1, 2]);
  });

  it("with two playing, a newcomer the big blind skips waits one more hand", () => {
    let s = finish(E.startHand(credit([1000, null, 1000, null, null, null]), first)); // heads-up, button 0
    s = finish(E.startHand(newcomer(s, 4), first)); // button 2; the big blind falls to 0, so 4 waits
    expect(dealtIn(s)).toEqual([0, 2]);
    s = E.startHand(s, first);
    expect({ button: s.button, ...blinds(s) }).toEqual({ button: 0, small: 2, big: 4 });
    expect(dealtIn(s)).toEqual([0, 2, 4]);
  });

  it("a player back from sitting out waits for the big blind too", () => {
    let s = finish(E.startHand(credit([1000, 1000, 1000, null, null, null]), first));
    s = E.setSittingOut(s, 1, true);
    s = finish(E.startHand(s, first));
    s = E.setSittingOut(s, 1, false);
    expect(s.seats[1].waitingForBB).toBe(true);
  });

  it("deals a waiting player straight in when the table can't start without them", () => {
    let s = finish(E.startHand(credit([1000, 1000, null, null, null, null]), first));
    s = newcomer(E.standUp(s, 1), 3);
    s = E.startHand(s, first);
    expect(dealtIn(s)).toEqual([0, 3]);
    expect(s.seats[3].waitingForBB).toBe(false);
  });

  it("a free table still deals a newcomer in on the next hand", () => {
    let s = finish(E.startHand(tableWith([1000, null, 1000, null, 1000, null]), first));
    s = newcomer(s, 1);
    expect(s.seats[1].waitingForBB).toBe(false);
    expect(dealtIn(E.startHand(s, first))).toEqual([0, 1, 2, 4]);
  });
});

describe("adding chips", () => {
  it("holds them until the next deal, even in the middle of a hand", () => {
    let s = E.startHand(credit([1000, 1000, null, null, null, null]), first);
    const stack = s.seats[0].stack;
    s = E.addChips(s, 0, 500, 2000);
    expect(s.seats[0]).toMatchObject({ stack, pending: 500 });
    s = finish(s);
    const after = s.seats[0].stack;
    s = E.startHand(s, first);
    expect(s.seats[0]).toMatchObject({ pending: 0, bought: 1500 });
    expect(s.seats[0].stack + s.seats[0].committed).toBe(after + 500);
  });

  it("refuses more than the table's maximum, counting chips already waiting", () => {
    let s = credit([600, 1000, null, null, null, null]);
    s = E.addChips(s, 0, 300, 1000);
    expect(() => E.addChips(s, 0, 101, 1000)).toThrow("You can have at most 1000 on the table");
    expect(E.addChips(s, 0, 100, 1000).seats[0].pending).toBe(400);
  });

  it.each([0, -5, 2.5, "100", null, NaN])("refuses %s", (amount) => {
    expect(() => E.addChips(credit([600, 1000, null, null, null, null]), 0, amount, 1000)).toThrow("Pick an amount");
  });

  it("a busted player who adds chips is back in, waiting for the big blind", () => {
    let s = credit([1000, 1000, 1000, null, null, null]);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, stack: 0, sittingOut: true } : p)) };
    expect(E.nextHandSeats(s)).toEqual([1, 2]);
    s = E.addChips(s, 0, 200, 1000);
    expect(s.seats[0]).toMatchObject({ sittingOut: false, waitingForBB: true, pending: 200 });
    expect(E.nextHandSeats(s)).toEqual([0, 1, 2]);
  });
});

describe("leaving all-in", () => {
  const allIn = (opts) =>
    E.act(
      E.act(dealt(tableWith([1000, null, 1000, null, null, null], opts), { button: 0, holes: { 0: "A♠ A♦", 2: "K♠ K♦" }, board: "2♣ 7♦ 9♥ J♠ 3♣" }), 0, { type: "allin" }),
      2,
      { type: "call" },
    );

  it("at a credit table the hand plays out and the chips it wins stay on the seat", () => {
    let s = E.standUp(allIn(CREDIT), 0);
    expect(s.seats[0]).toMatchObject({ leaving: true, inHand: true, folded: false });
    while (s.phase === E.PHASES.RUNOUT) s = E.advance(s);
    expect(s.phase).toBe(E.PHASES.HAND_OVER);
    expect(s.seats[0]).toMatchObject({ leaving: true, stack: 2000 });
    expect(E.toWaiting(s).seats[0]).toBeNull();
  });

  it("at a free table it still folds", () => {
    const s = E.standUp(allIn(), 0);
    expect(s.phase).toBe(E.PHASES.HAND_OVER);
    expect(s.seats[2].stack).toBe(2000);
  });
});

describe("hand summary", () => {
  it("records each seat's hole cards and chips put in, and the board", () => {
    let s = dealt(tableWith([1000, null, 1000, null, null, null]), { button: 0, holes: { 0: "A♠ A♦", 2: "K♠ K♦" }, board: "2♣ 7♦ 9♥ J♠ 3♣" });
    s = finish(s);
    const sum = E.handSummary(s);
    expect(sum.board).toEqual(["2♣", "7♦", "9♥", "J♠", "3♣"]);
    expect(sum.seatResults.find((r) => r.seat_index === 0)).toMatchObject({ hole: ["A♠", "A♦"], committed: 10 });
  });
});

describe.each([4, 5, 6])("a credit table, seed %i", (seed) => {
  it("plays 300 hands with newcomers, top-ups and leavers without making or losing a chip", () => {
    const rng = seededRandom(seed);
    const LEVELS = ["EASY", "MEDIUM", "HARD"];
    let s = E.createTable(CREDIT);
    let bank = 0; // every chip brought to the table, minus every chip taken home
    const sitDown = (i) => {
      const stack = 200 + Math.floor(rng() * 800);
      s = E.sit(s, i, { name: `P${i}`, type: "AI", level: LEVELS[i % 3], stack });
      bank += stack;
    };
    const onTable = () => s.seats.reduce((t, p) => t + (p ? p.stack + p.pending : 0), 0);
    for (let i = 0; i < 3; i++) sitDown(i);
    for (let hand = 0; hand < 300; hand++) {
      s.seats.forEach((p, i) => {
        if (!p) return;
        if (p.leaving || rng() < 0.03) {
          bank -= p.stack + p.pending;
          s = E.standUp(s, i);
        } else if (rng() < 0.1) {
          const add = Math.min(1000 - p.stack - p.pending, 1 + Math.floor(rng() * 300));
          if (add > 0) {
            s = E.addChips(s, i, add, 1000);
            bank += add;
          }
        }
      });
      for (let i = 0; i < 6; i++) if (!s.seats[i] && rng() < 0.2) sitDown(i);
      expect(onTable()).toBe(bank);
      if (!E.canStartHand(s)) continue;
      s = E.startHand(s, rng);
      for (let step = 0; s.phase !== E.PHASES.HAND_OVER; step++) {
        expect(step).toBeLessThan(200);
        if (s.phase === E.PHASES.RUNOUT) s = E.advance(s);
        else if (rng() < 0.01) s = E.standUp(s, s.turn);
        else s = E.act(s, s.turn, chooseAction(E.viewFor(s, s.turn), s.turn, s.seats[s.turn].level, rng));
      }
      expect(onTable()).toBe(bank);
      expect(E.handSummary(s).seatResults.reduce((t, r) => t + r.net, 0)).toBe(0);
    }
  });
});
