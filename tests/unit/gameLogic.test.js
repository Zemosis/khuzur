import { describe, it, expect } from "vitest";
import { COPIES, cards, ids, stateWith } from "../helpers/cards.js";

describe.each(COPIES)("gameLogic (%s)", (_name, { logic: L, evaluator: E, constants: C }) => {
  const S = C.GAME_STATES;
  const combo = (s) => E.identifyCombination(cards(s));
  const play = (state, s) => {
    const r = L.playCards(state, cards(s));
    expect(r.success, r.error).toBe(true);
    return r.newState;
  };
  const passFlags = (state) => state.players.map((p) => p.hasPassed);

  describe("createGameState", () => {
    const hands = [cards("3♦"), cards("4♦"), cards("5♦"), cards("6♦")];

    it("sets up seats, turn and dealer", () => {
      const s = L.createGameState(hands, 2);
      expect(s.currentPlayerIndex).toBe(2);
      expect(s.dealerIndex).toBe(1);
      expect(s.gameState).toBe(S.PLAYING);
      expect(s.currentPlay).toBeNull();
      expect(s.roundNumber).toBe(1);
      expect(s.moveHistory).toEqual([]);
      expect(s.players.map((p) => p.type)).toEqual(["HUMAN", "AI", "AI", "AI"]);
      expect(s.players.map((p) => p.name)).toEqual(["You", "Bot Saturn", "Bot Venus", "Bot Mars"]);
      s.players.forEach((p, i) => {
        expect(p).toMatchObject({ id: i, score: 0, isEliminated: false, hasPassed: false });
        expect(p.hand).toBe(hands[i]);
      });
    });

    it("dealer wraps to seat 3 when seat 0 starts", () => {
      expect(L.createGameState(hands, 0).dealerIndex).toBe(3);
    });

    it("defaults to MEDIUM and a fresh match, or takes match meta", () => {
      const a = L.createGameState(hands);
      expect(a.aiDifficulty).toBe("MEDIUM");
      expect(a.matchNumber).toBe(1);
      expect(a.matchWins).toEqual([0, 0, 0, 0]);
      const b = L.createGameState(hands, 0, "HARD", { matchNumber: 3, matchWins: [1, 0, 1, 0] });
      expect(b.aiDifficulty).toBe("HARD");
      expect(b.matchNumber).toBe(3);
      expect(b.matchWins).toEqual([1, 0, 1, 0]);
    });
  });

  describe("getNextPlayerIndex", () => {
    it("goes clockwise and wraps", () => {
      expect(L.getNextPlayerIndex(stateWith(L, { current: 0 }))).toBe(1);
      expect(L.getNextPlayerIndex(stateWith(L, { current: 3 }))).toBe(0);
    });

    it("skips eliminated seats", () => {
      const s = stateWith(L, { current: 0, eliminated: [false, true, true, false] });
      expect(L.getNextPlayerIndex(s)).toBe(3);
    });

    it("skips seats that passed since the last play", () => {
      const s = stateWith(L, { current: 0, passed: [false, true, false, false] });
      expect(L.getNextPlayerIndex(s)).toBe(2);
    });

    it("stops instead of looping forever when every other seat is out", () => {
      const s = stateWith(L, { current: 1, eliminated: [true, false, true, true] });
      expect(L.getNextPlayerIndex(s)).toBe(1);
    });
  });

  describe("pass rule: passing skips only that turn", () => {
    const hands = ["4♦ 9♠ 2♠", "5♦ 10♠ J♦", "6♦ Q♦ 3♠", "7♦ K♦ 3♣"];

    it("a player who passed is asked again once the table is beaten", () => {
      let s = stateWith(L, { hands, current: 0 });
      s = play(s, "4♦");
      s = L.passAction(s); // seat 1 passes
      expect(s.currentPlayerIndex).toBe(2);
      expect(passFlags(s)).toEqual([false, true, false, false]);
      s = play(s, "6♦"); // seat 2 beats the table: every pass is wiped
      expect(passFlags(s)).toEqual([false, false, false, false]);
      s = play(s, "7♦");
      s = L.passAction(s); // seat 0
      expect(s.currentPlayerIndex).toBe(1); // seat 1 gets another turn
      expect(s.currentPlay.cards[0].id).toBe("7♦");
      s = play(s, "10♠");
      expect(s.lastPlayedBy).toBe(1);
    });

    it("the trick ends when everyone else passes in a row", () => {
      let s = stateWith(L, { hands, current: 0 });
      s = play(s, "9♠");
      s = L.passAction(s);
      s = L.passAction(s);
      expect(s.currentPlay).not.toBeNull();
      s = L.passAction(s);
      expect(s.currentPlay).toBeNull();
      expect(s.currentPlayerIndex).toBe(0);
      expect(passFlags(s)).toEqual([false, false, false, false]);
      expect(s.moveHistory.at(-1)).toEqual({ type: "ROUND_RESET", leadPlayer: 0 });
    });

    it("works with an eliminated seat at the table", () => {
      let s = stateWith(L, { hands, current: 0, eliminated: [false, true, false, false] });
      s = play(s, "4♦");
      expect(s.currentPlayerIndex).toBe(2);
      s = L.passAction(s);
      s = play(s, "7♦");
      s = L.passAction(s); // seat 0
      expect(s.currentPlayerIndex).toBe(2); // seat 2 passed earlier but is asked again
      s = L.passAction(s);
      expect(s.currentPlay).toBeNull();
      expect(s.currentPlayerIndex).toBe(3);
    });

    it("head-to-head: one pass ends the trick", () => {
      let s = stateWith(L, { hands, current: 0, eliminated: [false, true, true, false] });
      s = play(s, "4♦");
      expect(s.currentPlayerIndex).toBe(3);
      s = L.passAction(s);
      expect(s.currentPlay).toBeNull();
      expect(s.currentPlayerIndex).toBe(0);
    });

    it("counts passes and records them", () => {
      let s = stateWith(L, { hands, current: 0 });
      s = play(s, "4♦");
      s = L.passAction(s);
      expect(s.passCount).toBe(1);
      expect(s.moveHistory.at(-1)).toEqual({ type: "PASS", playerIndex: 1 });
      s = play(s, "6♦");
      expect(s.passCount).toBe(0);
    });
  });

  describe("shouldResetRound / resetRound", () => {
    it("resets only when one active player hasn't passed", () => {
      expect(L.shouldResetRound(stateWith(L, { passed: [false, true, true, false] }))).toBe(false);
      expect(L.shouldResetRound(stateWith(L, { passed: [false, true, true, true] }))).toBe(true);
      expect(L.shouldResetRound(stateWith(L, { passed: [false, true, false, false], eliminated: [false, false, true, true] }))).toBe(true);
    });

    it("gives the lead to the last player who played", () => {
      const s = L.resetRound(stateWith(L, { current: 3, lastPlayedBy: 1, currentPlay: combo("5♦"), passed: [true, false, true, true] }));
      expect(s.currentPlayerIndex).toBe(1);
      expect(s.currentPlay).toBeNull();
      expect(s.lastPlayedBy).toBeNull();
      expect(passFlags(s)).toEqual([false, false, false, false]);
    });

    it("falls back to the current player when nobody played", () => {
      expect(L.resetRound(stateWith(L, { current: 2 })).currentPlayerIndex).toBe(2);
    });
  });

  describe("playCards", () => {
    const hands = ["3♦ 4♦ 9♠", "5♦", "6♦", "7♦"];

    it("rejects an invalid play and leaves the state unchanged", () => {
      const s = stateWith(L, { hands, current: 0 });
      const r = L.playCards(s, cards("3♦ 4♦"));
      expect(r).toEqual({ success: false, newState: s, error: "Invalid combination" });
    });

    it("rejects a play that doesn't beat the table", () => {
      const s = stateWith(L, { hands, current: 0, currentPlay: combo("8♠"), lastPlayedBy: 3 });
      expect(L.playCards(s, cards("4♦")).success).toBe(false);
    });

    it("moves the cards to the table and passes the turn", () => {
      const s = play(stateWith(L, { hands, current: 0 }), "4♦");
      expect(ids(s.players[0].hand)).toEqual(["3♦", "9♠"]);
      expect(s.currentPlay.cards[0].id).toBe("4♦");
      expect(s.players[0].lastPlay.type).toBe("SINGLE");
      expect(s.lastPlayedBy).toBe(0);
      expect(s.currentPlayerIndex).toBe(1);
      expect(s.moveHistory.at(-1)).toMatchObject({ type: "PLAY", playerIndex: 0 });
    });

    it.each([
      ["a straight, low to high", "9♠ 7♦ 8♣ 10♥ J♠", "7♦ 8♣ 9♠ 10♥ J♠"],
      ["a flush, low to high", "K♥ 3♥ J♥ 7♥ 9♥", "3♥ 7♥ 9♥ J♥ K♥"],
      ["a wraparound straight in run order", "5♦ 3♥ A♠ 4♣ 2♦", "A♠ 2♦ 3♥ 4♣ 5♦"],
      ["the other wraparound in run order", "6♣ 2♠ 4♣ 3♥ 5♦", "2♠ 3♥ 4♣ 5♦ 6♣"],
      ["a full house, triple first", "4♥ 8♦ 4♠ 8♣ 8♠", "8♦ 8♣ 8♠ 4♥ 4♠"],
      ["a pair, by suit", "9♠ 9♦", "9♦ 9♠"],
    ])("lays %s on the table, however it was picked", (_label, picked, shown) => {
      // One card kept back, so the play doesn't end the round.
      const s = play(stateWith(L, { hands: [`${picked} K♣`, "3♣", "3♠", "4♠"], current: 0 }), picked);
      expect(ids(s.moveHistory.at(-1).cards)).toEqual(ids(cards(shown)));
    });

    it("does not mutate the input state", () => {
      const s = stateWith(L, { hands, current: 0 });
      const before = JSON.stringify(s);
      play(s, "3♦");
      expect(JSON.stringify(s)).toBe(before);
    });

    it("emptying your hand ends the round mid-trick", () => {
      const s = stateWith(L, { hands, current: 1, currentPlay: combo("4♠"), lastPlayedBy: 0 });
      const r = L.playCards(s, cards("5♦"));
      expect(r.playerWon).toBe(true);
      expect(r.newState.gameState).toBe(S.ROUND_END);
      expect(r.newState.winnerIndex).toBe(1);
    });
  });

  describe("endRound: scoring", () => {
    const hand = (n) => Array.from({ length: n }, (_, i) => ["3♦", "4♦", "5♦", "6♦", "7♦", "8♦", "9♦", "10♦", "J♦", "Q♦", "K♦", "A♦", "2♦"][i]).join(" ");

    it("1 point per card, doubled at 10 or more", () => {
      const s = L.endRound(stateWith(L, { hands: ["", hand(9), hand(10), hand(1)] }), 0);
      expect(s.players.map((p) => p.score)).toEqual([0, 9, 20, 1]);
      expect(s.players.every((p) => p.hand.length === 0)).toBe(true);
    });

    it("13 cards left scores 26 and eliminates at once", () => {
      const s = L.endRound(stateWith(L, { hands: ["", hand(13), "", ""] }), 0);
      expect(s.players[1]).toMatchObject({ score: 26, isEliminated: true });
    });

    it("24 points stays in, exactly 25 is eliminated", () => {
      const s = L.endRound(stateWith(L, { hands: ["", hand(2), hand(3), ""], scores: [0, 22, 22, 0] }), 0);
      expect(s.players[1]).toMatchObject({ score: 24, isEliminated: false });
      expect(s.players[2]).toMatchObject({ score: 25, isEliminated: true });
      expect(s.gameState).toBe(S.ROUND_END);
    });

    it("the winner's score doesn't change", () => {
      const s = L.endRound(stateWith(L, { hands: ["", hand(2), "", ""], scores: [10, 0, 0, 0] }), 0);
      expect(s.players[0].score).toBe(10);
    });

    it("several players can be knocked out in one round, ending the match", () => {
      const s = L.endRound(
        stateWith(L, { hands: ["", hand(5), hand(5), hand(5)], scores: [0, 20, 20, 20], matchWins: [2, 0, 1, 0] }),
        0,
      );
      expect(s.players.map((p) => p.isEliminated)).toEqual([false, true, true, true]);
      expect(s.gameState).toBe(S.GAME_OVER);
      expect(s.matchWins).toEqual([3, 0, 1, 0]);
      expect(s.moveHistory.at(-1)).toMatchObject({ type: "ROUND_END", winnerIndex: 0 });
    });

    it("an already-eliminated seat keeps its score", () => {
      const s = L.endRound(stateWith(L, { hands: ["", "", hand(1), ""], scores: [0, 30, 0, 0], eliminated: [false, true, false, false] }), 0);
      expect(s.players[1]).toMatchObject({ score: 30, isEliminated: true });
    });
  });

  describe("startNextRound", () => {
    const fresh = [cards("3♦"), cards("4♦"), cards("5♦"), cards("6♦")];

    it("the last round's winner leads and the dealer rotates", () => {
      const s = L.startNextRound(stateWith(L, { dealerIndex: 1, winnerIndex: 3, roundNumber: 4, passed: [true, true, false, false] }), fresh);
      expect(s.currentPlayerIndex).toBe(3);
      expect(s.dealerIndex).toBe(2);
      expect(s.roundNumber).toBe(5);
      expect(s.gameState).toBe(S.PLAYING);
      expect(s.currentPlay).toBeNull();
      expect(passFlags(s)).toEqual([false, false, false, false]);
      expect(s.moveHistory.at(-1)).toEqual({ type: "NEW_ROUND", roundNumber: 5, dealer: 2 });
    });

    it("the dealer skips eliminated seats", () => {
      const s = L.startNextRound(stateWith(L, { dealerIndex: 1, winnerIndex: 0, eliminated: [false, false, true, true] }), fresh);
      expect(s.dealerIndex).toBe(0);
    });

    it("eliminated seats get no cards", () => {
      const s = L.startNextRound(stateWith(L, { dealerIndex: 0, winnerIndex: 0, eliminated: [false, true, false, false] }), fresh);
      expect(s.players[1].hand).toEqual([]);
      expect(s.players[2].hand).toBe(fresh[2]);
    });

    it("with no winner recorded, the seat after the dealer leads", () => {
      const s = L.startNextRound(stateWith(L, { dealerIndex: 0 }), fresh);
      expect(s.dealerIndex).toBe(1);
      expect(s.currentPlayerIndex).toBe(2);
    });
  });

  describe("queries", () => {
    it("isHumanTurn", () => {
      expect(L.isHumanTurn(stateWith(L, { current: 0 }))).toBe(true);
      expect(L.isHumanTurn(stateWith(L, { current: 1 }))).toBe(false);
      expect(L.isHumanTurn(stateWith(L, { current: 0, eliminated: [true, false, false, false] }))).toBe(false);
    });

    it("getActivePlayers", () => {
      expect(L.getActivePlayers(stateWith(L, { eliminated: [false, true, false, true] })).map((p) => p.id)).toEqual([0, 2]);
    });

    it("getWinner is null until the match is over", () => {
      expect(L.getWinner(stateWith(L, { eliminated: [true, true, false, true] }))).toBeNull();
      const over = stateWith(L, { eliminated: [true, true, false, true], gameState: S.GAME_OVER });
      expect(L.getWinner(over).id).toBe(2);
    });

    it("isHumanEliminated", () => {
      expect(L.isHumanEliminated(stateWith(L, { eliminated: [true, false, false, false] }))).toBe(true);
      expect(L.isHumanEliminated(stateWith(L))).toBe(false);
    });
  });
});
