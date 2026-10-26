import { fmt } from "../../utils/poker/tiers";

/** "NOVSH #1231 (CPU)" -> "NOVSH": a covered seat's pot is its player's. */
const shortName = (name = "") => name.split(" #")[0].replace(/ \(CPU\)$/, "");

/**
 * A credit match's result as one line for the log: who took the pot, or that
 * a bot did. names: each seat's name, in seat order.
 */
export function potText(result, names) {
  if (result.void) return "The match didn't count: every stake went back.";
  const winners = result.payouts.map((p) => shortName(names[p.seat]));
  if (!winners.length) return `A bot won: the ${fmt(result.pot)} pot is lost.`;
  if (winners.length === 1) return `${winners[0]} wins the ${fmt(result.pot)} pot.`;
  return `${winners.join(" and ")} split the ${fmt(result.pot)} pot.`;
}
