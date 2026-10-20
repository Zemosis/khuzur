import { describe, it, expect } from "vitest";
import { COPIES, cards, ids, stateWith, seededRandom } from "../helpers/cards.js";

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];

// EASY's slips (leading a pair, grabbing any winning play) roll under this, so it never slips.
const steady = () => 0.99;

describe.each(COPIES)("aiPlayer (%s)", (_name, { ai: A, evaluator: E, deck: D, logic: L, search: S }) => {
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

  const decide = (difficulty, hand, currentPlay, { rng = seededRandom(7), ...extra } = {}) => {
    const s = stateWith(L, { hands: [hand, "3♠ 4♠ 5♠ 6♠", "3♥ 4♥ 5♥ 6♥", "3♣ 4♣ 5♣ 6♣"], current: 0, currentPlay, aiDifficulty: difficulty, ...extra });
    return { decision: A.makeAIDecision(s.players[0], currentPlay, s, rng), state: s };
  };
  const played = (ids_) => cards(ids_).map((c, i) => ({ type: "PLAY", playerIndex: 1 + (i % 3), cards: [c] }));
  /** With an opponent two cards from going out, every level plays whatever beats the table. */
  const decideUnderPressure = (difficulty, hand, currentPlay) =>
    decide(difficulty, hand, currentPlay, { hands: [hand, "3♠ 4♠", "3♥ 4♥ 5♥ 6♥", "3♣ 4♣ 5♣ 6♣"] });

  it("a CPU plays at its own level, not the table's", () => {
    // EASY leads its lowest single; MEDIUM leads its lowest pair first.
    const s = stateWith(L, { hands: ["5♦ 5♣ 9♠ K♥", "3♠", "3♥", "3♣"], current: 0, aiDifficulty: "EASY" });
    expect(A.makeAIDecision(s.players[0], null, s, steady).cards).toEqual(cards("5♦"));
    expect(A.makeAIDecision({ ...s.players[0], level: "MEDIUM" }, null, s, steady).cards).toEqual(cards("5♦ 5♣"));
  });

  describe("someone on their last card", () => {
    const opponents = ["J♦", "3♥ 5♥ 6♥ 10♥ 8♣", "3♠ 5♠ 6♠ 10♠ 8♦"];
    // EASY without its slips; the others with real random deals for HARD's search.
    const rngFor = (level) => (level === "EASY" ? steady : seededRandom(7));

    it("MEDIUM and HARD answer a single with their highest; EASY with its lowest", () => {
      const table = combo("5♠");
      const answer = (level) => decide(level, "4♦ 7♣ 9♥ 2♠", table, { hands: ["4♦ 7♣ 9♥ 2♠", ...opponents], lastPlayedBy: 3, rng: rngFor(level) }).decision.cards;
      expect(ids(answer("HARD"))).toEqual(["2♠"]);
      expect(ids(answer("MEDIUM"))).toEqual(["2♠"]);
      expect(ids(answer("EASY"))).toEqual(["7♣"]);
    });

    it("MEDIUM and HARD lead a pair they can't answer, not a single", () => {
      const lead = (level) => decide(level, "4♦ 4♣ 9♥ K♠", null, { hands: ["4♦ 4♣ 9♥ K♠", ...opponents], rng: rngFor(level) }).decision.cards;
      expect(ids(lead("HARD"))).toEqual(["4♦", "4♣"]);
      expect(ids(lead("MEDIUM"))).toEqual(["4♦", "4♣"]);
      expect(ids(lead("EASY"))).toEqual(["4♦"]);
    });
  });

  it("MEDIUM and HARD lead the 2♠ first, keeping the lead to go out with their last card", () => {
    const hands = ["2♠ 3♦", "J♦ Q♦ K♦", "3♥ 5♥ 6♥ 7♥ 8♣", "3♣ 5♣ 6♣ 7♣ 8♦"];
    expect(ids(decide("HARD", "2♠ 3♦", null, { hands }).decision.cards)).toEqual(["2♠"]);
    expect(ids(decide("MEDIUM", "2♠ 3♦", null, { hands }).decision.cards)).toEqual(["2♠"]);
    expect(ids(decide("EASY", "2♠ 3♦", null, { hands, rng: steady }).decision.cards)).toEqual(["3♦"]);
  });

  it("HARD counts this round's cards: with every 2 played, its ace is the highest left", () => {
    const hands = ["A♠ 4♦", "5♠ 6♠", "5♥ 6♥", "5♣ 6♣"];
    const twosGone = played("2♦ 2♣ 2♥ 2♠");
    expect(ids(decide("HARD", "A♠ 4♦", null, { hands, moveHistory: twosGone }).decision.cards)).toEqual(["A♠"]);
    // MEDIUM doesn't remember the 2s, so to it the ace isn't safe.
    expect(ids(decide("MEDIUM", "A♠ 4♦", null, { hands, moveHistory: twosGone }).decision.cards)).toEqual(["4♦"]);
  });

  describe("what a seat knows", () => {
    it("this round's plays, not the last round's", () => {
      const s = stateWith(L, { hands: ["A♠ 4♦", "5♠ 6♠", "5♥ 6♥", "5♣ 6♣"] });
      s.moveHistory = [...played("2♦ 2♣"), { type: "ROUND_END", winnerIndex: 1 }, { type: "NEW_ROUND", roundNumber: 2 }, ...played("2♥")];
      const view = S.readTable(s, 0);
      expect(view.unseen).toContain(cards("2♦")[0].rankValue * 4);
      expect(view.unseen).not.toContain(cards("2♥")[0].rankValue * 4 + 2);
      // Without memory, every card it can't see is unseen.
      expect(S.readTable(s, 0, { memory: false }).unseen).toHaveLength(50);
    });

    it("a pass on one card: that card is under what they passed", () => {
      const s = stateWith(L, { hands: ["9♥ 5♣", "J♦", "", ""], eliminated: [false, false, true, true], current: 0 });
      s.moveHistory = [{ type: "PLAY", playerIndex: 0, cards: cards("8♦") }, { type: "PASS", playerIndex: 1 }, { type: "ROUND_RESET", leadPlayer: 0 }];
      expect(S.readTable(s, 0).opps).toEqual([{ seat: 1, count: 1, limit: 5 * 4 }]);
      // So HARD's 9 is safe: it leads it, then goes out with the 5.
      expect(ids(A.makeAIDecision(s.players[0], null, { ...s, aiDifficulty: "HARD" }, seededRandom(3)).cards)).toEqual(["9♥"]);
    });

    it.each(DIFFICULTIES)("%s decides the same whatever the hidden cards are", (level) => {
      // Same hand, table, counts and history, different cards behind the opponents' backs.
      const rand = seededRandom(level.length);
      const shuffle = (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      for (let n = 0; n < 30; n++) {
        const deck = shuffle(D.createDeck());
        const hand = D.sortHand(deck.slice(0, 2 + Math.floor(rand() * 11)));
        const counts = [1, 2, 3].map(() => 1 + Math.floor(rand() * 13));
        const table = rand() < 0.5 ? E.identifyCombination([deck[13]]) : null;
        const rest = deck.slice(14);
        const runWith = (pool) => {
          const s = stateWith(L, { current: 0, currentPlay: table, lastPlayedBy: table ? 2 : null });
          s.players[0].hand = hand;
          let at = 0;
          counts.forEach((c, i) => {
            s.players[i + 1].hand = pool.slice(at, at + c);
            at += c;
          });
          const d = A.makeAIDecision({ ...s.players[0], level }, table, s, seededRandom(n));
          return d.cards ? ids(d.cards) : "pass";
        };
        expect(runWith(shuffle(rest))).toEqual(runWith(shuffle(rest)));
      }
    });
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

    it("goes out with a wraparound straight", () => {
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

    it("beats a full house with a poker (its four plus its lowest card)", () => {
      const table = combo("2♦ 2♣ 2♥ A♠ A♥");
      const hand = "9♦ 9♣ 9♥ 9♠ 4♣ K♦";
      const { decision } = decideUnderPressure(difficulty, hand, table);
      expect(decision.action).toBe("play");
      expectLegal(decision, cards(hand), table);
      expect(ids(decision.cards).sort()).toEqual(ids(cards("9♦ 9♣ 9♥ 9♠ 4♣")).sort());
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

    // HARD thinks for up to ~50ms a move, so it gets fewer positions.
    const positions = difficulty === "HARD" ? 300 : 1500;
    it(`is always legal across ${positions} random positions`, () => {
      const rand = seededRandom(difficulty.length * 101);
      const shuffle = (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      for (let n = 0; n < positions; n++) {
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
      expect(ids(decide("EASY", "5♣ 3♠ 3♦ 2♠", null, { rng: steady }).decision.cards)).toEqual(["3♦"]);
    });

    it("now and then leads its lowest card with the ones that pair it", () => {
      expect(ids(decide("EASY", "5♣ 3♠ 3♦ 2♠", null, { rng: () => 0 }).decision.cards)).toEqual(["3♦", "3♠"]);
    });

    it("answers with the lowest play that wins", () => {
      expect(ids(decide("EASY", "4♦ 9♣ K♠ 2♦", combo("8♠"), { rng: steady }).decision.cards)).toEqual(["9♣"]);
      expect(ids(decide("EASY", "4♦ 4♣ 9♣ 9♠ K♥ K♠", combo("5♦ 5♠"), { rng: steady }).decision.cards)).toEqual(["9♣", "9♠"]);
    });

    it("sometimes grabs any winning play, 2s and all", () => {
      // Under a quarter: it slips, and picks the last of the three that win.
      const rolls = [0.1, 0.99];
      const rng = () => rolls.shift();
      expect(ids(decide("EASY", "4♦ 9♣ K♠ 2♦", combo("8♠"), { rng }).decision.cards)).toEqual(["2♦"]);
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

    it("keeps aces and 2s back while it holds more than 7 cards", () => {
      expect(decide("MEDIUM", "3♦ 4♣ 6♥ 7♠ 9♦ J♣ A♦ 2♠", combo("K♠")).decision.action).toBe("pass");
      expect(ids(decide("MEDIUM", "3♦ 4♣ 6♥ 7♠ A♦ 2♠", combo("K♠")).decision.cards)).toEqual(["A♦"]);
    });

    it("would rather break a pair than sit on its cards", () => {
      // Only the 10s beat the 9: it splits them, big hand or not.
      expect(ids(decide("MEDIUM", "3♦ 4♣ 6♥ 6♠ 8♦ 8♣ 10♥ 10♠", combo("9♠")).decision.cards)).toEqual(["10♥"]);
    });

    describe("spends aces and 2s to stop an opponent close to going out", () => {
      const hand = "3♦ 4♣ 6♥ 7♠ 9♦ J♣ A♦ 2♠";
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
