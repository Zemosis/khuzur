// MATCHES — one finished match, for its page (/match/:id in the browser):
// every seat's standing, and each round's results and key plays.
//
// A public table's match opens for anyone with the link; a private table's
// only for a signed-in player who sat in it. Everything else (no such match,
// private and not yours, abandoned, solo) is a plain 404, so nobody can tell
// a private match from a missing one. Only display names go out: never a
// user id, player key or email.
//
// A poker table is different (pokerTable): it has no end or places, players
// come and go, and the page is your own time there, your hole cards
// included. So it opens only for a signed-in player who sat at it.
//
// CPUs have no player row. Their names come from the seats recorded at the
// start (game_sessions.seats); for matches recorded before that, a seat is
// known only by its round results, and its place is worked out from the final
// round the way the game ranks seats.

import express from "express";
import { pool } from "./db/index.js";
import { optionalUser, requireDb } from "./auth.js";
import { rankSeats } from "./persistence.js";
import { muushigPlaces } from "./game/muushigStats.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const int = (v) => (v == null ? null : Number(v));

/** A stored seat result, in the page's words. */
const result = (r) => ({
  seat: r.seat_index,
  points: r.points_gained ?? null,
  scoreAfter: r.score_after ?? null,
  cardsLeft: r.cards_left ?? null,
  eaten: r.eaten ?? null,
  folded: r.folded ?? null,
  eliminated: !!r.eliminated,
});

/** Every seat's place from the final round, the way the game ranks them ({ seat: place }). */
function placesFromLastRound(gameType, last, seatCount) {
  const at = (seat) => last.find((r) => r.seat === seat);
  if (gameType === "muushig") {
    return muushigPlaces({
      players: Array.from({ length: seatCount }, (_, seat) => ({ score: at(seat)?.scoreAfter ?? 0 })),
      roundResults: { results: last.map((r) => ({ seat: r.seat, eaten: r.eaten ?? 0 })) },
    });
  }
  return rankSeats({
    players: Array.from({ length: seatCount }, (_, seat) => ({
      score: at(seat)?.scoreAfter ?? 0,
      isEliminated: !!at(seat)?.eliminated,
    })),
  });
}

/** Rounds a seat won: went out first (Thirteen), or ate the most piles (Muushig). */
function roundsWonBy(gameType, rounds, seat) {
  return rounds.filter((r) => {
    if (gameType !== "muushig") return r.winnerSeat === seat;
    const mine = r.results.find((x) => x.seat === seat);
    const most = Math.max(...r.results.map((x) => x.eaten ?? 0));
    return mine && !mine.folded && mine.eaten > 0 && mine.eaten === most;
  }).length;
}

/** A credit match's stakes and who was paid: { tier, stake, pot, cpuTake, nets: { seat: net } }, or null. */
async function creditMatchOf(sessionId) {
  const {
    rows: [h],
  } = await pool.query("select tier, seats, cpu_take from credit_hands where session_id = $1 and game_type <> 'poker' limit 1", [sessionId]);
  if (!h) return null;
  const staked = h.seats.filter((x) => x.user_id);
  const stake = staked[0]?.stack_before ?? 0;
  return {
    tier: h.tier,
    stake,
    pot: stake * staked.length,
    cpuTake: Number(h.cpu_take),
    nets: Object.fromEntries(staked.map((x) => [x.seat, x.net])),
  };
}

/** The match page's data, or null when this viewer may not see it. */
export async function matchDetail(id, viewerId = null) {
  if (!UUID.test(id)) return null;
  const {
    rows: [s],
  } = await pool.query(
    `select id, game_type, status, solo, is_private, started_at, finished_at, round_count, seats, name, credit_tier
       from game_sessions where id = $1`,
    [id],
  );
  if (!s || s.status !== "finished" || s.solo) return null;
  if (s.game_type === "poker") return pokerTable(s, viewerId);

  const { rows: players } = await pool.query(
    `select gp.seat_index, gp.player_id, gp.guest_name, gp.guest_tag, gp.final_score, gp.final_position,
            gp.left_early, gp.cpu_took_over, gp.rounds_won, gp.stats,
            p.username, p.tag, p.level as xp_level
       from game_players gp
       left join profiles p on p.id = gp.player_id
      where gp.session_id = $1
      order by gp.seat_index, gp.joined_at`,
    [id],
  );
  const mine = viewerId ? players.filter((p) => p.player_id === viewerId).at(-1) : null;
  if (s.is_private && !mine) return null;

  const { rows: roundRows } = await pool.query(
    `select round_number, winner_seat, seat_results, highlights
       from game_rounds where session_id = $1 order by round_number`,
    [id],
  );
  const rounds = roundRows.map((r) => ({
    number: r.round_number,
    winnerSeat: r.winner_seat,
    results: r.seat_results.map(result),
    highlights: r.highlights,
  }));

  const seatCount = Math.max(
    s.seats?.length ?? 0,
    ...players.map((p) => p.seat_index + 1),
    ...rounds.flatMap((r) => r.results.map((x) => x.seat + 1)),
  );
  const last = rounds.at(-1)?.results ?? [];
  const places = placesFromLastRound(s.game_type, last, seatCount);
  const seatInfo = (seat) => s.seats?.find((x) => x.seat === seat) ?? null;

  const standings = players.map((p) => ({
    seat: p.seat_index,
    name: p.username ? `${p.username} #${p.tag}` : p.guest_name ? `${p.guest_name} #${p.guest_tag}` : seatInfo(p.seat_index)?.name ?? null,
    kind: "human",
    level: null,
    xpLevel: p.player_id ? p.xp_level : null, // their level now, not when they played
    place: p.final_position,
    score: p.final_score,
    roundsWon: p.rounds_won,
    leftEarly: p.left_early,
    cpuTookOver: p.cpu_took_over,
    stats: p.stats,
  }));
  // Seats a CPU finished in: one that sat there from the start, or took over
  // from a player who left.
  for (let seat = 0; seat < seatCount; seat++) {
    const here = players.filter((p) => p.seat_index === seat);
    const info = seatInfo(seat);
    if (here.some((p) => !p.left_early)) continue;
    if (here.length ? !here.some((p) => p.cpu_took_over) : info?.kind === "human") continue;
    standings.push({
      seat,
      name: info?.kind === "cpu" ? info.name : null,
      kind: "cpu",
      level: info?.kind === "cpu" ? info.level : null,
      xpLevel: null,
      place: int(places[seat]),
      score: last.find((r) => r.seat === seat)?.scoreAfter ?? null,
      roundsWon: roundsWonBy(s.game_type, rounds, seat),
      leftEarly: false,
      cpuTookOver: false,
      stats: null,
    });
  }
  standings.sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || a.seat - b.seat);

  return {
    id: s.id,
    gameType: s.game_type,
    credit: await creditMatchOf(s.id),
    startedAt: s.started_at,
    finishedAt: s.finished_at,
    durationSeconds: s.started_at && s.finished_at ? Math.round((s.finished_at - s.started_at) / 1000) : null,
    roundCount: s.round_count,
    isPrivate: s.is_private,
    you: mine ? mine.seat_index : null,
    standings,
    rounds,
  };
}

const playerName = (p) => (p.username ? `${p.username} #${p.tag}` : p.guest_name ? `${p.guest_name} #${p.guest_tag}` : null);
const secondsAt = (p, s) => {
  const from = p.joined_at ?? s.started_at;
  const to = p.left_at ?? s.finished_at;
  return from && to ? Math.max(0, Math.round((to - from) / 1000)) : null;
};

/**
 * A poker table's page for a player who sat at it: their tally and hand log
 * (hole cards, board, result, who won with what — kept since tables logged
 * hands; null before), and everyone's chips won or lost. CPUs have no player
 * row: they're counted from the hands, when those name their seats.
 */
async function pokerTable(s, viewerId) {
  if (!viewerId) return null;
  const { rows: players } = await pool.query(
    `select gp.player_id, gp.guest_name, gp.guest_tag, gp.final_score, gp.joined_at, gp.left_at, gp.stats, p.username, p.tag,
            p.level as xp_level
       from game_players gp
       left join profiles p on p.id = gp.player_id
      where gp.session_id = $1`,
    [s.id],
  );
  const mine = players.find((p) => p.player_id === viewerId);
  if (!mine) return null;
  const { rows: hands } = await pool.query("select seat_results from game_rounds where session_id = $1", [s.id]);

  const table = players.map((p) => ({
    name: playerName(p),
    kind: "human",
    xpLevel: p.player_id ? p.xp_level : null,
    net: int(p.final_score) ?? 0,
    hands: int(p.stats?.hands_played) ?? 0,
    you: p === mine,
  }));
  const cpus = new Map();
  for (const r of hands.flatMap((h) => h.seat_results)) {
    if (!r.cpu || !r.name) continue;
    const cpu = cpus.get(r.name) ?? { name: r.name, kind: "cpu", xpLevel: null, net: 0, hands: 0, you: false };
    cpu.net += r.net ?? 0;
    cpu.hands += 1;
    cpus.set(r.name, cpu);
  }
  table.push(...cpus.values());
  table.sort((a, b) => b.net - a.net || b.hands - a.hands);

  const t = mine.stats ?? {};
  return {
    id: s.id,
    gameType: "poker",
    table: s.name,
    tier: s.credit_tier,
    isPrivate: s.is_private,
    startedAt: s.started_at,
    finishedAt: s.finished_at,
    durationSeconds: s.started_at && s.finished_at ? Math.round((s.finished_at - s.started_at) / 1000) : null,
    handCount: s.round_count,
    you: {
      name: playerName(mine),
      net: int(mine.final_score) ?? 0,
      seconds: secondsAt(mine, s),
      handsPlayed: int(t.hands_played) ?? 0,
      handsWon: int(t.hands_won) ?? 0,
      biggestPot: int(t.biggest_pot) ?? 0,
      vpipHands: int(t.vpip_hands) ?? 0,
      showdowns: int(t.showdowns) ?? 0,
      showdownsWon: int(t.showdowns_won) ?? 0,
      showdownRanks: t.showdown_ranks ?? {},
      hands: Array.isArray(t.hands) ? t.hands : null,
    },
    players: table,
  };
}

export function matchesRouter() {
  const router = express.Router();
  router.get("/:id", requireDb, optionalUser, async (req, res) => {
    try {
      const match = await matchDetail(req.params.id, req.user?.id ?? null);
      if (!match) return res.status(404).json({ error: "Match not found" });
      res.json(match);
    } catch (err) {
      console.error("[matches] detail failed:", err);
      res.status(500).json({ error: "Could not load the match" });
    }
  });
  return router;
}
