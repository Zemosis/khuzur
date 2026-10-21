// CREDIT MATCHES — the credits behind a match-based credit table (Muushig,
// Thirteen).
// Everyone stakes the same amount to sit; standing up before the deal gives
// it back. Once the match starts the stakes are in the pot: a player who
// leaves has a CPU cover their seat and can come back, until the CPU has
// finished FORFEIT_ROUNDS rounds for them. The winner takes the pot, and a
// pot a CPU wins (or a forfeited seat) is lost.
//
// Like CreditTable, every change to who holds what goes through one queue
// per table, so the table in memory and the database never disagree. The
// game itself stays with the lobby: this only needs to hear when it starts,
// when a round ends, and its final state.

import { randomUUID } from "node:crypto";
import * as accounts from "./accounts.js";
import { CreditMismatch, failure, retry } from "./rules.js";
import { STAKES, FORFEIT_ROUNDS, matchWinners, settlement } from "../game/stakes.js";

export class CreditMatch {
  /**
   * name, tier ("LOW" | "MID" | "HIGH"), isPrivate, gameType; botsFill: CPUs
   * fill the empty seats when the match starts (Muushig), or they stay empty
   * (Thirteen). `store` is the accounts module; tests swap it.
   */
  constructor({ name, tier, isPrivate = false, gameType = "muushig", botsFill = gameType === "muushig", store = accounts }) {
    this.id = randomUUID(); // this run of the table: lobby codes repeat over time, this never does
    this.name = name;
    this.tier = tier;
    this.stake = STAKES[tier];
    this.isPrivate = isPrivate;
    this.gameType = gameType;
    this.botsFill = botsFill;
    this.store = store;
    this.queue = Promise.resolve();
    this.released = false;
    this.staked = new Set(); // userIds with a stake at the waiting table
    this.match = null; // { seats: [{ userId, away, awayRounds, forfeited }] } while one runs
    this.matchNumber = 0;
    this.settling = false;
    this.result = null; // the last match's { pot, payouts, cpuTake, winners, staked, forfeited, void }
  }

  /** Runs `job` after every job queued before it. Its result (or error) is the caller's. */
  enqueue(job) {
    const run = this.queue.then(job);
    this.queue = run.catch(() => {});
    return run;
  }

  /** The stake this player has here, or null. */
  onTable(userId) {
    return this.staked.has(userId) || this.seatOf(userId) !== -1 ? this.stake : null;
  }

  /** The player's seat in the running match, or -1. */
  seatOf(userId) {
    return this.match ? this.match.seats.findIndex((s) => s.userId === userId) : -1;
  }

  /** In the running match and not forfeited: they may take their seat back. */
  canReturn(userId) {
    const seat = this.seatOf(userId);
    return seat !== -1 && !this.match.seats[seat].forfeited;
  }

  /** Stakes `userId` at the waiting table. → { ok } | { ok: false, error } */
  sit(userId, amount = this.stake) {
    return this.enqueue(async () => {
      if (this.released) return { ok: false, error: "This table is closing" };
      if (this.match || this.settling) return { ok: false, error: "The match has started" };
      if (this.staked.has(userId)) return { ok: true };
      try {
        await this.store.placeStake(userId, { tableId: this.id, tableName: this.name, tier: this.tier, stake: this.stake, amount, gameType: this.gameType });
      } catch (err) {
        return failure(err);
      }
      this.staked.add(userId);
      return { ok: true };
    });
  }

  /** Standing up from the waiting table: the stake comes back. Resolves once it has. In a match it stays in the pot. */
  standUp(userId) {
    return this.enqueue(async () => {
      if (!this.staked.has(userId) || this.seatOf(userId) !== -1) return;
      this.staked.delete(userId);
      await retry(() => this.store.returnStake(userId, this.id), `returning ${userId}'s stake`);
    });
  }

  /**
   * The match starts. seats: per seat the staked userId, or null for a CPU;
   * every staked player must have one. Queued behind any stake still being
   * placed or returned. → { ok } | { ok: false, error }
   */
  begin(seats) {
    return this.enqueue(() => {
      if (this.released) return { ok: false, error: "This table is closing" };
      if (this.match) return { ok: false, error: "The match has started" };
      const seated = seats.filter(Boolean);
      if (seated.length !== this.staked.size || seated.some((id) => !this.staked.has(id))) {
        return { ok: false, error: "Someone just sat down or stood up. Press START again" };
      }
      this.matchNumber += 1;
      this.result = null;
      this.match = { seats: seats.map((userId) => ({ userId: userId ?? null, away: false, awayRounds: 0, forfeited: false })) };
      return { ok: true };
    });
  }

  /** A CPU covers this player's seat from now. */
  away(userId) {
    const seat = this.seatOf(userId);
    if (seat !== -1) this.match.seats[seat].away = true;
  }

  /** The player is back in their seat: the forfeit clock starts over. False if the seat is no longer theirs. */
  back(userId) {
    if (!this.canReturn(userId)) return false;
    const s = this.match.seats[this.seatOf(userId)];
    s.away = false;
    s.awayRounds = 0;
    return true;
  }

  /** The seat is no longer this player's (an admin froze them): it plays on as a CPU's. */
  forfeit(userId) {
    const seat = this.seatOf(userId);
    if (seat !== -1) Object.assign(this.match.seats[seat], { away: true, forfeited: true });
  }

  /** A round finished: each seat a CPU covered for it counts one. Returns the userIds forfeited by it. */
  roundEnded() {
    if (!this.match) return [];
    const forfeited = [];
    for (const s of this.match.seats) {
      if (!s.away || s.forfeited) continue;
      s.awayRounds += 1;
      if (s.awayRounds >= FORFEIT_ROUNDS) {
        s.forfeited = true;
        forfeited.push(s.userId);
      }
    }
    return forfeited;
  }

  /**
   * The match is over: the pot to the winners and every stake spent, in one
   * save (retried until it lands). state: the game's final state, whose
   * players carry score and eaten. A table the database disagrees with is
   * never paid: the match is void and every stake goes home.
   */
  settle(state, { sessionId = null, rounds = [] } = {}) {
    this.settling = true;
    return this.enqueue(async () => {
      try {
        if (this.released || !this.match) return this.result;
        const seats = this.match.seats.map((s, i) => ({ userId: s.userId, forfeited: s.forfeited, score: state.players[i].score, eaten: state.players[i].eaten ?? null }));
        const winners = matchWinners(this.gameType, state);
        const { pot, payouts, cpuTake } = settlement({ stake: this.stake, seats, winners });
        const record = { tableId: this.id, tier: this.tier, isPrivate: this.isPrivate, sessionId, matchNumber: this.matchNumber, stake: this.stake, seats, payouts, cpuTake, rounds, gameType: this.gameType };
        const saved = await retry(async () => {
          try {
            await this.store.settleMatch(record);
            return true;
          } catch (err) {
            if (err instanceof CreditMismatch) return false;
            throw err;
          }
        }, `settling table ${this.id}`);
        const staked = seats.flatMap((s, i) => (s.userId ? [i] : []));
        const forfeited = seats.flatMap((s, i) => (s.forfeited ? [i] : []));
        if (saved) {
          this.result = { pot, payouts, cpuTake, winners, staked, forfeited, void: false };
        } else {
          console.error(`[credits] MATCH AT TABLE ${this.id} DISAGREES WITH THE DATABASE: void, every stake home`);
          await retry(() => this.store.releaseTable(this.id, "stake_back"), `voiding table ${this.id}`);
          this.result = { pot, payouts: [], cpuTake: 0, winners, staked, forfeited, void: true };
        }
        this.staked.clear();
        this.match = null;
        return this.result;
      } finally {
        this.settling = false;
      }
    });
  }

  /** Every stake at the table home; a match still running is void. */
  release(kind = "stake_back") {
    return this.enqueue(async () => {
      this.released = true;
      await retry(() => this.store.releaseTable(this.id, kind), `releasing table ${this.id}`);
      this.staked.clear();
      this.match = null;
    });
  }

  /** What the browser shows: the stake, the pot, and the comeback clock of each covered seat. */
  view() {
    const m = this.match;
    return {
      tier: this.tier,
      stake: this.stake,
      botsFill: this.botsFill,
      pot: this.stake * (m ? m.seats.filter((s) => s.userId).length : this.staked.size),
      staked: m ? m.seats.filter((s) => s.userId).length : this.staked.size,
      seats: m ? m.seats.map((s) => (s.userId ? { staked: true, away: s.away, roundsLeft: FORFEIT_ROUNDS - s.awayRounds, forfeited: s.forfeited } : null)) : null,
      settling: this.settling,
      // The last match's result, without user ids: each payout by seat, and which seats had staked.
      result: this.result && { ...this.result, payouts: this.result.payouts.map(({ seat, amount }) => ({ seat, amount })) },
    };
  }
}
