// HAND EVALUATOR - Combination Validation & Comparison

import { COMBO_TYPES, POKER_COMBO_STRENGTH, RANK_VALUES } from "./constants.js";
import {
  groupByRank,
  groupBySuit,
  sortHand,
  compareCards,
} from "./deckUtils.js";

// COMBINATION DETECTION

/**
 * Identifies what type of combination the cards form
 * @param {Array} cards - Selected cards
 * @returns {Object|null} { type, rank, cards, metadata } or null if invalid
 */
export const identifyCombination = (cards) => {
  if (!cards || cards.length === 0) return null;

  const sorted = sortHand(cards);
  const length = sorted.length;

  // Single card
  if (length === 1) {
    return {
      type: COMBO_TYPES.SINGLE,
      rank: sorted[0].rankValue,
      highCard: sorted[0],
      cards: sorted,
    };
  }

  // Pair (2 cards)
  if (length === 2) {
    return validatePair(sorted);
  }

  // Triple (3 cards)
  if (length === 3) {
    return validateTriple(sorted);
  }

  // Four of a Kind (4 cards)
  if (length === 4) {
    return validateFourOfAKind(sorted);
  }

  // 5-card poker combinations
  if (length === 5) {
    return validate5CardHand(sorted);
  }

  return null; // Invalid combination
};

// BASIC COMBINATIONS (2-4 cards)

/**
 * Validates a pair (2 cards of same rank)
 */
const validatePair = (cards) => {
  if (cards.length !== 2) return null;

  if (cards[0].rank === cards[1].rank) {
    return {
      type: COMBO_TYPES.PAIR,
      rank: cards[0].rankValue,
      highCard: cards[1], // Higher suit
      cards,
    };
  }

  return null;
};

/**
 * Validates a triple (3 cards of same rank)
 */
const validateTriple = (cards) => {
  if (cards.length !== 3) return null;

  if (cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank) {
    return {
      type: COMBO_TYPES.TRIPLE,
      rank: cards[0].rankValue,
      highCard: cards[2], // Highest suit
      cards,
    };
  }

  return null;
};

/**
 * Validates four of a kind (4 cards of same rank)
 */
const validateFourOfAKind = (cards) => {
  if (cards.length !== 4) return null;

  const allSameRank = cards.every((card) => card.rank === cards[0].rank);

  if (allSameRank) {
    return {
      type: COMBO_TYPES.FOUR_OF_A_KIND,
      rank: cards[0].rankValue,
      highCard: cards[3], // Highest suit
      cards,
    };
  }

  return null;
};

// 5-CARD POKER COMBINATIONS

/**
 * Validates and identifies 5-card poker hands
 */
const validate5CardHand = (cards) => {
  if (cards.length !== 5) return null;

  const isFlush = checkFlush(cards);
  const straightInfo = checkStraight(cards);
  const isStraight = straightInfo !== null;

  // Royal Flush: A-K-Q-J-10 of same suit
  if (isFlush && isStraight && straightInfo.highRank === RANK_VALUES["A"]) {
    return {
      type: COMBO_TYPES.ROYAL_FLUSH,
      rank: straightInfo.highRank,
      highCard: straightInfo.highCard,
      strength: POKER_COMBO_STRENGTH[COMBO_TYPES.ROYAL_FLUSH],
      cards,
    };
  }

  // Straight Flush: Sequence of same suit
  if (isFlush && isStraight) {
    return {
      type: COMBO_TYPES.STRAIGHT_FLUSH,
      rank: straightInfo.highRank,
      highCard: straightInfo.highCard,
      strength: POKER_COMBO_STRENGTH[COMBO_TYPES.STRAIGHT_FLUSH],
      cards,
    };
  }

  // Full House: 3 of a kind + pair
  const fullHouse = checkFullHouse(cards);
  if (fullHouse) {
    return {
      type: COMBO_TYPES.FULL_HOUSE,
      rank: fullHouse.tripleRank,
      pairRank: fullHouse.pairRank,
      highCard: fullHouse.highCard,
      strength: POKER_COMBO_STRENGTH[COMBO_TYPES.FULL_HOUSE],
      cards,
    };
  }

  // Flush: All same suit
  if (isFlush) {
    return {
      type: COMBO_TYPES.FLUSH,
      rank: cards[4].rankValue, // Highest card
      highCard: cards[4],
      strength: POKER_COMBO_STRENGTH[COMBO_TYPES.FLUSH],
      cards,
    };
  }

  // Straight: Sequence of 5 cards
  if (isStraight) {
    return {
      type: COMBO_TYPES.STRAIGHT,
      rank: straightInfo.highRank,
      highCard: straightInfo.highCard,
      strength: POKER_COMBO_STRENGTH[COMBO_TYPES.STRAIGHT],
      cards,
    };
  }

  return null; // Not a valid 5-card combination
};

// 5-CARD HELPER FUNCTIONS

/**
 * Checks if all cards are the same suit
 */
const checkFlush = (cards) => {
  const firstSuit = cards[0].suit;
  return cards.every((card) => card.suit === firstSuit);
};

// Only A and 2 may wrap around to the bottom. These runs are topped by their
// last card (the 5 or the 6), which makes them the two lowest straights.
const WRAPAROUND_STRAIGHTS = [
  ["A", "2", "3", "4", "5"],
  ["2", "3", "4", "5", "6"],
];

/**
 * Checks if cards form a straight (sequence)
 * Ranks run 3 up to 2; A-2-3-4-5 and 2-3-4-5-6 also count (see above)
 */
const checkStraight = (cards) => {
  const sorted = sortHand(cards);

  // Check for consecutive ranks
  const consecutive = sorted.every(
    (card, i) => i === 0 || card.rankValue === sorted[i - 1].rankValue + 1,
  );
  if (consecutive) {
    return {
      highRank: sorted[4].rankValue,
      highCard: sorted[4],
    };
  }

  const wrap = WRAPAROUND_STRAIGHTS.find((run) =>
    run.every((rank) => cards.some((card) => card.rank === rank)),
  );
  if (!wrap) return null;
  const top = cards.find((card) => card.rank === wrap[4]);
  return {
    highRank: top.rankValue,
    highCard: top,
  };
};

/**
 * Checks if cards form a full house (3 of a kind + pair)
 */
const checkFullHouse = (cards) => {
  const grouped = groupByRank(cards);
  const ranks = Object.keys(grouped);

  if (ranks.length !== 2) return null;

  const counts = ranks.map((rank) => grouped[rank].length).sort();

  // Must have exactly 2 and 3 cards of different ranks
  if (counts[0] === 2 && counts[1] === 3) {
    const tripleRank = ranks.find((rank) => grouped[rank].length === 3);
    const pairRank = ranks.find((rank) => grouped[rank].length === 2);

    const tripleCards = grouped[tripleRank];
    const highCard = tripleCards[tripleCards.length - 1];

    return {
      tripleRank: RANK_VALUES[tripleRank],
      pairRank: RANK_VALUES[pairRank],
      highCard,
    };
  }

  return null;
};

// --------------------------------------------
// COMBINATION COMPARISON
// --------------------------------------------

/**
 * Compares two combinations to determine which is stronger
 * @param {Object} combo1 - First combination
 * @param {Object} combo2 - Second combination (current play on table)
 * @returns {Boolean} True if combo1 beats combo2
 */
export const canBeatCombination = (combo1, combo2) => {
  if (!combo1 || !combo2) return false;

  // Must be same type (except 5-card hands have special rules)
  const is5Card1 = combo1.cards.length === 5;
  const is5Card2 = combo2.cards.length === 5;

  // Different number of cards (not 5-card): cannot beat
  if (combo1.cards.length !== combo2.cards.length && (!is5Card1 || !is5Card2)) {
    return false;
  }

  // Both are 5-card hands
  if (is5Card1 && is5Card2) {
    return compare5CardHands(combo1, combo2);
  }

  // Same basic combination type
  return compareBasicCombinations(combo1, combo2);
};

/**
 * Compares basic combinations (single, pair, triple, four-of-a-kind)
 */
const compareBasicCombinations = (combo1, combo2) => {
  // Different types cannot beat each other
  if (combo1.type !== combo2.type) return false;

  // Compare by rank first
  if (combo1.rank !== combo2.rank) {
    return combo1.rank > combo2.rank;
  }

  // Same rank: compare highest card (suit becomes tiebreaker)
  return compareCards(combo1.highCard, combo2.highCard) > 0;
};

/**
 * Compares 5-card poker hands
 */
const compare5CardHands = (combo1, combo2) => {
  // Compare by poker hand strength first
  if (combo1.strength !== combo2.strength) {
    return combo1.strength > combo2.strength;
  }

  // Flushes: the higher suit wins; on the same suit, the higher top card
  if (
    combo1.type === COMBO_TYPES.FLUSH &&
    combo1.highCard.suitValue !== combo2.highCard.suitValue
  ) {
    return combo1.highCard.suitValue > combo2.highCard.suitValue;
  }

  // Same hand type: compare by rank
  if (combo1.rank !== combo2.rank) {
    return combo1.rank > combo2.rank;
  }

  // For Full House: also check pair rank
  if (
    combo1.type === COMBO_TYPES.FULL_HOUSE &&
    combo1.pairRank !== combo2.pairRank
  ) {
    return combo1.pairRank > combo2.pairRank;
  }

  // Same rank: compare highest card suit
  return compareCards(combo1.highCard, combo2.highCard) > 0;
};

// VALIDATION HELPERS

/**
 * Checks if a play is valid given the current table state
 * @param {Array} selectedCards - Cards player wants to play
 * @param {Object|null} currentPlay - Current combination on table
 * @returns {Object} { valid: boolean, reason: string, combination: Object }
 */
export const validatePlay = (selectedCards, currentPlay) => {
  // Identify what combination the selected cards form
  const combo = identifyCombination(selectedCards);

  if (!combo) {
    return {
      valid: false,
      reason: "Invalid combination",
      combination: null,
    };
  }

  // First play of the round: any valid combination allowed
  if (!currentPlay) {
    return {
      valid: true,
      reason: "Valid play",
      combination: combo,
    };
  }

  // Must beat the current play
  const beats = canBeatCombination(combo, currentPlay);

  if (!beats) {
    return {
      valid: false,
      reason: "Must play a stronger combination",
      combination: combo,
    };
  }

  return {
    valid: true,
    reason: "Valid play",
    combination: combo,
  };
};

/**
 * Finds all valid plays from a hand given current table state
 * @param {Array} hand - Player's cards
 * @param {Object|null} currentPlay - Current combination on table
 * @returns {Array} Array of possible valid plays
 */
export const findValidPlays = (hand, currentPlay) => {
  const validPlays = [];

  // If no current play, return all possible combinations
  if (!currentPlay) {
    // This is complex - for now return empty array
    // AI will use this function in aiPlayer.js
    return validPlays;
  }

  // Generate all possible combinations of same length
  const targetLength = currentPlay.cards.length;
  const combinations = generateCombinations(hand, targetLength);

  for (const cards of combinations) {
    const validation = validatePlay(cards, currentPlay);
    if (validation.valid) {
      validPlays.push(validation.combination);
    }
  }

  return validPlays;
};

/**
 * Generates all combinations of specific length from hand
 */
const generateCombinations = (hand, length) => {
  const results = [];

  const combine = (start, combo) => {
    if (combo.length === length) {
      results.push([...combo]);
      return;
    }

    for (let i = start; i < hand.length; i++) {
      combo.push(hand[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  };

  combine(0, []);
  return results;
};

export default {
  identifyCombination,
  canBeatCombination,
  validatePlay,
  findValidPlays,
};
