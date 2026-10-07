import { describe, it, expect } from "vitest";
import { COPIES } from "../helpers/cards.js";

describe.each(COPIES)("constants (%s)", (_name, { constants: C }) => {
  it("orders ranks 3 low to 2 high", () => {
    expect(C.RANKS).toEqual(["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"]);
    C.RANKS.forEach((r, i) => expect(C.RANK_VALUES[r]).toBe(i));
  });

  it("orders suits diamonds < clubs < hearts < spades", () => {
    expect(C.SUITS).toEqual(["♦", "♣", "♥", "♠"]);
    expect(C.SUIT_VALUES["♦"]).toBeLessThan(C.SUIT_VALUES["♣"]);
    expect(C.SUIT_VALUES["♣"]).toBeLessThan(C.SUIT_VALUES["♥"]);
    expect(C.SUIT_VALUES["♥"]).toBeLessThan(C.SUIT_VALUES["♠"]);
  });

  it("names bots after the solar system, Saturn and Venus first, never repeating", () => {
    expect(C.BOT_NAMES.slice(0, 2)).toEqual(["Bot Saturn", "Bot Venus"]);
    expect(new Set(C.BOT_NAMES).size).toBe(C.BOT_NAMES.length);
    C.BOT_NAMES.forEach((name) => expect(name).toMatch(/^Bot [A-Z][a-z]+$/));
    // Muushig seats four bots, the most of any game.
    expect(C.BOT_NAMES.length).toBeGreaterThanOrEqual(4);
  });

  it("uses the rulebook's scoring thresholds", () => {
    expect(C.GAME_SETTINGS.ELIMINATION_SCORE).toBe(30);
    expect(C.GAME_SETTINGS.PENALTY_THRESHOLD).toBe(10);
    expect(C.GAME_SETTINGS.NUM_PLAYERS).toBe(4);
    expect(C.GAME_SETTINGS.CARDS_PER_PLAYER).toBe(13);
  });

  it("ranks 5-card hands straight < flush < full house < straight flush < royal flush", () => {
    const T = C.COMBO_TYPES;
    const order = [T.STRAIGHT, T.FLUSH, T.FULL_HOUSE, T.STRAIGHT_FLUSH, T.ROYAL_FLUSH];
    const strengths = order.map((t) => C.POKER_COMBO_STRENGTH[t]);
    expect(strengths).toEqual([...strengths].sort((a, b) => a - b));
    expect(new Set(strengths).size).toBe(5);
  });

  it("names every combination type", () => {
    Object.values(C.COMBO_TYPES).forEach((t) => expect(C.COMBO_NAMES[t]).toBeTruthy());
  });
});

describe("client and server copies", () => {
  const [[, client], [, server]] = COPIES;
  it.each(["constants", "evaluator", "logic", "ai"])("%s exports the same names", (mod) => {
    expect(Object.keys(server[mod]).sort()).toEqual(Object.keys(client[mod]).sort());
  });

  it("deckUtils differs only by the client-side sortHandBySuit", () => {
    const extra = Object.keys(client.deck).filter((k) => !(k in server.deck));
    expect(extra).toEqual(["sortHandBySuit"]);
  });
});
