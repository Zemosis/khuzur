// The Khuzur lobby: the shared lobby (host, join, open tables, credits,
// practice) with the table builder on top. Every table and practice game is
// built to the shape the builder shows.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import LobbyKhuzur from "../../src/pages/khuzur/LobbyKhuzur";

const { handlers, fakeSocket } = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
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
  useAuth: () => ({ identity: { name: "LOOKER", tag: "0009", avatar: "1", level: 3, exp: 300, gold: 1250 }, isGuest: true, updateProfile: async () => {} }),
}));
vi.mock("../../src/lib/api", () => ({ api: vi.fn(async () => ({ balance: 1000, onTable: 0, claim: { state: "over" } })) }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, online: 2 }) }));

/** The table page: shows the navigation state it was opened with. */
function Landed() {
  return (
    <div>
      KHUZUR TABLE<pre data-testid="landed">{JSON.stringify(useLocation().state)}</pre>
    </div>
  );
}
const landed = () => JSON.parse(screen.getByTestId("landed").textContent);

const renderLobby = () =>
  render(
    <MemoryRouter initialEntries={["/lobby-khuzur"]}>
      <Routes>
        <Route path="/lobby-khuzur" element={<LobbyKhuzur />} />
        <Route path="/game-khuzur" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  );
const choose = (name) => userEvent.click(screen.getByRole("radio", { name }));
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));

beforeEach(() => {
  fakeSocket.emit.mockClear();
});

describe("LobbyKhuzur", () => {
  it("shows the builder, starting on pairs, 2 teams and the 5-card deal", () => {
    renderLobby();
    expect(screen.getByRole("radio", { name: "PAIRS" })).toBeChecked();
    expect(screen.getByText("4 players × 5 = 20 dealt · trump + 13 left to draw")).toBeInTheDocument();
    expect(fakeSocket.emit).toHaveBeenCalledWith("get_public_lobbies", { gameType: "khuzur" });
  });

  it("hosts a table built to the shape chosen", async () => {
    renderLobby();
    await choose("3 TEAMS");
    await choose("7 CARDS · 2 DECKS");
    await userEvent.click(screen.getByRole("button", { name: /public/i }));
    expect(fakeSocket.emit).toHaveBeenCalledWith(
      "create_lobby",
      expect.objectContaining({ gameType: "khuzur", isPrivate: false, table: { perTeam: 2, teams: 3, handSize: 7 } }),
    );
    serverSends("lobby_joined", { lobbyId: "PUB-KZ0001", gameType: "khuzur", isHost: true });
    expect(screen.getByText(/KHUZUR TABLE/)).toBeInTheDocument();
  });

  it("practice opens the table at the level picked, in the shape chosen", async () => {
    renderLobby();
    await choose("SOLO");
    await choose("3 PLAYERS");
    await userEvent.click(screen.getByRole("button", { name: /hard/i }));
    expect(landed()).toMatchObject({ aiDifficulty: "HARD", table: { perTeam: 1, teams: 3, handSize: 5 } });
    expect(landed().lobbyId).toMatch(/^SOLO-/);
  });

  it("has a CREDITS tab", () => {
    renderLobby();
    expect(screen.getByRole("tab", { name: /credits/i })).toBeInTheDocument();
  });

  it("shows each open table's shape", () => {
    renderLobby();
    serverSends("public_lobbies_update", [
      { id: "PUB-AAA111", gameType: "khuzur", name: "Ger", host: "BAT #0001", current: 1, max: 6, inProgress: false, tier: null, stake: null, table: { perTeam: 2, teams: 3, handSize: 7 } },
      { id: "PUB-BBB222", gameType: "khuzur", name: "Yurt", host: "ANA #0002", current: 2, max: 4, inProgress: false, tier: null, stake: null, table: { perTeam: 1, teams: 4, handSize: 5 } },
    ]);
    expect(screen.getByText("2 V 2 V 2 · 7 CARDS")).toBeInTheDocument();
    expect(screen.getByText("FFA 4 · 5 CARDS")).toBeInTheDocument();
  });
});
