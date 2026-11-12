// Khuzur CPU: its building blocks and the choices the spec pins
// (docs/superpowers/specs/2026-11-05-khuzur-design.md, "The CPU").

import { describe, it, expect } from "vitest";
import { aiAction, applyAction, cheapestCover, cheapestLead } from "../../src/utils/khuzur/ai.js";
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

  it("follows suit where it can and spends a trump only where it must", () => {
    expect(idsOf(cheapestCover(cs("9♣ 10♦"), cs("8♥ J♣ Q♦ A♥"), "♥"))).toEqual(["J♣", "Q♦"]);
    expect(idsOf(cheapestCover(cs("9♣ 10♦"), cs("8♥ J♣ 9♦ A♥"), "♥"))).toEqual(["J♣", "8♥"]);
  });

  it("finds a cover the greedy pick would miss", () => {
    // 7♥ is the cheapest answer to both; it must go on K♠, the card only a trump beats.
    expect(idsOf(cheapestCover(cs("8♣ K♠"), cs("7♥ 9♣"), "♥"))).toEqual(["9♣", "7♥"]);
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

  it("breaks a stall where nobody can beat the big leads by leading a single", () => {
    // Found by the whole-branch review: 3-player free for all, the pile at 8, every
    // player over the hand size leading 5-card plain leads nobody can cover.
    const s0 = playState({
      hands: ["9♦ 10♥ 8♣ Q♦ K♠ K♦ K♣ A♦ A♣ 7♠", "8♦ CJ GJ 9♣ Q♥ 10♦ 10♠ J♣ J♠ 7♣", "K♥ 9♠ 8♠ 8♥ A♠"],
      trumpCard: "7♥",
      pile: "7♦ 8♦:2 9♣:2 J♦ Q♣ Q♠ 10♣ 9♥",
    });
    const s = { ...s0, events: [{ type: "pickUp", seat: 1, count: 5 }, { type: "lead", seat: 2, cards: [] }, { type: "pickUp", seat: 2, count: 5 }] };
    const action = aiAction(s, seededRandom(1));
    expect(action.type).toBe("lead");
    expect(action.cardIds).toHaveLength(1);
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

describe("levels", () => {
  const withLevel = (s, level) => ({ ...s, players: s.players.map((p) => ({ ...p, level })) });

  it("createMatch keeps each player's level", () => {
    const s = createMatch({ players: [{ name: "A", type: "AI", level: "EASY" }, { name: "B", type: "AI", level: "HARD" }], table: { perTeam: 1, teams: 2, handSize: 5 } });
    expect(s.players.map((p) => p.level)).toEqual(["EASY", "HARD"]);
  });

  it("EASY sometimes picks up a stack it could beat", () => {
    const s = withLevel(lead(playState({ hands: ["9♣ 8♦ 7♦ 10♠ J♠", "K♣ 7♣ 8♣ 7♠ 8♠"] }), 0, ["9♣"]), "EASY");
    const types = new Set(Array.from({ length: 40 }, (_, i) => aiAction(s, seededRandom(i + 1)).type));
    expect(types).toEqual(new Set(["beat", "pickUp"]));
  });

  it("HARD answers with a legal move", () => {
    const s = withLevel(playState({ hands: ["9♣ 9♦ K♠ K♦ 8♥", "8♠ 9♠ 10♦ 7♠ Q♠"], pile: "J♥ 10♥ 9♥ Q♦ Q♣" }), "HARD");
    const action = aiAction(s, seededRandom(4));
    expect(action.type).toBe("lead");
    expect(() => applyAction(s, action)).not.toThrow();
  });

  it("HARD never reads other hands: moving the unseen cards around gives the same answer", () => {
    const a = withLevel(playState({ hands: ["9♣ 9♦ K♠ K♦ 8♥", "8♠ 9♠ 10♦ 7♠ Q♠", "A♠ A♦ J♣ J♦ 10♣"], pile: "J♥ 10♥ 9♥ Q♦ Q♣", table: { perTeam: 1, teams: 3, handSize: 5 } }), "HARD");
    // Same unseen cards, dealt differently between the other hands and the pile.
    const unseen = [...a.players[1].hand, ...a.players[2].hand, ...a.drawPile].reverse();
    const b = {
      ...a,
      players: a.players.map((p, i) => (i === 0 ? p : { ...p, hand: unseen.slice((i - 1) * 5, i * 5) })),
      drawPile: unseen.slice(10),
    };
    expect(aiAction(b, seededRandom(7))).toEqual(aiAction(a, seededRandom(7)));
  });
});
