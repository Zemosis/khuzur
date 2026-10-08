// The poker table page. Online, real engine states go through the server's
// own view function; practice runs a real table in the browser.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import GamePoker from "../../src/pages/poker/GamePoker";
import { act as play, viewFor } from "../../src/utils/poker/engine.js";
import { tableWith, dealt } from "../helpers/poker.js";

const { handlers, fakeSocket } = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
    fakeSocket: {
      connected: true,
      id: "sock-1",
      on: (ev, fn) => (handlers[ev] ||= new Set()).add(fn),
      off: (ev, fn) => handlers[ev]?.delete(fn),
      emit: vi.fn(),
      timeout: () => ({ emit: () => {} }),
    },
  };
});
vi.mock("../../src/utils/socket", () => ({ socket: fakeSocket, connectSocket: () => Promise.resolve() }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ identity: { name: "ME", tag: "0003", avatar: "2", customAvatar: null } }),
}));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, ping: 42 }) }));

const LOBBY = "PUB-PK0001";
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));
const emitted = (ev) => fakeSocket.emit.mock.calls.filter(([e]) => e === ev).map(([, d]) => d);

// You (seat 0, "ME #0003") on the button against ANN (2): you act first heads-up.
const named = (s) => ({ ...s, seats: s.seats.map((p, i) => p && { ...p, name: ["ME #0003", "BOB #0002", "ANN #0001", "Bot Saturn", "Bot Venus", "Bot Mars"][i] }) });
const hand = (opts = {}) => named(dealt(tableWith([1000, null, 1000, null, null, null]), { button: 0, holes: { 0: "A♠ A♦", 2: "K♠ K♦" }, board: "2♣ 7♦ 9♥ J♠ 3♣", ...opts }));
const view = (s, extra = {}) => ({ ...viewFor(s, 0), turnMsLeft: s.turn === 0 ? 20000 : null, started: true, amHost: true, ...extra });

const open = (state = { lobbyId: LOBBY, playerName: "ME #0003" }) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/game-poker", state }]}>
      <Routes>
        <Route path="/game-poker" element={<GamePoker />} />
        <Route path="/lobby-poker" element={<div>POKER LOBBY</div>} />
        <Route path="/" element={<div>MAIN MENU</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => fakeSocket.emit.mockClear());

describe("poker table online", () => {
  it("joins, then shows your cards, the other hand face down and your turn", async () => {
    open();
    await act(async () => {});
    expect(emitted("join_lobby")).toEqual([{ lobbyId: LOBBY, playerName: "ME #0003" }]);
    serverSends("poker_state", view(hand()));
    const faces = screen.getByLabelText("Your cards").querySelectorAll(".pixel-card:not(.pixel-card-back)");
    expect([...faces].map((c) => c.textContent)).toEqual([expect.stringContaining("A♠"), expect.stringContaining("A♦")]);
    expect(screen.getByLabelText("ANN's cards").querySelectorAll(".pixel-card-back")).toHaveLength(2);
    expect(screen.getByText("Pair of aces")).toBeInTheDocument();
    expect(document.querySelector('[data-your-turn="true"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: /CALL 5/ })).toBeInTheDocument();
  });

  it("your move goes to the server as poker_move", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(hand()));
    await userEvent.click(screen.getByRole("button", { name: /CALL 5/ }));
    expect(emitted("poker_move")).toEqual([{ lobbyId: LOBBY, move: { type: "call" } }]);
  });

  it("waits for the other player, with their turn clock running", async () => {
    open();
    await act(async () => {});
    const s = play(hand(), 0, { type: "call" });
    serverSends("poker_state", { ...view(s), turnMsLeft: 12000 });
    expect(screen.getAllByText(/Waiting for ANN/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("turn-clock").style.animationDuration).toBe("12000ms");
    expect(screen.queryByRole("button", { name: /FOLD/ })).not.toBeInTheDocument();
  });

  it("the hand's result names the winner, and the log tells the story", async () => {
    open();
    await act(async () => {});
    let s = hand();
    serverSends("poker_state", view(s));
    s = play(s, 0, { type: "raise", amount: 40 });
    s = play(s, 2, { type: "fold" });
    serverSends("poker_state", view(s));
    expect(screen.getAllByText(/ME wins 50/).length).toBeGreaterThan(0);
    // jsdom's window is a compact layout: the sidebar is a drawer to open first.
    await userEvent.click(screen.getByRole("button", { name: /^Scoreboard and chat/ }));
    await userEvent.click(screen.getByRole("tab", { name: "LOG" }));
    expect(screen.getByText("ME raises to 40")).toBeInTheDocument();
    expect(screen.getByText("ANN folds")).toBeInTheDocument();
  });

  it("the host gets START and CLOSE TABLE; REBUY shows when you're out of chips", async () => {
    open();
    await act(async () => {});
    const waiting = named(tableWith([1000, null, 1000, null, null, null]));
    serverSends("poker_state", { ...view(waiting), started: false });
    await userEvent.click(screen.getByRole("button", { name: "START" }));
    expect(emitted("start_game")).toEqual([{ lobbyId: LOBBY }]);
    await userEvent.click(screen.getAllByRole("button", { name: "+ CPU" })[0]);
    expect(emitted("add_cpu")[0]).toMatchObject({ lobbyId: LOBBY, level: "MEDIUM" });
    const broke = { ...waiting, seats: waiting.seats.map((p, i) => (i === 0 ? { ...p, stack: 0, sittingOut: true } : p)) };
    serverSends("poker_state", view(broke));
    await userEvent.click(screen.getByRole("button", { name: "REBUY" }));
    expect(emitted("poker_rebuy")).toEqual([{ lobbyId: LOBBY }]);
    await userEvent.click(screen.getByRole("button", { name: "CLOSE TABLE" }));
    expect(emitted("close_table")).toEqual([{ lobbyId: LOBBY }]);
  });

  it("a rejected move shows why; leaving the table goes back to the lobby", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(hand()));
    serverSends("move_rejected", { reason: "Raise to at least 20" });
    expect(screen.getByText("Raise to at least 20")).toBeInTheDocument();
    serverSends("table_left", { reason: "away" });
    expect(screen.getByText("POKER LOBBY")).toBeInTheDocument();
  });
});

describe("poker on a phone", () => {
  const size = { w: window.innerWidth, h: window.innerHeight };
  beforeEach(() => Object.assign(window, { innerWidth: 390, innerHeight: 844 }));
  afterEach(() => Object.assign(window, { innerWidth: size.w, innerHeight: size.h }));

  it("the five other seats and the five board cards fit across a 390px screen", async () => {
    open();
    await act(async () => {});
    const five = named(dealt(tableWith([1000, 1000, 1000, 1000, 1000, 1000]), { button: 0, board: "2♣ 7♦ 9♥ J♠ 3♣" }));
    let s = five;
    for (const seat of [3, 4, 5, 0, 1]) s = play(s, seat, { type: "call" });
    s = play(s, 2, { type: "check" }); // the flop is out
    serverSends("poker_state", view({ ...s, mySeat: 0 }));
    const plates = [...document.querySelectorAll("[data-seat-plate]")].map((el) => parseInt(el.style.width, 10));
    expect(plates).toHaveLength(5);
    expect(plates.reduce((a, w) => a + w, 0) + 4 * 6).toBeLessThanOrEqual(390 - 16);
    const board = [...screen.getByLabelText("Board").children].map((el) => parseInt(el.style.width, 10));
    expect(board.reduce((a, w) => a + w, 0) + 4 * 6).toBeLessThanOrEqual(300);
  });
});

describe("poker practice", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("seats you with five CPUs and deals you in", async () => {
    open({ lobbyId: "SOLO-ABC123", playerName: "ME #0003", aiDifficulty: "EASY" });
    expect(screen.getByText(/PRACTICE · EASY/)).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(2000));
    expect(screen.getByLabelText("Your cards").querySelectorAll(".pixel-card")).toHaveLength(2);
    expect(screen.getByLabelText("Scoreboard")).toHaveTextContent("Bot Saturn");
    expect(fakeSocket.emit).not.toHaveBeenCalled();
  });
});
