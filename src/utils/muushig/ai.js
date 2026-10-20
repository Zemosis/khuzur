// MUUSHIG AI — CPU players at three levels (EASY, MEDIUM, HARD).
//
// One entry point, aiAction(state, rng), returns the move for whoever's turn
// it is as { type, ... }; applyAction(state, action) plays it through the
// engine. Every level only picks moves the engine allows, and none of them
// looks at a card its player couldn't see.
//
//   EASY    a beginner: reads its hand like MEDIUM but often misjudges
//           whether to go in, swaps a random few dead cards, plays like
//           MEDIUM without counting cards, and one card in three it throws
//           without thinking.
//   MEDIUM  a club player. It prices each card by how likely it is to eat a
//           pile and goes in when that beats the risk of the +5, counting the
//           face-up trump when it deals (an ace there is a pile in the bag).
//           It swaps cards a fresh draw would beat, counts every card played,
//           cashes its sure winners, eats with the cheapest card that holds
//           and fights for its first pile.
//   HARD    plays each choice out against a few hundred deals of the cards
//           it can't see, dealt to fit what the table has shown (who couldn't
//           follow suit, who couldn't go higher, who swapped few cards and so
//           kept good ones), with MEDIUM's judgement for every seat, and takes
//           the move likeliest to win the match: a point counts most near the
//           finish, and stopping whoever is about to win counts too.
// Every level goes in with a trump nobody can beat, the face-up one included
// when it deals, and a dealer takes the face-up trump for a worse card.
//
// Inside, cards are numbers 0–31 (suit × 8 + rank) so HARD's rollouts are
// cheap; a set of cards is a 32-bit mask.

import {
  HAND_SIZE,
  MAX_FOLDS_IN_A_ROW,
  MIN_PLAYING,
  PHASES,
  RANKS,
  SUITS,
  TRICKS_PER_ROUND,
  ZERO_PILES_PENALTY,
  allowedPlays,
  canFold,
  collectTrick,
  createDeck,
  decide,
  drawForDeal,
  maxDiscard,
  maxDrawDepth,
  playCard,
  seatsFromDealer,
  swap,
  takeTrump,
} from "./engine.js";

const PLAYERS = 5;
const RANK_COUNT = RANKS.length;
const DECK = createDeck(); // DECK[c] is card c: suit c >> 3, rank c & 7
const ALL = DECK.map((_, c) => c);

const suitOf = (c) => c >> 3;
const rankOf = (c) => c & 7;
const bit = (c) => 1 << c;
const has = (mask, c) => (mask & bit(c)) !== 0;
const maskOf = (cards) => cards.reduce((m, c) => m | bit(c), 0);
const toInt = (card) => card.suitValue * RANK_COUNT + card.rankValue;
const remove = (list, c) => list.splice(list.indexOf(c), 1);

// ---- Pricing a card ------------------------------------------------------------

// Chance a card eats a pile, measured over 300,000 rounds played out with
// MEDIUM's judgement: one row per number of rivals in (1–4), indexed by how
// many higher cards of its suit could still be in a rival's hand. A trump
// with none above it can't lose; a plain card also loses to anyone out of
// its suit with a trump, and under our own higher card it rarely gets a turn.
const ODDS = {
  trump: [
    [1, 0.93, 0.81, 0.73, 0.68, 0.62, 0.52, 0.42],
    [1, 0.87, 0.71, 0.59, 0.5, 0.4, 0.31, 0.24],
    [1, 0.83, 0.65, 0.51, 0.38, 0.29, 0.21, 0.17],
    [1, 0.8, 0.6, 0.43, 0.3, 0.21, 0.13, 0.11],
  ],
  plain: [
    [0.62, 0.39, 0.26, 0.18, 0.12, 0.1, 0.06, 0.03],
    [0.41, 0.17, 0.09, 0.05, 0.03, 0.02, 0.01, 0.01],
    [0.31, 0.08, 0.03, 0.02, 0.01, 0, 0, 0],
    [0.23, 0.03, 0.01, 0.01, 0, 0, 0, 0],
  ],
  under: [
    [0.41, 0.26, 0.21, 0.15, 0.12, 0.09, 0.07, 0.07],
    [0.21, 0.09, 0.06, 0.04, 0.03, 0.02, 0.02, 0.02],
    [0.14, 0.04, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01],
    [0.08, 0.02, 0.01, 0, 0, 0, 0, 0],
  ],
};

/** Cards of c's suit above it that aren't in `known` (held, or seen leave play). */
function higherOut(c, known) {
  let n = 0;
  for (let r = rankOf(c) + 1; r < RANK_COUNT; r++) if (!has(known, (c & ~7) | r)) n++;
  return n;
}

/** Whether any trump is outside `known`, i.e. one a rival might still hold. */
function trumpsOut(trump, known) {
  for (let r = 0; r < RANK_COUNT; r++) if (!has(known, trump * RANK_COUNT + r)) return true;
  return false;
}

/** Chance (0–1) that card c eats a pile, with `rivals` other players in (may be fractional). */
function odds(c, hand, known, trump, rivals) {
  const table =
    suitOf(c) === trump ? ODDS.trump : hand.some((h) => suitOf(h) === suitOf(c) && h > c) ? ODDS.under : ODDS.plain;
  const h = higherOut(c, known);
  const r = Math.min(Math.max(rivals, 1), 4) - 1;
  const lo = Math.floor(r);
  if (lo === r) return table[r][h];
  return table[lo][h] + (table[lo + 1][h] - table[lo][h]) * (r - lo);
}

/** Average odds of a card drawn blind from those outside `known`. */
function freshOdds(known, hand, trump, rivals) {
  let sum = 0;
  let n = 0;
  for (const c of ALL) {
    if (has(known, c)) continue;
    sum += odds(c, hand, known, trump, rivals);
    n++;
  }
  return n ? sum / n : 0;
}

/** A card's price to give up: its odds, a lone plain card a shade cheaper (losing it opens a void). */
function givePrice(hand, known, trump, rivals) {
  const count = [0, 0, 0, 0];
  for (const c of hand) count[suitOf(c)]++;
  return (c) => odds(c, hand, known, trump, rivals) - (suitOf(c) !== trump && count[suitOf(c)] === 1 ? 0.001 : 0);
}

/** The hand in the order we'd give it up, cheapest first. */
function giveUpOrder(hand, known, trump, rivals) {
  const price = givePrice(hand, known, trump, rivals);
  const priced = new Map(hand.map((c) => [c, price(c)]));
  return [...hand].sort((a, b) => priced.get(a) - priced.get(b) || rankOf(a) - rankOf(b));
}

/** Of `cards` (from `hand`), the one we'd give up first. */
function weakest(cards, hand, known, trump, rivals) {
  const price = givePrice(hand, known, trump, rivals);
  let best = cards[0];
  let bestPrice = price(best);
  for (let i = 1; i < cards.length; i++) {
    const p = price(cards[i]);
    if (p < bestPrice || (p === bestPrice && rankOf(cards[i]) < rankOf(best))) [best, bestPrice] = [cards[i], p];
  }
  return best;
}

// ---- Shared judgement (MEDIUM, and every seat in HARD's rollouts) ----------------

/**
 * Score points a hand expects to save by going in rather than folding:
 * piles it should eat, less the +5 times the chance it eats none. `pileLeft`
 * is what the draw pile should still hold on its turn to swap; a dealer
 * counts the face-up trump, swapped for its weakest card.
 */
function decideGain({ hand, faceup, isDealer, trump, known, rivals, pileLeft }) {
  const held = isDealer ? [...hand, faceup] : hand;
  const fresh = freshOdds(known | bit(faceup), held, trump, rivals);
  const list = hand.map((c) => odds(c, held, known, trump, rivals)).sort((a, b) => a - b);
  for (let i = 0, draws = Math.round(pileLeft); i < list.length && draws > 0 && list[i] < fresh; i++, draws--) list[i] = fresh;
  if (isDealer) {
    list.push(odds(faceup, held, known, trump, rivals));
    list.sort((a, b) => a - b).shift();
  }
  let expected = 0;
  let none = 1;
  for (const p of list) {
    expected += p;
    none *= 1 - p;
  }
  return expected - ZERO_PILES_PENALTY * none;
}

// MEDIUM goes in when the hand beats folding by this much; asking a little
// more than break-even did slightly better over 2,000 matches.
const GO_IN_MARGIN = 0.3;

/** MEDIUM's call on going in. Everyone already in (`playing`) swaps first, a card or two each. */
function goesIn(v, pile) {
  return decideGain({ ...v, pileLeft: pile - 1.5 * v.playing }) > GO_IN_MARGIN;
}

/** Cards to swap away: every card a blind draw should beat, cheapest first. */
function pickDiscards({ hand, faceup, trump, known, rivals, limit }) {
  if (!limit) return [];
  const fresh = freshOdds(known | bit(faceup), hand, trump, rivals);
  return giveUpOrder(hand, known, trump, rivals)
    .filter((c) => odds(c, hand, known, trump, rivals) < fresh)
    .slice(0, limit);
}

/** The card a dealer gives up for the face-up trump, or null to keep the hand. */
function pickTrade({ hand, faceup, trump, known, rivals }) {
  if (!hand.length) return null;
  const held = [...hand, faceup];
  const out = weakest(hand, hand, known, trump, rivals);
  const gain = odds(faceup, held, known, trump, rivals) - odds(out, held, known, trump, rivals);
  return gain > 0 || (gain === 0 && suitOf(out) !== trump) ? out : null;
}

/** Cards that may go down now, by the rules of engine.allowedPlays. */
function legal(hand, trick, trump) {
  if (!trick.length) return hand;
  const led = suitOf(trick[0].c);
  for (const suit of [led, trump]) {
    const held = hand.filter((c) => suitOf(c) === suit);
    if (!held.length) continue;
    let top = -1;
    for (const p of trick) if (suitOf(p.c) === suit && rankOf(p.c) > top) top = rankOf(p.c);
    const higher = held.filter((c) => rankOf(c) > top);
    return higher.length ? higher : held;
  }
  return hand;
}

const power = (c, led, trump) => (suitOf(c) === trump ? 100 + rankOf(c) : suitOf(c) === led ? rankOf(c) : -1);

/** Index in `trick` of the card on top. */
function topIndex(trick, trump) {
  const led = suitOf(trick[0].c);
  let best = 0;
  for (let i = 1; i < trick.length; i++) if (power(trick[i].c, led, trump) > power(trick[best].c, led, trump)) best = i;
  return best;
}

/**
 * MEDIUM's card. ctx: { hand, trick: [{ seat, c }], trump, known (cards no
 * rival can hold, as far as this player knows), eaten, after (players still
 * to play this trick), tricksLeft, rivals }.
 */
function pickPlay({ hand, trick, trump, known, eaten, after, tricksLeft, rivals }) {
  const allowed = legal(hand, trick, trump);
  if (allowed.length === 1) return allowed[0];
  const noTrumpsOut = !trumpsOut(trump, known);
  // Nobody can beat it: the top trump left, or the top of its suit once the trumps are gone.
  const sure = (c) => higherOut(c, known) === 0 && (suitOf(c) === trump || noTrumpsOut);
  // The first pile is worth 6 points, every other one 1; a sure card already has it.
  const hungry = eaten === 0 && !hand.some(sure);

  if (!trick.length) {
    // Cash sure winners, trumps first: they pull the rivals' trumps.
    const cash = allowed.filter(sure).sort((a, b) => (suitOf(b) === trump) - (suitOf(a) === trump));
    if (cash.length) return cash[0];
    // The top of a plain suit eats unless someone's out of it already.
    const tops = allowed.filter((c) => suitOf(c) !== trump && higherOut(c, known) === 0);
    if (tops.length) return tops[0];
    if (hungry && tricksLeft <= 2) return allowed.reduce((a, b) => (power(b, suitOf(b), trump) > power(a, suitOf(a), trump) ? b : a));
    return weakest(allowed, hand, known, trump, rivals);
  }

  const led = suitOf(trick[0].c);
  const onTop = power(trick[topIndex(trick, trump)].c, led, trump);
  const winners = allowed.filter((c) => power(c, led, trump) > onTop).sort((a, b) => power(a, led, trump) - power(b, led, trump));
  if (!winners.length) return weakest(allowed, hand, known, trump, rivals);
  if (!after) return winners[0];
  const safe = winners.find(sure);
  if (safe !== undefined) return safe;
  if (hungry) {
    // The best chance, but no dearer than it needs to be: K♠ under our own A♠ is as good as the ace.
    const threat = (c) => (suitOf(c) === trump ? 0 : 10) + higherOut(c, known);
    return winners.reduce((a, b) => (threat(b) < threat(a) ? b : a));
  }
  // Not sure to hold: risk a cheap card, save the good ones for a pile they can hold.
  if (odds(winners[0], hand, known, trump, rivals) < 0.5) return winners[0];
  const losers = allowed.filter((c) => !winners.includes(c));
  return losers.length ? weakest(losers, hand, known, trump, rivals) : winners[0];
}

// ---- Reading the real table ------------------------------------------------------

// While players are still deciding, each counts as this much of a rival.
const UNDECIDED_IN = 0.6;

/** What `seat` can see, as numbers: its hand and the cards no rival can hold. */
function viewOf(state, seat) {
  const me = state.players[seat];
  const hand = me.hand.map(toInt);
  const faceup = toInt(state.trumpCard);
  const isDealer = seat === state.dealer;
  const dealerOut = state.players[state.dealer].status === "fold";
  // The face-up trump is the dealer's to take, then in their hand; out of the
  // round if they fold or leave it.
  const faceupGone = dealerOut || (state.phase === PHASES.PLAY && state.trumpTakenBy === null);
  let known = maskOf(hand) | maskOf(state.played.map(toInt)) | maskOf(me.discarded.map(toInt));
  if (isDealer || faceupGone) known |= bit(faceup);
  const others = state.players.filter((p, s) => s !== seat);
  const playing = others.filter((p) => p.status === "play").length;
  const undecided = others.filter((p) => p.status === null).length;
  return {
    hand,
    faceup,
    isDealer,
    trump: SUITS.indexOf(state.trumpSuit),
    known,
    rivals: state.phase === PHASES.DECIDE ? playing + undecided * UNDECIDED_IN : playing,
    playing,
  };
}

/** The engine's id for card c. */
const idOf = (c) => DECK[c].id;

/** A trump nobody can beat, counting the face-up one if we deal. */
function surePiles(v) {
  const held = v.isDealer ? [...v.hand, v.faceup] : v.hand;
  return held.filter((c) => suitOf(c) === v.trump && higherOut(c, v.known) === 0).length;
}

function mediumDecide(state, seat) {
  return goesIn(viewOf(state, seat), state.drawPile.length);
}

function mediumDiscards(state, seat) {
  return pickDiscards({ ...viewOf(state, seat), limit: maxDiscard(state) });
}

function mediumTrade(state, seat) {
  return pickTrade(viewOf(state, seat));
}

function mediumPlay(state, seat) {
  const v = viewOf(state, seat);
  return pickPlay({
    ...v,
    trick: state.trick.map((p) => ({ seat: p.seat, c: toInt(p.card) })),
    eaten: state.players[seat].eaten,
    after: v.playing - state.trick.length,
    tricksLeft: TRICKS_PER_ROUND - state.trickNumber + 1,
  });
}

// ---- EASY ------------------------------------------------------------------------

function easyDecide(state, seat, rng) {
  const v = viewOf(state, seat);
  if (surePiles(v)) return true;
  // MEDIUM's sense of the hand, badly misjudged either way.
  return decideGain({ ...v, pileLeft: state.drawPile.length - 1.5 * v.playing }) + (rng() - 0.5) * 3 > 0;
}

function easyDiscards(state, seat, rng) {
  const v = viewOf(state, seat);
  const junk = giveUpOrder(v.hand, v.known, v.trump, 4).filter((c) => odds(c, v.hand, v.known, v.trump, 4) === 0);
  return junk.slice(0, Math.min(maxDiscard(state), Math.floor(rng() * (junk.length + 1))));
}

function easyPlay(state, seat, rng) {
  if (rng() < 0.35) {
    const allowed = allowedPlays(state, seat);
    return toInt(allowed[Math.floor(rng() * allowed.length)]);
  }
  // MEDIUM's play without the card counting: it only knows its own hand.
  const v = viewOf(state, seat);
  return pickPlay({
    ...v,
    known: maskOf(v.hand),
    trick: state.trick.map((p) => ({ seat: p.seat, c: toInt(p.card) })),
    eaten: state.players[seat].eaten,
    after: v.playing - state.trick.length,
    tricksLeft: TRICKS_PER_ROUND - state.trickNumber + 1,
  });
}

// ---- HARD: playing the round out -------------------------------------------------

// Deals HARD plays each choice against, fewer where it has more options to
// try. Doubling them won no more matches.
const SAMPLES = { DECIDE: 360, SWAP: 150, TRUMP: 150, PLAY: 240 };

const END = "END";

/** The public part of the table as a simulation; hidden hands are dealt per sample. */
function simBase(state) {
  return {
    trump: SUITS.indexOf(state.trumpSuit),
    dealer: state.dealer,
    faceup: toInt(state.trumpCard),
    faceupGone: state.players[state.dealer].status === "fold" || (state.phase === PHASES.PLAY && state.trumpTakenBy === null),
    phase: state.phase,
    status: state.players.map((p) => p.status),
    streak: state.players.map((p) => p.foldStreak ?? 0),
    score: state.players.map((p) => p.score),
    eaten: state.players.map((p) => p.eaten),
    hands: state.players.map(() => []),
    pile: [],
    played: maskOf(state.played.map(toInt)),
    trick: state.trick.map((p) => ({ seat: p.seat, c: toInt(p.card) })),
    turn: state.turn,
    trickNo: state.trickNumber,
  };
}

function cloneSim(sim) {
  return {
    ...sim,
    status: [...sim.status],
    eaten: [...sim.eaten],
    hands: sim.hands.map((h) => [...h]),
    pile: [...sim.pile],
    trick: [...sim.trick],
  };
}

const ORDERS = Array.from({ length: PLAYERS }, (_, dealer) => seatsFromDealer(dealer));
const order = (sim) => ORDERS[sim.dealer];
const playingIn = (sim) => sim.status.filter((s) => s === "play").length;

function nextPlaying(sim, seat) {
  for (let i = 1; i <= PLAYERS; i++) if (sim.status[(seat + i) % PLAYERS] === "play") return (seat + i) % PLAYERS;
  return null;
}

/** What `seat` knows in the simulation: its hand, what's been played, a dead face-up trump. */
function simKnown(sim, seat) {
  return sim.played | maskOf(sim.hands[seat]) | (sim.faceupGone || seat === sim.dealer ? bit(sim.faceup) : 0);
}

function simView(sim, seat) {
  let playing = 0;
  let undecided = 0;
  for (let s = 0; s < PLAYERS; s++) {
    if (s === seat) continue;
    if (sim.status[s] === "play") playing++;
    else if (sim.status[s] === null) undecided++;
  }
  return {
    hand: sim.hands[seat],
    faceup: sim.faceup,
    isDealer: seat === sim.dealer,
    trump: sim.trump,
    known: simKnown(sim, seat),
    rivals: sim.phase === PHASES.DECIDE ? playing + undecided * UNDECIDED_IN : playing,
    playing,
  };
}

function simCanFold(sim, seat) {
  if (sim.streak[seat] >= MAX_FOLDS_IN_A_ROW) return false;
  return sim.status.filter((s, i) => i !== seat && (s === "play" || s === null)).length >= MIN_PLAYING;
}

function simDecide(sim, seat, play) {
  sim.status[seat] = play || !simCanFold(sim, seat) ? "play" : "fold";
  const next = order(sim).find((s) => sim.status[s] === null);
  if (next !== undefined) {
    sim.turn = next;
    return;
  }
  sim.phase = PHASES.SWAP;
  sim.turn = order(sim).find((s) => sim.status[s] === "play");
}

function simSwap(sim, seat, discards) {
  const out = discards.slice(0, Math.min(HAND_SIZE, sim.pile.length));
  for (const c of out) remove(sim.hands[seat], c);
  sim.hands[seat].push(...sim.pile.splice(0, out.length));
  const seats = order(sim);
  const next = seats.slice(seats.indexOf(seat) + 1).find((s) => sim.status[s] === "play");
  if (next !== undefined) sim.turn = next;
  else if (sim.status[sim.dealer] === "play") {
    sim.phase = PHASES.TRUMP;
    sim.turn = sim.dealer;
  } else startSimPlay(sim);
}

function simTrump(sim, card) {
  if (card === null) sim.faceupGone = true;
  else {
    remove(sim.hands[sim.dealer], card);
    sim.hands[sim.dealer].push(sim.faceup);
  }
  startSimPlay(sim);
}

function startSimPlay(sim) {
  if (sim.status[sim.dealer] !== "play") sim.faceupGone = true;
  sim.phase = PHASES.PLAY;
  sim.trickNo = 1;
  sim.trick = [];
  sim.turn = nextPlaying(sim, sim.dealer);
}

function simPlay(sim, seat, c) {
  remove(sim.hands[seat], c);
  sim.trick.push({ seat, c });
  sim.played |= bit(c);
  if (sim.trick.length < playingIn(sim)) {
    sim.turn = nextPlaying(sim, seat);
    return;
  }
  const winner = sim.trick[topIndex(sim.trick, sim.trump)].seat;
  sim.eaten[winner]++;
  sim.trick = [];
  sim.turn = winner;
  if (++sim.trickNo > TRICKS_PER_ROUND) sim.phase = END;
}

/** Plays the round to its end with MEDIUM's judgement for every seat. */
function runSim(sim) {
  while (sim.phase !== END) {
    const seat = sim.turn;
    if (sim.phase === PHASES.DECIDE) {
      simDecide(sim, seat, goesIn(simView(sim, seat), sim.pile.length));
    } else if (sim.phase === PHASES.SWAP) {
      simSwap(sim, seat, sim.pile.length ? pickDiscards({ ...simView(sim, seat), limit: Math.min(HAND_SIZE, sim.pile.length) }) : []);
    } else if (sim.phase === PHASES.TRUMP) {
      simTrump(sim, pickTrade(simView(sim, seat)));
    } else {
      const v = simView(sim, seat);
      simPlay(
        sim,
        seat,
        pickPlay({
          ...v,
          trick: sim.trick,
          eaten: sim.eaten[seat],
          after: v.playing - sim.trick.length,
          tricksLeft: TRICKS_PER_ROUND - sim.trickNo + 1,
        }),
      );
    }
  }
  return sim;
}

/**
 * `me`'s chance to win the match once the round is scored: all or nothing if
 * it ends the match, else each player's chance goes as e^(−β·score), where
 * β = 4 / (12 + the lowest score) grows sharper as someone nears 0 (fitted
 * to 3,000 MEDIUM matches). So a point matters most near the finish, and
 * a point off whoever leads counts too.
 */
function outcome(sim, me) {
  const after = sim.score.map((score, s) => {
    if (sim.status[s] !== "play") return score;
    return score + (sim.eaten[s] > 0 ? -sim.eaten[s] : ZERO_PILES_PENALTY);
  });
  let leader = 0;
  for (let s = 1; s < PLAYERS; s++) {
    if (after[s] < after[leader] || (after[s] === after[leader] && sim.eaten[s] > sim.eaten[leader])) leader = s;
  }
  if (after[leader] <= 0) return leader === me ? 1 : 0;
  const beta = 4 / (12 + after[leader]);
  let total = 0;
  for (const score of after) total += Math.exp(-beta * (score - after[leader]));
  return Math.exp(-beta * (after[me] - after[leader])) / total;
}

// ---- HARD: dealing the unseen cards ----------------------------------------------

/**
 * What every play so far says about the hands still out: a player who didn't
 * follow the led suit has none of it (and none of trump if they didn't trump
 * either), and one who went under the top card of a suit had nothing above
 * it. Returns per seat the suits it lacks (a mask) and its highest possible
 * rank in each suit.
 */
function readPlays(state) {
  const trump = SUITS.indexOf(state.trumpSuit);
  const voids = Array(PLAYERS).fill(0);
  const caps = Array.from({ length: PLAYERS }, () => Array(SUITS.length).fill(RANK_COUNT - 1));
  const playing = state.players.filter((p) => p.status === "play").length;
  const shown = Array.from({ length: PLAYERS }, () => []); // cards each seat has played
  const played = state.played.map(toInt);
  if (state.phase !== PHASES.PLAY || played.length !== (state.trickNumber - 1) * playing + state.trick.length) {
    return { voids, caps, shown };
  }

  const note = (seat, c, before) => {
    shown[seat].push(c);
    if (!before.length) return;
    const led = suitOf(before[0].c);
    const top = (suit) => Math.max(-1, ...before.filter((p) => suitOf(p.c) === suit).map((p) => rankOf(p.c)));
    if (suitOf(c) === led) {
      if (rankOf(c) < top(led)) caps[seat][led] = Math.min(caps[seat][led], top(led));
      return;
    }
    voids[seat] |= 1 << led;
    if (suitOf(c) !== trump) voids[seat] |= 1 << trump;
    else if (rankOf(c) < top(trump)) caps[seat][trump] = Math.min(caps[seat][trump], top(trump));
  };
  const sim = { status: state.players.map((p) => p.status) };
  let leader = nextPlaying(sim, state.dealer);
  const tricks = [];
  for (let t = 0; t < state.trickNumber - 1; t++) {
    const trick = [];
    let seat = leader;
    for (const c of played.slice(t * playing, (t + 1) * playing)) {
      trick.push({ seat, c });
      seat = nextPlaying(sim, seat);
    }
    tricks.push(trick);
    leader = trick[topIndex(trick, trump)].seat;
  }
  tricks.push(state.trick.map((p) => ({ seat: p.seat, c: toInt(p.card) })));
  for (const trick of tricks) trick.forEach((p, i) => note(p.seat, p.c, trick.slice(0, i)));
  return { voids, caps, shown };
}

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * This round's swaps so far, by seat: how many cards each player swapped and
 * whether the pile had room for more. A player who could have swapped more
 * kept the rest because they were worth keeping.
 */
function readSwaps(state) {
  let i = state.events.length;
  while (i-- > 0 && state.events[i].type !== "round");
  const swaps = state.events.slice(i + 1).filter((e) => e.type === "swap");
  let pile = state.drawPile.length + swaps.reduce((n, e) => n + e.count, 0);
  const out = {};
  for (const e of swaps) {
    out[e.seat] = { count: e.count, free: e.count < Math.min(HAND_SIZE, pile) };
    pile -= e.count;
  }
  return out;
}

/**
 * A dealer for HARD's samples: each call returns the simulation with every
 * card `seat` can't see dealt at random, to fit what the table has shown:
 * the suits each player couldn't follow, and the good cards a player who
 * swapped few must have kept.
 */
function dealer(state, seat) {
  const base = simBase(state);
  const me = state.players[seat];
  const myHand = me.hand.map(toInt);
  const faceup = base.faceup;
  const known = maskOf(myHand) | base.played | maskOf(me.discarded.map(toInt)) | bit(faceup);
  const pool = ALL.filter((c) => !has(known, c));
  // A face-up trump the dealer took stays theirs until it's played.
  const heldFaceup = state.trumpTakenBy !== null && state.trumpTakenBy !== seat && !has(base.played, faceup) ? state.trumpTakenBy : null;
  const { voids, caps, shown } = readPlays(state);
  const fits = (s, c) => (voids[s] & (1 << suitOf(c))) === 0 && rankOf(c) <= caps[s][suitOf(c)];
  // Cards a player would keep rather than swap, as they saw it then.
  const rivals = Math.max(1, base.status.filter((st) => st === "play").length - 1);
  const fresh = freshOdds(bit(faceup), [], base.trump, rivals);
  const keepable = (c) => odds(c, [c], bit(c) | bit(faceup), base.trump, rivals) >= fresh;
  const swaps = readSwaps(state);
  const slots = [];
  for (let s = 0; s < PLAYERS; s++) {
    if (s === seat || (base.status[s] !== "play" && base.status[s] !== null)) continue;
    const fixed = s === heldFaceup ? [faceup] : [];
    const need = state.players[s].hand.length - fixed.length;
    // The dealer may have traded a kept card for the trump.
    const kept = swaps[s]?.free ? HAND_SIZE - swaps[s].count - (state.trumpTakenBy === s ? 1 : 0) : 0;
    const keep = Math.min(need, Math.max(0, kept - [...shown[s], ...fixed].filter(keepable).length));
    slots.push({ seat: s, fixed, need, keep, room: pool.filter((c) => fits(s, c)).length });
  }
  slots.sort((a, b) => a.room - b.room); // the tightest fit picks first
  const pileSize = state.phase === PHASES.DECIDE || state.phase === PHASES.SWAP ? state.drawPile.length : 0;
  base.hands[seat] = myHand;

  return (rng) => {
    for (let attempt = 0; ; attempt++) {
      const loose = attempt >= 20; // no deal fits every reading: drop them
      const cards = shuffled(pool, rng);
      const used = new Set();
      const sim = cloneSim(base);
      let ok = true;
      for (const { seat: s, fixed, need, keep } of slots) {
        const hand = [];
        const take = (n, test) => {
          for (const c of cards) {
            if (hand.length >= n) return;
            if (!used.has(c) && (loose || (fits(s, c) && test(c)))) {
              hand.push(c);
              used.add(c);
            }
          }
        };
        take(keep, keepable);
        take(need, () => true);
        if (hand.length < need) ok = false;
        sim.hands[s] = [...fixed, ...hand];
      }
      if (!ok && !loose) continue;
      sim.pile = cards.filter((c) => !used.has(c)).slice(0, pileSize);
      return sim;
    }
  };
}

/** The candidate that does best over `samples` deals; ties go to the earlier one. */
function bestBySim(state, seat, rng, candidates, apply, samples) {
  if (candidates.length === 1) return candidates[0];
  const deal = dealer(state, seat);
  const totals = candidates.map(() => 0);
  for (let i = 0; i < samples; i++) {
    const sim = deal(rng);
    candidates.forEach((cand, j) => {
      const s = cloneSim(sim);
      apply(s, cand);
      totals[j] += outcome(runSim(s), seat);
    });
  }
  let best = 0;
  for (let j = 1; j < candidates.length; j++) if (totals[j] > totals[best] + 1e-9) best = j;
  return candidates[best];
}

function hardDecide(state, seat, rng) {
  if (surePiles(viewOf(state, seat))) return true; // a pile in the bag: never fold it
  return bestBySim(state, seat, rng, [true, false], (s, play) => simDecide(s, seat, play), SAMPLES.DECIDE);
}

function hardDiscards(state, seat, rng) {
  const limit = maxDiscard(state);
  if (!limit) return [];
  const v = viewOf(state, seat);
  const ranked = giveUpOrder(v.hand, v.known, v.trump, v.rivals);
  const options = Array.from({ length: limit + 1 }, (_, k) => ranked.slice(0, k));
  return bestBySim(state, seat, rng, options, (s, out) => simSwap(s, seat, out), SAMPLES.SWAP);
}

function hardTrade(state, seat, rng) {
  const v = viewOf(state, seat);
  const options = [null, ...giveUpOrder(v.hand, v.known, v.trump, v.rivals)];
  return bestBySim(state, seat, rng, options, (s, card) => simTrump(s, card), SAMPLES.TRUMP);
}

function hardPlay(state, seat, rng) {
  const trump = SUITS.indexOf(state.trumpSuit);
  const allowed = allowedPlays(state, seat).map(toInt);
  // Cheapest first, so a choice that makes no difference spends the least.
  const ranked = [...allowed].sort((a, b) => (suitOf(a) === trump) - (suitOf(b) === trump) || rankOf(a) - rankOf(b));
  return bestBySim(state, seat, rng, ranked, (s, c) => simPlay(s, seat, c), SAMPLES.PLAY);
}

// ---- Entry points ----------------------------------------------------------------

const MOVES = {
  EASY: { decide: easyDecide, discards: easyDiscards, trade: mediumTrade, play: easyPlay },
  MEDIUM: { decide: mediumDecide, discards: mediumDiscards, trade: mediumTrade, play: mediumPlay },
  HARD: { decide: hardDecide, discards: hardDiscards, trade: hardTrade, play: hardPlay },
};

/** The move for whoever's turn it is, at their level. */
export function aiAction(state, rng = Math.random) {
  const seat = state.turn;
  const level = MOVES[state.players[seat]?.level] ?? MOVES.MEDIUM;
  switch (state.phase) {
    case PHASES.DRAW:
      // No card is better than another sight unseen: any depth will do.
      return { type: "drawForDeal", seat, depth: 1 + Math.floor(rng() * maxDrawDepth(state)) };
    case PHASES.DECIDE:
      return { type: "decide", seat, play: !canFold(state, seat) || level.decide(state, seat, rng) };
    case PHASES.SWAP:
      return { type: "swap", seat, cardIds: level.discards(state, seat, rng).map(idOf) };
    case PHASES.TRUMP: {
      const card = level.trade(state, seat, rng);
      return { type: "takeTrump", seat, cardId: card === null ? null : idOf(card) };
    }
    case PHASES.PLAY:
      return { type: "play", seat, cardId: idOf(level.play(state, seat, rng)) };
    default:
      return null;
  }
}

/** Runs an action (from the AI or the player) through the engine. */
export function applyAction(state, action, rng) {
  switch (action.type) {
    case "drawForDeal":
      return drawForDeal(state, action.seat, action.depth, rng);
    case "decide":
      return decide(state, action.seat, action.play);
    case "swap":
      return swap(state, action.seat, action.cardIds);
    case "takeTrump":
      return takeTrump(state, action.seat, action.cardId);
    case "play":
      return playCard(state, action.seat, action.cardId);
    case "collect":
      return collectTrick(state);
    default:
      throw new Error(`Unknown action ${action.type}`);
  }
}
