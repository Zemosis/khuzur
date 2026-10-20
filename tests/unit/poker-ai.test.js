import { describe, it, expect } from "vitest";
import { chenScore, chooseAction, equity, madeStrength, position, updateReads } from "../../src/utils/poker/ai.js";
import { act, viewFor } from "../../src/utils/poker/engine.js";
import { tableWith, dealt, pc, seededRandom } from "../helpers/poker.js";

// Six players, button on seat 0: 1 and 2 post the blinds, 3 acts first.
const six = (holes, board) => dealt(tableWith([1000, 1000, 1000, 1000, 1000, 1000]), { button: 0, holes, board });

describe("poker CPU", () => {
  it("scores starting hands with the Chen formula", () => {
    expect(chenScore(pc("A♠ A♦"))).toBe(20);
    expect(chenScore(pc("K♠ K♦"))).toBe(16);
    expect(chenScore(pc("A♠ K♠"))).toBe(12);
    expect(chenScore(pc("7♠ 2♦"))).toBe(-1);
  });

  it("knows where each seat acts from", () => {
    const v = viewFor(six(), 3);
    expect([1, 2, 3, 4, 5, 0].map((seat) => position(v, seat))).toEqual(["blind", "blind", "early", "middle", "late", "late"]);
  });

  it("MEDIUM raises aces and folds seven-deuce first to act", () => {
    const aces = six({ 3: "A♠ A♦" });
    expect(chooseAction(viewFor(aces, 3), 3, "MEDIUM", seededRandom(1))).toEqual({ type: "raise", amount: 30 });
    const junk = six({ 3: "7♠ 2♦" });
    expect(chooseAction(viewFor(junk, 3), 3, "MEDIUM", seededRandom(1))).toEqual({ type: "fold" });
  });

  it("rates top pair above a weaker pair, and a set above both", () => {
    expect(madeStrength(pc("A♠ K♦"), pc("K♣ 7♦ 2♥"))).toBe(0.65);
    expect(madeStrength(pc("A♠ 7♣"), pc("K♣ 7♦ 2♥"))).toBe(0.45);
    expect(madeStrength(pc("7♠ 7♣"), pc("K♣ 7♦ 2♥"))).toBe(0.85);
  });

  it("rates an overpair above top pair, and a draw above nothing", () => {
    expect(madeStrength(pc("Q♠ Q♣"), pc("J♣ 7♦ 2♥"))).toBe(0.75);
    expect(madeStrength(pc("9♥ 8♥"), pc("K♥ 4♥ 2♣"))).toBe(0.38);
    expect(madeStrength(pc("9♠ 8♦"), pc("K♥ 4♥ 2♣"))).toBe(0.12);
  });

  it("aces win about 85% heads-up", () => {
    expect(equity(pc("A♠ A♦"), [], 1, 2000, seededRandom(3))).toBeCloseTo(0.85, 1);
  });

  it("MEDIUM calls a small raise with A♠ Q♠ but folds it to an all-in", () => {
    const small = act(six({ 4: "A♠ Q♠" }), 3, { type: "raise", amount: 30 });
    expect(chooseAction(viewFor(small, 4), 4, "MEDIUM", seededRandom(1)).type).toBe("call");
    const shove = act(six({ 4: "A♠ Q♠" }), 3, { type: "allin" });
    expect(chooseAction(viewFor(shove, 4), 4, "MEDIUM", seededRandom(1)).type).toBe("fold");
  });

  it("HARD goes all-in or folds when its stack is short", () => {
    const short = (hole) => dealt(tableWith([1000, 1000, 1000, 100, 1000, 1000]), { button: 0, holes: { 3: hole } });
    expect(chooseAction(viewFor(short("A♠ K♦"), 3), 3, "HARD", seededRandom(1)).type).toBe("allin");
    expect(chooseAction(viewFor(short("7♠ 2♦"), 3), 3, "HARD", seededRandom(1)).type).toBe("fold");
  });

  it("HARD folds Q♠ J♦ to a raise from a player who seldom raises, and plays it against one who always does", () => {
    const read = (vpip, pfr, bets, calls) => [null, null, null, { name: "P3", hands: 40, vpip, pfr, bets, calls, faced: 10, folded: 3 }];
    const s = act(six({ 4: "Q♠ J♦" }), 3, { type: "raise", amount: 40 });
    for (let seed = 0; seed < 6; seed++) {
      expect(chooseAction(viewFor(s, 4), 4, "HARD", seededRandom(seed), read(5, 2, 4, 3)).type).toBe("fold");
      expect(chooseAction(viewFor(s, 4), 4, "HARD", seededRandom(seed), read(38, 36, 30, 5)).type).not.toBe("fold");
    }
  });

  it("keeps a read on each player from what they did in a hand", () => {
    let s = act(six(undefined, "2♣ 7♦ 9♥ J♠ 3♣"), 3, { type: "raise", amount: 40 });
    s = act(s, 4, { type: "call" });
    for (const seat of [5, 0, 1, 2]) s = act(s, seat, { type: "fold" });
    s = act(s, 3, { type: "raise", amount: 50 }); // the flop: seat 3 bets
    s = act(s, 4, { type: "fold" });
    const reads = updateReads([], s);
    expect(reads[3]).toEqual({ name: "P3", hands: 1, vpip: 1, pfr: 1, bets: 1, calls: 0, faced: 0, folded: 0 });
    expect(reads[4]).toEqual({ name: "P4", hands: 1, vpip: 1, pfr: 0, bets: 0, calls: 0, faced: 1, folded: 1 });
    expect(reads[1]).toMatchObject({ hands: 1, vpip: 0 }); // posting a blind isn't putting chips in by choice
    // Someone new in a seat starts a new read.
    const next = updateReads(reads, { ...s, seats: s.seats.map((p, i) => (i === 4 ? { ...p, name: "NEW", inHand: false } : p)) });
    expect(next[4]).toEqual({ name: "NEW", hands: 0, vpip: 0, pfr: 0, bets: 0, calls: 0, faced: 0, folded: 0 });
  });

  it("every level only makes legal moves", () => {
    for (const level of ["EASY", "MEDIUM", "HARD"]) {
      const rng = seededRandom(level.length);
      let s = six(undefined, "2♣ 7♦ 9♥ J♠ 3♣");
      for (let i = 0; i < 40 && s.phase === "BETTING"; i++) {
        s = act(s, s.turn, chooseAction(viewFor(s, s.turn), s.turn, level, rng)); // act throws on an illegal move
      }
    }
  });
});
