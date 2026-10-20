// THIRTEEN CPU — WHAT A SEAT CAN KNOW, AND PLAYING THE ROUND OUT IN ITS HEAD
//
// readTable is the only place the CPU looks at the game state, and it takes
// only what a player at the table sees: its own hand, how many cards everyone
// holds, who has passed, and the cards played this round. Other hands are
// read for their length and nothing else. With `memory` it remembers the
// round's plays and what passes give away (someone holding one card who
// passes on a 9 can't hold anything above it); without, every card it can't
// see might still be out.
//
// From that: the chance a play gets beaten (beatChance), and a search that
// deals the cards it can't see at random, many times over, plays each
// candidate move and the rest of the round out with a sensible simple player
// in every seat, and keeps the move that costs the fewest points on average.

import { ACE, cardInt, classify, combosOf, greedyPlan, rankOf, TWO } from "./aiCombos.js";

const asc = (a, b) => a - b;

/**
 * A seat's view of the table: { me, hand (ascending card numbers), cardOf,
 * opps (in turn order after me: { seat, count, limit }), unseen, table,
 * owner, passed, score }. `limit` is a power the opponent's whole hand is
 * known not to beat with a combination of its size. `hand` and `table`
 * default to the seat's hand and the play on the table.
 */
export function readTable(gameState, me, { memory = true, hand: own = gameState.players[me].hand, table: current = gameState.currentPlay } = {}) {
  const players = gameState.players;
  const cardOf = new Map(own.map((c) => [cardInt(c), c]));
  const hand = [...cardOf.keys()].sort(asc);
  const history = gameState.moveHistory || [];
  let start = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].type === "NEW_ROUND") {
      start = i + 1;
      break;
    }
  }
  const moves = history.slice(start);

  const played = new Uint8Array(52);
  const limits = players.map(() => null);
  if (memory) {
    // Replay the round: hand sizes then were today's plus what was played since.
    const live = players.map((p) => p.hand.length);
    for (const m of moves) if (m.type === "PLAY") live[m.playerIndex] += m.cards.length;
    let table = null;
    for (const m of moves) {
      if (m.type === "PLAY") {
        const ints = m.cards.map(cardInt).sort(asc);
        ints.forEach((v) => (played[v] = 1));
        live[m.playerIndex] -= ints.length;
        limits[m.playerIndex] = null;
        table = classify(ints);
      } else if (m.type === "PASS" && table && live[m.playerIndex] === table.size) {
        // Passing with exactly the cards to answer: whatever they hold, it doesn't beat this.
        const had = limits[m.playerIndex];
        limits[m.playerIndex] = had == null ? table.power : Math.min(had, table.power);
      } else if (m.type === "ROUND_RESET") table = null;
    }
  }

  const unseen = [];
  for (let v = 0; v < 52; v++) if (!cardOf.has(v) && !played[v]) unseen.push(v);
  const n = players.length;
  const opps = [];
  for (let k = 1; k < n; k++) {
    const seat = (me + k) % n;
    const p = players[seat];
    if (p.isEliminated || !p.hand.length) continue;
    opps.push({ seat, count: p.hand.length, limit: limits[seat] });
  }
  const tableCards = current?.cards;
  return {
    me,
    hand,
    cardOf,
    opps,
    unseen,
    table: tableCards ? classify(tableCards.map(cardInt).sort(asc)) : null,
    owner: gameState.lastPlayedBy,
    passed: players.map((p) => !!p.hasPassed),
    score: players[me].score || 0,
  };
}

/** Chance that none of `k` specific cards are among `c` dealt from `u`. */
const noneOf = (u, k, c) => {
  let p = 1;
  for (let i = 0; i < c; i++) p *= Math.max(0, u - k - i) / (u - i);
  return p;
};

/** Chance an opponent holding `c` of the `u` unseen cards holds `k` particular ones. */
const allOf = (u, k, c) => {
  let p = 1;
  for (let i = 0; i < k; i++) p *= Math.max(0, c - i) / (u - i);
  return p;
};

/** How many sets of `size` same-rank unseen cards beat `play`. */
function beatingSets(play, unseen) {
  const byRank = Array.from({ length: 13 }, () => []);
  for (const v of unseen) byRank[rankOf(v)].push(v);
  let count = 0;
  const k = play.size;
  for (let r = rankOf(play.power); r < 13; r++) {
    const g = byRank[r];
    if (g.length < k) continue;
    if (r > rankOf(play.power)) count += choose(g.length, k);
    // Same rank: only sets topped by a higher suit.
    else for (let t = k - 1; t < g.length; t++) if (g[t] > play.power) count += choose(t, k - 1);
  }
  return count;
}
const choose = (n, k) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
};

// Rough odds a full 13-card hand beats a 5-card play, by what it is.
function fiveOdds(play) {
  const top = rankOf(play.power % 1000);
  if (play.power < 1000) return 1 - (1 - 0.6) * (1 - 0.65 * ((12 - top) / 10)); // straight
  if (play.power < 2000) {
    const suit = Math.floor((play.power - 1000) / 13);
    const r = (play.power - 1000) % 13;
    return 1 - (1 - 0.35) * (1 - 0.45 * ((3 - suit) / 3) - 0.1 * ((12 - r) / 12)); // flush
  }
  if (play.power < 3000) return 0.05 + 0.35 * ((12 - Math.floor((play.power - 2000) / 13)) / 12); // full house
  return 0.01;
}

/** The chance opponent `o` can beat `play` (as far as this seat knows). */
export function beatChance(play, o, view) {
  if (o.count < play.size) return 0;
  // Holding exactly the cards to answer, already shown not to beat this or less.
  if (o.limit != null && o.count === play.size && o.limit <= play.power) return 0;
  const u = view.unseen.length;
  if (play.size === 1) {
    let pool = view.unseen;
    if (o.limit != null && o.count === 1) pool = pool.filter((v) => v < o.limit);
    const higher = pool.reduce((n, v) => n + (v > play.power), 0);
    if (o.count === 1) return pool.length ? higher / pool.length : 0;
    return 1 - noneOf(u, higher, o.count);
  }
  if (play.size <= 4) {
    const sets = beatingSets(play, view.unseen);
    return sets ? 1 - Math.pow(1 - allOf(u, play.size, o.count), sets) : 0;
  }
  return fiveOdds(play) * Math.pow(Math.min(1, o.count / 13), 1.5);
}

/** The chance nobody beats `play`. */
export function holdChance(play, view, opps = view.opps) {
  let p = 1;
  for (const o of opps) p *= 1 - beatChance(play, o, view);
  return p;
}

/** The chance some opponent goes out over `play`: their whole hand beats it. */
export function outChance(play, view) {
  let p = 0;
  for (const o of view.opps) if (o.count === play.size) p = Math.max(p, beatChance(play, o, view));
  return p;
}

// ------------------------------------------------------------ the search ----

/** Deal the unseen cards to the opponents at random, true to what's known. */
function deal(view, rng) {
  let last = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const pool = [...view.unseen];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const hands = {};
    // A one-card opponent with a known limit gets a card under it first.
    for (const o of view.opps) {
      if (o.count !== 1 || o.limit == null) continue;
      const at = pool.findIndex((v) => v < o.limit);
      if (at >= 0) hands[o.seat] = pool.splice(at, 1);
    }
    let p = 0;
    for (const o of view.opps) {
      if (hands[o.seat]) continue;
      hands[o.seat] = pool.slice(p, p + o.count).sort(asc);
      p += o.count;
    }
    last = hands;
    const fits = view.opps.every((o) => {
      if (o.limit == null || o.count === 1) return true;
      const c = classify(hands[o.seat]);
      return !c || c.power <= o.limit;
    });
    if (fits) return hands;
  }
  return last;
}

/** Points a seat takes holding `left` cards when someone else goes out. */
export const pointsFor = (left) => (left >= 10 ? left * 2 : left);

/**
 * A simple, sound player for the simulated seats, close to MEDIUM: leads
 * its plan's lowest play (not a 2), answers with its plan's cheapest fit or
 * else whatever wins, keeps aces and 2s while its hand is big, and blocks
 * when someone is close to going out.
 */
function simMove(sim, seat) {
  const hand = sim.hands[seat];
  if (sim.planOf[seat]?.hand !== hand) sim.planOf[seat] = { hand, plan: greedyPlan(hand) };
  const plan = sim.planOf[seat].plan;
  let fewest = 99;
  for (const s of sim.order) if (s !== seat) fewest = Math.min(fewest, sim.hands[s].length);
  const table = sim.table;
  if (!table) {
    const whole = classify(hand);
    if (whole) return whole;
    if (fewest === 1) return plan.find((c) => c.size > 1) || classify([hand[hand.length - 1]]);
    if (fewest === 2) {
      const notPair = plan.find((c) => c.size !== 2);
      if (notPair) return notPair;
    }
    return plan.find((c) => !c.cards.some((v) => rankOf(v) === TWO)) || plan[0];
  }
  if (hand.length === table.size) {
    const whole = classify(hand);
    if (whole && whole.power > table.power) return whole;
  }
  const fits = table.size === 1 ? hand.filter((v) => v > table.power).map((v) => classify([v])) : sameSize(hand, table);
  if (!fits.length) return null;
  if (fewest <= 3) return table.size === 1 && fewest === 1 ? fits[fits.length - 1] : fits[0];
  const big = hand.length > 7;
  const spare = (c) => !(big && rankOf(c.cards[0]) >= ACE);
  let planned = null;
  for (const c of plan) if (c.size === table.size && c.power > table.power && spare(c) && (!planned || c.power < planned.power)) planned = c;
  return planned || fits.find(spare) || null;
}

/** Combinations from `hand` that beat `table`, weakest first. */
function sameSize(hand, table) {
  return combosOf(hand, { full: false })
    .filter((c) => c.size === table.size && c.power > table.power)
    .sort((a, b) => a.power - b.power);
}

function nextSeat(sim, from) {
  const i = sim.order.indexOf(from);
  for (let k = 1; k <= sim.order.length; k++) {
    const s = sim.order[(i + k) % sim.order.length];
    if (!sim.passed.has(s)) return s;
  }
  return from;
}

/** Plays `move` (a combination, or null to pass) for the seat on turn. Returns the winner, if any. */
function step(sim, move) {
  const seat = sim.turn;
  if (move) {
    sim.hands[seat] = sim.hands[seat].filter((v) => !move.cards.includes(v));
    if (!sim.hands[seat].length) return seat;
    sim.table = move;
    sim.owner = seat;
    sim.passed.clear();
    sim.turn = nextSeat(sim, seat);
  } else {
    sim.passed.add(seat);
    sim.turn = nextSeat(sim, seat);
    if (sim.order.filter((s) => !sim.passed.has(s)).length <= 1) {
      sim.table = null;
      sim.passed.clear();
      sim.turn = sim.owner ?? sim.turn;
    }
  }
  return null;
}

/** Plays the round out from `first` (this seat's move) and returns the points this seat takes. */
function playOut(view, hands, first) {
  const order = [view.me, ...view.opps.map((o) => o.seat)].sort(asc);
  const sim = {
    hands: { ...hands, [view.me]: view.hand },
    order,
    table: view.table,
    owner: view.owner,
    passed: new Set(order.filter((s) => view.passed[s])),
    turn: view.me,
    planOf: {},
  };
  let winner = step(sim, first);
  for (let guard = 0; winner == null && guard < 400; guard++) winner = step(sim, simMove(sim, sim.turn));
  if (winner === view.me) return 0;
  const pts = pointsFor(sim.hands[view.me].length);
  // Points that knock you out of the match hurt more than their number.
  return view.score + pts >= 30 ? pts + 10 : pts;
}

/**
 * The candidate move (combination or null) that costs this seat the fewest
 * points over `samples` random deals of the cards it can't see. Every
 * candidate faces the same deals. `prior` breaks near-ties (higher is better).
 */
export function bestBySearch(view, candidates, rng, { samples = 32, prior = () => 0 } = {}) {
  const cost = candidates.map(() => 0);
  for (let s = 0; s < samples; s++) {
    const hands = deal(view, rng);
    candidates.forEach((move, i) => (cost[i] += playOut(view, hands, move)));
  }
  let best = 0;
  let bestScore = -Infinity;
  candidates.forEach((move, i) => {
    const score = -cost[i] / samples + 0.25 * prior(move);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return candidates[best];
}
