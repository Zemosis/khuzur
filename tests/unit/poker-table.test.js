// The table over time, on fake timers: CPU turns, the turn clock, sitting
// out and being stood up, all-in run-outs, and the pause between hands.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PokerTable, DEFAULT_POKER_DELAYS } from "../../src/utils/poker/table.js";
import { PHASES } from "../../src/utils/poker/engine.js";
import { seededRandom } from "../helpers/poker.js";

const D = DEFAULT_POKER_DELAYS;
let table;
let hands;
let kicked;
const make = (delays = {}, options = {}) => {
  hands = [];
  kicked = [];
  table = new PokerTable({
    rng: seededRandom(7),
    delays,
    onHandEnd: (h) => hands.push(h),
    onKick: (seat) => {
      kicked.push(seat);
      table.standUp(seat);
    },
    ...options,
  });
  return table;
};
/** Folds our turns and lets the CPU play until the hand in play is over. */
const untilHandOver = () => {
  for (let i = 0; i < 1000 && table.state.phase !== PHASES.HAND_OVER; i++) {
    if (table.state.phase === PHASES.BETTING && table.state.turn === 0) table.move(0, { type: "fold" });
    else vi.advanceTimersByTime(100);
  }
  expect(table.state.phase).toBe(PHASES.HAND_OVER);
};
const human = (name = "ME") => table.sit({ name, type: "HUMAN", key: name });
const cpu = (name = "BOT") => table.sit({ name, type: "AI", level: "MEDIUM" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  table?.destroy();
  vi.useRealTimers();
});

describe("poker table", () => {
  it("deals nothing until the host starts it, then waits for a second player", () => {
    make();
    human();
    vi.advanceTimersByTime(60_000);
    expect(table.state.phase).toBe(PHASES.WAITING);
    table.start();
    vi.advanceTimersByTime(60_000);
    expect(table.state.phase).toBe(PHASES.WAITING);
    cpu();
    vi.advanceTimersByTime(D.firstHand);
    expect(table.state.phase).toBe(PHASES.BETTING);
  });

  it("seats people in the first empty seat until the table is full", () => {
    make();
    for (let i = 0; i < 6; i++) expect(human(`P${i}`)).toEqual({ ok: true, seat: i });
    expect(human("P6")).toEqual({ ok: false, error: "The table is full" });
  });

  it("CPUs play their turns by themselves, hand after hand", () => {
    make();
    for (let i = 0; i < 3; i++) cpu();
    table.start();
    vi.advanceTimersByTime(10 * 60_000);
    expect(hands.length).toBeGreaterThan(10);
  });

  it("the turn clock checks or folds for you, and twice in a row sits you out", () => {
    make();
    human();
    cpu();
    table.start();
    vi.advanceTimersByTime(D.firstHand);
    // Find a hand where it's your turn, and let the clock run out twice.
    for (let i = 0; i < 50 && !table.state.seats[0].sittingOut; i++) {
      if (table.state.phase === PHASES.BETTING && table.state.turn === 0) {
        expect(table.turnMsLeft()).toBeGreaterThan(0);
        vi.advanceTimersByTime(table.turnMsLeft());
      } else vi.advanceTimersByTime(500);
    }
    expect(table.state.seats[0].sittingOut).toBe(true);
    vi.advanceTimersByTime(D.sitOutKick);
    expect(kicked).toEqual([0]);
    expect(table.state.seats[0]).toBeNull();
  });

  it("acting yourself resets the count, and I'M BACK deals you in again", () => {
    make();
    human();
    cpu();
    table.start();
    vi.advanceTimersByTime(D.firstHand);
    while (!(table.state.phase === PHASES.BETTING && table.state.turn === 0)) vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(table.turnMsLeft()); // one timeout
    while (!(table.state.phase === PHASES.BETTING && table.state.turn === 0)) vi.advanceTimersByTime(100);
    const legal = table.state.seats[0] && table.move(0, { type: "fold" });
    expect(legal).toEqual({ ok: true });
    expect(table.timeouts[0]).toBe(0);
    table.state = { ...table.state, seats: table.state.seats.map((p, i) => (i === 0 ? { ...p, sittingOut: true } : p)) };
    expect(table.sitIn(0)).toEqual({ ok: true });
    expect(table.state.seats[0].sittingOut).toBe(false);
  });

  it("someone sitting down doesn't give the player on turn more time", () => {
    make();
    human();
    cpu();
    table.start();
    vi.advanceTimersByTime(D.firstHand);
    while (!(table.state.phase === PHASES.BETTING && table.state.turn === 0)) vi.advanceTimersByTime(100);
    const hand = table.state.handNumber;
    const left = table.turnMsLeft();
    vi.advanceTimersByTime(left - 1000);
    human("LATE");
    expect(table.turnMsLeft()).toBe(1000);
    vi.advanceTimersByTime(1000);
    expect(table.state.handNumber !== hand || table.state.turn !== 0).toBe(true);
  });

  it("pressing I'M BACK over and over can't stop the clock or the CPUs", () => {
    make();
    human();
    cpu();
    table.start();
    vi.advanceTimersByTime(D.firstHand);
    const start = table.state.handNumber;
    for (let i = 0; i < 400; i++) {
      table.sitIn(0);
      vi.advanceTimersByTime(500);
    }
    expect(table.state.handNumber).toBeGreaterThan(start);
  });

  it("refuses moves for CPU seats and out of turn", () => {
    make();
    human();
    cpu();
    expect(table.move(1, { type: "fold" })).toEqual({ ok: false, error: "That seat is played by a CPU" });
    expect(table.move(0, { type: "fold" })).toEqual({ ok: false, error: "No betting right now" });
  });

  it("a busted CPU buys back in before the next hand; a busted human waits for REBUY", () => {
    make();
    human();
    cpu();
    table.state = { ...table.state, seats: table.state.seats.map((p) => p && { ...p, stack: p.type === "AI" ? 0 : 1000, sittingOut: p.type === "AI" }) };
    table.start();
    vi.advanceTimersByTime(D.firstHand);
    expect(table.state.phase).toBe(PHASES.WAITING); // the CPU only rebuys between hands
    table.nextHand();
    expect(table.state.seats[1].stack).toBeGreaterThan(0);
    expect(table.state.phase).toBe(PHASES.BETTING);
  });

  it("practice can turn the clock off", () => {
    make({ turn: null });
    human();
    cpu();
    table.start();
    vi.advanceTimersByTime(D.firstHand);
    while (!(table.state.phase === PHASES.BETTING && table.state.turn === 0)) vi.advanceTimersByTime(100);
    expect(table.turnMsLeft()).toBeNull();
    vi.advanceTimersByTime(10 * 60_000);
    expect(table.state.turn).toBe(0);
  });
});

describe("saving hands and closing (credit tables)", () => {
  const deal = () => {
    human();
    cpu();
    table.start();
    vi.advanceTimersByTime(D.firstHand);
  };

  it("deals the next hand only once the finished one is saved", async () => {
    let release;
    const saves = [];
    make({}, { beforeNextHand: (h) => (saves.push(h), new Promise((r) => (release = r))) });
    deal();
    untilHandOver();
    const hand = table.state.handNumber;
    await vi.advanceTimersByTimeAsync(D.handGap + D.slowSave + 10);
    expect(table.state.handNumber).toBe(hand);
    expect(table.saving).toBe(true);
    release();
    await vi.waitFor(() => expect(table.state.handNumber).toBe(hand + 1));
    expect(table.saving).toBe(false);
    expect(saves).toHaveLength(1);
    expect(saves[0].roundNumber).toBe(hand);
  });

  it("retries a failed save until it works", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rounds = []; // the hand each save attempt was for
    make({}, { beforeNextHand: async (h) => { rounds.push(h.roundNumber); if (rounds.length < 3) throw new Error("db down"); } });
    deal();
    untilHandOver();
    const hand = table.state.handNumber;
    await vi.advanceTimersByTimeAsync(D.handGap + 2 * D.saveRetry + 100);
    await vi.waitFor(() => expect(table.state.handNumber).toBe(hand + 1));
    // The next hand may end and save too; the first three tries were all for this one.
    expect(rounds.slice(0, 3)).toEqual([hand, hand, hand]);
  });

  it("closing after the hand deals no more and calls onClosed once it's saved", async () => {
    const onClosed = vi.fn();
    make({}, { onClosed, beforeNextHand: async () => {} });
    deal();
    const hand = table.state.handNumber;
    table.closeAfterHand();
    expect(table.closing).toBe(true);
    expect(onClosed).not.toHaveBeenCalled();
    untilHandOver();
    await vi.advanceTimersByTimeAsync(D.handGap + 10);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(table.state.handNumber).toBe(hand);
  });

  it("closing with no hand running closes at once", async () => {
    const onClosed = vi.fn();
    make({}, { onClosed });
    human();
    table.closeAfterHand();
    await vi.advanceTimersByTimeAsync(0);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("seats a player with their own stack, adds chips, and carries the owner's info", () => {
    make({}, { info: { tier: "MID" } });
    expect(table.sit({ name: "ME", type: "HUMAN", key: "me", stack: 350 })).toEqual({ ok: true, seat: 0 });
    expect(table.state.seats[0].stack).toBe(350);
    expect(table.addChips(0, 100, 500)).toEqual({ ok: true });
    expect(table.addChips(0, 100, 500)).toEqual({ ok: false, error: "You can have at most 500 on the table" });
    expect(table.info).toEqual({ tier: "MID" });
  });
});
