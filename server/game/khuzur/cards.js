// KHUZUR CARDS — the card order, valid leads and covering a layer, as pure
// functions (docs/khuzur-rulebook.md §1, §5, §6). The engine and the CPU both
// build on these; nothing here touches React, timers or sockets.
//
// Every card falls in one line, weakest first: plain cards by rank then suit,
// then trumps by rank, then the gray joker, then the colored joker. A card
// beats another only if it is strictly higher in that line, so twins (the
// 7-card game's second deck) never beat each other.

export const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUITS = ["♦", "♣", "♥", "♠"]; // lowest to highest
export const HAND_SIZES = [5, 7];
export const LEAD_SIZES = [1, 3, 5, 7];

const TRUMP_BASE = RANKS.length * SUITS.length; // 32: the weakest trump
const JOKER_POWER = { gray: TRUMP_BASE + RANKS.length, color: TRUMP_BASE + RANKS.length + 1 };

/** A card from the first deck (copy 1) or the second (copy 2, id "J♠:2"). */
export function makeCard(rank, suit, copy = 1) {
  return {
    id: copy === 1 ? `${rank}${suit}` : `${rank}${suit}:${copy}`,
    rank,
    suit,
    rankValue: RANKS.indexOf(rank),
    suitValue: SUITS.indexOf(suit),
    copy,
  };
}

/** The gray ("gray") or colored ("color") joker. There is only ever one of each. */
export function makeJoker(kind) {
  return { id: kind === "gray" ? "GJ" : "CJ", rank: "JOKER", suit: null, joker: kind };
}

/** The 5-card game's 34 cards, or the 7-card game's 66 (7–A twice, one of each joker). */
export function createDeck(handSize) {
  if (!HAND_SIZES.includes(handSize)) throw new Error(`No ${handSize}-card game`);
  const copies = handSize === 7 ? [1, 2] : [1];
  const plain = copies.flatMap((copy) => SUITS.flatMap((suit) => RANKS.map((rank) => makeCard(rank, suit, copy))));
  return [...plain, makeJoker("gray"), makeJoker("color")];
}

export const isJoker = (card) => card.rank === "JOKER";
export const isTrump = (card, trumpSuit) => !isJoker(card) && card.suit === trumpSuit;

/** The card's place in the one line every card falls in (0 = 7♦ with no trump). */
export function cardPower(card, trumpSuit) {
  if (isJoker(card)) return JOKER_POWER[card.joker];
  if (card.suit === trumpSuit) return TRUMP_BASE + card.rankValue;
  return card.rankValue * SUITS.length + card.suitValue;
}

export const beats = (a, b, trumpSuit) => cardPower(a, trumpSuit) > cardPower(b, trumpSuit);

/**
 * 1, 3, 5 or 7 cards where every card has a partner of the same rank except
 * at most one (the lonely card). A joker never has a partner.
 */
export function isValidLead(cards) {
  if (!LEAD_SIZES.includes(cards.length)) return false;
  const counts = new Map();
  for (const card of cards) {
    const key = isJoker(card) ? card.id : card.rank;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let lonely = 0;
  for (const n of counts.values()) if (n === 1) lonely++;
  return lonely <= 1;
}

/**
 * The cards reordered so result[i] beats layer[i], or null if they can't
 * cover the layer. "Beats" is a threshold on one line, so pairing both sides
 * sorted weakest first finds a cover whenever one exists.
 */
export function coverAssignment(layer, cards, trumpSuit) {
  if (layer.length !== cards.length) return null;
  const power = (card) => cardPower(card, trumpSuit);
  const columns = layer.map((card, i) => i).sort((a, b) => power(layer[a]) - power(layer[b]));
  const sorted = [...cards].sort((a, b) => power(a) - power(b));
  const result = new Array(layer.length);
  for (let k = 0; k < columns.length; k++) {
    const col = columns[k];
    if (power(sorted[k]) <= power(layer[col])) return null;
    result[col] = sorted[k];
  }
  return result;
}

/** A number in [0, 1) from the platform's cryptographic generator. */
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
