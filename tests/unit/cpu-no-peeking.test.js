// No CPU peeks. For each game's CPU: deal the cards its seat can't see out
// differently (same counts, same history, same face-up cards) and it must
// make exactly the same choice. A CPU that read a hidden card would change its
// mind. Khuzur's own checks are in khuzur-ai.test.js and khuzur-ai-view.test.js.

import { describe, it, expect } from "vitest";
import { seededRandom, stateWith } from "../helpers/cards.js";
import * as logic from "../../src/utils/gameLogic.js";
import { makeAIDecision } from "../../src/utils/aiPlayer.js";
import * as muushig from "../../src/utils/muushig/engine.js";
import { aiAction as muushigAction, applyAction as muushigApply } from "../../src/utils/muushig/ai.js";
import * as poker from "../../src/utils/poker/engine.js";
import { chooseAction } from "../../src/utils/poker/ai.js";

const LEVELS = ["EASY", "MEDIUM", "HARD"];

/** The same cards, dealt again into piles of the same sizes, in a seeded random order. */
function redeal(piles, rng) {
  const all = piles.flat();
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  let at = 0;
  return piles.map((p) => all.slice(at, (at += p.length)));
}

describe("Thirteen's CPU", () => {
  it.each(LEVELS)("%s makes the same choice however the other hands are dealt", (level) => {
    const s = stateWith(logic, { hands: ["3♦ 5♣ 5♥ 8♠ 9♦ J♣ Q♥ K♠ A♦ 2♣", "4♠ 6♠ 7♦ 10♣ Q♠", "4♥ 6♥ 9♣ J♦", "7♠ 8♥ 10♥ K♦ A♠ 2♦"], current: 0, aiDifficulty: level });
    const decide = (state) => makeAIDecision(state.players[0], null, state, seededRandom(11));
    for (let k = 1; k <= 4; k++) {
      const others = redeal(s.players.slice(1).map((p) => p.hand), seededRandom(k));
      const t = { ...s, players: s.players.map((p, i) => (i === 0 ? p : { ...p, hand: others[i - 1] })) };
      expect(decide(t)).toEqual(decide(s));
    }
  });
});

describe("Muushig's CPU", () => {
  /** States from a CPU match where seat `seat` decides, a few moves apart. */
  function decisions(level, seed) {
    const rng = seededRandom(seed);
    const players = Array.from({ length: 5 }, (_, i) => ({ name: `CPU${i}`, type: "AI", level }));
    let s = muushig.createMatch({ players, rng });
    const out = [];
    for (let steps = 0; steps < 400 && s.phase !== muushig.PHASES.MATCH_OVER; steps++) {
      if (s.phase === muushig.PHASES.TRICK_END) s = muushig.collectTrick(s);
      else if (s.phase === muushig.PHASES.ROUND_END) s = muushig.startNextRound(s, rng);
      else {
        if (s.phase !== muushig.PHASES.DRAW && steps % 7 === 0) out.push(s);
        s = muushigApply(s, muushigAction(s, rng), rng);
      }
    }
    return out;
  }

  it.each(LEVELS)("%s makes the same choice however the hidden cards are dealt", (level) => {
    const states = decisions(level, 3).slice(0, 12);
    expect(states.length).toBeGreaterThan(5);
    for (const s of states) {
      const me = s.turn;
      const hidden = [...s.players.filter((p) => p.id !== me).flatMap((p) => [p.hand, p.discarded]), s.drawPile];
      const again = redeal(hidden, seededRandom(me + 1));
      let at = 0;
      const players = s.players.map((p) => (p.id === me ? p : { ...p, hand: again[at++], discarded: again[at++] }));
      const t = { ...s, players, drawPile: again[at] };
      expect(muushigAction(t, seededRandom(5))).toEqual(muushigAction(s, seededRandom(5)));
    }
  });
});

describe("Poker's CPU", () => {
  it("decides from the seat's view, which holds no other player's cards", () => {
    let s = poker.createTable();
    for (let seat = 0; seat < 4; seat++) s = poker.sit(s, seat, { name: `CPU${seat}`, type: "AI", level: "HARD", stack: 1000 });
    s = poker.startHand(s, seededRandom(2));
    const seat = s.turn;
    expect(seat).toBeGreaterThanOrEqual(0);
    const view = poker.viewFor(s, seat);
    expect(view.deck).toEqual([]);
    view.seats.forEach((p, i) => {
      if (p && i !== seat) expect(p.hole.every((card) => card.hidden)).toBe(true);
    });
    // Other holes and the deck dealt differently: the same view, so the same choice.
    const others = s.seats.map((p, i) => (p && i !== seat ? p.hole : null)).filter(Boolean);
    const again = redeal([...others, s.deck], seededRandom(9));
    let at = 0;
    const t = { ...s, seats: s.seats.map((p, i) => (p && i !== seat ? { ...p, hole: again[at++] } : p)), deck: again[at] };
    expect(poker.viewFor(t, seat)).toEqual(view);
    for (const level of LEVELS) {
      expect(chooseAction(poker.viewFor(t, seat), seat, level, seededRandom(4))).toEqual(chooseAction(view, seat, level, seededRandom(4)));
    }
  });
});
