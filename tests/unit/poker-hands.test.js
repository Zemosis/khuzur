import { describe, it, expect } from "vitest";
import { evaluate, createDeck } from "../../src/utils/poker/hands.js";
import { pc } from "../helpers/poker.js";

const best = (ids) => evaluate(pc(ids));
const beats = (a, b) => expect(best(a).score).toBeGreaterThan(best(b).score);
const ties = (a, b) => expect(best(a).score).toBe(best(b).score);

describe("poker hands", () => {
  it("a deck is 52 different cards, 2 to ace", () => {
    const deck = createDeck();
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    expect(Math.min(...deck.map((c) => c.value))).toBe(2);
    expect(Math.max(...deck.map((c) => c.value))).toBe(14);
  });

  it.each([
    ["A♠ K♠ Q♠ J♠ 10♠ 2♦ 3♣", "ROYAL FLUSH", "Royal flush"],
    ["8♣ 7♣ 6♣ 5♣ 4♣ 3♣ K♦", "STRAIGHT FLUSH", "Straight flush, eight high"],
    ["6♠ 6♦ 6♣ 6♥ A♦ 2♣ 3♣", "FOUR OF A KIND", "Four of a kind, sixes"],
    ["9♥ 9♦ 9♣ 4♠ 4♦ 4♣ 2♥", "FULL HOUSE", "Full house, nines over fours"],
    ["A♥ 3♥ 9♥ J♥ 2♥ 4♥ K♣", "FLUSH", "Flush, ace high"],
    ["5♠ 4♦ 3♣ 2♥ A♠ K♦ 9♣", "STRAIGHT", "Straight, five high"],
    ["7♠ 7♦ 7♣ K♥ 2♦", "THREE OF A KIND", "Three of a kind, sevens"],
    ["K♥ K♦ 5♣ 5♠ 2♦ 2♣ A♥", "TWO PAIR", "Two pair, kings and fives"],
    ["Q♥ Q♦", "PAIR", "Pair of queens"],
    ["7♠ 2♦", "HIGH CARD", "High card, seven"],
  ])("%s is %s", (ids, label, name) => {
    const e = best(ids);
    expect(e.label).toBe(label);
    expect(e.name).toBe(name);
    expect(e.cards.length).toBe(Math.min(5, ids.split(" ").length));
  });

  it("names the five cards that make the hand", () => {
    expect(best("K♥ K♦ 5♣ 5♠ 2♦ 2♣ A♥").cards.map((c) => c.id)).toEqual(["K♥", "K♦", "5♣", "5♠", "A♥"]);
    expect(best("5♠ 4♦ 3♣ 2♥ A♠ K♦ 9♣").cards.map((c) => c.id)).toEqual(["5♠", "4♦", "3♣", "2♥", "A♠"]);
  });

  it("ranks the categories in order", () => {
    const ladder = [
      "7♠ 2♦ 9♣ J♥ K♦",
      "7♠ 7♦ 9♣ J♥ K♦",
      "7♠ 7♦ 9♣ 9♥ K♦",
      "7♠ 7♦ 7♣ 9♥ K♦",
      "5♠ 6♦ 7♣ 8♥ 9♦",
      "2♥ 6♥ 7♥ 9♥ K♥",
      "7♠ 7♦ 7♣ 9♥ 9♦",
      "7♠ 7♦ 7♣ 7♥ K♦",
      "5♣ 6♣ 7♣ 8♣ 9♣",
    ];
    for (let i = 1; i < ladder.length; i++) beats(ladder[i], ladder[i - 1]);
  });

  it("breaks ties on kickers, never on suits", () => {
    beats("A♠ A♦ K♣ Q♣ J♦", "A♥ A♣ K♦ Q♦ 10♠");
    beats("K♠ K♦ 4♣ 4♦ A♠", "K♥ K♣ 4♥ 4♠ Q♦");
    ties("A♠ K♦ 9♣ 7♥ 3♦", "A♥ K♣ 9♦ 7♠ 3♣");
    beats("6♠ 5♦ 4♣ 3♥ 2♠", "5♠ 4♦ 3♣ 2♥ A♠"); // the wheel is the lowest straight
  });

  it("only the best five count: a sixth card can't break a tie", () => {
    ties("A♠ A♦ K♣ Q♣ J♦ 3♠ 2♠", "A♥ A♣ K♦ Q♦ J♠ 4♠ 2♥");
  });
});
