-- CREDITS — balances, the credits at credit tables, the hands played for
-- them and a ledger of every movement (docs/superpowers/specs/2026-10-08-credits-design.md).
--
-- Every credit is in a balance (credit_accounts) or a seat (credit_seats);
-- credit_ledger records each move between them and every admin action, so
--   sum(balance) + sum(stack + pending) = granted + claimed - removed
-- always holds (server/credits/check.js).

create type credit_tier as enum ('LOW', 'MID', 'HIGH');
create type credit_kind as enum (
  'grant', 'claim', 'buy_in', 'top_up', 'cash_out', 'restart_return',
  'admin_return_out', 'admin_return_in', 'admin_remove', 'freeze', 'unfreeze', 'dismiss'
);

-- One per signed-in player, made the first time they touch credits.
create table credit_accounts (
  user_id uuid primary key references users (id) on delete cascade,
  balance bigint not null check (balance >= 0),
  last_claim_at timestamptz not null default now(), -- the starting grant counts as a claim
  first_hand_at timestamptz,                        -- on the leaderboard from their first credit hand
  frozen_at timestamptz,
  frozen_note text,
  restart_notice jsonb,                             -- { amount, tableName }, shown once after a restart
  created_at timestamptz not null default now()
);

-- The credits at tables right now: one seat per player. `stack` is the stack
-- at the last saved hand (so also what a running hand started from);
-- `pending` is chips added since, landing at the next deal.
create table credit_seats (
  user_id uuid primary key references credit_accounts (user_id) on delete cascade,
  table_id uuid not null,
  table_name text not null,
  tier credit_tier not null,
  stack bigint not null check (stack >= 0),
  pending bigint not null default 0 check (pending >= 0),
  seated_at timestamptz not null default now()
);
create index credit_seats_table_id_idx on credit_seats (table_id);

-- Every finished credit hand. `seats` holds each player's result and hole
-- cards; only the server and the admin page read it.
create table credit_hands (
  id bigserial primary key,
  table_id uuid not null,
  session_id uuid references game_sessions (id) on delete set null,
  tier credit_tier not null,
  hand_number integer not null,
  is_private boolean not null default false,
  seats jsonb not null,
  board jsonb not null default '[]',
  events jsonb not null default '[]',
  played_at timestamptz not null default now(),
  unique (table_id, hand_number)
);
create index credit_hands_played_at_idx on credit_hands (played_at);
create index credit_hands_seats_idx on credit_hands using gin (seats jsonb_path_ops);

create table credit_ledger (
  id bigserial primary key,
  user_id uuid not null references users (id) on delete cascade,
  kind credit_kind not null,
  amount bigint not null, -- signed, as the balance sees it
  balance_after bigint not null,
  tier credit_tier,
  table_id uuid,
  hand_id bigint references credit_hands (id) on delete set null,
  note text,
  actor_id uuid references users (id) on delete set null, -- the admin, for admin kinds
  created_at timestamptz not null default now()
);
create index credit_ledger_user_id_created_at_idx on credit_ledger (user_id, created_at);
create index credit_ledger_kind_created_at_idx on credit_ledger (kind, created_at);

-- A flagged pair an admin looked at: hidden until new credits flow between them.
create table credit_flag_reviews (
  loser_id uuid not null references users (id) on delete cascade,
  winner_id uuid not null references users (id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid references users (id) on delete set null,
  note text not null,
  primary key (loser_id, winner_id)
);

-- Hidden from Supabase's Data API like every other table (003_lock_down.sql).
alter table credit_accounts enable row level security;
alter table credit_seats enable row level security;
alter table credit_hands enable row level security;
alter table credit_ledger enable row level security;
alter table credit_flag_reviews enable row level security;

-- A poker session's stakes: null for free chips.
alter table game_sessions add column poker_tier credit_tier;

-- Poker stats per player and stakes, so the profile can show free and credit play apart.
drop view player_poker_stats;
create view player_poker_stats as
select
  gp.player_id,
  case when gs.poker_tier is null then 'free' else 'credits' end    as stakes,
  count(*)                                                          as sessions,
  coalesce(sum((gp.stats ->> 'hands_played')::int), 0)              as hands_played,
  coalesce(sum((gp.stats ->> 'hands_won')::int), 0)                 as hands_won,
  coalesce(sum(gp.final_score), 0)                                  as net,
  coalesce(max((gp.stats ->> 'biggest_pot')::int), 0)               as biggest_pot,
  coalesce(sum((gp.stats ->> 'vpip_hands')::int), 0)                as vpip_hands,
  coalesce(sum((gp.stats ->> 'showdowns')::int), 0)                 as showdowns,
  coalesce(sum((gp.stats ->> 'showdowns_won')::int), 0)             as showdowns_won,
  coalesce(sum(extract(epoch from (coalesce(gp.left_at, gs.finished_at) - coalesce(gp.joined_at, gs.started_at)))::integer), 0) as total_seconds,
  max(gs.finished_at)                                               as last_played_at
from game_players gp
join game_sessions gs on gs.id = gp.session_id
where gs.game_type = 'poker'
  and gs.status = 'finished'
  and gp.player_id is not null
group by gp.player_id, stakes;
