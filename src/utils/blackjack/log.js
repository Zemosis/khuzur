// BLACKJACK LOG — a round as the table's LOG tab shows it: each event a line
// of text (eventLine) and an entry the tab draws (eventEntry; see GameChat's
// LogLine): who, what they did as a coloured chip, the cards as card chips,
// the total. Browser only (the server keeps no log text), so it isn't copied
// to server/.
//
// Besides the engine's events, the table logs three of its own, read off the
// view a deal arrives with: "round" (the header), "dealt" (a player's first
// two cards) and "dealer_up" (the dealer's upcard).
//
// A few lines need more than an event carries: the total a hand doubled on,
// the pair it split, the bet and outcome of a result. withContext() reads them
// off the seats of the view the event arrived with.

import { handTotal } from "./rules.js";

const short = (name = "") => name.split(" #")[0];
const fmt = (n) => Number(n).toLocaleString("en-US");
const cardText = (c) => `${c.rank}${c.suit}`;

/** The event plus what its line needs from `seats` (the view's): before, ranks, bet, result. */
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
      return { ...e, bet: hand.bet, result: hand.result };
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
 * One event as a sentence, naming players from `names` (a name per seat;
 * a seat with no name reads "Seat n"). null for events not logged.
 */
export function eventLine(e, names = []) {
  const who = short(names[e.seat] ?? `Seat ${e.seat + 1}`);
  switch (e.type) {
    case "round":
      return `Round ${e.roundNumber}`;
    case "bet":
      return e.amount > 0 ? `${who} bets ${fmt(e.amount)}` : null;
    case "dealt":
      return `${who} is dealt ${e.cards.map(cardText).join(" ")}`;
    case "insure":
      return `${who} takes insurance for ${fmt(e.amount)}`;
    case "blackjack":
      return `${who} has blackjack`;
    case "hit":
      return `${who} hits ${cardText(e.card)} for ${e.total}`;
    case "stand":
      return `${who} stands on ${e.total}`;
    case "double":
      return e.before != null ? `${who} doubles on ${e.before} and draws ${cardText(e.card)}` : `${who} doubles and draws ${cardText(e.card)}`;
    case "split":
      return `${who} splits${pairOf(e.ranks)}`;
    case "bust":
      return `${who} busts with ${e.total}`;
    case "dealer_up":
      return `Dealer shows ${cardText(e.card)}`;
    case "dealer_reveal":
      return `Dealer turns over ${cardText(e.card)} for ${e.total}`;
    case "dealer_hit":
      return `Dealer draws ${cardText(e.card)} for ${e.total}`;
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
    case "shuffle":
      return "New shoe";
    default:
      return null; // a leave too: the server already logs it ("ANN left the table.")
  }
}

const DEALER = "DEALER";

/**
 * One event as a LOG tab entry: { kind, text, … } (see GameChat's LogLine) —
 * "round" (a round's header), "pot" (a new shoe's divider), "action" (name,
 * action, amount, cards, total), "play" (a dealt hand: name, its total as
 * combo, cards), "street" (the dealer's cards: label, cards), "win" (name,
 * amount, hand). `move: false` marks what isn't a player's decision, for the
 * tab's move count. `text` is the line eventLine gives. null for events not
 * logged.
 */
export function eventEntry(e, names = []) {
  const text = eventLine(e, names);
  if (!text) return null;
  const name = short(names[e.seat] ?? `Seat ${e.seat + 1}`);
  switch (e.type) {
    case "round":
      return { kind: "round", label: `ROUND ${e.roundNumber}`, text };
    case "shuffle":
      return { kind: "pot", text };
    case "bet":
      return { kind: "action", name, action: "bet", amount: fmt(e.amount), move: false, text };
    case "dealt":
      return { kind: "play", name, combo: String(e.total), cards: e.cards, move: false, text };
    case "insure":
      return { kind: "action", name, action: "insure", amount: fmt(e.amount), text };
    case "blackjack":
      return { kind: "action", name, action: "blackjack", move: false, text };
    case "hit":
    case "double":
      return { kind: "action", name, action: e.type, cards: [e.card], total: e.total, text };
    case "stand":
      return { kind: "action", name, action: "stand", total: e.total, text };
    case "split":
      return { kind: "action", name, action: "split", text };
    case "bust":
      return { kind: "action", name, action: "bust", total: e.total, move: false, text };
    case "dealer_up":
      return { kind: "street", label: "DEALER SHOWS", cards: [e.card], text };
    case "dealer_reveal":
      return { kind: "street", label: `HOLE CARD · ${e.total}`, cards: [e.card], text };
    case "dealer_hit":
      return { kind: "street", label: `DEALER DRAWS · ${e.total}`, cards: [e.card], text };
    case "dealer_blackjack":
      return { kind: "action", name: DEALER, action: "blackjack", move: false, text };
    case "dealer_stand":
      return { kind: "action", name: DEALER, action: "stand", total: e.total, move: false, text };
    case "dealer_bust":
      return { kind: "action", name: DEALER, action: "bust", total: e.total, move: false, text };
    case "result": {
      const net = e.amount - e.bet;
      if (net > 0) return { kind: "win", name, amount: fmt(net), hand: e.result === "blackjack" ? "Blackjack" : null, text };
      if (net < 0) return { kind: "action", name, action: "lose", amount: fmt(-net), move: false, text };
      return { kind: "action", name, action: "push", amount: null, move: false, text };
    }
    default:
      return { kind: "text", text };
  }
}
