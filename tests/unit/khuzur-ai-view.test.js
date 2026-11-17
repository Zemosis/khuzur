// Khuzur CPU: what a seat remembers (aiView.js) and the deals HARD imagines
// for the cards it can't see (aiSearch.js). Nothing here may read a hidden card.

import { describe, it, expect } from "vitest";
import { aiAction, applyAction } from "../../src/utils/khuzur/ai.js";
import { readTable } from "../../src/utils/khuzur/aiView.js";
import { PICK_BY_CHOICE, dealWorld } from "../../src/utils/khuzur/aiSearch.js";
import { createDeck } from "../../src/utils/khuzur/cards.js";
import { createMatch, deal, lead, pickUp, PHASES } from "../../src/utils/khuzur/engine.js";
import { seededRandom } from "../helpers/cards.js";
import { cs } from "../helpers/khuzur.js";

const ids = (cards) => cards.map((c) => c.id).sort();

/** A dealt match with the deck in the order given first (top first), the rest of the deck after. */
function dealtMatch({ table = { perTeam: 1, teams: 2, handSize: 5 }, top = "", rng = seededRandom(1) }) {
  const players = Array.from({ length: table.perTeam * table.teams }, (_, i) => ({ name: `P${i}`, type: "AI", level: "MEDIUM" }));
  const first = cs(top);
  const rest = createDeck(table.handSize).filter((c) => !first.some((f) => f.id === c.id));
  return deal(createMatch({ players, table, rng }), table.perTeam * table.teams - 1, rng, [...first, ...rest]);
}

/** Every PLAY state of a few seeded CPU matches. */
function* playedStates(table, seeds = 6) {
  for (let seed = 1; seed <= seeds; seed++) {
    const rng = seededRandom(seed);
    const players = Array.from({ length: table.perTeam * table.teams }, (_, i) => ({ name: `P${i}`, type: "AI", level: "MEDIUM" }));
    let s = createMatch({ players, table, rng });
    for (let i = 0; i < 2000 && s.phase !== PHASES.MATCH_OVER; i++) {
      if (s.phase === PHASES.PLAY) yield s;
      s = applyAction(s, aiAction(s, rng), rng);
    }
  }
}

describe("readTable", () => {
  it("remembers the cards a player picks up, until they play them", () => {
    // 2 players, dealer 1: seat 0 gets the 1st, 3rd, ... card.
    let s = dealtMatch({ top: "7♣ 8♦ 9♣ 8♠ 10♣ 9♠ J♣ 10♠ Q♣ 8♥ A♥" });
    expect(s.turn).toBe(0);
    s = lead(s, 0, ["7♣"]);
    s = pickUp(s, 1);
    expect(ids(readTable(s, 0).players[1].known)).toEqual(["7♣"]);
    s = lead(s, 0, ["9♣"]);
    s = pickUp(s, 1);
    expect(ids(readTable(s, 0).players[1].known)).toEqual(["7♣", "9♣"]);
    s = lead(s, 0, ["10♣"]);
    s = applyAction(s, { type: "beat", seat: 1, cardIds: ["8♥"] }, seededRandom(1)); // a card it was dealt: still unknown
    expect(ids(readTable(s, 0).players[1].known)).toEqual(["7♣", "9♣"]);
  });

  it("only ever claims a player holds cards they really hold, and counts every card", () => {
    for (const table of [
      { perTeam: 1, teams: 3, handSize: 5 },
      { perTeam: 2, teams: 2, handSize: 7 },
    ]) {
      for (const s of playedStates(table, 3)) {
        const view = readTable(s, s.turn);
        for (const p of view.players) {
          if (p.id === s.turn) continue;
          const real = new Set(s.players[p.id].hand.map((c) => c.id));
          expect(p.known.every((c) => real.has(c.id))).toBe(true);
        }
        const slots = view.players.reduce((n, p) => n + (p.id === s.turn ? 0 : p.unknown), 0) + view.pileCount + view.hidden;
        expect(slots).toBe(view.unseen.length);
      }
    }
  });

  it("never reads a hidden card: the same history with the unseen cards dealt differently gives the same view", () => {
    const s = dealtMatch({ table: { perTeam: 1, teams: 3, handSize: 5 } });
    const unseen = [...s.players[1].hand, ...s.players[2].hand, ...s.drawPile].reverse();
    const t = { ...s, players: s.players.map((p, i) => (i === 0 ? p : { ...p, hand: unseen.slice((i - 1) * 5, i * 5) })), drawPile: unseen.slice(10) };
    expect(readTable(t, 0)).toEqual(readTable(s, 0));
  });
});

describe("dealWorld", () => {
  it("deals every unseen card once, keeps the counts, the seat's own hand and every known card", () => {
    const rng = seededRandom(9);
    for (const table of [
      { perTeam: 1, teams: 2, handSize: 5 },
      { perTeam: 3, teams: 2, handSize: 7 },
    ]) {
      for (const s of playedStates(table, 2)) {
        const view = readTable(s, s.turn);
        const { state: w } = dealWorld(s, view, rng);
        expect(w.players[s.turn].hand).toBe(s.players[s.turn].hand);
        w.players.forEach((p, i) => expect(p.hand).toHaveLength(s.players[i].hand.length));
        expect(w.drawPile).toHaveLength(s.drawPile.length);
        const all = [...w.players.flatMap((p) => p.hand), ...w.drawPile, ...w.deadPile, ...(w.stack ? w.stack.layers.flat() : []), ...(w.trumpCard ? [w.trumpCard] : [])].map((c) => c.id);
        expect(new Set(all).size).toBe(all.length);
        for (const p of view.players) {
          if (p.id === s.turn) continue;
          const dealt = new Set(w.players[p.id].hand.map((c) => c.id));
          expect(p.known.every((c) => dealt.has(c.id))).toBe(true);
        }
      }
    }
  });

  it("weighs a world by Bayes' rule: one where the player could have beaten what they picked up counts less", () => {
    let s = dealtMatch({ top: "7♣ 8♦ 9♦ 8♠ 10♦ 9♠ J♦ 10♠ Q♦ J♠ A♥" });
    s = lead(s, 0, ["7♣"]);
    s = pickUp(s, 1);
    const view = readTable(s, 0);
    const rng = seededRandom(3);
    let light = 0;
    for (let k = 0; k < 200; k++) {
      const { state: w, weight } = dealWorld(s, view, rng);
      // Seat 1 hasn't drawn since: every hidden card it holds was there when it picked up.
      const couldBeat = w.players[1].hand.some((c) => c.id !== "7♣" && (c.suit === "♥" || c.rank === "JOKER" || (c.suit === "♣" && c.rankValue > 0)));
      expect(weight).toBe(couldBeat ? PICK_BY_CHOICE.pre : 1);
      if (couldBeat) light++;
    }
    expect(light).toBeGreaterThan(0);
  });

  it("puts a joker turned up at the deal back where the deal could have put it, never in the seat's own hand", () => {
    // 2 players, 5 cards: the 11th card, a joker, goes back into the middle half of the pile.
    const s = dealtMatch({ top: "7♣ 8♦ 9♣ 8♠ 10♣ 9♠ J♣ 10♠ Q♣ J♠ GJ A♥" });
    expect(s.events.some((e) => e.type === "jokerReturned")).toBe(true);
    const view = readTable(s, 0);
    const base = s.drawPile.length - 1;
    const rng = seededRandom(5);
    for (let k = 0; k < 100; k++) {
      const { state: w } = dealWorld(s, view, rng);
      const at = w.drawPile.findIndex((c) => c.id === "GJ");
      expect(at).toBeGreaterThanOrEqual(Math.floor(base / 4));
      expect(at).toBeLessThanOrEqual(Math.ceil((3 * base) / 4));
    }
  });
});
