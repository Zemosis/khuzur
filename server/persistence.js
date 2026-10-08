// PERSISTENCE — match recording.
// The realtime game itself never touches the database (see docs/ARCHITECTURE.md);
// Postgres is only used to record matches and award progression.
//
// A session row is written when the match STARTS and updated when it ends, so
// abandoned matches leave a trace instead of vanishing. Player rows come from
// the lobby's roster (every seat that was ever occupied) rather than from the
// live member map, which drops players the moment they quit.

import { pool, withTransaction } from "./db/index.js";
import { rankSolo } from "./solo.js";
import { muushigPlaces, muushigSeatStats } from "./game/muushigStats.js";

// Rewards by final position (1st..4th). Level-ups come from exp: 100 exp/level.
const REWARDS = [
  { coins: 100, exp: 60 },
  { coins: 50, exp: 35 },
  { coins: 25, exp: 20 },
  { coins: 10, exp: 10 },
];

const levelForExp = (exp) => Math.floor(exp / 100) + 1;

// Elo. Pairwise across the rated field, averaged — the standard extension of
// two-player Elo to a placement result. Only signed-in players are rated, so
// you cannot farm rating off CPUs or guests; with fewer than two, nobody moves.
const K_FACTOR = 32;
export const DEFAULT_RATING = 1000;

export function computeRatingDeltas(entries) {
  const deltas = new Map();
  if (entries.length < 2) return deltas;

  for (const a of entries) {
    let sum = 0;
    for (const b of entries) {
      if (a.playerKey === b.playerKey) continue;
      const expected = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
      const actual = a.position < b.position ? 1 : a.position > b.position ? 0 : 0.5;
      sum += actual - expected;
    }
    deltas.set(a.playerKey, Math.round((K_FACTOR * sum) / (entries.length - 1)));
  }
  return deltas;
}

/**
 * Inserts the session row at match start. Returns the new session id, or null
 * if persistence is unconfigured (in which case the match still runs fine).
 */
export async function createSession({
  gameType = "thirteen",
  lobbyId,
  lobbyName,
  isPrivate,
  hostUserId,
  hostDisplayName,
  maxPlayers = 4,
  playerCount = 0,
  startedAt,
}) {
  if (!pool) return null;

  const { rows } = await pool.query(
    `insert into game_sessions (
       game_type, status, host_id, host_display_name, name, is_private,
       lobby_code, max_players, current_player_count, started_at
     ) values ($1, 'in_progress', $2, $3, $4, $5, $6, $7, $8, $9)
     returning id`,
    [
      gameType,
      hostUserId,
      hostDisplayName,
      lobbyName,
      !!isPrivate,
      lobbyId,
      maxPlayers,
      playerCount,
      startedAt || new Date(),
    ],
  );
  return rows[0].id;
}

/**
 * Closes sessions orphaned by a server restart. Game state lives in RAM, so a
 * session still 'in_progress' at boot can never finish. Assumes one game
 * server per database — revisit when running several instances.
 */
export async function closeOrphanedSessions() {
  if (!pool) return;
  const { rowCount } = await pool.query(
    `update game_sessions
        set status = 'abandoned', ended_reason = 'abandoned',
            finished_at = greatest(now(), started_at)
      where status = 'in_progress'`,
  );
  if (rowCount) console.log(`[db] closed ${rowCount} session(s) orphaned by a restart`);
}

/** Ranks seats: not-eliminated first, then by score ascending (lower is better). */
function rankSeats(state) {
  const positionBySeat = {};
  state.players
    .map((p, i) => ({ i, p }))
    .sort((a, b) => {
      if (a.p.isEliminated !== b.p.isEliminated) return a.p.isEliminated ? 1 : -1;
      return a.p.score - b.p.score;
    })
    .forEach((entry, rank) => {
      positionBySeat[entry.i] = rank + 1;
    });
  return positionBySeat;
}

/**
 * Closes out a session: updates the session row, writes one game_players row
 * per roster entry, and applies rewards + rating to signed-in players.
 *
 * Rewards and rating are applied ONLY when the match actually finished. An
 * abandoned match records what happened but produces no result.
 *
 * @param {Object} rec
 * @param {String}  rec.sessionId
 * @param {String}  rec.gameType    - 'thirteen' (default) | 'muushig' | 'poker'
 * @param {Boolean} rec.completed   - true if the match played to game over
 * @param {String}  rec.endedReason - 'completed' | 'abandoned' | 'all_left'
 * @param {Date}    rec.finishedAt
 * @param {Array}   rec.roster - every seat ever occupied: { playerKey, userId,
 *                  name, tag, seatIndex, joinedAt, leftAt, leftEarly,
 *                  cpuTookOver, disconnectCount, poker? }  (poker: the
 *                  player's tally of hands, see recordHand in index.js)
 * @param {Array}   rec.rounds - per-round summaries from the engine
 * @param {Object}  rec.state - final game state
 */
export async function finishSession(rec) {
  if (!pool || !rec.sessionId) return;

  const { state, roster, completed } = rec;
  const muushig = rec.gameType === "muushig";
  // A poker table has no places: each player's result is the chips they won or lost.
  const poker = rec.gameType === "poker";
  const finishedAt = rec.finishedAt || new Date();
  const positionBySeat = completed && state && !poker ? (muushig ? muushigPlaces(state) : rankSeats(state)) : {};
  const rounds = rec.rounds || [];

  /** How many of each hand type a seat played this match (the profile's hand tally). */
  function handsFor(seatIndex) {
    const hands = {};
    for (const move of state?.moveHistory || []) {
      if (move.type !== "PLAY" || move.playerIndex !== seatIndex || !move.combination?.type) continue;
      hands[move.combination.type] = (hands[move.combination.type] || 0) + 1;
    }
    return hands;
  }

  /** Per-seat round aggregates, derived from the round summaries. */
  function roundStatsFor(seatIndex) {
    if (muushig) {
      // Muushig tallies piles and rounds sat out, read from the event log.
      const stats = muushigSeatStats(state?.events || [], seatIndex);
      return { roundsWon: stats.rounds_won, stats: stats.rounds_played ? stats : null };
    }
    let roundsWon = 0;
    let roundsPlayed = 0;
    let cardsLeftTotal = 0;
    let bestRoundCardsLeft = null;
    let eliminatedAtRound = null;

    for (const round of rounds) {
      const seat = round.seatResults.find((x) => x.seat_index === seatIndex);
      if (!seat) continue;
      roundsPlayed += 1;
      if (round.winnerSeat === seatIndex) roundsWon += 1;
      cardsLeftTotal += seat.cards_left;
      if (bestRoundCardsLeft === null || seat.cards_left < bestRoundCardsLeft) {
        bestRoundCardsLeft = seat.cards_left;
      }
      if (seat.eliminated && eliminatedAtRound === null) {
        eliminatedAtRound = round.roundNumber;
      }
    }

    return {
      roundsWon,
      stats: rounds.length
        ? {
            rounds_played: roundsPlayed,
            rounds_won: roundsWon,
            cards_left_total: cardsLeftTotal,
            best_round_cards_left: bestRoundCardsLeft,
            eliminated_at_round: eliminatedAtRound,
            hands: handsFor(seatIndex),
          }
        : null,
    };
  }

  // One transaction for the whole result: a match is recorded entirely or not
  // at all, and the profile rows are locked so two matches finishing at once
  // cannot lose each other's coins.
  const playerRows = await withTransaction(async (client) => {
    await client.query(
      `update game_sessions
          set status = $2, ended_reason = $3, round_count = $4,
              current_player_count = $5, finished_at = $6
        where id = $1`,
      [
        rec.sessionId,
        completed ? "finished" : "abandoned",
        rec.endedReason || (completed ? "completed" : "abandoned"),
        state?.roundNumber ?? state?.handNumber ?? null,
        roster.length,
        finishedAt,
      ],
    );

    // Round-level history. Written before the player rows so rounds_won and
    // the stats blob can be derived from the same source.
    for (const r of rounds) {
      await client.query(
        `insert into game_rounds (session_id, round_number, winner_seat, seat_results)
         values ($1, $2, $3, $4)
         on conflict (session_id, round_number) do update
           set winner_seat = excluded.winner_seat, seat_results = excluded.seat_results`,
        [rec.sessionId, r.roundNumber, r.winnerSeat, JSON.stringify(r.seatResults)],
      );
    }

    // Current ratings for the signed-in players, locked until commit.
    const userIds = roster.map((r) => r.userId).filter(Boolean);
    const profiles = new Map();
    if (userIds.length) {
      const { rows } = await client.query(
        `select id, coins, exp, wins, games_played, rating
           from profiles where id = any($1::uuid[]) for update`,
        [userIds],
      );
      for (const p of rows) profiles.set(p.id, p);
    }

    // Rating only moves on a completed match, and only among signed-in players.
    const ratingDeltas = completed
      ? computeRatingDeltas(
          roster
            .filter((r) => r.userId && positionBySeat[r.seatIndex])
            .map((r) => ({
              playerKey: r.playerKey,
              rating: profiles.get(r.userId)?.rating ?? DEFAULT_RATING,
              position: positionBySeat[r.seatIndex],
            })),
        )
      : new Map();

    const rows = roster.map((seat) => {
      const position = completed ? positionBySeat[seat.seatIndex] ?? null : null;
      const reward = completed && position ? REWARDS[position - 1] || REWARDS.at(-1) : null;
      const profile = seat.userId ? profiles.get(seat.userId) : null;
      const before = profile?.rating ?? (seat.userId ? DEFAULT_RATING : null);
      const delta = ratingDeltas.get(seat.playerKey);
      const roundStats = poker ? { roundsWon: seat.poker?.hands_won ?? 0, stats: seat.poker ?? null } : roundStatsFor(seat.seatIndex);

      return {
        player_key: seat.playerKey,
        player_id: seat.userId || null,
        guest_name: seat.userId ? null : seat.name,
        guest_tag: seat.userId ? null : seat.tag,
        seat_index: seat.seatIndex,
        final_score: poker ? (seat.poker?.net ?? 0) : (state?.players?.[seat.seatIndex]?.score ?? null),
        final_position: position,
        is_winner: position === 1,
        coins_earned: reward?.coins ?? 0,
        exp_earned: reward?.exp ?? 0,
        joined_at: seat.joinedAt ? new Date(seat.joinedAt) : null,
        left_at: seat.leftAt ? new Date(seat.leftAt) : null,
        left_early: !!seat.leftEarly,
        cpu_took_over: !!seat.cpuTookOver,
        disconnect_count: seat.disconnectCount || 0,
        rating_before: before,
        rating_after: delta == null ? before : before + delta,
        rounds_won: roundStats.roundsWon,
        stats: roundStats.stats ? JSON.stringify(roundStats.stats) : null,
      };
    });
    // Poker chips are free: no coins, exp or games played until credits.

    for (const row of rows) {
      const cols = Object.keys(row);
      await client.query(
        `insert into game_players (session_id, ${cols.join(", ")})
         values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})
         on conflict (session_id, player_key) do update
           set ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}`,
        [rec.sessionId, ...Object.values(row)],
      );
    }

    if (!completed || poker) return rows;

    // Progression for signed-in players.
    for (const row of rows) {
      if (!row.player_id) continue;
      const profile = profiles.get(row.player_id);
      if (!profile) continue;

      const exp = profile.exp + row.exp_earned;
      await client.query(
        `update profiles
            set coins = $2, exp = $3, level = $4, wins = $5, games_played = $6, rating = $7
          where id = $1`,
        [
          row.player_id,
          profile.coins + row.coins_earned,
          exp,
          levelForExp(exp),
          profile.wins + (row.is_winner ? 1 : 0),
          profile.games_played + 1,
          row.rating_after ?? profile.rating,
        ],
      );
    }
    return rows;
  });

  if (!completed) {
    console.log(`[db] session ${rec.sessionId} closed as abandoned`);
    return;
  }

  console.log(
    `[db] recorded match ${rec.sessionId} (${playerRows.length} seats, ` +
      `${rounds.length} rounds, ` +
      `${playerRows.filter((r) => r.left_early).length} left early)`,
  );
}

/**
 * Records a match played alone against CPUs, from a report already checked by
 * parseSoloReport. The server places the player itself. Solo matches count for
 * stats only: no coins, exp or rating. A report already recorded (same player,
 * same match id) is not recorded again.
 *
 * @returns {{ recorded: boolean, place: number }}
 */
export async function recordSoloMatch(userId, report) {
  const place = rankSolo(report.gameType, report.players)[report.me];
  const me = report.players[report.me];

  return withTransaction(async (client) => {
    const {
      rows: [profile],
    } = await client.query("select username, tag from profiles where id = $1", [userId]);
    const {
      rows: [session],
    } = await client.query(
      `insert into game_sessions (
         game_type, status, ended_reason, solo, host_id, host_display_name, name,
         is_private, lobby_code, max_players, current_player_count, round_count,
         started_at, finished_at
       ) values ($1, 'finished', 'completed', true, $2, $3, 'Solo vs CPU', true, $4, $5, 1, $6, $7, $8)
       on conflict (host_id, lobby_code) where solo do nothing
       returning id`,
      [
        report.gameType,
        userId,
        profile ? `${profile.username} #${profile.tag}` : null,
        report.matchId,
        report.players.length,
        report.rounds,
        report.startedAt,
        report.finishedAt,
      ],
    );
    if (!session) return { recorded: false, place };

    await client.query(
      `insert into game_players (
         session_id, player_key, player_id, seat_index, final_score, final_position,
         is_winner, joined_at, left_at, rounds_won, stats
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        session.id,
        userId,
        userId,
        report.me,
        me.score,
        place,
        place === 1,
        report.startedAt,
        report.finishedAt,
        report.stats.rounds_won,
        JSON.stringify(report.stats),
      ],
    );
    return { recorded: true, place };
  });
}
