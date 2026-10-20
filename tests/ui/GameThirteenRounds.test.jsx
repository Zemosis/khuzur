// The end of a Thirteen round, online and in practice: the winning play stays
// on the felt before the scores cover it (unless you load into a finished
// round), and practice deals the next round by itself.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import GameThirteen from "../../src/pages/thirteen/GameThirteen";
import { playCards } from "../../src/utils/gameLogic.js";
import { cards, stateWith } from "../helpers/cards.js";
import * as logic from "../../src/utils/gameLogic.js";

const { handlers, fakeSocket, deals } = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
    deals: { next: null },
    fakeSocket: {
      id: "sock-1",
      connected: true,
      on: (ev, fn) => (handlers[ev] ||= new Set()).add(fn),
      off: (ev, fn) => handlers[ev]?.delete(fn),
      emit: vi.fn(),
    },
  };
});
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));

vi.mock("../../src/utils/socket", () => ({ socket: fakeSocket, connectSocket: () => Promise.resolve() }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, ping: 5 }) }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ identity: { name: "ME", tag: "0001", avatar: "1", customAvatar: null } }),
}));
// Practice deals the hands a test sets (deals.next), else a real shuffle.
vi.mock("../../src/utils/deckUtils", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, initializeGame: () => (deals.next ? { hands: deals.next() } : real.initializeGame()) };
});

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

const open = (state) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/game-13", state }]}>
      <Routes>
        <Route path="/game-13" element={<GameThirteen />} />
      </Routes>
    </MemoryRouter>,
  );
const online = () => open({ lobbyId: "PUB-ABC123", isHost: true, playerName: "ME #0001" });
const practice = () => open({ lobbyId: "SOLO-TEST", isHost: true, playerName: "ME", aiDifficulty: "EASY" });
const yourTurn = () => screen.findByText(/Your turn!/, {}, { timeout: 8000 });
const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));
const cardEl = (container, id) => container.querySelector(`[data-card-id="${id}"] .pixel-card`);

beforeEach(() => {
  fakeSocket.emit.mockClear();
  deals.next = null;
  for (const k of Object.keys(handlers)) delete handlers[k];
});

describe("the end of a Thirteen round", () => {
  it("online: the winning play shows before the scores cover it", async () => {
    const s1 = stateWith(logic, { hands: ["2♠", "4♣ 6♣", "8♦ 10♦", "5♠ J♣"], current: 0 });
    online();
    await act(async () => {});
    serverSends("game_state_update", view(s1));
    await yourTurn();

    serverSends("game_state_update", view(playCards(s1, cards("2♠")).newState));
    await wait(1000);
    expect(screen.queryByText(/ROUND 1 COMPLETE/)).not.toBeInTheDocument();
    expect(await screen.findByText(/ROUND 1 COMPLETE/, {}, { timeout: 3000 })).toBeInTheDocument();
  }, 20000);

  it("online: loading into a finished round shows its scores at once", async () => {
    const s1 = stateWith(logic, { hands: ["2♠", "4♣ 6♣", "8♦ 10♦", "5♠ J♣"], current: 0 });
    online();
    await act(async () => {});
    serverSends("game_state_update", view(playCards(s1, cards("2♠")).newState));
    expect(await screen.findByText(/ROUND 1 COMPLETE/, {}, { timeout: 500 })).toBeInTheDocument();
  }, 20000);

  it("practice: you open on a dealt hand, play, and the next round deals by itself", async () => {
    // You hold just the 3♦: playing it wins the round.
    deals.next = () => [cards("3♦"), cards("4♣ 6♣ 9♥"), cards("8♦ 10♦ Q♠"), cards("5♠ J♣ K♥")];
    const { container } = practice();
    await yourTurn();
    expect(cardEl(container, "3♦")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(cardEl(container, "3♦"));
    await user.click(screen.getByRole("button", { name: /^PLAY/ }));
    expect(await screen.findByText(/ROUND 1 COMPLETE/, {}, { timeout: 4000 })).toBeInTheDocument();

    // The next round: the scores go and a fresh hand is dealt.
    deals.next = () => [cards("3♦ 7♥"), cards("4♣ 6♣ 9♥"), cards("8♦ 10♦ Q♠"), cards("5♠ J♣ K♥")];
    await waitFor(() => expect(screen.queryByText(/ROUND 1 COMPLETE/)).not.toBeInTheDocument(), { timeout: 8000 });
    await yourTurn();
    expect(cardEl(container, "7♥")).toBeTruthy();
  }, 30000);
});
