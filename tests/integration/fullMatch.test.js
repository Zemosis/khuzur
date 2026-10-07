// Plays whole CPU-only matches through the pure rules (playCards / passAction /
// endRound / startNextRound) and checks the rulebook's invariants after every
// single move. Deals are seeded, so a failure names a seed you can replay.

import { describe, it, expect } from "vitest";
import { COPIES, seededRandom } from "../helpers/cards.js";

const MATCHES_PER_DIFFICULTY = 60;
const MOVE_CAP = 20000;

describe.each(COPIES)("full matches (%s)", (_name, { logic: L, deck: D, evaluator: E, ai: A, constants: C }) => {
  const S = C.GAME_STATES;

  const playMatch = (seed, difficulty) => {
    const rng = seededRandom(seed);
    const { hands } = D.initializeGame(rng);
    const starter = D.findPlayerWithCard(hands, "3", "♦");
    let s = L.createGameState(hands, starter, difficulty);
    s.players = s.players.map((p) => ({ ...p, type: "AI" }));

    const stats = { moves: 0, rounds: 1, tricks: 0 };
    let dealt = 52;
    let played = [];
    let passesInARow = 0;
    let prevScores = s.players.map((p) => p.score);

    expect(s.players[starter].hand.some((c) => c.id === "3♦"), "3♦ holder leads").toBe(true);

    while (s.gameState !== S.GAME_OVER) {
      if (++stats.moves > MOVE_CAP) throw new Error(`seed ${seed}: match never ended`);

      if (s.gameState === S.ROUND_END) {
        const winner = s.winnerIndex;
        s = L.startNextRound(s, D.initializeGame(rng).hands);
        stats.rounds++;
        expect(s.currentPlayerIndex, "last round's winner leads").toBe(winner);
        dealt = s.players.filter((p) => !p.isEliminated).length * 13;
        played = [];
        passesInARow = 0;
        s.players.forEach((p) => expect(p.hand.length).toBe(p.isEliminated ? 0 : 13));
        continue;
      }

      const seat = s.currentPlayerIndex;
      const player = s.players[seat];
      expect(player.isEliminated, `seed ${seed}: eliminated seat ${seat} got a turn`).toBe(false);
      expect(player.hasPassed, `seed ${seed}: seat ${seat} was asked after passing with no play since`).toBe(false);

      const table = s.currentPlay;
      const decision = A.makeAIDecision(player, table, s);
      let next;
      if (decision.action === "play") {
        const r = L.playCards(s, decision.cards);
        expect(r.success, `seed ${seed}: CPU made an illegal play (${r.error})`).toBe(true);
        if (table) expect(E.canBeatCombination(r.newState.currentPlay ?? E.identifyCombination(decision.cards), table)).toBe(true);
        played.push(...decision.cards);
        passesInARow = 0;
        next = r.newState;
      } else {
        expect(table, `seed ${seed}: the leader passed`).not.toBeNull();
        passesInARow++;
        next = L.passAction(s);
      }

      // A trick only clears after everyone else passed in a row.
      if (table && next.currentPlay === null && next.gameState === S.PLAYING) {
        stats.tricks++;
        const active = next.players.filter((p) => !p.isEliminated).length;
        expect(passesInARow, `seed ${seed}: trick cleared early`).toBe(active - 1);
        passesInARow = 0;
      }

      // Every card is somewhere: in a hand or on the discard pile, never twice.
      if (next.gameState === S.PLAYING) {
        const inHands = next.players.flatMap((p) => p.hand);
        const all = [...inHands, ...played].map((c) => c.id);
        expect(all.length, `seed ${seed}: cards lost or duplicated`).toBe(dealt);
        expect(new Set(all).size).toBe(dealt);
      }

      // Scores only go up.
      next.players.forEach((p, i) => expect(p.score).toBeGreaterThanOrEqual(prevScores[i]));
      prevScores = next.players.map((p) => p.score);
      s = next;
    }

    const standing = s.players.filter((p) => !p.isEliminated);
    expect(standing, `seed ${seed}: exactly one winner`).toHaveLength(1);
    expect(s.matchWins[standing[0].id]).toBe(1);
    s.players.filter((p) => p.isEliminated).forEach((p) => expect(p.score).toBeGreaterThanOrEqual(30));
    expect(standing[0].score).toBeLessThan(30);
    return stats;
  };

  it.each(["EASY", "MEDIUM", "HARD"])(`%s CPUs finish ${MATCHES_PER_DIFFICULTY} matches with every rule holding`, (difficulty) => {
    let rounds = 0;
    let tricks = 0;
    for (let seed = 1; seed <= MATCHES_PER_DIFFICULTY; seed++) {
      const stats = playMatch(seed * 7919 + difficulty.length, difficulty);
      rounds += stats.rounds;
      tricks += stats.tricks;
    }
    expect(rounds).toBeGreaterThan(MATCHES_PER_DIFFICULTY * 2);
    expect(tricks).toBeGreaterThan(rounds);
  });
});
