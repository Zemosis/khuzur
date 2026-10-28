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

// Sizes by layout: circle, card width, plate width, avatar, chip width.
export const SEAT_SIZE = {
  full: { circle: 58, card: 38, plate: 134, face: 34, chip: 14 },
  compact: { circle: 40, card: 24, plate: 66, face: 17, chip: 10 },
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

/** What the dealer says: by phase while betting or insuring, else the round's last dealer call; null for nothing. */
export function dealerLine(view) {
  if (view.phase === PHASES.BETTING) return "PLACE YOUR BETS";
  if (view.phase === PHASES.INSURANCE) return "INSURANCE?";
  const call = [...(view.events || [])].reverse().find((e) => e.type === "dealer_blackjack" || e.type === "dealer_bust" || e.type === "dealer_stand");
  if (!call) return null;
  if (call.type === "dealer_blackjack") return "DEALER HAS BLACKJACK";
  if (call.type === "dealer_bust") return "DEALER BUSTS";
  return `DEALER HAS ${call.total}`;
}

/** What the round did to `seat`'s money: everything returned (insurance included) minus everything staked. */
export function roundNet(seat, dealer) {
  const staked = seat.hands.reduce((sum, h) => sum + h.bet, 0) + (seat.insurance || 0);
  const natural = dealer.revealed && isBlackjack({ cards: dealer.cards.filter(Boolean), fromSplit: false });
  const returned = seat.hands.reduce((sum, h) => sum + h.payout, 0) + (seat.insurance && natural ? seat.insurance * 3 : 0);
  return returned - staked;
}
