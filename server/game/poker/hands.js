// POKER HANDS — the cards, and the best five-card hand in any 1–7 of them.
//
// evaluate() reads ranks and suits directly (no trying every 5-card subset),
// so it is fast enough for the HARD CPU's simulations. Its `score` is one
// number: a higher score is a better hand, an equal score a split.

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUITS = ["♠", "♥", "♦", "♣"];

/** value: 2–14 (ace high). */
export function makeCard(rank, suit) {
  return { id: `${rank}${suit}`, rank, suit, value: RANKS.indexOf(rank) + 2 };
}

export function createDeck() {
  return SUITS.flatMap((suit) => RANKS.map((rank) => makeCard(rank, suit)));
}

export const CATEGORIES = [
  "HIGH CARD",
  "PAIR",
  "TWO PAIR",
  "THREE OF A KIND",
  "STRAIGHT",
  "FLUSH",
  "FULL HOUSE",
  "FOUR OF A KIND",
  "STRAIGHT FLUSH",
];

const WORD = { 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "jack", 12: "queen", 13: "king", 14: "ace" };
const plural = (v) => (v === 6 ? "sixes" : `${WORD[v]}s`);

/** The high card of the best straight in `values` (distinct, high first), or 0. A-2-3-4-5 is 5 high. */
function straightHigh(values) {
  const vs = values.includes(14) ? [...values, 1] : values;
  let run = 1;
  for (let i = 1; i < vs.length; i++) {
    run = vs[i] === vs[i - 1] - 1 ? run + 1 : 1;
    if (run === 5) return vs[i] + 4;
  }
  return 0;
}

const byValueDesc = (a, b) => b.value - a.value;

/**
 * The best hand in `cards` (1–7 cards):
 * { score, category (0–8), label ("FLUSH"), name ("Flush, ace high"), cards: the 5 (or fewer) that make it }.
 */
export function evaluate(cards) {
  const sorted = [...cards].sort(byValueDesc);
  const pick = (pool, value, n) => pool.filter((c) => c.value === value).slice(0, n);

  // Straight flush and flush.
  const bySuit = new Map();
  for (const c of sorted) bySuit.set(c.suit, [...(bySuit.get(c.suit) || []), c]);
  const flush = [...bySuit.values()].find((group) => group.length >= 5);
  if (flush) {
    const high = straightHigh(flush.map((c) => c.value));
    if (high) {
      const run = [high, high - 1, high - 2, high - 3, high - 4].map((v) => flush.find((c) => c.value === (v === 1 ? 14 : v)));
      return make(8, [high], run, high === 14 ? "Royal flush" : `Straight flush, ${WORD[high]} high`);
    }
  }

  // Groups of equal rank, biggest group first, then highest.
  const counts = new Map();
  for (const c of sorted) counts.set(c.value, (counts.get(c.value) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const kickers = (used, n) => sorted.filter((c) => !used.includes(c.value)).slice(0, n);

  const [top, second] = groups;
  if (top[1] === 4) {
    const k = kickers([top[0]], 1);
    return make(7, [top[0], ...k.map((c) => c.value)], [...pick(sorted, top[0], 4), ...k], `Four of a kind, ${plural(top[0])}`);
  }
  if (top[1] === 3 && second && second[1] >= 2) {
    return make(6, [top[0], second[0]], [...pick(sorted, top[0], 3), ...pick(sorted, second[0], 2)], `Full house, ${plural(top[0])} over ${plural(second[0])}`);
  }
  if (flush) {
    const five = flush.slice(0, 5);
    return make(5, five.map((c) => c.value), five, `Flush, ${WORD[five[0].value]} high`);
  }
  const distinct = [...counts.keys()].sort((a, b) => b - a);
  const high = straightHigh(distinct);
  if (high) {
    const run = [high, high - 1, high - 2, high - 3, high - 4].map((v) => sorted.find((c) => c.value === (v === 1 ? 14 : v)));
    return make(4, [high], run, `Straight, ${WORD[high]} high`);
  }
  if (top[1] === 3) {
    const k = kickers([top[0]], 2);
    return make(3, [top[0], ...k.map((c) => c.value)], [...pick(sorted, top[0], 3), ...k], `Three of a kind, ${plural(top[0])}`);
  }
  if (top[1] === 2 && second && second[1] === 2) {
    const k = kickers([top[0], second[0]], 1);
    return make(
      2,
      [top[0], second[0], ...k.map((c) => c.value)],
      [...pick(sorted, top[0], 2), ...pick(sorted, second[0], 2), ...k],
      `Two pair, ${plural(top[0])} and ${plural(second[0])}`,
    );
  }
  if (top[1] === 2) {
    const k = kickers([top[0]], 3);
    return make(1, [top[0], ...k.map((c) => c.value)], [...pick(sorted, top[0], 2), ...k], `Pair of ${plural(top[0])}`);
  }
  const five = sorted.slice(0, 5);
  return make(0, five.map((c) => c.value), five, `High card, ${WORD[five[0].value]}`);
}

// One comparable number: the category, then up to five tie-breaking values, base 15.
function make(category, tiebreak, best, name) {
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 15 + (tiebreak[i] || 0);
  return { score, category, label: category === 8 && tiebreak[0] === 14 ? "ROYAL FLUSH" : CATEGORIES[category], name, cards: best };
}
