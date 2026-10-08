// Poker test helpers: readable cards, tables seated to order, and dealt hands
// with the cards a test wants (a real startHand, then its cards replaced).

import { makeCard } from "../../src/utils/poker/hands.js";

/** pc("A♠ 10♦") -> card objects. */
export const pc = (ids) =>
  ids.trim() ? ids.trim().split(/\s+/).map((id) => makeCard(id.slice(0, -1), id.slice(-1))) : [];

export { seededRandom } from "./cards.js";
