// PLAYER STATS — everything the profile's Stats panel shows, for each game
// filter (overall, Thirteen, Muushig, Poker) in one response so switching is
// instant. Poker has no places, so it has its own figures (pokerStatsFor, as
// { free, credits }) and stays out of wins, places and streaks. Overall does
// count its tables where that makes sense: recent play, time played, credits
// won or lost, and a poker summary (withPoker).
// Every figure is computed from the recorded matches (player_match_history),
// online and solo alike, so it can never disagree with history. The other
// games' figures come for one stakes at a time (all, free or credits; see
// STAKE_VIEWS). There is no rating: credits are the ranked play.

import { pool } from "./db/index.js";

const VIEWS = { overall: null, thirteen: "thirteen", muushig: "muushig" };
// Which matches count: every one, free ones (practice included), or credit matches.
export const STAKE_VIEWS = ["all", "free", "credits"];
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

async function statsFor(playerId, gameType, stakes) {
  const where = "player_id = $1 and ($2::game_type is null or game_type = $2) and ($3::text = 'all' or (credit_tier is not null) = ($3::text = 'credits'))";
  const args = [playerId, gameType, stakes];

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
         max(finished_at)                                          as last_played_at,
         count(*) filter (where credit_tier is not null)           as credit_games,
         coalesce(sum(credit_net), 0)                              as credit_net,
         count(*) filter (where credit_won > 0)                    as pots_won,
         coalesce(max(credit_won), 0)                              as biggest_pot
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
              left_early, solo, duration_seconds, finished_at, credit_tier, credit_net
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
    // Credit matches among these: what they came to.
    credits: { games: int(s.credit_games), net: int(s.credit_net), potsWon: int(s.pots_won), biggestPot: int(s.biggest_pot) },
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
      tier: r.credit_tier,
      net: r.credit_net == null ? null : int(r.credit_net),
    })),
  };
  if (extras) view.extras = Object.fromEntries(extras.rows.map((r) => [r.key, Number(r.total)]));
  if (hands) view.hands = Object.fromEntries(hands.rows.map((r) => [r.key, int(r.total)]));
  return view;
}

const pokerFigures = (r = {}) => {
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
};

const STAKES = "case when gs.credit_tier is null then 'free' else 'credits' end";

/**
 * Poker figures from player_poker_stats, free and credit play apart: zeros
 * for someone who hasn't played. Each also lists the latest tables played
 * (each opens its table page) and, from the hands logged since tables kept
 * them, how often each hand rank was shown and won at a showdown.
 */
async function pokerStatsFor(playerId) {
  const [figures, tables, ranks] = await Promise.all([
    pool.query("select * from player_poker_stats where player_id = $1", [playerId]),
    pool.query(
      `select gs.id, ${STAKES} as stakes, gs.credit_tier, gs.name as table_name, gs.finished_at, gp.final_score,
              coalesce((gp.stats ->> 'hands_played')::int, 0) as hands,
              extract(epoch from (coalesce(gp.left_at, gs.finished_at) - coalesce(gp.joined_at, gs.started_at)))::integer as seconds
         from game_players gp
         join game_sessions gs on gs.id = gp.session_id
        where gs.game_type = 'poker' and gs.status = 'finished' and gp.player_id = $1
          and coalesce((gp.stats ->> 'hands_played')::int, 0) > 0
        order by gs.finished_at desc
        limit $2`,
      [playerId, RECENT * 2],
    ),
    pool.query(
      `select ${STAKES} as stakes, r.key as rank, sum((r.value ->> 'shown')::int) as shown, sum((r.value ->> 'won')::int) as won
         from game_players gp
         join game_sessions gs on gs.id = gp.session_id
         cross join lateral jsonb_each(coalesce(gp.stats -> 'showdown_ranks', '{}'::jsonb)) r
        where gs.game_type = 'poker' and gs.status = 'finished' and gp.player_id = $1
        group by 1, 2`,
      [playerId],
    ),
  ]);
  const forStakes = (stakes) => ({
    ...pokerFigures(figures.rows.find((r) => r.stakes === stakes)),
    recent: tables.rows
      .filter((r) => r.stakes === stakes)
      .slice(0, RECENT)
      .map((r) => ({ id: r.id, tier: r.credit_tier, table: r.table_name, net: int(r.final_score), hands: int(r.hands), seconds: int(r.seconds), finishedAt: r.finished_at })),
    showdownRanks: Object.fromEntries(ranks.rows.filter((r) => r.stakes === stakes).map((r) => [r.rank, { shown: int(r.shown), won: int(r.won) }])),
  });
  return { free: forStakes("free"), credits: forStakes("credits") };
}

/**
 * Overall, with the poker tables (for `stakes`) folded in where they belong:
 * among the recent matches (newest first), in time played, in the credit
 * figures, and as a summary of its own. Wins, places and streaks stay as they are.
 */
async function withPoker(playerId, stakes, overall) {
  const where = `gs.game_type = 'poker' and gs.status = 'finished' and gp.player_id = $1
     and coalesce((gp.stats ->> 'hands_played')::int, 0) > 0
     and ($2::text = 'all' or (gs.credit_tier is not null) = ($2::text = 'credits'))`;
  const seconds = "extract(epoch from (coalesce(gp.left_at, gs.finished_at) - coalesce(gp.joined_at, gs.started_at)))::integer";
  const [summary, recent] = await Promise.all([
    pool.query(
      `select count(*) as tables,
              coalesce(sum((gp.stats ->> 'hands_played')::int), 0) as hands,
              coalesce(sum(gp.final_score), 0) as net,
              coalesce(sum(${seconds}), 0) as seconds,
              max(gs.finished_at) as last_played_at,
              count(*) filter (where gs.credit_tier is not null) as credit_tables,
              coalesce(sum(gp.final_score) filter (where gs.credit_tier is not null), 0) as credit_net,
              coalesce(sum((gp.stats ->> 'hands_won')::int) filter (where gs.credit_tier is not null), 0) as credit_pots,
              coalesce(max((gp.stats ->> 'biggest_pot')::int) filter (where gs.credit_tier is not null), 0) as credit_biggest
         from game_players gp join game_sessions gs on gs.id = gp.session_id
        where ${where}`,
      [playerId, stakes],
    ),
    pool.query(
      `select gs.id, gs.credit_tier, gs.finished_at, gp.final_score, coalesce((gp.stats ->> 'hands_played')::int, 0) as hands, ${seconds} as seconds
         from game_players gp join game_sessions gs on gs.id = gp.session_id
        where ${where}
        order by gs.finished_at desc limit ${RECENT}`,
      [playerId, stakes],
    ),
  ]);
  const p = summary.rows[0];
  const last = [overall.time.lastPlayedAt, p.last_played_at].filter(Boolean).sort((a, b) => b - a)[0] ?? null;
  const tables = recent.rows.map((r) => ({
    id: r.id,
    game: "poker",
    place: null,
    of: null,
    won: false,
    leftEarly: false,
    solo: false,
    score: null,
    hands: int(r.hands),
    seconds: int(r.seconds),
    finishedAt: r.finished_at,
    tier: r.credit_tier,
    net: int(r.final_score), // chips at a free table, credits at a credit one
  }));
  return {
    ...overall,
    time: { ...overall.time, totalSeconds: overall.time.totalSeconds + int(p.seconds), lastPlayedAt: last },
    credits: {
      games: overall.credits.games + int(p.credit_tables),
      net: overall.credits.net + int(p.credit_net),
      potsWon: overall.credits.potsWon + int(p.credit_pots),
      biggestPot: Math.max(overall.credits.biggestPot, int(p.credit_biggest)),
    },
    poker: { tables: int(p.tables), hands: int(p.hands), net: int(p.net), seconds: int(p.seconds) },
    recent: [...overall.recent, ...tables].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)).slice(0, RECENT),
  };
}

const blackjackFigures = (r = {}) => {
  const rounds = int(r.rounds_played);
  return {
    tables: int(r.tables),
    rounds,
    roundsWon: int(r.rounds_won),
    winRate: rounds ? Math.round((int(r.rounds_won) / rounds) * 1000) / 10 : null,
    blackjacks: int(r.blackjacks),
    biggestWin: int(r.biggest_win),
    net: int(r.net),
    time: { totalSeconds: int(r.total_seconds), lastPlayedAt: r.last_played_at ?? null },
  };
};

const BJ_SECONDS = "extract(epoch from (coalesce(gp.left_at, gs.finished_at) - coalesce(gp.joined_at, gs.started_at)))::integer";
const BJ_PLAYED = "gs.game_type = 'blackjack' and gs.status = 'finished' and gp.player_id = $1 and coalesce((gp.stats ->> 'rounds_played')::int, 0) > 0";

/**
 * Blackjack figures from player_blackjack_stats, free and credit play apart:
 * zeros for someone who hasn't played. Each also lists the latest tables
 * played (each opens its table page).
 */
async function blackjackStatsFor(playerId) {
  const [figures, tables] = await Promise.all([
    pool.query("select * from player_blackjack_stats where player_id = $1", [playerId]),
    pool.query(
      `select gs.id, ${STAKES} as stakes, gs.credit_tier, gs.name as table_name, gs.finished_at, gp.final_score,
              coalesce((gp.stats ->> 'rounds_played')::int, 0) as rounds, ${BJ_SECONDS} as seconds
         from game_players gp
         join game_sessions gs on gs.id = gp.session_id
        where ${BJ_PLAYED}
        order by gs.finished_at desc
        limit $2`,
      [playerId, RECENT * 2],
    ),
  ]);
  const forStakes = (stakes) => ({
    ...blackjackFigures(figures.rows.find((r) => r.stakes === stakes)),
    recent: tables.rows
      .filter((r) => r.stakes === stakes)
      .slice(0, RECENT)
      .map((r) => ({ id: r.id, tier: r.credit_tier, table: r.table_name, net: int(r.final_score), rounds: int(r.rounds), seconds: int(r.seconds), finishedAt: r.finished_at })),
  });
  return { free: forStakes("free"), credits: forStakes("credits") };
}

/**
 * Overall, with the blackjack tables (for `stakes`) folded in, as withPoker
 * does: recent matches, time played, the credit figures and a summary of its
 * own. Wins, places and streaks stay as they are.
 */
async function withBlackjack(playerId, stakes, overall) {
  const where = `${BJ_PLAYED} and ($2::text = 'all' or (gs.credit_tier is not null) = ($2::text = 'credits'))`;
  const [summary, recent] = await Promise.all([
    pool.query(
      `select count(*) as tables,
              coalesce(sum((gp.stats ->> 'rounds_played')::int), 0) as rounds,
              coalesce(sum(gp.final_score), 0) as net,
              coalesce(sum(${BJ_SECONDS}), 0) as seconds,
              max(gs.finished_at) as last_played_at,
              count(*) filter (where gs.credit_tier is not null) as credit_tables,
              coalesce(sum(gp.final_score) filter (where gs.credit_tier is not null), 0) as credit_net,
              coalesce(sum((gp.stats ->> 'rounds_won')::int) filter (where gs.credit_tier is not null), 0) as credit_rounds_won,
              coalesce(max((gp.stats ->> 'biggest_win')::bigint) filter (where gs.credit_tier is not null), 0) as credit_biggest
         from game_players gp join game_sessions gs on gs.id = gp.session_id
        where ${where}`,
      [playerId, stakes],
    ),
    pool.query(
      `select gs.id, gs.credit_tier, gs.finished_at, gp.final_score, coalesce((gp.stats ->> 'rounds_played')::int, 0) as rounds, ${BJ_SECONDS} as seconds
         from game_players gp join game_sessions gs on gs.id = gp.session_id
        where ${where}
        order by gs.finished_at desc limit ${RECENT}`,
      [playerId, stakes],
    ),
  ]);
  const b = summary.rows[0];
  const last = [overall.time.lastPlayedAt, b.last_played_at].filter(Boolean).sort((x, y) => y - x)[0] ?? null;
  const tables = recent.rows.map((r) => ({
    id: r.id,
    game: "blackjack",
    place: null,
    of: null,
    won: false,
    leftEarly: false,
    solo: false,
    score: null,
    rounds: int(r.rounds),
    seconds: int(r.seconds),
    finishedAt: r.finished_at,
    tier: r.credit_tier,
    net: int(r.final_score), // chips at a free table, credits at a credit one
  }));
  return {
    ...overall,
    time: { ...overall.time, totalSeconds: overall.time.totalSeconds + int(b.seconds), lastPlayedAt: last },
    credits: {
      games: overall.credits.games + int(b.credit_tables),
      net: overall.credits.net + int(b.credit_net),
      potsWon: overall.credits.potsWon + int(b.credit_rounds_won),
      biggestPot: Math.max(overall.credits.biggestPot, int(b.credit_biggest)),
    },
    blackjack: { tables: int(b.tables), rounds: int(b.rounds), net: int(b.net), seconds: int(b.seconds) },
    recent: [...overall.recent, ...tables].sort((x, y) => new Date(y.finishedAt) - new Date(x.finishedAt)).slice(0, RECENT),
  };
}

/** { stakes, overall, thirteen, muushig, poker, blackjack } for one signed-in player; all but poker for `stakes` only. */
export async function playerStats(playerId, stakes = "all") {
  if (!STAKE_VIEWS.includes(stakes)) stakes = "all";
  const [entries, poker, blackjack] = await Promise.all([
    Promise.all(Object.entries(VIEWS).map(async ([name, gameType]) => [name, await statsFor(playerId, gameType, stakes)])),
    pokerStatsFor(playerId),
    blackjackStatsFor(playerId),
  ]);
  const views = Object.fromEntries(entries);
  views.overall = await withBlackjack(playerId, stakes, await withPoker(playerId, stakes, views.overall));
  return { stakes, ...views, poker, blackjack };
}
