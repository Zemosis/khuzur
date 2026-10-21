-- NO ELO — credits are the ranked play, so the Elo rating goes: the profile's
-- rating, each match's rating before and after, and every view that carried
-- them. The match history can't drop columns in place, so it and the views
-- built on it are made again, the same but for rating. (head_to_head reads the
-- history by name and keeps working.)

drop view player_match_history cascade;

alter table profiles drop column rating;
alter table game_players drop column rating_before, drop column rating_after;

create view player_match_history as
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
  and gs.game_type <> 'poker'
  and gp.player_id is not null;

create view player_stats as
select
  p.id                                                            as player_id,
  p.username,
  p.tag,
  p.avatar,
  p.level,
  p.coins,

  count(h.session_id)                                             as games_played,
  count(h.session_id) filter (where h.is_winner)                  as wins,
  count(h.session_id) filter (where not h.is_winner)              as losses,

  -- Null rather than 0 when they have not played: 0% and "no data" differ.
  round(
    count(h.session_id) filter (where h.is_winner)::numeric
      / nullif(count(h.session_id), 0) * 100
  , 1)                                                            as win_rate,

  -- Excludes walkouts so a rage-quit cannot flatter or punish the average.
  round(avg(h.final_position) filter (where not h.left_early), 2) as avg_position,
  min(h.final_position)                                           as best_position,
  max(h.final_position)                                           as worst_position,

  min(h.final_score)                                              as best_score,
  max(h.final_score)                                              as worst_score,
  round(avg(h.final_score), 1)                                    as avg_score,

  count(h.session_id) filter (where h.left_early)                 as abandons,
  count(h.session_id) filter (where h.cpu_took_over)              as cpu_finished,
  coalesce(sum(h.disconnect_count), 0)                            as total_disconnects,

  count(h.session_id) filter (where h.is_private)                 as private_games,
  count(h.session_id) filter (where not h.is_private)             as public_games,

  coalesce(sum(h.rounds_won), 0)                                  as rounds_won,
  coalesce(sum(h.round_count), 0)                                 as rounds_played,

  round(avg(h.duration_seconds))                                  as avg_match_seconds,
  coalesce(sum(h.duration_seconds), 0)                            as total_seconds_played,
  max(h.finished_at)                                              as last_played_at
from profiles p
left join player_match_history h on h.player_id = p.id
group by p.id;

create view player_game_type_stats as
select
  h.player_id,
  h.game_type,
  count(*)                                                        as games_played,
  count(*) filter (where h.is_winner)                             as wins,
  count(*) filter (where not h.is_winner)                         as losses,
  round(count(*) filter (where h.is_winner)::numeric / count(*) * 100, 1) as win_rate,
  round(avg(h.final_position) filter (where not h.left_early), 2) as avg_position,
  min(h.final_score)                                              as best_score,
  round(avg(h.duration_seconds))                                  as avg_match_seconds,
  max(h.finished_at)                                              as last_played_at
from player_match_history h
group by h.player_id, h.game_type;

create view player_placement_stats as
select
  h.player_id,
  h.game_type,
  h.final_position,
  count(*)                                                        as times,
  round(
    count(*)::numeric
      / sum(count(*)) over (partition by h.player_id, h.game_type) * 100
  , 1)                                                            as pct
from player_match_history h
where h.final_position is not null
group by h.player_id, h.game_type, h.final_position;

-- Gaps and islands: consecutive same-result matches ordered by finish time
-- form groups whose (row_number - row_number within result) is constant.
create view player_streaks as
with ordered as (
  select
    h.player_id,
    h.is_winner,
    h.finished_at,
    row_number() over (partition by h.player_id order by h.finished_at)
      - row_number() over (partition by h.player_id, h.is_winner order by h.finished_at)
      as grp
  from player_match_history h
),
runs as (
  select player_id, is_winner, count(*) as run_length, max(finished_at) as ended_at
  from ordered
  group by player_id, is_winner, grp
),
longest as (
  select
    player_id,
    coalesce(max(run_length) filter (where is_winner), 0)     as longest_win_streak,
    coalesce(max(run_length) filter (where not is_winner), 0) as longest_loss_streak
  from runs
  group by player_id
),
latest as (
  select distinct on (player_id) player_id, is_winner, run_length
  from runs
  order by player_id, ended_at desc
)
select
  l.player_id,
  l.longest_win_streak,
  l.longest_loss_streak,
  -- Positive = current win streak, negative = current losing streak.
  case when c.is_winner then c.run_length else -c.run_length end as current_streak
from longest l
join latest c on c.player_id = l.player_id;

create view leaderboards as
select
  s.player_id,
  s.username,
  s.tag,
  s.avatar,
  s.level,
  s.coins,
  s.games_played,
  s.wins,
  s.losses,
  s.win_rate,
  s.avg_position,
  s.abandons,
  s.last_played_at,
  coalesce(t.wins, 0) as thirteen_wins,
  coalesce(m.wins, 0) as muushig_wins
from player_stats s
left join player_game_type_stats t
  on t.player_id = s.player_id and t.game_type = 'thirteen'
left join player_game_type_stats m
  on m.player_id = s.player_id and m.game_type = 'muushig';
