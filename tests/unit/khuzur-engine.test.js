// Khuzur engine: every rule in docs/khuzur-rulebook.md, move by move.

import { describe, it, expect } from "vitest";
import { createDeck } from "../../src/utils/khuzur/cards.js";
import { PHASES, createMatch, deal, drawForDeal, isValidTable, leadLimit, seatCount } from "../../src/utils/khuzur/engine.js";
import { seededRandom } from "../helpers/cards.js";
import { c, cs, idsOf } from "../helpers/khuzur.js";

const playersFor = (n) => Array.from({ length: n }, (_, i) => ({ name: i ? `Bot ${i}` : "You", type: i ? "AI" : "HUMAN" }));
const newMatch = (table, seed = 1) => createMatch({ players: playersFor(seatCount(table)), table, rng: seededRandom(seed) });
const T2v2 = { perTeam: 2, teams: 2, handSize: 5 };

/** A match waiting on its draw, the pile stacked top first and drawing in seat order. */
function drawState(table, pile) {
  const s = newMatch(table);
  const order = Array.from({ length: seatCount(table) }, (_, i) => i);
  return { ...s, dealDeck: cs(pile), drawers: order, turn: 0 };
}
const drawTop = (s) => drawForDeal(s, s.turn, 1, seededRandom(9));

describe("table shapes", () => {
  it.each([
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
    [1, 6],
    [2, 2],
    [2, 3],
    [3, 2],
  ])("%i per team × %i teams is a table", (perTeam, teams) => {
    expect(isValidTable({ perTeam, teams })).toBe(true);
  });

  it.each([
    [1, 1],
    [1, 7],
    [2, 4],
    [3, 3],
    [4, 1],
  ])("%i per team × %i teams is not", (perTeam, teams) => {
    expect(isValidTable({ perTeam, teams })).toBe(false);
  });

  it("needs one player per seat", () => {
    expect(() => createMatch({ players: playersFor(3), table: T2v2 })).toThrow();
  });

  it("rejects a hand size that isn't 5 or 7", () => {
    expect(() => createMatch({ players: playersFor(4), table: { ...T2v2, handSize: 6 } })).toThrow();
  });

  it("seats the teams alternately", () => {
    const s = newMatch({ perTeam: 2, teams: 3, handSize: 5 });
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(s.places).toEqual([null, null, null]);
  });

  it("in a free for all every player is their own team", () => {
    const s = newMatch({ perTeam: 1, teams: 5, handSize: 5 });
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 2, 3, 4]);
  });

  it("opens with the draw for the deal", () => {
    const s = newMatch(T2v2);
    expect(s.phase).toBe(PHASES.DRAW);
    expect(s.dealDeck).toHaveLength(34);
    expect(s.drawers).toHaveLength(4);
    expect(s.turn).toBe(s.drawers[0]);
  });
});

describe("the draw for the deal", () => {
  it("the highest card deals, and the player on the dealer's left leads", () => {
    let s = drawState(T2v2, "8♦ 9♣ A♠ K♠ 7♦ 7♣");
    for (let i = 0; i < 4; i++) s = drawTop(s);
    expect(s.phase).toBe(PHASES.PLAY);
    expect(s.dealer).toBe(2);
    expect(s.turn).toBe(3);
    expect(s.teamDealers).toEqual({ 0: 2 });
  });

  it("ranks by suit at the same rank, with no trump", () => {
    let s = drawState(T2v2, "9♥ 9♠ 9♣ 9♦");
    for (let i = 0; i < 4; i++) s = drawTop(s);
    expect(s.dealer).toBe(1);
  });

  it("refuses a draw out of turn or too deep", () => {
    const s = drawState(T2v2, "8♦ 9♣ A♠ K♠ 7♦ 7♣");
    expect(() => drawForDeal(s, 1, 1)).toThrow("Not your turn");
    expect(() => drawForDeal(s, 0, 7)).toThrow();
    expect(() => drawForDeal(s, 0, 0)).toThrow();
  });

  it("tied twins draw again, and only they do", () => {
    let s = drawState({ ...T2v2, handSize: 7 }, "A♠ A♠:2 8♦ 9♦ K♠ Q♠ 7♣");
    for (let i = 0; i < 4; i++) s = drawTop(s);
    expect(s.phase).toBe(PHASES.DRAW);
    expect(s.drawers).toEqual([0, 1]);
    expect(s.turn).toBe(0);
    s = drawTop(s);
    s = drawTop(s);
    expect(s.phase).toBe(PHASES.PLAY);
    expect(s.dealer).toBe(0);
  });
});

describe("the deal", () => {
  const dealt = (table, dealer, deck) => deal(newMatch(table), dealer, seededRandom(5), deck);

  it("deals one card at a time, starting on the dealer's left", () => {
    const deck = createDeck(5);
    const s = dealt(T2v2, 1, deck);
    expect(s.players[2].hand[0].id).toBe(deck[0].id);
    expect(s.players[3].hand[0].id).toBe(deck[1].id);
    expect(s.players[0].hand[0].id).toBe(deck[2].id);
    expect(s.players[1].hand[0].id).toBe(deck[3].id);
    expect(s.players[2].hand[1].id).toBe(deck[4].id);
    expect(s.trumpCard.id).toBe(deck[20].id);
    expect(s.trumpSuit).toBe(deck[20].suit);
    expect(s.turn).toBe(2);
    expect(s.phase).toBe(PHASES.PLAY);
    expect(s.stack).toBeNull();
  });

  it.each([
    [{ perTeam: 1, teams: 2, handSize: 5 }, 23],
    [{ perTeam: 1, teams: 6, handSize: 5 }, 3],
    [{ perTeam: 1, teams: 2, handSize: 7 }, 51],
    [{ perTeam: 2, teams: 3, handSize: 7 }, 23],
  ])("%o leaves %i cards to draw besides the trump", (table, left) => {
    const s = deal(newMatch(table), 0, seededRandom(4));
    expect(s.drawPile).toHaveLength(left);
    for (const p of s.players) expect(p.hand).toHaveLength(table.handSize);
    const all = [...s.players.flatMap((p) => p.hand), ...s.drawPile, s.trumpCard];
    expect(new Set(idsOf(all)).size).toBe(createDeck(table.handSize).length);
  });

  /** A 5-card deck with `ids` placed right after the cards dealt to `n` players. */
  function deckWithAfterDeal(n, ids) {
    const rest = createDeck(5).filter((x) => !ids.includes(x.id));
    return [...rest.slice(0, n * 5), ...cs(ids.join(" ")), ...rest.slice(n * 5)];
  }

  it("a joker turned as trump goes back into the middle of the pile", () => {
    const deck = deckWithAfterDeal(2, ["GJ", "9♣"]);
    const s = dealt({ perTeam: 1, teams: 2, handSize: 5 }, 0, deck);
    expect(s.trumpCard.id).toBe("9♣");
    const at = idsOf(s.drawPile).indexOf("GJ");
    expect(at).toBeGreaterThanOrEqual(5);
    expect(at).toBeLessThanOrEqual(18);
    expect(s.drawPile).toHaveLength(23);
    expect(s.events.filter((e) => e.type === "jokerReturned")).toHaveLength(1);
  });

  it("two jokers in a row both go back", () => {
    const deck = deckWithAfterDeal(2, ["GJ", "CJ", "9♣"]);
    const s = dealt({ perTeam: 1, teams: 2, handSize: 5 }, 0, deck);
    expect(s.trumpCard.id).toBe("9♣");
    expect(idsOf(s.drawPile)).toEqual(expect.arrayContaining(["GJ", "CJ"]));
    expect(s.events.filter((e) => e.type === "jokerReturned")).toHaveLength(2);
  });

  it("works with only 4 cards left at a 6-player table", () => {
    const deck = deckWithAfterDeal(6, ["GJ", "9♣"]);
    const s = dealt({ perTeam: 1, teams: 6, handSize: 5 }, 0, deck);
    expect(s.trumpCard.id).toBe("9♣");
    expect(s.drawPile).toHaveLength(3);
    expect(idsOf(s.drawPile)).toContain("GJ");
  });
});

describe("leadLimit", () => {
  const withHands = (sizes, out = []) => {
    const s = deal(newMatch({ perTeam: 1, teams: sizes.length, handSize: 5 }), 0, seededRandom(2));
    const filler = createDeck(7);
    return {
      ...s,
      players: s.players.map((p, i) => ({ ...p, hand: filler.slice(i * 10, i * 10 + sizes[i]), out: out.includes(i) })),
    };
  };

  it("is the smallest hand at the table", () => {
    expect(leadLimit(withHands([5, 5, 2, 5]))).toBe(2);
  });

  it("counts the leader's own hand", () => {
    expect(leadLimit(withHands([1, 5, 5]))).toBe(1);
  });

  it("ignores players who are out", () => {
    expect(leadLimit(withHands([5, 0, 4], [1]))).toBe(4);
  });

  it("never passes the game's hand size", () => {
    expect(leadLimit(withHands([9, 9, 9]))).toBe(5);
  });
});
