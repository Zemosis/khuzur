import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import LobbySelection from "../../src/pages/thirteen/LobbySelection";
import LobbyMuushig from "../../src/pages/muushig/LobbyMuushig";

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
const auth = vi.hoisted(() => ({ isGuest: true }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ identity: { name: "LOOKER", tag: "0009", avatar: "1", level: 3, exp: 300, gold: 1250 }, isGuest: auth.isGuest, updateProfile: async () => {} }),
}));
vi.mock("../../src/lib/api", () => ({ api: vi.fn(async () => ({ balance: 1000, onTable: 0, claim: { state: "over" } })) }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, online: 2 }) }));

describe("GameLobby adventurer card", () => {
  it("shows your level, the XP into it and your gold; a guest gets no gold", () => {
    auth.isGuest = false;
    try {
      render(
        <MemoryRouter>
          <LobbySelection />
        </MemoryRouter>,
      );
      expect(screen.getByText("LV 3")).toBeInTheDocument();
      expect(screen.getByText("50/200 XP")).toBeInTheDocument(); // level 3 starts at 250 XP and costs 200
      expect(screen.getByText("1,250 GOLD")).toBeInTheDocument();
    } finally {
      auth.isGuest = true;
    }
  });

  it("a guest's card has no gold", () => {
    render(
      <MemoryRouter>
        <LobbySelection />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/GOLD$/)).not.toBeInTheDocument();
  });
});

describe("GameLobby open tables", () => {
  it("tags each table WAITING or PLAYING", () => {
    render(
      <MemoryRouter>
        <LobbySelection />
      </MemoryRouter>,
    );
    act(() =>
      handlers.public_lobbies_update.forEach((fn) =>
        fn([
          { id: "PUB-AAA111", name: "Early Birds", host: "A #1", current: 1, max: 4, inProgress: false },
          { id: "PUB-BBB222", name: "Mid Match", host: "B #2", current: 2, max: 4, inProgress: true },
        ]),
      ),
    );
    expect(screen.getByText("Early Birds").closest("[data-table]")).toHaveTextContent("WAITING");
    expect(screen.getByText("Mid Match").closest("[data-table]")).toHaveTextContent("PLAYING");
  });

  it("asks for the list on open and stops its updates on close", () => {
    fakeSocket.emit.mockClear();
    const { unmount } = render(
      <MemoryRouter>
        <LobbySelection />
      </MemoryRouter>,
    );
    expect(fakeSocket.emit).toHaveBeenCalledWith("get_public_lobbies", { gameType: "thirteen" });
    expect(fakeSocket.emit).not.toHaveBeenCalledWith("leave_public_lobbies");
    unmount();
    expect(fakeSocket.emit).toHaveBeenCalledWith("leave_public_lobbies");
  });
});

describe("the Muushig lobby", () => {
  const renderMuushig = () =>
    render(
      <MemoryRouter initialEntries={["/lobby-muushig"]}>
        <Routes>
          <Route path="/lobby-muushig" element={<LobbyMuushig />} />
          <Route path="/game-muushig" element={<div>MUUSHIG TABLE</div>} />
          <Route path="/game-13" element={<div>THIRTEEN TABLE</div>} />
        </Routes>
      </MemoryRouter>,
    );
  const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));

  it("asks for Muushig tables and hosts Muushig tables", async () => {
    fakeSocket.emit.mockClear();
    renderMuushig();
    expect(fakeSocket.emit).toHaveBeenCalledWith("get_public_lobbies", { gameType: "muushig" });
    await userEvent.setup().click(screen.getByRole("button", { name: /public/i }));
    expect(fakeSocket.emit).toHaveBeenCalledWith("create_lobby", expect.objectContaining({ gameType: "muushig", isPrivate: false }));
    serverSends("lobby_joined", { lobbyId: "PUB-MU0001", gameType: "muushig", isHost: true });
    expect(screen.getByText("MUUSHIG TABLE")).toBeInTheDocument();
  });

  it("a code for a Thirteen table typed here opens Thirteen", () => {
    renderMuushig();
    serverSends("lobby_joined", { lobbyId: "TH1234", gameType: "thirteen", isHost: false });
    expect(screen.getByText("THIRTEEN TABLE")).toBeInTheDocument();
  });
});
