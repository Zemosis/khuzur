-- Poker has no finishing places: a table runs until everyone leaves, and each
-- player's result is the chips they won or lost (final_score) plus a tally of
-- hands (stats). So poker stays out of the match history that wins, win rate,
-- placements and streaks are built on, and gets its own view.
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
  gp.stats
from game_players gp
join game_sessions gs on gs.id = gp.session_id
where gs.status = 'finished'
  and gs.game_type <> 'poker'
  and gp.player_id is not null;

-- One row per signed-in player who has sat at a finished poker table.
create view player_poker_stats as
select
  gp.player_id,
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
group by gp.player_id;
