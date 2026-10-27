// LEADERBOARD — everyone who has played a credit hand, by balance plus what
// they hold at a table (as last saved), worked out at most every 30 seconds.
// Frozen accounts are left out. Rows never carry user ids.
//
// Each row also says where its credits came from. Every credit on the board
// arrived one way: the starting grant, daily claims, an admin moving it, or
// won and lost at each game's tables. Table results come from the ledger —
// what went to the tables (buy-ins, top-ups, stakes, bets) against what came
// back (cash-outs, returned stakes, pots, payouts, restart returns), plus what's on a table
// now — so the sources always add up to the total, even for a hand record that
// never reached a balance.

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
    with sources as (
      select user_id,
             coalesce(sum(amount) filter (where kind = 'grant'), 0)                    as start,
             coalesce(sum(amount) filter (where kind = 'claim'), 0)                    as claimed,
             coalesce(sum(amount) filter (where kind in ('admin_return_in', 'admin_return_out', 'admin_remove')), 0) as admin,
             coalesce(sum(amount) filter (where game_type = 'poker'), 0)              as poker,
             coalesce(sum(amount) filter (where game_type = 'muushig'), 0)            as muushig,
             coalesce(sum(amount) filter (where game_type = 'thirteen'), 0)           as thirteen,
             coalesce(sum(amount) filter (where game_type = 'blackjack'), 0)          as blackjack
        from credit_ledger group by user_id
    )
    select a.user_id, p.username, p.tag, p.avatar, p.custom_avatar,
           a.balance + coalesce(s.stack + s.pending, 0)                                as total,
           s.user_id is not null                                                       as at_table,
           rank() over (order by a.balance + coalesce(s.stack + s.pending, 0) desc)    as rank,
           coalesce(src.start, 0) as start, coalesce(src.claimed, 0) as claimed,
           coalesce(src.admin, 0) as admin,
           coalesce(src.poker, 0) + case when s.game_type = 'poker' then s.stack + s.pending else 0 end     as poker,
           coalesce(src.muushig, 0) + case when s.game_type = 'muushig' then s.stack + s.pending else 0 end as muushig,
           coalesce(src.thirteen, 0) + case when s.game_type = 'thirteen' then s.stack + s.pending else 0 end as thirteen,
           coalesce(src.blackjack, 0) + case when s.game_type = 'blackjack' then s.stack + s.pending else 0 end as blackjack
      from credit_accounts a
      join profiles p on p.id = a.user_id
      left join credit_seats s on s.user_id = a.user_id
      left join sources src on src.user_id = a.user_id
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
      sources: { start: Number(r.start), claimed: Number(r.claimed), poker: Number(r.poker), muushig: Number(r.muushig), thirteen: Number(r.thirteen), blackjack: Number(r.blackjack), admin: Number(r.admin) },
    })),
  };
  return cache.rows;
}

const shown = ({ userId, ...row }, me) => ({ ...row, me: userId === me });

/** { top: the first 100, me: { rank, total, around } | null }. around: you with the 5 above and below. */
export async function leaderboard(userId = null) {
  const rows = await ranked();
  const i = userId ? rows.findIndex((r) => r.userId === userId) : -1;
  return {
    top: rows.slice(0, TOP).map((r) => shown(r, userId)),
    me:
      i === -1
        ? null
        : { rank: rows[i].rank, total: rows[i].total, around: rows.slice(Math.max(0, i - AROUND), i + AROUND + 1).map((r) => shown(r, userId)) },
  };
}

export async function rankOf(userId) {
  return (await ranked()).find((r) => r.userId === userId)?.rank ?? null;
}
