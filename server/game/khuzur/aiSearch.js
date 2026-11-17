// KHUZUR CPU — HARD: PLAYING THE MATCH OUT IN ITS HEAD
//
// HARD can't see the other hands or the pile, so it imagines them. Each
// imagined deal (a "world") is a small constraint problem: the cards HARD
// can't place are the values, and every slot they could fill is a variable,
// each opponent's hidden cards, each place in the draw pile, the dead pile's
// unseen cards. The hard constraints: every count matches the table, a
// player keeps the cards they're known to hold, and a returned joker sits
// where the deal could have put it. The joker has the fewest places it can
// go, so it is placed first (most constrained first), then the rest fill at
// random.
//
// A world must also fit what the table has seen, and that part is soft: a
// player who picked up probably couldn't beat. Each world gets a weight, the
// chance the table would have played the way it did if that world were the
// real one (Bayes' rule): a world where the player could have beaten the
// layer they picked up counts a fraction of one where they couldn't.
//
// Then flat Monte Carlo: each move worth weighing is played, and the match
// played out to the end in that world with every seat playing MEDIUM's
// judgement (aiPolicy.js), many times over. Every move faces the same worlds,
// so luck in the deal doesn't favour one over another, and the moves that
// do worst are dropped halfway (sequential halving), so the budget goes to
// telling the good ones apart. The move whose team ends best on average,
// weighted by how well each world fits, is played.

import { beats, coverWith, shuffle } from "./cards.js";
import { PHASES, canSwapSeven, swapTrumpSeven } from "./engine.js";
import { simMove } from "./aiPolicy.js";

/** P(pick up | could have beaten): while there are cards to draw, and once dry. */
export const PICK_BY_CHOICE = { pre: 0.3, dry: 0.08 };

/**
 * Where the returned jokers sit: replays the deal's own rule (each goes back
 * somewhere in the middle half of the pile) and follows the draws. Returns
 * [{ card, seat }] (seat: who drew it) or [{ card, pile }] (its place in the
 * pile now), or null if this placement can't be (it would be in your hand,
 * or drawn by someone who has since gone out without playing it).
 */
function placeJokers(view, rng) {
  const { base, returned, drawers } = view.jokers;
  // The pile as the deal left it: -1 for the other cards, j for the j-th joker put back.
  const pile = new Array(base).fill(-1);
  for (let j = 0; j < returned.length; j++) {
    const len = base + j;
    const lo = Math.floor(len / 4);
    const hi = Math.ceil((3 * len) / 4);
    pile.splice(lo + Math.floor(rng() * (hi - lo + 1)), 0, j);
  }
  const placed = [];
  pile.forEach((j, at) => {
    if (j < 0 || !returned[j].unseen) return;
    if (at < drawers.length) placed.push({ card: returned[j].card, seat: drawers[at] });
    else placed.push({ card: returned[j].card, pile: at - drawers.length });
  });
  const room = view.players.map((p) => p.unknown);
  let hidden = view.hidden;
  for (const p of placed) {
    if (p.pile !== undefined) {
      if (p.pile >= view.pileCount) return null;
      continue;
    }
    if (p.seat === view.me) return null; // it would be in this hand
    if (view.players[p.seat].out) {
      // Drawn by someone now out: only a surrendered hand takes an unplayed card with it.
      if (hidden-- <= 0) return null;
      p.hidden = true;
    } else if (room[p.seat]-- <= 0) return null;
  }
  return placed;
}

/**
 * One imagined deal of everything `view.me` can't see, true to what the
 * table knows: { state, weight }. `state` is the real one with those cards
 * dealt again, so the engine can play it on.
 */
export function dealWorld(state, view, rng) {
  const others = view.players.filter((p) => p.id !== view.me);
  let jokers = [];
  for (let tries = 0; tries < 20 && view.jokers.returned.some((r) => r.unseen); tries++) {
    const placed = placeJokers(view, rng);
    if (placed) {
      jokers = placed;
      break;
    }
  }
  const fixed = new Set(jokers.map((p) => p.card.id));
  const pool = shuffle(
    view.unseen.filter((c) => !fixed.has(c.id)),
    rng,
  );
  let next = 0;
  const take = (n) => pool.slice(next, (next += n));

  const hands = {};
  const dealt = {}; // the hidden cards each player was dealt here
  for (const p of others) {
    const mine = jokers.filter((j) => j.seat === p.id && !j.hidden).map((j) => j.card);
    dealt[p.id] = [...mine, ...take(Math.max(0, p.unknown - mine.length))];
    hands[p.id] = [...p.known, ...dealt[p.id]];
  }
  const drawPile = new Array(view.pileCount);
  for (const j of jokers) if (j.pile !== undefined) drawPile[j.pile] = j.card;
  for (let i = 0; i < drawPile.length; i++) if (!drawPile[i]) drawPile[i] = pool[next++];

  const players = state.players.map((p) => (p.id === view.me ? p : { ...p, hand: hands[p.id] }));
  const world = { ...state, players, drawPile, deadPile: [...view.gone], events: state.events.slice(-8) };
  return { state: world, weight: evidenceWeight(view, dealt) };
}

/** Bayes' rule over the pick-ups: how likely the table's pick-ups are in this world. */
function evidenceWeight(view, dealt) {
  let weight = 1;
  for (const ev of view.evidence) {
    const unknown = view.players[ev.seat].unknown;
    // The hidden cards it has held since the pick-up: all but the ones drawn after it.
    const kept = Math.max(0, unknown - ev.fresh);
    const held = [...ev.before, ...dealt[ev.seat].slice(0, kept)];
    const usable = held.filter((c) => ev.layer.some((top) => beats(c, top, view.trumpSuit)));
    if (usable.length >= ev.layer.length && coverWith(ev.layer, usable, view.trumpSuit)) weight *= ev.dry ? PICK_BY_CHOICE.dry : PICK_BY_CHOICE.pre;
  }
  return weight;
}

const ROLLOUT_CAP = 250;

/**
 * Plays the match on with every seat on MEDIUM's judgement, to the end or
 * ROLLOUT_CAP moves. `count.moves` adds up the moves played.
 */
export function playOut(state, apply, rng, count = { moves: 0 }) {
  let s = state;
  for (let i = 0; i < ROLLOUT_CAP && s.phase === PHASES.PLAY; i++) {
    const seat = s.turn;
    s = canSwapSeven(s, seat) ? swapTrumpSeven(s, seat) : apply(s, simMove(s, seat), rng);
    if (s.events.length > 24) s = { ...s, events: s.events.slice(-8) };
    count.moves++;
  }
  return s;
}

/**
 * How the match went for `team`, from 1 (first) to 0 (last). A match the
 * cap cut short is judged by hand sizes: the team whose smallest hand is
 * smallest is closest to going out.
 */
export function teamResult(state, team) {
  const teams = state.places.length;
  const scale = (place) => (teams - place) / (teams - 1);
  if (state.places[team] != null) return scale(state.places[team]);
  const smallest = (t) => Math.min(...state.players.filter((p) => p.team === t && !p.out).map((p) => p.hand.length));
  const mine = smallest(team);
  let ahead = 0;
  for (let t = 0; t < teams; t++) {
    if (t === team) continue;
    if (state.places[t] != null ? state.places[t] < teams : smallest(t) < mine) ahead++;
    else if (state.places[t] == null && smallest(t) === mine) ahead += 0.5;
  }
  return scale(1 + ahead);
}

/**
 * The best of `moves` for `view.me`: each is played out in the same worlds
 * and the worst half dropped each round. `budget` is how many moves the
 * play-outs may make in all, split evenly between the rounds; a round deals
 * new worlds until its share is spent (one at least), and no new round
 * starts once half as much again has been spent.
 */
export function bestMove(state, view, moves, apply, rng, { budget }) {
  if (moves.length === 1) return moves[0];
  const team = view.team;
  const stats = moves.map(() => ({ sum: 0, weight: 0 }));
  let alive = moves.map((_, i) => i);
  const rounds = Math.max(1, Math.ceil(Math.log2(moves.length)));
  const count = { moves: 0 };
  const mean = (i) => (stats[i].weight ? stats[i].sum / stats[i].weight : 0);
  for (let r = 0; r < rounds && alive.length > 1 && count.moves < budget * 1.5; r++) {
    const until = (budget * (r + 1)) / rounds;
    for (let k = 0; k < 1 || count.moves < until; k++) {
      const { state: world, weight } = dealWorld(state, view, rng);
      for (const i of alive) {
        const end = playOut(apply(world, moves[i], rng), apply, rng, count);
        stats[i].sum += weight * teamResult(end, team);
        stats[i].weight += weight;
      }
    }
    alive.sort((a, b) => mean(b) - mean(a) || a - b);
    if (r < rounds - 1) alive = alive.slice(0, Math.ceil(alive.length / 2));
  }
  return moves[alive[0]];
}
