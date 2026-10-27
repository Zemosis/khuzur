-- BLACKJACK — credit rounds are played against the house, so each round's
-- record carries the house's net: everything bet less everything paid back
-- (positive, the house won). Credits the house keeps leave the economy and
-- credits it pays enter it, so
--   sum(balance) + sum(stack + pending) = granted + claimed - removed - sum(cpu_take) - sum(house_net)
-- (server/credits/check.js).

alter table credit_hands add column house_net bigint not null default 0;

-- Blackjack's sessions are kept out of the match history, like poker's: they
-- have their own stats view. The columns are unchanged, so the views built on
-- the history stay.
create or replace view player_match_history as
select
  gp.player_id,
  gp.session_id,
  gs.game_type,
  gs.is_private,
  gs.ended_reason,
  gp.seat_index,
  gp.final_position,
  gp.final_score,
  gp.is_winner,
  gp.left_early,
  gp.cpu_took_over,
  gp.disconnect_count,
  gp.rounds_won,
  gp.coins_earned,
  gp.exp_earned,
  gs.round_count,
  gs.started_at,
  gs.finished_at,
  extract(epoch from (gs.finished_at - gs.started_at))::integer   as duration_seconds,
  gs.max_players,
  gs.solo,
  gp.stats,
  gs.credit_tier,                                                   -- null: a free match
  cr.net                                                            as credit_net, -- won less staked
  cr.won                                                            as credit_won  -- the pot (or share) paid out
from game_players gp
join game_sessions gs on gs.id = gp.session_id
left join lateral (
  select (x ->> 'net')::bigint as net, (x ->> 'won')::bigint as won
    from credit_hands ch, jsonb_array_elements(ch.seats) x
   where ch.session_id = gs.id
     and ch.game_type = gs.game_type::text
     and x ->> 'user_id' = gp.player_id::text
   limit 1
) cr on true
where gs.status = 'finished'
  and gs.game_type not in ('poker', 'blackjack')
  and gp.player_id is not null;

-- Blackjack stats per player and stakes, so the profile can show free and credit play apart.
create view player_blackjack_stats as
select
  gp.player_id,
  case when gs.credit_tier is null then 'free' else 'credits' end   as stakes,
  count(*)                                                          as tables,
  coalesce(sum((gp.stats ->> 'rounds_played')::int), 0)             as rounds_played,
  coalesce(sum((gp.stats ->> 'rounds_won')::int), 0)                as rounds_won,
  coalesce(sum((gp.stats ->> 'rounds_pushed')::int), 0)             as rounds_pushed,
  coalesce(sum((gp.stats ->> 'blackjacks')::int), 0)                as blackjacks,
  coalesce(max((gp.stats ->> 'biggest_win')::bigint), 0)            as biggest_win,
  coalesce(sum(gp.final_score), 0)                                  as net,
  coalesce(sum(extract(epoch from (coalesce(gp.left_at, gs.finished_at) - coalesce(gp.joined_at, gs.started_at)))::integer), 0) as total_seconds,
  max(gs.finished_at)                                               as last_played_at
from game_players gp
join game_sessions gs on gs.id = gp.session_id
where gs.game_type = 'blackjack'
  and gs.status = 'finished'
  and gp.player_id is not null
group by gp.player_id, stakes;
