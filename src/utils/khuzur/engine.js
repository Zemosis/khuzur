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

import { HAND_SIZES, cardPower, coverAssignment, createDeck, isJoker, isValidLead, shuffle, secureRandom } from "./cards.js";

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

// Copies everything an action may change.
function clone(state) {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
    drawPile: [...state.drawPile],
    deadPile: [...state.deadPile],
    stack: state.stack && {
      ...state.stack,
      layers: state.stack.layers.map((layer) => [...layer]),
      owners: [...state.stack.owners],
      pending: [...state.stack.pending],
    },
    places: [...state.places],
    events: [...state.events],
  };
}

/** Takes the cards out of the player's hand, in the order the ids are given. */
function takeFromHand(player, cardIds) {
  if (new Set(cardIds).size !== cardIds.length) throw new Error("Pick each card once");
  return cardIds.map((id) => {
    const i = player.hand.findIndex((c) => c.id === id);
    if (i < 0) throw new Error(`${id} isn't in your hand`);
    return player.hand.splice(i, 1)[0];
  });
}

/** Draw from the pile, then the face-up trump, back up to the hand size. */
function drawUp(state, seat) {
  const hand = state.players[seat].hand;
  let count = 0;
  let tookTrump = false;
  while (hand.length < state.table.handSize && state.drawPile.length) {
    hand.push(state.drawPile.shift());
    count++;
  }
  if (hand.length < state.table.handSize && state.trumpCard) {
    hand.push(state.trumpCard);
    state.trumpCard = null;
    tookTrump = true;
    count++;
  }
  if (count) state.events.push({ type: "draw", seat, count, tookTrump });
}

const placesGiven = (state) => state.places.filter((p) => p !== null).length;
const seatsOfTeam = (state, team) => state.players.filter((p) => p.team === team).map((p) => p.id);

/**
 * A player with no cards left is out (rulebook §9). Their team takes the next
 * place, and in a team game every teammate stops playing too. Once a single
 * team is left still playing, it takes the last place and the match is over.
 */
function settleOut(state, seat) {
  if (state.players[seat].hand.length) return;
  const team = state.players[seat].team;
  for (const s of seatsOfTeam(state, team)) state.players[s].out = true;
  const place = placesGiven(state) + 1;
  state.places[team] = place;
  state.events.push({ type: "out", seat, team, place });
  if (state.stack) state.stack.pending = state.stack.pending.filter((s) => !state.players[s].out);

  const playing = [...new Set(state.players.filter((p) => !p.out).map((p) => p.team))];
  if (playing.length === 1) {
    state.places[playing[0]] = placesGiven(state) + 1;
    endMatch(state);
  }
}

function endMatch(state) {
  state.phase = PHASES.MATCH_OVER;
  state.turn = null;
  state.events.push({ type: "matchOver", places: [...state.places] });
}

// ---- PLAY ------------------------------------------------------------------

/** The cards the next player must beat, or null with no stack open. */
export const topLayer = (state) => state.stack?.layers.at(-1) ?? null;

/** Lead 1, 3, 5 or 7 cards at the next player (rulebook §5). */
export function lead(prev, seat, cardIds) {
  expectTurn(prev, PHASES.PLAY, seat);
  if (prev.stack) throw new Error("Beat the stack or pick it up");
  const limit = leadLimit(prev);
  const state = clone(prev);
  const cards = takeFromHand(state.players[seat], cardIds);
  if (!isValidLead(cards)) throw new Error("That isn't a valid lead");
  if (cards.length > limit) throw new Error(`You can lead at most ${limit} card${limit === 1 ? "" : "s"}`);
  state.stack = { leader: seat, layers: [cards], owners: [seat], pending: seatsAfter(state, seat) };
  state.events.push({ type: "lead", seat, cards });
  drawUp(state, seat);
  settleOut(state, seat);
  if (state.phase === PHASES.PLAY) state.turn = state.stack.pending[0];
  return state;
}

/** Cover every card of the top layer, one card each (rulebook §6). */
export function beat(prev, seat, cardIds) {
  expectTurn(prev, PHASES.PLAY, seat);
  if (!prev.stack) throw new Error("There's nothing to beat");
  const top = topLayer(prev);
  if (cardIds.length !== top.length) throw new Error(`Beat with exactly ${top.length} card${top.length === 1 ? "" : "s"}`);
  const state = clone(prev);
  const cards = takeFromHand(state.players[seat], cardIds);
  const cover = coverAssignment(top, cards, state.trumpSuit);
  if (!cover) throw new Error("Those cards don't beat the top layer");
  state.stack.layers.push(cover);
  state.stack.owners.push(seat);
  state.stack.pending.shift();
  state.events.push({ type: "beat", seat, cards: cover });
  drawUp(state, seat);
  settleOut(state, seat);
  if (state.phase !== PHASES.PLAY) return state;
  if (state.stack.pending.length) {
    state.turn = state.stack.pending[0];
    return state;
  }
  // All the way round: the stack goes dead and the last beater leads.
  const dead = state.stack.layers.flat();
  state.deadPile.push(...dead);
  state.stack = null;
  state.events.push({ type: "dead", count: dead.length, seat });
  state.turn = state.players[seat].out ? nextIn(state, seat) : seat;
  return state;
}

/** Take the whole stack into your hand; the player on your left leads (rulebook §6). */
export function pickUp(prev, seat) {
  expectTurn(prev, PHASES.PLAY, seat);
  if (!prev.stack) throw new Error("There's nothing to pick up");
  const state = clone(prev);
  const cards = state.stack.layers.flat();
  state.players[seat].hand.push(...cards);
  state.stack = null;
  state.events.push({ type: "pickUp", seat, count: cards.length });
  state.turn = nextIn(state, seat);
  return state;
}

/** On your own turn, you may swap the trump 7 for the face-up trump (rulebook §8). */
export function canSwapSeven(state, seat) {
  if (state.phase !== PHASES.PLAY || state.turn !== seat) return false;
  const face = state.trumpCard;
  if (!face || face.rank === "7") return false;
  return state.players[seat].hand.some((c) => c.rank === "7" && c.suit === state.trumpSuit);
}

export function swapTrumpSeven(prev, seat) {
  if (!canSwapSeven(prev, seat)) throw new Error("You can't swap now");
  const state = clone(prev);
  const hand = state.players[seat].hand;
  const i = hand.findIndex((c) => c.rank === "7" && c.suit === state.trumpSuit);
  const [seven] = hand.splice(i, 1, state.trumpCard);
  state.events.push({ type: "swapSeven", seat, card: state.trumpCard });
  state.trumpCard = seven;
  return state;
}

// ---- Endings ---------------------------------------------------------------

/**
 * Give up: you, or your whole team, take the last place and the match ends.
 * Everyone else still playing is placed by the cards they hold, fewest first
 * (a team by its smallest hand), ties to the lower seat.
 */
export function surrender(prev, seat) {
  if (prev.phase !== PHASES.PLAY) throw new Error("You can only surrender during play");
  if (prev.players[seat].out) throw new Error("You're already out");
  const state = clone(prev);
  const quitter = state.players[seat].team;
  const smallest = (team) => Math.min(...seatsOfTeam(state, team).map((s) => state.players[s].hand.length));
  const rest = state.places
    .map((place, team) => ({ place, team }))
    .filter((t) => t.place === null && t.team !== quitter)
    .sort((a, b) => smallest(a.team) - smallest(b.team) || a.team - b.team);
  for (const { team } of rest) state.places[team] = placesGiven(state) + 1;
  state.places[quitter] = state.places.length;
  state.stack = null;
  state.events.push({ type: "surrender", seat, team: quitter });
  endMatch(state);
  return state;
}

/** The final places, best first: [{ team, place, seats }]. */
export function standings(state) {
  return state.places
    .map((place, team) => ({ team, place, seats: seatsOfTeam(state, team) }))
    .filter((t) => t.place !== null)
    .sort((a, b) => a.place - b.place);
}

/**
 * Deal the next match at the same table, with no draw. A free for all passes
 * the deal clockwise. In a team game the last-place team deals: the seat after
 * its last dealer, or a random member the first time it deals.
 */
export function startNextMatch(prev, rng = secureRandom) {
  if (prev.phase !== PHASES.MATCH_OVER) throw new Error("The match isn't over");
  const n = prev.players.length;
  let dealer;
  let teamDealers = prev.teamDealers;
  if (isFreeForAll(prev)) {
    dealer = (prev.dealer + 1) % n;
  } else {
    const last = prev.places.indexOf(Math.max(...prev.places));
    const before = prev.teamDealers[last];
    const members = seatsOfTeam(prev, last);
    dealer = before != null ? (before + prev.table.teams) % n : members[Math.floor(rng() * members.length)];
    teamDealers = { ...prev.teamDealers, [last]: dealer };
  }
  const state = {
    ...prev,
    matchNumber: prev.matchNumber + 1,
    teamDealers,
    players: prev.players.map((p) => ({ ...p, hand: [], out: false })),
    events: [{ type: "newMatch", matchNumber: prev.matchNumber + 1 }],
  };
  return deal(state, dealer, rng);
}
