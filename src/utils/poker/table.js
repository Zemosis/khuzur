// POKER TABLE — runs a table over time: deals hand after hand, plays the CPU
// seats, keeps the turn clock, runs out all-in boards card by card, and sits
// out (then stands up) players who stop playing. The rules are engine.js; this
// adds only timers and who may do what.
//
// The browser's practice table and the server's online tables both run this
// class (server/game/poker/ is a byte-identical copy). It reports every
// change through onState(table) and each finished hand through
// onHandEnd(summary); onKick(seat) asks the owner to stand a seat up (sat out
// too long), which it does with standUp().

import {
  BUY_IN,
  PHASES,
  act,
  addChips,
  advance,
  canStartHand,
  createTable,
  handSummary,
  legalActions,
  rebuy,
  secureRandom,
  setSittingOut,
  sit,
  standUp,
  startHand,
  toWaiting,
  viewFor,
} from "./engine.js";
import { chooseAction, updateReads } from "./ai.js";

// Milliseconds. `turn: null` turns the clock off (practice).
export const DEFAULT_POKER_DELAYS = {
  thinkMin: 900, // a CPU's pause before acting...
  thinkMax: 2200, // ...somewhere in between
  deal: 3000, // a new hand's first CPU also waits for the shuffle and the deal round the table
  turn: 20_000, // a human's turn clock
  runout: 1400, // between all-in board cards
  handGap: 4000, // the result shows, then the next hand deals
  firstHand: 3000, // from enough players sitting down to the first deal (the table counts it down)
  sitOutKick: 300_000, // sitting out this long stands you up
  saveRetry: 3000, // a failed save (credit tables) is tried again after this
  slowSave: 1000, // the next deal has waited this long on a save: the table shows "Saving…"
};
export const MAX_TIMEOUTS = 2; // turn clocks run out this many times in a row: sit out
const running = (s) => s.phase === PHASES.BETTING || s.phase === PHASES.RUNOUT;

export class PokerTable {
  /**
   * beforeNextHand(summary) → Promise: called when a hand ends; the next deal
   * waits for it (retried after delays.saveRetry while it rejects). onClosed:
   * after closeAfterHand(), once no hand runs and the last save is done.
   * info: anything the owner wants every view to carry (a credit table's tier).
   */
  constructor({ smallBlind, bigBlind, buyIn = BUY_IN, waitForBigBlind = false, allInPlaysOut = false, info = null, delays, rng = secureRandom, onState, onHandEnd, onKick, beforeNextHand, onClosed } = {}) {
    this.delays = { ...DEFAULT_POKER_DELAYS, ...delays };
    this.buyIn = buyIn;
    this.rng = rng;
    this.info = info;
    this.onState = onState;
    this.onHandEnd = onHandEnd;
    this.onKick = onKick;
    this.beforeNextHand = beforeNextHand;
    this.onClosed = onClosed;
    this.state = createTable({ smallBlind, bigBlind, waitForBigBlind, allInPlaysOut });
    this.started = false;
    this.destroyed = false;
    this.turnEndsAt = null;
    this.nextHandAt = null; // when the next hand deals, while one is coming
    this.timer = null; // the one pending step: a CPU move, the clock, a runout card, the next hand
    this.timerFor = null; // which moment of the table that step was armed for (see stepKey)
    this.kickTimers = new Map(); // seat -> timer
    this.timeouts = Array(this.state.seats.length).fill(0);
    this.save = null; // the last hand's save while it runs
    this.saveWait = null; // the next deal, waiting on that save
    this.slowTimer = null;
    this.saving = false; // the next deal has waited delays.slowSave on the save
    this.closing = false; // closeAfterHand(): no more hands
    this.closed = false;
    this.reads = []; // what the table has seen each player do, for the CPUs (see updateReads)
  }


  firstFreeSeat() {
    return this.state.seats.findIndex((s) => s === null);
  }

  /** player: { name, type, level?, avatar?, key?, stack? }. → { ok, seat } or { ok: false, error }. */
  sit(player, seat = this.firstFreeSeat()) {
    if (seat === -1) return { ok: false, error: "The table is full" };
    return this.change((s) => sit(s, seat, { stack: this.buyIn, ...player }), { seat });
  }


  standUp(seat) {
    this.timeouts[seat] = 0;
    return this.change((s) => standUp(s, seat));
  }

  rebuy(seat) {
    return this.change((s) => rebuy(s, seat, this.buyIn));
  }

  /** "I'M BACK": dealt in again from the next hand. */
  sitIn(seat) {
    this.timeouts[seat] = 0;
    return this.change((s) => setSittingOut(s, seat, false));
  }
  /** Chips that land on `seat`'s stack before the next deal (credit tables). */
  addChips(seat, amount, max) {
    return this.change((s) => addChips(s, seat, amount, max));
  }

  /** No more hands: the one in play finishes and is saved, then onClosed. */
  closeAfterHand() {
    if (this.closing) return;
    this.closing = true;
    this.onState?.(this);
    if (!running(this.state)) this.finishClose();
  }


  /** The host's START. Hands then follow each other while 2+ players have chips. */
  start() {
    if (this.started) return { ok: false, error: "The table has already started" };
    this.started = true;
    this.reschedule();
    this.onState?.(this); // the countdown to the first hand starts
    return { ok: true };
  }

  /** A human's move from `seat`. */
  move(seat, move) {
    const p = this.state.seats[seat];
    if (!p) return { ok: false, error: "Not your turn" };
    if (p.type !== "HUMAN") return { ok: false, error: "That seat is played by a CPU" };
    const result = this.change((s) => act(s, seat, move));
    if (result.ok) this.timeouts[seat] = 0;
    return result;
  }

  /** Milliseconds left on the turn clock, or null when no clock runs. */
  turnMsLeft() {
    return this.turnEndsAt == null ? null : Math.max(0, this.turnEndsAt - Date.now());
  }

  /** Milliseconds until the next hand deals, or null when none is coming yet. */
  nextHandMsLeft() {
    return this.nextHandAt == null ? null : Math.max(0, this.nextHandAt - Date.now());
  }

  /** For the server's shared broadcast: poker has no deal clock. */
  dealMsLeft() {
    return 0;
  }

  // ---- internals ----

  change(step, extra = {}) {
    let next;
    try {
      next = step(this.state);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    this.apply(next);
    return { ok: true, ...extra };
  }

  apply(next) {
    const prev = this.state;
    this.state = next;
    if (next.phase === PHASES.HAND_OVER && prev.phase !== PHASES.HAND_OVER) {
      this.reads = updateReads(this.reads, next);
      const summary = handSummary(next);
      this.onHandEnd?.(summary);
      if (this.beforeNextHand) this.save = this.saveHand(summary);
    }
    this.reschedule();
    this.onState?.(this);
  }

  /**
   * The moment the pending step belongs to. Seating, rebuys and I'M BACK
   * leave it alone, so they never restart a turn clock, a CPU's thinking or
   * the pause between hands.
   */
  stepKey() {
    const s = this.state;
    return `${this.started}|${s.handNumber}|${s.phase}|${s.turn}|${s.events.length}|${canStartHand(s)}`;
  }

  /** Arms the one next step for the state as it is now (unless it's already armed), and the sit-out kicks. */
  reschedule() {
    if (this.destroyed) return;
    this.armKicks();
    const key = this.stepKey();
    if (this.timer && key === this.timerFor) return;
    this.clearTimer();
    this.turnEndsAt = null;
    this.nextHandAt = null;
    this.timerFor = key;
    if (!this.started) return;
    const s = this.state;
    const d = this.delays;
    if (s.phase === PHASES.BETTING) {
      const p = s.seats[s.turn];
      const dealing = !s.events.some((e) => e.type === "act") ? d.deal : 0;
      if (p.type === "AI") this.later(dealing + d.thinkMin + this.rng() * (d.thinkMax - d.thinkMin), () => this.playCpu());
      else if (d.turn != null) {
        this.turnEndsAt = Date.now() + d.turn;
        this.later(d.turn, () => this.timeOut(s.turn));
      }
    } else if (s.phase === PHASES.RUNOUT) {
      this.later(d.runout, () => this.apply(advance(this.state)));
    } else if (s.phase === PHASES.HAND_OVER) {
      this.nextHandAt = Date.now() + d.handGap;
      this.later(d.handGap, () => this.nextHand());
    } else if (canStartHand(s)) {
      this.nextHandAt = Date.now() + d.firstHand;
      this.later(d.firstHand, () => this.nextHand());
    }
  }

  nextHand() {
    if (this.closing) return this.finishClose();
    if (this.save) return this.waitForSave();
    let s = this.state;
    // CPUs at a free table buy back in on their own.
    s.seats.forEach((p, i) => {
      if (p?.type === "AI" && p.stack === 0 && !p.leaving) s = rebuy(s, i, this.buyIn);
    });
    this.apply(canStartHand(s) ? startHand(s, this.rng) : s.phase === PHASES.WAITING ? s : toWaiting(s));
  }

  /** Runs beforeNextHand until it succeeds (the owner keeps it safe to repeat). */
  async saveHand(summary) {
    for (;;) {
      try {
        await this.beforeNextHand(summary);
        break;
      } catch (err) {
        console.error("[poker] saving the hand failed, retrying:", err.message);
        await new Promise((resolve) => setTimeout(resolve, this.delays.saveRetry));
      }
    }
    this.save = null;
  }

  /** The next deal waits for the save; after slowSave the table says so. */
  waitForSave() {
    if (this.saveWait) return;
    this.slowTimer = setTimeout(() => {
      this.saving = true;
      this.onState?.(this);
    }, this.delays.slowSave);
    this.saveWait = this.save.then(() => {
      clearTimeout(this.slowTimer);
      this.saveWait = null;
      this.saving = false;
      if (!this.destroyed) this.nextHand();
    });
  }

  finishClose() {
    if (this.closed) return;
    this.closed = true;
    this.clearTimer();
    Promise.resolve(this.save).then(() => this.onClosed?.(this));
  }


  playCpu() {
    const s = this.state;
    const seat = s.turn;
    const p = s.seats[seat];
    let next;
    try {
      next = act(s, seat, chooseAction(viewFor(s, seat), seat, p.level, this.rng, this.reads));
    } catch (err) {
      // A CPU must never stall the table: check if it can, else fold.
      console.error("[poker] CPU move failed:", err);
      next = act(s, seat, { type: legalActions(s, seat).canCheck ? "check" : "fold" });
    }
    this.apply(next);
  }

  /** The clock ran out: check if free, else fold. Too many in a row sits them out. */
  timeOut(seat) {
    let s = this.state;
    s = act(s, seat, { type: legalActions(s, seat).canCheck ? "check" : "fold" });
    this.timeouts[seat] += 1;
    if (this.timeouts[seat] >= MAX_TIMEOUTS && s.seats[seat]) s = setSittingOut(s, seat, true);
    this.apply(s);
  }

  armKicks() {
    this.state.seats.forEach((p, seat) => {
      const out = !!p && p.type === "HUMAN" && p.sittingOut && !p.leaving;
      const timer = this.kickTimers.get(seat);
      if (out && !timer) {
        this.kickTimers.set(
          seat,
          setTimeout(() => {
            this.kickTimers.delete(seat);
            if (!this.destroyed) this.onKick?.(seat);
          }, this.delays.sitOutKick),
        );
      } else if (!out && timer) {
        clearTimeout(timer);
        this.kickTimers.delete(seat);
      }
    });
  }

  later(ms, fn) {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.destroyed) fn();
    }, ms);
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  destroy() {
    this.destroyed = true;
    this.clearTimer();
    clearTimeout(this.slowTimer);
    for (const t of this.kickTimers.values()) clearTimeout(t);
    this.kickTimers.clear();
  }
}
