import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Admin from "../../src/pages/Admin";

const { apiMock, connectSocket } = vi.hoisted(() => ({ apiMock: vi.fn(), connectSocket: vi.fn() }));
vi.mock("../../src/lib/api", () => ({ api: apiMock }));
vi.mock("../../src/utils/socket", () => ({ socket: {}, connectSocket }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, online: 1 }) }));
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ identity: { name: "BOSS", tag: "0001", avatar: "1" }, isGuest: false, loading: false }) }));

const ANN = "00000000-0000-4000-8000-0000000000a1";
const BOB = "00000000-0000-4000-8000-0000000000b2";
const CHECK = { balances: 9000, atTables: 1000, granted: 10000, claimed: 500, removed: 500, ok: true };
const FLAG = { loser: ANN, winner: BOB, loserName: "ANN #0001", winnerName: "BOB #0001", flow: 1200, back: 0, share: 1, hands: 4, privateHands: 4, bigFolds: 3, lastAt: "2026-10-15T10:00:00Z", loserSince: "2026-10-14T10:00:00Z", loserClaims: 2 };
const PAIR = {
  hands: [
    {
      id: "7",
      playedAt: "2026-10-15T10:00:00Z",
      tier: "LOW",
      isPrivate: true,
      board: ["2♣", "7♦", "9♥", "J♠", "3♣"],
      events: [{ type: "act", seat: 0, action: "fold", street: "TURN" }],
      seats: [
        { seat: 0, user_id: ANN, name: "ANN #0001", net: -300, hole: ["A♠", "A♦"] },
        { seat: 1, user_id: BOB, name: "BOB #0001", net: 300, hole: ["7♣", "2♦"] },
      ],
    },
  ],
  accounts: [{ name: "ANN #0001", balance: 700, frozen: false }, { name: "BOB #0001", balance: 2300, frozen: false }],
};

const routes = (overrides = {}) =>
  apiMock.mockImplementation(async (path, opts = {}) => {
    if (overrides[path]) return overrides[path](opts);
    if (path === "/check") return CHECK;
    if (path === "/flags") return [FLAG];
    if (path.startsWith("/pairs/")) return PAIR;
    if (path === "/reverse") return { recovered: 1200, requested: 1200 };
    return {};
  });
const open = async () => {
  render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>,
  );
  await act(async () => {});
};

// Braces: a function returned from beforeEach is run as teardown, and mockReset returns the mock.
beforeEach(() => {
  apiMock.mockReset();
});

describe("admin page", () => {
  it("is the not-found page for anyone the server doesn't let in", async () => {
    apiMock.mockRejectedValue(Object.assign(new Error("Not found"), { status: 404 }));
    await open();
    expect(screen.getByText("PAGE NOT FOUND")).toBeInTheDocument();
    expect(screen.queryByText("Economy")).toBeNull();
  });

  it("shows the economy check and flagged pairs with their clues", async () => {
    routes();
    await open();
    expect(screen.getByText("OK")).toBeInTheDocument();
    const flag = screen.getByText("ANN #0001 → BOB #0001").closest("li");
    expect(flag).toHaveTextContent("1,200");
    expect(flag).toHaveTextContent("4 hands · 4 private · 3 big folds · 2 claims");
  });

  it("a pair's hands show both players' cards, and RETURN sends the amount with a note", async () => {
    routes();
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Review ANN #0001 → BOB #0001" }));
    expect(screen.getByText("A♠ A♦")).toBeInTheDocument();
    expect(screen.getByText("ANN folds")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Note"), "alt dumping");
    await userEvent.click(screen.getByRole("button", { name: "Return 1,200 to ANN #0001" }));
    expect(apiMock).toHaveBeenCalledWith("/reverse", { method: "POST", base: "/api/admin", body: { from: BOB, to: ANN, amount: 1200, note: "alt dumping" } });
    expect(await screen.findByText("Recovered 1,200 of 1,200.")).toBeInTheDocument();
  });

  it("actions stay off until there's a note", async () => {
    routes();
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Review ANN #0001 → BOB #0001" }));
    expect(screen.getByRole("button", { name: "Return 1,200 to ANN #0001" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Freeze BOB #0001" })).toBeDisabled();
  });

  it("shows a MISMATCH in red", async () => {
    routes({ "/check": () => ({ ...CHECK, ok: false }) });
    await open();
    expect(screen.getByText("MISMATCH")).toBeInTheDocument();
  });

  it("connects to the server like every other screen, so the top bar shows it online", async () => {
    routes();
    await open();
    expect(connectSocket).toHaveBeenCalledWith(expect.objectContaining({ name: "BOSS" }));
  });
});
