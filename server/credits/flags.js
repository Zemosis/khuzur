// FLAGS — the admin page's reads: flagged pairs with their clues, a pair's
// hands with everyone's cards, and one account's whole ledger.

import { pool } from "../db/index.js";
import { FLAG_WINDOW_DAYS, flagPairs, pairFlows } from "./flagRules.js";
import { CreditError } from "./rules.js";

const nameOf = (p) => (p?.username ? `${p.username} #${p.tag}` : "?");

/** Flagged pairs over the last 30 days, newest flow first. */
export async function flaggedPairs() {
  const { rows: hands } = await pool.query("select id, played_at, is_private, seats from credit_hands where played_at > now() - make_interval(days => $1)", [FLAG_WINDOW_DAYS]);
  const { rows: reviews } = await pool.query("select loser_id, winner_id, reviewed_at from credit_flag_reviews");
  const flags = flagPairs(
    pairFlows(hands.map((h) => ({ id: h.id, playedAt: h.played_at, isPrivate: h.is_private, seats: h.seats }))),
    new Map(reviews.map((r) => [`${r.loser_id}>${r.winner_id}`, r.reviewed_at])),
  );
  if (!flags.length) return [];
  const ids = [...new Set(flags.flatMap((f) => [f.loser, f.winner]))];
  const { rows: people } = await pool.query(
    `select p.id, p.username, p.tag, a.created_at, a.frozen_at,
            (select count(*)::int from credit_ledger l where l.user_id = p.id and l.kind = 'claim') as claims
       from profiles p left join credit_accounts a on a.user_id = p.id
      where p.id = any($1::uuid[])`,
    [ids],
  );
  const by = new Map(people.map((p) => [p.id, p]));
  return flags.map((f) => ({
    ...f,
    loserName: nameOf(by.get(f.loser)),
    winnerName: nameOf(by.get(f.winner)),
    loserSince: by.get(f.loser)?.created_at ?? null,
    loserClaims: by.get(f.loser)?.claims ?? 0,
    loserFrozen: !!by.get(f.loser)?.frozen_at,
    winnerFrozen: !!by.get(f.winner)?.frozen_at,
  }));
}

async function accountSummary(userId) {
  const {
    rows: [r],
  } = await pool.query(
    `select p.id, p.username, p.tag, a.balance, a.frozen_at, a.frozen_note, a.created_at,
            s.table_name, s.tier, s.stack + s.pending as on_table
       from profiles p
       left join credit_accounts a on a.user_id = p.id
       left join credit_seats s on s.user_id = p.id
      where p.id = $1`,
    [userId],
  );
  if (!r) return null;
  return {
    userId: r.id,
    name: nameOf(r),
    balance: Number(r.balance ?? 0),
    frozen: !!r.frozen_at,
    frozenNote: r.frozen_note,
    since: r.created_at,
    seat: r.table_name ? { tableName: r.table_name, tier: r.tier, onTable: Number(r.on_table) } : null,
  };
}

/** Every hand two players sat in together (newest first, up to 200), each seat named. */
export async function pairDetail(a, b) {
  const { rows } = await pool.query(
    `select id, played_at, tier, is_private, seats, board, events from credit_hands
      where seats @> $1::jsonb and seats @> $2::jsonb order by played_at desc limit 200`,
    [JSON.stringify([{ user_id: a }]), JSON.stringify([{ user_id: b }])],
  );
  const ids = [...new Set(rows.flatMap((h) => h.seats.map((s) => s.user_id)).filter(Boolean))];
  const { rows: people } = await pool.query("select id, username, tag from profiles where id = any($1::uuid[])", [ids]);
  const names = new Map(people.map((p) => [p.id, nameOf(p)]));
  return {
    hands: rows.map((h) => ({
      id: h.id,
      playedAt: h.played_at,
      tier: h.tier,
      isPrivate: h.is_private,
      board: h.board,
      events: h.events,
      seats: h.seats.map((s) => ({ ...s, name: names.get(s.user_id) ?? "?" })),
    })),
    accounts: [await accountSummary(a), await accountSummary(b)],
  };
}

/** "NAME#TAG" → the account, its seat, and its ledger (newest first, up to 500 rows). */
export async function accountLookup(q) {
  const match = /^\s*([^#\s]+)\s*#\s*([A-Za-z0-9]{4})\s*$/.exec(q);
  if (!match) throw new CreditError("Search as NAME#TAG");
  const {
    rows: [p],
  } = await pool.query("select id from profiles where lower(username) = lower($1) and tag = upper($2)", [match[1], match[2]]);
  if (!p) throw new CreditError("No such player");
  const { rows } = await pool.query(
    "select id, kind, amount, balance_after, tier, hand_id, note, created_at from credit_ledger where user_id = $1 order by id desc limit 500",
    [p.id],
  );
  return { ...(await accountSummary(p.id)), ledger: rows.map((r) => ({ ...r, amount: Number(r.amount), balance_after: Number(r.balance_after) })) };
}
