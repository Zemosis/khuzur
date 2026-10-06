// MUUSHIG GAME — the server-authoritative wrapper around the Muushig rules.
// One instance per online table. Owns the full (secret) state, checks every
// human move, plays the CPU seats and the automatic steps (collecting a trick,
// dealing the next round) on timers, and reports each change through onState.
//
// The rules are server/game/muushig/, byte-identical copies of the browser's
// src/utils/muushig/ (tests/unit/muushig-copies.test.js keeps them so).

import {
  PHASES,
  collectTrick,
  createMatch,
  decide,
  drawForDeal,
  playCard,
  rematch,
  startNextRound,
  swap,
  takeTrump,
  allowedPlays,
} from "./muushig/engine.js";
import { aiAction, applyAction } from "./muushig/ai.js";

// Milliseconds. Each follows what the browser shows at that moment, so a CPU
// never moves while the table is still animating (see GameMuushig).
export const DEFAULT_MUUSHIG_DELAYS = {
  draw: 1300, // a CPU drawing for the deal
  tie: 2000, // a tie in the draw, before the redraw
  decide: 1100, // a CPU going in or folding
  swap: 600, // a CPU swapping
  trump: 900, // a CPU dealer taking (or leaving) the trump
  play: 950, // a CPU throwing a card
  flight: 1200, // cards flying after a swap, fold or trump take
  collect: 1500, // a full trick stays on the table before it's eaten
  eat: 800, // the eaten pile flying to its eater
  roundStart: 7500, // the dealer banner and the deal
  drawReveal: 2000, // first round only: the winning draw card shows first
  roundEnd: 9000, // the round results, before the next deal
};

const THINK = {
  [PHASES.DRAW]: "draw",
  [PHASES.DECIDE]: "decide",
  [PHASES.SWAP]: "swap",
  [PHASES.TRUMP]: "trump",
  [PHASES.PLAY]: "play",
};

const isCardId = (v) => typeof v === "string" && v.length > 0 && v.length <= 4;

// Each move's payload check (null = fine), then the rules.
const MOVES = {
  drawForDeal: {
    check: (m) => (Number.isInteger(m.depth) ? null : "Pick how deep to draw"),
    run: (s, seat, m, rng) => drawForDeal(s, seat, m.depth, rng),
  },
  decide: {
    check: (m) => (typeof m.play === "boolean" ? null : "Go in or fold"),
    run: (s, seat, m) => decide(s, seat, m.play),
  },
  swap: {
    check: (m) => (Array.isArray(m.cardIds) && m.cardIds.length <= 5 && m.cardIds.every(isCardId) ? null : "Pick up to 5 cards to swap"),
    run: (s, seat, m) => swap(s, seat, m.cardIds),
  },
  takeTrump: {
    check: (m) => (m.cardId === null || isCardId(m.cardId) ? null : "Pick a card to give up, or keep your hand"),
    run: (s, seat, m) => takeTrump(s, seat, m.cardId),
  },
  play: {
    check: (m) => (isCardId(m.cardId) ? null : "Pick a card to throw"),
    run: (s, seat, m) => playCard(s, seat, m.cardId),
  },
};

export class MuushigGame {
  /**
   * @param {Object} opts
   * @param {Array} opts.seats - 5 entries of { type: "HUMAN"|"AI", name, avatar?, level? }
   * @param {String} opts.level - CPU level for seats that don't name one
   * @param {Function} opts.onState - after every state change, with this game
   * @param {Function} opts.onRoundEnd - once per scored round, with its summary
   * @param {Function} opts.onGameOver - once per finished match
   * @param {Object} opts.delays - overrides for DEFAULT_MUUSHIG_DELAYS (tests)
   * @param {Function} opts.rng - every shuffle and CPU whim; secure by default
   */
  constructor({ seats, level = "MEDIUM", onState, onRoundEnd, onGameOver, delays, rng }) {
    this.delays = { ...DEFAULT_MUUSHIG_DELAYS, ...delays };
    this.level = level;
    this.rng = rng;
    this.onState = onState;
    this.onRoundEnd = onRoundEnd;
    this.onGameOver = onGameOver;
    this.aiTimer = null;
    this.stepTimer = null;
    this.dealEndsAt = 0;
    this.destroyed = false;
    this.startedAt = new Date();
    this.finishedAt = null;
    this.state = createMatch({
      players: seats.map((s) => ({
        name: s.name,
        type: s.type,
        level: s.type === "AI" ? s.level || level : null,
        avatar: s.avatar ?? null,
      })),
      rng: this.rng,
    });
    this.broadcast();
    this.schedule(0);
  }

  /** A human's move from `seat`: { type, ...payload }. */
  move(seat, move) {
    const spec = move && typeof move === "object" ? MOVES[move.type] : null;
    if (!spec) return { ok: false, error: "Unknown move" };
    const player = this.state.players[seat];
    if (!player) return { ok: false, error: "Not your turn" };
    if (player.type !== "HUMAN") return { ok: false, error: "That seat is played by a CPU" };
    if (this.dealMsLeft() > 0) return { ok: false, error: "Still dealing" };
    const bad = spec.check(move);
    if (bad) return { ok: false, error: bad };
    let next;
    try {
      next = spec.run(this.state, seat, move, this.rng);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    this.applyState(next);
    return { ok: true };
  }

  /** Swap a seat's occupant: a CPU taking over, or a human (back) in their place. */
  replaceSeat(seat, { type, name, avatar = null, level }) {
    const s = this.state;
    if (!s.players[seat]) return;
    this.state = {
      ...s,
      players: s.players.map((p, i) =>
        i === seat ? { ...p, type, name, avatar, level: type === "AI" ? level || this.level : null } : p,
      ),
    };
    this.broadcast();
    // Only the seat on turn matters; another CPU's pending move keeps its timing.
    if (seat === this.state.turn) this.scheduleCpu(this.delays[THINK[this.state.phase]] ?? 0);
  }

  rematch() {
    if (this.state.phase !== PHASES.MATCH_OVER) return { ok: false, error: "Match is still in progress" };
    this.clearTimers();
    this.startedAt = new Date();
    this.finishedAt = null;
    this.state = rematch(this.state, this.rng);
    this.broadcast();
    this.schedule(0);
    return { ok: true };
  }

  applyState(next) {
    const prev = this.state;
    this.state = next;
    const opening = this.opening(next.events.slice(prev.events.length));
    if (opening) this.dealEndsAt = Date.now() + opening;
    this.broadcast();

    const scored = (s) => s.phase === PHASES.ROUND_END || s.phase === PHASES.MATCH_OVER;
    if (scored(next) && !scored(prev)) this.onRoundEnd?.(summariseRound(next));
    if (next.phase === PHASES.MATCH_OVER) {
      this.finishedAt = new Date();
      this.clearTimers();
      this.onGameOver?.(this);
      return;
    }
    this.schedule(prev.events.length);
  }

  /** Arms the next automatic step. `seen`: events already shown before this state. */
  schedule(seen) {
    const s = this.state;
    if (s.phase === PHASES.TRICK_END) return this.scheduleStep(this.delays.collect, collectTrick);
    if (s.phase === PHASES.ROUND_END) return this.scheduleStep(this.delays.roundEnd, (st) => startNextRound(st, this.rng));
    this.scheduleCpu(this.pause(s.events.slice(seen)));
  }

  /**
   * How long a round's opening (the winning draw, the dealer banner and the
   * deal) shows, if `fresh` events start one; else 0. Every player's table
   * shows it in this time, and nobody moves before it's over.
   */
  opening(fresh) {
    const has = (type) => fresh.some((e) => e.type === type);
    if (!has("round")) return 0;
    return this.delays.roundStart + (has("firstDealer") ? this.delays.drawReveal : 0);
  }

  /** Milliseconds until the round's opening ends on everyone's screen (0 once it has). */
  dealMsLeft() {
    return Math.max(0, this.dealEndsAt - Date.now());
  }

  /** How long a CPU waits before its move: thinking, plus whatever the table is still showing. */
  pause(fresh) {
    const d = this.delays;
    const has = (type) => fresh.some((e) => e.type === type);
    let wait = has("drawTie") ? d.tie : d[THINK[this.state.phase]] ?? 0;
    wait += this.opening(fresh);
    if (has("eat")) wait += d.eat;
    if (fresh.some((e) => (e.type === "swap" && e.count > 0) || e.type === "fold" || e.type === "takeTrump")) wait += d.flight;
    return wait;
  }

  scheduleCpu(delay) {
    this.clearCpuTimer();
    const s = this.state;
    if (!THINK[s.phase] || s.players[s.turn]?.type !== "AI") return;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (!this.destroyed) this.playCpuTurn();
    }, delay);
  }

  scheduleStep(delay, step) {
    if (this.stepTimer) clearTimeout(this.stepTimer);
    this.stepTimer = setTimeout(() => {
      this.stepTimer = null;
      if (!this.destroyed) this.applyState(step(this.state));
    }, delay);
  }

  playCpuTurn() {
    const s = this.state;
    if (s.players[s.turn]?.type !== "AI") return;
    let next;
    try {
      next = applyAction(s, aiAction(s, this.rng), this.rng);
    } catch (err) {
      // The CPU must never stall a table: fall back to the plainest legal move.
      console.error("[muushig] CPU move failed:", err);
      next = fallbackMove(s, this.rng);
    }
    this.applyState(next);
  }

  broadcast() {
    this.onState?.(this);
  }

  clearCpuTimer() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.aiTimer = null;
  }

  clearTimers() {
    this.clearCpuTimer();
    if (this.stepTimer) clearTimeout(this.stepTimer);
    this.stepTimer = null;
  }

  destroy() {
    this.destroyed = true;
    this.clearTimers();
  }
}

function fallbackMove(s, rng) {
  const seat = s.turn;
  switch (s.phase) {
    case PHASES.DRAW:
      return drawForDeal(s, seat, 1, rng);
    case PHASES.DECIDE:
      return decide(s, seat, true);
    case PHASES.SWAP:
      return swap(s, seat, []);
    case PHASES.TRUMP:
      return takeTrump(s, seat, null);
    default:
      return playCard(s, seat, allowedPlays(s, seat)[0].id);
  }
}

/** One scored round per seat, for game_rounds and the match's stats. */
function summariseRound(s) {
  const { results, roundWinner } = s.roundResults;
  return {
    roundNumber: s.roundNumber,
    winnerSeat: roundWinner,
    seatResults: results.map((r) => ({
      seat_index: r.seat,
      eaten: r.eaten,
      folded: r.folded,
      points_gained: r.delta,
      score_after: r.score,
      eliminated: false,
    })),
  };
}

const hide = (cards) => cards.map(() => ({ hidden: true }));

/**
 * The state as one seat may see it (-1 = a spectator). It keeps its shape, so
 * the browser's rule helpers work on it, but every card that seat can't see is
 * a { hidden: true } placeholder: other players' hands and discards, the deal
 * pile, the draw pile and the dead pile. Played cards, the trump card, the
 * cards drawn for the deal and the event log are public at the table.
 */
export function muushigView(state, seat) {
  return {
    ...state,
    players: state.players.map((p, i) => (i === seat ? p : { ...p, hand: hide(p.hand), discarded: hide(p.discarded) })),
    dealDeck: hide(state.dealDeck),
    drawPile: hide(state.drawPile),
    deadPile: hide(state.deadPile),
    mySeat: seat,
  };
}
