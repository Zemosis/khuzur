// KHUZUR ENGINE — the rules of docs/khuzur-rulebook.md as pure functions.
//
// Every action takes a state and returns a new one (the input is never
// changed), and throws on a move the rules don't allow. Nothing here touches
// React, timers or sockets, so the same file can run on the server later.
// Randomness comes in through an `rng` argument (default secureRandom).
//
// A match moves through these phases:
//   DRAW        the draw for the deal (the first match at a table only)
//   PLAY        stacks are led, beaten and picked up; `turn` moves next
//   MATCH_OVER  every team has a place; startNextMatch() deals again
//
// Seats go clockwise: the next seat is seat + 1, the player on your left.
// Teams alternate seats, so a seat's team is seat % teams. In a free for all
// every player is a team of one.

import { HAND_SIZES, cardPower, createDeck, isJoker, shuffle, secureRandom } from "./cards.js";

export const PHASES = { DRAW: "DRAW", PLAY: "PLAY", MATCH_OVER: "MATCH_OVER" };
export const MAX_DRAW_DEPTH = 10; // the deepest card you may draw for the deal
export const MAX_SEATS = 6;

// ---- Tables and seats ------------------------------------------------------

/** Free for all (1 per team) with 2–6 players, or teams of 2 (2–3 teams) or 3 (2 teams). */
export function isValidTable({ perTeam, teams }) {
  if (perTeam === 1) return teams >= 2 && teams <= MAX_SEATS;
  if (perTeam === 2) return teams === 2 || teams === 3;
  if (perTeam === 3) return teams === 2;
  return false;
}

export const seatCount = (table) => table.perTeam * table.teams;
export const teamOf = (state, seat) => seat % state.table.teams;
export const isFreeForAll = (state) => state.table.perTeam === 1;

/** The next seat clockwise after `seat` whose player is still playing. */
export function nextIn(state, seat) {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const s = (seat + i) % n;
    if (!state.players[s].out) return s;
  }
  return null;
}

/** Seats still playing, clockwise, starting after `seat`. */
export function seatsAfter(state, seat) {
  const n = state.players.length;
  const out = [];
  for (let i = 1; i < n; i++) {
    const s = (seat + i) % n;
    if (!state.players[s].out) out.push(s);
  }
  return out;
}

/** The most cards a lead may hold: the game's hand size, or the smallest hand still playing. */
export function leadLimit(state) {
  const hands = state.players.filter((p) => !p.out).map((p) => p.hand.length);
  return Math.min(state.table.handSize, ...hands);
}

// ---- Match setup -----------------------------------------------------------

/**
 * players: [{ name, type: "HUMAN" | "AI", avatar? }], one per seat.
 * table: { perTeam, teams, handSize: 5 | 7 }.
 * The match opens with the draw for the deal (see drawForDeal).
 */
export function createMatch({ players, table, rng = secureRandom, matchNumber = 1 }) {
  if (!isValidTable(table)) throw new Error("That isn't a Khuzur table");
  if (!HAND_SIZES.includes(table.handSize)) throw new Error(`No ${table.handSize}-card game`);
  const n = seatCount(table);
  if (players.length !== n) throw new Error(`This table needs ${n} players`);
  const starter = Math.floor(rng() * n);
  return {
    matchNumber,
    table: { perTeam: table.perTeam, teams: table.teams, handSize: table.handSize },
    players: players.map((p, seat) => ({
      id: seat,
      name: p.name,
      type: p.type || "AI",
      avatar: p.avatar ?? null,
      team: seat % table.teams,
      hand: [],
      out: false,
    })),
    phase: PHASES.DRAW,
    turn: starter,
    dealer: null,
    dealDeck: shuffle(createDeck(table.handSize), rng), // drawn from for the deal, top first
    dealDraws: [], // { seat, card, depth, round }
    drawRound: 1,
    drawers: Array.from({ length: n }, (_, i) => (starter + i) % n), // still to draw, in order
    trumpCard: null, // face up on the table until someone draws it
    trumpSuit: null,
    drawPile: [], // top first; the trump card is drawn after it
    deadPile: [],
    stack: null, // { leader, layers: Card[][], owners: seat[], pending: seat[] }
    places: Array(table.teams).fill(null), // per team, 1 = first
    teamDealers: {}, // team -> the seat that last dealt for it
    events: [{ type: "drawStart", seat: starter }],
  };
}

export const maxDrawDepth = (state) => Math.min(MAX_DRAW_DEPTH, state.dealDeck.length);

/**
 * `seat` takes the depth-th card from the top of the pile. Once everyone has
 * drawn, the highest card deals (by rank, then suit, with no trump). Players
 * tied with twins draw again, the others don't.
 */
export function drawForDeal(prev, seat, depth, rng = secureRandom) {
  expectTurn(prev, PHASES.DRAW, seat);
  const max = maxDrawDepth(prev);
  if (!Number.isInteger(depth) || depth < 1 || depth > max) throw new Error(`Draw a card between 1 and ${max} deep`);
  const state = { ...prev, dealDeck: [...prev.dealDeck], dealDraws: [...prev.dealDraws], events: [...prev.events] };
  const [card] = state.dealDeck.splice(depth - 1, 1);
  state.dealDraws.push({ seat, card, depth, round: prev.drawRound });
  state.events.push({ type: "dealDraw", seat, card, depth });
  state.drawers = prev.drawers.slice(1);
  if (state.drawers.length) {
    state.turn = state.drawers[0];
    return state;
  }

  const thisRound = state.dealDraws.filter((d) => d.round === prev.drawRound);
  const top = Math.max(...thisRound.map((d) => cardPower(d.card, null)));
  const tied = thisRound.filter((d) => cardPower(d.card, null) === top).map((d) => d.seat);
  if (tied.length > 1) {
    state.drawRound = prev.drawRound + 1;
    state.drawers = tied;
    state.turn = tied[0];
    state.events.push({ type: "drawTie", seats: tied });
    return state;
  }
  const winner = tied[0];
  const winning = thisRound.find((d) => d.seat === winner);
  state.events.push({ type: "firstDealer", seat: winner, card: winning.card });
  state.teamDealers = { ...prev.teamDealers, [teamOf(prev, winner)]: winner };
  return deal(state, winner, rng);
}

/**
 * Deal a round: one card at a time, clockwise from the dealer's left, until
 * everyone holds the hand size. The next card is turned up as trump; a joker
 * turned up goes back into the middle of the pile and the next card is turned
 * instead. `deck` is the shuffled deck, top first.
 */
export function deal(prev, dealer, rng = secureRandom, deck = shuffle(createDeck(prev.table.handSize), rng)) {
  const n = prev.players.length;
  const size = prev.table.handSize;
  const hands = Array.from({ length: n }, () => []);
  let next = 0;
  for (let round = 0; round < size; round++) {
    for (let i = 1; i <= n; i++) hands[(dealer + i) % n].push(deck[next++]);
  }
  const pile = deck.slice(next);
  const events = [...prev.events];
  const returned = [];
  while (isJoker(pile[0])) returned.push(pile.shift());
  const trumpCard = pile.shift();
  for (const joker of returned) {
    const lo = Math.floor(pile.length / 4);
    const hi = Math.ceil((3 * pile.length) / 4);
    pile.splice(lo + Math.floor(rng() * (hi - lo + 1)), 0, joker);
    events.push({ type: "jokerReturned", card: joker });
  }
  events.push({ type: "deal", dealer, trumpCard });

  const state = {
    ...prev,
    phase: PHASES.PLAY,
    dealer,
    players: prev.players.map((p, seat) => ({ ...p, hand: hands[seat], out: false })),
    trumpCard,
    trumpSuit: trumpCard.suit,
    drawPile: pile,
    deadPile: [],
    stack: null,
    places: Array(prev.table.teams).fill(null),
    drawers: [],
    events,
  };
  state.turn = nextIn(state, dealer);
  return state;
}

// ---- Helpers shared by actions ---------------------------------------------

function expectTurn(state, phase, seat) {
  if (state.phase !== phase) throw new Error(`Not the ${phase} phase`);
  if (state.turn !== seat) throw new Error("Not your turn");
}
