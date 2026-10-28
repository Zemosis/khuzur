// TABLE INFO — what the blackjack table's components read off a view: the
// tags on hands and on the dealer, what the dealer says, a round's net, and
// the sizes each layout draws at. Plain functions, kept apart from the
// components so fast refresh keeps working.

import { PHASES } from "../../utils/blackjack/engine";
import { handTotal, isBlackjack } from "../../utils/blackjack/rules";

export const short = (name = "") => name.split(" #")[0];
export const fmt = (n) => Number(n).toLocaleString("en-US");
/** m:ss for whole seconds. */
export const clock = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

// Sizes by layout: circle, card width (split hands draw smaller), the
// dealer's card width, the shoe's and tray's card width, plate width,
// avatar, chip width.
export const SEAT_SIZE = {
  full: { circle: 70, card: 76, splitCard: 54, dealerCard: 80, shoeCard: 60, plate: 172, face: 46, chip: 18 },
  compact: { circle: 40, card: 34, splitCard: 26, dealerCard: 38, shoeCard: 30, plate: 66, face: 17, chip: 10 },
};

const INK = "#0a0712";
const PLAIN = { bg: INK, fg: "#ead8b1" };

/** A hand's total tag: "7 / 17" when soft, BUST, BLACKJACK, else the total. */
export function totalTag(hand) {
  const { total, soft } = handTotal(hand.cards);
  if (total > 21) return { label: "BUST", bg: "#a83a5a", fg: "#ead8b1" };
  if (isBlackjack(hand)) return { label: "BLACKJACK", bg: "#f4c430", fg: INK };
  if (soft && total < 21) return { label: `${total - 10} / ${total}`, ...PLAIN };
  return { label: String(total), ...PLAIN };
}

/** A settled hand's result, measured against its bet: +n poison, -n rose, PUSH mist, BLACKJACK +n gold. */
export function resultTag(hand) {
  const net = hand.payout - hand.bet;
  if (hand.result === "blackjack") return { label: `BLACKJACK +${fmt(net)}`, bg: "#f4c430", fg: INK };
  if (hand.result === "win") return { label: `+${fmt(net)}`, bg: "#9bd14f", fg: "#142a08" };
  if (hand.result === "push") return { label: "PUSH", bg: "#463a78", fg: "#ead8b1" };
  return { label: `-${fmt(hand.bet)}`, bg: "#e85a7a", fg: "#2a0a14" };
}

/** The dealer's tag: BLACKJACK, BUST n, or the total of the cards showing; null with no cards. */
export function dealerTag(view) {
  const shown = view.dealer.cards.filter(Boolean);
  if (!shown.length) return null;
  const total = view.dealerTotal ?? handTotal(shown).total;
  if (view.dealer.revealed && isBlackjack({ cards: shown, fromSplit: false })) return { label: "BLACKJACK", bg: "#f4c430", fg: INK };
  if (total > 21) return { label: `BUST ${total}`, bg: "#a83a5a", fg: "#ead8b1" };
  return { label: String(total), ...PLAIN };
}

const UP_NAMES = { A: "ACE", J: "JACK", Q: "QUEEN", K: "KING" };

/**
 * What the dealer says: by phase while betting, dealing or insuring; the
 * upcard while players play; then each of the dealer's own moves. null for
 * nothing.
 */
export function dealerLine(view) {
  if (view.phase === PHASES.BETTING) return "PLACE YOUR BETS";
  if (view.phase === PHASES.DEALING) return "NO MORE BETS";
  if (view.phase === PHASES.INSURANCE) return "INSURANCE?";
  const call = [...(view.events || [])].reverse().find((e) => DEALER_CALLS.has(e.type));
  if (!call) {
    const up = view.dealer.cards[0];
    return view.phase === PHASES.TURNS && up ? `DEALER SHOWS ${UP_NAMES[up.rank] ?? up.rank}` : null;
  }
  if (call.type === "dealer_blackjack") return "DEALER HAS BLACKJACK";
  if (call.type === "dealer_bust") return "DEALER BUSTS";
  if (call.type === "dealer_hit") return `DEALER DRAWS · ${call.total}`;
  if (call.type === "dealer_reveal") return `HOLE CARD · ${call.total}`;
  return `DEALER HAS ${call.total}`;
}
const DEALER_CALLS = new Set(["dealer_reveal", "dealer_hit", "dealer_blackjack", "dealer_bust", "dealer_stand"]);

/**
 * The callout a seat's event pops over its plate ({ label, bg, fg }), or
 * null for events that get none (results show on the hands' tags).
 */
export function actionCallout(e) {
  switch (e.type) {
    case "bet":
      return e.amount > 0 ? { label: `BET ${fmt(e.amount)}`, bg: "#f4c430" } : { label: "BET CLEARED", bg: "#463a78", fg: "#ead8b1" };
    case "ready":
      return { label: "READY", bg: "#9bd14f", fg: "#142a08" };
    case "insure":
      return { label: "INSURED", bg: "#5fd4d6" };
    case "hit":
      return { label: "HIT", bg: "#5fd4d6" };
    case "stand":
      return { label: "STAND", bg: "#ead8b1" };
    case "double":
      return { label: "DOUBLE", bg: "#f4c430" };
    case "split":
      return { label: "SPLIT", bg: "#c5a8ff" };
    case "bust":
      return { label: "BUST", bg: "#e85a7a", fg: "#2a0a14" };
    case "blackjack":
      return { label: "BLACKJACK!", bg: "#f4c430" };
    default:
      return null;
  }
}

/** What the round did to `seat`'s money: everything returned (insurance included) minus everything staked. */
export function roundNet(seat, dealer) {
  const staked = seat.hands.reduce((sum, h) => sum + h.bet, 0) + (seat.insurance || 0);
  const natural = dealer.revealed && isBlackjack({ cards: dealer.cards.filter(Boolean), fromSplit: false });
  const returned = seat.hands.reduce((sum, h) => sum + h.payout, 0) + (seat.insurance && natural ? seat.insurance * 3 : 0);
  return returned - staked;
}

/**
 * A settled view as it stood just before it settled: every card out (the
 * dealer's too), but no result, payout or record yet; the phase is DEALER,
 * the results' log events are left out, and a free table's bankrolls are
 * back to before the payout. The table shows this while the last cards are
 * still landing.
 */
export function beforeResults(view) {
  return {
    ...view,
    phase: PHASES.DEALER,
    events: (view.events || []).filter((e) => e.type !== "result"),
    seats: view.seats.map((p) => {
      if (!p?.inRound) return p;
      const net = roundNet(p, view.dealer);
      const returned = p.hands.reduce((sum, h) => sum + h.bet, 0) + (p.insurance || 0) + net;
      return {
        ...p,
        hands: p.hands.map((h) => ({ ...h, result: null, payout: 0 })),
        bankroll: view.credit ? p.bankroll : p.bankroll - returned,
        net: (p.net ?? 0) - net,
        rounds: Math.max(0, (p.rounds ?? 0) - 1),
        won: Math.max(0, (p.won ?? 0) - (net > 0 ? 1 : 0)),
      };
    }),
  };
}
