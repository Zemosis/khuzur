// CREDIT BLACKJACK — a credit table's BlackjackTable plus the credits behind
// it. Every change to who holds what goes through one queue per table, so the
// table in memory and the database never disagree: sitting (a seat holding
// 0), each bet moving when betting closes, each double, split and insurance
// moving at the click, saving each finished round (the next window waits for
// it), leaving, and releasing everyone's credits when the table closes.
//
// Pass onState in the constructor (not by assigning table.onState later): the
// bridge listens to it to resync bankrolls when a betting window opens.

import { randomUUID } from "node:crypto";
import { BlackjackTable } from "../game/blackjack/table.js";
import { PHASES } from "../game/blackjack/engine.js";
import * as accounts from "./accounts.js";
import { CreditError, CreditMismatch, failure, retry } from "./rules.js";

// A round the database refuses this many times in a row as not matching is a
// bug: the table closes, every stake home.
const MAX_MISMATCHES = 3;
const logSweep = (err) => console.error("[credits] blackjack seat upkeep failed:", err);

export class CreditBlackjack {
  /**
   * name, isPrivate; sessionId() → a promise of the table's game_sessions id
   * (or null); onRefused(key, error): a bet refused at the deal, with the
   * reason for that player. Everything else (delays, rng, shoe, onState,
   * onRoundEnd, onKick, onClosed) goes to the BlackjackTable. `store` is the
   * accounts module; tests swap it.
   */
  constructor({ name, isPrivate = false, sessionId = async () => null, store = accounts, onRefused = () => {}, ...options }) {
    this.id = randomUUID(); // this run of the table: lobby codes repeat over time, this never does
    this.name = name;
    this.isPrivate = isPrivate;
    this.sessionId = sessionId;
    this.store = store;
    this.onRefused = onRefused;
    this.queue = Promise.resolve();
    this.staked = new Map(); // userId -> credits moved onto their seat row this round (what the database holds)
    this.funded = new Map(); // userId -> the extra their last funded move moved
    this.leavers = new Map(); // userId -> [resolve]: paid out by the round's save
    this.released = false;
    this.destroyed = false;
    this.mismatches = 0;
    this.lastPhase = null;
    const { onState } = options;
    this.table = new BlackjackTable({
      ...options,
      credit: true,
      onState: (table) => {
        this.watchWindow();
        onState?.(table);
      },
      beforeDeal: (bets) => this.moveBets(bets),
      fund: (request) => this.fund(request),
      beforeNextRound: (summary) => this.saveRound(summary),
    });
  }

  /** Runs `job` after every job queued before it. Its result (or error) is the caller's. */
  enqueue(job) {
    const run = this.queue.then(job);
    this.queue = run.catch(() => {});
    return run;
  }

  seatOf(userId) {
    return this.table.state.seats.findIndex((p) => p && p.key === userId);
  }

  /** What this player has bet in the round being played (0 between rounds), or null if not seated. */
  onTable(userId) {
    if (this.seatOf(userId) === -1) return null;
    return this.staked.get(userId) ?? 0;
  }

  /**
   * Sits in the first empty seat with their balance as the bankroll; their
   * seat row (holding 0) is what keeps them at one credit table. onSeat(seat)
   * runs just before the table announces them. → { ok, seat } | { ok: false, error }.
   */
  sit({ userId, name, avatar = null }, onSeat = () => {}) {
    return this.enqueue(async () => {
      if (this.released || this.table.closing) return { ok: false, error: "This table is closing" };
      const already = this.seatOf(userId);
      if (already !== -1) {
        // Already here (a second tab, a rejoin): never a second seat row.
        if (this.table.state.seats[already].leaving) return { ok: false, error: "Wait for the round to end" };
        return { ok: true, seat: already };
      }
      const seat = this.table.firstFreeSeat();
      if (seat === -1) return { ok: false, error: "The table is full" };
      let balance;
      try {
        ({ balance } = await this.store.sitBlackjack(userId, { tableId: this.id, tableName: this.name }));
      } catch (err) {
        return failure(err);
      }
      onSeat(seat);
      const result = this.table.sit({ key: userId, name, avatar, bankroll: balance }, seat);
      // The seat was checked inside the queue, so this can't fail; if it ever does, the seat row goes.
      if (!result.ok) await retry(() => this.store.standUpBlackjack(userId, this.id), `standing up ${userId}`);
      return result;
    });
  }

  /**
   * The player leaves. With a stake in the round being played, their hands
   * stand and the round's save pays them; otherwise their seat row goes now.
   * Resolves once their credits are back in their balance.
   */
  leave(userId) {
    let paid;
    const done = new Promise((resolve) => (paid = resolve));
    this.enqueue(async () => {
      const seat = this.seatOf(userId);
      if (this.leavers.has(userId)) return this.leavers.get(userId).push(paid);
      if (seat !== -1 && (this.staked.get(userId) ?? 0) > 0) {
        this.leavers.set(userId, [paid]);
        this.table.standUp(seat); // the hands stand; the seat empties when the round clears
        return;
      }
      if (seat !== -1) this.table.standUp(seat);
      if (!this.released) await retry(() => this.store.standUpBlackjack(userId, this.id), `standing up ${userId}`);
      paid();
    });
    return done;
  }

  /** DOUBLE / SPLIT (or HIT / STAND). A funded move the table couldn't apply is given back. */
  async move(userId, type) {
    const seat = this.seatOf(userId);
    if (seat === -1) return { ok: false, error: "You're not at this table" };
    return this.settleFunded(userId, await this.table.move(seat, type));
  }

  /** Insurance YES (take) or NO. Funded insurance the table couldn't apply is given back. */
  async insure(userId, take) {
    const seat = this.seatOf(userId);
    if (seat === -1) return { ok: false, error: "You're not at this table" };
    return this.settleFunded(userId, await this.table.insure(seat, take === true));
  }

  /** Everyone's credits home: stakes in a round still running go back, as if it never happened. */
  release(kind = "cash_out") {
    return this.enqueue(() => this.releaseNow(kind));
  }

  /** release()'s work, for a job already in the queue. */
  async releaseNow(kind) {
    this.released = true;
    await retry(() => this.store.releaseTable(this.id, kind), `releasing table ${this.id}`);
    this.staked.clear();
    for (const list of this.leavers.values()) for (const resolve of list) resolve();
    this.leavers.clear();
  }

  destroy() {
    this.destroyed = true;
    this.table.destroy();
  }

  // ---- the table's money hooks ----

  /**
   * beforeDeal: each bet from its balance to its seat row, one at a time. A
   * refusal sits that seat out, with the reason for the player; any other
   * failure is tried again, so a stake that may have moved is never refused.
   * Never rejects. → the refused seats.
   */
  moveBets(bets) {
    return this.enqueue(async () => {
      if (this.released) return bets.map((b) => b.seat);
      const refused = [];
      for (const { seat, key, amount } of bets) {
        try {
          await this.stake(key, amount);
        } catch (err) {
          refused.push(seat);
          this.tell(key, err instanceof CreditError ? err.message : "Your bet couldn't be placed");
        }
      }
      // Once the table has applied the refusals (right after this resolves), a
      // refused seat that left meanwhile is still sitting there, leaving: stand it up.
      if (refused.length) setTimeout(() => this.enqueue(() => this.sweepLeavers()).catch(logSweep), 0);
      return refused;
    });
  }

  /** fund: a double, split or insurance's extra onto the seat row. Always resolves. */
  fund({ key, amount }) {
    return this.enqueue(async () => {
      if (this.released) return { ok: false, error: "This table is closing" };
      try {
        await this.stake(key, amount);
      } catch (err) {
        return { ok: false, error: err instanceof CreditError ? err.message : "Your credits couldn't be moved. Try again" };
      }
      this.funded.set(key, amount);
      return { ok: true };
    });
  }

  /** beforeNextRound: the round, every return and leaver in one transaction, then bankrolls from the balances. */
  saveRound(summary) {
    return this.enqueue(async () => {
      if (this.released) return; // every stake already went home
      const leaving = this.table.state.seats.filter((p) => p && (p.leaving || this.leavers.has(p.key))).map((p) => p.key);
      for (const key of this.leavers.keys()) if (!leaving.includes(key)) leaving.push(key);
      let res;
      try {
        res = await this.store.settleBlackjackRound({ tableId: this.id, isPrivate: this.isPrivate, sessionId: await this.sessionId(), summary, leavers: leaving });
      } catch (err) {
        if (!(err instanceof CreditMismatch) || ++this.mismatches < MAX_MISMATCHES) throw err; // tried again
        // Never deal on credits the database disagrees with: void the round and close the table.
        console.error(`[credits] BLACKJACK TABLE ${this.id} DISAGREES WITH THE DATABASE (${this.mismatches}x): closing it, every stake home:`, err.message);
        this.table.closeAfterRound();
        return this.releaseNow("cash_out");
      }
      this.mismatches = 0;
      this.staked.clear(); // the save emptied every seat row
      for (const key of leaving) {
        // No id: an earlier try saved this round, before this player left, so it kept their row.
        if (res.handId == null) await retry(() => this.store.standUpBlackjack(key, this.id), `standing up ${key}`);
        for (const resolve of this.leavers.get(key) ?? []) resolve();
        this.leavers.delete(key);
      }
      const staying = this.table.state.seats.filter((p) => p && !p.leaving).map((p) => p.key);
      const balances = res.handId == null ? new Map() : new Map(res.balances);
      const missing = staying.filter((key) => !balances.has(key));
      if (missing.length) for (const [key, b] of await this.store.balancesOf(missing)) balances.set(key, b);
      this.setBankrolls(balances);
    });
  }

  // ---- internals ----

  /** `amount` from `key`'s balance to their seat row; a refusal (CreditError) throws, anything else is retried. */
  async stake(key, amount) {
    await retry(() => this.store.stakeBlackjack(key, { tableId: this.id, amount }), `staking ${amount} for ${key}`);
    this.staked.set(key, (this.staked.get(key) ?? 0) + amount);
  }

  /** The table answered a funded move with { funded: true }: the extra goes back to the balance. */
  async settleFunded(userId, result) {
    const amount = this.funded.get(userId);
    this.funded.delete(userId);
    if (!result?.funded) return result;
    if (amount) await this.enqueue(() => this.refund(userId, amount));
    return { ok: false, error: result.error };
  }

  async refund(userId, amount) {
    if (this.released) return; // the seat row (and the extra on it) already went home
    try {
      await retry(async () => {
        try {
          return await this.store.refundBlackjack(userId, { tableId: this.id, amount });
        } catch (err) {
          // More than the seat holds is a bug, not an outage: trying again won't help.
          if (err instanceof CreditMismatch) throw new CreditError(err.message);
          throw err;
        }
      }, `refunding ${amount} to ${userId}`);
      const left = (this.staked.get(userId) ?? 0) - amount;
      if (left > 0) this.staked.set(userId, left);
      else this.staked.delete(userId);
    } catch (err) {
      console.error(`[credits] refunding ${amount} to ${userId} at table ${this.id} failed:`, err.message);
    }
  }

  /** A seat left during the deal and its bet was refused: it holds nothing, so it goes now. */
  async sweepLeavers() {
    if (this.destroyed) return;
    for (const [seat, p] of this.table.state.seats.entries()) {
      if (!p || !p.leaving || p.inRound) continue;
      this.table.standUp(seat);
      if (!this.released) await retry(() => this.store.standUpBlackjack(p.key, this.id), `standing up ${p.key}`);
      for (const resolve of this.leavers.get(p.key) ?? []) resolve();
      this.leavers.delete(p.key);
    }
  }

  /** Each seated player's bankroll from the database (a seat whose move is funding takes it after). */
  setBankrolls(balances) {
    for (const [seat, p] of this.table.state.seats.entries()) {
      if (p && !p.leaving && balances.has(p.key)) this.table.setBankroll(seat, balances.get(p.key));
    }
  }

  /** A betting window opened: bankrolls catch up with the balances (a CLAIM, another tab), without holding the table. */
  watchWindow() {
    const phase = this.table?.state.phase;
    const opened = phase === PHASES.BETTING && this.lastPhase !== PHASES.BETTING;
    this.lastPhase = phase;
    if (!opened || this.released || this.destroyed) return;
    this.enqueue(async () => {
      await this.sweepLeavers();
      if (this.released || this.table.state.phase !== PHASES.BETTING) return;
      const keys = this.table.state.seats.filter((p) => p && !p.leaving).map((p) => p.key);
      if (!keys.length) return;
      let balances;
      try {
        balances = await this.store.balancesOf(keys);
      } catch (err) {
        console.error(`[credits] resyncing bankrolls at table ${this.id} failed:`, err.message);
        return;
      }
      if (this.table.state.phase !== PHASES.BETTING) return;
      for (const [seat, p] of this.table.state.seats.entries()) {
        if (p && !p.leaving && !this.table.pending.has(seat) && balances.has(p.key)) this.table.setBankroll(seat, balances.get(p.key));
      }
    }).catch(logSweep);
  }

  /** onRefused, kept out of the queue's way if it throws. */
  tell(key, error) {
    try {
      this.onRefused(key, error);
    } catch (err) {
      console.error("[credits] onRefused failed:", err);
    }
  }
}
