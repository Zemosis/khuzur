// KHUZUR CPU — JUDGING A MOVE WITHOUT PLAYING IT OUT
//
// MEDIUM and EASY play by this file, and HARD plays every seat by it when it
// plays a match out in its head (aiSearch.js). It looks one move ahead: it
// lists the sensible moves, gives each a score from what the seat knows, and
// plays the best.
//
// What a card is worth. A card is as good as the chance it holds: of the
// cards still out (not in this hand and not gone dead), the share that would
// NOT beat it. The colored joker is worth 1, a plain 7 with most cards still
// out about 0.4. Counting the cards is what makes it rise: once the higher
// spades and the trumps are gone, a K♠ is as good as a joker.
//
// The chance the next player can't beat a layer. They hold their known cards
// (the stacks they picked up) and a few cards dealt from the cards still out;
// the chance that none of those beats a card is a hypergeometric draw, and a
// layer needs every card covered, taken one card at a time as if they were
// independent (naive, but close enough and very quick).
//
// The score of a move, while there are cards left to draw: every card led or
// beaten with is swapped for a fresh draw (worth the average card still
// out), so shedding weak cards gains and spending strong ones costs; making
// the next player pick up is worth the cards they'd take; killing the stack
// wins the lead. Picking up costs every card taken, less the worth of the
// good ones among them. Once the pile is dry, every card shed is a step
// towards going out, cards taken weigh much more, and leading or beating
// into a player who goes out by covering it is a disaster.
//
// The weights in WEIGHTS were tuned by hill climbing on self-play: change one
// weight a little, play a few thousand matches against the current best,
// keep the change if it wins more.

import { LEAD_SIZES, SUITS, beats, cardPower, coverWith, createDeck, isJoker, isTrump, isValidLead } from "./cards.js";
import { isFreeForAll, leadLimit } from "./engine.js";

export const WEIGHTS = {
  keep: 1.0, // worth of a card kept in hand (while drawing)
  keepDry: 0.444, // worth of a card kept once the pile is dry
  shedDry: 1.0, // every card shed once the pile is dry
  pickPre: 0.743, // each card picked up while drawing
  pickDry: 1.6, // each card picked up once dry
  gain: 0.472, // worth of the cards gained by picking up
  pressPre: 0.075, // per card the next player would have to take, by the chance they can't beat
  pressDry: 0.81,
  tempo: 0.405, // killing the stack: you lead next
  outRisk: 6, // the next player goes out by covering you
  sizePre: 0.1, // each card led or beaten with while drawing (a bigger lead is harder to beat)
  trumpPre: 0.27, // each trump or joker spent while drawing
};

const RANK_COUNT = 8;
const SUIT_INDEX = Object.fromEntries(SUITS.map((s, i) => [s, i]));
const keyOf = (card) => (isJoker(card) ? card.id : `${card.rank}${card.suit}`); // twins are the same card to play

/**
 * How the cards still out stand: per suit, how many of each rank are out,
 * and the jokers. `out` is every card this seat can't see in its own hand
 * and hasn't seen go dead (the face-up trump included).
 */
export function makeCounter(out, trumpSuit) {
  const counts = SUITS.map(() => new Array(RANK_COUNT).fill(0));
  let gray = 0;
  let color = 0;
  for (const c of out) {
    if (isJoker(c)) {
      if (c.joker === "gray") gray = 1;
      else color = 1;
    } else counts[SUIT_INDEX[c.suit]][c.rankValue]++;
  }
  return fromCounts(counts, gray, color, trumpSuit);
}

function fromCounts(counts, gray, color, trumpSuit) {
  // higher[s][r]: cards out of suit s above rank r.
  const higher = counts.map((row) => {
    const h = new Array(RANK_COUNT).fill(0);
    for (let r = RANK_COUNT - 2; r >= 0; r--) h[r] = h[r + 1] + row[r + 1];
    return h;
  });
  const t = trumpSuit == null ? -1 : SUIT_INDEX[trumpSuit];
  const trumps = t < 0 ? 0 : counts[t].reduce((a, b) => a + b, 0);
  let total = gray + color;
  for (const row of counts) for (const n of row) total += n;
  const jokers = gray + color;
  const above = (s, r) => (s === t ? higher[s][r] + jokers : higher[s][r] + trumps + jokers);
  /** Cards still out that beat `card`. */
  const beaters = (card) => {
    if (isJoker(card)) return card.joker === "color" ? 0 : color;
    return above(SUIT_INDEX[card.suit], card.rankValue);
  };
  const worth = (card) => (total ? 1 - beaters(card) / total : 1);
  let sum = gray * (total ? 1 - color / total : 1) + color;
  for (let s = 0; s < counts.length; s++) for (let r = 0; r < RANK_COUNT; r++) if (counts[s][r]) sum += counts[s][r] * (1 - above(s, r) / total);
  return { beaters, worth, total, average: total ? sum / total : 0.5 };
}

/** A counter that knows nothing: every card but your own might be out. EASY reads cards this way. */
export function naiveCounter(hand, trumpSuit, handSize) {
  const mine = new Set(hand.map((c) => c.id));
  return makeCounter(
    createDeck(handSize).filter((c) => !mine.has(c.id)),
    trumpSuit,
  );
}

/** P(a hand of `u` cards dealt from `pool` cards holds none of `b` particular ones). */
function noneOf(pool, b, u) {
  if (b <= 0) return 1;
  if (u > pool - b) return 0;
  let p = 1;
  for (let i = 0; i < u; i++) p *= (pool - b - i) / (pool - i);
  return p;
}

/**
 * The chance `defender` can cover every card of `layer`: the cards they're
 * known to hold first, then the rest dealt from the cards still out.
 */
export function coverChance(layer, defender, counter, trumpSuit) {
  if (defender.count < layer.length) return 0;
  const known = defender.known ?? [];
  const unknown = Math.max(0, defender.count - known.length);
  const pool = Math.max(counter.total - known.length, unknown);
  let p = 1;
  for (const card of layer) {
    if (known.some((k) => beats(k, card, trumpSuit))) continue;
    p *= 1 - noneOf(pool, counter.beaters(card), unknown);
  }
  return p;
}

// ---- Listing the sensible moves ---------------------------------------------

const keyOfSet = (cards) => (cards.length === 1 ? keyOf(cards[0]) : cards.map(keyOf).sort().join(","));

function dedupe(sets) {
  const seen = new Set();
  return sets.filter((cards) => {
    const k = keyOfSet(cards);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function combinations(items, k, cap, out = [], start = 0, pick = []) {
  if (out.length >= cap) return out;
  if (pick.length === k) {
    out.push([...pick]);
    return out;
  }
  for (let i = start; i < items.length && out.length < cap; i++) {
    pick.push(items[i]);
    combinations(items, k, cap, out, i + 1, pick);
    pick.pop();
  }
  return out;
}

/**
 * Leads worth weighing: every single card, and for 3, 5 and 7 cards (up to
 * `limit`) the cheapest pairs with a choice of lonely card. `wide` (HARD)
 * tries more pairings and every lonely card.
 */
export function leadOptions(hand, limit, worth, { wide = false } = {}) {
  const cards = [...hand].sort((a, b) => worth(a) - worth(b));
  const out = cards.map((c) => [c]);
  const byRank = new Map();
  for (const c of cards) {
    if (isJoker(c)) continue;
    byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  }
  const pairs = [];
  for (const group of byRank.values()) for (let i = 0; i + 1 < group.length; i += 2) pairs.push([group[i], group[i + 1]]);
  pairs.sort((a, b) => worth(a[0]) + worth(a[1]) - worth(b[0]) - worth(b[1]));
  for (const size of LEAD_SIZES) {
    if (size === 1 || size > limit) continue;
    const need = (size - 1) / 2;
    if (pairs.length < need) break;
    const pool = wide ? pairs : pairs.slice(0, need + 2);
    for (const chosen of combinations(pool, need, wide ? 60 : 12)) {
      const used = new Set(chosen.flat().map((c) => c.id));
      const rest = cards.filter((c) => !used.has(c.id));
      const lonely = wide ? rest : [rest[0], rest[1], rest[rest.length - 1]].filter(Boolean);
      for (const one of lonely) {
        const lead = [...chosen.flat(), one];
        if (isValidLead(lead)) out.push(lead);
      }
    }
  }
  return dedupe(out);
}

/**
 * The cheapest cover by `cost`: the column with the fewest answers first (it
 * fails soonest), each given its cheapest card; if that strands a column,
 * the cheapest cards that cover at all. Null if nothing covers.
 */
export function cheapCover(layer, hand, trumpSuit, cost) {
  const free = [...hand].sort((a, b) => cost(a) - cost(b));
  const answers = (col) => free.filter((card) => beats(card, layer[col], trumpSuit)).length;
  const order = layer.map((_, i) => i).sort((a, b) => answers(a) - answers(b) || cardPower(layer[b], trumpSuit) - cardPower(layer[a], trumpSuit));
  const result = new Array(layer.length);
  for (const col of order) {
    const i = free.findIndex((card) => beats(card, layer[col], trumpSuit));
    if (i < 0) return fallbackCover(layer, hand, trumpSuit, cost);
    result[col] = free.splice(i, 1)[0];
  }
  return result;
}

function fallbackCover(layer, hand, trumpSuit, cost) {
  const usable = hand.filter((card) => layer.some((top) => beats(card, top, trumpSuit))).sort((a, b) => cost(a) - cost(b));
  for (let n = layer.length; n <= usable.length; n++) {
    const cover = coverWith(layer, usable.slice(0, n), trumpSuit);
    if (cover) return cover;
  }
  return null;
}

/** Every way to cover the layer, cheapest cards first, up to `cap` (HARD's wide list). */
function allCovers(layer, hand, trumpSuit, worth, cap) {
  const out = [];
  const order = layer.map((_, i) => i).sort((a, b) => hand.filter((c) => beats(c, layer[a], trumpSuit)).length - hand.filter((c) => beats(c, layer[b], trumpSuit)).length);
  const sorted = [...hand].sort((a, b) => worth(a) - worth(b));
  const pick = new Array(layer.length);
  const used = new Set();
  const seen = new Set();
  const walk = (k) => {
    if (out.length >= cap) return;
    if (k === order.length) {
      const key = keyOfSet(pick);
      if (!seen.has(key)) {
        seen.add(key);
        out.push([...pick]);
      }
      return;
    }
    const col = order[k];
    const tried = new Set();
    for (const card of sorted) {
      if (used.has(card.id) || !beats(card, layer[col], trumpSuit) || tried.has(keyOf(card))) continue;
      tried.add(keyOf(card));
      used.add(card.id);
      pick[col] = card;
      walk(k + 1);
      used.delete(card.id);
    }
  };
  walk(0);
  return out;
}

/** Covers worth weighing: the cheapest, the cheapest without trumps or jokers, and (one card) every card that beats it. */
export function coverOptions(layer, hand, trumpSuit, worth, { wide = false } = {}) {
  if (wide) return allCovers(layer, hand, trumpSuit, worth, 40);
  if (layer.length === 1) {
    const fits = hand.filter((c) => beats(c, layer[0], trumpSuit));
    return dedupe(fits.map((c) => [c]));
  }
  const out = [];
  const cheapest = cheapCover(layer, hand, trumpSuit, worth);
  if (cheapest) out.push(cheapest);
  const plain = hand.filter((c) => !isJoker(c) && !isTrump(c, trumpSuit));
  const noTrump = cheapCover(layer, plain, trumpSuit, worth);
  if (noTrump) out.push(noTrump);
  const byPower = cheapCover(layer, hand, trumpSuit, (c) => cardPower(c, trumpSuit));
  if (byPower) out.push(byPower);
  return dedupe(out);
}

// ---- Scoring ---------------------------------------------------------------

/**
 * Everything the scorer needs about the table, from what the seat knows:
 * `players` [{ id, team, out, count, known }] as in readTable.
 */
export function situation(state, seat, players, counter) {
  const dry = state.drawPile.length === 0 && !state.trumpCard;
  return {
    seat,
    team: state.players[seat].team,
    trumpSuit: state.trumpSuit,
    handSize: state.table.handSize,
    dry,
    drawable: state.drawPile.length + (state.trumpCard ? 1 : 0),
    freeForAll: isFreeForAll(state),
    limit: leadLimit(state),
    players,
    counter,
    stack: state.stack,
  };
}

/** The defender after this seat plays: the next seat a lead goes to, or the next still to beat. */
function nextDefender(sit, leading) {
  if (leading) {
    const n = sit.players.length;
    for (let i = 1; i < n; i++) {
      const p = sit.players[(sit.seat + i) % n];
      if (!p.out) return p;
    }
    return null;
  }
  const pending = sit.stack.pending;
  return pending.length > 1 ? sit.players[pending[1]] : null;
}

/** Score of putting `cards` down (a lead, or a beat of the top layer). Higher is better. */
export function playScore(sit, cards, hand, w, { leading, aware = true }) {
  const { counter } = sit;
  const k = cards.length;
  const left = hand.length - k;
  if (sit.dry && left === 0) return 1000; // goes out
  let score = 0;
  for (const c of cards) score -= (sit.dry ? w.keepDry : w.keep) * counter.worth(c);
  if (sit.dry) score += w.shedDry * k; // once dry, each card shed is a step towards going out
  else {
    // While drawing, the hand fills back up with fresh cards; a card that
    // isn't replaced takes the hand back down towards its size.
    const refills = Math.min(sit.drawable, Math.max(0, sit.handSize - left));
    score += w.keep * counter.average * refills + w.pickPre * Math.max(0, k - refills) + w.sizePre * k;
    for (const c of cards) if (isJoker(c) || isTrump(c, sit.trumpSuit)) score -= w.trumpPre;
  }
  const stackAfter = (sit.stack ? sit.stack.layers.flat().length : 0) + k;
  const next = nextDefender(sit, leading);
  if (!next) return score + w.tempo; // the stack goes all the way round: this seat leads next
  if (!aware) return score;
  const cover = coverChance(cards, next, counter, sit.trumpSuit);
  const friend = !sit.freeForAll && next.team === sit.team;
  const press = (sit.dry ? w.pressDry : w.pressPre) * (1 - cover) * stackAfter;
  score += friend ? -press : press;
  if (sit.dry && !friend && next.count === k) score -= w.outRisk * cover;
  return score;
}

/** Score of picking up the stack. */
export function pickScore(sit, w) {
  const cards = sit.stack.layers.flat();
  let gain = 0;
  for (const c of cards) gain += sit.counter.worth(c);
  return -(sit.dry ? w.pickDry : w.pickPre) * cards.length + w.gain * gain;
}

// ---- Stalls ------------------------------------------------------------------

// Someone holding extra cards leads without drawing, so pick-ups by choice
// can pass the same cards round the table forever while the pile never
// shrinks. Two pick-ups with no draw or dead stack between them is a stall:
// from then on the CPU beats whenever it can and leads single cards, since
// big leads nobody can cover can loop too. It reads only the table's history.
const STALL_PICKUPS = 2;
export function stalling(state) {
  let pickUps = 0;
  for (let i = state.events.length - 1; i >= 0; i--) {
    const type = state.events[i].type;
    if (type === "draw" || type === "dead" || type === "deal") break;
    if (type === "pickUp" && ++pickUps >= STALL_PICKUPS) return true;
  }
  return false;
}

// ---- Choosing ----------------------------------------------------------------

/**
 * Every move worth weighing with its score: [{ move, score }], best first.
 * `opts.wide` lists more of them (HARD), `opts.aware` false scores without
 * thinking about the next player (EASY).
 */
export function scoredMoves(state, seat, sit, w, opts = {}) {
  const hand = state.players[seat].hand;
  const trump = state.trumpSuit;
  const stall = stalling(state);
  const worth = sit.counter.worth;
  const list = [];
  if (!state.stack) {
    if (sit.dry && hand.length <= sit.limit && isValidLead(hand)) return [{ move: { type: "lead", seat, cardIds: hand.map((c) => c.id) }, score: 1000 }];
    // In a stall, the weakest single: one the next player can beat gets the stack moving round.
    const leads = stall ? [[...hand].sort((a, b) => worth(a) - worth(b))[0]].map((c) => [c]) : leadOptions(hand, sit.limit, worth, opts);
    for (const cards of leads) list.push({ move: { type: "lead", seat, cardIds: cards.map((c) => c.id) }, score: playScore(sit, cards, hand, w, { leading: true, aware: opts.aware !== false }) });
  } else {
    const layer = state.stack.layers.at(-1);
    // In a stall, beating whenever it can, with its lowest cards (so the next
    // player can beat too and the stack goes round), is what ends it.
    const covers = stall ? [cheapCover(layer, hand, trump, (c) => cardPower(c, trump))].filter(Boolean) : coverOptions(layer, hand, trump, worth, opts);
    for (const cards of covers) {
      list.push({ move: { type: "beat", seat, cardIds: cards.map((c) => c.id) }, score: playScore(sit, cards, hand, w, { leading: false, aware: opts.aware !== false }) });
    }
    if (!stall || !list.length) list.push({ move: { type: "pickUp", seat }, score: pickScore(sit, w) });
  }
  return list.sort((a, b) => b.score - a.score);
}

/** The players as a seat in a played-out match sees them: counts only, no known cards. */
export function plainPlayers(state) {
  return state.players.map((p) => ({ id: p.id, team: p.team, out: p.out, count: p.hand.length, known: null }));
}

/** How the cards still out stand for `seat` in a played-out match: all but its hand, the dead pile and the stack. */
export function simCounter(state, seat) {
  const copies = state.table.handSize === 7 ? 2 : 1;
  const counts = SUITS.map(() => new Array(RANK_COUNT).fill(copies));
  let gray = 1;
  let color = 1;
  const drop = (c) => {
    if (isJoker(c)) {
      if (c.joker === "gray") gray = 0;
      else color = 0;
    } else counts[SUIT_INDEX[c.suit]][c.rankValue]--;
  };
  for (const c of state.players[seat].hand) drop(c);
  for (const c of state.deadPile) drop(c);
  if (state.stack) for (const layer of state.stack.layers) for (const c of layer) drop(c);
  return fromCounts(counts, gray, color, state.trumpSuit);
}

/** The move a seat plays in a match HARD plays out: MEDIUM's judgement on what that seat could see. */
export function simMove(state, seat, w = WEIGHTS) {
  const sit = situation(state, seat, plainPlayers(state), simCounter(state, seat));
  return scoredMoves(state, seat, sit, w)[0].move;
}
