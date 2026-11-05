// KhuzurGame: the server-authoritative Khuzur table. Fake timers drive the
// CPU seats and the turn clock, so nothing here waits on a real clock.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KhuzurGame, khuzurView, DEFAULT_KHUZUR_DELAYS } from "../game/khuzurGame.js";
import { PHASES, deal, createMatch } from "../game/khuzur/engine.js";
import { seededRandom } from "../../tests/helpers/cards.js";

const FAST = { ...Object.fromEntries(Object.keys(DEFAULT_KHUZUR_DELAYS).map((k) => [k, 1])), turn: 50 };
const cpu = (i) => ({ type: "AI", name: `Bot ${i}` });
const human = (i) => ({ type: "HUMAN", name: `P${i} #000${i}` });
const T1v1 = { perTeam: 1, teams: 2, handSize: 5 };
const T2v2 = { perTeam: 2, teams: 2, handSize: 5 };

let game;
const newGame = (opts = {}) => {
  const calls = { states: 0, gameOver: 0 };
  game = new KhuzurGame({
    seats: [0, 1].map(cpu),
    table: T1v1,
    delays: FAST,
    rng: seededRandom(3),
    onState: () => calls.states++,
    onGameOver: () => calls.gameOver++,
    ...opts,
  });
  return { game, calls };
};

/** Skips the draw for the deal: the game starts dealt, with `turn` to move. */
function dealtState(table, seats, turn = 0) {
  const s = deal(createMatch({ players: seats, table, rng: seededRandom(1) }), (turn + seats.length - 1) % seats.length, seededRandom(1));
  return { ...s, turn };
}

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
  it("plays a whole match on its own and reports it once", () => {
    const { calls } = newGame({ seats: [0, 1, 2, 3].map(cpu), table: T2v2 });
    stepUntil((s) => s.phase === PHASES.MATCH_OVER);
    expect(calls.gameOver).toBe(1);
    expect(game.finishedAt).toBeInstanceOf(Date);
    expect(game.state.places.filter(Boolean).sort()).toEqual([1, 2]);
  });

  it("CPUs play at their level", () => {
    newGame({ seats: [{ ...cpu(0), level: "EASY" }, cpu(1)], level: "HARD" });
    expect(game.state.players.map((p) => p.level)).toEqual(["EASY", "HARD"]);
  });
});

describe("people", () => {
  const humanGame = (table = T1v1, seats = [human(0), cpu(1)]) => {
    newGame({ seats, table });
    game.load(dealtState(table, seats.map((s) => ({ ...s })), 0));
  };

  it("a human's move goes through the rules, and a bad one is refused", () => {
    humanGame();
    const hand = game.state.players[0].hand;
    expect(game.move(0, { type: "lead", cardIds: [hand[0].id, hand[0].id] }).ok).toBe(false);
    expect(game.move(1, { type: "lead", cardIds: [hand[0].id] })).toEqual({ ok: false, error: "That seat is played by a CPU" });
    expect(game.move(0, { type: "nope" })).toEqual({ ok: false, error: "Unknown move" });
    expect(game.move(0, { type: "lead", cardIds: "x" }).ok).toBe(false);
    expect(game.move(0, { type: "lead", cardIds: [hand[0].id] })).toEqual({ ok: true });
    expect(game.state.stack.layers[0][0].id).toBe(hand[0].id);
  });

  it("a leader whose time runs out is skipped", () => {
    humanGame(T1v1, [human(0), human(1)]);
    expect(game.turnMsLeft()).toBe(50);
    vi.advanceTimersByTime(50);
    expect(game.state.turn).toBe(1);
    expect(game.state.events.at(-1)).toEqual({ type: "skip", seat: 0 });
  });

  it("a beater whose time runs out picks up", () => {
    humanGame(T1v1, [human(0), human(1)]);
    game.move(0, { type: "lead", cardIds: [game.state.players[0].hand[0].id] });
    vi.advanceTimersByTime(50);
    expect(game.state.events.some((e) => e.type === "pickUp" && e.seat === 1)).toBe(true);
    expect(game.state.turn).toBe(0);
  });

  it("a clock armed for a turn that already moved never fires", () => {
    humanGame(T1v1, [human(0), human(1)]);
    vi.advanceTimersByTime(49);
    game.move(0, { type: "lead", cardIds: [game.state.players[0].hand[0].id] });
    vi.advanceTimersByTime(2);
    expect(game.state.stack).not.toBeNull();
    expect(game.state.turn).toBe(1);
  });
});

describe("the view", () => {
  it("hides every card the seat can't see", () => {
    newGame({ seats: [human(0), cpu(1)] });
    game.load(dealtState(T1v1, [human(0), cpu(1)], 0));
    const v = khuzurView(game.state, 0, game);
    expect(v.mySeat).toBe(0);
    expect(v.players[0].hand.every((c) => c.id)).toBe(true);
    expect(v.players[1].hand.every((c) => c.hidden && !c.id)).toBe(true);
    expect(v.drawPile.every((c) => c.hidden && !c.id)).toBe(true);
    expect(v.deadPile.every((c) => c.hidden)).toBe(true);
    expect(v.dealDeck.every((c) => c.hidden)).toBe(true);
    expect(v.drawPile).toHaveLength(game.state.drawPile.length);
    expect(v.trumpCard.id).toBe(game.state.trumpCard.id);
    expect(v.turnMsLeft).toBe(50);
    expect(JSON.stringify(v)).not.toContain(game.state.players[1].hand[0].id);
  });
});

describe("surrender votes", () => {
  const seats = [human(0), human(1), human(2), cpu(3)];
  const voteGame = () => {
    newGame({ seats, table: T2v2 });
    game.load(dealtState(T2v2, seats, 1));
  };

  it("needs every human on the team", () => {
    voteGame();
    expect(game.move(0, { type: "surrender" }).ok).toBe(true);
    expect(game.state.phase).toBe(PHASES.PLAY);
    expect(khuzurView(game.state, 2, game).votes).toEqual({ 0: [0] });
    game.move(2, { type: "surrender" });
    expect(game.state.phase).toBe(PHASES.MATCH_OVER);
    expect(game.state.places).toEqual([2, 1]);
  });

  it("KEEP PLAYING clears the vote", () => {
    voteGame();
    game.move(0, { type: "surrender" });
    game.move(2, { type: "keepPlaying" });
    expect(khuzurView(game.state, 0, game).votes).toEqual({});
    expect(game.state.phase).toBe(PHASES.PLAY);
  });

  it("a teammate a CPU takes over doesn't vote: the rest is enough", () => {
    voteGame();
    game.move(0, { type: "surrender" });
    game.replaceSeat(2, { type: "AI", name: "Bot 9" });
    expect(game.state.phase).toBe(PHASES.MATCH_OVER);
  });

  it("alone on your team, one press concedes", () => {
    voteGame();
    game.move(1, { type: "surrender" });
    expect(game.state.places).toEqual([1, 2]);
  });
});

describe("rematch", () => {
  it("deals the next match once this one is over", () => {
    newGame({ seats: [0, 1, 2, 3].map(cpu), table: T2v2 });
    expect(game.rematch().ok).toBe(false);
    stepUntil((s) => s.phase === PHASES.MATCH_OVER);
    expect(game.rematch().ok).toBe(true);
    expect(game.state.matchNumber).toBe(2);
    expect(game.state.phase).toBe(PHASES.PLAY);
  });
});
