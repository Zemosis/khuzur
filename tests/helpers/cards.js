// Shared test helpers: readable card builders, exact game states, a seeded RNG,
// and both copies of the rules (client src/utils and server/game) so every
// logic suite runs against each and the two can't drift apart unnoticed.

import * as clientConstants from "../../src/utils/constants.js";
import * as clientDeck from "../../src/utils/deckUtils.js";
import * as clientEval from "../../src/utils/handEvaluator.js";
import * as clientLogic from "../../src/utils/gameLogic.js";
import * as clientAI from "../../src/utils/aiPlayer.js";
import * as clientCombos from "../../src/utils/aiCombos.js";
import * as clientSearch from "../../src/utils/aiSearch.js";
import * as serverConstants from "../../server/game/constants.js";
import * as serverDeck from "../../server/game/deckUtils.js";
import * as serverEval from "../../server/game/handEvaluator.js";
import * as serverLogic from "../../server/game/gameLogic.js";
import * as serverAI from "../../server/game/aiPlayer.js";
import * as serverCombos from "../../server/game/aiCombos.js";
import * as serverSearch from "../../server/game/aiSearch.js";

export const COPIES = [
  ["client", { constants: clientConstants, deck: clientDeck, evaluator: clientEval, logic: clientLogic, ai: clientAI, combos: clientCombos, search: clientSearch }],
  ["server", { constants: serverConstants, deck: serverDeck, evaluator: serverEval, logic: serverLogic, ai: serverAI, combos: serverCombos, search: serverSearch }],
];

const DECK = new Map(clientDeck.createDeck().map((c) => [c.id, c]));

/** card("7♠") -> the real card object. Throws on a typo so tests fail loudly. */
export const card = (id) => {
  const c = DECK.get(id);
  if (!c) throw new Error(`No such card: ${id}`);
  return { ...c };
};

/** cards("3♦ 3♣ 3♥") -> array of card objects. Empty string -> []. */
export const cards = (ids) => ids.trim() ? ids.trim().split(/\s+/).map(card) : [];

export const ids = (list) => list.map((c) => c.id);

/**
 * An exact game state built on createGameState. hands is 4 space-separated
 * strings; the rest override fields. Scores/eliminated are per-seat arrays.
 */
export const stateWith = (logic, {
  hands = ["", "", "", ""],
  current = 0,
  currentPlay = null,
  lastPlayedBy = null,
  scores = [0, 0, 0, 0],
  eliminated = [false, false, false, false],
  passed = [false, false, false, false],
  types,
  ...rest
} = {}) => {
  const s = logic.createGameState(hands.map(cards), current);
  s.players = s.players.map((p, i) => ({
    ...p,
    score: scores[i],
    isEliminated: eliminated[i],
    hasPassed: passed[i],
    ...(types ? { type: types[i] } : {}),
  }));
  s.currentPlay = currentPlay;
  s.lastPlayedBy = lastPlayedBy;
  return { ...s, ...rest };
};

/** mulberry32: small, fast, good enough for reproducible deals. */
export const seededRandom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
