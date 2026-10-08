// Poker test helpers: readable cards, tables seated to order, and dealt hands
// with the cards a test wants (a real startHand, then its cards replaced).

import { createDeck, makeCard } from "../../src/utils/poker/hands.js";
import { createTable, sit, startHand } from "../../src/utils/poker/engine.js";

/** pc("A♠ 10♦") -> card objects. */
export const pc = (ids) =>
  ids.trim() ? ids.trim().split(/\s+/).map((id) => makeCard(id.slice(0, -1), id.slice(-1))) : [];

export { seededRandom } from "./cards.js";

/** A table with `stacks[i]` chips at seat i (null: empty seat). Everyone human. */
export function tableWith(stacks, opts) {
  let s = createTable(opts);
  stacks.forEach((stack, seat) => {
    if (stack != null) s = sit(s, seat, { name: `P${seat}`, key: `k${seat}`, stack });
  });
  return s;
}

/**
 * Starts a hand with the button on `button`, then gives the players `holes`
 * ({ seat: "A♠ K♦" }; others get spare cards) and stacks the deck so the
 * board comes out as `board` (all 5 cards, or none to leave it random).
 */
export function dealt(state, { button, holes = {}, board = "" }) {
  // startHand moves the button one seat on from the last one.
  const before = { ...state, button: (button + state.seats.length - 1) % state.seats.length };
  let s = startHand(before, () => 0);
  // Seats left of the old button are skipped if empty: put it back where asked.
  if (s.button !== button) throw new Error(`button landed on ${s.button}, not ${button}`);
  const b = pc(board);
  const used = new Set([...Object.values(holes).flatMap((h) => pc(h)), ...b].map((c) => c.id));
  const spare = createDeck().filter((c) => !used.has(c.id));
  const seats = s.seats.map((p, i) => (p?.inHand ? { ...p, hole: holes[i] ? pc(holes[i]) : [spare.pop(), spare.pop()] } : p));
  // The deck deals from its end: burn, 3 flop cards, burn, turn, burn, river.
  const top = b.length ? [spare.pop(), b[0], b[1], b[2], spare.pop(), b[3], spare.pop(), b[4]] : [];
  return { ...s, seats, deck: [...spare, ...top.reverse()] };
}
