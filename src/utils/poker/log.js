// POKER LOG — a hand's events as the lines the table's LOG tab shows.
// Browser only (the server keeps no log text), so it isn't copied to server/.

const short = (name = "") => name.split(" #")[0];
const cardsText = (cards) => cards.map((c) => c.id).join(" ");
const STREET = { FLOP: "Flop", TURN: "Turn", RIVER: "River" };

/** One event as a line, naming players from `seats`; null for events not logged. */
export function eventLine(e, seats) {
  const who = short(seats[e.seat]?.name ?? `Seat ${e.seat + 1}`);
  switch (e.type) {
    case "hand":
      return `— Hand ${e.handNumber} —`;
    case "blind":
      return `${who} posts the ${e.kind} blind (${e.amount})`;
    case "act":
      return {
        fold: `${who} folds`,
        check: `${who} checks`,
        call: `${who} calls ${e.amount}`,
        bet: `${who} bets ${e.amount}`,
        raise: `${who} raises to ${e.amount}`,
        allin: `${who} is all-in for ${e.amount}`,
      }[e.action];
    case "street":
      return `${STREET[e.street]}: ${cardsText(e.cards)}`;
    case "show":
      return `${who} shows ${cardsText(e.cards)}`;
    case "award":
      return e.name ? `${who} wins ${e.amount} with ${e.name.charAt(0).toLowerCase()}${e.name.slice(1)}` : `${who} wins ${e.amount}`;
    default:
      return null;
  }
}
