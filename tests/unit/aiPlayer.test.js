import { describe, it, expect } from "vitest";
import { COPIES, cards, ids, stateWith, seededRandom } from "../helpers/cards.js";

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];

describe.each(COPIES)("aiPlayer (%s)", (_name, { ai: A, evaluator: E, deck: D, logic: L }) => {
  const combo = (s) => E.identifyCombination(cards(s));

  /** Asserts the rulebook's hard limits on any CPU decision. */
  const expectLegal = (decision, hand, currentPlay) => {
    expect(["play", "pass"]).toContain(decision.action);
    if (!currentPlay) expect(decision.action, "the leader must play").toBe("play");
    if (decision.action === "pass") return;
    expect(decision.cards.length).toBeGreaterThan(0);
    const handIds = new Set(ids(hand));
    decision.cards.forEach((c) => expect(handIds.has(c.id), `${c.id} is in hand`).toBe(true));
    expect(new Set(ids(decision.cards)).size).toBe(decision.cards.length);
    const v = E.validatePlay(decision.cards, currentPlay);
    expect(v.valid, `${ids(decision.cards)} on ${currentPlay ? ids(currentPlay.cards) : "empty table"}`).toBe(true);
  };

  const decide = (difficulty, hand, currentPlay, extra = {}) => {
    const s = stateWith(L, { hands: [hand, "3♠ 4♠ 5♠ 6♠", "3♥ 4♥ 5♥ 6♥", "3♣ 4♣ 5♣ 6♣"], current: 0, currentPlay, aiDifficulty: difficulty, ...extra });
    return { decision: A.makeAIDecision(s.players[0], currentPlay, s), state: s };
  };
  /** With an opponent two cards from going out, every level plays whatever beats the table. */
  const decideUnderPressure = (difficulty, hand, currentPlay) =>
    decide(difficulty, hand, currentPlay, { hands: [hand, "3♠ 4♠", "3♥ 4♥ 5♥ 6♥", "3♣ 4♣ 5♣ 6♣"] });

  it("HARD counts the cards played: with every 2 gone its ace is boss, so it spends a pair", () => {
    // Only a pair beats the table, and it's one HARD would rather keep. It
    // spends it when it holds a card nobody can beat to take the lead back.
    const table = combo("5♦ 5♣");
    const hand = "7♣ 7♥ A♠ 9♦";
    const twosGone = cards("2♦ 2♣ 2♥ 2♠").map((c, i) => ({ type: "PLAY", playerIndex: 1 + (i % 3), cards: [c] }));
    expect(decide("HARD", hand, table, { moveHistory: twosGone }).decision).toEqual({ action: "play", cards: cards("7♣ 7♥") });
    // With the 2s still out there, the ace isn't safe: it keeps the pair.
    expect(decide("HARD", hand, table).decision.action).toBe("pass");
  });

  describe.each(DIFFICULTIES)("%s", (difficulty) => {
    it("leads with a legal play", () => {
      const hand = "3♦ 5♣ 5♥ 8♠ 9♦ 10♣ J♥ Q♠ K♦ 2♥";
      const { decision } = decide(difficulty, hand, null);
      expectLegal(decision, cards(hand), null);
    });

    it("plays its last card when it's the only one", () => {
      const { decision } = decide(difficulty, "2♠", null);
      expect(decision).toEqual({ action: "play", cards: cards("2♠") });
    });

    it("passes when nothing beats the table", () => {
      expect(decide(difficulty, "3♦ 4♣ 5♥", combo("2♠")).decision.action).toBe("pass");
      expect(decide(difficulty, "3♦ 4♣ 5♥", combo("9♦ 9♠")).decision.action).toBe("pass");
      expect(decide(difficulty, "3♦ 3♣ 5♥ 7♥ 9♥", combo("3♠ 4♠ 5♠ 6♠ 7♠")).decision.action).toBe("pass");
    });

    it("answers a single, a pair and a 5-card hand legally", () => {
      const hand = "4♦ 6♣ 6♠ 8♥ 9♥ 10♥ J♥ Q♥ K♠ A♦";
      [combo("5♠"), combo("5♦ 5♣"), combo("3♦ 4♣ 5♥ 6♦ 7♠")].forEach((table) => {
        expectLegal(decide(difficulty, hand, table).decision, cards(hand), table);
      });
    });

    // EASY always leads its lowest single, whatever else it holds.
    it.skipIf(difficulty === "EASY")("goes out with a wraparound straight", () => {
      const { decision } = decide(difficulty, "A♦ 2♣ 3♥ 4♠ 5♦", null);
      expect(decision.action).toBe("play");
      expect(ids(decision.cards).sort()).toEqual(ids(cards("A♦ 2♣ 3♥ 4♠ 5♦")).sort());
    });

    it("beats A-2-3-4-5 with 2-3-4-5-6", () => {
      const table = combo("A♠ 2♥ 3♦ 4♦ 5♥");
      const { decision } = decideUnderPressure(difficulty, "2♦ 3♣ 4♥ 5♠ 6♦", table);
      expect(decision.action).toBe("play");
      expectLegal(decision, cards("2♦ 3♣ 4♥ 5♠ 6♦"), table);
    });

    it("finds a straight around a pair", () => {
      const table = combo("3♦ 4♦ 5♣ 6♦ 7♦");
      const hand = "4♣ 5♦ 5♥ 6♣ 7♥ 8♠";
      const { decision } = decideUnderPressure(difficulty, hand, table);
      expect(decision.action).toBe("play");
      expectLegal(decision, cards(hand), table);
    });

    it("beats a same-suit flush with a higher top card", () => {
      const table = combo("4♥ 6♥ 8♥ J♥ Q♥");
      const hand = "3♥ 5♥ 7♥ 9♥ 10♥ K♥";
      const { decision } = decideUnderPressure(difficulty, hand, table);
      expect(decision.action).toBe("play");
      expectLegal(decision, cards(hand), table);
    });

    it("doesn't mutate the hand or the table", () => {
      const hand = "4♦ 6♣ 6♠ 8♥ 2♠";
      const table = combo("5♠");
      const { state } = decide(difficulty, hand, table);
      const before = JSON.stringify(state);
      A.makeAIDecision(state.players[0], table, state);
      expect(JSON.stringify(state)).toBe(before);
    });

    it("is always legal across 1,500 random positions", () => {
      const rand = seededRandom(difficulty.length * 101);
      const shuffle = (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      for (let n = 0; n < 1500; n++) {
        const deck = shuffle(D.createDeck());
        const hand = D.sortHand(deck.slice(0, 1 + Math.floor(rand() * 13)));
        const pool = deck.slice(13);
        let table = null;
        if (rand() < 0.75) {
          const size = [1, 2, 3, 5][Math.floor(rand() * 4)];
          for (let tries = 0; tries < 50 && !table; tries++) {
            table = E.identifyCombination(shuffle(pool).slice(0, size));
          }
          if (!table) table = E.identifyCombination([pool[0]]);
        }
        const s = stateWith(L, { current: 0, aiDifficulty: difficulty, currentPlay: table });
        s.players[0].hand = hand;
        s.players.slice(1).forEach((p, i) => (p.hand = pool.slice(i * 13, i * 13 + 1 + Math.floor(rand() * 13))));
        expectLegal(A.makeAIDecision(s.players[0], table, s), hand, table);
      }
    });
  });

  describe("EASY", () => {
    it("leads its lowest single", () => {
      expect(ids(decide("EASY", "5♣ 3♠ 3♦ 2♠", null).decision.cards)).toEqual(["3♦"]);
    });

    it("answers with the lowest play that wins", () => {
      expect(ids(decide("EASY", "4♦ 9♣ K♠ 2♦", combo("8♠")).decision.cards)).toEqual(["9♣"]);
      expect(ids(decide("EASY", "4♦ 4♣ 9♣ 9♠ K♥ K♠", combo("5♦ 5♠")).decision.cards)).toEqual(["9♣", "9♠"]);
    });

    it("always plays when it can, even a 2", () => {
      expect(ids(decide("EASY", "2♦", combo("A♠")).decision.cards)).toEqual(["2♦"]);
    });
  });

  describe("MEDIUM", () => {
    it("leads a triple before breaking it up", () => {
      expect(ids(decide("MEDIUM", "5♦ 5♣ 5♥ 9♠ J♦", null).decision.cards)).toEqual(["5♦", "5♣", "5♥"]);
    });

    it("saves its 2s when leading", () => {
      const { decision } = decide("MEDIUM", "2♦ 2♣ 9♠", null);
      expect(ids(decision.cards)).toEqual(["9♠"]);
    });

    it("keeps aces and 2s back while it has a big hand", () => {
      expect(decide("MEDIUM", "3♦ 4♣ 6♥ 7♠ A♦ 2♠", combo("K♠")).decision.action).toBe("pass");
    });

    describe("spends aces and 2s to stop an opponent close to going out", () => {
      const hand = "3♦ 4♣ 6♥ 7♠ A♦ 2♠";
      const table = () => combo("K♠");
      const withSeat1 = (seat1, extra = {}) =>
        decide("MEDIUM", hand, table(), { hands: [hand, seat1, "3♥ 4♥ 5♥ 6♥", "3♣ 4♣ 5♣ 6♣"], ...extra }).decision;

      it("a human opponent on 2 cards", () => {
        expect(ids(withSeat1("8♦ 9♦", { types: ["AI", "HUMAN", "AI", "AI"] }).cards)).toEqual(["A♦"]);
      });

      it("a CPU opponent on 2 cards", () => {
        expect(ids(withSeat1("8♦ 9♦", { types: ["AI", "AI", "AI", "AI"] }).cards)).toEqual(["A♦"]);
      });

      it("but not an eliminated one", () => {
        expect(withSeat1("8♦ 9♦", { eliminated: [false, true, false, false] }).action).toBe("pass");
      });

      it("and not when every opponent still holds 4 or more", () => {
        expect(withSeat1("8♦ 9♦ 10♦ J♦").action).toBe("pass");
      });
    });

    it("plays anything winning when down to 3 cards", () => {
      expect(ids(decide("MEDIUM", "3♦ A♦ 2♠", combo("K♠")).decision.cards)).toEqual(["A♦"]);
    });
  });

  describe("evaluateHandStrength", () => {
    it("scores sets and high cards", () => {
      expect(A.evaluateHandStrength(cards("3♦ 5♣ 7♥"))).toBe(0);
      expect(A.evaluateHandStrength(cards("3♦ 3♣"))).toBe(3);
      expect(A.evaluateHandStrength(cards("3♦ 3♣ 3♥"))).toBe(6);
      expect(A.evaluateHandStrength(cards("3♦ 3♣ 3♥ 3♠"))).toBe(10);
      expect(A.evaluateHandStrength(cards("K♦ A♣ 2♥"))).toBe(6);
    });

    it("a strong hand outscores a weak one", () => {
      expect(A.evaluateHandStrength(cards("A♦ A♣ 2♥ 2♠ K♦"))).toBeGreaterThan(A.evaluateHandStrength(cards("3♦ 5♣ 7♥ 9♠ J♦")));
    });
  });
});
