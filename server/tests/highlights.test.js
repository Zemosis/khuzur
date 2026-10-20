// A round's key moments, as recorded for the match page.

import { describe, it, expect } from "vitest";
import { thirteenHighlights, muushigHighlights } from "../game/highlights.js";

const card = (rank, suit, id = `${rank}${suit}`) => ({ rank, suit, id });
const play = (playerIndex, type, cards) => ({ type: "PLAY", playerIndex, cards, combination: { type, cards } });
const pass = (playerIndex) => ({ type: "PASS", playerIndex });

describe("thirteenHighlights", () => {
  it("records the round-winning play last, with its cards and hand type", () => {
    const history = [
      play(0, "SINGLE", [card("3", "♠")]),
      pass(1),
      play(2, "PAIR", [card("9", "♥"), card("9", "♦")]),
      { type: "ROUND_END", winnerIndex: 2 },
    ];
    expect(thirteenHighlights(history)).toEqual([
      { type: "win", seat: 2, combo: "PAIR", cards: [{ rank: "9", suit: "♥" }, { rank: "9", suit: "♦" }] },
    ]);
  });

  it("keeps big plays and 2s played as singles, in order, and nothing else", () => {
    const quads = ["♠", "♣", "♦", "♥"].map((s) => card("7", s));
    const history = [
      play(1, "SINGLE", [card("2", "♥")]),
      play(2, "FOUR_OF_A_KIND", quads),
      play(3, "STRAIGHT", ["3", "4", "5", "6", "7"].map((r) => card(r, "♠"))),
      play(0, "PAIR", [card("2", "♠"), card("2", "♣")]),
      play(0, "SINGLE", [card("5", "♦")]),
      { type: "ROUND_END", winnerIndex: 0 },
    ];
    expect(thirteenHighlights(history).map((h) => [h.type, h.seat, h.combo])).toEqual([
      ["two", 1, "SINGLE"],
      ["big", 2, "FOUR_OF_A_KIND"],
      ["win", 0, "SINGLE"],
    ]);
  });

  it("a big play that ends the round is recorded once, as the win", () => {
    const flush = ["3", "4", "5", "6", "7"].map((r) => card(r, "♥"));
    const history = [play(1, "STRAIGHT_FLUSH", flush), { type: "ROUND_END", winnerIndex: 1 }];
    expect(thirteenHighlights(history)).toEqual([
      { type: "win", seat: 1, combo: "STRAIGHT_FLUSH", cards: flush.map(({ rank, suit }) => ({ rank, suit })) },
    ]);
  });

  it("only looks at the round that just ended, not the ones before it", () => {
    const history = [
      play(1, "FOUR_OF_A_KIND", ["♠", "♣", "♦", "♥"].map((s) => card("K", s))),
      { type: "ROUND_END", winnerIndex: 1 },
      { type: "NEW_ROUND", roundNumber: 2, dealer: 0 },
      play(3, "SINGLE", [card("A", "♠")]),
      { type: "ROUND_END", winnerIndex: 3 },
    ];
    expect(thirteenHighlights(history)).toEqual([{ type: "win", seat: 3, combo: "SINGLE", cards: [{ rank: "A", suit: "♠" }] }]);
  });
});

describe("muushigHighlights", () => {
  const roundOne = [
    { type: "firstDealer", seat: 0, card: card("K", "♠") },
    { type: "playIn", seat: 1 },
    { type: "fold", seat: 2 },
    { type: "takeTrump", seat: 0, card: card("9", "♦") },
    { type: "swap", seat: 1, count: 2 },
    { type: "play", seat: 1, card: card("10", "♣"), trick: 1 },
    { type: "play", seat: 0, card: card("A", "♣"), trick: 1 },
    { type: "eat", seat: 0, trick: 1, cards: [card("10", "♣"), card("A", "♣")] },
    { type: "roundEnd", round: 1, results: [], roundWinner: 0 },
  ];

  it("records decisions, the dealer's trump and who ate each trick with which card", () => {
    expect(muushigHighlights(roundOne)).toEqual([
      { type: "in", seat: 1 },
      { type: "fold", seat: 2 },
      { type: "takeTrump", seat: 0, card: { rank: "9", suit: "♦" } },
      { type: "eat", seat: 0, trick: 1, card: { rank: "A", suit: "♣" } },
    ]);
  });

  it("only looks at the round that just ended", () => {
    const roundTwo = [
      { type: "keepTrump", seat: 1 },
      { type: "play", seat: 2, card: card("Q", "♥"), trick: 1 },
      { type: "eat", seat: 2, trick: 1, cards: [card("Q", "♥")] },
      { type: "roundEnd", round: 2, results: [], roundWinner: 2 },
    ];
    expect(muushigHighlights([...roundOne, ...roundTwo])).toEqual([
      { type: "keepTrump", seat: 1 },
      { type: "eat", seat: 2, trick: 1, card: { rank: "Q", suit: "♥" } },
    ]);
  });
});
