// THIRTEEN GAME ENGINE — server-authoritative wrapper around the pure game logic.
// One instance per lobby. Owns the full (secret) game state, schedules CPU turns
// and round transitions, and reports every state change through onState.

import { initializeGame, findPlayerWithCard, secureRandom } from "./deckUtils.js";
import {
  createGameState,
  playCards,
  passAction,
  startNextRound,
} from "./gameLogic.js";
import { makeAIDecision } from "./aiPlayer.js";
import { GAME_STATES } from "./constants.js";

const AI_TURN_DELAY = 1500;
// Client round-end overlay shows for ~4s before expecting the next round.
const ROUND_END_DELAY = 4500;
// The deal (shuffle + 52 cards) takes this long on every player's screen: the
// browsers fit their animation to it, CPUs wait it out and humans can't move
// before it ends, so nobody starts the round ahead of the others.
const DEAL_ANIMATION_DELAY = 7500;

export const DEFAULT_DELAYS = {
  aiTurn: AI_TURN_DELAY,
  roundEnd: ROUND_END_DELAY,
  deal: DEAL_ANIMATION_DELAY,
};

const cardValue = (card) => card.rankValue * 4 + card.suitValue;

export class ThirteenGame {
  /**
   * @param {Object} opts
   * @param {Array} opts.seats - 4 entries of { type: "HUMAN"|"AI", name, socketId, avatar? }
   * @param {String} opts.aiDifficulty
   * @param {Function} opts.onState - called after every state change
   * @param {Function} opts.onRoundEnd - called once per completed round
   * @param {Function} opts.onGameOver - called once per finished match
   * @param {Object} opts.delays - override { aiTurn, roundEnd, deal } in ms (tests)
   * @param {Function} opts.rng - shuffles every deal; secure by default, seeded in tests
   */
  constructor({ seats, aiDifficulty = "MEDIUM", onState, onRoundEnd, onGameOver, delays, rng = secureRandom }) {
    this.delays = { ...DEFAULT_DELAYS, ...delays };
    this.rng = rng;
    this.onState = onState;
    this.onRoundEnd = onRoundEnd;
    this.onGameOver = onGameOver;
    this.aiTimer = null;
    this.roundTimer = null;
    this.dealEndsAt = 0;
    this.destroyed = false;
    this.state = null;
    this.startMatch(seats, { matchNumber: 1, matchWins: [0, 0, 0, 0] }, aiDifficulty);
  }

  startMatch(seats, matchMeta, aiDifficulty) {
    const { hands } = initializeGame(this.rng);
    const starting = findPlayerWithCard(hands, "3", "♦");
    const state = createGameState(
      hands,
      starting >= 0 ? starting : 0,
      aiDifficulty || this.state?.aiDifficulty,
      matchMeta,
    );
    state.players = state.players.map((p, i) => ({
      ...p,
      name: seats[i].name,
      type: seats[i].type,
      socketId: seats[i].socketId || null,
      avatar: seats[i].avatar || null,
    }));
    this.startedAt = new Date();
    this.finishedAt = null;
    this.state = state;
    this.dealEndsAt = Date.now() + this.delays.deal;
    this.broadcast();
    this.scheduleAI(this.delays.deal);
  }

  /** Milliseconds until the current deal ends on everyone's screen (0 once it has). */
  dealMsLeft() {
    return Math.max(0, this.dealEndsAt - Date.now());
  }

  rematch() {
    if (!this.state || this.state.gameState !== GAME_STATES.GAME_OVER) {
      return { ok: false, error: "Match is still in progress" };
    }
    const seats = this.state.players.map((p) => ({
      type: p.type,
      name: p.name,
      socketId: p.socketId,
      avatar: p.avatar,
    }));
    const matchMeta = {
      matchNumber: (this.state.matchNumber || 1) + 1,
      matchWins: this.state.matchWins || [0, 0, 0, 0],
    };
    this.clearTimers();
    this.startMatch(seats, matchMeta);
    return { ok: true };
  }

  /** A verified player move. cards may be card objects or card id strings. */
  handleMove(seatIndex, action, cards) {
    const s = this.state;
    if (!s || s.gameState !== GAME_STATES.PLAYING) {
      return { ok: false, error: "Game is not active" };
    }
    if (this.dealMsLeft() > 0) {
      return { ok: false, error: "Still dealing" };
    }
    if (s.currentPlayerIndex !== seatIndex) {
      return { ok: false, error: "Not your turn" };
    }
    const player = s.players[seatIndex];
    if (player.isEliminated) {
      return { ok: false, error: "You are eliminated" };
    }

    if (action === "pass") {
      if (!s.currentPlay) {
        return { ok: false, error: "You lead the trick — you must play" };
      }
      this.applyState(passAction(s));
      return { ok: true };
    }

    if (action === "play") {
      const ids = (cards || []).map((c) => (typeof c === "string" ? c : c?.id));
      if (!ids.length || ids.some((id) => !id)) {
        return { ok: false, error: "No cards selected" };
      }
      if (new Set(ids).size !== ids.length) {
        return { ok: false, error: "Duplicate cards in selection" };
      }
      // Anti-cheat: resolve ids against the server-side hand, never trust
      // card objects sent by the client.
      const selected = ids.map((id) => player.hand.find((c) => c.id === id));
      if (selected.some((c) => !c)) {
        return { ok: false, error: "Those cards are not in your hand" };
      }
      const result = playCards(s, selected);
      if (!result.success) {
        return { ok: false, error: result.error };
      }
      this.applyState(result.newState);
      return { ok: true };
    }

    return { ok: false, error: "Unknown action" };
  }

  /** Swap a seat's occupant (player join/rejoin or CPU takeover on disconnect). */
  replaceSeat(seatIndex, { type, name, socketId, avatar }) {
    const s = this.state;
    if (!s || !s.players[seatIndex]) return;
    // A CPU taking over gets a stock face (avatar null).
    s.players = s.players.map((p, i) =>
      i === seatIndex ? { ...p, type, name, socketId: socketId || null, avatar: avatar || null } : p,
    );
    this.broadcast();
    this.scheduleAI();
  }

  applyState(next) {
    const prev = this.state;
    this.state = next;
    this.broadcast();

    // A round ends into ROUND_END, or into GAME_OVER if it was the last one --
    // watching only for ROUND_END would silently drop every final round.
    const roundJustEnded =
      prev?.gameState === GAME_STATES.PLAYING &&
      (next.gameState === GAME_STATES.ROUND_END ||
        next.gameState === GAME_STATES.GAME_OVER);
    if (roundJustEnded && this.onRoundEnd) {
      this.onRoundEnd(this.summariseRound(prev, next));
    }

    if (next.gameState === GAME_STATES.ROUND_END) {
      this.roundTimer = setTimeout(() => {
        this.roundTimer = null;
        if (!this.destroyed) this.beginNextRound();
      }, this.delays.roundEnd);
    } else if (next.gameState === GAME_STATES.GAME_OVER) {
      this.finishedAt = new Date();
      this.clearAITimer();
      if (this.onGameOver) this.onGameOver(this);
    } else {
      this.scheduleAI();
    }
  }

  /**
   * Per-seat detail for the round that just finished. Card counts come from the
   * PREVIOUS state: scoring empties every hand, so by `next` they are all zero.
   */
  summariseRound(prev, next) {
    const winner = next.winnerIndex ?? null;
    return {
      roundNumber: next.roundNumber,
      winnerSeat: winner,
      seatResults: next.players.map((p, i) => ({
        seat_index: i,
        // The winner emptied their hand on the play that ended the round, and
        // that play lands between prev and next -- so prev still shows the
        // cards they just put down. Everyone else's hand is untouched by it.
        cards_left: i === winner ? 0 : prev.players[i]?.hand?.length ?? 0,
        points_gained: p.score - (prev.players[i]?.score ?? 0),
        score_after: p.score,
        eliminated: !!p.isEliminated,
      })),
    };
  }

  beginNextRound() {
    const { hands } = initializeGame(this.rng);
    this.state = startNextRound(this.state, hands);
    this.dealEndsAt = Date.now() + this.delays.deal;
    this.broadcast();
    this.scheduleAI(this.delays.deal);
  }

  scheduleAI(delay = this.delays.aiTurn) {
    this.clearAITimer();
    const s = this.state;
    if (!s || s.gameState !== GAME_STATES.PLAYING) return;
    const current = s.players[s.currentPlayerIndex];
    if (current.type !== "AI" || current.isEliminated) return;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (!this.destroyed) this.playAITurn();
    }, delay);
  }

  playAITurn() {
    const s = this.state;
    if (!s || s.gameState !== GAME_STATES.PLAYING) return;
    const current = s.players[s.currentPlayerIndex];
    if (current.type !== "AI") return;

    let next = null;
    try {
      const decision = makeAIDecision(current, s.currentPlay, s);
      if (decision.action === "play" && decision.cards?.length) {
        const result = playCards(s, decision.cards);
        next = result.success ? result.newState : null;
      }
    } catch (err) {
      console.error("AI decision failed:", err);
    }

    if (!next) {
      if (s.currentPlay) {
        next = passAction(s);
      } else {
        // Leading a trick: passing is illegal, fall back to lowest single.
        const lowest = [...current.hand].sort((a, b) => cardValue(a) - cardValue(b))[0];
        const result = playCards(s, [lowest]);
        next = result.success ? result.newState : passAction(s);
      }
    }
    this.applyState(next);
  }

  broadcast() {
    if (this.onState) this.onState(this);
  }

  clearAITimer() {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
  }

  clearTimers() {
    this.clearAITimer();
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.clearTimers();
  }
}

/**
 * Strips hidden information before sending state to one client.
 * Every hand except the recipient's is replaced with placeholder cards so the
 * UI can still render card backs / counts. seatIndex -1 = spectator.
 */
export function redactState(state, seatIndex) {
  return {
    ...state,
    players: state.players.map((p, i) =>
      i === seatIndex
        ? p
        : { ...p, hand: p.hand.map(() => ({ hidden: true })) },
    ),
  };
}
