import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import JoinTable from "../../src/pages/JoinTable";

// vi.mock factories are hoisted above imports, so the fake lives in vi.hoisted.
const { handlers, fakeSocket, auth } = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
    auth: { loading: false },
    fakeSocket: {
      connected: true,
      on: (ev, fn) => (handlers[ev] ||= new Set()).add(fn),
      off: (ev, fn) => handlers[ev]?.delete(fn),
      emit: vi.fn(),
    },
  };
});
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));

vi.mock("../../src/utils/socket", () => ({ socket: fakeSocket, connectSocket: () => Promise.resolve() }));
// JoinTable loads credits when a credit table asks for a buy-in.
vi.mock("../../src/lib/api", () => ({ api: vi.fn(async () => ({})) }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ identity: { name: "FRIEND", tag: "0007", avatar: "2" }, loading: auth.loading }),
}));

function GamePage() {
  const { state } = useLocation();
  return <div>GAME PAGE {state.lobbyId} {state.playerName}</div>;
}

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/join/:code" element={<JoinTable />} />
        <Route path="/game-13" element={<GamePage />} />
        <Route path="/game-muushig" element={<div>MUUSHIG PAGE</div>} />
        <Route path="/lobby-13" element={<div>THIRTEEN LOBBY</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  auth.loading = false;
  fakeSocket.emit.mockClear();
  for (const k of Object.keys(handlers)) delete handlers[k];
});

describe("JoinTable", () => {
  it("joins the code from the link, uppercased, then opens the table", async () => {
    renderAt("/join/abc123");
    await act(async () => {});
    expect(fakeSocket.emit).toHaveBeenCalledWith("join_lobby", { lobbyId: "ABC123", playerName: "FRIEND #0007" });
    expect(screen.getByText(/joining table ABC123/i)).toBeInTheDocument();
    serverSends("lobby_joined", { lobbyId: "PUB-ABC123", isHost: false, mySocketId: "s1" });
    expect(screen.getByText("GAME PAGE PUB-ABC123 FRIEND #0007")).toBeInTheDocument();
  });

  it("waits for a signed-in session to load before joining, so the right name is used", async () => {
    auth.loading = true;
    const { rerender } = renderAt("/join/abc123");
    await act(async () => {});
    expect(fakeSocket.emit).not.toHaveBeenCalled();
    auth.loading = false;
    rerender(
      <MemoryRouter initialEntries={["/join/abc123"]}>
        <Routes>
          <Route path="/join/:code" element={<JoinTable />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(fakeSocket.emit).toHaveBeenCalledWith("join_lobby", { lobbyId: "ABC123", playerName: "FRIEND #0007" });
  });

  it("an invite to a Muushig table opens the Muushig game", async () => {
    renderAt("/join/mu1234");
    await act(async () => {});
    serverSends("lobby_joined", { lobbyId: "MU1234", gameType: "muushig", isHost: false, mySocketId: "s1" });
    expect(screen.getByText("MUUSHIG PAGE")).toBeInTheDocument();
  });

  it("accepts a code that still carries the PUB- prefix", async () => {
    renderAt("/join/PUB-ABC123");
    await act(async () => {});
    expect(fakeSocket.emit).toHaveBeenCalledWith("join_lobby", { lobbyId: "PUB-ABC123", playerName: "FRIEND #0007" });
  });

  it("shows the server's reason when the table can't be joined", async () => {
    renderAt("/join/NOPE42");
    await act(async () => {});
    serverSends("error_message", "Lobby not found");
    expect(screen.getByText("CAN'T JOIN THIS TABLE")).toBeInTheDocument();
    expect(screen.getByText("Lobby not found")).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: /thirteen lobby/i }).click());
    expect(screen.getByText("THIRTEEN LOBBY")).toBeInTheDocument();
  });
});
