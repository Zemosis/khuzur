// KHUZUR CPU — three levels, as pure functions over the engine's state.
//
// None of them sees a card its seat couldn't: every level reads the table
// through readTable (aiView.js), which takes the seat's own hand, what's
// face up and what the table's history showed, and other hands only for how
// many cards they hold.
//
//   EASY    a beginner. It plays by MEDIUM's sense of a good move but counts
//           no cards (every card it can't see might still be out), doesn't
//           think about the player it plays into, and doesn't always pick
//           the move it thinks best: the better a move looks, the likelier
//           it plays it, but a close second often wins.
//   MEDIUM  a steady club player. It counts the cards (what's gone dead,
//           what each player picked up), so it knows what its cards are
//           worth now; it weighs the chance the next player can't beat a
//           lead, sheds weak cards while the pile lasts, keeps trumps and
//           jokers for when they count, picks up when beating would cost
//           more than the stack, and once the pile is dry races to go out
//           without leading into a player who'd go out on it. See
//           aiPolicy.js.
//   HARD    a strong player. It weighs MEDIUM's best few moves and more by
//           playing the match out in its head, hundreds of times, against
//           deals of the cards it can't see that fit everything the table
//           has shown, and plays the move whose team ends best. See
//           aiSearch.js.
//
// Every level swaps the trump 7 for the face-up trump the moment it can.

import { LEAD_SIZES, beats, cardPower, isJoker, isTrump, isValidLead } from "./cards.js";
import { PHASES, beat, canSwapSeven, drawForDeal, lead, maxDrawDepth, pickUp, swapTrumpSeven } from "./engine.js";
import { readTable, outsideCards } from "./aiView.js";
import { WEIGHTS, cheapCover, makeCounter, naiveCounter, scoredMoves, situation, stalling } from "./aiPolicy.js";
import { bestMove } from "./aiSearch.js";

// ---- Kept for the table: a timed-out leader's card, and the tests -----------

const byPower = (trumpSuit) => (a, b) => cardPower(a, trumpSuit) - cardPower(b, trumpSuit);

/**
 * The cheapest lead of `size` cards: pairs from the lowest-powered ranks,
 * then the cheapest card left as the lonely one. Null if the hand can't make it.
 */
export function cheapestLead(hand, size, trumpSuit) {
  const cards = [...hand].sort(byPower(trumpSuit));
  if (size === 1) return cards.length ? [cards[0]] : null;
  const byRank = new Map();
  for (const card of cards) {
    if (isJoker(card)) continue;
    byRank.set(card.rank, [...(byRank.get(card.rank) ?? []), card]);
  }
  const pairs = [];
  for (const group of byRank.values()) {
    for (let i = 0; i + 1 < group.length; i += 2) pairs.push([group[i], group[i + 1]]);
  }
  const cost = (pair) => cardPower(pair[0], trumpSuit) + cardPower(pair[1], trumpSuit);
  pairs.sort((a, b) => cost(a) - cost(b));
  const need = (size - 1) / 2;
  if (pairs.length < need) return null;
  const chosen = pairs.slice(0, need).flat();
  const lonely = cards.find((card) => !chosen.includes(card));
  if (!lonely) return null;
  const result = [...chosen, lonely];
  return isValidLead(result) ? result : null;
}

/**
 * Cover each card of the layer with the cheapest card that beats it, the
 * card with the fewest answers first. Returned in the layer's column order,
 * or null.
 */
export function cheapestCover(layer, hand, trumpSuit) {
  if (hand.filter((c) => layer.some((top) => beats(c, top, trumpSuit))).length < layer.length) return null;
  return cheapCover(layer, hand, trumpSuit, (c) => cardPower(c, trumpSuit));
}

// ---- The levels ----------------------------------------------------------------

/** What a seat knows, set out for scoring moves. `counting` false forgets every card seen. */
function judge(state, seat, { counting }) {
  const view = readTable(state, seat);
  const counter = counting ? makeCounter(outsideCards(view), state.trumpSuit) : naiveCounter(view.hand, state.trumpSuit, view.handSize);
  const players = counting ? view.players : view.players.map((p) => ({ ...p, known: [] }));
  return { view, sit: situation(state, seat, players, counter) };
}

function mediumMove(state, seat) {
  const { sit } = judge(state, seat, { counting: true });
  return scoredMoves(state, seat, sit, WEIGHTS)[0].move;
}

// EASY picks among its moves at random, each as likely as e^(score / EASY_TEMPER)
// (a softmax): a move a full point worse is about a third as likely.
const EASY_TEMPER = 1.0;

function easyMove(state, seat, rng) {
  const { sit } = judge(state, seat, { counting: false });
  const moves = scoredMoves(state, seat, sit, WEIGHTS, { aware: false });
  if (moves[0].score >= 1000) return moves[0].move; // going out is never missed
  const top = moves[0].score;
  const odds = moves.map((m) => Math.exp((m.score - top) / EASY_TEMPER));
  let roll = rng() * odds.reduce((a, b) => a + b, 0);
  for (let i = 0; i < moves.length; i++) {
    roll -= odds[i];
    if (roll <= 0) return moves[i].move;
  }
  return moves[0].move;
}

// HARD's budget: moves played out in its head per decision, all worlds and moves together.
const HARD_BUDGET = 6000;
// The moves HARD plays out: MEDIUM's best, and any within HARD_REACH of its
// score, HARD_MOVES at most, picking up whenever it may, and the cheapest
// plain moves. Fewer moves means more worlds for each.
const HARD_MOVES = 6;
const HARD_REACH = 1.5;

function hardMove(state, seat, rng) {
  const { view, sit } = judge(state, seat, { counting: true });
  const scored = scoredMoves(state, seat, sit, WEIGHTS, { wide: true });
  if (scored[0].score >= 1000) return scored[0].move;
  const moves = scored
    .filter((m) => m.score >= scored[0].score - HARD_REACH)
    .slice(0, HARD_MOVES)
    .map((m) => m.move);
  const pick = scored.find((m) => m.move.type === "pickUp");
  if (pick && !moves.includes(pick.move)) moves.push(pick.move);
  // And the plain moves MEDIUM's scores might pass over: the cheapest cover,
  // and the cheapest lead of each size, with and without trumps.
  const key = (m) => `${m.type}:${[...(m.cardIds ?? [])].sort().join(",")}`;
  const have = new Set(moves.map(key));
  const add = (m) => {
    if (have.has(key(m))) return;
    have.add(key(m));
    moves.push(m);
  };
  const hand = state.players[seat].hand;
  if (state.stack) {
    const cover = cheapestCover(state.stack.layers.at(-1), hand, state.trumpSuit);
    if (cover && !stalling(state)) add({ type: "beat", seat, cardIds: cover.map((c) => c.id) });
  } else if (!stalling(state)) {
    const plain = hand.filter((c) => !isJoker(c) && !isTrump(c, state.trumpSuit));
    for (const size of LEAD_SIZES.filter((n) => n <= sit.limit)) {
      for (const from of [plain, hand]) {
        const cards = cheapestLead(from, size, state.trumpSuit);
        if (cards) add({ type: "lead", seat, cardIds: cards.map((c) => c.id) });
      }
    }
  }
  return bestMove(state, view, moves, applyAction, rng, { budget: HARD_BUDGET });
}

const LEVEL_MOVES = { EASY: easyMove, MEDIUM: mediumMove, HARD: hardMove };

/** The move for whoever's turn it is, at their level. */
export function aiAction(state, rng = Math.random) {
  const seat = state.turn;
  switch (state.phase) {
    case PHASES.DRAW:
      // No card is better than another sight unseen: any depth will do.
      return { type: "drawForDeal", seat, depth: 1 + Math.floor(rng() * maxDrawDepth(state)) };
    case PHASES.PLAY: {
      if (canSwapSeven(state, seat)) return { type: "swapSeven", seat };
      const move = LEVEL_MOVES[state.players[seat].level] ?? mediumMove;
      return move(state, seat, rng);
    }
    default:
      return null;
  }
}

/** Runs an action (from the CPU or the player) through the engine. */
export function applyAction(state, action, rng) {
  switch (action.type) {
    case "drawForDeal":
      return drawForDeal(state, action.seat, action.depth, rng);
    case "lead":
      return lead(state, action.seat, action.cardIds);
    case "beat":
      return beat(state, action.seat, action.cardIds);
    case "pickUp":
      return pickUp(state, action.seat);
    case "swapSeven":
      return swapTrumpSeven(state, action.seat);
    default:
      throw new Error(`Unknown action ${action.type}`);
  }
}
