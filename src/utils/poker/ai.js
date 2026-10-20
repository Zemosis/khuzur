// POKER CPU — picks a CPU seat's move from what that seat can see: a view
// from viewFor(state, seat), never the full state, so it can't peek.
//
//   EASY    a beginner: plays too many hands, calls with any pair or draw,
//           raises only with a big hand and never bluffs.
//   MEDIUM  a solid regular: starting-hand charts by position that respect
//           the size of a raise, then its chance of winning against random
//           hands, shaded down when someone bets into it, against the price
//           of calling. Bets its good hands, and follows up a preflop raise
//           with a bet on the flop now and then.
//   HARD    reads hands: every opponent's raises, calls and checks this hand
//           make some holdings likelier than others, judged by how that
//           player has played at the table so far (a raise from someone who
//           raises everything says little), and it deals their hands that
//           way in a few hundred simulated run-outs. It sizes its bets by
//           strength, slows down a monster now and then, bluffs and
//           semi-bluffs where a bluff works (few opponents, a draw, the
//           last to raise, players who fold), steals the blinds late, and
//           plays push-or-fold when its stack is short.
//
// chooseAction() only returns moves legalActions() allows. The table keeps
// its reads on the players with updateReads() and passes them in.

import { createDeck, evaluate } from "./hands.js";
import { MAX_SEATS, potSize } from "./engine.js";

export const LEVELS = ["EASY", "MEDIUM", "HARD"];
const SAMPLES = { MEDIUM: 150, HARD: 400 }; // simulated run-outs per decision

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

// ---- Reading a hand ------------------------------------------------------------

const SUIT_LIST = ["♠", "♥", "♦", "♣"];

/** Draws in `cards` that use a hole card: { flush, openEnded, gutshot }. */
function draws(hole, board) {
  const cards = [...hole, ...board];
  const flush = SUIT_LIST.some((s) => cards.filter((c) => c.suit === s).length === 4 && hole.some((c) => c.suit === s));
  const values = new Set(cards.map((c) => c.value));
  if (values.has(14)) values.add(1);
  const holeValues = new Set(hole.flatMap((c) => (c.value === 14 ? [14, 1] : [c.value])));
  let openEnded = false;
  let gutshot = false;
  // Every five-wide window: four of it held (with a hole card among them) is a draw.
  for (let lo = 1; lo <= 10; lo++) {
    const window = [0, 1, 2, 3, 4].map((k) => lo + k);
    const held = window.filter((v) => values.has(v));
    if (held.length !== 4 || !held.some((v) => holeValues.has(v))) continue;
    const missing = window.find((v) => !values.has(v));
    // Missing an end card, with room past the other end: open-ended.
    if ((missing === lo && lo + 5 <= 14) || (missing === lo + 4 && lo >= 2)) openEnded = true;
    else gutshot = true;
  }
  return { flush, openEnded, gutshot };
}

/**
 * The hand's strength after the flop, 0–1, from what the hole cards make
 * beyond the board and what they draw to: about its chance against one
 * random hand.
 */
export function madeStrength(hole, board, onBoard = evaluate(board)) {
  const all = evaluate([...hole, ...board]);
  const top = Math.max(...board.map((c) => c.value));
  const d = board.length < 5 ? draws(hole, board) : { flush: false, openEnded: false, gutshot: false };
  const drawing = d.flush || d.openEnded;
  let made;
  if (all.category > onBoard.category) {
    if (all.category >= 4) made = 0.9;
    else if (all.category === 3) made = 0.85;
    else if (all.category === 2) made = onBoard.category === 0 ? 0.8 : 0.6; // two pair with both hole cards, or over the board's pair
    else {
      const pair = all.cards[0].value;
      const kicker = hole.find((c) => c.value !== pair)?.value ?? 0;
      if (hole[0].value === hole[1].value && pair > top) made = 0.75; // an overpair
      else if (pair >= top) made = kicker >= 11 || hole[0].value === hole[1].value ? 0.65 : 0.58;
      else made = pair >= [...board].sort((a, b) => b.value - a.value)[1]?.value ? 0.45 : 0.35;
    }
    return Math.min(0.95, made + (drawing ? 0.08 : 0));
  }
  if (drawing) return d.flush && d.openEnded ? 0.5 : 0.38;
  if (d.gutshot) return 0.25;
  const overcards = hole.filter((c) => c.value > top).length;
  if (overcards === 2) return 0.25;
  return hole.some((c) => c.value === 14) ? 0.2 : 0.12;
}

/** Chance (0–1, ties count half) that `hole` beats `opponents` random hands once the board is complete. */
export function equity(hole, board, opponents, samples, rng) {
  return rangeEquity(hole, board, Array(opponents).fill(null), samples, rng);
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * This hand's moves in order, each as { seat, street, action, raises, board,
 * facing }: an all-in counts as a "raise" when it put the bet up and a "call"
 * when it didn't, `raises` is how many preflop raises came before it, `board`
 * the cards out then, and `facing` whether it answered a bet after the flop.
 */
function replay(view) {
  const out = [];
  let board = [];
  let raises = 0;
  let bet = view.bigBlind;
  for (const e of view.events) {
    if (e.type === "street") {
      board = [...board, ...e.cards];
      bet = 0;
    }
    if (e.type !== "act") continue;
    const up = (e.action === "bet" || e.action === "raise" || e.action === "allin") && e.amount > bet;
    const action = up ? "raise" : e.action === "allin" ? "call" : e.action;
    out.push({ seat: e.seat, street: e.street, action, raises, board, facing: e.street !== "PREFLOP" && bet > 0 });
    if (up) {
      bet = e.amount;
      if (e.street === "PREFLOP") raises++;
    }
  }
  return out;
}

/** Every live opponent's moves this hand, by seat, for reading their range. */
function readActions(view, seat) {
  const out = new Map();
  view.seats.forEach((p, i) => {
    if (i !== seat && p?.inHand && !p.folded) out.set(i, []);
  });
  for (const m of replay(view)) out.get(m.seat)?.push(m);
  return out;
}

// ---- What the table has seen -----------------------------------------------------

/**
 * Reads on the players at a table, one per seat (null for an empty one): of
 * the hands they were dealt, how many they put chips into preflop (vpip) and
 * raised preflop (pfr); after the flop how often they bet or raised (bets)
 * against called (calls), and of the bets they faced (faced) how many they
 * folded to (folded). Everything here was public. PokerTable keeps
 * them hand to hand and hands them to chooseAction; a new player in a seat
 * starts a new read.
 */
export function updateReads(reads, state) {
  const moves = replay(state);
  return state.seats.map((p, i) => {
    if (!p) return null;
    const prev = reads[i]?.name === p.name ? reads[i] : { name: p.name, hands: 0, vpip: 0, pfr: 0, bets: 0, calls: 0, faced: 0, folded: 0 };
    if (!p.inHand) return prev;
    const mine = moves.filter((m) => m.seat === i);
    const pre = mine.filter((m) => m.street === "PREFLOP");
    const post = mine.filter((m) => m.street !== "PREFLOP");
    return {
      ...prev,
      hands: prev.hands + 1,
      vpip: prev.vpip + (pre.some((m) => m.action === "raise" || m.action === "call") ? 1 : 0),
      pfr: prev.pfr + (pre.some((m) => m.action === "raise") ? 1 : 0),
      bets: prev.bets + post.filter((m) => m.action === "raise").length,
      calls: prev.calls + post.filter((m) => m.action === "call").length,
      faced: prev.faced + post.filter((m) => m.facing).length,
      folded: prev.folded + post.filter((m) => m.facing && m.action === "fold").length,
    };
  });
}

// Every starting hand's Chen score, best first: the score at the top x% of hands.
const CHEN_RANKED = (() => {
  const deck = createDeck();
  const scores = [];
  for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) scores.push(chenScore([deck[i], deck[j]]));
  return scores.sort((a, b) => b - a);
})();
const chenAtTop = (share) => CHEN_RANKED[Math.min(CHEN_RANKED.length - 1, Math.floor(share * CHEN_RANKED.length))];

// A player the table has seen little of is read as a typical one, as if over this many hands.
const PRIOR = { hands: 12, vpip: 0.3, pfr: 0.15, aggression: 0.4, folds: 0.45 };

/**
 * How a player plays, from their read: the Chen score their raises, re-raises
 * and calls start at (a player who raises half their hands raises with half
 * of all hands), how much of their betting is bluff, and how often they fold
 * to a bet.
 */
function styleOf(read) {
  const blend = (count, of, prior) => ((count ?? 0) + prior * PRIOR.hands) / ((of ?? 0) + PRIOR.hands);
  const vpip = blend(read?.vpip, read?.hands, PRIOR.vpip);
  const pfr = blend(read?.pfr, read?.hands, PRIOR.pfr);
  const aggression = blend(read?.bets, (read?.bets ?? 0) + (read?.calls ?? 0), PRIOR.aggression);
  return {
    raiseAt: chenAtTop(pfr),
    reraiseAt: chenAtTop(pfr * 0.35),
    callAt: chenAtTop(vpip),
    bluffs: 0.08 + 0.8 * Math.max(0, aggression - PRIOR.aggression),
    folds: blend(read?.folded, read?.faced, PRIOR.folds),
  };
}

/**
 * How likely an opponent who did `moves` holds `hole`, up to a constant,
 * given how they play (`style`). A preflop raise asks for a good starting
 * hand (a re-raise for a better one), a call for a playable one; after the
 * flop a bet or raise asks for a made hand or a draw, a call for something,
 * and a check leans weak. Never zero: people bluff, some a lot.
 */
function rangeWeight(hole, { moves, style }, boardCache) {
  let w = 1;
  let chen = null;
  for (const m of moves) {
    if (m.street === "PREFLOP") {
      chen ??= chenScore(hole);
      if (m.action === "raise") w *= 0.01 + sigmoid(chen - (m.raises ? style.reraiseAt : style.raiseAt));
      else if (m.action === "call") w *= 0.04 + sigmoid((chen - style.callAt - (m.raises ? 2 : 0)) / 1.5);
      continue;
    }
    if (m.action === "fold") continue;
    const key = m.board.length;
    const onBoard = (boardCache[key] ??= evaluate(m.board));
    const s = madeStrength(hole, m.board, onBoard);
    if (m.action === "raise") w *= style.bluffs + s * s;
    else if (m.action === "call") w *= 0.25 + Math.min(1, s / 0.6);
    else if (m.action === "check") w *= 1 - 0.35 * s;
  }
  return w;
}

/** Each opponent in `seats` as a range: their moves this hand and how they play. */
function rangesOf(view, seat, seats, reads) {
  const actions = readActions(view, seat);
  return seats.map((i) => ({ moves: actions.get(i) ?? [], style: styleOf(reads[i]?.name === view.seats[i]?.name ? reads[i] : null) }));
}

// How far HARD trusts its read of a range: this share of each opponent's
// deals comes from the read, the rest are any hand at all. A full read folds
// too much to players who bet everything.
const TRUST = 0.85;

/** Every hand `range` could hold from `cards`, with its weight, as a running total to draw from. */
function weightedHands(cards, range, boardCache) {
  const hands = [];
  let total = 0;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      total += rangeWeight([cards[i], cards[j]], range, boardCache);
      hands.push({ cards: [cards[i], cards[j]], upTo: total });
    }
  }
  return { hands, total };
}

/** A hand drawn by weight that shares no card with `used`, or null after a few tries. */
function drawWeighted({ hands, total }, used, rng) {
  for (let tries = 0; tries < 12; tries++) {
    const r = rng() * total;
    let lo = 0;
    let hi = hands.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (hands[mid].upTo > r) hi = mid;
      else lo = mid + 1;
    }
    const pick = hands[lo].cards;
    if (!used.has(pick[0].id) && !used.has(pick[1].id)) return pick;
  }
  return null;
}

/** `n` cards from `cards` at random, none in `used` (which they join). */
function drawAny(cards, used, n, rng) {
  const out = [];
  while (out.length < n) {
    const c = cards[Math.floor(rng() * cards.length)];
    if (used.has(c.id)) continue;
    used.add(c.id);
    out.push(c);
  }
  return out;
}

/**
 * Chance (0–1, ties count half) that `hole` beats every opponent once the
 * board is complete. `ranges` has one entry per opponent: null for a random
 * hand, or { moves, style } (see rangesOf) to deal their hand from.
 */
export function rangeEquity(hole, board, ranges, samples, rng) {
  const known = new Set([...hole, ...board].map((c) => c.id));
  const rest = createDeck().filter((c) => !known.has(c.id));
  const boardCache = {};
  const tables = ranges.map((range) => range && weightedHands(rest, range, boardCache));
  let total = 0;
  for (let n = 0; n < samples; n++) {
    const used = new Set();
    const holes = tables.map((table) => {
      const read = table && rng() < TRUST ? drawWeighted(table, used, rng) : null;
      if (!read) return drawAny(rest, used, 2, rng);
      used.add(read[0].id).add(read[1].id);
      return read;
    });
    const full = [...board, ...drawAny(rest, used, 5 - board.length, rng)];
    const mine = evaluate([...hole, ...full]).score;
    let best = 0;
    for (const h of holes) best = Math.max(best, evaluate([...h, ...full]).score);
    total += mine > best ? 1 : mine === best ? 0.5 : 0;
  }
  return total / samples;
}

// ---- Moves -------------------------------------------------------------------

const checkOrFold = (legal) => (legal.canCheck ? { type: "check" } : { type: "fold" });
const callOrCheck = (legal) => (legal.canCheck ? { type: "check" } : { type: "call" });

/** Bet or raise so this street's bet becomes `to`, kept legal; most of the stack goes in whole. */
function betTo(view, seat, to) {
  const { legal } = view;
  if (!legal.canRaise) return callOrCheck(legal);
  const target = Math.max(legal.minRaiseTo, Math.round(to));
  const bet = view.seats[seat].bet;
  if (target >= legal.maxRaiseTo || target - bet >= (legal.maxRaiseTo - bet) * 0.7) return { type: "allin" };
  return { type: "raise", amount: target };
}

/** A bet of `fraction` of the pot, or a raise to `fraction` of the pot over a call. */
function potBet(view, seat, fraction) {
  const pot = potSize(view);
  if (view.legal.canCheck) return betTo(view, seat, pot * fraction);
  return betTo(view, seat, view.currentBet + (pot + view.legal.toCall) * fraction);
}

/** The table from `seat`'s side: what it costs, what's in, who's in. */
function situation(view, seat) {
  const me = view.seats[seat];
  const live = view.seats.flatMap((p, i) => (i !== seat && p?.inHand && !p.folded ? [i] : []));
  const pot = potSize(view);
  const { toCall } = view.legal;
  const deepest = Math.max(0, ...live.map((i) => view.seats[i].stack + view.seats[i].bet));
  const effective = Math.min(me.stack + me.bet, deepest); // the most this hand can cost
  const moves = replay(view);
  const pre = moves.filter((m) => m.street === "PREFLOP");
  const raisesPre = pre.filter((m) => m.action === "raise");
  // Acting last after the flop: furthest round from the button's left.
  const order = (i) => (i - view.button - 1 + MAX_SEATS) % MAX_SEATS;
  return {
    me,
    live,
    pot,
    toCall,
    odds: toCall > 0 ? toCall / (pot + toCall) : 0,
    bb: view.bigBlind,
    effectiveBB: effective / view.bigBlind,
    raisesPre: raisesPre.length,
    voluntary: pre.filter((m) => m.action === "raise" || m.action === "call").length,
    aggressor: raisesPre.at(-1)?.seat === seat,
    betsThisStreet: moves.filter((m) => m.street === view.street && m.seat !== seat && m.action === "raise").length,
    inPosition: live.every((i) => order(i) < order(seat)),
  };
}

// ---- Preflop -------------------------------------------------------------------

const OPEN = { early: 10, middle: 9, late: 7, blind: 8 }; // raise first in with at least this
const STEAL = 5.5; // HARD opens this light from late position when everyone has folded to it
const LIMP = { early: 10, middle: 9, late: 6, blind: 5 }; // MEDIUM calls the big blind with at least this
const SHOVE = { early: 7, middle: 6, late: 5, blind: 6 }; // push-or-fold at 12 big blinds or fewer: the top 18% of hands early, 43% late

/** Players who put chips in on purpose this hand, as ranges for rangeEquity (at least one). */
function preflopRanges(view, seat, ctx, reads) {
  const ranges = rangesOf(view, seat, ctx.live, reads);
  const acted = ranges.filter((r) => r.moves.some((m) => m.action === "raise" || m.action === "call"));
  return acted.length ? acted : ranges.slice(0, 1);
}

function easyPreflop(view, seat, rng) {
  const { legal } = view;
  const ctx = situation(view, seat);
  const score = chenScore(ctx.me.hole);
  if (score >= 12 && rng() < 0.6) return potBet(view, seat, 1);
  const cheap = legal.toCall <= ctx.me.stack * 0.1;
  if ((score >= 4 || rng() < 0.2) && cheap) return callOrCheck(legal);
  if (score >= 10 && legal.toCall <= ctx.me.stack * 0.5) return callOrCheck(legal);
  return checkOrFold(legal);
}

function mediumPreflop(view, seat) {
  const { legal } = view;
  const ctx = situation(view, seat);
  const score = chenScore(ctx.me.hole);
  const pos = position(view, seat);
  if (ctx.effectiveBB <= 12) return score >= SHOVE[pos] + 1 ? betTo(view, seat, Infinity) : checkOrFold(legal);
  if (!ctx.raisesPre) {
    if (score >= OPEN[pos]) return betTo(view, seat, ctx.bb * (3 + ctx.voluntary));
    if (score >= LIMP[pos]) return callOrCheck(legal);
    return checkOrFold(legal);
  }
  // Facing a raise: the bigger it is, against the stack, the better the hand it takes.
  const share = legal.toCall / (ctx.me.stack + ctx.me.bet);
  if (score >= 14 || (score >= 12 && share < 0.25)) return betTo(view, seat, view.currentBet * 3);
  if (share > 0.3) return score >= 12 ? callOrCheck(legal) : checkOrFold(legal);
  const sizeBB = legal.toCall / ctx.bb;
  return score >= 8 + Math.min(4, sizeBB / 3) ? callOrCheck(legal) : checkOrFold(legal);
}

function hardPreflop(view, seat, rng, reads) {
  const { legal } = view;
  const ctx = situation(view, seat);
  const hole = ctx.me.hole;
  const score = chenScore(hole);
  const pos = position(view, seat);
  const suited = hole[0].suit === hole[1].suit;
  const pair = hole[0].value === hole[1].value;

  if (!ctx.raisesPre) {
    // Push or fold when short: no room to raise and fold.
    if (ctx.effectiveBB <= 12) return score >= SHOVE[pos] ? betTo(view, seat, Infinity) : checkOrFold(legal);
    const foldedToMe = ctx.voluntary === 0;
    const open = foldedToMe && pos === "late" ? STEAL : OPEN[pos];
    if (score >= open) return betTo(view, seat, ctx.bb * (2.5 + ctx.voluntary));
    // Small blind completing, or a cheap look with a hand that flops big.
    if (legal.canCheck) return { type: "check" };
    if (legal.toCall <= ctx.bb && (pair || suited) && score >= 5 && ctx.effectiveBB >= 40) return { type: "call" };
    return checkOrFold(legal);
  }

  const eq = rangeEquity(hole, [], preflopRanges(view, seat, ctx, reads), SAMPLES.HARD, rng);
  // Out of position, or behind with a weak hand, a share of that equity never gets to showdown.
  const realised = eq * (ctx.inPosition ? 0.95 : 0.85);
  const deep = ctx.effectiveBB >= 40 && legal.toCall <= ctx.effectiveBB * ctx.bb * 0.08;
  const implied = deep && (pair || (suited && score >= 6)) ? 0.06 : 0;
  if (eq >= 0.6 || (eq >= 0.55 && ctx.raisesPre === 1 && rng() < 0.5)) return betTo(view, seat, view.currentBet * 3);
  if (realised + implied >= ctx.odds) return callOrCheck(legal);
  // Now and then a re-raise with a hand that does well when called: a suited ace or connector.
  if (ctx.raisesPre === 1 && suited && score >= 6 && ctx.effectiveBB >= 30 && rng() < 0.12) return betTo(view, seat, view.currentBet * 3);
  return checkOrFold(legal);
}

// ---- After the flop ------------------------------------------------------------

function easyPostflop(view, seat, rng) {
  const { legal } = view;
  const ctx = situation(view, seat);
  const s = Math.min(1, Math.max(0, madeStrength(ctx.me.hole, view.board) + (rng() - 0.5) * 0.2));
  if (legal.canCheck) return s >= 0.8 ? potBet(view, seat, 0.5) : { type: "check" };
  if (s >= 0.88) return potBet(view, seat, 0.75);
  if (s >= 0.6 || (s >= 0.35 && legal.toCall <= ctx.me.stack * 0.35)) return { type: "call" };
  return { type: "fold" };
}

/**
 * MEDIUM and HARD share the frame: `eq` is the chance of winning at showdown,
 * against the price of calling; HARD also bluffs, semi-bluffs and slow-plays.
 * `folds`: how often the likeliest caller folds to a bet. HARD bluffs less
 * into players who never fold, and bets thinner for value against them.
 */
function postflopByEquity(view, seat, eq, hard, rng, folds = PRIOR.folds) {
  const { legal } = view;
  const ctx = situation(view, seat);
  const river = view.street === "RIVER";
  const d = river ? { flush: false, openEnded: false } : draws(ctx.me.hole, view.board);
  const drawing = d.flush || d.openEnded;
  const fewOpponents = ctx.live.length <= (hard ? 2 : 1);
  const stackLeft = ctx.me.stack;
  const bluffing = Math.min(1.5, folds / PRIOR.folds); // how much bluffing pays here, against a typical table

  if (legal.canCheck) {
    if (eq >= (hard && folds < 0.25 ? 0.52 : 0.62)) {
      // A monster can let the others bet into it, while there's a street to come.
      if (hard && eq >= 0.85 && !river && rng() < 0.2) return { type: "check" };
      return potBet(view, seat, eq >= 0.8 ? 0.75 : 0.6);
    }
    if (!hard && eq >= 0.55) return potBet(view, seat, 0.5);
    if (fewOpponents && ctx.aggressor && view.street === "FLOP" && rng() < (hard ? 0.6 * bluffing : 0.35)) return potBet(view, seat, 0.5); // the follow-up bet
    if (hard && fewOpponents && drawing && rng() < 0.4 * bluffing) return potBet(view, seat, 0.6); // a semi-bluff
    if (hard && fewOpponents && river && eq < 0.25 && ctx.inPosition && rng() < 0.3 * bluffing) return potBet(view, seat, 0.66); // a bluff
    return { type: "check" };
  }

  // Facing a bet. Drawing hands collect a little more when they hit.
  const implied = drawing && !river && stackLeft > ctx.pot ? 0.06 : 0;
  // Committed: calling would leave next to nothing behind.
  const committed = stackLeft - legal.toCall < ctx.pot * 0.25;
  if (eq >= 0.75 || (eq >= 0.65 && ctx.betsThisStreet <= 1)) return committed ? { type: "allin" } : potBet(view, seat, 0.8);
  if (eq + implied >= ctx.odds + (committed ? 0 : 0.03)) return { type: "call" };
  if (hard && fewOpponents && drawing && view.street === "FLOP" && legal.canRaise && rng() < 0.25 * bluffing) return potBet(view, seat, 0.8);
  return { type: "fold" };
}

/** MEDIUM's chance of winning: against random hands, shaded down for every bet it faces. */
function mediumEquity(view, seat, ctx, rng) {
  const eq = equity(ctx.me.hole, view.board, Math.max(1, ctx.live.length), SAMPLES.MEDIUM, rng);
  return eq ** (1 + ctx.betsThisStreet);
}

/**
 * The move `seat` makes at `level`, from its own `view` (viewFor(state,
 * seat)). `reads`: the table's reads on its players (see updateReads), which
 * HARD reads ranges by.
 */
export function chooseAction(view, seat, level = "MEDIUM", rng = Math.random, reads = []) {
  if (!view.legal) throw new Error("Not this seat's turn");
  if (view.street === "PREFLOP") {
    if (level === "EASY") return easyPreflop(view, seat, rng);
    return level === "HARD" ? hardPreflop(view, seat, rng, reads) : mediumPreflop(view, seat);
  }
  if (level === "EASY") return easyPostflop(view, seat, rng);
  const ctx = situation(view, seat);
  if (level === "HARD") {
    const ranges = rangesOf(view, seat, ctx.live, reads);
    const eq = rangeEquity(ctx.me.hole, view.board, ranges, SAMPLES.HARD, rng);
    return postflopByEquity(view, seat, eq, true, rng, Math.min(...ranges.map((r) => r.style.folds)));
  }
  return postflopByEquity(view, seat, mediumEquity(view, seat, ctx, rng), false, rng);
}
