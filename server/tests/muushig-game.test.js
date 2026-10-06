// MuushigGame: the server-authoritative Muushig table. Fake timers drive the
// CPU seats and the automatic steps, so nothing here waits on a real clock.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MuushigGame, muushigView, DEFAULT_MUUSHIG_DELAYS } from "../game/muushigGame.js";
import { PHASES, START_SCORE, allowedPlays, foldBlock, maxDiscard, maxDrawDepth } from "../game/muushig/engine.js";
import { seededRandom } from "../../tests/helpers/cards.js";

const FAST = Object.fromEntries(Object.keys(DEFAULT_MUUSHIG_DELAYS).map((k) => [k, 1]));
const cpu = (i) => ({ type: "AI", name: `Bot ${i}` });
const human = (i) => ({ type: "HUMAN", name: `P${i} #000${i}`, avatar: { variant: "2", custom: null } });

/** An rng whose first value is `first` (createMatch picks the first drawer with it), then seeded. */
const rngStartingWith = (first, seed = 7) => {
  const rest = seededRandom(seed);
  let used = false;
  return () => (used ? rest() : ((used = true), first));
};

let game;
const newGame = (opts = {}) => {
  const calls = { states: 0, rounds: [], gameOver: 0 };
  game = new MuushigGame({
    seats: [0, 1, 2, 3, 4].map(cpu),
    delays: FAST,
    rng: seededRandom(3),
    onState: () => calls.states++,
    onRoundEnd: (r) => calls.rounds.push(r),
    onGameOver: () => calls.gameOver++,
    ...opts,
  });
  return { game, calls };
};

/** Steps the clock 1ms at a time until `test(state)` holds. */
const stepUntil = (test, max = 200000) => {
  for (let i = 0; i < max && !test(game.state); i++) vi.advanceTimersByTime(1);
  expect(test(game.state)).toBe(true);
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  game?.destroy();
  game = null;
  vi.useRealTimers();
});

describe("a table of CPUs", () => {
  it("plays a whole match on its own, reporting every round once", () => {
    const { calls } = newGame();
    stepUntil((s) => s.phase === PHASES.MATCH_OVER);
    const s = game.state;
    expect(calls.gameOver).toBe(1);
    expect(game.finishedAt).toBeInstanceOf(Date);
    expect(calls.rounds.map((r) => r.roundNumber)).toEqual(Array.from({ length: s.roundNumber }, (_, i) => i + 1));
    // The round summaries add up to the final scores.
    s.players.forEach((p, seat) => {
      const total = calls.rounds.reduce((sum, r) => sum + r.seatResults[seat].points_gained, 0);
      expect(START_SCORE + total).toBe(p.score);
      expect(calls.rounds.at(-1).seatResults[seat].score_after).toBe(p.score);
    });
    expect(s.players.some((p) => p.score <= 0)).toBe(true);
    // Nothing is left scheduled once the match is over.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("summarises a round per seat: piles eaten, folds, the sweeper", () => {
    const { calls } = newGame();
    stepUntil((s) => s.roundNumber === 2);
    const [round] = calls.rounds;
    const results = round.seatResults;
    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r).toEqual(expect.objectContaining({ seat_index: expect.any(Number), eaten: expect.any(Number), folded: expect.any(Boolean) }));
      if (r.folded) expect(r.points_gained).toBe(0);
      else expect(r.points_gained).toBe(r.eaten > 0 ? -r.eaten : 5);
    }
    const sweeper = results.find((r) => r.eaten === 5);
    expect(round.winnerSeat).toBe(sweeper ? sweeper.seat_index : null);
  });
});

describe("pacing", () => {
  it("a CPU waits its thinking time, and longer once a new round is dealt", () => {
    const delays = { ...FAST, draw: 100, tie: 100, decide: 50, roundStart: 1000, drawReveal: 500 };
    newGame({ delays });
    const before = game.state.dealDraws.length;
    vi.advanceTimersByTime(99);
    expect(game.state.dealDraws.length).toBe(before);
    vi.advanceTimersByTime(1);
    expect(game.state.dealDraws.length).toBe(before + 1);

    // The first deal: the draw's reveal, the dealer banner and the deal play first.
    stepUntil((s) => s.phase === PHASES.DECIDE);
    const decided = () => game.state.players.filter((p) => p.status !== null).length;
    vi.advanceTimersByTime(50 + 1000 + 500 - 1);
    expect(decided()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(decided()).toBe(1);
  });

  it("collects a finished trick after the trick pause, and deals on after the results", () => {
    newGame({ delays: { ...FAST, collect: 300, roundEnd: 700 } });
    stepUntil((s) => s.phase === PHASES.TRICK_END);
    vi.advanceTimersByTime(299);
    expect(game.state.phase).toBe(PHASES.TRICK_END);
    vi.advanceTimersByTime(1);
    expect(game.state.phase).not.toBe(PHASES.TRICK_END);

    stepUntil((s) => s.phase === PHASES.ROUND_END);
    const round = game.state.roundNumber;
    vi.advanceTimersByTime(699);
    expect(game.state.phase).toBe(PHASES.ROUND_END);
    vi.advanceTimersByTime(1);
    expect(game.state.roundNumber).toBe(round + 1);
    expect(game.state.phase).toBe(PHASES.DECIDE);
  });

  it("nothing runs while a human holds the turn", () => {
    newGame({ seats: [human(0), cpu(1), cpu(2), cpu(3), cpu(4)], rng: rngStartingWith(0) });
    expect(game.state.turn).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("a human's moves", () => {
  const seats = [human(0), cpu(1), cpu(2), cpu(3), cpu(4)];

  it("are played through the rules and move the turn on", () => {
    newGame({ seats, rng: rngStartingWith(0) });
    expect(game.move(0, { type: "drawForDeal", depth: 3 })).toEqual({ ok: true });
    expect(game.state.dealDraws).toEqual([expect.objectContaining({ seat: 0, depth: 3 })]);
    expect(game.state.turn).toBe(1);
  });

  it("are rejected out of turn, from a CPU's seat, or malformed, leaving the state alone", () => {
    newGame({ seats, rng: rngStartingWith(0) });
    const before = game.state;
    expect(game.move(1, { type: "drawForDeal", depth: 1 })).toEqual({ ok: false, error: "That seat is played by a CPU" });
    expect(game.move(0, { type: "decide", play: true })).toEqual({ ok: false, error: "Not the DECIDE phase" });
    expect(game.move(0, { type: "drawForDeal", depth: "3" })).toMatchObject({ ok: false });
    expect(game.move(0, { type: "drawForDeal", depth: 99 })).toEqual({ ok: false, error: "Draw a card between 1 and 10 deep" });
    expect(game.move(0, { type: "cheat" })).toEqual({ ok: false, error: "Unknown move" });
    expect(game.move(0, null)).toEqual({ ok: false, error: "Unknown move" });
    expect(game.move(7, { type: "drawForDeal", depth: 1 })).toEqual({ ok: false, error: "Not your turn" });
    expect(game.state).toBe(before);
  });

  it("type-check every payload before the rules see it", () => {
    newGame({ seats, rng: rngStartingWith(0) });
    expect(game.move(0, { type: "swap", cardIds: "all" })).toMatchObject({ ok: false });
    expect(game.move(0, { type: "swap", cardIds: [1, 2] })).toMatchObject({ ok: false });
    expect(game.move(0, { type: "swap", cardIds: Array(6).fill("7♠") })).toMatchObject({ ok: false });
    expect(game.move(0, { type: "decide", play: "yes" })).toMatchObject({ ok: false });
    expect(game.move(0, { type: "takeTrump", cardId: 5 })).toMatchObject({ ok: false });
    expect(game.move(0, { type: "play", cardId: { id: "A♠" } })).toMatchObject({ ok: false });
  });
});

describe("the round's opening", () => {
  it("holds every human's move until it has played out on everyone's table", () => {
    newGame({ seats: [0, 1, 2, 3, 4].map(human), rng: rngStartingWith(0), delays: { ...FAST, roundStart: 1000, drawReveal: 500 } });
    expect(game.dealMsLeft()).toBe(0);
    while (game.state.phase === PHASES.DRAW) game.move(game.state.turn, { type: "drawForDeal", depth: 1 });
    // The first round: the winning draw, the dealer banner and the deal.
    expect(game.dealMsLeft()).toBe(1500);
    const turn = game.state.turn;
    expect(game.move(turn, { type: "decide", play: true })).toEqual({ ok: false, error: "Still dealing" });
    vi.advanceTimersByTime(1499);
    expect(game.move(turn, { type: "decide", play: true })).toEqual({ ok: false, error: "Still dealing" });
    vi.advanceTimersByTime(1);
    expect(game.dealMsLeft()).toBe(0);
    expect(game.move(turn, { type: "decide", play: true })).toEqual({ ok: true });
  });
});

describe("seats changing hands", () => {
  it("a CPU taking over a human's seat plays their turn; handing it back stops the CPU", () => {
    newGame({ seats: [human(0), cpu(1), cpu(2), cpu(3), cpu(4)], rng: rngStartingWith(0), delays: { ...FAST, draw: 100 } });
    game.replaceSeat(0, { type: "AI", name: "P0 (CPU)" });
    expect(game.state.players[0]).toMatchObject({ type: "AI", name: "P0 (CPU)", level: "MEDIUM" });
    vi.advanceTimersByTime(100);
    expect(game.state.dealDraws.map((d) => d.seat)).toEqual([0]);

    // Seat 1 is a CPU about to draw; a human taking it over stops that.
    game.replaceSeat(1, { type: "HUMAN", name: "P1 #0001", avatar: null });
    vi.advanceTimersByTime(1000);
    expect(game.state.turn).toBe(1);
    expect(game.state.dealDraws).toHaveLength(1);
    expect(game.move(1, { type: "drawForDeal", depth: 2 })).toEqual({ ok: true });
  });
});

describe("rematch", () => {
  it("is refused mid-match, then deals match 2 to the same seats", () => {
    newGame({ seats: [cpu(0), cpu(1), cpu(2), cpu(3), cpu(4)].map((s, i) => (i === 2 ? human(2) : s)) });
    expect(game.rematch()).toEqual({ ok: false, error: "Match is still in progress" });
    game.replaceSeat(2, { type: "AI", name: "P2 (CPU)" });
    stepUntil((s) => s.phase === PHASES.MATCH_OVER);
    game.replaceSeat(2, { type: "HUMAN", name: "P2 #0002", avatar: null });
    expect(game.rematch()).toEqual({ ok: true });
    const s = game.state;
    expect(s.matchNumber).toBe(2);
    expect(s.phase).toBe(PHASES.DRAW);
    expect(s.players.map((p) => p.score)).toEqual(Array(5).fill(START_SCORE));
    expect(s.players.map((p) => p.type)).toEqual(["AI", "AI", "HUMAN", "AI", "AI"]);
    expect(game.finishedAt).toBeNull();
  });
});

describe("muushigView", () => {
  /** A mid-round state with cards everywhere: hands, discards, both piles. */
  const midRound = () => {
    newGame();
    stepUntil((s) => s.phase === PHASES.PLAY && s.trickNumber === 2 && s.trick.length === 1);
    return game.state;
  };

  it("hides every card a seat shouldn't see, keeping the counts", () => {
    const s = midRound();
    for (let seat = 0; seat < 5; seat++) {
      const v = muushigView(s, seat);
      expect(v.mySeat).toBe(seat);
      expect(v.players[seat].hand).toEqual(s.players[seat].hand);
      expect(v.players[seat].discarded).toEqual(s.players[seat].discarded);
      v.players.forEach((p, i) => {
        if (i === seat) return;
        expect(p.hand).toEqual(s.players[i].hand.map(() => ({ hidden: true })));
        expect(p.discarded).toEqual(s.players[i].discarded.map(() => ({ hidden: true })));
      });
      for (const pile of ["dealDeck", "drawPile", "deadPile"]) {
        expect(v[pile]).toEqual(s[pile].map(() => ({ hidden: true })));
      }
    }
  });

  it("leaks no secret card anywhere in what it sends (your own hand and discards aren't secret to you)", () => {
    const s = midRound();
    const ids = (cards) => cards.map((c) => c.id);
    const cardsIn = (x) => JSON.stringify(x).match(/"id":"[^"]+"/g) || [];
    const publicIds = new Set([
      s.trumpCard.id,
      ...ids(s.played),
      ...s.dealDraws.map((d) => d.card.id),
      ...cardsIn(s.events).map((m) => m.slice(6, -1)),
    ]);
    for (let seat = 0; seat < 5; seat++) {
      const secret = [
        ...s.players.flatMap((p, i) => (i === seat ? [] : [...ids(p.hand), ...ids(p.discarded)])),
        ...ids(s.dealDeck),
        ...ids(s.drawPile),
        ...ids(s.deadPile),
      ].filter((id) => !publicIds.has(id) && !ids([...s.players[seat].hand, ...s.players[seat].discarded]).includes(id));
      expect(secret.length).toBeGreaterThan(0);
      const sent = JSON.stringify(muushigView(s, seat));
      for (const id of secret) expect(sent).not.toContain(`"id":"${id}"`);
    }
  });

  it("the browser's rule helpers give the same answers on a view", () => {
    const s = midRound();
    const seat = s.turn;
    const v = muushigView(s, seat);
    expect(ids(allowedPlays(v, seat))).toEqual(ids(allowedPlays(s, seat)));
    expect(maxDiscard(v)).toBe(maxDiscard(s));
    expect(maxDrawDepth(v)).toBe(maxDrawDepth(s));
    expect(foldBlock(v, seat)).toBe(foldBlock(s, seat));
    function ids(cards) {
      return cards.map((c) => c.id);
    }
  });

  it("a spectator (seat -1) sees no hand at all", () => {
    const s = midRound();
    const v = muushigView(s, -1);
    v.players.forEach((p) => expect(p.hand.every((c) => c.hidden)).toBe(true));
  });
});

describe("destroy", () => {
  it("stops every timer", () => {
    newGame();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    game.destroy();
    expect(vi.getTimerCount()).toBe(0);
    const before = game.state;
    vi.advanceTimersByTime(60000);
    expect(game.state).toBe(before);
  });
});
