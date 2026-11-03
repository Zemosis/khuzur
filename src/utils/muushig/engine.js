// MUUSHIG ENGINE — the rules of docs/muushig-rulebook.md as pure functions.
//
// Every action takes a state and returns a new one (the input is never
// changed), and throws on a move the rules don't allow. Nothing here touches
// React, timers or sockets, so the same file can run on the server later.
//
// A match opens with the draw for the deal:
//   DRAW       from a pile in the middle, each player (a random one first,
//              then clockwise) takes the N-th card from the top; the highest
//              card deals the first round. Tied players draw again.
// A round moves through these phases:
//   DECIDE     each player, left of the dealer first, goes in or folds
//   SWAP       each playing player discards and draws (dealer last)
//   TRUMP      a playing dealer may swap a card for the face-up trump
//   PLAY       tricks; `turn` is whoever must play next
//   TRICK_END  every card is down; `trickWinner` is about to eat the pile
//   ROUND_END  scores are in; startNextRound() deals again
//   MATCH_OVER someone reached 0; `matchWinner` is set
//
// Seats are 0–4 and clockwise is seat + 1. Randomness comes in through an
// `rng` argument (default secureRandom) so tests can make it predictable.

export const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUITS = ["♠", "♥", "♦", "♣"];
export const PLAYER_COUNT = 5;
export const HAND_SIZE = 5;
export const TRICKS_PER_ROUND = 5;
export const START_SCORE = 15;
export const ZERO_PILES_PENALTY = 5;
export const MIN_PLAYING = 2;
export const MAX_FOLDS_IN_A_ROW = 2; // the next round after this many folds, you must go in
export const MAX_DRAW_DEPTH = 10; // the deepest card you may draw for the deal

export const PHASES = {
  DRAW: "DRAW",
  DECIDE: "DECIDE",
  SWAP: "SWAP",
  TRUMP: "TRUMP",
  PLAY: "PLAY",
  TRICK_END: "TRICK_END",
  ROUND_END: "ROUND_END",
  MATCH_OVER: "MATCH_OVER",
};

// ---- Cards -----------------------------------------------------------------

export function makeCard(rank, suit) {
  return { id: `${rank}${suit}`, rank, suit, rankValue: RANKS.indexOf(rank), suitValue: SUITS.indexOf(suit) };
}

export function createDeck() {
  return SUITS.flatMap((suit) => RANKS.map((rank) => makeCard(rank, suit)));
}

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

// ---- Seats -----------------------------------------------------------------

export const leftOf = (seat) => (seat + 1) % PLAYER_COUNT;

/** Seats starting left of the dealer, ending with the dealer. */
export function seatsFromDealer(dealer) {
  return Array.from({ length: PLAYER_COUNT }, (_, i) => (dealer + 1 + i) % PLAYER_COUNT);
}

const isPlaying = (state, seat) => state.players[seat].status === "play";
const playingCount = (state) => state.players.filter((p) => p.status === "play").length;

/** Next playing seat clockwise after `seat`. */
function nextPlaying(state, seat) {
  for (let i = 1; i <= PLAYER_COUNT; i++) {
    const s = (seat + i) % PLAYER_COUNT;
    if (isPlaying(state, s)) return s;
  }
  return null;
}

// ---- Match and round setup -------------------------------------------------

/**
 * players: [{ name, type: "HUMAN" | "AI", level?: "EASY"|"MEDIUM"|"HARD" }] ×5.
 * The match opens with the draw for the deal (see drawForDeal).
 */
export function createMatch({ players, rng = secureRandom, matchNumber = 1, startScore = START_SCORE }) {
  if (players.length !== PLAYER_COUNT) throw new Error(`Muushig needs ${PLAYER_COUNT} players`);
  const starter = Math.floor(rng() * PLAYER_COUNT);
  return {
    matchNumber,
    roundNumber: 0,
    dealer: null,
    players: players.map((p, seat) => ({
      id: seat,
      name: p.name,
      type: p.type || "AI",
      level: p.level || null,
      avatar: p.avatar ?? null,
      score: startScore,
      hand: [],
      status: null,
      eaten: 0,
      discarded: [],
      foldStreak: 0, // rounds folded in a row; carries from round to round
    })),
    dealDeck: shuffle(createDeck(), rng), // the pile drawn from for the deal, top first
    dealDraws: [], // { seat, card, depth }
    drawers: Array.from({ length: PLAYER_COUNT }, (_, i) => (starter + i) % PLAYER_COUNT), // still to draw, in order
    trumpCard: null,
    trumpSuit: null,
    trumpTakenBy: null,
    drawPile: [],
    deadPile: [],
    played: [],
    trick: [],
    trickNumber: 0,
    trickWinner: null,
    lastTrick: null,
    roundResults: null,
    phase: PHASES.DRAW,
    turn: starter,
    events: [{ type: "drawStart", seat: starter }],
    matchWinner: null,
  };
}

// ---- DRAW ------------------------------------------------------------------

export const maxDrawDepth = (state) => Math.min(MAX_DRAW_DEPTH, state.dealDeck.length);

// The draw for the deal is settled by rank, then suit: ♠ beats ♥ beats ♦
// beats ♣. Every card in the deck differs, so two draws never tie.
const DRAW_SUIT_ORDER = ["♣", "♦", "♥", "♠"];
const drawValue = (card) => card.rankValue * SUITS.length + DRAW_SUIT_ORDER.indexOf(card.suit);

/**
 * `seat` takes the depth-th card from the top of the pile; the cards above it
 * stay. Once everyone has drawn, the highest card deals (see drawValue).
 */
export function drawForDeal(prev, seat, depth, rng = secureRandom) {
  expect(prev, PHASES.DRAW, seat);
  const max = maxDrawDepth(prev);
  if (!Number.isInteger(depth) || depth < 1 || depth > max) throw new Error(`Draw a card between 1 and ${max} deep`);
  const state = { ...prev, dealDeck: [...prev.dealDeck], dealDraws: [...prev.dealDraws], events: [...prev.events] };
  const [card] = state.dealDeck.splice(depth - 1, 1);
  state.dealDraws.push({ seat, card, depth });
  state.events.push({ type: "dealDraw", seat, card, depth });

  state.drawers = prev.drawers.slice(1);
  if (state.drawers.length) {
    state.turn = state.drawers[0];
    return state;
  }

  const win = state.dealDraws.reduce((a, b) => (drawValue(b.card) > drawValue(a.card) ? b : a));
  state.events.push({ type: "firstDealer", seat: win.seat, card: win.card });
  return dealRound(state, win.seat, rng);
}

function dealRound(prev, dealer, rng) {
  const state = { ...prev };
  const deck = shuffle(createDeck(), rng);
  const order = seatsFromDealer(dealer);
  const hands = Array.from({ length: PLAYER_COUNT }, () => []);
  let next = 0;
  for (let round = 0; round < HAND_SIZE; round++) {
    for (const seat of order) hands[seat].push(deck[next++]);
  }
  const trumpCard = deck[next++];

  state.roundNumber = prev.roundNumber + 1;
  state.dealer = dealer;
  state.players = prev.players.map((p, seat) => ({ ...p, hand: hands[seat], status: null, eaten: 0, discarded: [] }));
  state.trumpCard = trumpCard;
  state.trumpSuit = trumpCard.suit;
  state.trumpTakenBy = null;
  state.drawPile = deck.slice(next);
  state.deadPile = [];
  state.played = [];
  state.trick = [];
  state.trickNumber = 0;
  state.trickWinner = null;
  state.lastTrick = null;
  state.roundResults = null;
  state.phase = PHASES.DECIDE;
  state.turn = leftOf(dealer);
  state.events = [...prev.events, { type: "round", round: state.roundNumber, seat: dealer, card: trumpCard }];
  return state;
}

/** Deal the next round; the deal passes clockwise. */
export function startNextRound(prev, rng = secureRandom) {
  if (prev.phase !== PHASES.ROUND_END) throw new Error("The round isn't over");
  return dealRound(prev, leftOf(prev.dealer), rng);
}

/** A fresh match with the same players. */
export function rematch(prev, rng = secureRandom) {
  return createMatch({
    players: prev.players.map(({ name, type, level, avatar }) => ({ name, type, level, avatar })),
    rng,
    matchNumber: prev.matchNumber + 1,
  });
}

// ---- Helpers shared by actions and queries ---------------------------------

// Copies everything an action may change.
function clone(state) {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand], discarded: [...p.discarded] })),
    drawPile: [...state.drawPile],
    deadPile: [...state.deadPile],
    played: [...state.played],
    trick: state.trick.map((p) => ({ ...p })),
    events: [...state.events],
  };
}

function expect(state, phase, seat) {
  if (state.phase !== phase) throw new Error(`Not the ${phase} phase`);
  if (state.turn !== seat) throw new Error("Not your turn");
}

function takeFromHand(player, cardId) {
  const i = player.hand.findIndex((c) => c.id === cardId);
  if (i < 0) throw new Error(`${cardId} isn't in the hand`);
  return player.hand.splice(i, 1)[0];
}

// ---- DECIDE ----------------------------------------------------------------

/**
 * Why a player can't fold right now, or null if they can:
 *   "streak"  they folded the last MAX_FOLDS_IN_A_ROW rounds
 *   "short"   they're needed to make MIN_PLAYING players
 */
export function foldBlock(state, seat) {
  if ((state.players[seat].foldStreak ?? 0) >= MAX_FOLDS_IN_A_ROW) return "streak";
  const undecidedOthers = state.players.filter((p, s) => s !== seat && p.status === null).length;
  return playingCount(state) + undecidedOthers >= MIN_PLAYING ? null : "short";
}

export const canFold = (state, seat) => foldBlock(state, seat) === null;

export function decide(prev, seat, play) {
  expect(prev, PHASES.DECIDE, seat);
  const block = play ? null : foldBlock(prev, seat);
  if (block === "streak") throw new Error(`You folded ${MAX_FOLDS_IN_A_ROW} rounds in a row: you must go in`);
  if (block === "short") throw new Error(`At least ${MIN_PLAYING} players must go in`);
  const state = clone(prev);
  const player = state.players[seat];
  player.status = play ? "play" : "fold";
  player.foldStreak = play ? 0 : (player.foldStreak ?? 0) + 1;
  if (!play) {
    state.deadPile.push(...player.hand);
    player.hand = [];
  }
  state.events.push({ type: play ? "playIn" : "fold", seat });

  const order = seatsFromDealer(state.dealer);
  const next = order.find((s) => state.players[s].status === null);
  if (next !== undefined) {
    state.turn = next;
    return state;
  }
  state.phase = PHASES.SWAP;
  state.turn = order.find((s) => isPlaying(state, s));
  return skipSwapsWithEmptyPile(state);
}

// ---- SWAP ------------------------------------------------------------------

export const maxDiscard = (state) => Math.min(HAND_SIZE, state.drawPile.length);

export function swap(prev, seat, cardIds = []) {
  expect(prev, PHASES.SWAP, seat);
  if (new Set(cardIds).size !== cardIds.length) throw new Error("Duplicate cards");
  if (cardIds.length > maxDiscard(prev)) throw new Error("Not enough cards in the draw pile");
  const state = clone(prev);
  const player = state.players[seat];
  const out = cardIds.map((id) => takeFromHand(player, id));
  state.deadPile.push(...out);
  player.discarded.push(...out);
  player.hand.push(...state.drawPile.splice(0, out.length));
  state.events.push({ type: "swap", seat, count: out.length });
  return advanceSwap(state, seat);
}

function advanceSwap(state, seat) {
  const order = seatsFromDealer(state.dealer);
  const next = order.slice(order.indexOf(seat) + 1).find((s) => isPlaying(state, s));
  if (next !== undefined) {
    state.turn = next;
    return skipSwapsWithEmptyPile(state);
  }
  if (isPlaying(state, state.dealer)) {
    state.phase = PHASES.TRUMP;
    state.turn = state.dealer;
    return state;
  }
  return startPlay(state);
}

// With the draw pile empty nobody else can swap: record it and move on.
function skipSwapsWithEmptyPile(state) {
  if (state.phase !== PHASES.SWAP || state.drawPile.length > 0) return state;
  const seat = state.turn;
  state.events.push({ type: "swap", seat, count: 0, emptyPile: true });
  return advanceSwap(state, seat);
}

// ---- TRUMP -----------------------------------------------------------------

/** The dealer gives up `cardId` for the trump card, or passes with null. */
export function takeTrump(prev, seat, cardId = null) {
  expect(prev, PHASES.TRUMP, seat);
  const state = clone(prev);
  if (cardId) {
    const player = state.players[seat];
    const out = takeFromHand(player, cardId);
    state.deadPile.push(out);
    player.discarded.push(out);
    player.hand.push({ ...state.trumpCard });
    state.trumpTakenBy = seat;
    state.events.push({ type: "takeTrump", seat, card: state.trumpCard });
  } else {
    state.events.push({ type: "keepTrump", seat });
  }
  return startPlay(state);
}

// ---- PLAY ------------------------------------------------------------------

function startPlay(state) {
  state.phase = PHASES.PLAY;
  state.trickNumber = 1;
  state.trick = [];
  state.turn = nextPlaying(state, state.dealer);
  return state;
}

/** Suit of the trick's first card (null before anyone plays). */
export function ledSuit(trick) {
  return trick[0]?.card.suit ?? null;
}

/** How strong a card is in this trick: off-suit < led suit < trump. */
export function cardPower(card, led, trumpSuit) {
  if (card.suit === trumpSuit) return 100 + card.rankValue;
  if (card.suit === led) return card.rankValue;
  return -1;
}

/** Seat whose card eats the trick so far (the first card wins a full tie). */
export function trickWinner(trick, trumpSuit) {
  const led = ledSuit(trick);
  let best = null;
  for (const play of trick) {
    const power = cardPower(play.card, led, trumpSuit);
    if (!best || power > best.power) best = { seat: play.seat, power };
  }
  return best?.seat ?? null;
}

/**
 * The trick as it lies on the table, bottom first: a card that beats the top
 * card goes on top, anything weaker is tucked underneath.
 */
export function stackOrder(trick, trumpSuit) {
  const led = ledSuit(trick);
  const stack = [];
  for (const play of trick) {
    const top = stack[stack.length - 1];
    if (!top || cardPower(play.card, led, trumpSuit) > cardPower(top.card, led, trumpSuit)) stack.push(play);
    else stack.unshift(play);
  }
  return stack;
}

/** The highest rank of `suit` in the trick so far (-1 if none). */
const topOf = (trick, suit) => Math.max(-1, ...trick.filter((p) => p.card.suit === suit).map((p) => p.card.rankValue));

/**
 * Cards a player may put down. Leading, any card. Following:
 *   1. Hold the led suit: play it, and a higher one than any of it on the
 *      table if you can (even when someone has trumped in).
 *   2. Else hold a trump: play one, and a higher one than any trump on the
 *      table if you can.
 *   3. Else any card.
 */
export function allowedPlays(state, seat) {
  const hand = state.players[seat].hand;
  const led = ledSuit(state.trick);
  if (!led) return hand;
  for (const suit of [led, state.trumpSuit]) {
    const held = hand.filter((c) => c.suit === suit);
    if (!held.length) continue;
    const top = topOf(state.trick, suit);
    const higher = held.filter((c) => c.rankValue > top);
    return higher.length ? higher : held;
  }
  return hand;
}

export function playCard(prev, seat, cardId) {
  expect(prev, PHASES.PLAY, seat);
  const allowed = allowedPlays(prev, seat);
  const chosen = allowed.find((c) => c.id === cardId);
  if (!chosen) throw new Error(`${cardId} can't be played now`);

  const state = clone(prev);
  const player = state.players[seat];
  const card = takeFromHand(player, cardId);
  state.trick.push({ seat, card });
  state.played.push(card);
  state.events.push({ type: "play", seat, card, trick: state.trickNumber });

  if (state.trick.length === playingCount(state)) {
    state.phase = PHASES.TRICK_END;
    state.trickWinner = trickWinner(state.trick, state.trumpSuit);
    state.turn = null;
  } else {
    state.turn = nextPlaying(state, seat);
  }
  return state;
}

/** The trick's winner eats the pile; the next trick or the scoring follows. */
export function collectTrick(prev) {
  if (prev.phase !== PHASES.TRICK_END) throw new Error("The trick isn't finished");
  const state = clone(prev);
  const winner = state.trickWinner;
  state.players[winner].eaten += 1;
  state.events.push({ type: "eat", seat: winner, trick: state.trickNumber, cards: state.trick.map((p) => p.card) });
  state.lastTrick = { winner, trick: state.trick };
  state.trick = [];
  state.trickWinner = null;
  if (state.trickNumber >= TRICKS_PER_ROUND) return endRound(state);
  state.trickNumber += 1;
  state.phase = PHASES.PLAY;
  state.turn = winner;
  return state;
}

// ---- Scoring ---------------------------------------------------------------

/** Score change for a round: 0 when folded, −1 per pile, +5 for none. */
export function roundDelta(player) {
  if (player.status !== "play") return 0;
  return player.eaten > 0 ? -player.eaten : ZERO_PILES_PENALTY;
}

function endRound(state) {
  const results = state.players.map((p, seat) => {
    const delta = roundDelta(p);
    p.score += delta;
    return { seat, eaten: p.eaten, folded: p.status !== "play", delta, score: p.score };
  });
  const sweeper = state.players.findIndex((p) => p.eaten >= TRICKS_PER_ROUND);
  state.roundResults = { results, roundWinner: sweeper >= 0 ? sweeper : null };
  state.events.push({ type: "roundEnd", round: state.roundNumber, results, roundWinner: state.roundResults.roundWinner });
  state.turn = null;

  const finished = state.players.filter((p) => p.score <= 0);
  if (!finished.length) {
    state.phase = PHASES.ROUND_END;
    return state;
  }
  const winner = [...finished].sort((a, b) => a.score - b.score || b.eaten - a.eaten || a.id - b.id)[0];
  state.matchWinner = winner.id;
  state.phase = PHASES.MATCH_OVER;
  state.events.push({ type: "matchEnd", seat: winner.id });
  return state;
}
