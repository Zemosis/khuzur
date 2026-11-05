// KHUZUR CPU — three levels, as pure functions over the engine's state. The
// policy below is MEDIUM; EASY and HARD are at the end. It decides from what its seat could know: its own hand,
// the face-up trump, the stack, and how many cards are left to draw. It never
// reads another player's hand.
//
// Leading: go out if the whole hand is a lead. While cards are left to draw,
// lead the biggest lead made of plain cards (it sheds the most, and the hand
// refills), keeping trumps and jokers. Once the pile is dry, lead as many
// cards as the table allows.
// Beating: cover each card with the cheapest card that holds. While cards are
// left to draw, pick up instead of spending a joker, or trumps on a small
// stack or on a teammate's cards. Once the pile is dry, beat whenever it can:
// every card held is a card to get rid of. The same once the table stalls
// (see stalling).

import { LEAD_SIZES, cardPower, isJoker, isTrump, isValidLead, shuffle } from "./cards.js";
import { PHASES, beat, canSwapSeven, drawForDeal, isFreeForAll, lead, leadLimit, maxDrawDepth, pickUp, swapTrumpSeven, topLayer } from "./engine.js";

const SMALL_STACK = 3; // a stack this small isn't worth a trump while the pile lasts

const byPower = (trumpSuit) => (a, b) => cardPower(a, trumpSuit) - cardPower(b, trumpSuit);
const idOf = (card) => card.id;

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
 * strongest layer card first. Returned in the layer's column order, or null.
 */
export function cheapestCover(layer, hand, trumpSuit) {
  const power = (card) => cardPower(card, trumpSuit);
  const free = [...hand].sort(byPower(trumpSuit));
  const result = new Array(layer.length);
  const columns = layer.map((_, i) => i).sort((a, b) => power(layer[b]) - power(layer[a]));
  for (const col of columns) {
    const i = free.findIndex((card) => power(card) > power(layer[col]));
    if (i < 0) return null;
    result[col] = free.splice(i, 1)[0];
  }
  return result;
}

const cardsLeftToDraw = (state) => state.drawPile.length + (state.trumpCard ? 1 : 0);

// Players holding extra cards lead without drawing, so pick-ups by choice can
// pass the same cards round the table forever while the pile never shrinks.
// Two pick-ups with no draw or dead stack between them is a stall: from then
// on the CPU beats whenever it can, and leads single cards, since big leads
// nobody can cover can loop too. It reads only the public table history.
const STALL_PICKUPS = 2;
function stalling(state) {
  let pickUps = 0;
  for (let i = state.events.length - 1; i >= 0; i--) {
    const type = state.events[i].type;
    if (type === "draw" || type === "dead" || type === "deal") break;
    if (type === "pickUp") pickUps++;
  }
  return pickUps >= STALL_PICKUPS;
}

function chooseLead(state, seat) {
  const hand = state.players[seat].hand;
  const trump = state.trumpSuit;
  const limit = leadLimit(state);
  const dry = cardsLeftToDraw(state) === 0;
  if (dry && hand.length <= limit && isValidLead(hand)) return hand; // goes out
  // A stall where nobody can beat the big leads: a single gets the stack round.
  if (stalling(state)) return cheapestLead(hand, 1, trump);
  const sizes = LEAD_SIZES.filter((n) => n <= limit).sort((a, b) => b - a);
  if (!dry) {
    const plain = hand.filter((card) => !isJoker(card) && !isTrump(card, trump));
    for (const size of sizes) {
      const choice = cheapestLead(plain, size, trump);
      if (choice) return choice;
    }
    return cheapestLead(hand, 1, trump);
  }
  for (const size of sizes) {
    const choice = cheapestLead(hand, size, trump);
    if (choice) return choice;
  }
  return cheapestLead(hand, 1, trump);
}

function chooseDefense(state, seat) {
  const trump = state.trumpSuit;
  const cover = cheapestCover(topLayer(state), state.players[seat].hand, trump);
  if (!cover) return null;
  if (cardsLeftToDraw(state) === 0 || stalling(state)) return cover;
  if (cover.some(isJoker)) return null;
  const trumps = cover.filter((card) => isTrump(card, trump)).length;
  if (!trumps) return cover;
  const stackSize = state.stack.layers.flat().length;
  if (stackSize <= SMALL_STACK) return null;
  const topOwner = state.stack.owners.at(-1);
  const teammates = !isFreeForAll(state) && state.players[topOwner].team === state.players[seat].team;
  return teammates ? null : cover;
}

/** MEDIUM's move in PLAY. */
function mediumMove(state, seat) {
  if (!state.stack) return { type: "lead", seat, cardIds: chooseLead(state, seat).map(idOf) };
  const cover = chooseDefense(state, seat);
  return cover ? { type: "beat", seat, cardIds: cover.map(idOf) } : { type: "pickUp", seat };
}

// ---- EASY: a beginner ------------------------------------------------------
// Leads a random single most of the time, else what MEDIUM would; beats about
// two times in three when it can, and picks up the rest. It keeps the stall
// rule, so it never loops a table.

function easyMove(state, seat, rng) {
  const hand = state.players[seat].hand;
  if (!state.stack) {
    if (stalling(state) || rng() < 0.6) return { type: "lead", seat, cardIds: [hand[Math.floor(rng() * hand.length)].id] };
    return mediumMove(state, seat);
  }
  const cover = cheapestCover(topLayer(state), hand, state.trumpSuit);
  if (cover && (stalling(state) || cardsLeftToDraw(state) === 0 || rng() < 2 / 3)) return { type: "beat", seat, cardIds: cover.map(idOf) };
  return { type: "pickUp", seat };
}

// ---- HARD: plays each choice out ------------------------------------------
// Candidates: MEDIUM's move, picking up, and the cheapest lead of each size
// (with and without trumps). Each is played out HARD_SAMPLES times: the cards
// this seat can't see (other hands and the draw pile) are dealt again at
// random, keeping every count, and every seat plays MEDIUM to the end, or to
// ROLLOUT_CAP moves. The candidate whose team ends best is played.

const HARD_SAMPLES = 16;
const ROLLOUT_CAP = 300;

function hardCandidates(state, seat) {
  const medium = mediumMove(state, seat);
  const list = [medium];
  const hand = state.players[seat].hand;
  const trump = state.trumpSuit;
  if (state.stack) {
    const cover = cheapestCover(topLayer(state), hand, trump);
    if (cover) list.push({ type: "beat", seat, cardIds: cover.map(idOf) });
    list.push({ type: "pickUp", seat });
  } else {
    const limit = leadLimit(state);
    const plain = hand.filter((card) => !isJoker(card) && !isTrump(card, trump));
    for (const size of LEAD_SIZES.filter((n) => n <= limit)) {
      for (const from of [plain, hand]) {
        const choice = cheapestLead(from, size, trump);
        if (choice) list.push({ type: "lead", seat, cardIds: choice.map(idOf) });
      }
    }
  }
  const seen = new Set();
  return list.filter((m) => {
    const key = `${m.type}:${[...(m.cardIds ?? [])].sort().join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The state with every card `seat` can't see dealt again at random, counts kept. */
function redeal(state, seat, rng) {
  const others = state.players.filter((p) => p.id !== seat);
  const pool = [...others.flatMap((p) => p.hand), ...state.drawPile].sort((a, b) => (a.id < b.id ? -1 : 1));
  const dealt = shuffle(pool, rng);
  let next = 0;
  const take = (n) => dealt.slice(next, (next += n));
  const players = state.players.map((p) => (p.id === seat ? p : { ...p, hand: take(p.hand.length) }));
  return { ...state, players, drawPile: take(state.drawPile.length), events: state.events.slice(-6) };
}

/** How a played-out match went for `team`: its place, or a guess from hand sizes. Lower is better. */
function outcome(state, team) {
  if (state.places[team] != null) return state.places[team];
  const smallest = (t) => Math.min(...state.players.filter((p) => p.team === t && !p.out).map((p) => p.hand.length));
  const mine = smallest(team);
  const ahead = state.places.filter((p, t) => p != null || (t !== team && smallest(t) < mine)).length;
  return ahead + 1.5;
}

function rollout(state, rng) {
  let s = state;
  for (let i = 0; i < ROLLOUT_CAP && s.phase === PHASES.PLAY; i++) {
    const seat = s.turn;
    s = applyAction(s, canSwapSeven(s, seat) ? { type: "swapSeven", seat } : mediumMove(s, seat), rng);
  }
  return s;
}

function hardMove(state, seat, rng) {
  const candidates = hardCandidates(state, seat);
  if (candidates.length === 1) return candidates[0];
  const team = state.players[seat].team;
  const totals = candidates.map(() => 0);
  for (let k = 0; k < HARD_SAMPLES; k++) {
    const world = redeal(state, seat, rng);
    candidates.forEach((move, i) => {
      totals[i] += outcome(rollout(applyAction(world, move, rng), rng), team);
    });
  }
  let best = 0;
  totals.forEach((t, i) => {
    if (t < totals[best]) best = i;
  });
  return candidates[best];
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
