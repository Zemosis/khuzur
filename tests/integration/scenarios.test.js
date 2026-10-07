// Move-by-move stories straight from docs/thirteen-rulebook.md.

import { describe, it, expect } from "vitest";
import { COPIES, cards, ids, stateWith } from "../helpers/cards.js";

describe.each(COPIES)("rulebook scenarios (%s)", (_name, { logic: L, deck: D, constants: C }) => {
  const S = C.GAME_STATES;
  const play = (s, hand) => {
    const r = L.playCards(s, cards(hand));
    expect(r.success, `${hand}: ${r.error}`).toBe(true);
    return r.newState;
  };
  const pass = (s) => L.passAction(s);
  const table = (s) => (s.currentPlay ? ids(s.currentPlay.cards).join(" ") : "");

  it("the rulebook's example trick: Bot Saturn passes, then comes back with its 2♠", () => {
    let s = stateWith(L, {
      hands: ["5♣ 7♦ 8♦", "2♠ 4♥ 6♥", "9♦ 3♥ 4♠", "K♥ 3♠ 5♠"],
      current: 0,
    });
    s = play(s, "5♣"); // 1  You lead
    s = pass(s); //       2  Bot Saturn saves its 2♠
    s = play(s, "9♦"); // 3  Bot Venus
    s = play(s, "K♥"); // 4  Bot Mars
    s = pass(s); //       5  You
    expect(s.currentPlayerIndex).toBe(1); // 6  Bot Saturn is asked again
    s = play(s, "2♠");
    s = pass(s); //       7  Bot Venus
    s = pass(s); //       8  Bot Mars
    expect(table(s)).toBe("2♠");
    s = pass(s); //       9  You
    expect(table(s)).toBe("");
    expect(s.currentPlayerIndex).toBe(1); // Bot Saturn takes the trick and leads
  });

  it("the 3♦ holder leads the first round but may lead something else", () => {
    const hands = [cards("4♦ 5♦"), cards("3♦ 9♠"), cards("6♦"), cards("7♦")];
    const start = D.findPlayerWithCard(hands, "3", "♦");
    let s = L.createGameState(hands, start);
    expect(s.currentPlayerIndex).toBe(1);
    s = play(s, "9♠");
    expect(ids(s.players[1].hand)).toEqual(["3♦"]);
  });

  it("going out on a 5-card hand ends the round and scores the table", () => {
    let s = stateWith(L, {
      hands: ["3♦ 4♣ 5♥ 6♠ 7♦", "8♦ 9♦", "10♦ J♦ Q♦ K♦ A♦ 2♦ 3♣ 4♦ 5♣ 6♣", "8♣"],
      current: 0,
    });
    s = play(s, "3♦ 4♣ 5♥ 6♠ 7♦");
    expect(s.gameState).toBe(S.ROUND_END);
    expect(s.winnerIndex).toBe(0);
    expect(s.players.map((p) => p.score)).toEqual([0, 2, 20, 1]);
  });

  it("you can't go out by passing: the round continues until someone empties a hand", () => {
    let s = stateWith(L, { hands: ["2♠", "3♦", "4♦", "5♦"], current: 1 });
    s = play(s, "3♦");
    s = play(s, "4♦");
    s = play(s, "5♦");
    expect(s.gameState).toBe(S.ROUND_END);
    expect(s.winnerIndex).toBe(1);
  });

  it("an elimination mid-match leaves a 3-player table that skips the empty seat", () => {
    let s = stateWith(L, {
      hands: ["9♠", "3♦ 4♦ 5♦ 6♦", "10♠ J♠", "Q♠"],
      scores: [0, 27, 0, 0],
      current: 0,
    });
    s = play(s, "9♠");
    expect(s.gameState).toBe(S.ROUND_END);
    expect(s.players[1]).toMatchObject({ score: 31, isEliminated: true });

    s = L.startNextRound(s, [cards("3♣ 7♣"), cards("A♠"), cards("4♣ 8♣"), cards("5♣ 9♣")]);
    expect(s.players[1].hand).toEqual([]);
    expect(s.currentPlayerIndex).toBe(0);
    s = play(s, "3♣");
    expect(s.currentPlayerIndex).toBe(2);
    s = play(s, "4♣");
    expect(s.currentPlayerIndex).toBe(3);
    s = pass(s);
    s = pass(s); // seat 0: two passes in a row with 3 players -> seat 2 takes it
    expect(s.currentPlay).toBeNull();
    expect(s.currentPlayerIndex).toBe(2);
  });

  it("a two-player duel: one pass clears the trick, going out ends the round", () => {
    let s = stateWith(L, {
      hands: ["", "K♠ 3♦", "", "A♠ 4♦"],
      scores: [30, 20, 28, 20],
      eliminated: [true, false, true, false],
      current: 1,
    });
    s = play(s, "K♠");
    expect(s.currentPlayerIndex).toBe(3);
    s = play(s, "A♠");
    expect(s.currentPlayerIndex).toBe(1);
    expect(L.playCards(s, cards("3♦")).success).toBe(false); // 3♦ can't beat A♠
    s = pass(s);
    expect(s.currentPlay).toBeNull(); // one pass is "everyone else" in a duel
    expect(s.currentPlayerIndex).toBe(3);
    s = play(s, "4♦");
    expect(s.gameState).toBe(S.ROUND_END);
    expect(s.winnerIndex).toBe(3);
    expect(s.players[1]).toMatchObject({ score: 21, isEliminated: false });
  });

  it("a double-penalty round can knock out the last rival and end the match", () => {
    let s = stateWith(L, {
      hands: ["", "7♠", "", "3♦ 4♦ 5♦ 6♦ 7♦ 8♦ 9♦ 10♦ J♦ Q♦ K♦"],
      scores: [30, 20, 31, 8],
      eliminated: [true, false, true, false],
      current: 1,
      matchWins: [0, 0, 0, 0],
    });
    s = play(s, "7♠");
    expect(s.players[3].score).toBe(8 + 22);
    expect(s.gameState).toBe(S.GAME_OVER);
    expect(L.getWinner(s).id).toBe(1);
    expect(s.matchWins).toEqual([0, 1, 0, 0]);
  });
});
