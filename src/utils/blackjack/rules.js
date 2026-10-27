// BLACKJACK RULES — the shoe, hand totals and payouts as pure functions.
//
// Six decks (312 cards) are shuffled into one shoe; the table reshuffles once
// the cut card (CUT_CARD cards dealt) has been passed. The dealer stands on
// every 17, soft ones included. A blackjack (an Ace and a ten-card as the
// first two cards, not after a split) pays 3:2; other wins pay 1:1.
//
// Nothing here touches React, timers or sockets: the browser's practice table
// and the server's online tables run the same file (server/game/blackjack/ is
// a byte-identical copy). Randomness comes in through an `rng` argument
// (default secureRandom) so tests can make it predictable.

export const DECKS = 6;
export const CUT_CARD = 234;
export const MIN_BET = 10;
export const MAX_HANDS = 4;
export const MAX_SEATS = 5;
export const FREE_CHIPS = 1000;

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUITS = ["♠", "♥", "♦", "♣"];

/** A random number in [0, 1) from the platform's secure generator. */
export function secureRandom() {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) return Math.random();
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

export function shuffle(cards, rng = secureRandom) {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `deck` (0–5) keeps the six copies of a card distinct. */
export function makeCard(rank, suit, deck = 0) {
  return { id: `${rank}${suit}.${deck}`, rank, suit };
}

export function createShoe(rng = secureRandom) {
  const shoe = [];
  for (let deck = 0; deck < DECKS; deck++) {
    for (const suit of SUITS) for (const rank of RANKS) shoe.push(makeCard(rank, suit, deck));
  }
  return shuffle(shoe, rng);
}

/** 2–10 as printed, J/Q/K 10, Ace 1 (handTotal promotes one to 11). */
export function cardPoints(card) {
  if (card.rank === "A") return 1;
  if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return 10;
  return Number(card.rank);
}

/** `soft`: an Ace is counted as 11. */
export function handTotal(cards) {
  const total = cards.reduce((sum, c) => sum + cardPoints(c), 0);
  const hasAce = cards.some((c) => c.rank === "A");
  if (hasAce && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

/** hand = { cards, fromSplit }. A 21 made after a split is just 21. */
export function isBlackjack(hand) {
  return !hand.fromSplit && hand.cards.length === 2 && handTotal(hand.cards).total === 21;
}

/** The dealer draws below 17 and stands on soft 17. */
export function dealerShouldHit(cards) {
  return handTotal(cards).total < 17;
}

export function insuranceCost(bet) {
  return Math.floor(bet / 2);
}

/** `hand.bet` already includes a double. `payout` is everything returned, stake included. */
export function settleHand(hand, dealerCards) {
  const bet = hand.bet;
  const player = handTotal(hand.cards).total;
  if (player > 21) return { result: "lose", payout: 0 };

  const dealerNatural = isBlackjack({ cards: dealerCards, fromSplit: false });
  if (isBlackjack(hand)) {
    if (dealerNatural) return { result: "push", payout: bet };
    return { result: "blackjack", payout: bet + Math.floor((bet * 3) / 2) };
  }
  if (dealerNatural) return { result: "lose", payout: 0 };

  const dealer = handTotal(dealerCards).total;
  if (dealer > 21 || player > dealer) return { result: "win", payout: bet * 2 };
  if (player === dealer) return { result: "push", payout: bet };
  return { result: "lose", payout: 0 };
}
