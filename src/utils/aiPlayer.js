// THIRTEEN CPU — three levels of opponent.
//
// EASY plays like a beginner. It always plays when it can, leads its lowest
// card (now and then with the cards that pair it), answers with the lowest
// card that wins, and sometimes grabs any winning play, 2s and all. It never
// thinks about who is about to go out.
//
// MEDIUM plays like a decent club player. It splits its hand into the fewest,
// strongest plays and sheds them lowest first, answers from that plan before
// breaking pairs and straights (but would rather break one than sit on
// cards), keeps its aces and 2s while its hand is big, runs out with a 2♠ to
// lead its last card, and blocks: if someone holds one card it answers
// singles with its highest and leads sets, not singles. It doesn't remember
// what's been played: every card it can't see might still be out.
//
// HARD plays like a strong player. It counts the round's cards (knowing when
// its 9 is the highest single left), reads passes (one card left and a pass
// on the 8 means that card is under the 8), and runs out with cards nobody
// can beat. Before every move it plays the round out in its head: it deals
// the cards it can't see at random, 40 times over, plays each of its best few
// moves and the rest of the round out, and keeps the move that costs it the
// fewest points. So it blocks someone on their last card, spends its 2s when
// they win the round rather than early, and knows 10 or more cards left count
// double and that points which knock it out of the match hurt more.
//
// None of them see anyone else's cards: everything goes through readTable
// (aiSearch.js), which reads other hands only for how many cards they hold.

import { validatePlay } from "./handEvaluator.js";
import { beatingCombos, classify, combosOf, makePlanner, rankOf, ACE, TWO } from "./aiCombos.js";
import { bestBySearch, holdChance, outChance, readTable } from "./aiSearch.js";
import { groupByRank } from "./deckUtils.js";

// ============================================================
// ENTRY POINT
// ============================================================

/**
 * { action: "play", cards } or { action: "pass", cards: null } for the CPU
 * on turn. `rng` (0 to 1) drives EASY's slips and HARD's random deals.
 */
export const makeAIDecision = (player, currentPlay, gameState, rng = Math.random) => {
  // Each CPU seat can have its own level; practice tables set one for all.
  const level = player.level || gameState.aiDifficulty || "MEDIUM";
  const view = readTable(gameState, seatOf(player, gameState), {
    memory: level === "HARD",
    hand: player.hand,
    table: currentPlay,
  });
  const brain = level === "EASY" ? easy : level === "HARD" ? hard : medium;
  const move = brain(view, rng);
  const cards = move?.cards.map((v) => view.cardOf.get(v));
  if (cards && validatePlay(cards, currentPlay).valid) return { action: "play", cards };
  if (currentPlay) return { action: "pass", cards: null };
  // The leader has to play: its lowest card, if a brain ever comes up empty.
  return { action: "play", cards: [view.cardOf.get(view.hand[0])] };
};

const seatOf = (player, gameState) => {
  const at = gameState.players.indexOf(player);
  if (at >= 0) return at;
  return gameState.players[player.id] ? player.id : gameState.currentPlayerIndex;
};

const beats = (c, table) => c.size === table.size && c.power > table.power;

/** The whole hand in one play, when that's allowed now. */
const goOut = ({ hand, table }) => {
  const whole = classify(hand);
  return whole && (!table || beats(whole, table)) ? whole : null;
};

/** Every play but one unbeatable: lead an unbeatable one (the last goes out). */
const runOut = (plan, hold) => {
  const sure = plan.filter((c) => hold.get(c) >= 0.999);
  if (plan.length - sure.length > 1) return null;
  return sure.sort((a, b) => b.size - a.size)[0] || plan[0];
};

const fewestHeld = (view) => Math.min(...view.opps.map((o) => o.count));
const highestSingle = (hand) => classify([hand[hand.length - 1]]);
const hasTwo = (c) => c.cards.some((v) => rankOf(v) === TWO);
const allHigh = (c) => c.cards.every((v) => rankOf(v) >= ACE);

// ============================================================
// EASY
// ============================================================

function easy(view, rng) {
  const out = goOut(view);
  if (out) return out;
  const { hand, table } = view;
  if (!table) {
    const low = hand.filter((v) => rankOf(v) === rankOf(hand[0]));
    return low.length > 1 && rng() < 0.5 ? classify(low) : classify([hand[0]]);
  }
  const fits = beatingCombos(hand, table, { full: false });
  if (!fits.length) return null;
  // A beginner sometimes grabs whatever wins, 2s and all.
  if (fits.length > 1 && rng() < 0.25) return fits[Math.floor(rng() * fits.length)];
  return fits[0];
}

// ============================================================
// MEDIUM
// ============================================================

function medium(view) {
  const out = goOut(view);
  if (out) return out;
  const { hand, table } = view;
  const combos = combosOf(hand);
  const hold = new Map(combos.map((c) => [c, holdChance(c, view)]));
  const weight = (c) => 1 - hold.get(c);
  const planner = makePlanner(hand, combos, weight);
  const plan = planner.plays();
  const fewest = fewestHeld(view);

  if (!table) {
    const run = runOut(plan, hold);
    if (run) return run;
    const lowFirst = [...plan].sort((a, b) => a.cards[0] - b.cards[0] || b.size - a.size);
    if (fewest === 1) {
      // Someone is on their last card: lead a set they can't answer, or a high single.
      return lowFirst.find((c) => c.size > 1) || highestSingle(hand);
    }
    if (fewest === 2) {
      const notPairs = lowFirst.filter((c) => c.size !== 2);
      if (notPairs.length) return notPairs.find((c) => !hasTwo(c)) || notPairs[0];
      return lowFirst[lowFirst.length - 1];
    }
    return lowFirst.find((c) => !hasTwo(c)) || lowFirst[0];
  }

  const fits = combos.filter((c) => beats(c, table)).sort((a, b) => a.power - b.power);
  if (!fits.length) return null;
  if (fewest <= 3) {
    // Stop them: a single goes as high as it can against a last card.
    return table.size === 1 && fewest === 1 ? fits[fits.length - 1] : fits[0];
  }
  // Aces and 2s wait while the hand is big.
  const big = hand.length > 7;
  const planned = fits.find((c) => plan.includes(c) && !(big && allHigh(c)));
  if (planned) return planned;
  // Otherwise shed what breaks the plan least: a held card is worse than a broken set.
  const stray = (c) => planner.value(planner.all ^ c.mask) + weight(c) - planner.value();
  const spare = fits.filter((c) => !(big && allHigh(c))).sort((a, b) => stray(a) - stray(b));
  return spare[0] || null;
}

// ============================================================
// HARD
// ============================================================

// Every decision is played out against this many random deals.
const DEALS = 40;
// Moves worth playing out, from the quick score (more only adds noise).
const SHORTLIST = 5;

function hard(view, rng) {
  const out = goOut(view);
  if (out) return out;
  const { hand, table } = view;
  const combos = combosOf(hand);
  const hold = new Map(combos.map((c) => [c, holdChance(c, view)]));
  // A play nobody can beat isn't a burden: it wins the lead back.
  const weight = (c) => 1 - 1.25 * hold.get(c);
  const planner = makePlanner(hand, combos, weight);
  const all = planner.all;
  const value = planner.value();
  // How far a play strays from the best plan (0 when it's part of it).
  const stray = (c) => planner.value(all ^ c.mask) + weight(c) - value;
  const fewest = fewestHeld(view);
  // 10 or more cards count double: when someone's close, getting under 10 is worth a lot.
  const cliff = (c) => (hand.length >= 10 && hand.length - c.size < 10 && fewest <= 4 ? 0.5 : 0);
  const search = (candidates, score) => bestBySearch(view, unique(candidates), rng, { samples: DEALS, prior: score });

  if (!table) {
    const run = runOut(planner.plays(), hold);
    if (run) return run;
    const score = (c) => weight(c) - 1.5 * stray(c) + 0.05 * c.size - 3 * outChance(c, view) + cliff(c);
    const ranked = combos
      .filter((c) => stray(c) <= 0.75)
      .map((c) => ({ c, s: score(c) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
    // Also always weighed: the highest single, one nobody can go out over, and a set.
    const safe = combos.find((c) => c.size === 1 && outChance(c, view) === 0);
    const set = ranked.find((c) => c.size > 1);
    return search([...ranked.slice(0, SHORTLIST), highestSingle(hand), safe, set], score);
  }

  const fits = combos.filter((c) => beats(c, table)).sort((a, b) => a.power - b.power);
  if (!fits.length) return null;
  // Passing leaves the table to those still in the trick (not its owner).
  const stillIn = view.opps.filter((o) => o.seat !== view.owner && !view.passed[o.seat]);
  const passRisk = outChance(table, { ...view, opps: stillIn });
  const score = (c) =>
    c ? value - planner.value(all ^ c.mask) + 0.35 * hold.get(c) - 3 * outChance(c, view) + cliff(c) : 0.15 - 3 * passRisk;
  const ranked = [...fits, null].map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s).map((x) => x.c);
  // Also always weighed: the cheapest fit, the highest, and passing.
  return search([...ranked.slice(0, SHORTLIST), fits[0], fits[fits.length - 1], null], score);
}

/** Drops repeats and blanks, keeping a single null (pass). */
function unique(moves) {
  const out = [];
  for (const m of moves) {
    if (m === undefined || out.includes(m)) continue;
    out.push(m);
  }
  return out;
}

// ============================================================
// SHARED
// ============================================================

/** A rough strength score: sets and high cards. */
export const evaluateHandStrength = (hand) => {
  const groups = groupByRank(hand);
  let strength = 0;

  for (const rank of Object.keys(groups)) {
    const count = groups[rank].length;
    if (count === 4) strength += 10;
    else if (count === 3) strength += 6;
    else if (count === 2) strength += 3;
  }

  const highCards = hand.filter((card) => card.rankValue >= 10).length;
  strength += highCards * 2;

  return strength;
};

export default {
  makeAIDecision,
  evaluateHandStrength,
};
