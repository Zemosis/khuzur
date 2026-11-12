// Khuzur cards: the card order, valid leads and covering a layer
// (docs/khuzur-rulebook.md §1, §5, §6).

import { describe, it, expect } from "vitest";
import { beats, cardPower, coverAssignment, createDeck, isValidLead } from "../../src/utils/khuzur/cards.js";
import { c, cs, idsOf } from "../helpers/khuzur.js";

describe("createDeck", () => {
  it("the 5-card game uses one deck of 34 cards", () => {
    const deck = createDeck(5);
    expect(deck).toHaveLength(34);
    expect(new Set(idsOf(deck)).size).toBe(34);
    expect(idsOf(deck)).toEqual(expect.arrayContaining(["GJ", "CJ", "7♦", "A♠"]));
  });

  it("the 7-card game uses two decks, 66 cards, with one gray and one colored joker", () => {
    const deck = createDeck(7);
    expect(deck).toHaveLength(66);
    expect(new Set(idsOf(deck)).size).toBe(66);
    expect(deck.filter((x) => x.id === "GJ")).toHaveLength(1);
    expect(deck.filter((x) => x.id === "CJ")).toHaveLength(1);
    const jacks = deck.filter((x) => x.rank === "J" && x.suit === "♠");
    expect(idsOf(jacks).sort()).toEqual(["J♠", "J♠:2"]);
  });

  it("rejects other hand sizes", () => {
    expect(() => createDeck(6)).toThrow();
  });
});

describe("beating (trump ♥)", () => {
  const T = "♥";
  it.each([
    ["9♠", "8♠", true], // a higher card of the same suit
    ["8♦", "7♠", false], // a higher rank of another suit doesn't beat
    ["9♠", "9♣", false], // nor does the same rank in another suit
    ["A♣", "7♦", false],
    ["7♠", "8♠", false],
    ["7♥", "A♠", true], // any trump beats any plain card
    ["8♥", "7♥", true], // a trump only by a higher trump
    ["7♥", "8♥", false],
    ["A♠", "7♥", false],
    ["GJ", "A♥", true], // the gray joker beats every trump
    ["GJ", "7♣", true],
    ["CJ", "GJ", true],
    ["GJ", "CJ", false],
    ["A♥", "GJ", false],
    ["A♠", "GJ", false],
    ["J♠:2", "J♠", false], // twins can't beat each other
    ["8♥:2", "8♥", false],
  ])("%s beats %s: %s", (a, b, expected) => {
    expect(beats(c(a), c(b), T)).toBe(expected);
  });

  it("ranks plain cards, then trumps, then the gray and colored joker in one line (sorting, the draw for the deal)", () => {
    expect(cardPower(c("7♦"), T)).toBe(0);
    expect(cardPower(c("A♠"), T)).toBe(31);
    expect(cardPower(c("7♥"), T)).toBe(32);
    expect(cardPower(c("A♥"), T)).toBe(39);
    expect(cardPower(c("GJ"), T)).toBe(40);
    expect(cardPower(c("CJ"), T)).toBe(41);
  });

  it("with no trump, hearts are a plain suit", () => {
    expect(cardPower(c("7♥"), null)).toBe(2);
  });
});

describe("isValidLead", () => {
  it.each([
    "J♠",
    "GJ",
    "J♠ J♦ 9♣",
    "J♠ J♦ J♣",
    "J♠ J♦ Q♣ Q♥ 9♣",
    "J♠ J♦ J♣ J♥ 9♣",
    "J♠ J♦ J♣ Q♣ Q♥",
    "J♠ J♦ Q♣ Q♥ K♠ K♦ 9♣",
    "J♠ J♦ J♣ Q♣ Q♥ Q♠ 9♣",
    "J♠ J♦ J♣ J♥ Q♣ Q♥ Q♠",
    "J♠ J♦ GJ",
    "J♠ J♠:2 9♣",
  ])("%s is valid", (ids) => {
    expect(isValidLead(cs(ids))).toBe(true);
  });

  it.each([
    "",
    "J♠ Q♦",
    "J♠ J♦",
    "J♠ Q♦ 9♣",
    "J♠ J♦ J♣ Q♣ 9♣",
    "J♠ J♦ J♣ Q♣ Q♥ 9♣ 8♣",
    "GJ CJ J♠",
    "J♠ J♦ Q♣ Q♥",
    "J♠ J♦ Q♣ Q♥ K♠ K♦",
    "J♠ J♦ Q♣ Q♥ K♠ K♦ A♠ A♦ 9♣",
  ])("'%s' is not valid", (ids) => {
    expect(isValidLead(cs(ids))).toBe(false);
  });
});

describe("coverAssignment", () => {
  it("returns the cards in the layer's column order", () => {
    expect(idsOf(coverAssignment(cs("9♣ K♠"), cs("A♠ 10♣"), "♥"))).toEqual(["10♣", "A♠"]);
  });

  it("finds a cover whatever order the cards are picked in", () => {
    expect(idsOf(coverAssignment(cs("K♠ 9♣ 7♥"), cs("8♥ A♠ 10♣"), "♥"))).toEqual(["A♠", "10♣", "8♥"]);
  });

  it("keeps the order given when it already beats", () => {
    expect(idsOf(coverAssignment(cs("9♣ K♠"), cs("7♥ A♠"), "♥"))).toEqual(["7♥", "A♠"]);
  });

  it("pairs by suit: a trump goes where no plain card can", () => {
    expect(idsOf(coverAssignment(cs("9♣ 10♦"), cs("8♥ J♣"), "♥"))).toEqual(["J♣", "8♥"]);
  });

  it("is null when the counts differ", () => {
    expect(coverAssignment(cs("9♣ K♠"), cs("A♠"), "♥")).toBeNull();
  });

  it("is null when a card can't be covered", () => {
    expect(coverAssignment(cs("K♠"), cs("K♠:2"), "♥")).toBeNull();
    expect(coverAssignment(cs("9♣ K♠"), cs("10♣ Q♠"), "♥")).toBeNull();
    expect(coverAssignment(cs("CJ"), cs("GJ"), "♥")).toBeNull();
    expect(coverAssignment(cs("9♣"), cs("10♦"), "♥")).toBeNull();
  });
});
