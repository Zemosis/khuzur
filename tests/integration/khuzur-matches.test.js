// Plays whole CPU-only Khuzur matches through the engine at every table shape
// and both deals, checking docs/khuzur-rulebook.md's invariants after every
// move. Shuffles are seeded, so a failure names a seed you can replay.

import { describe, it, expect } from "vitest";
import { createDeck, coverAssignment, shuffle } from "../../src/utils/khuzur/cards.js";
import { PHASES, createMatch, seatCount, topLayer } from "../../src/utils/khuzur/engine.js";
import { aiAction, applyAction } from "../../src/utils/khuzur/ai.js";
import { seededRandom } from "../helpers/cards.js";

const MOVE_CAP = 5000;
const SEEDS = 20;
const TABLES = [
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [1, 6],
  [2, 2],
  [2, 3],
  [3, 2],
].flatMap(([perTeam, teams]) => [5, 7].map((handSize) => ({ perTeam, teams, handSize })));

const players = (n, level = "MEDIUM") => Array.from({ length: n }, (_, i) => ({ name: `Bot ${i}`, type: "AI", level }));

/** Every card the match is using, wherever it is now. */
function cardsInPlay(s) {
  const stack = s.stack ? s.stack.layers.flat() : [];
  return [...s.players.flatMap((p) => p.hand), ...s.drawPile, ...(s.trumpCard ? [s.trumpCard] : []), ...s.deadPile, ...stack];
}

function checkInvariants(s, deckSize, label) {
  if (s.phase === PHASES.DRAW) return;
  const ids = cardsInPlay(s).map((x) => x.id);
  expect(ids.length, `${label}: card count`).toBe(deckSize);
  expect(new Set(ids).size, `${label}: duplicate card`).toBe(deckSize);
  if (s.phase === PHASES.PLAY) {
    for (const p of s.players) if (!p.out) expect(p.hand.length, `${label}: seat ${p.id} in play with no cards`).toBeGreaterThan(0);
  }
}

/** Plays a match to the end; `chooser(seat)` picks who decides for each seat. */
function playMatch(table, seed, chooser = () => aiAction, levels = null) {
  const rng = seededRandom(seed);
  const seated = players(seatCount(table)).map((p, i) => (levels ? { ...p, level: levels[i] } : p));
  let s = createMatch({ players: seated, table, rng });
  const deckSize = createDeck(table.handSize).length;
  let moves = 0;
  while (s.phase !== PHASES.MATCH_OVER) {
    if (++moves > MOVE_CAP) throw new Error(`seed ${seed} ${JSON.stringify(table)}: no finish in ${MOVE_CAP} moves`);
    const action = chooser(s.turn)(s, rng);
    s = applyAction(s, action, rng);
    checkInvariants(s, deckSize, `seed ${seed} ${JSON.stringify(table)} move ${moves}`);
  }
  return s;
}

describe.each(TABLES)("CPU-only matches at %o", (table) => {
  it(`${SEEDS} seeded matches all finish with every card accounted for`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = playMatch(table, seed);
      const places = s.places.filter((p) => p !== null);
      expect(places.sort((a, b) => a - b)).toEqual(Array.from({ length: table.teams }, (_, i) => i + 1));
    }
  });
});

/** A baseline bot: leads a random single, beats with a random cover when it has one. */
function randomAction(s, rng) {
  const seat = s.turn;
  const hand = s.players[seat].hand;
  if (s.phase === PHASES.DRAW) return { type: "drawForDeal", seat, depth: 1 };
  if (!s.stack) return { type: "lead", seat, cardIds: [hand[Math.floor(rng() * hand.length)].id] };
  const top = topLayer(s);
  for (let tries = 0; tries < 20; tries++) {
    const pick = shuffle(hand, rng).slice(0, top.length);
    if (pick.length === top.length && coverAssignment(top, pick, s.trumpSuit)) return { type: "beat", seat, cardIds: pick.map((x) => x.id) };
  }
  return { type: "pickUp", seat };
}

describe("strength", () => {
  it("beats a random-move bot in at least 70% of 1v1 matches", () => {
    const table = { perTeam: 1, teams: 2, handSize: 5 };
    let wins = 0;
    const N = 200;
    for (let seed = 1; seed <= N; seed++) {
      const cpuSeat = seed % 2;
      const s = playMatch(table, seed, (seat) => (seat === cpuSeat ? aiAction : randomAction));
      if (s.places[cpuSeat] === 1) wins++;
    }
    expect(wins / N).toBeGreaterThanOrEqual(0.7);
  });
});

describe("CPU levels", () => {
  it("EASY finishes 10 seeded matches at every table shape", () => {
    for (const table of TABLES) for (let seed = 1; seed <= 10; seed++) playMatch(table, seed, () => aiAction, Array(seatCount(table)).fill("EASY"));
  });

  it("HARD finishes seeded matches at three table shapes", () => {
    const shapes = [{ perTeam: 1, teams: 2, handSize: 5 }, { perTeam: 2, teams: 2, handSize: 7 }, { perTeam: 1, teams: 4, handSize: 5 }];
    for (const table of shapes) for (let seed = 1; seed <= 3; seed++) playMatch(table, seed, () => aiAction, Array(seatCount(table)).fill("HARD"));
  }, 120000);

  /** How often `a` places 1st against `b` in 1v1, seats alternating. */
  function winRate(a, b, n) {
    const table = { perTeam: 1, teams: 2, handSize: 5 };
    let wins = 0;
    for (let seed = 1; seed <= n; seed++) {
      const seat = seed % 2;
      const levels = seat === 0 ? [a, b] : [b, a];
      if (playMatch(table, seed + 1000, () => aiAction, levels).places[seat] === 1) wins++;
    }
    return wins / n;
  }

  it("MEDIUM beats EASY in at least 60% of 1v1 matches", () => {
    expect(winRate("MEDIUM", "EASY", 200)).toBeGreaterThanOrEqual(0.6);
  });

  it("HARD beats MEDIUM in at least 52% of 1v1 matches", () => {
    expect(winRate("HARD", "MEDIUM", 60)).toBeGreaterThanOrEqual(0.52);
  }, 300000);
});
