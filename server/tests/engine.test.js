// ThirteenGame: the server-authoritative wrapper. Fake timers drive CPU turns
// and round transitions, so nothing here waits on a real clock.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ThirteenGame, redactState, DEFAULT_DELAYS } from "../game/engine.js";
import { GAME_STATES } from "../game/constants.js";
import * as logic from "../game/gameLogic.js";
import { ids, stateWith, seededRandom } from "../../tests/helpers/cards.js";

const humans = (n = 4) =>
  [0, 1, 2, 3].map((i) =>
    i < n ? { type: "HUMAN", name: `P${i}`, socketId: `s${i}` } : { type: "AI", name: `CPU ${i}`, socketId: null },
  );

const newGame = (opts = {}) => {
  const calls = { state: 0, rounds: [], gameOver: 0 };
  const game = new ThirteenGame({
    seats: humans(4),
    onState: () => calls.state++,
    onRoundEnd: (r) => calls.rounds.push(r),
    onGameOver: () => calls.gameOver++,
    ...opts,
  });
  return { game, calls };
};

/** Replace the dealt state with an exact one (seats keep their names/types), its deal already over. */
const rig = (game, spec) => {
  const s = stateWith(logic, spec);
  s.players = s.players.map((p, i) => ({ ...p, name: game.state.players[i].name, type: spec.types?.[i] ?? game.state.players[i].type }));
  game.state = s;
  game.dealEndsAt = 0;
  return s;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("starting a match", () => {
  it("deals 13 each, lets the 3♦ holder lead and broadcasts once", () => {
    const { game, calls } = newGame();
    const s = game.state;
    expect(s.players.map((p) => p.hand.length)).toEqual([13, 13, 13, 13]);
    expect(s.players[s.currentPlayerIndex].hand.some((c) => c.id === "3♦")).toBe(true);
    expect(s.players.map((p) => p.name)).toEqual(["P0", "P1", "P2", "P3"]);
    expect(s.players.map((p) => p.socketId)).toEqual(["s0", "s1", "s2", "s3"]);
    expect(s.matchNumber).toBe(1);
    expect(calls.state).toBe(1);
    expect(game.startedAt).toBeInstanceOf(Date);
    game.destroy();
  });

  it("keeps the default delays unless overridden", () => {
    expect(newGame().game.delays).toEqual(DEFAULT_DELAYS);
    expect(newGame({ delays: { aiTurn: 5 } }).game.delays).toEqual({ ...DEFAULT_DELAYS, aiTurn: 5 });
  });
});

describe("CPU timing", () => {
  it("the first CPU turn waits for the deal animation, later ones wait AI_TURN_DELAY", () => {
    // Seed so a CPU holds 3♦ in a table of 4 CPUs.
    const { game } = newGame({ seats: [0, 1, 2, 3].map((i) => ({ type: "AI", name: `C${i}` })), rng: seededRandom(11) });
    const before = game.state.moveHistory.length;
    vi.advanceTimersByTime(DEFAULT_DELAYS.deal - 1);
    expect(game.state.moveHistory.length).toBe(before);
    vi.advanceTimersByTime(1);
    expect(game.state.moveHistory.length).toBe(before + 1);
    vi.advanceTimersByTime(DEFAULT_DELAYS.aiTurn - 1);
    expect(game.state.moveHistory.length).toBe(before + 1);
    vi.advanceTimersByTime(1);
    expect(game.state.moveHistory.length).toBe(before + 2);
    game.destroy();
  });

  it("no CPU timer runs while a human holds the turn", () => {
    const { game } = newGame();
    expect(vi.getTimerCount()).toBe(0);
    game.destroy();
  });

  it("an all-CPU table plays a whole match on its own, reporting every round", () => {
    const { game, calls } = newGame({
      seats: [0, 1, 2, 3].map((i) => ({ type: "AI", name: `C${i}` })),
      delays: { aiTurn: 1, deal: 1, roundEnd: 1 },
      rng: seededRandom(5),
    });
    for (let i = 0; i < 50000 && game.state.gameState !== GAME_STATES.GAME_OVER; i++) vi.advanceTimersByTime(1);
    const s = game.state;
    expect(s.gameState).toBe(GAME_STATES.GAME_OVER);
    expect(calls.gameOver).toBe(1);
    expect(calls.rounds.length).toBe(s.roundNumber);
    expect(game.finishedAt).toBeInstanceOf(Date);
    // The round summaries add up to the final scores.
    s.players.forEach((p, seat) => {
      const total = calls.rounds.reduce((sum, r) => sum + r.seatResults[seat].points_gained, 0);
      expect(total).toBe(p.score);
      expect(calls.rounds.at(-1).seatResults[seat].score_after).toBe(p.score);
    });
    calls.rounds.forEach((r) => expect(r.seatResults[r.winnerSeat].cards_left).toBe(0));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("round transitions", () => {
  it("ROUND_END starts the next round after the delay, winner leading", () => {
    const { game, calls } = newGame();
    rig(game, { hands: ["3♦", "4♦ 5♦", "6♦", "7♦"], current: 0 });
    expect(game.handleMove(0, "play", ["3♦"])).toEqual({ ok: true });
    expect(game.state.gameState).toBe(GAME_STATES.ROUND_END);
    expect(calls.rounds).toHaveLength(1);
    expect(calls.rounds[0]).toMatchObject({ roundNumber: 1, winnerSeat: 0 });
    expect(calls.rounds[0].seatResults[1]).toMatchObject({ cards_left: 2, points_gained: 2, score_after: 2, eliminated: false });

    vi.advanceTimersByTime(DEFAULT_DELAYS.roundEnd - 1);
    expect(game.state.gameState).toBe(GAME_STATES.ROUND_END);
    vi.advanceTimersByTime(1);
    expect(game.state.gameState).toBe(GAME_STATES.PLAYING);
    expect(game.state.roundNumber).toBe(2);
    expect(game.state.currentPlayerIndex).toBe(0);
    expect(game.state.players.map((p) => p.hand.length)).toEqual([13, 13, 13, 13]);
    game.destroy();
  });

  it("the final round reports once and fires onGameOver, with no next round", () => {
    const { game, calls } = newGame();
    rig(game, { hands: ["3♦", "", "4♦ 5♦", ""], scores: [0, 30, 24, 30], eliminated: [false, true, false, true], current: 0 });
    game.handleMove(0, "play", ["3♦"]);
    expect(game.state.gameState).toBe(GAME_STATES.GAME_OVER);
    expect(calls.rounds).toHaveLength(1);
    expect(calls.gameOver).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the deal", () => {
  it("holds every human's move until it has played out on everyone's screen", () => {
    const { game } = newGame();
    const starter = game.state.currentPlayerIndex;
    const play = () => game.handleMove(starter, "play", ["3♦"]);
    expect(game.dealMsLeft()).toBe(DEFAULT_DELAYS.deal);
    expect(play()).toEqual({ ok: false, error: "Still dealing" });
    vi.advanceTimersByTime(DEFAULT_DELAYS.deal - 1);
    expect(play()).toEqual({ ok: false, error: "Still dealing" });
    vi.advanceTimersByTime(1);
    expect(game.dealMsLeft()).toBe(0);
    expect(play()).toEqual({ ok: true });
    game.destroy();
  });

  it("every new round deals again", () => {
    const { game } = newGame();
    rig(game, { hands: ["3♦", "4♦ 5♦", "6♦", "7♦"], current: 0 });
    game.handleMove(0, "play", ["3♦"]);
    vi.advanceTimersByTime(DEFAULT_DELAYS.roundEnd);
    expect(game.state.roundNumber).toBe(2);
    expect(game.dealMsLeft()).toBe(DEFAULT_DELAYS.deal);
    expect(game.handleMove(0, "play", [game.state.players[0].hand[0].id])).toEqual({ ok: false, error: "Still dealing" });
    game.destroy();
  });
});

describe("handleMove", () => {
  let game;
  beforeEach(() => {
    ({ game } = newGame());
    rig(game, { hands: ["3♦ 3♣ 9♠", "4♦ 5♦", "6♦", "7♦"], current: 0 });
  });
  afterEach(() => game.destroy());

  it.each([
    ["not your turn", () => game.handleMove(1, "play", ["4♦"]), "Not your turn"],
    ["passing while leading", () => game.handleMove(0, "pass"), "You lead the trick — you must play"],
    ["no cards", () => game.handleMove(0, "play", []), "No cards selected"],
    ["missing cards", () => game.handleMove(0, "play"), "No cards selected"],
    ["a card without an id", () => game.handleMove(0, "play", [{}]), "No cards selected"],
    ["duplicate cards", () => game.handleMove(0, "play", ["3♦", "3♦"]), "Duplicate cards in selection"],
    ["a card you don't hold", () => game.handleMove(0, "play", ["2♠"]), "Those cards are not in your hand"],
    ["an invalid combination", () => game.handleMove(0, "play", ["3♦", "9♠"]), "Invalid combination"],
    ["an unknown action", () => game.handleMove(0, "cheat"), "Unknown action"],
  ])("rejects %s", (_label, move, error) => {
    const before = game.state;
    expect(move()).toEqual({ ok: false, error });
    expect(game.state).toBe(before);
  });

  it("rejects a move from an eliminated seat", () => {
    rig(game, { hands: ["", "4♦", "6♦", "7♦"], eliminated: [true, false, false, false], current: 0 });
    expect(game.handleMove(0, "play", ["4♦"])).toEqual({ ok: false, error: "You are eliminated" });
  });

  it("rejects moves once the match is over", () => {
    game.state = { ...game.state, gameState: GAME_STATES.GAME_OVER };
    expect(game.handleMove(0, "play", ["3♦"])).toEqual({ ok: false, error: "Game is not active" });
    game.state = null;
    expect(game.handleMove(0, "play", ["3♦"])).toEqual({ ok: false, error: "Game is not active" });
  });

  it("uses the server's copy of the cards, not the client's", () => {
    const forged = { id: "3♦", rank: "2", suit: "♠", rankValue: 12, suitValue: 3 };
    expect(game.handleMove(0, "play", [forged])).toEqual({ ok: true });
    expect(game.state.currentPlay.cards[0].rank).toBe("3");
  });

  it("accepts card ids and card objects", () => {
    expect(game.handleMove(0, "play", [{ id: "3♦" }, "3♣"])).toEqual({ ok: true });
    expect(ids(game.state.currentPlay.cards)).toEqual(["3♦", "3♣"]);
    expect(ids(game.state.players[0].hand)).toEqual(["9♠"]);
  });

  it("passes and broadcasts", () => {
    game.handleMove(0, "play", ["3♦"]);
    let broadcasts = 0;
    game.onState = () => broadcasts++;
    expect(game.handleMove(1, "pass")).toEqual({ ok: true });
    expect(game.state.currentPlayerIndex).toBe(2);
    expect(broadcasts).toBe(1);
  });
});

describe("seats and rematches", () => {
  it("replaceSeat hands a seat to a CPU, which then plays on its timer", () => {
    const { game } = newGame();
    rig(game, { hands: ["3♦ 9♠", "4♦ 5♦", "6♦", "7♦"], current: 0 });
    game.replaceSeat(0, { type: "AI", name: "P0 (CPU)" });
    expect(game.state.players[0]).toMatchObject({ type: "AI", name: "P0 (CPU)", socketId: null, avatar: null });
    vi.advanceTimersByTime(DEFAULT_DELAYS.aiTurn);
    expect(game.state.moveHistory.at(-1)).toMatchObject({ type: "PLAY", playerIndex: 0 });
    game.destroy();
  });

  it("replaceSeat ignores a seat that doesn't exist", () => {
    const { game, calls } = newGame();
    game.replaceSeat(9, { type: "AI", name: "X" });
    expect(calls.state).toBe(1);
    game.destroy();
  });

  it("rematch is refused mid-match and starts match 2 after game over", () => {
    const { game } = newGame();
    expect(game.rematch()).toEqual({ ok: false, error: "Match is still in progress" });
    rig(game, { hands: ["3♦", "", "4♦", ""], scores: [0, 30, 24, 30], eliminated: [false, true, false, true], current: 0, matchWins: [1, 0, 0, 0] });
    game.handleMove(0, "play", ["3♦"]);
    expect(game.rematch()).toEqual({ ok: true });
    const s = game.state;
    expect(s.matchNumber).toBe(2);
    expect(s.matchWins).toEqual([2, 0, 0, 0]);
    expect(s.gameState).toBe(GAME_STATES.PLAYING);
    expect(s.players.every((p) => p.score === 0 && !p.isEliminated && p.hand.length === 13)).toBe(true);
    expect(s.players.map((p) => p.name)).toEqual(["P0", "P1", "P2", "P3"]);
    game.destroy();
  });

  it("destroy stops every timer and later callbacks do nothing", () => {
    const { game } = newGame({ seats: [0, 1, 2, 3].map((i) => ({ type: "AI", name: `C${i}` })) });
    const before = game.state;
    game.destroy();
    vi.runAllTimers();
    expect(game.state).toBe(before);
  });
});

describe("redactState", () => {
  const s = stateWith(logic, { hands: ["3♦ 4♦", "5♦", "6♦ 7♦ 8♦", ""] });

  it("shows a player only their own hand, with counts for the rest", () => {
    const r = redactState(s, 2);
    expect(ids(r.players[2].hand)).toEqual(["6♦", "7♦", "8♦"]);
    expect(r.players[0].hand).toEqual([{ hidden: true }, { hidden: true }]);
    expect(r.players[1].hand).toEqual([{ hidden: true }]);
    expect(r.players[3].hand).toEqual([]);
    expect(JSON.stringify(r)).not.toContain("3♦");
  });

  it("a spectator sees no hands", () => {
    const r = redactState(s, -1);
    r.players.forEach((p) => p.hand.forEach((c) => expect(c).toEqual({ hidden: true })));
  });

  it("doesn't touch the real state", () => {
    redactState(s, 0);
    expect(ids(s.players[1].hand)).toEqual(["5♦"]);
  });
});
