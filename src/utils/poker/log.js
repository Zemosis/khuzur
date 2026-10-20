// POKER LOG — a hand's events as the table's LOG tab shows them: each one a
// line of text (eventLine), and an entry the tab draws (eventEntry): who,
// what they did as a coloured chip, the cards as card chips.
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
    case "return":
      return `${who} takes back ${e.amount} nobody called`;
    case "award":
      return e.name ? `${who} wins ${e.amount} with ${e.name.charAt(0).toLowerCase()}${e.name.slice(1)}` : `${who} wins ${e.amount}`;
    default:
      return null;
  }
}

const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * One event as a LOG tab entry (see GameChat's LogLine): { kind, text, … }
 * — "round" (a hand's header), "action" (a blind or a move: name, action,
 * amount), "street" (label, cards), "play" (a hand shown: name, combo,
 * cards), "pass" (a bet nobody called coming back), "win" (name, amount,
 * hand). `text` is the line eventLine gives. null for events not logged.
 */
export function eventEntry(e, seats) {
  const text = eventLine(e, seats);
  if (!text) return null;
  const name = short(seats[e.seat]?.name ?? `Seat ${e.seat + 1}`);
  switch (e.type) {
    case "hand":
      return { kind: "round", label: `HAND ${e.handNumber}`, text };
    case "blind":
      return { kind: "action", name, action: e.kind === "small" ? "sb" : "bb", amount: e.amount, text };
    case "act":
      return { kind: "action", name, action: e.action, amount: e.action === "fold" || e.action === "check" ? null : e.amount, text };
    case "street":
      return { kind: "street", label: e.street, cards: e.cards, text };
    case "show":
      return { kind: "play", name, combo: e.name ? lower(e.name) : "shows", cards: e.cards, text };
    case "return":
      return { kind: "pass", name, verb: `takes back ${e.amount}`, text };
    case "award":
      return { kind: "win", name, amount: e.amount, hand: e.name ?? null, text };
    default:
      return { kind: "text", text };
  }
}
