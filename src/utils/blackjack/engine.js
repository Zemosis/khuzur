// BLACKJACK ENGINE — a five-seat table against the dealer as pure functions.
//
// Every step takes a state and returns a new one (the input is never
// changed), and throws on a move the rules don't allow; the error's message
// is shown to the player as is. Nothing here touches React, timers or
// sockets: the browser's practice table and the server's online tables run
// the same file (server/game/blackjack/ is a byte-identical copy). The rules
// themselves (totals, blackjack, payouts) live in rules.js.
//
// Seats are 0–4; seat 0 is first base, dealt and played first. Phases:
//   WAITING     nobody seated, or between rounds
//   BETTING     players place bets and press READY
//   DEALING     bets are in; the cards are about to come out
//   INSURANCE   the dealer shows an Ace: each player with a bet answers
//   TURNS       `turn` is the hand being played
//   DEALER      the dealer reveals and draws, one dealerStep() at a time
//   ROUND_OVER  every hand is settled; roundSummary() describes the round
//
// The shoe is never reshuffled mid-round: `dealt` counts the cards taken
// from it, and the deal after the cut card is passed takes a new shoe.
//
// Money: bets, doubles, splits and insurance come out of a seat's `bankroll`
// when made. At a free table settlement pays back into `bankroll`; at a
// credit table it doesn't (the balance lives in the database, and the credit
// bridge resyncs `bankroll` after the round is saved).

import {
  CUT_CARD,
  FREE_CHIPS,
  MAX_HANDS,
  MAX_SEATS,
  MIN_BET,
  cardPoints,
  createShoe,
  dealerShouldHit,
  handTotal,
  insuranceCost,
  isBlackjack,
  secureRandom,
  settleHand,
} from "./rules.js";

export const PHASES = {
  WAITING: "WAITING",
  BETTING: "BETTING",
  DEALING: "DEALING",
  INSURANCE: "INSURANCE",
  TURNS: "TURNS",
  DEALER: "DEALER",
  ROUND_OVER: "ROUND_OVER",
};
export const ACTIONS = ["HIT", "STAND", "DOUBLE", "SPLIT"];

const IN_ROUND = new Set([PHASES.DEALING, PHASES.INSURANCE, PHASES.TURNS, PHASES.DEALER]);

// ---- Table and seats ---------------------------------------------------------

/** Without a `shoe`, the first deal shuffles one (with the rng it's given). */
export function createTable({ credit = false, shoe } = {}) {
  return {
    credit,
    seats: Array(MAX_SEATS).fill(null),
    phase: PHASES.WAITING,
    dealer: { cards: [], revealed: false },
    shoe: shoe ? [...shoe] : [],
    dealt: shoe ? 0 : CUT_CARD,
    turn: null, // { seat, hand } being played
    roundNumber: 0,
    events: [], // this round's log
  };
}

const newHand = (bet, extra = {}) => ({
  cards: [],
  bet,
  doubled: false,
  fromSplit: false,
  splitAces: false,
  done: false,
  result: null,
  payout: 0,
  ...extra,
});

// What a seat holds for the round being played; reset between rounds.
const roundFields = () => ({ hands: [], insurance: null, answered: false, inRound: false });

const withSeat = (s, i, seat) => ({ ...s, seats: s.seats.map((x, j) => (j === i ? seat : x)) });
const patchSeat = (s, i, patch) => withSeat(s, i, { ...s.seats[i], ...patch });
const patchHand = (s, i, h, patch) => patchSeat(s, i, { hands: s.seats[i].hands.map((x, k) => (k === h ? { ...x, ...patch } : x)) });
const log = (s, event) => ({ ...s, events: [...s.events, event] });

function seatOf(s, seat) {
  const p = s.seats[seat];
  if (!Number.isInteger(seat) || !p) throw new Error("No one sits there");
  return p;
}

const validSeat = (seat) => Number.isInteger(seat) && seat >= 0 && seat < MAX_SEATS;
const inRoundSeats = (s) => s.seats.flatMap((p, i) => (p?.inRound ? [i] : []));

/**
 * player: { key, name, avatar, bankroll }. `key` is whoever the server knows
 * the player as (never sent to browsers). A free table's seat starts with
 * FREE_CHIPS. Sitting down mid-round waits for the next betting window.
 */
export function sit(state, seat, { key = null, name, avatar = null, bankroll } = {}) {
  if (!validSeat(seat)) throw new Error("No such seat");
  if (state.seats[seat]) throw new Error("That seat is taken");
  return withSeat(state, seat, {
    key,
    name,
    avatar,
    bankroll: bankroll ?? (state.credit ? 0 : FREE_CHIPS),
    bet: 0,
    ready: false,
    lastBet: 0,
    skipped: 0, // betting windows sat out in a row
    leaving: false,
    // Since sitting down: what the rounds paid less what they staked (a rebuy
    // doesn't change it), rounds played, rounds come out ahead, rebuys.
    net: 0,
    rounds: 0,
    won: 0,
    rebuys: 0,
    ...roundFields(),
  });
}

export function moveSeat(state, from, to) {
  const p = seatOf(state, from);
  if (!validSeat(to)) throw new Error("No such seat");
  if (state.seats[to]) throw new Error("That seat is taken");
  if ((state.phase !== PHASES.WAITING && state.phase !== PHASES.BETTING) || p.bet > 0) throw new Error("Move seats between rounds");
  return withSeat(withSeat(state, from, null), to, p);
}

/**
 * The player leaves. Out of a round the seat empties. In one, their hands
 * stand where they are and settle with the round (the seat empties at
 * clearRound), and insurance not yet answered is declined.
 */
export function standUp(state, seat) {
  const p = state.seats[seat];
  if (!p) return state;
  if (!p.inRound) return log(withSeat(state, seat, null), { type: "leave", seat });
  let s = patchSeat(state, seat, {
    leaving: true,
    answered: true,
    hands: p.hands.map((h) => (h.done ? h : { ...h, done: true })),
  });
  s = log(s, { type: "leave", seat });
  return s.phase === PHASES.TURNS && s.turn?.seat === seat ? advance(s) : s;
}

/** Free tables only: a seat below the minimum bet, between rounds, goes back to FREE_CHIPS. */
export function rebuy(state, seat) {
  const p = seatOf(state, seat);
  if (state.credit) throw new Error("Rebuy is only for free tables");
  if (p.inRound) throw new Error("Wait for the round to end");
  if (p.bankroll >= MIN_BET) throw new Error("You still have chips");
  return patchSeat(state, seat, { bankroll: FREE_CHIPS, rebuys: p.rebuys + 1 });
}

export function setBankroll(state, seat, amount) {
  seatOf(state, seat);
  return patchSeat(state, seat, { bankroll: amount });
}

// ---- Betting -------------------------------------------------------------------

/** A new betting window, or WAITING if nobody is seated. */
export function openBetting(state) {
  const seated = state.seats.some((p) => p);
  return {
    ...state,
    phase: seated ? PHASES.BETTING : PHASES.WAITING,
    seats: state.seats.map((p) => (p ? { ...p, bet: 0, ready: false } : p)),
    events: [],
  };
}

/** `amount` replaces the seat's bet: 0 clears it, otherwise MIN_BET up to the bankroll. A changed bet is no longer ready. */
export function placeBet(state, seat, amount) {
  if (state.phase !== PHASES.BETTING) throw new Error("Betting is closed");
  const p = seatOf(state, seat);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("Pick an amount");
  if (amount > 0 && amount < MIN_BET) throw new Error(`The minimum bet is ${MIN_BET}`);
  if (amount > p.bankroll) throw new Error(`You have ${p.bankroll}`);
  const s = patchSeat(state, seat, { bet: amount, ready: amount > 0 && p.ready && amount === p.bet });
  return log(s, { type: "bet", seat, amount });
}

export function setReady(state, seat) {
  if (state.phase !== PHASES.BETTING) throw new Error("Betting is closed");
  if (!(seatOf(state, seat).bet > 0)) throw new Error("Place a bet first");
  return patchSeat(state, seat, { ready: true });
}

/** The window may close early: someone bet, and every player is ready or can't bet. */
export function bettingDone(state) {
  if (state.phase !== PHASES.BETTING) return false;
  const players = state.seats.filter((p) => p && !p.leaving);
  return players.some((p) => p.bet > 0) && players.every((p) => (p.bet > 0 && p.ready) || p.bankroll < MIN_BET);
}

/** Bets come out of the bankrolls; whoever didn't bet sits the round out. */
export function closeBetting(state) {
  if (state.phase !== PHASES.BETTING) throw new Error("Betting is closed");
  // A bet the bankroll no longer covers (it was resynced lower) sits out.
  const betting = (p) => p && !p.leaving && p.bet > 0 && p.bet <= p.bankroll;
  if (!state.seats.some(betting)) return openBetting({ ...state, seats: state.seats.map((p) => (p ? { ...p, skipped: p.skipped + 1 } : p)) });
  return {
    ...state,
    phase: PHASES.DEALING,
    seats: state.seats.map((p) => {
      if (!p) return p;
      if (!betting(p)) return { ...p, bet: 0, ready: false, skipped: p.skipped + 1 };
      return { ...p, ...roundFields(), inRound: true, bankroll: p.bankroll - p.bet, hands: [newHand(p.bet)], lastBet: p.bet, skipped: 0 };
    }),
  };
}

/** A bet that couldn't be funded (credit tables): the seat sits this round out, its bet back. */
export function refuseBet(state, seat) {
  if (state.phase !== PHASES.DEALING) throw new Error("The cards are already out");
  const p = seatOf(state, seat);
  if (!p.inRound) throw new Error("No bet to refuse");
  return patchSeat(state, seat, { ...roundFields(), bankroll: p.bankroll + p.bet, bet: 0, ready: false });
}

// ---- The round -----------------------------------------------------------------

/** The next card off the shoe. Should a round ever run it dry, a fresh shoe comes in. */
function draw(s) {
  if (s.dealt >= s.shoe.length) s = log({ ...s, shoe: createShoe(secureRandom), dealt: 0 }, { type: "shuffle" });
  return [s.shoe[s.dealt], { ...s, dealt: s.dealt + 1 }];
}

function dealTo(s, seat) {
  const [card, next] = draw(s);
  const hand = next.seats[seat].hands[0];
  return patchHand(next, seat, 0, { cards: [...hand.cards, card] });
}

function dealToDealer(s) {
  const [card, next] = draw(s);
  return { ...next, dealer: { ...next.dealer, cards: [...next.dealer.cards, card] } };
}

const canInsure = (p) => !p.leaving && insuranceCost(p.bet) > 0 && insuranceCost(p.bet) <= p.bankroll;

/**
 * DEALING: two cards each from first base and two to the dealer (the second
 * face down), then insurance if the dealer shows an Ace, or the peek.
 */
export function deal(state, rng = secureRandom) {
  if (state.phase !== PHASES.DEALING) throw new Error("Nothing to deal");
  const order = inRoundSeats(state);
  if (order.length === 0) return openBetting(state);

  let s = { ...state, roundNumber: state.roundNumber + 1, dealer: { cards: [], revealed: false }, turn: null, events: [] };
  if (s.dealt >= CUT_CARD) s = log({ ...s, shoe: createShoe(rng), dealt: 0 }, { type: "shuffle" });
  for (let round = 0; round < 2; round++) {
    for (const seat of order) s = dealTo(s, seat);
    s = dealToDealer(s);
  }

  if (s.dealer.cards[0].rank === "A" && order.some((i) => canInsure(s.seats[i]))) {
    return {
      ...s,
      phase: PHASES.INSURANCE,
      seats: s.seats.map((p) => (p?.inRound ? { ...p, answered: !canInsure(p) } : p)),
    };
  }
  return peek(s);
}

/** INSURANCE: `take` buys insurance for half the bet; false declines. */
export function insure(state, seat, take) {
  if (state.phase !== PHASES.INSURANCE) throw new Error("No insurance now");
  const p = seatOf(state, seat);
  if (!p.inRound) throw new Error("You have no bet this round");
  if (p.answered) throw new Error("You already answered");
  if (!take) return patchSeat(state, seat, { answered: true });
  const cost = insuranceCost(p.bet);
  if (!canInsure(p)) throw new Error("You can't cover insurance");
  const s = patchSeat(state, seat, { answered: true, insurance: cost, bankroll: p.bankroll - cost });
  return log(s, { type: "insure", seat, amount: cost });
}

export function insuranceDone(state) {
  return state.phase === PHASES.INSURANCE && inRoundSeats(state).every((i) => state.seats[i].answered);
}

/** The insurance window closes: anyone who didn't answer declined. Then the peek. */
export function closeInsurance(state) {
  if (state.phase !== PHASES.INSURANCE) throw new Error("No insurance now");
  return peek({ ...state, seats: state.seats.map((p) => (p?.inRound ? { ...p, answered: true } : p)) });
}

const dealerNatural = (s) => isBlackjack({ cards: s.dealer.cards, fromSplit: false });

function reveal(s) {
  if (s.dealer.revealed) return s;
  s = { ...s, dealer: { ...s.dealer, revealed: true } };
  return log(s, { type: "dealer_reveal", card: s.dealer.cards[1], total: handTotal(s.dealer.cards).total });
}

/**
 * The dealer peeks under an Ace or a ten-card. A blackjack ends the round
 * before anyone plays. Otherwise player blackjacks stand, and turns begin.
 */
function peek(s) {
  const up = s.dealer.cards[0];
  if ((up.rank === "A" || cardPoints(up) === 10) && dealerNatural(s)) {
    s = log(reveal(s), { type: "dealer_blackjack", total: 21 });
    return settle(s);
  }
  for (const seat of inRoundSeats(s)) {
    const hand = s.seats[seat].hands[0];
    if (hand.done) continue;
    if (isBlackjack(hand)) s = log(patchHand(s, seat, 0, { done: true }), { type: "blackjack", seat, hand: 0, total: 21 });
    else if (handTotal(hand.cards).total === 21) s = patchHand(s, seat, 0, { done: true });
  }
  return advance(s);
}

/** The first hand still to play, first base first: { seat, hand }, or null. */
function nextHand(s) {
  for (const seat of inRoundSeats(s)) {
    const hand = s.seats[seat].hands.findIndex((h) => !h.done);
    if (hand >= 0) return { seat, hand };
  }
  return null;
}

/**
 * The turn goes to the next hand to play. A split hand draws its second card
 * as its turn comes (a 21 ends it at once). With none left, the dealer plays,
 * unless every hand already busted or was a blackjack.
 */
function advance(s) {
  for (;;) {
    const next = nextHand(s);
    if (!next) break;
    const hand = s.seats[next.seat].hands[next.hand];
    if (hand.cards.length >= 2) return { ...s, phase: PHASES.TURNS, turn: next };
    s = drawTo(s, next.seat, next.hand);
    if (handTotal(s.seats[next.seat].hands[next.hand].cards).total === 21) s = patchHand(s, next.seat, next.hand, { done: true });
  }
  s = { ...s, turn: null };
  const hands = inRoundSeats(s).flatMap((i) => s.seats[i].hands);
  if (hands.every((h) => handTotal(h.cards).total > 21 || isBlackjack(h))) return settle(reveal(s));
  return { ...s, phase: PHASES.DEALER };
}

function drawTo(s, seat, h) {
  const [card, next] = draw(s);
  return patchHand(next, seat, h, { cards: [...next.seats[seat].hands[h].cards, card] });
}

// ---- Turns and the dealer ------------------------------------------------------

const NONE = { hit: false, stand: false, double: false, split: false };

/** What `seat` may do with the hand being played; all false when it isn't their turn. */
export function legalActions(state, seat) {
  if (state.phase !== PHASES.TURNS || state.turn?.seat !== seat) return { ...NONE };
  const p = state.seats[seat];
  const hand = p.hands[state.turn.hand];
  const pair = hand.cards.length === 2;
  const covered = p.bankroll >= hand.bet;
  return {
    hit: true,
    stand: true,
    double: pair && !hand.splitAces && covered,
    split: pair && cardPoints(hand.cards[0]) === cardPoints(hand.cards[1]) && p.hands.length < MAX_HANDS && !hand.splitAces && covered,
  };
}

/** `seat` plays its current hand: "HIT" | "STAND" | "DOUBLE" | "SPLIT". */
export function act(state, seat, type) {
  if (state.phase !== PHASES.TURNS || state.turn?.seat !== seat) throw new Error("Not your turn");
  if (!ACTIONS.includes(type)) throw new Error("Unknown move");
  if (!legalActions(state, seat)[type.toLowerCase()]) throw new Error(`You can't ${type.toLowerCase()} now`);
  const h = state.turn.hand;
  const p = state.seats[seat];
  const hand = p.hands[h];
  let s = state;

  switch (type) {
    case "HIT": {
      s = drawTo(s, seat, h);
      const cards = s.seats[seat].hands[h].cards;
      const { total } = handTotal(cards);
      s = log(s, { type: "hit", seat, hand: h, card: cards.at(-1), total });
      if (total > 21) s = log(patchHand(s, seat, h, { done: true }), { type: "bust", seat, hand: h, total });
      else if (total === 21) s = patchHand(s, seat, h, { done: true });
      break;
    }
    case "STAND":
      s = log(patchHand(s, seat, h, { done: true }), { type: "stand", seat, hand: h, total: handTotal(hand.cards).total });
      break;
    case "DOUBLE": {
      s = patchSeat(s, seat, { bankroll: p.bankroll - hand.bet });
      s = drawTo(patchHand(s, seat, h, { bet: hand.bet * 2, doubled: true, done: true }), seat, h);
      const cards = s.seats[seat].hands[h].cards;
      const { total } = handTotal(cards);
      s = log(s, { type: "double", seat, hand: h, card: cards.at(-1), total, amount: hand.bet });
      if (total > 21) s = log(s, { type: "bust", seat, hand: h, total });
      break;
    }
    case "SPLIT": {
      const aces = hand.cards[0].rank === "A";
      const [first, second] = hand.cards;
      const split = { cards: [first], fromSplit: true, splitAces: aces };
      const hands = [...p.hands];
      hands.splice(h, 1, { ...hand, ...split }, newHand(hand.bet, { ...split, cards: [second] }));
      s = log(patchSeat(s, seat, { bankroll: p.bankroll - hand.bet, hands }), { type: "split", seat, hand: h, amount: hand.bet });
      s = drawTo(s, seat, h);
      if (aces) {
        // Split Aces get one card each, and that's all.
        s = drawTo(s, seat, h + 1);
        s = patchHand(patchHand(s, seat, h, { done: true }), seat, h + 1, { done: true });
      } else if (handTotal(s.seats[seat].hands[h].cards).total === 21) {
        s = patchHand(s, seat, h, { done: true });
      }
      break;
    }
  }
  return advance(s);
}

/** DEALER: reveal the hole card, then draw to 17 one card a step, then settle. */
export function dealerStep(state) {
  if (state.phase !== PHASES.DEALER) throw new Error("The dealer isn't playing");
  if (!state.dealer.revealed) return reveal(state);
  if (dealerShouldHit(state.dealer.cards)) {
    let s = dealToDealer(state);
    const total = handTotal(s.dealer.cards).total;
    s = log(s, { type: "dealer_hit", card: s.dealer.cards.at(-1), total });
    return total > 21 ? log(s, { type: "dealer_bust", total }) : s;
  }
  const total = handTotal(state.dealer.cards).total;
  return settle(total > 21 ? state : log(state, { type: "dealer_stand", total }));
}

const insurancePayout = (s, p) => (p.insurance && dealerNatural(s) ? p.insurance * 3 : 0);

/** Every hand in the round is settled against the dealer's cards. */
function settle(s) {
  for (const seat of inRoundSeats(s)) {
    const p = s.seats[seat];
    const hands = p.hands.map((h) => ({ ...h, ...settleHand(h, s.dealer.cards) }));
    const paid = hands.reduce((sum, h) => sum + h.payout, 0) + insurancePayout(s, p);
    const net = paid - hands.reduce((sum, h) => sum + h.bet, 0) - (p.insurance || 0);
    const record = { net: p.net + net, rounds: p.rounds + 1, won: p.won + (net > 0 ? 1 : 0) };
    s = patchSeat(s, seat, { hands, ...record, ...(s.credit ? {} : { bankroll: p.bankroll + paid }) });
    for (const [h, hand] of hands.entries()) s = log(s, { type: "result", seat, hand: h, amount: hand.payout });
  }
  return { ...s, phase: PHASES.ROUND_OVER, turn: null };
}

// ---- After the round -----------------------------------------------------------

/**
 * A finished round for the record: { roundNumber, dealer: { cards, total },
 * houseNet, seatResults: [{ seat_index, player_key, name, hands, insurance,
 * insurancePayout, staked, returned, net, blackjack, doubled, split }] }.
 * Cards are ids. houseNet = everything staked − everything returned.
 */
export function roundSummary(state) {
  if (state.phase !== PHASES.ROUND_OVER) throw new Error("The round isn't over");
  const seatResults = state.seats.flatMap((p, i) => {
    if (!p?.inRound) return [];
    const hands = p.hands.map((h) => ({ cards: h.cards.map((c) => c.id), bet: h.bet, result: h.result, payout: h.payout }));
    const insured = insurancePayout(state, p);
    const staked = hands.reduce((sum, h) => sum + h.bet, 0) + (p.insurance || 0);
    const returned = hands.reduce((sum, h) => sum + h.payout, 0) + insured;
    return [
      {
        seat_index: i,
        player_key: p.key,
        name: p.name,
        hands,
        insurance: p.insurance,
        insurancePayout: insured,
        staked,
        returned,
        net: returned - staked,
        blackjack: hands.some((h) => h.result === "blackjack"),
        doubled: p.hands.some((h) => h.doubled),
        split: p.hands.length > 1,
      },
    ];
  });
  return {
    roundNumber: state.roundNumber,
    dealer: { cards: state.dealer.cards.map((c) => c.id), total: handTotal(state.dealer.cards).total },
    houseNet: seatResults.reduce((sum, r) => sum - r.net, 0),
    seatResults,
  };
}

/** Back to WAITING: players who left are gone, and every hand, bet and READY is cleared. */
export function clearRound(state) {
  if (IN_ROUND.has(state.phase)) throw new Error("The round isn't over");
  return {
    ...state,
    phase: PHASES.WAITING,
    seats: state.seats.map((p) => (p && !p.leaving ? { ...p, ...roundFields(), bet: 0, ready: false } : null)),
    dealer: { cards: [], revealed: false },
    turn: null,
    events: [],
  };
}

/**
 * The table as `seat` may see it (-1: a spectator): no shoe, no player keys,
 * the hole card null until revealed, plus what this seat may do now.
 */
export function viewFor(state, seat) {
  const { shoe: _shoe, ...rest } = state;
  const { revealed, cards } = state.dealer;
  const shown = revealed ? cards : cards.map((c, i) => (i === 1 ? null : c));
  return {
    ...rest,
    seats: state.seats.map((p) => {
      if (!p) return p;
      const { key: _key, ...open } = p;
      return open;
    }),
    dealer: { ...state.dealer, cards: shown },
    mySeat: seat,
    legal: legalActions(state, seat),
    dealerTotal: handTotal(shown.filter(Boolean)).total,
  };
}
