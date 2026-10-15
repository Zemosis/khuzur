// LEADERBOARD — everyone who has played a credit hand, by balance plus what
// they hold at a table (as last saved), worked out at most every 30 seconds.
// Frozen accounts are left out. Rows never carry user ids.

import { pool } from "../db/index.js";

export const TOP = 100;
const AROUND = 5;
const CACHE_MS = 30_000;
let cache = { at: 0, rows: null };

export function clearLeaderboardCache() {
  cache = { at: 0, rows: null };
}

async function ranked() {
  if (cache.rows && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const { rows } = await pool.query(`
    select a.user_id, p.username, p.tag, p.avatar, p.custom_avatar,
           a.balance + coalesce(s.stack + s.pending, 0)                                as total,
           s.user_id is not null                                                       as at_table,
           rank() over (order by a.balance + coalesce(s.stack + s.pending, 0) desc)    as rank
      from credit_accounts a
      join profiles p on p.id = a.user_id
      left join credit_seats s on s.user_id = a.user_id
     where a.frozen_at is null and a.first_hand_at is not null and p.username is not null
     order by total desc, lower(p.username), p.tag`);
  cache = {
    at: Date.now(),
    rows: rows.map((r) => ({
      userId: r.user_id,
      rank: Number(r.rank),
      name: r.username,
      tag: r.tag,
      avatar: { variant: r.avatar, custom: r.avatar === "custom" ? r.custom_avatar : null },
      total: Number(r.total),
      atTable: r.at_table,
    })),
  };
  return cache.rows;
}

const shown = ({ userId, ...row }, me) => ({ ...row, me: userId === me });

/** { top: the first 100, me: { rank, total, around } | null }. around: the 5 above and below, only outside the top 100. */
export async function leaderboard(userId = null) {
  const rows = await ranked();
  const i = userId ? rows.findIndex((r) => r.userId === userId) : -1;
  return {
    top: rows.slice(0, TOP).map((r) => shown(r, userId)),
    me:
      i === -1
        ? null
        : { rank: rows[i].rank, total: rows[i].total, around: i < TOP ? null : rows.slice(i - AROUND, i + AROUND + 1).map((r) => shown(r, userId)) },
  };
}

export async function rankOf(userId) {
  return (await ranked()).find((r) => r.userId === userId)?.rank ?? null;
}
