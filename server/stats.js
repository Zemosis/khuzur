// PLAYER STATS — everything the profile's Stats panel shows, for each game
// filter (overall, Thirteen, Muushig, Poker) in one response so switching is
// instant. Poker has no places, so it has its own figures (pokerStatsFor) and
// stays out of the others, overall included.
// Every figure is computed from the recorded matches (player_match_history),
// online and solo alike, so it can never disagree with history. Rating is
// deliberately left out for now.

import { pool } from "./db/index.js";

const VIEWS = { overall: null, thirteen: "thirteen", muushig: "muushig" };
const RECENT = 20;

const int = (v) => (v == null ? 0 : Number(v));
const dec = (v) => (v == null ? null : Number(v));

/** Current streak (+ wins / − losses) and the best win run, oldest result first. */
function streaks(results) {
  let bestWin = 0;
  let run = 0;
  for (const won of results) {
    run = won ? Math.max(run, 0) + 1 : Math.min(run, 0) - 1;
    if (run > bestWin) bestWin = run;
  }
  return { current: run, bestWin };
}

async function statsFor(playerId, gameType) {
  const where = "player_id = $1 and ($2::game_type is null or game_type = $2)";
  const args = [playerId, gameType];

  const [summary, places, results, recent, extras, hands] = await Promise.all([
    pool.query(
      `select
         count(*)                                                  as games,
         count(*) filter (where is_winner)                         as wins,
         count(*) filter (where not is_winner)                     as losses,
         count(*) filter (where final_position = max_players)      as dead_last,
         round(count(*) filter (where is_winner)::numeric / nullif(count(*), 0) * 100, 1) as win_rate,
         round(avg(final_position) filter (where not left_early), 2) as avg_finish,
         round(avg(max_players), 1)                                as field_size,
         coalesce(sum(rounds_won), 0)                              as rounds_won,
         coalesce(sum(coalesce((stats ->> 'rounds_played')::int, round_count)), 0) as rounds_played,
         coalesce(sum(duration_seconds), 0)                        as total_seconds,
         round(avg(duration_seconds))                              as avg_seconds,
         max(finished_at)                                          as last_played_at
       from player_match_history where ${where}`,
      args,
    ),
    pool.query(
      `select final_position as place, count(*) as times
         from player_match_history
        where ${where} and final_position is not null
        group by final_position order by final_position`,
      args,
    ),
    pool.query(`select is_winner from player_match_history where ${where} order by finished_at`, args),
    pool.query(
      `select session_id, game_type, final_position, max_players, final_score, is_winner,
              left_early, solo, duration_seconds, finished_at
         from player_match_history where ${where}
        order by finished_at desc limit ${RECENT}`,
      args,
    ),
    // Game-specific tallies are sums of the numbers in each match's stats blob.
    gameType
      ? pool.query(
          `select e.key, sum(e.value::numeric) as total
             from player_match_history h, jsonb_each(coalesce(h.stats, '{}'::jsonb)) as e
            where ${where} and jsonb_typeof(e.value) = 'number'
            group by e.key`,
          args,
        )
      : null,
    gameType === "thirteen"
      ? pool.query(
          `select e.key, sum(e.value::int) as total
             from player_match_history h, jsonb_each_text(coalesce(h.stats -> 'hands', '{}'::jsonb)) as e
            where ${where}
            group by e.key`,
          args,
        )
      : null,
  ]);

  const s = summary.rows[0];
  const view = {
    games: int(s.games),
    wins: int(s.wins),
    losses: int(s.losses),
    deadLast: int(s.dead_last),
    winRate: dec(s.win_rate),
    avgFinish: dec(s.avg_finish),
    fieldSize: dec(s.field_size),
    streak: streaks(results.rows.map((r) => r.is_winner)),
    placements: places.rows.map((r) => ({ place: int(r.place), times: int(r.times) })),
    rounds: { won: int(s.rounds_won), played: int(s.rounds_played) },
    time: { totalSeconds: int(s.total_seconds), avgSeconds: dec(s.avg_seconds), lastPlayedAt: s.last_played_at },
    recent: recent.rows.map((r) => ({
      id: r.session_id,
      game: r.game_type,
      place: r.final_position,
      of: r.max_players,
      won: r.is_winner,
      leftEarly: r.left_early,
      solo: r.solo,
      score: r.final_score,
      seconds: r.duration_seconds,
      finishedAt: r.finished_at,
    })),
  };
  if (extras) view.extras = Object.fromEntries(extras.rows.map((r) => [r.key, Number(r.total)]));
  if (hands) view.hands = Object.fromEntries(hands.rows.map((r) => [r.key, int(r.total)]));
  return view;
}

/** Poker figures, from player_poker_stats: zeros for someone who hasn't played. */
async function pokerStatsFor(playerId) {
  const {
    rows: [r = {}],
  } = await pool.query("select * from player_poker_stats where player_id = $1", [playerId]);
  const hands = int(r.hands_played);
  const pct = (n) => (hands ? Math.round((int(n) / hands) * 1000) / 10 : null);
  return {
    sessions: int(r.sessions),
    hands,
    handsWon: int(r.hands_won),
    winRate: pct(r.hands_won),
    net: int(r.net),
    biggestPot: int(r.biggest_pot),
    vpip: pct(r.vpip_hands),
    showdowns: int(r.showdowns),
    showdownsWon: int(r.showdowns_won),
    time: { totalSeconds: int(r.total_seconds), lastPlayedAt: r.last_played_at ?? null },
  };
}

/** { overall, thirteen, muushig, poker } for one signed-in player. */
export async function playerStats(playerId) {
  const [entries, poker] = await Promise.all([
    Promise.all(Object.entries(VIEWS).map(async ([name, gameType]) => [name, await statsFor(playerId, gameType)])),
    pokerStatsFor(playerId),
  ]);
  return { ...Object.fromEntries(entries), poker };
}
