// SHUFFLE CHECK — is every game's shuffle uniform? `npm run sim:shuffle`.
//
// Each game's own shuffle function runs on the real cryptographic generator
// (the one that deals online), and two chi-square goodness-of-fit tests ask
// whether what comes out could be uniform:
//   orders     a 4-card deck shuffled N times: each of the 4! = 24 orders
//              should come up N/24 times (23 degrees of freedom).
//   positions  the game's full deck shuffled M times: each card should land
//              in each position M/n times ((n−1)² degrees of freedom).
// A p-value is the chance a truly uniform shuffle would look at least this
// uneven; a fair shuffle gives p-values spread evenly between 0 and 1, and a
// biased one drives them to 0. As a control, the classic broken shuffle
// (swap each card with ANY position, not one at or before it) is run through
// the same test: it has n^n = 256 equally likely runs onto 24 orders, which
// can't divide evenly, and the test must catch it.

import { shuffleDeck, createDeck as thirteenDeck } from "../../src/utils/deckUtils.js";
import { shuffle as muushigShuffle, createDeck as muushigDeck } from "../../src/utils/muushig/engine.js";
import { shuffle as pokerShuffle } from "../../src/utils/poker/engine.js";
import { createDeck as pokerDeck } from "../../src/utils/poker/hands.js";
import { shuffle as blackjackShuffle, createShoe } from "../../src/utils/blackjack/rules.js";
import { shuffle as khuzurShuffle, createDeck as khuzurDeck } from "../../src/utils/khuzur/cards.js";
import { secureRandom } from "../../src/utils/deckUtils.js";

const scaleAt = process.argv.indexOf("--scale");
const SCALE = scaleAt >= 0 ? Number(process.argv[scaleAt + 1]) : 1;

// ---- chi-square p-values ------------------------------------------------------

/** Φ(z), the standard normal CDF (Abramowitz & Stegun 26.2.17, error < 7.5e-8). */
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}
/** P(χ²_k ≥ x), by the Wilson–Hilferty cube-root normal approximation. */
function chiSquareP(x, k) {
  const z = (Math.cbrt(x / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
  return 1 - phi(z);
}
function chiSquare(counts, expected) {
  let x = 0;
  for (const c of counts) x += (c - expected) ** 2 / expected;
  return x;
}

// ---- the tests ---------------------------------------------------------------

const FACT4 = 24;
function ordersTest(shuffle, n) {
  const index = new Map();
  const counts = new Array(FACT4).fill(0);
  for (let i = 0; i < n; i++) {
    const key = shuffle(["a", "b", "c", "d"]).join("");
    if (!index.has(key)) index.set(key, index.size);
    counts[index.get(key)]++;
  }
  const x = chiSquare(counts, n / FACT4);
  return { seen: index.size, x, df: FACT4 - 1, p: chiSquareP(x, FACT4 - 1), min: Math.min(...counts), max: Math.max(...counts) };
}

function positionsTest(shuffle, deck, m) {
  const n = deck.length;
  const at = new Map(deck.map((c, i) => [c, i]));
  const counts = new Uint32Array(n * n);
  for (let k = 0; k < m; k++) {
    const out = shuffle(deck);
    for (let pos = 0; pos < n; pos++) counts[at.get(out[pos]) * n + pos]++;
  }
  const x = chiSquare(counts, m / n);
  const df = (n - 1) * (n - 1);
  return { n, x, df, p: chiSquareP(x, df) };
}

/** The classic mistake: swap each card with a card anywhere in the deck. */
function naiveShuffle(cards, rng = secureRandom) {
  const out = [...cards];
  for (let i = 0; i < out.length; i++) {
    const j = Math.floor(rng() * out.length);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---- run -----------------------------------------------------------------------

const ORDERS = Math.round(2_400_000 * SCALE);
const POSITIONS = Math.round(60_000 * SCALE);
const cards = (deck) => deck.map((_, i) => i); // positions only care about identity
const GAMES = [
  ["Thirteen", (d) => shuffleDeck(d), thirteenDeck()],
  ["Muushig", (d) => muushigShuffle(d), muushigDeck()],
  ["Poker", (d) => pokerShuffle(d), pokerDeck()],
  ["Khuzur 5-card", (d) => khuzurShuffle(d), khuzurDeck(5)],
  ["Khuzur 7-card", (d) => khuzurShuffle(d), khuzurDeck(7)],
  ["Blackjack shoe", (d) => blackjackShuffle(d), createShoe()],
];

const t0 = Date.now();
const fmt = (p) => (p < 1e-6 ? "< 0.000001" : p.toFixed(3));
for (const [name, shuffle, deck] of GAMES) {
  const o = ordersTest(shuffle, ORDERS);
  const pos = positionsTest(shuffle, cards(deck), deck.length > 100 ? Math.round(POSITIONS / 3) : POSITIONS);
  console.log(
    `${name.padEnd(15)} orders: ${o.seen}/24 seen, χ²=${o.x.toFixed(1)} (df ${o.df}) p=${fmt(o.p)} | positions (${pos.n} cards): χ²=${pos.x.toFixed(0)} (df ${pos.df}) p=${fmt(pos.p)}`,
  );
}
const bad = ordersTest((d) => naiveShuffle(d), ORDERS);
console.log(`${"Naive (control)".padEnd(15)} orders: χ²=${bad.x.toFixed(0)} (df ${bad.df}) p=${fmt(bad.p)}, commonest order ${bad.max} vs rarest ${bad.min} (expected ${ORDERS / 24} each)`);
console.log(`${ORDERS.toLocaleString()} shuffles of 4 cards and ${POSITIONS.toLocaleString()} full decks per game, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
