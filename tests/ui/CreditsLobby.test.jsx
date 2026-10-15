// The Poker lobby's CREDITS tab and invite links to credit tables: balance and
// CLAIM, credit tables only, hosting with a tier, and the buy-in panel.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LobbyPoker from "../../src/pages/poker/LobbyPoker";
import JoinTable from "../../src/pages/JoinTable";

const { handlers, fakeSocket, auth, apiMock } = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
    auth: { isGuest: false },
    apiMock: vi.fn(),
    fakeSocket: {
      connected: true,
      on: (ev, fn) => (handlers[ev] ||= new Set()).add(fn),
      off: (ev, fn) => handlers[ev]?.delete(fn),
      emit: vi.fn(),
      timeout: () => ({ emit: () => {} }),
    },
  };
});
vi.mock("../../src/utils/socket", () => ({ socket: fakeSocket, connectSocket: () => Promise.resolve() }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ identity: { name: "ANN", tag: "0001", avatar: "1", level: 1, exp: 0 }, isGuest: auth.isGuest, loading: false }),
}));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, online: 2 }) }));
vi.mock("../../src/lib/api", () => ({ api: apiMock }));

const ME = { balance: 2340, onTable: 0, canPlay: true, whyNot: null, claim: { state: "over" }, seat: null, rathole: { LOW: null, MID: null, HIGH: null }, notice: null, rank: 57 };
const TABLES = [
  { id: "PUB-FREE01", name: "Free Felt", host: "A #1", current: 2, max: 6, inProgress: true, tier: null },
  { id: "PUB-MID001", name: "Mid Stakes", host: "B #2", current: 3, max: 6, inProgress: true, tier: "MID" },
];
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));
const emitted = (ev) => fakeSocket.emit.mock.calls.filter(([e]) => e === ev).map(([, d]) => d);
const settle = () => act(async () => {});

async function openCredits(me = ME) {
  apiMock.mockImplementation(async (path) => (path === "/claim" ? { ...me, balance: 1000, claim: { state: "wait", nextAt: new Date(Date.now() + 86_400_000).toISOString() } } : me));
  render(
    <MemoryRouter>
      <LobbyPoker />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole("tab", { name: "Credits" }));
  await settle();
  serverSends("public_lobbies_update", TABLES);
}
const row = (name) => screen.getByText(name).closest("[data-table]");

beforeEach(() => {
  fakeSocket.emit.mockClear();
  apiMock.mockReset();
  auth.isGuest = false;
});

describe("the CREDITS tab", () => {
  it("shows your balance and claim, and only credit tables, tagged with their stakes", async () => {
    await openCredits();
    expect(screen.getByText("2,340")).toBeInTheDocument();
    expect(screen.getByText("Over 1,000: nothing to claim")).toBeInTheDocument();
    expect(screen.queryByText("Free Felt")).toBeNull();
    expect(row("Mid Stakes")).toHaveTextContent("MID 25/50");
    expect(apiMock).toHaveBeenCalledWith("/me", { base: "/api/credits" });
  });

  it("the FREE tab keeps free tables and practice", async () => {
    await openCredits();
    await userEvent.click(screen.getByRole("tab", { name: "Free" }));
    serverSends("public_lobbies_update", TABLES);
    expect(screen.getByText("Free Felt")).toBeInTheDocument();
    expect(screen.queryByText("Mid Stakes")).toBeNull();
    expect(screen.getByText("Practice vs CPU")).toBeInTheDocument();
  });

  it("JOIN opens the buy-in panel for that table and SIT sends the amount; a refusal shows in the panel", async () => {
    await openCredits();
    await userEvent.click(within(row("Mid Stakes")).getByRole("button", { name: "Join" }));
    const dialog = screen.getByRole("dialog", { name: "Buy in · MID 25/50" });
    const input = within(dialog).getByLabelText("Credits to bring");
    expect(input).toHaveValue(1000);
    await userEvent.clear(input);
    await userEvent.type(input, "2000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sit with 2,000" }));
    expect(emitted("join_lobby")).toEqual([{ lobbyId: "PUB-MID001", playerName: "ANN #0001", buyIn: 2000 }]);
    expect(within(dialog).getByRole("button", { name: "..." })).toBeDisabled();
    serverSends("error_message", "You're already at table Felt");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("You're already at table Felt");
  });

  it("an amount past the maximum snaps back to it", async () => {
    await openCredits();
    await userEvent.click(within(row("Mid Stakes")).getByRole("button", { name: "Join" }));
    const input = screen.getByLabelText("Credits to bring");
    await userEvent.clear(input);
    await userEvent.type(input, "999999");
    input.blur();
    await settle();
    expect(input).toHaveValue(2340);
  });

  it("a raised minimum says why", async () => {
    await openCredits({ ...ME, rathole: { ...ME.rathole, MID: { amount: 1800, until: "2026-10-15T14:52:00Z" } } });
    await userEvent.click(within(row("Mid Stakes")).getByRole("button", { name: "Join" }));
    expect(screen.getByRole("note")).toHaveTextContent("You left a MID table with 1,800. Minimum is 1,800 until");
    expect(screen.getByLabelText("Credits to bring")).toHaveValue(1800);
  });

  it("when you can't afford it, SIT is off, it says why, and CLAIM is right there", async () => {
    await openCredits({ ...ME, balance: 500, claim: { state: "ready", amount: 500 } });
    await userEvent.click(within(row("Mid Stakes")).getByRole("button", { name: "Join" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Your balance is 500; this table's minimum is 1,000.");
    expect(within(dialog).getByRole("button", { name: "Sit with 1,000" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Claim +500" })).toBeInTheDocument();
  });

  it("hosting picks a tier, then a buy-in, then creates the table", async () => {
    await openCredits();
    await userEvent.click(screen.getByRole("radio", { name: /MID/ }));
    await userEvent.click(screen.getByRole("button", { name: /Public/ }));
    const dialog = screen.getByRole("dialog", { name: "Buy in · MID 25/50" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Sit with 1,000" }));
    expect(emitted("create_lobby")).toEqual([{ lobbyName: "High Rollers", playerName: "ANN #0001", isPrivate: false, gameType: "poker", tier: "MID", buyIn: 1000 }]);
  });

  it("a code for a credit table asks for a buy-in", async () => {
    await openCredits();
    serverSends("credit_table_info", { lobbyId: "PRV123", name: "Friends", tier: "LOW" });
    const dialog = screen.getByRole("dialog", { name: "Buy in · LOW 5/10" });
    expect(dialog).toHaveTextContent("Friends");
  });

  it("CLAIM tops you up, then shows when the next one comes", async () => {
    await openCredits({ ...ME, balance: 340, claim: { state: "ready", amount: 660 } });
    await userEvent.click(screen.getByRole("button", { name: "Claim +660" }));
    expect(apiMock).toHaveBeenCalledWith("/claim", { method: "POST", base: "/api/credits" });
    expect(await screen.findByText("Next claim in 24h 0m")).toBeInTheDocument();
  });

  it("a guest is asked to sign in, and can't host", async () => {
    auth.isGuest = true;
    await openCredits();
    expect(screen.getByText("Sign in to play for credits.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Public/ })).toBeDisabled();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("an email-only account is told how to play", async () => {
    await openCredits({ ...ME, canPlay: false, whyNot: "Link Google or Discord to play for credits" });
    expect(screen.getByText("Link Google or Discord to play for credits")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Private/ })).toBeDisabled();
  });

  it("after a restart it says where your credits went", async () => {
    await openCredits({ ...ME, notice: { amount: 2340, tableName: "HIGH ROLLERS" } });
    expect(screen.getByText("The server restarted. Your 2,340 credits from table HIGH ROLLERS are back in your balance.")).toBeInTheDocument();
  });
});

describe("an invite link to a credit table", () => {
  it("shows the buy-in panel, then joins with the amount", async () => {
    apiMock.mockResolvedValue(ME);
    render(
      <MemoryRouter initialEntries={["/join/FRN123"]}>
        <Routes>
          <Route path="/join/:code" element={<JoinTable />} />
        </Routes>
      </MemoryRouter>,
    );
    await settle();
    expect(emitted("join_lobby")).toEqual([{ lobbyId: "FRN123", playerName: "ANN #0001" }]);
    serverSends("credit_table_info", { lobbyId: "FRN123", name: "Friends", tier: "LOW" });
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Buy in · LOW 5/10" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Max" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Sit with 1,000" }));
    expect(emitted("join_lobby").at(-1)).toEqual({ lobbyId: "FRN123", playerName: "ANN #0001", buyIn: 1000 });
  });
});
