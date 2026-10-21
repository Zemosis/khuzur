-- CREDIT MATCH STATS — the profile shows free and credit play apart for every
-- game, not just poker. A session's stakes now name any credit table's tier
-- (poker, Muushig, Thirteen), so poker_tier becomes credit_tier, and the match
-- history says what each player won or lost at a credit match.

alter table game_sessions rename column poker_tier to credit_tier;

-- Credit matches already played carry their tier in their record.
update game_sessions gs
   set credit_tier = ch.tier
  from credit_hands ch
 where ch.session_id = gs.id
   and ch.game_type <> 'poker'
   and gs.credit_tier is null;

-- Columns are appended, which create or replace allows.
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
  gp.rating_before,
  gp.rating_after,
  gp.rating_after - gp.rating_before                              as rating_delta,
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
  and gs.game_type <> 'poker'
  and gp.player_id is not null;
