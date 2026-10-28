// BLACKJACK LOG — a round's events as the table's LOG tab shows them, one
// plain line each ("ANN bets 200", "Dealer busts with 25"). Browser only (the
// server keeps no log text), so it isn't copied to server/.
//
// A few lines need more than the event carries: the total a hand doubled on,
// the pair it split, the bet a result is measured against. withContext()
// reads them off the seats of the view the event arrived with.

import { handTotal } from "./rules.js";

const short = (name = "") => name.split(" #")[0];
const fmt = (n) => Number(n).toLocaleString("en-US");

/** The event plus what its line needs from `seats` (the view's): before, ranks, bet. */
export function withContext(e, seats) {
  const hands = seats?.[e.seat]?.hands;
  const hand = hands?.[e.hand];
  if (!hand) return e;
  switch (e.type) {
    case "double":
      return { ...e, before: handTotal(hand.cards.slice(0, -1)).total };
    case "split":
      return { ...e, ranks: [hand.cards[0]?.rank, hands[e.hand + 1]?.cards[0]?.rank].filter(Boolean) };
    case "result":
      return { ...e, bet: hand.bet };
    default:
      return e;
  }
}

function pairOf(ranks = []) {
  if (ranks.length === 0) return "";
  const [a, b = a] = ranks;
  return a === b ? ` ${a}s` : ` ${a} and ${b}`;
}

/**
 * One event as a log line, naming players from `names` (a name per seat;
 * a seat with no name reads "Seat n"). null for events that get no line.
 */
export function eventEntry(e, names = []) {
  const who = short(names[e.seat] ?? `Seat ${e.seat + 1}`);
  switch (e.type) {
    case "bet":
      return e.amount > 0 ? `${who} bets ${fmt(e.amount)}` : null;
    case "insure":
      return `${who} takes insurance for ${fmt(e.amount)}`;
    case "blackjack":
      return `${who} has blackjack`;
    case "stand":
      return `${who} stands on ${e.total}`;
    case "double":
      return e.before != null ? `${who} doubles on ${e.before}` : `${who} doubles`;
    case "split":
      return `${who} splits${pairOf(e.ranks)}`;
    case "bust":
      return `${who} busts with ${e.total}`;
    case "dealer_blackjack":
      return "Dealer has blackjack";
    case "dealer_stand":
      return `Dealer stands on ${e.total}`;
    case "dealer_bust":
      return `Dealer busts with ${e.total}`;
    case "result": {
      if (e.bet == null) return null;
      const net = e.amount - e.bet;
      if (net > 0) return `${who} wins ${fmt(net)}`;
      if (net < 0) return `${who} loses ${fmt(-net)}`;
      return `${who} pushes`;
    }
    case "leave":
      return null; // the server already logs it: "ANN left the table."
    case "shuffle":
      return "New shoe";
    default:
      return null;
  }
}
