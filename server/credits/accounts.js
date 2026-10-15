// CREDIT ACCOUNTS — balances, CLAIM, and credits moving between a balance and
// a credit table seat. Each change is one transaction that locks the account
// row and writes a credit_ledger row, so two requests at once can't spend the
// same credits twice and every credit's history is on record.

import { pool, withTransaction } from "../db/index.js";
import { TIERS, TIER_IDS, RATHOLE_MS, buyInRange, topUpRange, fmt } from "../game/poker/tiers.js";
import { CreditError, START_BALANCE, claimState, untilText } from "./rules.js";

const num = (v) => (v == null ? null : Number(v));

/** The account row, locked for this transaction; opened (with its starting grant) on first touch. */
export async function lockAccount(client, userId) {
  const made = await client.query(
    "insert into credit_accounts (user_id, balance) values ($1, $2) on conflict (user_id) do nothing returning user_id",
    [userId, START_BALANCE],
  );
  if (made.rowCount) await ledger(client, { userId, kind: "grant", amount: START_BALANCE, balanceAfter: START_BALANCE });
  const {
    rows: [a],
  } = await client.query("select * from credit_accounts where user_id = $1 for update", [userId]);
  return { ...a, balance: num(a.balance) };
}

export async function ledger(client, { userId, kind, amount, balanceAfter, tier = null, tableId = null, handId = null, note = null, actorId = null }) {
  await client.query(
    `insert into credit_ledger (user_id, kind, amount, balance_after, tier, table_id, hand_id, note, actor_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [userId, kind, amount, balanceAfter, tier, tableId, handId, note, actorId],
  );
}

export async function setBalance(client, userId, balance) {
  await client.query("update credit_accounts set balance = $2 where user_id = $1", [userId, balance]);
}

/** Why this account can't play for credits, or null. */
async function whyCantPlay(client, userId, account) {
  if (account.frozen_at) return "Credit play is suspended on this account";
  const {
    rows: [r],
  } = await client.query("select exists (select 1 from oauth_identities where user_id = $1) as linked", [userId]);
  return r.linked ? null : "Link Google or Discord to play for credits";
}

/** The stack this player left a `tier` table with in the last hour: { amount, until } or null. */
async function ratholeFor(client, userId, tier) {
  const {
    rows: [r],
  } = await client.query(
    `select amount, created_at from credit_ledger
      where user_id = $1 and kind = 'cash_out' and tier = $2 and created_at > now() - make_interval(secs => $3)
      order by id desc limit 1`,
    [userId, tier, RATHOLE_MS / 1000],
  );
  return r ? { amount: num(r.amount), until: new Date(r.created_at.getTime() + RATHOLE_MS).toISOString() } : null;
}

/** A seat's credits back to the balance, the seat gone. */
async function payOut(client, userId, tableId, { tier, amount, kind = "cash_out", handId = null }) {
  const a = await lockAccount(client, userId);
  const balance = a.balance + amount;
  await setBalance(client, userId, balance);
  await client.query("delete from credit_seats where user_id = $1 and table_id = $2", [userId, tableId]);
  await ledger(client, { userId, kind, amount, balanceAfter: balance, tier, tableId, handId });
  return balance;
}

/**
 * Everything the CREDITS tab shows. onTable: what the player holds at the
 * table in memory right now (null: read the saved seat). A restart notice is
 * handed over once.
 */
export function me(userId, onTable = null) {
  return withTransaction(async (client) => {
    const a = await lockAccount(client, userId);
    const whyNot = await whyCantPlay(client, userId, a);
    const {
      rows: [seat],
    } = await client.query("select table_name, tier, stack, pending from credit_seats where user_id = $1", [userId]);
    const held = onTable ?? (seat ? num(seat.stack) + num(seat.pending) : 0);
    const rathole = {};
    for (const tier of TIER_IDS) rathole[tier] = await ratholeFor(client, userId, tier);
    if (a.restart_notice) await client.query("update credit_accounts set restart_notice = null where user_id = $1", [userId]);
    return {
      balance: a.balance,
      onTable: held,
      canPlay: !whyNot,
      whyNot,
      claim: claimState({ balance: a.balance, lastClaimAt: a.last_claim_at, frozen: !!a.frozen_at, onTable: held }),
      seat: seat ? { tableName: seat.table_name, tier: seat.tier } : null,
      rathole,
      notice: a.restart_notice ?? null,
    };
  });
}

/** CLAIM: back up to 1000, once a day, while balance plus table is under it. */
export function claim(userId, onTable = 0) {
  return withTransaction(async (client) => {
    const a = await lockAccount(client, userId);
    const whyNot = await whyCantPlay(client, userId, a);
    if (whyNot) throw new CreditError(whyNot);
    const state = claimState({ balance: a.balance, lastClaimAt: a.last_claim_at, frozen: !!a.frozen_at, onTable });
    if (state.state === "over") throw new CreditError("You have 1,000 or more: nothing to claim");
    if (state.state === "wait") throw new CreditError(`Your next claim is in ${untilText(Date.parse(state.nextAt) - Date.now())}`);
    const balance = a.balance + state.amount;
    await client.query("update credit_accounts set balance = $2, last_claim_at = now() where user_id = $1", [userId, balance]);
    await ledger(client, { userId, kind: "claim", amount: state.amount, balanceAfter: balance });
    return { balance };
  });
}

/** Sitting down: `amount` from the balance to a new seat at `tableId`. */
export function buyIn(userId, { tableId, tableName, tier, amount }) {
  return withTransaction(async (client) => {
    const a = await lockAccount(client, userId);
    const whyNot = await whyCantPlay(client, userId, a);
    if (whyNot) throw new CreditError(whyNot);
    const {
      rows: [seated],
    } = await client.query("select table_name from credit_seats where user_id = $1", [userId]);
    if (seated) throw new CreditError(`You're already at table ${seated.table_name}`);
    if (!Number.isInteger(amount)) throw new CreditError("Pick an amount");
    const rathole = await ratholeFor(client, userId, tier);
    const range = buyInRange(tier, a.balance, rathole);
    const max = TIERS[tier].maxBuyIn;
    if (amount < range.min) {
      throw new CreditError(
        range.ratholed
          ? `You left a ${tier} table with ${fmt(rathole.amount)} within the hour: buy in with at least ${fmt(range.min)}`
          : `This table's minimum is ${fmt(range.min)}`,
      );
    }
    if (amount > max) throw new CreditError(`This table's maximum is ${fmt(max)}`);
    if (amount > a.balance) throw new CreditError(`Your balance is ${fmt(a.balance)}`);
    const balance = a.balance - amount;
    await setBalance(client, userId, balance);
    await client.query("insert into credit_seats (user_id, table_id, table_name, tier, stack) values ($1, $2, $3, $4, $5)", [userId, tableId, tableName, tier, amount]);
    await ledger(client, { userId, kind: "buy_in", amount: -amount, balanceAfter: balance, tier, tableId });
    return { balance };
  });
}

/** ADD CHIPS / REBUY: from the balance into the seat's pending. onTable: its stack plus pending now. */
export function topUp(userId, amount, { tier, tableId, onTable }) {
  return withTransaction(async (client) => {
    const a = await lockAccount(client, userId);
    if (a.frozen_at) throw new CreditError("Credit play is suspended on this account");
    if (!Number.isInteger(amount) || amount < 1) throw new CreditError("Pick an amount");
    const range = topUpRange(tier, a.balance, onTable);
    const max = TIERS[tier].maxBuyIn;
    if (amount < range.min) throw new CreditError(`Buy back in with at least ${fmt(range.min)}`);
    if (onTable + amount > max) throw new CreditError(`You can have at most ${fmt(max)} on this table`);
    if (amount > a.balance) throw new CreditError(`Your balance is ${fmt(a.balance)}`);
    const updated = await client.query("update credit_seats set pending = pending + $3 where user_id = $1 and table_id = $2", [userId, tableId, amount]);
    if (!updated.rowCount) throw new CreditError("You're not at this table");
    const balance = a.balance - amount;
    await setBalance(client, userId, balance);
    await ledger(client, { userId, kind: "top_up", amount: -amount, balanceAfter: balance, tier, tableId });
    return { balance };
  });
}

/** Leaving between hands: the saved stack plus pending back to the balance. Safe to repeat. */
export function cashOut(userId, tableId) {
  return withTransaction(async (client) => {
    const {
      rows: [seat],
    } = await client.query("select tier, stack, pending from credit_seats where user_id = $1 and table_id = $2 for update", [userId, tableId]);
    if (!seat) return { paid: 0 };
    const paid = num(seat.stack) + num(seat.pending);
    await payOut(client, userId, tableId, { tier: seat.tier, amount: paid });
    return { paid };
  });
}

/**
 * A finished hand: its record, every seat's new stack, and leavers paid out,
 * in one transaction. seats: everyone at the table in memory now
 * ({ userId, stack, pending, leaving }). Each must hold what the database
 * says plus what the hand won or lost them, or nothing is written. Returns
 * the hand's id, or null if it was saved already (a retry after a lost reply).
 */
export function saveHand({ tableId, tier, isPrivate, sessionId, summary, events, seats }) {
  return withTransaction(async (client) => {
    const seatsJson = summary.seatResults.map((r) => ({
      seat: r.seat_index,
      user_id: r.player_key,
      stack_before: r.stack_before,
      stack_after: r.stack_after,
      net: r.net,
      won: r.won,
      committed: r.committed,
      folded_street: r.folded_street,
      shown_hand: r.shown_hand,
      hole: r.hole,
    }));
    const inserted = await client.query(
      `insert into credit_hands (table_id, session_id, tier, hand_number, is_private, seats, board, events)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (table_id, hand_number) do nothing returning id`,
      [tableId, sessionId, tier, summary.roundNumber, !!isPrivate, JSON.stringify(seatsJson), JSON.stringify(summary.board ?? []), JSON.stringify(events ?? [])],
    );
    if (!inserted.rowCount) return null;
    const handId = inserted.rows[0].id;

    const { rows } = await client.query(
      "select user_id, stack, pending from credit_seats where table_id = $1 and user_id = any($2::uuid[]) for update",
      [tableId, seats.map((x) => x.userId)],
    );
    const saved = new Map(rows.map((r) => [r.user_id, num(r.stack) + num(r.pending)]));
    const net = new Map(summary.seatResults.map((r) => [r.player_key, r.net]));
    for (const x of seats) {
      const expected = saved.has(x.userId) ? saved.get(x.userId) + (net.get(x.userId) ?? 0) : null;
      if (x.stack + x.pending !== expected) {
        throw new Error(`credits at table ${tableId} don't match the database for ${x.userId}: ${x.stack + x.pending} vs ${expected}`);
      }
    }
    for (const x of seats) {
      if (x.leaving) await payOut(client, x.userId, tableId, { tier, amount: x.stack + x.pending, handId });
      else await client.query("update credit_seats set stack = $3, pending = $4 where user_id = $1 and table_id = $2", [x.userId, tableId, x.stack, x.pending]);
    }
    const dealt = summary.seatResults.map((r) => r.player_key).filter(Boolean);
    await client.query("update credit_accounts set first_hand_at = coalesce(first_hand_at, now()) where user_id = any($1::uuid[])", [dealt]);
    return handId;
  });
}

/** Every seat at `tableId` home at its saved stack plus pending (a hand still running is void). */
export function releaseTable(tableId, kind = "cash_out") {
  return withTransaction(async (client) => {
    const { rows } = await client.query("select user_id, tier, stack, pending from credit_seats where table_id = $1 order by user_id for update", [tableId]);
    const paid = [];
    for (const r of rows) {
      const amount = num(r.stack) + num(r.pending);
      await payOut(client, r.user_id, tableId, { tier: r.tier, amount, kind });
      paid.push({ userId: r.user_id, amount });
    }
    return paid;
  });
}

/** At boot: no table survived, so every seat goes home, and each player is told once. Returns how many. */
export function returnAllSeats() {
  return withTransaction(async (client) => {
    const { rows } = await client.query("select user_id, table_id, table_name, tier, stack, pending from credit_seats order by user_id for update");
    for (const r of rows) {
      const amount = num(r.stack) + num(r.pending);
      await payOut(client, r.user_id, r.table_id, { tier: r.tier, amount, kind: "restart_return" });
      await client.query("update credit_accounts set restart_notice = $2 where user_id = $1", [r.user_id, JSON.stringify({ amount, tableName: r.table_name })]);
    }
    return rows.length;
  });
}

/**
 * An admin takes credits off `fromId`: back to `toId` (RETURN) or out of the
 * economy (REMOVE, toId null). Never below zero: returns what was recovered.
 */
export function reverse({ adminId, fromId, toId = null, amount, note }) {
  return withTransaction(async (client) => {
    if (!Number.isInteger(amount) || amount < 1) throw new CreditError("Pick an amount");
    if (toId === fromId) throw new CreditError("Pick two different players");
    // Locked in a fixed order, so two reversals between the same pair can't deadlock.
    const locked = new Map();
    for (const id of [fromId, toId].filter(Boolean).sort()) locked.set(id, await lockAccount(client, id));
    const from = locked.get(fromId);
    const taken = Math.min(amount, from.balance);
    await setBalance(client, fromId, from.balance - taken);
    await ledger(client, { userId: fromId, kind: toId ? "admin_return_out" : "admin_remove", amount: -taken, balanceAfter: from.balance - taken, note, actorId: adminId });
    if (toId) {
      const to = locked.get(toId);
      await setBalance(client, toId, to.balance + taken);
      await ledger(client, { userId: toId, kind: "admin_return_in", amount: taken, balanceAfter: to.balance + taken, note, actorId: adminId });
    }
    return { recovered: taken, requested: amount };
  });
}

/** FREEZE / UNFREEZE: a frozen account can't sit at credit tables or claim. */
export function setFrozen({ adminId, userId, frozen, note }) {
  return withTransaction(async (client) => {
    const a = await lockAccount(client, userId);
    await client.query("update credit_accounts set frozen_at = $2, frozen_note = $3 where user_id = $1", [userId, frozen ? new Date() : null, frozen ? note : null]);
    await ledger(client, { userId, kind: frozen ? "freeze" : "unfreeze", amount: 0, balanceAfter: a.balance, note, actorId: adminId });
    return { frozen: !!frozen };
  });
}

/** DISMISS: the pair's flag stays hidden until new credits flow between them. */
export function dismissFlag({ adminId, loserId, winnerId, note }) {
  return withTransaction(async (client) => {
    const a = await lockAccount(client, loserId);
    await client.query(
      `insert into credit_flag_reviews (loser_id, winner_id, reviewed_by, note) values ($1, $2, $3, $4)
       on conflict (loser_id, winner_id) do update set reviewed_at = now(), reviewed_by = $3, note = $4`,
      [loserId, winnerId, adminId, note],
    );
    await ledger(client, { userId: loserId, kind: "dismiss", amount: 0, balanceAfter: a.balance, note, actorId: adminId });
    return { dismissed: true };
  });
}
