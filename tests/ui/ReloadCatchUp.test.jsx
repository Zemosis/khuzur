// Reloading (or joining) a table mid-match: the page gets the whole match so
// far in its first state. It must catch up silently and at once, not replay
// every past move's sound, and from then on sound each new move as usual.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import GameThirteen from "../../src/pages/thirteen/GameThirteen";
import GameMuushig from "../../src/pages/muushig/GameMuushig";
import { cards, stateWith, seededRandom } from "../helpers/cards.js";
import * as logic from "../../src/utils/gameLogic.js";
import { PHASES, collectTrick, createMatch, startNextRound as nextMuushigRound } from "../../src/utils/muushig/engine.js";
import { aiAction, applyAction } from "../../src/utils/muushig/ai.js";
import { muushigView } from "../../server/game/muushigGame.js";

const { handlers, fakeSocket, played } = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
    played: [],
    fakeSocket: {
      id: "sock-1",
      connected: true,
      on: (ev, fn) => (handlers[ev] ||= new Set()).add(fn),
      off: (ev, fn) => handlers[ev]?.delete(fn),
      emit: vi.fn(),
      timeout: () => ({ emit: () => {} }),
    },
  };
});
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));

vi.mock("../../src/utils/socket", () => ({ socket: fakeSocket, connectSocket: () => Promise.resolve() }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, ping: 5 }) }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ identity: { name: "ME", tag: "0001", avatar: "1", customAvatar: null } }),
}));
// Every sound the page asks for, by name.
vi.mock("../../src/utils/SoundManager", () => {
  const soundManager = new Proxy({ context: null }, { get: (t, k) => (k in t ? t[k] : () => played.push(k)) });
  return { soundManager, default: soundManager };
});

const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));
const snaps = () => played.filter((s) => s === "playSnap").length;

beforeEach(() => {
  played.length = 0;
  fakeSocket.emit.mockClear();
  for (const k of Object.keys(handlers)) delete handlers[k];
});

describe("Thirteen, reloaded mid-match", () => {
  const NAMES = ["ME #0001", "Bot Saturn", "FRIEND #0002", "Bot Venus"];
  const view = (s) => ({
    ...s,
    players: s.players.map((p, i) => ({
      ...p,
      name: NAMES[i],
      type: i === 0 || i === 2 ? "HUMAN" : "AI",
      socketId: i === 0 ? "sock-1" : null,
      hand: i === 0 ? p.hand : p.hand.map(() => ({ hidden: true })),
    })),
    amHost: true,
    dealMsLeft: 0,
  });
  const play = (playerIndex, ids) => ({ type: "PLAY", playerIndex, cards: cards(ids), combination: { type: "SINGLE" } });
  // A round already played out, then the current round two plays in.
  const pastMoves = [
    play(0, "3♣"), play(1, "5♣"), play(2, "8♣"), play(3, "J♣"),
    { type: "ROUND_END", winnerIndex: 3, scores: [] },
    { type: "NEW_ROUND", roundNumber: 2, dealer: 2 },
    play(3, "4♠"), play(0, "6♠"),
  ];
  const open = () =>
    render(
      <MemoryRouter initialEntries={[{ pathname: "/game-13", state: { lobbyId: "PUB-ABC123", isHost: true, playerName: "ME #0001" } }]}>
        <Routes>
          <Route path="/game-13" element={<GameThirteen />} />
        </Routes>
      </MemoryRouter>,
    );

  it("catches up without replaying past moves' sounds, then sounds the next move", async () => {
    const s = stateWith(logic, {
      hands: ["7♦ 9♦ K♦", "Q♥ A♥", "10♠ 2♣", "5♥ 9♥"],
      current: 1,
      currentPlay: { type: "SINGLE", cards: cards("6♠") },
      lastPlayedBy: 0,
      roundNumber: 2,
      moveHistory: pastMoves,
    });
    open();
    await act(async () => {});
    serverSends("game_state_update", view(s));
    await wait(1500);
    expect(snaps()).toBe(0);
    expect(played).not.toContain("playDeal");

    serverSends("game_state_update", view({ ...s, current: 2, moveHistory: [...pastMoves, play(1, "Q♥")] }));
    await wait(200);
    expect(snaps()).toBe(1);
  }, 10000);

  it("a match that starts while you watch still sounds its first play", async () => {
    const s = stateWith(logic, { hands: ["7♦ 9♦", "3♦ A♥", "10♠ 2♣", "5♥ 9♥"], current: 1 });
    open();
    await act(async () => {});
    serverSends("game_state_update", view(s));
    await wait(200);
    serverSends("game_state_update", view({ ...s, moveHistory: [play(1, "3♦")] }));
    await wait(200);
    expect(snaps()).toBe(1);
  }, 10000);
});

describe("Muushig, reloaded mid-round", () => {
  const NAMES = ["ANN #0001", "BOB #0002", "ME #0003", "Bot Saturn", "Bot Venus"];
  const ME = 2;
  const players = () => NAMES.map((name, i) => ({ name, type: i < 3 ? "HUMAN" : "AI", level: i < 3 ? null : "MEDIUM" }));
  /** Plays every seat with the CPU's choice until `test(state)`. */
  function playUntil(s, test, rng = seededRandom(5)) {
    for (let i = 0; i < 5000 && !test(s); i++) {
      if (s.phase === PHASES.TRICK_END) s = collectTrick(s);
      else if (s.phase === PHASES.ROUND_END) s = nextMuushigRound(s, rng);
      else s = applyAction(s, aiAction(s, rng), rng);
    }
    if (!test(s)) throw new Error("never got there");
    return s;
  }
  const view = (s) => ({ ...muushigView(s, ME), amHost: false, dealMsLeft: 0 });

  it("catches up without a burst of past card sounds", async () => {
    // Deep into a later round: plenty of card plays already in the log.
    const s = playUntil(createMatch({ players: players(), rng: seededRandom(11) }), (st) => st.roundNumber >= 2 && st.phase === PHASES.PLAY && st.events.filter((e) => e.type === "play").length > 8);
    render(
      <MemoryRouter initialEntries={[{ pathname: "/game-muushig", state: { lobbyId: "PUB-MU0001", playerName: "ME #0003" } }]}>
        <Routes>
          <Route path="/game-muushig" element={<GameMuushig />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    serverSends("muushig_state", view(s));
    await wait(300);
    expect(snaps()).toBe(0);
  }, 10000);
});
