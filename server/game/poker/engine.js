// POKER ENGINE — no-limit Texas Hold'em (docs/poker-rulebook.md) as pure
// functions.
//
// Every step takes a state and returns a new one (the input is never
// changed), and throws on a move the rules don't allow. Nothing here touches
// React, timers or sockets: the browser's practice table and the server's
// online tables run the same file (server/game/poker/ is a byte-identical
// copy).
//
// A table has 6 seats, each empty (null) or a player. Players come and go
// between hands; one who sits down mid-hand is dealt in from the next hand.
// Phases:
//   WAITING    no hand: fewer than 2 players with chips, or not started yet
//   BETTING    a street's betting; `turn` is the seat to act
//   RUNOUT     betting is over with players all-in: the rest of the board
//              comes out one street per advance(), no more betting
//   HAND_OVER  the pots are paid; `result` says who won what
//
// Seats are 0–5 and clockwise is seat + 1. Randomness comes in through an
// `rng` argument (default secureRandom) so tests can make it predictable.

import { createDeck, evaluate } from "./hands.js";
import { awardPots, buildPots, fromLeftOf } from "./pots.js";

export const MAX_SEATS = 6;
export const SMALL_BLIND = 5;
export const BIG_BLIND = 10;
export const BUY_IN = 1000;

export const PHASES = { WAITING: "WAITING", BETTING: "BETTING", RUNOUT: "RUNOUT", HAND_OVER: "HAND_OVER" };
export const STREETS = ["PREFLOP", "FLOP", "TURN", "RIVER"];

/** A number in [0, 1) from the platform's cryptographic generator. */
export function secureRandom() {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) return Math.random();
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

export function shuffle(cards, rng = secureRandom) {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---- Table and seats ---------------------------------------------------------

export function createTable({ smallBlind = SMALL_BLIND, bigBlind = BIG_BLIND } = {}) {
  return {
    seats: Array(MAX_SEATS).fill(null),
    smallBlind,
    bigBlind,
    phase: PHASES.WAITING,
    handNumber: 0,
    button: null,
    street: null,
    board: [],
    deck: [],
    turn: null,
    currentBet: 0, // the bet to match this street
    minRaise: bigBlind, // the smallest raise: the last full bet or raise this street
    lastAggressor: null, // the last seat to bet or raise this street
    events: [], // this hand's log (see the module notes in docs/ARCHITECTURE.md)
    result: null,
  };
}

// What a seat holds for the hand being played; reset when a hand starts.
const handFields = () => ({
  inHand: false, // dealt into the current hand
  folded: false,
  allIn: false,
  hole: [],
  bet: 0, // put in this street
  committed: 0, // put in this hand, this street included
  acted: false, // has acted since the bet last went up
  canRaise: false, // false once they've acted, until someone raises in full
  shown: false,
});

const handRunning = (s) => s.phase === PHASES.BETTING || s.phase === PHASES.RUNOUT;
const withSeat = (s, i, seat) => ({ ...s, seats: s.seats.map((x, j) => (j === i ? seat : x)) });
const patchSeat = (s, i, patch) => withSeat(s, i, { ...s.seats[i], ...patch });
const log = (s, event) => ({ ...s, events: [...s.events, event] });

/** Seats clockwise after `seat` (not including it) passing `test`; the first, or null. */
function nextFrom(seat, test) {
  for (let i = 1; i <= MAX_SEATS; i++) {
    const j = (seat + i) % MAX_SEATS;
    if (test(j)) return j;
  }
  return null;
}

const isLive = (s, i) => !!s.seats[i]?.inHand && !s.seats[i].folded;
const liveSeats = (s) => s.seats.flatMap((p, i) => (isLive(s, i) ? [i] : []));

/**
 * player: { name, type: "HUMAN" | "AI", level?, avatar?, key?, stack }.
 * `key` is whoever the server knows the player as (never sent to browsers'
 * logic, only used to record results). Mid-hand, they wait for the next one.
 */
export function sit(state, seat, { name, type = "HUMAN", level = null, avatar = null, key = null, stack }) {
  if (!Number.isInteger(seat) || seat < 0 || seat >= MAX_SEATS) throw new Error("No such seat");
  if (state.seats[seat]) throw new Error("That seat is taken");
  if (!(stack > 0)) throw new Error("Bring some chips");
  return withSeat(state, seat, {
    name,
    type,
    level: type === "AI" ? level || "MEDIUM" : null,
    avatar,
    key,
    stack,
    bought: stack, // every chip ever brought to the table: net = stack - bought
    sittingOut: false,
    leaving: false,
    ...handFields(),
  });
}

/** The player leaves. In a hand, their cards fold now and the seat empties when it ends. */
export function standUp(state, seat) {
  const p = state.seats[seat];
  if (!p) return state;
  if (!handRunning(state) || !p.inHand) return withSeat(state, seat, null);
  let s = patchSeat(state, seat, { leaving: true });
  if (!p.folded) s = fold(s, seat);
  if (s.phase === PHASES.RUNOUT) return liveSeats(s).length === 1 ? winUncontested(s, liveSeats(s)[0]) : s;
  return settle(s, (s.turn + MAX_SEATS - 1) % MAX_SEATS);
}

/** Sitting out keeps the seat and stack but isn't dealt in. Coming back needs chips. */
export function setSittingOut(state, seat, out) {
  const p = state.seats[seat];
  if (!p) throw new Error("No one sits there");
  if (!out && p.stack === 0) throw new Error("Rebuy first");
  return patchSeat(state, seat, { sittingOut: !!out });
}

/** A busted player buys back in (free chips): back to `amount`, dealt in next hand. */
export function rebuy(state, seat, amount = BUY_IN) {
  const p = state.seats[seat];
  if (!p) throw new Error("No one sits there");
  if (p.stack > 0) throw new Error("You still have chips");
  if (handRunning(state) && p.inHand && !p.folded) throw new Error("Wait for the hand to end");
  return patchSeat(state, seat, { stack: amount, bought: p.bought + amount, sittingOut: false });
}

/** Seats that would be dealt into a hand starting now. */
export const nextHandSeats = (state) =>
  state.seats.flatMap((p, i) => (p && !p.leaving && !p.sittingOut && p.stack > 0 ? [i] : []));

export const canStartHand = (state) => !handRunning(state) && nextHandSeats(state).length >= 2;

/** No hand: players who left the last one are gone, and everyone's hand is cleared. */
export function toWaiting(state) {
  if (handRunning(state)) throw new Error("A hand is being played");
  return {
    ...state,
    phase: PHASES.WAITING,
    seats: state.seats.map((p) => (p && !p.leaving ? { ...p, ...handFields() } : null)),
    street: null,
    board: [],
    deck: [],
    turn: null,
    currentBet: 0,
    lastAggressor: null,
    result: null,
  };
}

// ---- A hand ------------------------------------------------------------------

/** Moves the button, posts the blinds, deals two cards each, and opens preflop betting. */
export function startHand(state, rng = secureRandom) {
  if (!canStartHand(state)) throw new Error("Need two players with chips");
  let s = toWaiting(state);
  const dealt = nextHandSeats(s);
  const isDealt = (i) => dealt.includes(i);
  const button = s.button == null ? dealt[Math.floor(rng() * dealt.length)] : nextFrom(s.button, isDealt);
  // Heads-up the button is the small blind.
  const sb = dealt.length === 2 ? button : nextFrom(button, isDealt);
  const bb = nextFrom(sb, isDealt);

  const deck = shuffle(createDeck(), rng);
  const order = fromLeftOf(button, MAX_SEATS).filter(isDealt);
  const holes = new Map(order.map((seat) => [seat, []]));
  for (let round = 0; round < 2; round++) for (const seat of order) holes.get(seat).push(deck.pop());

  s = {
    ...s,
    phase: PHASES.BETTING,
    handNumber: s.handNumber + 1,
    button,
    street: "PREFLOP",
    deck,
    currentBet: s.bigBlind,
    minRaise: s.bigBlind,
    seats: s.seats.map((p, i) => (isDealt(i) ? { ...p, inHand: true, canRaise: true, hole: holes.get(i) } : p)),
    events: [{ type: "hand", handNumber: s.handNumber + 1, button, seats: dealt }],
  };
  s = postBlind(s, sb, s.smallBlind, "small");
  s = postBlind(s, bb, s.bigBlind, "big");
  // Preflop the first to act sits left of the big blind (heads-up: the button).
  return settle(s, bb);
}

function postBlind(s, seat, amount, kind) {
  const p = s.seats[seat];
  const paid = Math.min(amount, p.stack);
  s = patchSeat(s, seat, { stack: p.stack - paid, bet: paid, committed: paid, allIn: p.stack === paid });
  return log(s, { type: "blind", seat, kind, amount: paid });
}

/**
 * What `seat` may do now, or null if it isn't their turn:
 * { toCall, canCheck, canRaise, minRaiseTo, maxRaiseTo }. Raises are "to" amounts:
 * the seat's whole bet this street after raising.
 */
export function legalActions(state, seat) {
  if (state.phase !== PHASES.BETTING || state.turn !== seat) return null;
  const p = state.seats[seat];
  const toCall = Math.min(state.currentBet - p.bet, p.stack);
  const maxRaiseTo = p.bet + p.stack;
  const opponentsWithChips = liveSeats(state).some((i) => i !== seat && !state.seats[i].allIn);
  return {
    toCall,
    canCheck: toCall === 0,
    canRaise: p.canRaise && maxRaiseTo > state.currentBet && opponentsWithChips,
    minRaiseTo: Math.min(state.currentBet + state.minRaise, maxRaiseTo),
    maxRaiseTo,
  };
}

/** Every chip put in this hand, current bets included. */
export const potSize = (state) => state.seats.reduce((sum, p) => sum + (p?.committed || 0), 0);

/**
 * `seat` acts: { type: "fold" | "check" | "call" | "raise" | "allin", amount? }.
 * `amount` (raise only) is what their bet becomes this street.
 */
export function act(state, seat, move) {
  if (state.phase !== PHASES.BETTING) throw new Error("No betting right now");
  if (state.turn !== seat) throw new Error("Not your turn");
  const legal = legalActions(state, seat);
  const p = state.seats[seat];
  switch (move?.type) {
    case "fold":
      return settle(fold(state, seat), seat);
    case "check": {
      if (!legal.canCheck) throw new Error("You can't check: there's a bet to call");
      const s = patchSeat(state, seat, { acted: true, canRaise: false });
      return settle(log(s, { type: "act", seat, action: "check", street: s.street }), seat);
    }
    case "call":
      if (legal.canCheck) throw new Error("Nothing to call: check instead");
      return settle(putIn(state, seat, legal.toCall, "call"), seat);
    case "raise": {
      const to = move.amount;
      if (!legal.canRaise) throw new Error("You can't raise now");
      if (!Number.isInteger(to)) throw new Error("Pick an amount");
      if (to > legal.maxRaiseTo) throw new Error("You don't have that many chips");
      if (to < legal.minRaiseTo) throw new Error(`Raise to at least ${legal.minRaiseTo}`);
      return settle(raiseTo(state, seat, to), seat);
    }
    case "allin": {
      const to = p.bet + p.stack;
      if (to > state.currentBet && legal.canRaise) return settle(raiseTo(state, seat, to), seat);
      if (legal.toCall === 0) throw new Error("Nothing to call: check instead");
      return settle(putIn(state, seat, legal.toCall, "call"), seat);
    }
    default:
      throw new Error("Unknown move");
  }
}

function fold(s, seat) {
  s = patchSeat(s, seat, { folded: true, acted: true, canRaise: false });
  return log(s, { type: "act", seat, action: "fold", street: s.street });
}

/** Calls `amount` more (all-in if it's everything they have). */
function putIn(s, seat, amount, action) {
  const p = s.seats[seat];
  const allIn = amount === p.stack;
  s = patchSeat(s, seat, { stack: p.stack - amount, bet: p.bet + amount, committed: p.committed + amount, allIn, acted: true, canRaise: false });
  return log(s, { type: "act", seat, action: allIn ? "allin" : action, amount: p.bet + amount, street: s.street });
}

/**
 * Bets or raises to `to`. A full raise (at least the last one) lets everyone
 * who already acted raise again; a short all-in only makes them call the extra.
 */
function raiseTo(s, seat, to) {
  const p = s.seats[seat];
  const add = to - p.bet;
  const raiseBy = to - s.currentBet;
  const full = raiseBy >= s.minRaise;
  const allIn = add === p.stack;
  const action = allIn ? "allin" : s.currentBet === 0 ? "bet" : "raise";
  s = {
    ...s,
    currentBet: to,
    minRaise: full ? raiseBy : s.minRaise,
    lastAggressor: seat,
    seats: s.seats.map((q, i) => {
      if (i === seat) return { ...q, stack: q.stack - add, bet: to, committed: q.committed + add, allIn, acted: true, canRaise: false };
      if (!isLive(s, i) || q.allIn) return q;
      return { ...q, acted: false, canRaise: full ? true : q.canRaise };
    }),
  };
  return log(s, { type: "act", seat, action, amount: to, street: s.street });
}

const needsToAct = (s, i) => {
  const p = s.seats[i];
  return isLive(s, i) && !p.allIn && (!p.acted || p.bet < s.currentBet);
};

/** After a move by `from`: whose turn it is next, or the street (or hand) is over. */
function settle(s, from) {
  const live = liveSeats(s);
  if (live.length === 1) return winUncontested(s, live[0]);
  const withChips = live.filter((i) => !s.seats[i].allIn);
  // Nobody left to bet against: one player with chips who has matched the bet.
  if (withChips.length === 0 || (withChips.length === 1 && s.seats[withChips[0]].bet >= s.currentBet)) return endStreet(s);
  const next = nextFrom(from, (i) => needsToAct(s, i));
  return next == null ? endStreet(s) : { ...s, turn: next };
}

function endStreet(s) {
  s = {
    ...s,
    turn: null,
    currentBet: 0,
    minRaise: s.bigBlind,
    seats: s.seats.map((p, i) => (p ? { ...p, bet: 0, acted: false, canRaise: isLive(s, i) && !p.allIn } : p)),
  };
  if (s.street === "RIVER") return showdown(s);
  const withChips = liveSeats(s).filter((i) => !s.seats[i].allIn);
  if (withChips.length <= 1) {
    // All-in: everyone still in shows, and the board runs out with no betting.
    s = { ...s, phase: PHASES.RUNOUT };
    for (const i of liveSeats(s)) s = showSeat(s, i);
    return s;
  }
  s = { ...dealStreet(s), lastAggressor: null };
  // After the flop the first to act sits left of the button.
  return { ...s, turn: nextFrom(s.button, (i) => needsToAct(s, i)) };
}

function dealStreet(s) {
  const street = STREETS[STREETS.indexOf(s.street) + 1];
  const deck = [...s.deck];
  deck.pop(); // burn
  const cards = Array.from({ length: street === "FLOP" ? 3 : 1 }, () => deck.pop());
  return log({ ...s, street, deck, board: [...s.board, ...cards] }, { type: "street", street, cards });
}

/** RUNOUT: the next street comes out; after the river, the showdown. */
export function advance(state) {
  if (state.phase !== PHASES.RUNOUT) throw new Error("Nothing to deal");
  return state.street === "RIVER" ? showdown(state) : dealStreet(state);
}

function showSeat(s, seat) {
  const p = s.seats[seat];
  if (p.shown) return s;
  s = patchSeat(s, seat, { shown: true });
  return log(s, { type: "show", seat, cards: p.hole, name: evaluate([...p.hole, ...s.board]).name });
}

/** Seats in the order they show: the river's last aggressor, else left of the button. */
function showOrder(s) {
  const live = liveSeats(s);
  const first = live.includes(s.lastAggressor) ? s.lastAggressor : nextFrom(s.button, (i) => live.includes(i));
  return [first, ...Array.from({ length: MAX_SEATS - 1 }, (_, k) => (first + 1 + k) % MAX_SEATS).filter((i) => live.includes(i))];
}

/**
 * Chips the top bettor put in that nobody matched go back to them: they can't
 * win them from anyone. Logged as a "return", never counted as a win.
 */
function returnUncalled(s) {
  const committed = s.seats.map((p) => p?.committed || 0);
  const top = committed.indexOf(Math.max(...committed));
  const matched = Math.max(0, ...committed.filter((_, i) => i !== top));
  const extra = committed[top] - matched;
  if (extra <= 0) return s;
  const p = s.seats[top];
  s = patchSeat(s, top, { stack: p.stack + extra, committed: p.committed - extra });
  return log(s, { type: "return", seat: top, amount: extra });
}

function showdown(s) {
  s = returnUncalled(s);
  const live = liveSeats(s);
  const hands = new Map(live.map((i) => [i, evaluate([...s.seats[i].hole, ...s.board])]));
  const scores = s.seats.map((_, i) => (hands.has(i) ? hands.get(i).score : null));
  const pots = buildPots(
    s.seats.map((p) => p?.committed || 0),
    s.seats.map((_, i) => live.includes(i)),
  );
  const { won, results } = awardPots(pots, scores, s.button, MAX_SEATS);
  // The first in order shows, and so does anyone who wins something; the rest muck.
  const order = showOrder(s);
  const winners = new Set(results.flatMap((r) => r.winners));
  for (const i of order) if (i === order[0] || winners.has(i)) s = showSeat(s, i);
  const shown = Object.fromEntries(
    live.filter((i) => s.seats[i].shown).map((i) => [i, { name: hands.get(i).name, label: hands.get(i).label, best: hands.get(i).cards.map((c) => c.id) }]),
  );
  return payOut(s, won, results, shown);
}

function winUncontested(s, seat) {
  s = returnUncalled(s);
  const total = potSize(s);
  const won = s.seats.map((_, i) => (i === seat ? total : 0));
  return payOut({ ...s, turn: null }, won, [{ amount: total, winners: [seat] }], {});
}

function payOut(s, won, pots, hands) {
  for (const [i, amount] of won.entries()) {
    if (amount > 0) s = log(s, { type: "award", seat: i, amount, name: hands[i]?.name ?? null });
  }
  return {
    ...s,
    phase: PHASES.HAND_OVER,
    turn: null,
    // A player out of chips sits out until they rebuy.
    seats: s.seats.map((p, i) => (p ? { ...p, stack: p.stack + won[i], sittingOut: p.sittingOut || p.stack + won[i] === 0 } : p)),
    result: { pots, won, hands },
  };
}

// ---- Views and summaries -----------------------------------------------------

/**
 * The table as `seat` may see it (-1: a spectator): other players' cards are
 * { hidden: true } until shown, the deck is gone, and `legal` is what this
 * seat may do now.
 */
export function viewFor(state, seat) {
  return {
    ...state,
    deck: [],
    // Keys are the server's names for players: no browser needs one.
    seats: state.seats.map((p, i) => (!p ? p : i === seat || p.shown ? { ...p, key: null } : { ...p, key: null, hole: p.hole.map(() => ({ hidden: true })) })),
    mySeat: seat,
    legal: legalActions(state, seat),
  };
}

const VOLUNTARY = new Set(["call", "bet", "raise", "allin"]);

/**
 * A finished hand, one entry per seat dealt in, for the match record:
 * { roundNumber, winnerSeat, seatResults: [{ seat_index, player_key, stack_before,
 * stack_after, net, won, folded_street, shown_hand, vpip, showdown }] }.
 */
export function handSummary(state) {
  if (state.phase !== PHASES.HAND_OVER) throw new Error("The hand isn't over");
  const { won, hands } = state.result;
  const contested = Object.keys(hands).length > 0;
  const seatResults = state.seats.flatMap((p, i) => {
    if (!p?.inHand) return [];
    const before = p.stack - won[i] + p.committed;
    const foldedOn = state.events.find((e) => e.type === "act" && e.seat === i && e.action === "fold")?.street ?? null;
    return [
      {
        seat_index: i,
        player_key: p.key,
        stack_before: before,
        stack_after: p.stack,
        net: p.stack - before,
        won: won[i],
        folded_street: foldedOn,
        shown_hand: hands[i]?.name ?? null,
        vpip: state.events.some((e) => e.type === "act" && e.seat === i && e.street === "PREFLOP" && VOLUNTARY.has(e.action)),
        showdown: contested && !p.folded,
      },
    ];
  });
  const winnerSeat = seatResults.reduce((best, r) => (best == null || r.net > best.net ? r : best), null)?.seat_index ?? null;
  return { roundNumber: state.handNumber, winnerSeat, seatResults };
}
