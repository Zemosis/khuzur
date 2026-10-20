// Muushig AI: legal at every level, and the choices that define each level.

import { describe, it, expect } from "vitest";
import { PHASES, START_SCORE, collectTrick, createDeck, createMatch, makeCard, maxDrawDepth, startNextRound } from "../../src/utils/muushig/engine.js";
import { aiAction, applyAction } from "../../src/utils/muushig/ai.js";
import { seededRandom } from "../helpers/cards.js";

const c = (id) => makeCard(id.slice(0, -1), id.slice(-1));
const cs = (ids) => (ids.trim() ? ids.trim().split(/\s+/).map(c) : []);

const players = (level) => Array.from({ length: 5 }, (_, i) => ({ name: `CPU${i}`, type: "AI", level }));

/** Plays a whole match with CPUs only; returns the final state. */
function playMatch(level, seed) {
  const rng = seededRandom(seed);
  let s = createMatch({ players: players(level), rng });
  for (let steps = 0; steps < 20000 && s.phase !== PHASES.MATCH_OVER; steps++) {
    if (s.phase === PHASES.TRICK_END) s = collectTrick(s);
    else if (s.phase === PHASES.ROUND_END) s = startNextRound(s, rng);
    else s = applyAction(s, aiAction(s, rng), rng);
  }
  return s;
}

/** Deals the cards nobody named to the other seats, so every hand is the size the table says. */
function dealRest(named, sizes) {
  const used = new Set(named.map((card) => card.id));
  const spare = createDeck().filter((card) => !used.has(card.id));
  return sizes.map((n) => spare.splice(0, n));
}

/** A table in the PLAY phase, seat 0 to move; everyone is in and seat 4 deals. */
function stateFor({ hand, trump = "♦", trick = [], level = "HARD", played = "", trumpTakenBy = 4, trickNumber = 1, eaten = 0 }) {
  const mine = cs(hand);
  const onTable = trick.map(([seat, id]) => ({ seat, card: c(id) }));
  const trumpCard = c(`9${trump}`);
  // Who already played to this trick holds one card fewer than seat 0.
  const sizes = [0, 1, 2, 3, 4].map((seat) => (seat === 0 ? 0 : mine.length - (trick.some(([s]) => s === seat) ? 1 : 0)));
  const hands = dealRest([...mine, ...cs(played), ...onTable.map((p) => p.card), trumpCard], sizes);
  return {
    matchNumber: 1,
    roundNumber: 1,
    dealer: 4,
    players: Array.from({ length: 5 }, (_, seat) => ({
      id: seat,
      name: `P${seat}`,
      type: "AI",
      level,
      score: START_SCORE,
      hand: seat === 0 ? mine : hands[seat],
      status: "play",
      eaten: seat === 0 ? eaten : 0,
      discarded: [],
      foldStreak: 0,
    })),
    trumpCard,
    trumpSuit: trump,
    trumpTakenBy,
    drawPile: [],
    deadPile: [],
    played: [...cs(played), ...onTable.map((p) => p.card)],
    trick: onTable,
    trickNumber,
    phase: PHASES.PLAY,
    turn: 0,
    events: [],
  };
}

/** A table in the DECIDE phase with `seat` to speak; `decided` maps seats to "play" or "fold". */
function decideState({ hand, faceup, seat, level, decided = {} }) {
  const mine = cs(hand);
  const trumpCard = c(faceup);
  const rest = dealRest([...mine, trumpCard], [5, 5, 5, 5, 5, 6]);
  return {
    matchNumber: 1,
    roundNumber: 1,
    dealer: 4,
    players: Array.from({ length: 5 }, (_, s) => ({
      id: s,
      name: `P${s}`,
      type: "AI",
      level,
      score: START_SCORE,
      hand: s === seat ? mine : rest[s],
      status: decided[s] ?? null,
      eaten: 0,
      discarded: [],
      foldStreak: 0,
    })),
    trumpCard,
    trumpSuit: trumpCard.suit,
    trumpTakenBy: null,
    drawPile: rest[5],
    deadPile: [],
    played: [],
    trick: [],
    trickNumber: 0,
    phase: PHASES.DECIDE,
    turn: seat,
    events: [],
  };
}

/** The dealer (seat 4) about to take or leave the face-up trump. */
function trumpState({ hand, faceup, level }) {
  const s = decideState({ hand, faceup, seat: 4, level, decided: { 0: "play", 1: "play", 2: "play", 3: "play" } });
  return { ...s, players: s.players.map((p) => ({ ...p, status: "play" })), drawPile: [], phase: PHASES.TRUMP };
}

describe.each(["EASY", "MEDIUM", "HARD"])("%s", (level) => {
  it("plays whole matches to a winner without an illegal move", () => {
    for (const seed of level === "HARD" ? [1] : [1, 2, 3]) {
      const s = playMatch(level, seed);
      expect(s.phase).toBe(PHASES.MATCH_OVER);
      expect(s.players[s.matchWinner].score).toBeLessThanOrEqual(0);
    }
  }, 30000);

  it("draws for the deal at a depth the pile allows", () => {
    const s = createMatch({ players: players(level), rng: seededRandom(5) });
    const depths = new Set();
    for (let seed = 0; seed < 30; seed++) {
      const a = aiAction(s, seededRandom(seed));
      expect(a.type).toBe("drawForDeal");
      expect(a.seat).toBe(s.turn);
      expect(a.depth).toBeGreaterThanOrEqual(1);
      expect(a.depth).toBeLessThanOrEqual(maxDrawDepth(s));
      depths.add(a.depth);
    }
    expect(depths.size).toBeGreaterThan(3);
  });

  it("goes in as the dealer when the face-up trump is the ace, whatever its hand", () => {
    // Two players are already in, so folding is allowed; the ace is a pile in the bag.
    const s = decideState({ hand: "7♣ 8♣ 7♥ 8♥ 7♠", faceup: "A♦", seat: 4, level, decided: { 0: "play", 1: "play", 2: "fold", 3: "fold" } });
    for (let seed = 0; seed < 10; seed++) expect(aiAction(s, seededRandom(seed)).play).toBe(true);
  });

  it("never folds the ace of trump", () => {
    const s = decideState({ hand: "A♦ 7♣ 8♣ 7♥ 8♥", faceup: "9♦", seat: 0, level });
    for (let seed = 0; seed < 10; seed++) expect(aiAction(s, seededRandom(seed)).play).toBe(true);
  });

  it("takes the face-up ace for a card that isn't trump", () => {
    const a = aiAction(trumpState({ hand: "7♣ 8♣ 7♥ 8♥ 7♠", faceup: "A♦", level }), seededRandom(1));
    expect(a.type).toBe("takeTrump");
    expect(a.cardId).not.toBeNull();
    expect(a.cardId).not.toMatch(/♦$/);
  });

  it("takes the trump card for its weakest card", () => {
    expect(aiAction(trumpState({ hand: "7♣ K♦ Q♦ J♦ 10♦", faceup: "9♦", level }), seededRandom(1))).toEqual({
      type: "takeTrump",
      seat: 4,
      cardId: "7♣",
    });
  });

  it("keeps its hand when every card beats the trump card", () => {
    expect(aiAction(trumpState({ hand: "A♦ K♦ Q♦ J♦ 10♦", faceup: "9♦", level }), seededRandom(1)).cardId).toBeNull();
  });
});

describe.each(["MEDIUM", "HARD"])("%s", (level) => {
  it("folds a hand with no trump and no ace once others are in", () => {
    const s = decideState({ hand: "7♣ 8♣ 7♥ 8♥ 9♠", faceup: "9♦", seat: 3, level, decided: { 0: "play", 1: "play", 2: "play" } });
    expect(aiAction(s, seededRandom(1)).play).toBe(false);
  });

  it("goes in with the top two trumps", () => {
    const s = decideState({ hand: "K♦ Q♦ 7♣ 8♥ 9♠", faceup: "A♦", seat: 3, level, decided: { 0: "play", 1: "play", 2: "play" } });
    expect(aiAction(s, seededRandom(1)).play).toBe(true);
  });

  it("leads a trump that can't be beaten any more", () => {
    // A♦ and K♦ are gone, so the Q♦ is the top trump left.
    const s = stateFor({ hand: "Q♦ 8♣ 7♥", played: "A♦ K♦", trickNumber: 3, level });
    expect(aiAction(s, seededRandom(1)).cardId).toBe("Q♦");
  });

  it("wins cheaply when it plays last", () => {
    const s = stateFor({ hand: "K♦ 10♦ 7♣", trick: [[1, "8♠"], [2, "9♠"], [3, "10♠"], [4, "J♠"]], eaten: 1, trickNumber: 3, level });
    expect(aiAction(s, seededRandom(1)).cardId).toBe("10♦");
  });
});

describe("MEDIUM", () => {
  it("eats with the cheapest card that does the job: a K♠ under its own A♠ is as good as the ace", () => {
    const s = stateFor({ hand: "A♠ K♠ 7♥", trick: [[3, "Q♠"]], level: "MEDIUM", trickNumber: 3 });
    expect(aiAction(s, seededRandom(1)).cardId).toBe("K♠");
  });

  it("throws its weakest card when it can't win", () => {
    const s = stateFor({ hand: "9♥ A♣ 8♠", trick: [[3, "Q♠"], [2, "K♦"]], level: "MEDIUM", trickNumber: 3 });
    expect(aiAction(s, seededRandom(1)).cardId).toBe("8♠");
  });

  it("takes a pile it can't lose rather than risk a lower trump on it", () => {
    // J♦ loses to any of the four trumps above it; the A♦ to none.
    const s = stateFor({ hand: "A♦ J♦ 7♣", trick: [[3, "8♠"]], trickNumber: 3, level: "MEDIUM" });
    expect(aiAction(s, seededRandom(1)).cardId).toBe("A♦");
  });
});
