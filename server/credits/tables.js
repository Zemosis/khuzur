// CREDIT TABLES — a credit table's PokerTable plus the credits behind it.
// Every change to who holds what goes through one queue per table, so the
// table in memory and the database never disagree: buying in, adding chips,
// saving each finished hand (the next deal waits for it), leaving, and
// releasing everyone's credits when the table closes.

import { randomUUID } from "node:crypto";
import { PokerTable } from "../game/poker/table.js";
import { TIERS } from "../game/poker/tiers.js";
import * as accounts from "./accounts.js";
import { CreditMismatch, failure, retry } from "./rules.js";

const running = (s) => s.phase === "BETTING" || s.phase === "RUNOUT";
// A save the database refuses this many times in a row as not matching is a bug:
// the table closes, everyone home at the stacks last saved.
const MAX_MISMATCHES = 3;

export class CreditTable {
  /**
   * name, tier ("LOW" | "MID" | "HIGH"), isPrivate; sessionId() → a promise of
   * the table's game_sessions id (or null). Everything else (delays, onState,
   * onHandEnd, onKick, onClosed, rng) goes to the PokerTable. `store` is the
   * accounts module; tests swap it.
   */
  constructor({ name, tier, isPrivate = false, sessionId = async () => null, store = accounts, ...options }) {
    const t = TIERS[tier];
    this.id = randomUUID(); // this run of the table: lobby codes repeat over time, this never does
    this.name = name;
    this.tier = tier;
    this.isPrivate = isPrivate;
    this.sessionId = sessionId;
    this.store = store;
    this.queue = Promise.resolve();
    this.unsaved = false; // a hand has ended and its save hasn't finished
    this.leavers = new Map(); // userId -> [resolve]: paid out by the hand being played or saved
    this.released = false;
    this.mismatches = 0;
    this.table = new PokerTable({
      ...options,
      smallBlind: t.smallBlind,
      bigBlind: t.bigBlind,
      buyIn: t.minBuyIn,
      waitForBigBlind: true,
      allInPlaysOut: true,
      info: { tier },
      beforeNextHand: (summary) => this.saveHand(summary),
    });
  }

  /** Runs `job` after every job queued before it. Its result (or error) is the caller's. */
  enqueue(job) {
    const run = this.queue.then(job);
    this.queue = run.catch(() => {});
    return run;
  }

  seatOf(userId) {
    return this.table.state.seats.findIndex((p) => p?.type === "HUMAN" && p.key === userId);
  }

  /** What this player holds here — stack, chips waiting to land, chips in the pot — or null. */
  onTable(userId) {
    const p = this.table.state.seats[this.seatOf(userId)];
    if (!p) return null;
    return p.stack + p.pending + (running(this.table.state) ? p.committed : 0);
  }

  /**
   * Buys in with `amount` and sits in the first empty seat. onSeat(seat) runs
   * just before the table announces them. → { ok, seat } | { ok: false, error }.
   */
  sit({ userId, name, avatar = null }, amount, onSeat = () => {}) {
    return this.enqueue(async () => {
      if (this.released || this.table.closing) return { ok: false, error: "This table is closing" };
      const seat = this.table.firstFreeSeat();
      if (seat === -1) return { ok: false, error: "The table is full" };
      try {
        await this.store.buyIn(userId, { tableId: this.id, tableName: this.name, tier: this.tier, amount });
      } catch (err) {
        return failure(err);
      }
      onSeat(seat);
      const result = this.table.sit({ name, type: "HUMAN", avatar, key: userId, stack: amount }, seat);
      // The seat was checked inside the queue, so this can't fail; if it ever does, the credits go back.
      if (!result.ok) await retry(() => this.store.cashOut(userId, this.id), `refunding ${userId}`);
      return result;
    });
  }

  /** ADD CHIPS / REBUY: credits from the balance onto the seat, landing before the next deal. */
  addChips(userId, amount) {
    return this.enqueue(async () => {
      const seat = this.seatOf(userId);
      const p = this.table.state.seats[seat];
      if (!p || p.leaving || this.leavers.has(userId)) return { ok: false, error: "You're not at this table" };
      if (running(this.table.state) && p.inHand && !p.folded) return { ok: false, error: "Add chips between hands" };
      try {
        await this.store.topUp(userId, amount, { tier: this.tier, tableId: this.id, onTable: p.stack + p.pending });
      } catch (err) {
        return failure(err);
      }
      // The database has the credits: they land whatever the table did meanwhile.
      return this.table.addChips(this.seatOf(userId), amount);
    });
  }

  /**
   * The player leaves. Out of any hand their credits go back now; in one (or
   * while the hand that just ended is saved) that hand's save pays them.
   * Resolves once the credits are back in their balance.
   */
  leave(userId) {
    let paid;
    const done = new Promise((resolve) => (paid = resolve));
    this.enqueue(async () => {
      const seat = this.seatOf(userId);
      const p = this.table.state.seats[seat];
      if (!p) return paid();
      if (this.leavers.has(userId)) return this.leavers.get(userId).push(paid);
      const inHand = running(this.table.state) && p.inHand;
      if (inHand || this.unsaved) {
        this.leavers.set(userId, [paid]);
        if (inHand) this.table.standUp(seat); // folds, or an all-in plays out; the seat empties after the save
        return;
      }
      this.table.standUp(seat);
      await retry(() => this.store.cashOut(userId, this.id), `paying out ${userId}`);
      paid();
    });
    return done;
  }

  /** beforeNextHand: the hand that just ended and everyone's credits, in one transaction. */
  saveHand(summary) {
    this.unsaved = true;
    return this.enqueue(async () => {
      if (this.released) return; // everyone went home at the stacks last saved
      const s = this.table.state;
      const seats = s.seats.flatMap((p, seat) =>
        p?.type === "HUMAN" ? [{ seat, userId: p.key, stack: p.stack, pending: p.pending, leaving: p.leaving || this.leavers.has(p.key) }] : [],
      );
      let handId;
      try {
        handId = await this.store.saveHand({ tableId: this.id, tier: this.tier, isPrivate: this.isPrivate, sessionId: await this.sessionId(), summary, events: s.events, seats });
      } catch (err) {
        if (!(err instanceof CreditMismatch) || ++this.mismatches < MAX_MISMATCHES) throw err; // tried again
        // Never deal on credits the database disagrees with: void this hand and close the table.
        console.error(`[credits] TABLE ${this.id} DISAGREES WITH THE DATABASE (${this.mismatches}x): closing it, everyone home at the stacks last saved:`, err.message);
        this.table.closeAfterHand();
        return this.releaseNow("cash_out");
      }
      this.mismatches = 0;
      this.unsaved = false;
      for (const x of seats.filter((x) => x.leaving)) {
        // No id: this hand was saved by an earlier try whose reply was lost, before
        // this player left — so that save didn't pay them. Pay them now.
        if (handId == null) await retry(() => this.store.cashOut(x.userId, this.id), `paying out ${x.userId}`);
        if (this.table.state.seats[x.seat]) this.table.standUp(x.seat); // the hand is over: the seat empties now
        for (const resolve of this.leavers.get(x.userId) ?? []) resolve();
        this.leavers.delete(x.userId);
      }
    });
  }

  /** Everyone's credits home at the stacks last saved; a hand still running is void. */
  release(kind = "cash_out") {
    return this.enqueue(() => this.releaseNow(kind));
  }

  /** release()'s work, for a job already in the queue. */
  async releaseNow(kind) {
    this.released = true;
    await retry(() => this.store.releaseTable(this.id, kind), `releasing table ${this.id}`);
    for (const list of this.leavers.values()) for (const resolve of list) resolve();
    this.leavers.clear();
  }

  destroy() {
    this.table.destroy();
  }
}

/** At boot: no table survived the restart, so every seat's credits go home. */
export async function returnSeatsAfterRestart() {
  const n = await accounts.returnAllSeats();
  if (n) console.log(`[credits] returned ${n} seat(s) to their balances after a restart`);
  return n;
}
