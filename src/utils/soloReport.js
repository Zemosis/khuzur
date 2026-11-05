// SOLO REPORTS — a finished game against CPUs, summed up for the server
// (POST /api/auth/matches, checked by server/solo.js). Every seat's final
// score goes along so the server can place you itself; the tallies are yours.

import { GAME_SETTINGS } from "./constants";

/**
 * Thirteen: your round results come from the ROUND_END records (scores after
 * each round), your hands from your PLAYs. Points are cards left, doubled from
 * PENALTY_THRESHOLD cards up, so cards left = points, or points / 2.
 */
export function thirteenSoloReport(state, { matchId, startedAt, finishedAt, me = 0 }) {
  const hands = {};
  let roundsPlayed = 0;
  let roundsWon = 0;
  let cardsLeft = 0;
  let prev = { score: 0, eliminated: false };

  for (const move of state.moveHistory || []) {
    if (move.type === "PLAY" && move.playerIndex === me && move.combination?.type) {
      hands[move.combination.type] = (hands[move.combination.type] || 0) + 1;
    }
    if (move.type !== "ROUND_END") continue;
    const mine = move.scores?.find((s) => s.id === me);
    if (!mine || prev.eliminated) continue;
    roundsPlayed += 1;
    if (move.winnerIndex === me) roundsWon += 1;
    else {
      const points = mine.score - prev.score;
      cardsLeft += points >= GAME_SETTINGS.PENALTY_THRESHOLD * 2 ? points / 2 : points;
    }
    prev = { score: mine.score, eliminated: mine.eliminated };
  }

  return {
    matchId,
    gameType: "thirteen",
    startedAt,
    finishedAt,
    me,
    rounds: state.roundNumber,
    players: state.players.map((p) => ({ score: p.score, eliminated: !!p.isEliminated })),
    stats: { rounds_played: roundsPlayed, rounds_won: roundsWon, cards_left_total: cardsLeft, hands },
  };
}

/**
 * Muushig: everything comes from the match's roundEnd events. A round counts
 * as won when you ate the most piles (ties included); a sweep is all five.
 */
export function muushigSoloReport(game, { matchId, startedAt, finishedAt, me = 0 }) {
  const ends = (game.events || []).filter((e) => e.type === "roundEnd");
  const stats = { rounds_played: 0, rounds_won: 0, eaten: 0, gone_in: 0, folded: 0, sweeps: 0 };
  for (const end of ends) {
    const mine = end.results.find((r) => r.seat === me);
    if (!mine) continue;
    stats.rounds_played += 1;
    if (mine.folded) {
      stats.folded += 1;
      continue;
    }
    stats.gone_in += 1;
    stats.eaten += mine.eaten;
    if (end.roundWinner === me) stats.sweeps += 1;
    const most = Math.max(...end.results.map((r) => r.eaten));
    if (mine.eaten > 0 && mine.eaten === most) stats.rounds_won += 1;
  }
  const last = ends.at(-1)?.results || [];

  return {
    matchId,
    gameType: "muushig",
    startedAt,
    finishedAt,
    me,
    rounds: game.roundNumber,
    players: game.players.map((p, seat) => ({ score: p.score, lastEaten: last.find((r) => r.seat === seat)?.eaten ?? 0 })),
    stats,
  };
}

/**
 * Khuzur: the match is one round. Your place is your team's; leads, beats and
 * pick-ups come from the event log, counted as server/game/khuzurStats.js does.
 */
export function khuzurSoloReport(game, { matchId, startedAt, finishedAt, me = 0 }) {
  const stats = { leads: 0, beats: 0, pickups: 0, picked_up: 0, rounds_played: 1, rounds_won: 0 };
  for (const e of game.events || []) {
    if (e.seat !== me) continue;
    if (e.type === "lead") stats.leads += 1;
    else if (e.type === "beat") stats.beats += 1;
    else if (e.type === "pickUp") {
      stats.pickups += 1;
      stats.picked_up += e.count;
    }
  }
  if (game.places[game.players[me].team] === 1) stats.rounds_won = 1;
  return {
    matchId,
    gameType: "khuzur",
    startedAt,
    finishedAt,
    me,
    rounds: 1,
    table: game.table,
    players: game.players.map((p) => ({ place: game.places[p.team] })),
    stats,
  };
}
