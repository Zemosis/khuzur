// SOLO REPORTS — games played alone against CPUs run in the browser, so the
// browser reports how they ended. A report is checked before it is recorded,
// and the server works out the placing itself from the final scores. Solo
// matches count for stats only (no coins, exp or rating), so a forged report
// can only inflate the sender's own profile.

const GAMES = {
  thirteen: {
    players: 4,
    stats: ["rounds_played", "rounds_won", "cards_left_total"],
  },
  muushig: {
    players: 5,
    stats: ["rounds_played", "rounds_won", "eaten", "gone_in", "folded", "sweeps"],
  },
};

const HAND_TYPES = new Set([
  "SINGLE",
  "PAIR",
  "TRIPLE",
  "FOUR_OF_A_KIND",
  "STRAIGHT",
  "FLUSH",
  "FULL_HOUSE",
  "POKER",
  "STRAIGHT_FLUSH",
  "ROYAL_FLUSH",
]);

const MATCH_ID_RE = /^[A-Za-z0-9-]{6,40}$/;
const MIN_MATCH_MS = 10_000;
const MAX_MATCH_MS = 6 * 60 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;
const MAX_AGE_MS = 24 * 60 * 60_000;
const MAX_ROUNDS = 300;
const MAX_COUNT = 10_000;

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Checks a solo match report. Returns { ok: true, value } with only the known
 * fields kept, or { ok: false, error } with a reason.
 */
export function parseSoloReport(body) {
  const fail = (error) => ({ ok: false, error });
  if (!isObject(body)) return fail("Not a match report");

  const game = GAMES[body.gameType];
  if (!game) return fail("Unknown game");
  if (typeof body.matchId !== "string" || !MATCH_ID_RE.test(body.matchId)) return fail("Bad match id");

  const started = Date.parse(body.startedAt);
  const finished = Date.parse(body.finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return fail("Bad match times");
  const now = Date.now();
  if (finished > now + CLOCK_SKEW_MS || finished < now - MAX_AGE_MS) return fail("Match finished at an unlikely time");
  if (finished - started < MIN_MATCH_MS || finished - started > MAX_MATCH_MS) return fail("Match length is out of range");

  if (!Array.isArray(body.players) || body.players.length !== game.players) {
    return fail(`${body.gameType} needs ${game.players} players`);
  }
  if (!isInt(body.me, 0, game.players - 1)) return fail("Your seat isn't at the table");
  if (!isInt(body.rounds, 1, MAX_ROUNDS)) return fail("Round count is out of range");

  const players = [];
  for (const p of body.players) {
    if (!isObject(p) || !isInt(p.score, -200, 500)) return fail("Score out of range");
    if (body.gameType === "thirteen") {
      if (typeof p.eliminated !== "boolean") return fail("Missing eliminated flag");
      players.push({ score: p.score, eliminated: p.eliminated });
    } else {
      if (!isInt(p.lastEaten, 0, 5)) return fail("Piles eaten out of range");
      players.push({ score: p.score, lastEaten: p.lastEaten });
    }
  }
  // The match must actually be over.
  if (body.gameType === "thirteen" && players.filter((p) => !p.eliminated).length !== 1) {
    return fail("A Thirteen match ends with one player left");
  }
  if (body.gameType === "muushig" && !players.some((p) => p.score <= 0)) {
    return fail("A Muushig match ends when someone reaches 0");
  }

  if (!isObject(body.stats)) return fail("Missing stats");
  const stats = {};
  for (const key of game.stats) {
    const v = body.stats[key] ?? 0;
    if (!isInt(v, 0, MAX_COUNT)) return fail(`Bad stat: ${key}`);
    stats[key] = v;
  }
  if (stats.rounds_played > body.rounds || stats.rounds_won > stats.rounds_played) return fail("Round tallies don't add up");
  if (body.gameType === "muushig") {
    if (stats.gone_in + stats.folded !== stats.rounds_played) return fail("Round tallies don't add up");
    if (stats.sweeps > stats.gone_in || stats.eaten > stats.gone_in * 5) return fail("Pile tallies don't add up");
  }
  if (body.gameType === "thirteen") {
    const hands = {};
    for (const [type, n] of Object.entries(isObject(body.stats.hands) ? body.stats.hands : {})) {
      if (!HAND_TYPES.has(type)) continue;
      if (!isInt(n, 0, MAX_COUNT)) return fail(`Bad hand count: ${type}`);
      hands[type] = n;
    }
    stats.hands = hands;
  }

  return {
    ok: true,
    value: {
      matchId: body.matchId,
      gameType: body.gameType,
      startedAt: new Date(started),
      finishedAt: new Date(finished),
      me: body.me,
      rounds: body.rounds,
      players,
      stats,
    },
  };
}

/**
 * Each seat's finishing place (1 = winner), by the game's own rules:
 * Thirteen — the last player standing, then the lowest score; Muushig — the
 * lowest score, ties to whoever ate more piles in the last round, then seat.
 */
export function rankSolo(gameType, players) {
  const order = players
    .map((p, seat) => ({ ...p, seat }))
    .sort((a, b) => {
      if (gameType === "thirteen" && a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.score !== b.score) return a.score - b.score;
      if (gameType === "muushig" && a.lastEaten !== b.lastEaten) return b.lastEaten - a.lastEaten;
      return a.seat - b.seat;
    });
  const places = Array(players.length);
  order.forEach((p, i) => {
    places[p.seat] = i + 1;
  });
  return places;
}
