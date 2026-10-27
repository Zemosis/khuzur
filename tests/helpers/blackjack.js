// Blackjack test helpers: readable card lists and a shoe rigged to deal an exact order.

import { makeCard, DECKS } from "../../src/utils/blackjack/rules.js";

const SHOE_SIZE = DECKS * 52;

/** "A♠ K♥ 10♦" → cards from deck 0. An id with a deck ("A♠.1") keeps it. */
export function cards(ids) {
  return ids
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [face, deck] = token.split(".");
      return makeCard(face.slice(0, -1), face.slice(-1), deck ? Number(deck) : 0);
    });
}

/** The given cards in deal order, padded to a full shoe with 2♣ so the cut card isn't reached. */
export function riggedShoe(ids) {
  const shoe = cards(ids);
  while (shoe.length < SHOE_SIZE) shoe.push(makeCard("2", "♣", 0));
  return shoe;
}
