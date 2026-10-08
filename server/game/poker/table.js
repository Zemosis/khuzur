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
import { chooseAction } from "./ai.js";

// Milliseconds. `turn: null` turns the clock off (practice).
export const DEFAULT_POKER_DELAYS = {
  thinkMin: 900, // a CPU's pause before acting...
  thinkMax: 2200, // ...somewhere in between
  turn: 20_000, // a human's turn clock
  runout: 1400, // between all-in board cards
  handGap: 4000, // the result shows, then the next hand deals
  firstHand: 1500, // from enough players sitting down to the first deal
  sitOutKick: 300_000, // sitting out this long stands you up
};
export const MAX_TIMEOUTS = 2; // turn clocks run out this many times in a row: sit out

export class PokerTable {
  constructor({ smallBlind, bigBlind, buyIn = BUY_IN, delays, rng = secureRandom, onState, onHandEnd, onKick } = {}) {
    this.delays = { ...DEFAULT_POKER_DELAYS, ...delays };
    this.buyIn = buyIn;
    this.rng = rng;
    this.onState = onState;
    this.onHandEnd = onHandEnd;
    this.onKick = onKick;
    this.state = createTable({ smallBlind, bigBlind });
    this.started = false;
    this.destroyed = false;
    this.turnEndsAt = null;
    this.timer = null; // the one pending step: a CPU move, the clock, a runout card, the next hand
    this.kickTimers = new Map(); // seat -> timer
    this.timeouts = Array(this.state.seats.length).fill(0);
  }

  firstFreeSeat() {
    return this.state.seats.findIndex((s) => s === null);
  }

  /** player: { name, type, level?, avatar?, key? }. → { ok, seat } or { ok: false, error }. */
  sit(player, seat = this.firstFreeSeat()) {
    if (seat === -1) return { ok: false, error: "The table is full" };
    return this.change((s) => sit(s, seat, { ...player, stack: this.buyIn }), { seat });
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

  /** The host's START. Hands then follow each other while 2+ players have chips. */
  start() {
    if (this.started) return { ok: false, error: "The table has already started" };
    this.started = true;
    this.reschedule();
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
    if (next.phase === PHASES.HAND_OVER && prev.phase !== PHASES.HAND_OVER) this.onHandEnd?.(handSummary(next));
    this.reschedule();
    this.onState?.(this);
  }

  /** Arms the one next step for the state as it is now, and the sit-out kicks. */
  reschedule() {
    if (this.destroyed) return;
    this.clearTimer();
    this.turnEndsAt = null;
    this.armKicks();
    if (!this.started) return;
    const s = this.state;
    const d = this.delays;
    if (s.phase === PHASES.BETTING) {
      const p = s.seats[s.turn];
      if (p.type === "AI") this.later(d.thinkMin + this.rng() * (d.thinkMax - d.thinkMin), () => this.playCpu());
      else if (d.turn != null) {
        this.turnEndsAt = Date.now() + d.turn;
        this.later(d.turn, () => this.timeOut(s.turn));
      }
    } else if (s.phase === PHASES.RUNOUT) {
      this.later(d.runout, () => this.apply(advance(this.state)));
    } else if (s.phase === PHASES.HAND_OVER) {
      this.later(d.handGap, () => this.nextHand());
    } else if (canStartHand(s)) {
      this.later(d.firstHand, () => this.nextHand());
    }
  }

  nextHand() {
    let s = this.state;
    // CPUs at a free table buy back in on their own.
    s.seats.forEach((p, i) => {
      if (p?.type === "AI" && p.stack === 0 && !p.leaving) s = rebuy(s, i, this.buyIn);
    });
    this.apply(canStartHand(s) ? startHand(s, this.rng) : s.phase === PHASES.WAITING ? s : toWaiting(s));
  }

  playCpu() {
    const s = this.state;
    const seat = s.turn;
    const p = s.seats[seat];
    let next;
    try {
      next = act(s, seat, chooseAction(viewFor(s, seat), seat, p.level, this.rng));
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
    for (const t of this.kickTimers.values()) clearTimeout(t);
    this.kickTimers.clear();
  }
}
