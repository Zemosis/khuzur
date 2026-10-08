// Whole tables of CPUs, hundreds of hands each, with players leaving mid-hand
// and new ones sitting down: chips are never made or lost, and every hand ends.

import { describe, it, expect } from "vitest";
import * as E from "../../src/utils/poker/engine.js";
import { chooseAction } from "../../src/utils/poker/ai.js";
import { seededRandom } from "../helpers/poker.js";

const LEVELS = ["EASY", "MEDIUM", "HARD"];
const stacks = (s, test = () => true) => s.seats.reduce((sum, p) => sum + (p && test(p) ? p.stack : 0), 0);

describe.each([1, 2, 3])("a CPU table, seed %i", (seed) => {
  it("plays 300 hands without losing a chip", () => {
    const rng = seededRandom(seed);
    const cpu = (i) => ({ name: `P${i}`, type: "AI", level: LEVELS[i % 3], stack: 1000 });
    let s = E.createTable();
    for (let i = 0; i < 6; i++) s = E.sit(s, i, cpu(i));
    for (let hand = 0; hand < 300; hand++) {
      s.seats.forEach((p, i) => {
        if (p && p.stack === 0 && !p.leaving) s = E.rebuy(s, i);
      });
      if (rng() < 0.05) s = E.standUp(s, Math.floor(rng() * 6));
      for (let i = 0; i < 6; i++) if (!s.seats[i] && rng() < 0.3) s = E.sit(s, i, cpu(i));
      const before = stacks(s, (p) => !p.leaving);
      s = E.startHand(s, rng);
      for (let step = 0; s.phase !== E.PHASES.HAND_OVER; step++) {
        expect(step).toBeLessThan(200);
        if (s.phase === E.PHASES.RUNOUT) s = E.advance(s);
        else if (rng() < 0.01) s = E.standUp(s, s.turn);
        else s = E.act(s, s.turn, chooseAction(E.viewFor(s, s.turn), s.turn, s.seats[s.turn].level, rng));
      }
      expect(stacks(s)).toBe(before);
      expect(E.handSummary(s).seatResults.reduce((sum, r) => sum + r.net, 0)).toBe(0);
    }
  });
});
