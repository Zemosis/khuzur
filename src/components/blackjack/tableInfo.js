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

// Sizes by layout: circle, card width (split hands draw smaller, and the
// longest hands smaller still, down to minCard), the dealer's card width, the
// shoe's and tray's card width, plate width, avatar, chip width.
export const SEAT_SIZE = {
  full: { circle: 70, card: 76, splitCard: 54, minCard: 36, dealerCard: 80, shoeCard: 60, plate: 172, face: 46, chip: 18 },
  compact: { circle: 40, card: 34, splitCard: 26, minCard: 26, dealerCard: 38, shoeCard: 30, plate: 66, face: 17, chip: 10 },
};

export const HAND_PAD = 6; // a hand's padding, both sides together
const HAND_GAP = 8; // between split hands
const LANE_GAP = 8; // between two seats' lanes
const READABLE = 0.25; // of a card: the least of it that still shows its rank

/**
 * How `hands` lie in `room` px across (null: as much as they like): a card
 * width, each card's step along from the one before, and the width that comes
 * to. A hand fans half a card at a time while it fits; then its cards close
 * up, then shrink. Whatever the room, they stay in it.
 */
export function fitHands(hands, room, size) {
  const count = hands.length;
  const steps = hands.reduce((n, h) => n + h.cards.length - 1, 0);
  const frame = (count - 1) * HAND_GAP + count * HAND_PAD;
  const widthAt = (cardW, step) => frame + count * cardW + steps * step;
  const first = count > 1 ? size.splitCard : size.card;
  const widths = [...new Set([first, size.splitCard, size.minCard])].filter((w) => w <= first);
  const fits = (cardW, step) => ({ cardW, step, width: widthAt(cardW, step) });
  let squeezed = 0;
  for (const cardW of widths) {
    const step = Math.round(cardW * 0.5);
    if (room == null || widthAt(cardW, step) <= room) return fits(cardW, step);
    squeezed = steps ? (room - frame - count * cardW) / steps : 0;
    if (squeezed >= cardW * READABLE) return fits(cardW, squeezed);
  }
  return fits(widths[widths.length - 1], Math.max(0, squeezed));
}

/** Each card's step along a row of `count` cards `cardW` wide, `step` apart, kept to `room` px (null: no limit). */
export function fanStep(count, cardW, step, room) {
  if (room == null || count < 2) return step;
  return Math.min(step, Math.max(0, (room - cardW) / (count - 1)));
}

/**
 * The stretch of the table each seat's hands may use, { left, right } in px:
 * from `bounds` ([left, right]: the tray to the shoe), up to halfway to the
 * nearest seat playing in the same row (`rows`, a row number per seat: seats
 * on different rows pass over each other), and within the seat's own `limits`
 * ([left, right] per seat).
 */
export function handLanes(centres, playing, bounds, rows = centres.map(() => 0), limits = []) {
  const others = (seat) => centres.flatMap((x, i) => (i !== seat && playing[i] && rows[i] === rows[seat] ? [x] : []));
  return centres.map((x, seat) => {
    const near = others(seat);
    const [low, high] = limits[seat] ?? [-Infinity, Infinity];
    const toLeft = Math.max(...near.filter((o) => o < x), -Infinity);
    const toRight = Math.min(...near.filter((o) => o > x), Infinity);
    return {
      left: Math.max(bounds[0], low, toLeft === -Infinity ? -Infinity : (x + toLeft + LANE_GAP) / 2),
      right: Math.min(bounds[1], high, toRight === Infinity ? Infinity : (x + toRight - LANE_GAP) / 2),
    };
  });
}

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

/** A dealt view as it stands while its cards are still landing: nobody's turn, nothing to answer, no clock. */
export function whileDealing(view) {
  return { ...view, phase: PHASES.DEALING, turn: null, phaseEndsAt: null };
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
