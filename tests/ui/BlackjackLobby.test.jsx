// The Blackjack lobby: credit tables with no buy-in (kind "house"), CREDITS
// for the tier tag, and PLAY ALONE in place of practice.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LobbyBlackjack from "../../src/pages/blackjack/LobbyBlackjack";

const { handlers, fakeSocket, apiMock } = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
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
  useAuth: () => ({ identity: { name: "ANN", tag: "0001", avatar: "1", level: 1, exp: 0 }, isGuest: false, loading: false }),
}));
vi.mock("../../src/lib/api", () => ({ api: apiMock }));

const ME = { balance: 2340, onTable: 0, canPlay: true, whyNot: null, claim: { state: "over" }, seat: null, rathole: {}, notice: null, rank: 57 };
const TABLES = [
  { id: "PUB-FREE01", name: "Free Felt", host: "A #1", current: 1, max: 5, inProgress: true, tier: null },
  { id: "PUB-BJ0001", name: "Credit Felt", host: "B #2", current: 2, max: 5, inProgress: true, tier: "HOUSE" },
];
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));
const emitted = (ev) => fakeSocket.emit.mock.calls.filter(([e]) => e === ev).map(([, d]) => d);
const settle = () => act(async () => {});

async function openLobby({ credits = false } = {}) {
  apiMock.mockImplementation(async () => ME);
  render(
    <MemoryRouter>
      <LobbyBlackjack />
    </MemoryRouter>,
  );
  if (credits) await userEvent.click(screen.getByRole("tab", { name: "Credits" }));
  await settle();
  serverSends("public_lobbies_update", TABLES);
}

beforeEach(() => {
  fakeSocket.emit.mockClear();
  apiMock.mockReset();
});

describe("the Blackjack lobby", () => {
  it("hosting a credit blackjack table emits create_lobby with tier HOUSE and no buy-in panel", async () => {
    await openLobby({ credits: true });
    expect(screen.queryByRole("radiogroup", { name: "Stakes" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Private" }));
    expect(emitted("create_lobby")).toEqual([expect.objectContaining({ gameType: "blackjack", tier: "HOUSE", isPrivate: true, lobbyName: "The House" })]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("joining a HOUSE table emits join_lobby with no buy-in panel", async () => {
    await openLobby({ credits: true });
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(emitted("join_lobby")).toEqual([expect.objectContaining({ lobbyId: "PUB-BJ0001" })]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists a Blackjack credit table as CREDITS", async () => {
    await openLobby({ credits: true });
    const row = screen.getByText("Credit Felt").closest("[data-table]");
    expect(row).toHaveTextContent("CREDITS");
    expect(document.body).not.toHaveTextContent("HOUSE");
  });

  it("PLAY ALONE on the free tab creates a private table", async () => {
    await openLobby();
    expect(screen.getByText("Play alone")).toBeInTheDocument();
    expect(screen.queryByText("Practice vs CPU")).toBeNull();
    expect(screen.getByText("A private table just for you. Friends can join with its code.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "PLAY ALONE" }));
    const [sent] = emitted("create_lobby");
    expect(sent).toMatchObject({ gameType: "blackjack", isPrivate: true, lobbyName: "The House" });
    expect(sent.tier).toBeUndefined();
  });

  it("PLAY ALONE on the credits tab creates a private HOUSE table", async () => {
    await openLobby({ credits: true });
    await userEvent.click(screen.getByRole("button", { name: "PLAY ALONE" }));
    expect(emitted("create_lobby")).toEqual([expect.objectContaining({ gameType: "blackjack", isPrivate: true, tier: "HOUSE", lobbyName: "The House" })]);
  });
});
