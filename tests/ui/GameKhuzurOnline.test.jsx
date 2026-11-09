// The Khuzur table online: the waiting table first (pick your seat, and so
// your team), then the server's redacted states drive the page and your moves
// go out as khuzur_move. States are real engine states put through the
// server's own redaction.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import GameKhuzur from "../../src/pages/khuzur/GameKhuzur";
import { createMatch, deal } from "../../src/utils/khuzur/engine.js";
import { khuzurView } from "../../server/game/khuzurGame.js";
import { seededRandom } from "../helpers/cards.js";
import { cs } from "../helpers/khuzur.js";

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
  useAuth: () => ({ identity: { name: "ME", tag: "0003", avatar: "2", customAvatar: null }, isGuest: false }),
}));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, ping: 42 }) }));

const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));
const LOBBY = "PUB-KZ0001";
const T2v2 = { perTeam: 2, teams: 2, handSize: 5 };
const ME = 2;
const NAMES = ["ANN #0001", "Bot Saturn", "ME #0003", "Bot Venus"];

/** A dealt 2v2 with you in seat 2, `turn` to move. */
function dealt(turn = ME, over = {}) {
  const players = NAMES.map((name, i) => ({ name, type: i % 2 ? "AI" : "HUMAN", level: i % 2 ? "MEDIUM" : null }));
  const s = deal(createMatch({ players, table: T2v2, rng: seededRandom(2) }), (turn + 3) % 4, seededRandom(2));
  return { ...s, turn, ...over };
}
/** The server's view for seat ME, with a game for the clock and votes. */
const view = (s, { turnMsLeft = null, votes = {} } = {}) => ({ ...khuzurView(s, ME, { turnMsLeft: () => turnMsLeft, voteView: () => votes }), amHost: false });

const waiting = (over = {}) => ({
  lobbyId: LOBBY,
  gameType: "khuzur",
  name: "Ger",
  isPrivate: false,
  status: "waiting",
  code: "KZ0001",
  mySeat: 1,
  isHost: false,
  table: T2v2,
  credit: null,
  seats: [{ kind: "human", name: "ANN #0001", isHost: true, connected: true }, { kind: "human", name: "ME #0003", connected: true }, null, null],
  ...over,
});

function openTable() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/game-khuzur", state: { lobbyId: LOBBY, playerName: "ME #0003" } }]}>
      <Routes>
        <Route path="/game-khuzur" element={<GameKhuzur />} />
        <Route path="/lobby-khuzur" element={<div>KHUZUR LOBBY</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fakeSocket.emit.mockClear();
  for (const k of Object.keys(handlers)) delete handlers[k];
});

describe("the waiting table", () => {
  it("joins, shows the seats in team colours, and SIT HERE moves you", async () => {
    openTable();
    await act(async () => {});
    expect(fakeSocket.emit).toHaveBeenCalledWith("join_lobby", expect.objectContaining({ lobbyId: LOBBY }));
    serverSends("table_update", waiting());
    expect(screen.getByText(/2 V 2 · 5 CARDS/)).toBeInTheDocument();
    expect(screen.getAllByTestId("seat-team")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /sit in seat/i })).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Sit in seat 3" }));
    expect(fakeSocket.emit).toHaveBeenCalledWith("take_seat", { lobbyId: LOBBY, seat: 2 });
  });
});

describe("building the table", () => {
  it("the host reshapes the table at the waiting table", async () => {
    openTable();
    await act(async () => {});
    serverSends("table_update", waiting({ mySeat: 0, isHost: true }));
    expect(screen.getByRole("radio", { name: "PAIRS" })).toBeChecked();
    // Its own box beside the invite, which says how many decks the deal takes.
    expect(screen.getByRole("region", { name: "Build your table" })).toHaveTextContent("One deck · 4 × 5 = 20 dealt · 13 to draw");
    expect(screen.getByText(/2 V 2 · 5 CARDS · 1 DECK/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "3 TEAMS" }));
    expect(fakeSocket.emit).toHaveBeenCalledWith("set_table", { lobbyId: LOBBY, table: { perTeam: 2, teams: 3, handSize: 5 } });
    await userEvent.click(screen.getByRole("radio", { name: "7 CARDS" }));
    expect(fakeSocket.emit).toHaveBeenCalledWith("set_table", { lobbyId: LOBBY, table: { perTeam: 2, teams: 2, handSize: 7 } });
  });

  it("a guest sees the shape but can't change it", async () => {
    openTable();
    await act(async () => {});
    serverSends("table_update", waiting({ table: { perTeam: 2, teams: 2, handSize: 7 } }));
    expect(screen.getByText(/2 V 2 · 7 CARDS · 2 DECKS/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Build your table" })).not.toBeInTheDocument();
  });
});

describe("the table", () => {
  it("shows your hand, and LEAD sends a khuzur_move", async () => {
    openTable();
    await act(async () => {});
    const s = dealt(ME, { players: dealt().players.map((p, i) => (i === ME ? { ...p, hand: cs("J♠ J♦ 9♣ Q♦ 7♦") } : p)) });
    serverSends("khuzur_state", view(s));
    for (const name of ["J♠", "J♦", "9♣"]) await userEvent.click(screen.getByRole("button", { name }));
    await userEvent.click(screen.getByRole("button", { name: "LEAD" }));
    expect(fakeSocket.emit).toHaveBeenCalledWith("khuzur_move", { lobbyId: LOBBY, move: { type: "lead", cardIds: expect.arrayContaining(["J♠", "J♦", "9♣"]) } });
  });

  it("joining mid-match shows the table straight away, with no draw for the deal", async () => {
    openTable();
    await act(async () => {});
    serverSends("khuzur_state", view({ ...dealt(0), events: [{ type: "firstDealer", seat: 3 }, { type: "deal", dealer: 3 }] }));
    expect(screen.queryByText("DRAW FOR THE DEAL")).not.toBeInTheDocument();
    expect(screen.queryByText("HIGHEST CARD DEALS")).not.toBeInTheDocument();
    expect(screen.getByText(/ANN leads/)).toBeInTheDocument();
  });

  it("the match line and the felt say how many decks the match is played with", async () => {
    openTable();
    await act(async () => {});
    serverSends("khuzur_state", view(dealt(ME)));
    expect(screen.getByText("5-CARD GAME · 1 DECK")).toBeInTheDocument();
    // On the felt too, beside the trump, where small screens see it.
    expect(screen.getByTestId("decks")).toHaveTextContent("1 DECK");
  });

  it("shows the turn clock", async () => {
    openTable();
    await act(async () => {});
    serverSends("khuzur_state", view(dealt(ME), { turnMsLeft: 31_000 }));
    expect(screen.getByTestId("turn-clock")).toHaveTextContent("0:31");
  });

  it("a teammate's surrender vote asks you, and KEEP PLAYING cancels it", async () => {
    openTable();
    await act(async () => {});
    serverSends("khuzur_state", view(dealt(1), { votes: { 0: [0] } }));
    expect(screen.getByText(/ANN wants to surrender/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "KEEP PLAYING" }));
    expect(fakeSocket.emit).toHaveBeenCalledWith("khuzur_move", { lobbyId: LOBBY, move: { type: "keepPlaying" } });
  });

  it("a refused move shows the server's reason until the table moves on", async () => {
    openTable();
    await act(async () => {});
    serverSends("khuzur_state", view(dealt(ME)));
    serverSends("move_rejected", { reason: "Not your turn" });
    expect(screen.getByRole("alert")).toHaveTextContent("Not your turn");
    serverSends("khuzur_state", view(dealt(1)));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("after a credit match, the next one opens with your draw for the deal, even if you'd joined the last one late", async () => {
    openTable();
    await act(async () => {});
    // You came back to the last match partway through.
    serverSends("khuzur_state", view(dealt(0)));
    // It ended; you staked again and are back at the waiting table.
    serverSends("table_update", waiting({ mySeat: ME, credit: { stake: 100, pot: 200 } }));
    // The next match is a new game: match 1 again, opening with the draw.
    const players = NAMES.map((name, i) => ({ name, type: i % 2 ? "AI" : "HUMAN" }));
    const draw = { ...createMatch({ players, table: T2v2, rng: seededRandom(4) }), turn: ME, drawers: [ME, 3, 0, 1] };
    serverSends("khuzur_state", view(draw));
    expect(screen.getByRole("button", { name: "TAKE" })).toBeInTheDocument();
  });
});
