// THIRTEEN CPU — CARDS AS NUMBERS, COMBINATIONS AND HAND PLANS
//
// The CPU thinks in small integers: a card is rankValue * 4 + suitValue, so
// 3♦ is 0 and 2♠ is 51, and a bigger number is a stronger single. Every
// combination gets a `power`: of two combinations with the same number of
// cards, the one with more power beats the other, exactly as the rulebook's
// handEvaluator has it (tests/unit/aiCombos.test.js holds the two together).
//
// A plan splits a hand into the plays it will be shed as. makePlanner finds
// the best split for a given weight per play (fewer, stronger plays are
// better); greedyPlan is a quick one for the simulated players in aiSearch.

import { COMBO_TYPES } from "./constants.js";

const T = COMBO_TYPES;

export const cardInt = (card) => card.rankValue * 4 + card.suitValue;
export const rankOf = (v) => v >> 2;
export const suitOf = (v) => v & 3;
export const TWO = 12; // rank of the 2s
export const ACE = 11;

const asc = (a, b) => a - b;
const SETS = [null, T.SINGLE, T.PAIR, T.TRIPLE, T.FOUR_OF_A_KIND];
// A-2-3-4-5 and 2-3-4-5-6 wrap around and are topped by their 5 and 6.
const WRAPS = [
  [ACE, TWO, 0, 1, 2],
  [TWO, 0, 1, 2, 3],
];
const RUNS = [...WRAPS, ...Array.from({ length: 9 }, (_, i) => [i, i + 1, i + 2, i + 3, i + 4])];

/** The combination these cards (ascending) make, or null. */
export function classify(cards) {
  const n = cards.length;
  if (n >= 1 && n <= 4) {
    const r = rankOf(cards[0]);
    if (!cards.every((v) => rankOf(v) === r)) return null;
    return { cards, size: n, kind: SETS[n], power: cards[n - 1] };
  }
  if (n !== 5) return null;
  const hand = five(cards);
  return hand && { cards, size: 5, kind: hand.kind, power: hand.power };
}

// 5-card hands rank by kind first (straight < flush < full house < poker <
// straight flush < royal flush), then as handEvaluator's compare5CardHands.
function five(cards) {
  const ranks = cards.map(rankOf);
  const flush = cards.every((v) => suitOf(v) === suitOf(cards[0]));
  let top = -1;
  if (ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1)) top = cards[4];
  else {
    const w = WRAPS.findIndex((run) => run.every((r) => ranks.includes(r)));
    if (w >= 0) top = cards[ranks.indexOf(w === 0 ? 2 : 3)];
  }
  if (top >= 0 && flush) {
    return rankOf(top) === ACE ? { kind: T.ROYAL_FLUSH, power: 5000 + top } : { kind: T.STRAIGHT_FLUSH, power: 4000 + top };
  }
  const runs = [];
  for (let i = 0; i < 5; i++) {
    if (i > 0 && ranks[i] === ranks[i - 1]) runs[runs.length - 1].n++;
    else runs.push({ r: ranks[i], n: 1 });
  }
  const four = runs.find((g) => g.n === 4);
  if (four) return { kind: T.POKER, power: 3000 + four.r };
  if (runs.length === 2) {
    const three = runs.find((g) => g.n === 3);
    const two = runs.find((g) => g.n === 2);
    return { kind: T.FULL_HOUSE, power: 2000 + three.r * 13 + two.r };
  }
  if (flush) return { kind: T.FLUSH, power: 1000 + suitOf(cards[0]) * 13 + ranks[4] };
  if (top >= 0) return { kind: T.STRAIGHT, power: top };
  return null;
}

/** Every k-card subset of `items`, in order. */
function subsets(items, k, out = [], start = 0, pick = []) {
  if (pick.length === k) {
    out.push([...pick]);
    return out;
  }
  for (let i = start; i <= items.length - (k - pick.length); i++) {
    pick.push(items[i]);
    subsets(items, k, out, i + 1, pick);
    pick.pop();
  }
  return out;
}

/**
 * Every combination the hand (ascending, at most 31 cards) can make, each
 * with a `mask` of the hand positions it uses. `full: false` keeps the
 * 5-card hands down to the useful few (lowest cards, each possible top
 * card), for speed.
 */
export function combosOf(hand, { full = true } = {}) {
  const byRank = Array.from({ length: 13 }, () => []);
  const bySuit = [[], [], [], []];
  hand.forEach((v, i) => {
    byRank[rankOf(v)].push(i);
    bySuit[suitOf(v)].push(i);
  });
  const out = [];
  const seen = new Set();
  const add = (idx) => {
    let mask = 0;
    for (const i of idx) mask |= 1 << i;
    if (seen.has(mask)) return;
    seen.add(mask);
    const c = classify([...idx].sort(asc).map((i) => hand[i]));
    if (c) out.push({ ...c, mask });
  };

  for (const group of byRank) {
    for (let k = 1; k <= group.length; k++) subsets(group, k).forEach(add);
  }
  if (hand.length < 5) return out;

  for (const run of RUNS) {
    const choices = run.map((r) => byRank[r]);
    if (choices.some((c) => !c.length)) continue;
    if (full) {
      const walk = (i, pick) => {
        if (i === 5) return add(pick);
        for (const c of choices[i]) walk(i + 1, [...pick, c]);
      };
      walk(0, []);
    } else {
      const low = choices.map((c) => c[0]);
      add(low);
      // Each top card over the lowest of the rest, to beat a straight of the same height.
      for (const c of choices[4].slice(1)) add([...low.slice(0, 4), c]);
      for (let s = 0; s < 4; s++) {
        const flush = run.map((r) => byRank[r].find((i) => suitOf(hand[i]) === s));
        if (flush.every((i) => i !== undefined)) add(flush);
      }
    }
  }
  for (const suit of bySuit) {
    if (suit.length < 5) continue;
    if (full && suit.length <= 9) subsets(suit, 5).forEach(add);
    else {
      add(suit.slice(0, 5));
      for (const c of suit.slice(5)) add([...suit.slice(0, 4), c]);
    }
  }
  const triples = [];
  const pairs = [];
  byRank.forEach((group, r) => {
    if (group.length >= 3) (full ? subsets(group, 3) : [group.slice(0, 3)]).forEach((t) => triples.push({ r, t }));
    if (group.length >= 2) (full ? subsets(group, 2) : [group.slice(0, 2)]).forEach((p) => pairs.push({ r, p }));
  });
  for (const { r, t } of triples) for (const { r: pr, p } of pairs) if (pr !== r) add([...t, ...p]);
  byRank.forEach((group) => {
    if (group.length !== 4) return;
    const rest = hand.map((_, i) => i).filter((i) => !group.includes(i));
    for (const i of full ? rest : rest.slice(0, 1)) add([...group, i]);
  });
  return out;
}

/** The combinations in `hand` that beat `table`, weakest first. */
export function beatingCombos(hand, table, opts) {
  return combosOf(hand, opts)
    .filter((c) => c.size === table.size && c.power > table.power)
    .sort((a, b) => a.power - b.power);
}

/**
 * The best way to split the hand into plays, for `weight` per play (lower is
 * better). value(mask) and plays(mask) answer for any part of the hand (a
 * mask of positions), so "what's left if I play this" is a lookup.
 */
export function makePlanner(hand, combos, weight) {
  const n = hand.length;
  const all = (1 << n) - 1;
  const w = combos.map(weight);
  const byLow = Array.from({ length: n }, () => []);
  combos.forEach((c, k) => byLow[31 - Math.clz32(c.mask & -c.mask)].push(k));
  const best = new Float64Array(1 << n).fill(NaN);
  const pick = new Int32Array(1 << n);
  best[0] = 0;
  // Every split covers the lowest card left with one of the plays holding it.
  const solve = (mask) => {
    if (!Number.isNaN(best[mask])) return best[mask];
    const low = 31 - Math.clz32(mask & -mask);
    let b = Infinity;
    let bk = -1;
    for (const k of byLow[low]) {
      const m = combos[k].mask;
      if ((m & mask) !== m) continue;
      const v = w[k] + solve(mask ^ m);
      if (v < b) {
        b = v;
        bk = k;
      }
    }
    best[mask] = b;
    pick[mask] = bk;
    return b;
  };
  return {
    all,
    weight: (c) => w[combos.indexOf(c)],
    value: (mask = all) => solve(mask),
    plays: (mask = all) => {
      const out = [];
      while (mask) {
        solve(mask);
        const c = combos[pick[mask]];
        out.push(c);
        mask ^= c.mask;
      }
      return out;
    },
  };
}

/**
 * A quick plan, two ways: sets of a rank first (fours, triples, pairs) and
 * then a straight and a flush from what's left, or the straight and flush
 * first and then the sets. It keeps whichever leaves fewer plays (fewer
 * singles on a tie). Plays come back lowest first.
 */
export function greedyPlan(hand) {
  const a = greedy(hand, false);
  if (hand.length < 5) return a;
  const b = greedy(hand, true);
  const singles = (p) => p.filter((c) => c.size === 1).length;
  return b.length < a.length || (b.length === a.length && singles(b) < singles(a)) ? b : a;
}

function greedy(hand, fivesFirst) {
  const plays = [];
  let rest = hand;
  const take = (cards) => {
    plays.push(classify(cards));
    rest = rest.filter((v) => !cards.includes(v));
  };
  const fives = () => {
    for (const run of RUNS) {
      if (rest.length < 5) return;
      const pick = run.map((r) => rest.find((v) => rankOf(v) === r));
      if (pick.every((v) => v !== undefined)) take([...pick].sort(asc));
    }
    for (let s = 0; s < 4 && rest.length >= 5; s++) {
      const suit = rest.filter((v) => suitOf(v) === s);
      if (suit.length >= 5) take(suit.slice(0, 5));
    }
  };
  const sets = () => {
    const left = [];
    for (let i = 0; i < rest.length; ) {
      let j = i;
      while (j < rest.length && rankOf(rest[j]) === rankOf(rest[i])) j++;
      if (j - i >= 2) plays.push(classify(rest.slice(i, j)));
      else left.push(rest[i]);
      i = j;
    }
    rest = left;
  };
  if (fivesFirst) {
    fives();
    sets();
  } else {
    sets();
    fives();
  }
  for (const v of rest) plays.push(classify([v]));
  return plays.sort((x, y) => x.cards[0] - y.cards[0]);
}
