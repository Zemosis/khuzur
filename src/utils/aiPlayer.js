import { COMBO_TYPES, RANK_VALUES, RANKS } from "./constants.js";
import {
  groupByRank,
  groupBySuit,
  sortHand,
  findLowestCard,
} from "./deckUtils.js";
import {
  identifyCombination,
  validatePlay,
} from "./handEvaluator.js";

// ============================================================
// ENTRY POINT
// ============================================================

export const makeAIDecision = (player, currentPlay, gameState) => {
  const difficulty = gameState.aiDifficulty || "MEDIUM";

  switch (difficulty) {
    case "EASY":
      return makeEasyDecision(player, currentPlay, gameState);
    case "HARD":
      return makeHardDecision(player, currentPlay, gameState);
    default:
      return makeMediumDecision(player, currentPlay, gameState);
  }
};

// ============================================================
// EASY — "The Fumbler"
// Always plays if it can. Leads with lowest single. No strategy.
// ============================================================

const makeEasyDecision = (player, currentPlay) => {
  const hand = player.hand;

  if (!currentPlay) {
    return easyLeadPlay(hand);
  }

  return easyRespondPlay(hand, currentPlay);
};

const easyLeadPlay = (hand) => {
  const lowestCard = findLowestCard(hand);
  return { action: "play", cards: [lowestCard] };
};

const easyRespondPlay = (hand, currentPlay) => {
  const validPlays = findValidPlaysFromHand(hand, currentPlay);

  if (validPlays.length === 0) {
    return { action: "pass", cards: null };
  }

  validPlays.sort((a, b) => a.rank - b.rank);
  return { action: "play", cards: validPlays[0].cards };
};

// ============================================================
// MEDIUM — "The Competent Player"
// Deterministic rules, pair preservation, 2s management.
// ============================================================

const makeMediumDecision = (player, currentPlay, gameState) => {
  const hand = player.hand;

  if (!currentPlay) {
    return mediumLeadPlay(hand, gameState);
  }

  return mediumRespondPlay(hand, currentPlay, gameState);
};

const mediumLeadPlay = (hand, gameState) => {
  if (hand.length === 1) {
    return { action: "play", cards: hand };
  }

  const groups = groupByRank(hand);
  const ranksAsc = Object.keys(groups).sort(
    (a, b) => RANK_VALUES[a] - RANK_VALUES[b],
  );

  for (const rank of ranksAsc) {
    if (RANK_VALUES[rank] >= 12) continue; // save 2s

    const group = groups[rank];

    if (group.length === 4) {
      return { action: "play", cards: group };
    }
    if (group.length === 3) {
      return { action: "play", cards: group };
    }
  }

  for (const rank of ranksAsc) {
    if (RANK_VALUES[rank] >= 12) continue;
    if (groups[rank].length === 2) {
      return { action: "play", cards: groups[rank] };
    }
  }

  if (hand.length >= 5) {
    const fiveCard = findBest5CardCombo(hand);
    if (fiveCard) {
      return { action: "play", cards: fiveCard };
    }
  }

  // lowest single that isn't part of a pair and isn't a 2
  const sorted = sortHand(hand);
  for (const card of sorted) {
    if (card.rankValue >= 12) continue;
    if (groups[card.rank].length === 1) {
      return { action: "play", cards: [card] };
    }
  }

  // fallback: lowest single even if part of pair (but not a 2)
  for (const card of sorted) {
    if (card.rankValue >= 12) continue;
    return { action: "play", cards: [card] };
  }

  // only 2s left
  return { action: "play", cards: [sorted[0]] };
};

const mediumRespondPlay = (hand, currentPlay, gameState) => {
  const validPlays = findValidPlaysFromHand(hand, currentPlay);

  if (validPlays.length === 0) {
    return { action: "pass", cards: null };
  }

  validPlays.sort((a, b) => a.rank - b.rank);

  const opponentDanger = isOpponentDangerous(gameState);

  if (hand.length <= 3) {
    return { action: "play", cards: validPlays[0].cards };
  }

  // filter out plays that use only Aces/2s
  const cheapPlays = validPlays.filter(
    (p) => !p.cards.every((c) => c.rankValue >= 11),
  );

  if (cheapPlays.length > 0) {
    return { action: "play", cards: cheapPlays[0].cards };
  }

  // only expensive plays remain — play if opponent is dangerous
  if (opponentDanger) {
    return { action: "play", cards: validPlays[0].cards };
  }

  return { action: "pass", cards: null };
};

// Any opponent (human or CPU) one good play from going out is worth spending
// aces and 2s to stop. The CPU deciding is the current player, so skip it.
const isOpponentDangerous = (gameState) => {
  return gameState.players.some(
    (p, i) =>
      i !== gameState.currentPlayerIndex &&
      !p.isEliminated &&
      p.hand.length > 0 &&
      p.hand.length <= 3,
  );
};

// ============================================================
// HARD — "The Card Counter"
// Card tracking, hand decomposition, strategic play/pass.
// ============================================================

const makeHardDecision = (player, currentPlay, gameState) => {
  const hand = player.hand;
  const tracker = buildCardTracker(gameState, hand);
  const plan = decomposeHand(hand);

  if (!currentPlay) {
    return hardLeadPlay(hand, gameState, tracker, plan);
  }

  return hardRespondPlay(hand, currentPlay, gameState, tracker, plan);
};

const hardLeadPlay = (hand, gameState, tracker, plan) => {
  if (hand.length === 1) {
    return { action: "play", cards: hand };
  }

  // endgame: play unbeatable cards to chain leads
  if (hand.length <= 5) {
    const unbeatables = findUnbeatableCards(hand, tracker);
    if (unbeatables.length > 0) {
      // play lowest non-unbeatable card first (save unbeatables for control)
      const expendable = hand.filter(
        (c) => !unbeatables.some((u) => u.id === c.id),
      );
      if (expendable.length > 0) {
        const lowest = findLowestCard(expendable);
        return { action: "play", cards: [lowest] };
      }
      // all cards are unbeatable — play lowest
      return { action: "play", cards: [findLowestCard(hand)] };
    }
  }

  // lead from planned combos (largest first to shed cards faster)
  const plannedMulti = plan.plays.filter((p) => p.cards.length > 1);
  plannedMulti.sort((a, b) => {
    if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
    const aMin = Math.min(...a.cards.map((c) => c.rankValue));
    const bMin = Math.min(...b.cards.map((c) => c.rankValue));
    return aMin - bMin;
  });

  for (const combo of plannedMulti) {
    // don't lead with combos that contain 2s unless endgame
    if (combo.cards.some((c) => c.rankValue >= 12) && hand.length > 5) continue;
    return { action: "play", cards: combo.cards };
  }

  // lead with lowest single that isn't in a planned multi-card combo and isn't a 2
  const plannedMultiCardIds = new Set(
    plannedMulti.flatMap((p) => p.cards.map((c) => c.id)),
  );
  const freeSingles = sortHand(
    hand.filter((c) => !plannedMultiCardIds.has(c.id) && c.rankValue < 12),
  );

  if (freeSingles.length > 0) {
    return { action: "play", cards: [freeSingles[0]] };
  }

  // fallback: lowest single not a 2
  const sorted = sortHand(hand);
  for (const card of sorted) {
    if (card.rankValue < 12) {
      return { action: "play", cards: [card] };
    }
  }

  return { action: "play", cards: [sorted[0]] };
};

const hardRespondPlay = (hand, currentPlay, gameState, tracker, plan) => {
  const validPlays = findValidPlaysFromHand(hand, currentPlay);

  if (validPlays.length === 0) {
    return { action: "pass", cards: null };
  }

  validPlays.sort((a, b) => a.rank - b.rank);

  // always play with ≤3 cards
  if (hand.length <= 3) {
    return { action: "play", cards: validPlays[0].cards };
  }

  // always block dangerous opponents
  const dangerousOpponents = gameState.players.filter(
    (p, i) =>
      i !== gameState.currentPlayerIndex &&
      !p.isEliminated &&
      p.hand.length > 0 &&
      p.hand.length <= 3,
  );

  if (dangerousOpponents.length > 0) {
    return { action: "play", cards: validPlays[0].cards };
  }

  // classify plays as "free" or "costly"
  const plannedMultiCardIds = new Set(
    plan.plays
      .filter((p) => p.cards.length > 1)
      .flatMap((p) => p.cards.map((c) => c.id)),
  );

  const freePlays = validPlays.filter(
    (p) => !p.cards.some((c) => plannedMultiCardIds.has(c.id)),
  );

  if (freePlays.length > 0) {
    return { action: "play", cards: freePlays[0].cards };
  }

  // costly play — check if we have an unbeatable card to reclaim lead
  const unbeatables = findUnbeatableCards(hand, tracker);
  if (unbeatables.length > 0) {
    // worth spending a combo if we can get lead back with an unbeatable
    return { action: "play", cards: validPlays[0].cards };
  }

  // pass to preserve hand structure
  return { action: "pass", cards: null };
};

// ============================================================
// HARD MODE HELPERS
// ============================================================

const buildCardTracker = (gameState, playerHand) => {
  const playedCards = new Set();

  for (const move of gameState.moveHistory) {
    if (move.action === "play" && move.cards) {
      for (const card of move.cards) {
        playedCards.add(card.id);
      }
    }
  }

  const handIds = new Set(playerHand.map((c) => c.id));

  const remainingHighCards = [];
  for (const rank of ["A", "2"]) {
    for (const suit of ["♦", "♣", "♥", "♠"]) {
      const id = `${rank}${suit}`;
      if (!playedCards.has(id) && !handIds.has(id)) {
        remainingHighCards.push({ rank, suit, id, rankValue: RANK_VALUES[rank] });
      }
    }
  }

  const opponentCardCounts = gameState.players.map((p) => p.hand.length);

  return { playedCards, remainingHighCards, opponentCardCounts };
};

const decomposeHand = (hand) => {
  const plays = [];
  const used = new Set();

  const groups = groupByRank(hand);
  const ranksDesc = Object.keys(groups).sort(
    (a, b) => RANK_VALUES[b] - RANK_VALUES[a],
  );

  // extract quads
  for (const rank of ranksDesc) {
    if (groups[rank].length === 4 && !groups[rank].some((c) => used.has(c.id))) {
      plays.push({ type: COMBO_TYPES.FOUR_OF_A_KIND, cards: groups[rank] });
      groups[rank].forEach((c) => used.add(c.id));
    }
  }

  // extract triples
  for (const rank of ranksDesc) {
    const available = groups[rank].filter((c) => !used.has(c.id));
    if (available.length >= 3) {
      const triple = available.slice(0, 3);
      plays.push({ type: COMBO_TYPES.TRIPLE, cards: triple });
      triple.forEach((c) => used.add(c.id));
    }
  }

  // extract pairs
  for (const rank of ranksDesc) {
    const available = groups[rank].filter((c) => !used.has(c.id));
    if (available.length >= 2) {
      const pair = available.slice(0, 2);
      plays.push({ type: COMBO_TYPES.PAIR, cards: pair });
      pair.forEach((c) => used.add(c.id));
    }
  }

  // check remaining for straights
  const remaining = hand.filter((c) => !used.has(c.id));
  if (remaining.length >= 5) {
    const straights = findStraights(remaining);
    if (straights.length > 0) {
      const straight = straights[0];
      plays.push({ type: COMBO_TYPES.STRAIGHT, cards: straight });
      straight.forEach((c) => used.add(c.id));
    }
  }

  // check remaining for flushes
  const remaining2 = hand.filter((c) => !used.has(c.id));
  if (remaining2.length >= 5) {
    const flushes = findFlushes(remaining2);
    if (flushes.length > 0) {
      const flush = flushes[0];
      plays.push({ type: COMBO_TYPES.FLUSH, cards: flush });
      flush.forEach((c) => used.add(c.id));
    }
  }

  // remaining singles
  const leftover = hand.filter((c) => !used.has(c.id));
  for (const card of sortHand(leftover)) {
    plays.push({ type: COMBO_TYPES.SINGLE, cards: [card] });
  }

  return { plays, totalPlays: plays.length };
};

const findUnbeatableCards = (hand, tracker) => {
  const unbeatables = [];

  for (const card of hand) {
    let isHighest = true;

    // check if any unplayed card not in our hand can beat this as a single
    for (let rv = card.rankValue + 1; rv <= 12; rv++) {
      const rank = Object.keys(RANK_VALUES).find((k) => RANK_VALUES[k] === rv);
      if (!rank) continue;
      for (const suit of ["♦", "♣", "♥", "♠"]) {
        const id = `${rank}${suit}`;
        if (!tracker.playedCards.has(id) && !hand.some((c) => c.id === id)) {
          isHighest = false;
          break;
        }
      }
      if (!isHighest) break;
    }

    // also check same rank higher suit
    if (isHighest) {
      for (const suit of ["♦", "♣", "♥", "♠"]) {
        const suitVal = { "♦": 0, "♣": 1, "♥": 2, "♠": 3 }[suit];
        if (suitVal > card.suitValue) {
          const id = `${card.rank}${suit}`;
          if (!tracker.playedCards.has(id) && !hand.some((c) => c.id === id)) {
            isHighest = false;
            break;
          }
        }
      }
    }

    if (isHighest) {
      unbeatables.push(card);
    }
  }

  return unbeatables;
};

// ============================================================
// SHARED UTILITIES
// ============================================================

const findValidPlaysFromHand = (hand, currentPlay) => {
  const targetLength = currentPlay.cards.length;
  const possiblePlays = [];

  if (targetLength === 1) {
    for (const card of hand) {
      const validation = validatePlay([card], currentPlay);
      if (validation.valid) {
        possiblePlays.push(identifyCombination([card]));
      }
    }
  } else if (targetLength === 2) {
    const groups = groupByRank(hand);
    for (const rank of Object.keys(groups)) {
      if (groups[rank].length >= 2) {
        const pair = groups[rank].slice(0, 2);
        const validation = validatePlay(pair, currentPlay);
        if (validation.valid) {
          possiblePlays.push(identifyCombination(pair));
        }
      }
    }
  } else if (targetLength === 3) {
    const groups = groupByRank(hand);
    for (const rank of Object.keys(groups)) {
      if (groups[rank].length >= 3) {
        const triple = groups[rank].slice(0, 3);
        const validation = validatePlay(triple, currentPlay);
        if (validation.valid) {
          possiblePlays.push(identifyCombination(triple));
        }
      }
    }
  } else if (targetLength === 4) {
    const groups = groupByRank(hand);
    for (const rank of Object.keys(groups)) {
      if (groups[rank].length === 4) {
        const quad = groups[rank];
        const validation = validatePlay(quad, currentPlay);
        if (validation.valid) {
          possiblePlays.push(identifyCombination(quad));
        }
      }
    }
  } else if (targetLength === 5) {
    const fiveCardCombos = findAll5CardCombos(hand);
    for (const combo of fiveCardCombos) {
      const validation = validatePlay(combo, currentPlay);
      if (validation.valid) {
        possiblePlays.push(identifyCombination(combo));
      }
    }
  }

  return possiblePlays;
};

const findBest5CardCombo = (hand) => {
  const combos = findAll5CardCombos(hand);
  if (combos.length === 0) return null;

  for (const combo of combos) {
    const identified = identifyCombination(combo);
    if (
      identified &&
      [COMBO_TYPES.STRAIGHT, COMBO_TYPES.FLUSH, COMBO_TYPES.FULL_HOUSE].includes(
        identified.type,
      )
    ) {
      return combo;
    }
  }

  return combos[0];
};

const findAll5CardCombos = (hand) => {
  if (hand.length < 5) return [];

  const combos = [];
  combos.push(...findStraights(hand));
  combos.push(...findFlushes(hand));
  combos.push(...findFullHouses(hand));
  return combos;
};

// Every run of 5 ranks a straight can be, weakest first: the two that wrap
// (A-2-3-4-5, 2-3-4-5-6), then 3-4-5-6-7 up to J-Q-K-A-2.
const STRAIGHT_RUNS = [
  ["A", "2", "3", "4", "5"],
  ["2", "3", "4", "5", "6"],
  ...RANKS.slice(0, RANKS.length - 4).map((_, i) => RANKS.slice(i, i + 5)),
];

/** Each straight the hand can make, weakest first, with the lowest card of each rank. */
const findStraights = (hand) => {
  const groups = groupByRank(hand);
  return STRAIGHT_RUNS.filter((run) => run.every((rank) => groups[rank])).map(
    (run) => sortHand(run.map((rank) => sortHand(groups[rank])[0])),
  );
};

const findFlushes = (hand) => {
  const groups = groupBySuit(hand);
  const flushes = [];

  for (const suit of Object.keys(groups)) {
    if (groups[suit].length >= 5) {
      const sorted = sortHand(groups[suit]);
      flushes.push(sorted.slice(0, 5));
      // A flush of the same suit is beaten by a higher top card: also try
      // the four lowest under the highest.
      if (sorted.length > 5) flushes.push([...sorted.slice(0, 4), sorted.at(-1)]);
    }
  }

  return flushes;
};

const findFullHouses = (hand) => {
  const groups = groupByRank(hand);
  const fullHouses = [];

  const triples = [];
  const pairs = [];

  for (const rank of Object.keys(groups)) {
    if (groups[rank].length >= 3) {
      triples.push(groups[rank].slice(0, 3));
    }
    if (groups[rank].length >= 2) {
      pairs.push(groups[rank].slice(0, 2));
    }
  }

  for (const triple of triples) {
    for (const pair of pairs) {
      if (triple[0].rank !== pair[0].rank) {
        fullHouses.push([...triple, ...pair]);
      }
    }
  }

  return fullHouses;
};

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
