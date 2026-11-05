// KHUZUR GAME — the server-authoritative wrapper around the Khuzur rules.
// One instance per online table. Owns the full (secret) state, checks every
// human move, plays the CPU seats on timers, runs each person's turn clock,
// counts surrender votes, and reports each change through onState.
//
// The rules are server/game/khuzur/, byte-identical copies of the browser's
// src/utils/khuzur/ (tests/unit/rules-copies.test.js keeps them so).

import {
  PHASES,
  beat,
  concede,
  createMatch,
  drawForDeal,
  lead,
  pickUp,
  skipLead,
  startNextMatch,
  swapTrumpSeven,
} from "./khuzur/engine.js";
import { aiAction, applyAction, cheapestLead } from "./khuzur/ai.js";
import { khuzurSummary } from "./khuzurStats.js";

// Milliseconds. CPU pauses follow what the browser shows; `turn` is a
// person's turn clock (rulebook §10).
export const DEFAULT_KHUZUR_DELAYS = {
  draw: 1300, // a CPU drawing for the deal
  lead: 1000, // a CPU leading
  beat: 900, // a CPU beating or picking up
  drawReveal: 1500, // the winning draw card shows before the first lead (the browser shows it at least 1.6 s)
  turn: 45000, // a person's turn
};

const isCardId = (v) => typeof v === "string" && v.length > 0 && v.length <= 6;
const cardList = (m) => Array.isArray(m.cardIds) && m.cardIds.length >= 1 && m.cardIds.length <= 7 && m.cardIds.every(isCardId);

// Each move's payload check (null = fine), then the rules.
const MOVES = {
  drawForDeal: {
    check: (m) => (Number.isInteger(m.depth) ? null : "Pick how deep to draw"),
    run: (s, seat, m, rng) => drawForDeal(s, seat, m.depth, rng),
  },
  lead: {
    check: (m) => (cardList(m) ? null : "Pick the cards to lead"),
    run: (s, seat, m) => lead(s, seat, m.cardIds),
  },
  beat: {
    check: (m) => (cardList(m) ? null : "Pick the cards to beat with"),
    run: (s, seat, m) => beat(s, seat, m.cardIds),
  },
  pickUp: { check: () => null, run: (s, seat) => pickUp(s, seat) },
  swapSeven: { check: () => null, run: (s, seat) => swapTrumpSeven(s, seat) },
};

export class KhuzurGame {
  /**
   * @param {Object} opts
   * @param {Array} opts.seats - one per seat: { type: "HUMAN"|"AI", name, avatar?, level? }
   * @param {Object} opts.table - { perTeam, teams, handSize }
   * @param {String} opts.level - CPU level for seats that don't name one
   * @param {Function} opts.onState - after every state change, with this game
   * @param {Function} opts.onRoundEnd - once per finished match, with it as one round summary
   * @param {Function} opts.onGameOver - once per finished match, after onRoundEnd
   * @param {Object} opts.delays - overrides for DEFAULT_KHUZUR_DELAYS (tests)
   * @param {Function} opts.rng - every shuffle and CPU whim; secure by default
   */
  constructor({ seats, table, level = "MEDIUM", onState, onRoundEnd, onGameOver, delays, rng }) {
    this.delays = { ...DEFAULT_KHUZUR_DELAYS, ...delays };
    this.level = level;
    this.rng = rng;
    this.onState = onState;
    this.onRoundEnd = onRoundEnd;
    this.onGameOver = onGameOver;
    this.aiTimer = null;
    this.turnTimer = null;
    this.turnEndsAt = 0;
    this.dealEndsAt = 0;
    this.votes = {}; // team -> Set of seats that pressed SURRENDER
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
      table,
      rng: this.rng,
    });
    // Timers first, so each state goes out with its turn clock running.
    this.schedule();
    this.broadcast();
  }

  /** Puts the table in `state` (a restored or prepared match) and plays on from there. */
  load(state) {
    this.clearTimers();
    this.votes = {};
    this.state = state;
    this.schedule();
    this.broadcast();
  }

  /** A person's move from `seat`: { type, ...payload }. */
  move(seat, move) {
    const type = move && typeof move === "object" ? move.type : null;
    const player = this.state.players[seat];
    if (!player) return { ok: false, error: "Not your turn" };
    if (type === "surrender") return this.vote(seat);
    if (type === "keepPlaying") return this.keepPlaying(seat);
    const spec = MOVES[type];
    if (!spec) return { ok: false, error: "Unknown move" };
    if (player.type !== "HUMAN") return { ok: false, error: "That seat is played by a CPU" };
    const bad = spec.check(move);
    if (bad) return { ok: false, error: bad };
    if (this.dealMsLeft() > 0) return { ok: false, error: "Still dealing" };
    let next;
    try {
      next = spec.run(this.state, seat, move, this.rng);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    this.applyState(next);
    return { ok: true };
  }

  /** SURRENDER: one vote for the seat's team; once every person on it has voted, the team concedes. */
  vote(seat) {
    const s = this.state;
    const player = s.players[seat];
    if (player.type !== "HUMAN") return { ok: false, error: "That seat is played by a CPU" };
    if (s.phase !== PHASES.PLAY) return { ok: false, error: "You can only surrender during play" };
    if (player.out) return { ok: false, error: "You're already out" };
    (this.votes[player.team] ??= new Set()).add(seat);
    if (!this.settleVote(player.team)) this.broadcast();
    return { ok: true };
  }

  keepPlaying(seat) {
    const team = this.state.players[seat]?.team;
    if (this.votes[team]) {
      delete this.votes[team];
      this.broadcast();
    }
    return { ok: true };
  }

  /** The team concedes if every person on it has voted. → whether it did. */
  settleVote(team) {
    const votes = this.votes[team];
    if (!votes?.size || this.state.phase !== PHASES.PLAY) return false;
    const people = this.state.players.filter((p) => p.team === team && p.type === "HUMAN" && !p.out).map((p) => p.id);
    for (const seat of [...votes]) if (!people.includes(seat)) votes.delete(seat);
    if (!people.length || !people.every((seat) => votes.has(seat))) {
      if (!votes.size) delete this.votes[team];
      return false;
    }
    delete this.votes[team];
    this.applyState(concede(this.state, people[0]));
    return true;
  }

  /** Each team's open vote: { team: [seats] }. */
  voteView() {
    return Object.fromEntries(Object.entries(this.votes).map(([team, seats]) => [team, [...seats].sort((a, b) => a - b)]));
  }

  /** Swap a seat's occupant: a CPU taking over, or a person (back) in their place. */
  replaceSeat(seat, { type, name, avatar = null, level }) {
    const s = this.state;
    if (!s.players[seat]) return;
    this.state = {
      ...s,
      players: s.players.map((p, i) => (i === seat ? { ...p, type, name, avatar, level: type === "AI" ? level || this.level : null } : p)),
    };
    const team = this.state.players[seat].team;
    if (this.settleVote(team)) return;
    if (seat === this.state.turn) this.schedule();
    this.broadcast();
  }

  rematch() {
    if (this.state.phase !== PHASES.MATCH_OVER) return { ok: false, error: "Match is still in progress" };
    this.clearTimers();
    this.votes = {};
    this.startedAt = new Date();
    this.finishedAt = null;
    this.state = startNextMatch(this.state, this.rng);
    this.schedule();
    this.broadcast();
    return { ok: true };
  }

  applyState(next) {
    const prev = this.state;
    this.state = next;
    const fresh = next.events.slice(next.events.length >= prev.events.length ? prev.events.length : 0);
    if (fresh.some((e) => e.type === "firstDealer")) this.dealEndsAt = Date.now() + this.delays.drawReveal;
    this.clearTimers();
    if (next.phase !== PHASES.MATCH_OVER) this.schedule();
    this.broadcast();
    if (next.phase === PHASES.MATCH_OVER) {
      this.finishedAt = new Date();
      this.onRoundEnd?.(khuzurSummary(next));
      this.onGameOver?.(this);
    }
  }

  /** Arms the next CPU move, or the person on turn's clock. */
  schedule() {
    this.clearTimers();
    const s = this.state;
    if (s.phase !== PHASES.DRAW && s.phase !== PHASES.PLAY) return;
    const player = s.players[s.turn];
    if (!player) return;
    const wait = this.dealMsLeft();
    if (player.type === "AI") {
      const think = s.phase === PHASES.DRAW ? this.delays.draw : s.stack ? this.delays.beat : this.delays.lead;
      this.aiTimer = setTimeout(() => {
        this.aiTimer = null;
        if (!this.destroyed) this.playCpuTurn();
      }, wait + think);
      return;
    }
    const armed = s;
    this.turnEndsAt = Date.now() + wait + this.delays.turn;
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      if (!this.destroyed && this.state === armed) this.timeOut();
    }, wait + this.delays.turn);
  }

  /** The person on turn ran out of time: skipped when leading, picks up when beating. */
  timeOut() {
    const s = this.state;
    const seat = s.turn;
    let next;
    if (s.phase === PHASES.DRAW) next = drawForDeal(s, seat, 1, this.rng);
    else next = s.stack ? pickUp(s, seat) : skipLead(s, seat);
    this.applyState(next);
  }

  /** Milliseconds left on the person on turn's clock, or null on a CPU's turn. */
  turnMsLeft() {
    return this.turnTimer ? Math.max(0, this.turnEndsAt - Date.now()) : null;
  }

  /** Milliseconds until the winning draw card has shown on every screen (0 once it has). */
  dealMsLeft() {
    return Math.max(0, this.dealEndsAt - Date.now());
  }

  playCpuTurn() {
    const s = this.state;
    if (s.players[s.turn]?.type !== "AI") return;
    let next;
    try {
      next = applyAction(s, aiAction(s, this.rng), this.rng);
    } catch (err) {
      // A CPU must never stall a table: fall back to the plainest legal move.
      console.error("[khuzur] CPU move failed:", err);
      next = fallbackMove(s, this.rng);
    }
    this.applyState(next);
  }

  broadcast() {
    this.onState?.(this);
  }

  clearTimers() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.aiTimer = null;
    this.turnTimer = null;
  }

  destroy() {
    this.destroyed = true;
    this.clearTimers();
  }
}

function fallbackMove(s, rng) {
  const seat = s.turn;
  if (s.phase === PHASES.DRAW) return drawForDeal(s, seat, 1, rng);
  if (s.stack) return pickUp(s, seat);
  return lead(s, seat, cheapestLead(s.players[seat].hand, 1, s.trumpSuit).map((c) => c.id));
}

const hide = (cards) => cards.map(() => ({ hidden: true }));

/**
 * The state as one seat may see it (-1 = a spectator). It keeps its shape, so
 * the browser's rule helpers work on it, but every card that seat can't see is
 * a { hidden: true } placeholder: other players' hands, the draw pile, the dead
 * pile and the deal pile. The stack, the trump card, the cards drawn for the
 * deal and the event log are public at the table.
 */
export function khuzurView(state, seat, game) {
  return {
    ...state,
    players: state.players.map((p, i) => (i === seat ? p : { ...p, hand: hide(p.hand) })),
    dealDeck: hide(state.dealDeck),
    drawPile: hide(state.drawPile),
    deadPile: hide(state.deadPile),
    mySeat: seat,
    turnMsLeft: game?.turnMsLeft() ?? null,
    votes: game?.voteView() ?? {},
  };
}
