// A credit table's page: stakes in the header, no CPUs, ADD CHIPS and REBUY
// through the buy-in panel, waiting for the big blind, saving and closing,
// and LEAVE saying where your credits go.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import GamePoker from "../../src/pages/poker/GamePoker";
import { act as play, viewFor } from "../../src/utils/poker/engine.js";
import { tableWith, dealt } from "../helpers/poker.js";

const { handlers, fakeSocket, apiMock } = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
    apiMock: vi.fn(),
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
  useAuth: () => ({ identity: { name: "ME", tag: "0003", avatar: "2", customAvatar: null }, isGuest: false, loading: false }),
}));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, ping: 42 }) }));
vi.mock("../../src/lib/api", () => ({ api: apiMock }));

const LOBBY = "PUB-PK0001";
const ME = { balance: 2340, onTable: 500, canPlay: true, whyNot: null, claim: { state: "over" }, seat: null, rathole: { LOW: null, MID: null, HIGH: null }, notice: null, rank: null };
const CREDIT = { waitForBigBlind: true, allInPlaysOut: true };
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));
const emitted = (ev) => fakeSocket.emit.mock.calls.filter(([e]) => e === ev).map(([, d]) => d);
const named = (s) => ({ ...s, seats: s.seats.map((p, i) => p && { ...p, name: ["ME #0003", "BOB #0002", "ANN #0001"][i] ?? `P${i}` }) });
const between = () => named(tableWith([500, null, 500, null, null, null], CREDIT));
const inHand = () => named(dealt(tableWith([500, null, 500, null, null, null], CREDIT), { button: 0, holes: { 0: "A♠ A♦", 2: "K♠ K♦" } }));
const patchMe = (s, patch) => ({ ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...patch } : p)) });
const view = (s, extra = {}) => ({ ...viewFor(s, 0), turnMsLeft: null, started: true, amHost: true, tier: "LOW", saving: false, closingAfterHand: false, ...extra });

function Lobby() {
  return <div>POKER LOBBY {useLocation().state?.tab ?? "free"}</div>;
}
const open = () =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/game-poker", state: { lobbyId: LOBBY, playerName: "ME #0003" } }]}>
      <Routes>
        <Route path="/game-poker" element={<GamePoker />} />
        <Route path="/lobby-poker" element={<Lobby />} />
        <Route path="/" element={<div>MAIN MENU</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  fakeSocket.emit.mockClear();
  apiMock.mockReset();
  apiMock.mockResolvedValue(ME);
});

describe("a credit table", () => {
  it("shows its stakes and offers no CPUs", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(between()));
    expect(screen.getByText(/LOW 5\/10 · #PK0001/)).toBeInTheDocument();
    expect(screen.queryByText("+ CPU")).toBeNull();
  });

  it("between hands, ADD CHIPS opens the panel up to the table max and sends the amount", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(between()));
    await userEvent.click(screen.getByRole("button", { name: "ADD CHIPS" }));
    const dialog = await screen.findByRole("dialog", { name: "Add chips · LOW 5/10" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Max" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Add 500" }));
    expect(emitted("poker_add_chips")).toEqual([{ lobbyId: LOBBY, amount: 500 }]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers no ADD CHIPS while you're in a hand", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(inHand()));
    expect(screen.queryByRole("button", { name: "ADD CHIPS" })).toBeNull();
  });

  it("shows chips waiting to land, and says when you're waiting for the big blind", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(patchMe(between(), { pending: 300 })));
    expect(screen.getByText("+300 next hand")).toBeInTheDocument();
    expect(screen.getByText("Waiting for the big blind to reach you")).toBeInTheDocument();
  });

  it("says when it's saving, and when it closes after this hand", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(play(inHand(), 0, { type: "call" }), { saving: true }));
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    serverSends("poker_state", view(play(inHand(), 0, { type: "call" }), { closingAfterHand: true }));
    expect(screen.getByText("Table closing after this hand")).toBeInTheDocument();
  });

  it("LEAVE asks first and says where your credits go", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(patchMe(between(), { pending: 200 })));
    await userEvent.click(screen.getByRole("button", { name: "Exit" }));
    const dialog = screen.getByRole("dialog", { name: "Leave the table?" });
    expect(dialog).toHaveTextContent("Your 700 credits go back to your balance.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(emitted("leave_lobby")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Exit" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Leave" }));
    expect(emitted("leave_lobby")).toEqual([{ lobbyId: LOBBY }]);
  });

  it("all-in, LEAVE says the hand plays out for you", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(play(inHand(), 0, { type: "allin" })));
    await userEvent.click(screen.getByRole("button", { name: "Exit" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("You're all-in: the hand plays out, and whatever it wins goes to your balance.");
  });

  it("busted, REBUY opens the panel from the table minimum", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(patchMe(between(), { stack: 0, sittingOut: true })));
    await userEvent.click(screen.getByRole("button", { name: "REBUY" }));
    const dialog = await screen.findByRole("dialog", { name: "Rebuy · LOW 5/10" });
    expect(within(dialog).getByLabelText("Credits to bring")).toHaveValue(200);
  });

  it("back on the page without a seat, the server asks for a buy-in and you can sit again", async () => {
    open();
    await act(async () => {});
    serverSends("credit_table_info", { lobbyId: LOBBY, name: "Felt", tier: "LOW" });
    const dialog = await screen.findByRole("dialog", { name: "Buy in · LOW 5/10" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Sit with 200" }));
    expect(emitted("join_lobby").at(-1)).toEqual({ lobbyId: LOBBY, playerName: "ME #0003", buyIn: 200 });
  });

  it("leaving goes back to the lobby's CREDITS tab", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(between()));
    await userEvent.click(screen.getByRole("button", { name: "Exit" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Leave" }));
    expect(screen.getByText("POKER LOBBY credits")).toBeInTheDocument();
  });

  it("closed or stood up, it goes back to the CREDITS tab too", async () => {
    open();
    await act(async () => {});
    serverSends("poker_state", view(between()));
    serverSends("table_left", { reason: "closed" });
    expect(screen.getByText("POKER LOBBY credits")).toBeInTheDocument();
  });
});
