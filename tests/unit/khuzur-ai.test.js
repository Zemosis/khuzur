// Khuzur CPU: its building blocks and the choices the spec pins
// (docs/superpowers/specs/2026-11-05-khuzur-design.md, "The CPU").

import { describe, it, expect } from "vitest";
import { aiAction, cheapestCover, cheapestLead } from "../../src/utils/khuzur/ai.js";
import { createMatch, deal, lead, PHASES } from "../../src/utils/khuzur/engine.js";
import { seededRandom } from "../helpers/cards.js";
import { c, cs, idsOf } from "../helpers/khuzur.js";

const sorted = (cards) => idsOf(cards).sort();

function playState({ hands, trump = "♥", trumpCard = "A♥", pile = "J♣ J♥ 10♥ 9♥ K♠", turn = 0, table = { perTeam: 1, teams: hands.length, handSize: 5 } }) {
  const players = hands.map((_, i) => ({ name: `P${i}`, type: "AI" }));
  const s = deal(createMatch({ players, table, rng: seededRandom(1) }), 0, seededRandom(1));
  return {
    ...s,
    players: s.players.map((p, i) => ({ ...p, hand: cs(hands[i]) })),
    trumpSuit: trump,
    trumpCard: trumpCard ? c(trumpCard) : null,
    drawPile: cs(pile),
    turn,
    events: [],
  };
}

describe("cheapestLead", () => {
  it("builds pairs from the lowest ranks, plus the cheapest card left as the lonely one", () => {
    expect(sorted(cheapestLead(cs("9♣ 9♦ K♠ K♦ A♥ 7♣"), 5, "♥"))).toEqual(["9♣", "9♦", "K♠", "K♦", "7♣"].sort());
  });

  it("a single is the cheapest card", () => {
    expect(idsOf(cheapestLead(cs("9♣ 7♥ K♠"), 1, "♥"))).toEqual(["9♣"]);
  });

  it("is null when there aren't enough pairs", () => {
    expect(cheapestLead(cs("9♣ 9♦ K♠ A♥ 7♣"), 5, "♥")).toBeNull();
    expect(cheapestLead(cs("9♣ 9♦"), 3, "♥")).toBeNull();
  });
});

describe("cheapestCover", () => {
  it("covers each card with the lowest card that holds, keeping trumps", () => {
    expect(idsOf(cheapestCover(cs("9♣ K♠"), cs("A♠ 10♣ 7♥"), "♥"))).toEqual(["10♣", "A♠"]);
  });

  it("is null when the layer can't be covered", () => {
    expect(cheapestCover(cs("9♣ K♠"), cs("10♣ Q♠"), "♥")).toBeNull();
  });
});

describe("aiAction", () => {
  it("goes out when the whole hand is a valid lead", () => {
    const s = playState({ hands: ["J♠ J♦ 9♣", "8♣ 9♦ 10♦ 7♠ Q♠"], pile: "", trumpCard: null });
    expect(aiAction(s, seededRandom(1))).toMatchObject({ type: "lead", seat: 0 });
    expect(aiAction(s, seededRandom(1)).cardIds.sort()).toEqual(["J♠", "J♦", "9♣"].sort());
  });

  it("swaps the trump 7 on its turn", () => {
    const s = playState({ hands: ["7♥ J♦ 9♣ 8♦ 8♣", "8♠ 9♦ 10♦ 7♠ Q♠"] });
    expect(aiAction(s, seededRandom(1))).toEqual({ type: "swapSeven", seat: 0 });
  });

  it("while the pile has cards, it leads big with plain cards and keeps trumps", () => {
    const s = playState({ hands: ["9♣ 9♦ K♠ K♦ A♥", "8♠ 9♠ 10♦ 7♠ Q♠"] });
    const action = aiAction(s, seededRandom(1));
    expect(action.type).toBe("lead");
    expect(action.cardIds).toHaveLength(3);
    expect(action.cardIds).not.toContain("A♥");
  });

  it("picks up rather than spend a joker while the pile has cards", () => {
    const s = lead(playState({ hands: ["9♣ 8♦ 7♦ 10♠ J♠", "GJ 7♣ 8♣ 7♠ 8♠"] }), 0, ["9♣"]);
    expect(aiAction(s, seededRandom(1))).toEqual({ type: "pickUp", seat: 1 });
  });

  it("beats with the joker once the pile is dry", () => {
    const s = lead(playState({ hands: ["9♣ 8♦ 7♦ 10♠ J♠", "GJ 7♣ 8♣ 7♠ 8♠"], pile: "", trumpCard: null }), 0, ["9♣"]);
    expect(aiAction(s, seededRandom(1))).toEqual({ type: "beat", seat: 1, cardIds: ["GJ"] });
  });

  it("stops picking up by choice once the table is stalling (two pick-ups with no draw between)", () => {
    const s0 = lead(playState({ hands: ["9♣ 8♦ 7♦ 10♠ J♠", "GJ 7♣ 8♣ 7♠ 8♠"] }), 0, ["9♣"]);
    const s = { ...s0, events: [...s0.events, { type: "pickUp", seat: 1, count: 3 }, { type: "lead", seat: 0, cards: [] }, { type: "pickUp", seat: 1, count: 3 }] };
    expect(aiAction(s, seededRandom(1))).toEqual({ type: "beat", seat: 1, cardIds: ["GJ"] });
  });

  it("never sees other players' cards", () => {
    const a = playState({ hands: ["9♣ 9♦ K♠ K♦ 8♥", "8♠ 9♠ 10♦ 7♠ Q♠", "A♠ A♦ J♣ J♦ 10♣"], table: { perTeam: 1, teams: 3, handSize: 5 } });
    const b = { ...a, players: a.players.map((p, i) => (i === 0 ? p : { ...p, hand: cs(i === 1 ? "CJ GJ A♥ K♥ Q♥" : "7♣ 7♦ 8♣ 8♦ 9♥") })) };
    expect(aiAction(a, seededRandom(1))).toEqual(aiAction(b, seededRandom(1)));
  });

  it("draws for the deal at a depth it may draw", () => {
    const s = createMatch({ players: [{ name: "A" }, { name: "B" }], table: { perTeam: 1, teams: 2, handSize: 5 }, rng: seededRandom(2) });
    expect(s.phase).toBe(PHASES.DRAW);
    const action = aiAction(s, seededRandom(3));
    expect(action.type).toBe("drawForDeal");
    expect(action.depth).toBeGreaterThanOrEqual(1);
    expect(action.depth).toBeLessThanOrEqual(10);
  });
});
