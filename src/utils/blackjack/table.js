// BLACKJACK TABLE — runs a table over time: opens the betting window, deals,
// keeps the insurance and turn clocks, plays the dealer card by card, pauses
// on the results, and reports players who keep sitting out. The rules are
// engine.js; this adds only timers, who may do what, and the money hooks.
//
// The browser and the server both run this class (server/game/blackjack/ is
// a byte-identical copy). It reports every change through onState(table),
// each finished round through onRoundEnd(summary), and asks the owner to
// stand a seat up through onKick(seat) (too many betting windows sat out),
// which it does with standUp().
//
// Money hooks, used only by credit tables (a free table takes doubles,
// splits and insurance straight from the seat's bankroll):
//   beforeDeal(bets: [{ seat, key, amount }]) → Promise<number[]>: the bets
//     move when betting closes; it resolves with the seats it refused, which
//     sit the round out.
//   fund({ seat, key, amount, kind: "double" | "split" | "insurance" }) →
//     Promise<{ ok, error? }>: the extra moves before the card is dealt. While
//     it runs that move is pending: no other move is taken, and no clock acts.
//   beforeNextRound(summary) → Promise: the round's save; the next betting
//     window waits for it (retried after delays.saveRetry while it rejects).

import {
  PHASES,
  act,
  bettingDone,
  clearRound,
  closeBetting,
  closeInsurance,
  createTable,
  deal,
  dealerStep,
  insuranceDone,
  insure,
  moveSeat,
  openBetting,
  placeBet,
  rebuy,
  refuseBet,
  roundSummary,
  setBankroll,
  setReady,
  sit,
  standUp,
} from "./engine.js";
import { insuranceCost, secureRandom } from "./rules.js";

// Milliseconds.
export const DEFAULT_BLACKJACK_DELAYS = {
  betting: 15_000, // the betting window
  insurance: 8_000, // everyone answers insurance
  turn: 15_000, // each decision on a hand
  deal: 2_500, // the cards go round before the first clock starts
  dealerStep: 800, // between the dealer's cards
  results: 5_000, // the results show, then betting reopens
  saveRetry: 3_000, // a failed save (credit tables) is tried again after this
  slowSave: 1_000, // the next window has waited this long on a save: the table shows "Saving…"
};
export const SKIPS_BEFORE_KICK = 5; // betting windows sat out in a row: onKick

const FUND_FAILED = "Your credits couldn't be moved. Try again";

export class BlackjackTable {
  constructor({ credit = false, delays, rng = secureRandom, shoe, onState, onRoundEnd, onKick, onClosed, beforeDeal, fund, beforeNextRound } = {}) {
    this.delays = { ...DEFAULT_BLACKJACK_DELAYS, ...delays };
    this.credit = credit;
    this.rng = rng;
    this.onState = onState;
    this.onRoundEnd = onRoundEnd;
    this.onKick = onKick;
    this.onClosed = onClosed;
    this.beforeDeal = beforeDeal;
    this.fund = fund;
    this.beforeNextRound = beforeNextRound;
    this.state = createTable({ credit, shoe });
    this.destroyed = false;
    this.timer = null; // the one pending step: closing betting or insurance, a turn's clock, a dealer card, the next window
    this.timerFor = null; // which moment of the table that step was armed for (see stepKey)
    this.phaseEndsAt = null; // when the running clock (betting, insurance, turn) runs out, deal pause included
    this.clockMs = null; // that clock's length
    this.dealEndsAt = 0; // the cards are still going round until then; the first clock waits
    this.pending = new Set(); // seats whose double, split or insurance is being funded
    this.overdue = null; // { key, fn }: a clock that ran out while a move was funding
    this.leaveAfterFund = new Set(); // seats that stood up while funding
    this.kicked = new Set(); // seats already reported to onKick
    this.save = null; // the last round's save while it runs
    this.saveWait = null; // the next window, waiting on that save
    this.slowTimer = null;
    this.saving = false; // the next window has waited delays.slowSave on the save
    this.closing = false; // closeAfterRound(): no more rounds
    this.closed = false;
  }

  firstFreeSeat() {
    return this.state.seats.findIndex((s) => s === null);
  }

  /** player: { key, name, avatar, bankroll? }. → { ok, seat } or { ok: false, error }. Opens betting at a waiting table. */
  sit(player, seat = this.firstFreeSeat()) {
    if (seat === -1) return { ok: false, error: "The table is full" };
    const result = this.change((s) => {
      const next = sit(s, seat, player);
      return next.phase === PHASES.WAITING && !this.closing ? openBetting(next) : next;
    }, { seat });
    if (result.ok) this.kicked.delete(seat);
    return result;
  }

  moveSeat(from, to) {
    const result = this.change((s) => moveSeat(s, from, to));
    if (result.ok && this.kicked.delete(from)) this.kicked.add(to);
    return result;
  }

  /** Out of a round the seat empties; in one, its hands stand and settle with the round. */
  standUp(seat) {
    if (this.pending.has(seat)) {
      // Their move is being funded: it lands first, then they leave.
      this.leaveAfterFund.add(seat);
      return { ok: true };
    }
    const result = this.change((s) => {
      const next = standUp(s, seat);
      // The last player left during betting: no clock for an empty table.
      return next.phase === PHASES.BETTING && !next.seats.some(Boolean) ? openBetting(next) : next;
    });
    if (result.ok) {
      this.kicked.delete(seat);
      this.closeIfBetsIn();
      this.closeIfInsured();
    }
    return result;
  }

  rebuy(seat) {
    return this.change((s) => rebuy(s, seat));
  }

  setBankroll(seat, amount) {
    const result = this.change((s) => setBankroll(s, seat, amount));
    if (result.ok) this.closeIfBetsIn();
    return result;
  }

  bet(seat, amount) {
    return this.change((s) => placeBet(s, seat, amount));
  }

  /** DEAL: closes betting early once everyone is in. */
  ready(seat) {
    const result = this.change((s) => setReady(s, seat));
    if (result.ok) this.closeIfBetsIn();
    return result;
  }

  /** Insurance YES (take) or NO. At a credit table YES waits for fund. */
  async insure(seat, take) {
    if (this.pending.has(seat)) return { ok: false, error: "Not your turn" };
    const s = this.state;
    try {
      insure(s, seat, take);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    let result;
    if (take && this.credit && this.fund) {
      const p = s.seats[seat];
      const funded = await this.funded(seat, { seat, key: p.key, amount: insuranceCost(p.bet), kind: "insurance" });
      if (this.destroyed) return funded;
      result = funded.ok ? this.change((st) => insure(st, seat, take)) : funded;
      this.afterFund(seat);
    } else {
      result = this.change((st) => insure(st, seat, take));
    }
    this.closeIfInsured();
    return result;
  }

  /** "HIT" | "STAND" | "DOUBLE" | "SPLIT". At a credit table DOUBLE and SPLIT wait for fund. */
  async move(seat, type) {
    if (this.pending.size > 0) return { ok: false, error: "Not your turn" };
    const s = this.state;
    if (this.credit && this.fund && (type === "DOUBLE" || type === "SPLIT")) {
      try {
        act(s, seat, type); // only a legal move is funded
      } catch (err) {
        return { ok: false, error: err.message };
      }
      const p = s.seats[seat];
      const amount = p.hands[s.turn.hand].bet;
      const funded = await this.funded(seat, { seat, key: p.key, amount, kind: type.toLowerCase() });
      if (this.destroyed) return funded;
      const result = funded.ok ? this.change((st) => act(st, seat, type)) : funded;
      this.afterFund(seat);
      return result;
    }
    return this.change((st) => act(st, seat, type));
  }

  /** Milliseconds left on the betting, insurance or turn clock, or null when none runs. */
  phaseMsLeft() {
    if (this.phaseEndsAt == null) return null;
    return Math.min(this.clockMs, Math.max(0, this.phaseEndsAt - Date.now()));
  }

  /** For the server's shared broadcast. */
  dealMsLeft() {
    return 0;
  }

  /** No more rounds: the one in play finishes and is saved, then onClosed. */
  closeAfterRound() {
    if (this.closing) return;
    this.closing = true;
    this.onState?.(this);
    if (this.state.phase === PHASES.WAITING || this.state.phase === PHASES.BETTING) this.finishClose();
  }

  destroy() {
    this.destroyed = true;
    this.clearTimer();
    clearTimeout(this.slowTimer);
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
    if (next.phase === PHASES.ROUND_OVER && prev.phase !== PHASES.ROUND_OVER) {
      const summary = roundSummary(next);
      this.onRoundEnd?.(summary);
      if (this.credit && this.beforeNextRound) this.save = this.saveRound(summary);
    }
    this.reschedule();
    this.onState?.(this);
  }

  /**
   * The moment the pending step belongs to. Seating, bets, READY and
   * insurance answers leave it alone, so they never restart a clock; each
   * decision on a hand (a new card, a split) and each dealer card is a new
   * moment.
   */
  stepKey() {
    const s = this.state;
    const t = s.turn;
    const hands = t ? `${t.seat}.${t.hand}.${s.seats[t.seat].hands.map((h) => h.cards.length).join(",")}` : "";
    return `${s.phase}|${s.roundNumber}|${hands}|${s.dealer.cards.length}|${s.dealer.revealed}`;
  }

  /** Arms the one next step for the state as it is now, unless it's already armed. */
  reschedule() {
    if (this.destroyed || this.closed) return;
    const key = this.stepKey();
    if (this.timer && key === this.timerFor) return;
    this.clearTimer();
    this.phaseEndsAt = null;
    this.clockMs = null;
    this.timerFor = key;
    const s = this.state;
    const d = this.delays;
    const pause = Math.max(0, this.dealEndsAt - Date.now());
    if (s.phase === PHASES.BETTING) {
      this.clock(d.betting, 0, () => this.closeBets());
    } else if (s.phase === PHASES.INSURANCE) {
      this.clock(d.insurance, pause, () => this.expire(() => this.step(closeInsurance)));
    } else if (s.phase === PHASES.TURNS) {
      const seat = s.turn.seat;
      this.clock(d.turn, pause, () => this.expire(() => this.step((st) => act(st, seat, "STAND"))));
    } else if (s.phase === PHASES.DEALER) {
      this.later(pause + d.dealerStep, () => this.step(dealerStep));
    } else if (s.phase === PHASES.ROUND_OVER) {
      this.later(pause + d.results, () => this.nextRound());
    }
  }

  clock(ms, pause, fn) {
    this.clockMs = ms;
    this.phaseEndsAt = Date.now() + pause + ms;
    this.later(pause + ms, fn);
  }

  /** A step the table takes on its own; it never throws into a timer. */
  step(fn) {
    const result = this.change(fn);
    if (!result.ok) console.error("[blackjack] table step failed:", result.error);
  }

  /** A clock ran out. If a move is being funded, it acts once that's resolved (and only if nothing moved). */
  expire(fn) {
    if (this.pending.size > 0) {
      this.overdue = { key: this.stepKey(), fn };
      return;
    }
    fn();
  }

  /** Betting closes (clock or everyone READY): bets in, kicks, credit bets moved, cards out. */
  async closeBets() {
    if (this.closed || this.destroyed || this.state.phase !== PHASES.BETTING) return;
    try {
      this.apply(closeBetting(this.state));
      this.checkKicks();
      if (this.state.phase !== PHASES.DEALING) return; // nobody bet: the window reopened

      let refused = [];
      if (this.credit && this.beforeDeal) {
        const bets = this.state.seats.flatMap((p, seat) => (p?.inRound ? [{ seat, key: p.key, amount: p.bet }] : []));
        try {
          refused = (await this.beforeDeal(bets)) ?? [];
        } catch (err) {
          console.error("[blackjack] moving the bets failed:", err.message);
          refused = bets.map((b) => b.seat);
        }
        if (this.destroyed) return;
      }
      let s = this.state;
      for (const seat of refused) if (s.seats[seat]?.inRound) s = refuseBet(s, seat);
      const next = deal(s, this.rng);
      if (next.phase !== PHASES.BETTING) this.dealEndsAt = Date.now() + this.delays.deal;
      this.apply(next);
    } catch (err) {
      console.error("[blackjack] closing betting failed:", err);
    }
  }

  closeIfBetsIn() {
    if (bettingDone(this.state)) this.closeBets();
  }

  closeIfInsured() {
    if (this.pending.size === 0 && insuranceDone(this.state)) this.step(closeInsurance);
  }

  /** Runs fund for `seat`'s move; while it runs the move is pending. → { ok } or { ok: false, error }. */
  async funded(seat, request) {
    this.pending.add(seat);
    let res;
    try {
      res = await this.fund(request);
    } catch (err) {
      console.error("[blackjack] funding a move failed:", err.message);
      res = null;
    }
    this.pending.delete(seat);
    return res?.ok ? { ok: true } : { ok: false, error: res?.error || FUND_FAILED };
  }

  /** A funded move has landed (or was refused): a leave it held, then a clock that ran out meanwhile. */
  afterFund(seat) {
    if (this.leaveAfterFund.delete(seat)) this.standUp(seat);
    if (this.pending.size > 0) return;
    const overdue = this.overdue;
    this.overdue = null;
    if (overdue && overdue.key === this.stepKey()) overdue.fn();
    else this.reschedule();
  }

  /** Every seat that has sat out SKIPS_BEFORE_KICK windows in a row is reported, once. */
  checkKicks() {
    this.state.seats.forEach((p, seat) => {
      if (!p || p.skipped < SKIPS_BEFORE_KICK) {
        this.kicked.delete(seat);
        return;
      }
      if (this.kicked.has(seat) || this.destroyed) return;
      this.kicked.add(seat);
      this.onKick?.(seat);
    });
  }

  /** After the results (and the save): the table clears, then betting reopens, or the table closes. */
  nextRound() {
    if (this.save) return this.waitForSave();
    const cleared = clearRound(this.state);
    if (this.closing) {
      this.apply(cleared);
      return this.finishClose();
    }
    this.apply(openBetting(cleared));
  }

  /** Runs beforeNextRound until it succeeds (the owner keeps it safe to repeat). */
  async saveRound(summary) {
    for (;;) {
      try {
        await this.beforeNextRound(summary);
        break;
      } catch (err) {
        console.error("[blackjack] saving the round failed, retrying:", err.message);
        await new Promise((resolve) => setTimeout(resolve, this.delays.saveRetry));
      }
    }
    this.save = null;
  }

  /** The next window waits for the save; after slowSave the table says so. */
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
      if (!this.destroyed) this.nextRound();
    });
  }

  finishClose() {
    if (this.closed) return;
    this.closed = true;
    this.clearTimer();
    this.phaseEndsAt = null;
    Promise.resolve(this.save).then(() => this.onClosed?.(this));
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
}
