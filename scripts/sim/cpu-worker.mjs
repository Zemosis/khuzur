// One worker of scripts/sim/cpu.mjs: plays whole CPU matches of one game and
// reports who won, checking the game's invariants after every move.
//
// Duplicate format: each deal (a seed) is played once per seat rotation, so
// every seat of the table gets each level on the same cards and the luck of
// the deal cancels out between the levels being compared.

import { parentPort } from "node:worker_threads";
import { initializeGame, compareCards } from "../../src/utils/deckUtils.js";
import { createGameState, playCards, passAction, startNextRound } from "../../src/utils/gameLogic.js";
import { makeAIDecision } from "../../src/utils/aiPlayer.js";
import { GAME_STATES } from "../../src/utils/constants.js";
import { matchWinners } from "../../src/utils/stakes.js";
import * as muushig from "../../src/utils/muushig/engine.js";
import { aiAction as muushigAction, applyAction as muushigApply } from "../../src/utils/muushig/ai.js";
import * as poker from "../../src/utils/poker/engine.js";
import { chooseAction } from "../../src/utils/poker/ai.js";
import * as khuzur from "../../src/utils/khuzur/engine.js";
import { createDeck as khuzurDeck } from "../../src/utils/khuzur/cards.js";
import { aiAction as khuzurAction, applyAction as khuzurApply } from "../../src/utils/khuzur/ai.js";

/** mulberry32: a small seeded generator, so every run of the benchmark is the same. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Broken extends Error {}
const check = (ok, what) => {
  if (!ok) throw new Broken(what);
};

// ---- Thirteen: 4 seats, a match runs until one player is left under 30 points.

function thirteen(levels, seed) {
  const rng = seeded(seed);
  const deal = () => initializeGame(rng).hands.slice(0, levels.length);
  const lead = (hands) =>
    hands
      .flatMap((hand, seat) => hand.map((card) => ({ seat, card })))
      .reduce((low, next) => (compareCards(next.card, low.card) < 0 ? next : low)).seat;
  const hands = deal();
  let s = createGameState(hands, lead(hands), "MEDIUM");
  s.players = s.players.map((p, i) => ({ ...p, type: "AI", level: levels[i] }));
  let moves = 0;
  while (s.gameState !== GAME_STATES.GAME_OVER) {
    check(++moves < 20000, "a Thirteen match never ended");
    if (s.gameState === GAME_STATES.ROUND_END) {
      s = startNextRound(s, deal());
      continue;
    }
    const held = s.players.reduce((n, p) => n + p.hand.length, 0);
    const me = s.players[s.currentPlayerIndex];
    const d = makeAIDecision(me, s.currentPlay, s, rng);
    let next = null;
    if (d.action === "play") {
      const r = playCards(s, d.cards);
      check(r.success, "a CPU made an illegal Thirteen play");
      next = r.newState;
      check(next.players.reduce((n, p) => n + p.hand.length, 0) === held - d.cards.length || next.gameState !== GAME_STATES.PLAYING, "cards appeared or vanished");
    } else {
      check(!!s.currentPlay, "a Thirteen CPU passed on its own lead");
      next = passAction(s);
    }
    s = next;
  }
  return { winners: matchWinners("thirteen", s), moves };
}

// ---- Muushig: 5 seats, a match runs until someone reaches 0.

function muushigMatch(levels, seed) {
  const rng = seeded(seed);
  const players = levels.map((level, i) => ({ name: `CPU${i}`, type: "AI", level }));
  let s = muushig.createMatch({ players, rng });
  let moves = 0;
  while (s.phase !== muushig.PHASES.MATCH_OVER) {
    check(++moves < 50000, "a Muushig match never ended");
    if (s.phase === muushig.PHASES.TRICK_END) s = muushig.collectTrick(s);
    else if (s.phase === muushig.PHASES.ROUND_END) s = muushig.startNextRound(s, rng);
    else s = muushigApply(s, muushigAction(s, rng), rng);
  }
  return { winners: matchWinners("muushig", s), moves };
}

// ---- Khuzur: any table; a match is one round.

function khuzurMatch(levels, seed, table) {
  const rng = seeded(seed);
  const players = levels.map((level, i) => ({ name: `CPU${i}`, type: "AI", level }));
  let s = khuzur.createMatch({ players, table, rng });
  const deckSize = khuzurDeck(table.handSize).length;
  let moves = 0;
  while (s.phase !== khuzur.PHASES.MATCH_OVER) {
    check(++moves < 5000, "a Khuzur match never ended");
    s = khuzurApply(s, khuzurAction(s, rng), rng);
    if (s.phase === khuzur.PHASES.PLAY) {
      const all = [...s.players.flatMap((p) => p.hand), ...s.drawPile, ...s.deadPile, ...(s.stack ? s.stack.layers.flat() : []), ...(s.trumpCard ? [s.trumpCard] : [])];
      check(all.length === deckSize && new Set(all.map((c) => c.id)).size === deckSize, "a Khuzur card appeared or vanished");
    }
  }
  return { winners: matchWinners("khuzur", s), moves };
}

// ---- Poker: a session of hands; the result is each seat's chips won or lost.

function pokerSession(levels, seed, hands) {
  const rng = seeded(seed);
  let s = poker.createTable();
  levels.forEach((level, i) => (s = poker.sit(s, i, { name: `CPU${i}`, type: "AI", level, stack: poker.BUY_IN })));
  const bought = levels.map(() => poker.BUY_IN);
  const chips = (p) => (p ? p.stack + (p.pending || 0) : 0);
  for (let h = 0; h < hands; h++) {
    // Anyone under half a buy-in tops back up to a full one, and it counts against them.
    s.seats.forEach((p, i) => {
      if (!p) return;
      const short = poker.BUY_IN - chips(p);
      if (short > poker.BUY_IN / 2) {
        bought[i] += short;
        s = poker.addChips(s, i, short);
      }
    });
    const total = s.seats.reduce((n, p) => n + chips(p), 0);
    s = poker.startHand(s, rng);
    for (let step = 0; s.phase !== poker.PHASES.HAND_OVER; step++) {
      check(step < 400, "a poker hand never ended");
      if (s.phase === poker.PHASES.RUNOUT) s = poker.advance(s);
      else s = poker.act(s, s.turn, chooseAction(poker.viewFor(s, s.turn), s.turn, s.seats[s.turn].level, rng));
    }
    check(s.seats.reduce((n, p) => n + chips(p), 0) === total, "chips were made or lost");
  }
  return { net: levels.map((_, i) => chips(s.seats[i]) - bought[i]), hands };
}

parentPort.on("message", ({ game, levels, seed, table, hands }) => {
  try {
    let r;
    if (game === "thirteen") r = thirteen(levels, seed);
    else if (game === "muushig") r = muushigMatch(levels, seed);
    else if (game === "khuzur") r = khuzurMatch(levels, seed, table);
    else r = pokerSession(levels, seed, hands);
    parentPort.postMessage({ ok: true, ...r });
  } catch (err) {
    parentPort.postMessage({ ok: false, broken: err instanceof Broken, error: String(err.message) });
  }
});
