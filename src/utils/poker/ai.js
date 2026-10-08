// POKER CPU — picks a CPU seat's move from what that seat can see: a view
// from viewFor(state, seat), never the full state, so it can't peek.
//
//   EASY    plays most hands, calls too much, rarely raises
//   MEDIUM  starting-hand charts by position before the flop; after it, bets
//           and calls by made-hand strength against the price of calling
//   HARD    MEDIUM's charts, then its chance of winning from a few hundred
//           simulated run-outs, sized bets, and the occasional bluff
//
// chooseAction() only returns moves legalActions() allows.

import { createDeck, evaluate } from "./hands.js";
import { MAX_SEATS, potSize } from "./engine.js";

export const LEVELS = ["EASY", "MEDIUM", "HARD"];
export const EQUITY_SAMPLES = 300;

/** The Chen formula: a two-card starting hand's strength, about -1 (7-2) to 20 (A-A). */
export function chenScore([a, b]) {
  const hi = Math.max(a.value, b.value);
  const lo = Math.min(a.value, b.value);
  const base = { 14: 10, 13: 8, 12: 7, 11: 6 }[hi] ?? hi / 2;
  if (hi === lo) return Math.ceil(Math.max(5, base * 2));
  let score = base;
  if (a.suit === b.suit) score += 2;
  const gap = hi - lo - 1;
  score -= [0, 1, 2, 4][gap] ?? 5;
  if (gap <= 1 && hi < 12) score += 1;
  return Math.ceil(score);
}

/** "early" | "middle" | "late" | "blind": where `seat` acts preflop. */
export function position(view, seat) {
  const inHand = Array.from({ length: MAX_SEATS }, (_, k) => (view.button + 1 + k) % MAX_SEATS).filter((i) => view.seats[i]?.inHand);
  const at = inHand.indexOf(seat); // 0 small blind, 1 big blind (heads-up: 0 is the big blind)
  if (inHand.length > 2 && at < 2) return "blind";
  if (inHand.length === 2) return at === 0 ? "blind" : "late";
  const fromEnd = inHand.length - 1 - at; // 0 = the button
  if (fromEnd <= 1) return "late";
  return fromEnd <= 2 ? "middle" : "early";
}

const OPEN = { early: 9, middle: 8, late: 7, blind: 8 }; // raise first in with at least this
const LIMP = { early: 9, middle: 8, late: 6, blind: 5 }; // call the big blind with at least this

/** The hand's strength after the flop, 0–1, from what it makes and draws to. */
export function madeStrength(hole, board) {
  const all = evaluate([...hole, ...board]);
  const onBoard = evaluate(board);
  if (all.category >= 4 && all.category > onBoard.category) return 0.9;
  if (all.category >= 2 && all.category > onBoard.category) return 0.8;
  if (all.category === 1 && onBoard.category === 0) {
    const pair = all.cards[0].value;
    return pair >= Math.max(...board.map((c) => c.value)) ? 0.65 : 0.45;
  }
  const cards = [...hole, ...board];
  const flushDraw = ["♠", "♥", "♦", "♣"].some((s) => cards.filter((c) => c.suit === s).length === 4 && hole.some((c) => c.suit === s));
  const values = new Set(cards.map((c) => c.value));
  // Four in a row with room at both ends (not up against the ace).
  const openEnded = [...values].some((v) => v >= 2 && v + 3 <= 13 && [1, 2, 3].every((k) => values.has(v + k)));
  if (board.length < 5 && (flushDraw || openEnded)) return 0.38;
  return hole.some((c) => c.value === 14) ? 0.2 : 0.15;
}

/** Chance (0–1, ties count half) that `hole` beats `opponents` random hands once the board is complete. */
export function equity(hole, board, opponents, samples, rng) {
  const known = new Set([...hole, ...board].map((c) => c.id));
  const rest = createDeck().filter((c) => !known.has(c.id));
  let total = 0;
  for (let n = 0; n < samples; n++) {
    // A partial shuffle: only the cards this run-out needs.
    const need = opponents * 2 + (5 - board.length);
    const deck = [...rest];
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const full = [...board, ...deck.slice(opponents * 2, need)];
    const mine = evaluate([...hole, ...full]).score;
    let best = 0;
    for (let o = 0; o < opponents; o++) best = Math.max(best, evaluate([deck[2 * o], deck[2 * o + 1], ...full]).score);
    total += mine > best ? 1 : mine === best ? 0.5 : 0;
  }
  return total / samples;
}

/** A bet or raise of `by` over the current bet, kept within what's legal. */
function raise(view, by) {
  const { legal } = view;
  if (!legal.canRaise) return legal.canCheck ? { type: "check" } : { type: "call" };
  const to = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(view.currentBet + by)));
  return to >= legal.maxRaiseTo ? { type: "allin" } : { type: "raise", amount: to };
}

const checkOrFold = (legal) => (legal.canCheck ? { type: "check" } : { type: "fold" });
const callOrCheck = (legal) => (legal.canCheck ? { type: "check" } : { type: "call" });

function preflop(view, seat, level, rng) {
  const { legal, bigBlind } = view;
  const me = view.seats[seat];
  const score = chenScore(me.hole);
  const facingRaise = view.currentBet > bigBlind;
  if (level === "EASY") {
    if (score >= 12 && rng() < 0.5) return raise(view, bigBlind * 2);
    if (score >= 5 || rng() < 0.15) return legal.toCall <= me.stack * 0.3 ? callOrCheck(legal) : checkOrFold(legal);
    return checkOrFold(legal);
  }
  const pos = position(view, seat);
  if (facingRaise) {
    if (score >= 12) return raise(view, view.currentBet * 2);
    if (score >= 9 || (score >= 8 && legal.toCall <= bigBlind * 4)) return callOrCheck(legal);
    return checkOrFold(legal);
  }
  if (score >= OPEN[pos]) return raise(view, bigBlind * 2);
  if (score >= LIMP[pos]) return callOrCheck(legal);
  return checkOrFold(legal);
}

function postflop(view, seat, strength, level, rng) {
  const { legal } = view;
  const me = view.seats[seat];
  const pot = potSize(view);
  const strong = level === "EASY" ? 0.85 : 0.72;
  if (strength >= strong) return raise(view, Math.round(pot * (level === "HARD" ? 0.5 + strength / 2 : 0.66)));
  if (legal.canCheck) {
    if (level === "HARD" && rng() < 0.15) return raise(view, Math.round(pot * 0.5)); // a bluff
    if (level !== "EASY" && strength >= 0.55) return raise(view, Math.round(pot * 0.5));
    return { type: "check" };
  }
  if (level === "EASY") return legal.toCall <= me.stack * 0.2 || strength > 0.4 ? { type: "call" } : { type: "fold" };
  const price = legal.toCall / (pot + legal.toCall);
  return strength > price + 0.05 ? { type: "call" } : { type: "fold" };
}

/** The move `seat` makes at `level`, from its own `view` (viewFor(state, seat)). */
export function chooseAction(view, seat, level = "MEDIUM", rng = Math.random) {
  if (!view.legal) throw new Error("Not this seat's turn");
  if (view.street === "PREFLOP") return preflop(view, seat, level, rng);
  const me = view.seats[seat];
  const opponents = view.seats.filter((p, i) => i !== seat && p?.inHand && !p.folded).length;
  let strength = level === "HARD" ? equity(me.hole, view.board, opponents, EQUITY_SAMPLES, rng) : madeStrength(me.hole, view.board);
  if (level === "EASY") strength = Math.min(1, Math.max(0, strength + (rng() - 0.5) * 0.3));
  return postflop(view, seat, strength, level, rng);
}
