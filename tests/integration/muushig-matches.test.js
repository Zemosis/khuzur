// Plays whole CPU-only Muushig matches through the engine (the CPUs choose
// every move, at each difficulty) and checks docs/muushig-rulebook.md's
// invariants after every single move. Shuffles are seeded, so a failure names
// a seed you can replay.

import { describe, it, expect } from "vitest";
import {
  HAND_SIZE,
  MAX_FOLDS_IN_A_ROW,
  MIN_PLAYING,
  PHASES,
  PLAYER_COUNT,
  START_SCORE,
  TRICKS_PER_ROUND,
  ZERO_PILES_PENALTY,
  allowedPlays,
  collectTrick,
  createMatch,
  leftOf,
  rematch,
  startNextRound,
} from "../../src/utils/muushig/engine.js";
import { aiAction, applyAction } from "../../src/utils/muushig/ai.js";
import { seededRandom } from "../helpers/cards.js";

// HARD plays every choice out hundreds of times, so it gets fewer matches.
const MATCHES_PER_LEVEL = { EASY: 25, MEDIUM: 25, HARD: 5 };
const MOVE_CAP = 20000;
const DECK_SIZE = 32;

const players = (level) => ["You", "Bot Saturn", "Bot Venus", "Bot Mars", "Bot Jupiter"].map((name) => ({ name, type: "AI", level }));

/** Every card the round is using, wherever it is now. */
function cardsInRound(s) {
  const loose = [...s.players.flatMap((p) => p.hand), ...s.drawPile, ...s.deadPile, ...s.played];
  return s.trumpTakenBy == null ? [...loose, s.trumpCard] : loose;
}

function playMatch(seed, level) {
  const rng = seededRandom(seed);
  let s = createMatch({ players: players(level), rng });
  const stats = { rounds: 0, folds: 0, sweeps: 0 };
  const foldRuns = Array(PLAYER_COUNT).fill(0); // rounds folded in a row, per seat
  let lastDealer = null;
  let roundEats = 0;
  let scoresBefore = s.players.map((p) => p.score);

  for (let moves = 0; s.phase !== PHASES.MATCH_OVER; moves++) {
    if (moves > MOVE_CAP) throw new Error(`seed ${seed} (${level}): the match never ended`);
    const where = `seed ${seed} (${level}), round ${s.roundNumber}, ${s.phase}`;

    // ---- the draw for the deal: no hands yet, the pile only shrinks
    if (s.phase === PHASES.DRAW) {
      expect(s.dealDeck.length + s.dealDraws.length, where).toBe(DECK_SIZE);
      s = applyAction(s, aiAction(s, rng), rng);
      continue;
    }

    // ---- every card of the deck is somewhere, exactly once
    const all = cardsInRound(s);
    expect(all, where).toHaveLength(DECK_SIZE);
    expect(new Set(all.map((c) => c.id)).size, where).toBe(DECK_SIZE);

    if (s.phase === PHASES.DECIDE && s.events.at(-1).type === "round") {
      // A fresh deal: 5 cards each, 6 to draw, the deal passed clockwise.
      stats.rounds += 1;
      expect(s.players.every((p) => p.hand.length === HAND_SIZE), where).toBe(true);
      expect(s.drawPile, where).toHaveLength(DECK_SIZE - HAND_SIZE * PLAYER_COUNT - 1);
      if (lastDealer != null) expect(s.dealer, where).toBe(leftOf(lastDealer));
      lastDealer = s.dealer;
      expect(s.turn, `${where}: left of the dealer decides first`).toBe(leftOf(s.dealer));
      roundEats = 0;
      scoresBefore = s.players.map((p) => p.score);
    }

    if (s.phase === PHASES.PLAY) {
      const seat = s.turn;
      expect(s.players[seat].status, `${where}: only players who went in play`).toBe("play");
      const allowed = allowedPlays(s, seat).map((c) => c.id);
      const action = aiAction(s, rng);
      expect(allowed, `${where}: the CPU played an allowed card`).toContain(action.cardId);
      // §6, checked on its own: follow the led suit, else trump, else anything.
      const hand = s.players[seat].hand;
      const card = hand.find((c) => c.id === action.cardId);
      const led = s.trick[0]?.card.suit;
      if (led && hand.some((c) => c.suit === led)) expect(card.suit, `${where}: must follow the led suit`).toBe(led);
      else if (led && hand.some((c) => c.suit === s.trumpSuit)) expect(card.suit, `${where}: must trump`).toBe(s.trumpSuit);
      s = applyAction(s, action, rng);
      continue;
    }

    if (s.phase === PHASES.TRICK_END) {
      const trick = s.trick;
      const playing = s.players.filter((p) => p.status === "play").length;
      expect(trick, `${where}: everyone in plays one card`).toHaveLength(playing);
      const winner = trick.find((p) => p.seat === s.trickWinner);
      const trumps = trick.filter((p) => p.card.suit === s.trumpSuit);
      if (trumps.length) {
        // The highest trump eats.
        expect(winner.card.suit, where).toBe(s.trumpSuit);
        expect(winner.card.rankValue, where).toBe(Math.max(...trumps.map((p) => p.card.rankValue)));
      }
      s = collectTrick(s);
      roundEats += 1;
      if (s.phase === PHASES.PLAY) expect(s.turn, `${where}: the eater leads`).toBe(winner.seat);
      continue;
    }

    if (s.phase === PHASES.ROUND_END) {
      checkRoundEnd(s, where, roundEats, scoresBefore, foldRuns, stats);
      s = startNextRound(s, rng);
      continue;
    }

    // DECIDE, SWAP, TRUMP: the CPU's move, through the engine's own checks.
    s = applyAction(s, aiAction(s, rng), rng);
  }

  const where = `seed ${seed} (${level}), final round`;
  checkRoundEnd(s, where, roundEats, scoresBefore, foldRuns, stats);
  // §8: the match ends once someone is at 0 or less; the lowest score wins.
  const scores = s.players.map((p) => p.score);
  expect(Math.min(...scores), where).toBeLessThanOrEqual(0);
  expect(scores[s.matchWinner], where).toBe(Math.min(...scores));
  expect(s.events.at(-1), where).toEqual({ type: "matchEnd", seat: s.matchWinner });
  return { state: s, stats };
}

/** §4 and §7, checked at every round's end. */
function checkRoundEnd(s, where, roundEats, scoresBefore, foldRuns, stats) {
  expect(roundEats, `${where}: a round has exactly 5 tricks`).toBe(TRICKS_PER_ROUND);
  const { results, roundWinner } = s.roundResults;
  const inPlay = results.filter((r) => !r.folded);
  expect(inPlay.length, `${where}: at least 2 go in`).toBeGreaterThanOrEqual(MIN_PLAYING);
  expect(results.reduce((sum, r) => sum + r.eaten, 0), `${where}: 5 piles eaten in all`).toBe(TRICKS_PER_ROUND);

  for (const r of results) {
    const delta = r.folded ? 0 : r.eaten > 0 ? -r.eaten : ZERO_PILES_PENALTY;
    expect(r.delta, `${where}, seat ${r.seat}: score change`).toBe(delta);
    expect(r.score, `${where}, seat ${r.seat}: new score`).toBe(scoresBefore[r.seat] + delta);
    expect(s.players[r.seat].score, where).toBe(r.score);
    foldRuns[r.seat] = r.folded ? foldRuns[r.seat] + 1 : 0;
    expect(foldRuns[r.seat], `${where}, seat ${r.seat}: no 3 folds in a row`).toBeLessThanOrEqual(MAX_FOLDS_IN_A_ROW);
    if (r.folded) stats.folds += 1;
  }
  const sweeper = results.find((r) => r.eaten === TRICKS_PER_ROUND);
  expect(roundWinner, `${where}: eating all 5 wins the round`).toBe(sweeper ? sweeper.seat : null);
  if (sweeper) stats.sweeps += 1;

  // Nobody had reached 0 before this round, or the match would have ended.
  expect(Math.min(...scoresBefore), where).toBeGreaterThan(0);
}

describe.each(["EASY", "MEDIUM", "HARD"])("whole Muushig matches, CPUs at %s", (level) => {
  it(`${MATCHES_PER_LEVEL[level]} seeded matches keep every rule after every move`, () => {
    const totals = { rounds: 0, folds: 0, sweeps: 0 };
    for (let seed = 1; seed <= MATCHES_PER_LEVEL[level]; seed++) {
      const { stats } = playMatch(seed * 7919 + level.length, level);
      for (const k of Object.keys(totals)) totals[k] += stats[k];
    }
    // The run actually exercised the rules it checks.
    expect(totals.rounds).toBeGreaterThan(MATCHES_PER_LEVEL[level]);
    expect(totals.folds).toBeGreaterThan(0);
  }, 60_000);
});

describe("a rematch", () => {
  it("starts everyone back on 15, fold streaks cleared, with a new draw for the deal", () => {
    const { state } = playMatch(42, "MEDIUM");
    let s = rematch(state, seededRandom(43));
    expect(s.matchNumber).toBe(2);
    expect(s.phase).toBe(PHASES.DRAW);
    expect(s.players.every((p) => p.score === START_SCORE && (p.foldStreak ?? 0) === 0)).toBe(true);
  });
});
