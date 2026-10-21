// Credit matches (Muushig, Thirteen) in the browser: the lobbies' CREDITS
// tabs and the stake panel, an invite link, the waiting table's pot and seats,
// PLAY AGAIN, the scoreboard's comeback clock, and who took the pot.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LobbyMuushig from "../../src/pages/muushig/LobbyMuushig";
import LobbySelection from "../../src/pages/thirteen/LobbySelection";
import JoinTable from "../../src/pages/JoinTable";
import WaitingTable from "../../src/components/thirteen/WaitingTable";
import RoundResults from "../../src/components/muushig/RoundResults";
import MuushigScoreBoard from "../../src/components/muushig/MuushigScoreBoard";
import BalancePanel from "../../src/components/credits/BalancePanel";

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
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, online: 2 }) }));
vi.mock("../../src/lib/api", () => ({ api: apiMock }));

const ME = { balance: 1240, onTable: 0, canPlay: true, whyNot: null, claim: { state: "over" }, seat: null, rathole: { LOW: null, MID: null, HIGH: null }, notice: null, rank: 9, rejoin: null };
const TABLES = [
  { id: "PUB-FREE01", name: "Free Ger", host: "A #1", current: 2, max: 5, inProgress: false, tier: null, stake: null },
  { id: "PUB-MID001", name: "Mid Ger", host: "B #2", current: 3, max: 5, inProgress: false, tier: "MID", stake: 500 },
];
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));
const emitted = (ev) => fakeSocket.emit.mock.calls.filter(([e]) => e === ev).map(([, d]) => d);
const settle = () => act(async () => {});

async function openCredits(me = ME) {
  apiMock.mockResolvedValue(me);
  render(
    <MemoryRouter>
      <LobbyMuushig />
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
});

describe("the Muushig lobby's CREDITS tab", () => {
  it("hosts with a fixed stake per tier, and lists credit matches with their stake and pot", async () => {
    await openCredits();
    expect(screen.queryByText("Free Ger")).toBeNull();
    expect(row("Mid Ger")).toHaveTextContent("MID · 500");
    expect(row("Mid Ger")).toHaveTextContent("pot 1,500");
    const stakes = screen.getByRole("radiogroup", { name: "Stakes" });
    expect(within(stakes).getAllByRole("radio").map((b) => b.textContent)).toEqual(["LOW100", "MID500", "HIGH2,000"]);
    await userEvent.click(within(stakes).getByRole("radio", { name: /MID/ }));
    await userEvent.click(screen.getByRole("button", { name: /Public/ }));
    const dialog = screen.getByRole("dialog", { name: "Stake · MID 500" });
    expect(dialog).toHaveTextContent("The winner takes the pot.");
    expect(dialog).toHaveTextContent("If a bot wins, the pot is lost.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Stake 500" }));
    expect(emitted("create_lobby")).toEqual([expect.objectContaining({ gameType: "muushig", tier: "MID", buyIn: 500, isPrivate: false })]);
  });

  it("a credit match already in play can't be joined from the list", async () => {
    await openCredits();
    serverSends("public_lobbies_update", [{ ...TABLES[1], inProgress: true }]);
    expect(within(row("Mid Ger")).getByRole("button", { name: "Playing" })).toBeDisabled();
  });

  it("JOIN opens the stake panel and STAKE joins with it; a refusal shows in the panel", async () => {
    await openCredits();
    await userEvent.click(within(row("Mid Ger")).getByRole("button", { name: "Join" }));
    const dialog = screen.getByRole("dialog", { name: "Stake · MID 500" });
    expect(dialog).toHaveTextContent("Mid Ger");
    expect(dialog).toHaveTextContent("Balance 1,240");
    await userEvent.click(within(dialog).getByRole("button", { name: "Stake 500" }));
    expect(emitted("join_lobby")).toEqual([{ lobbyId: "PUB-MID001", playerName: "ANN #0001", buyIn: 500 }]);
    serverSends("error_message", "The table is full");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("The table is full");
  });

  it("a balance under the stake can't sit, and says why", async () => {
    await openCredits({ ...ME, balance: 340 });
    await userEvent.click(within(row("Mid Ger")).getByRole("button", { name: "Join" }));
    const dialog = screen.getByRole("dialog", { name: "Stake · MID 500" });
    expect(dialog).toHaveTextContent("Your balance is 340; this table's stake is 500.");
    expect(within(dialog).getByRole("button", { name: "Stake 500" })).toBeDisabled();
  });

  it("offers the way back to a match where a bot covers your seat", async () => {
    const navigate = vi.fn();
    render(
      <MemoryRouter>
        <BalancePanel credits={{ ...ME, rejoin: { gameType: "muushig", code: "ABC123", tableName: "Ger" } }} isGuest={false} onClaim={navigate} />
      </MemoryRouter>,
    );
    expect(screen.getByText("A bot is playing your seat at Ger. Your stake is still in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return" })).toBeInTheDocument();
  });
});

describe("the Thirteen lobby's CREDITS tab", () => {
  it("hosts a credit match for people only", async () => {
    apiMock.mockResolvedValue(ME);
    render(
      <MemoryRouter>
        <LobbySelection />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Credits" }));
    await settle();
    await userEvent.click(screen.getByRole("radio", { name: /HIGH/ }));
    await userEvent.click(screen.getByRole("button", { name: /Private/ }));
    const dialog = screen.getByRole("dialog", { name: "Stake · HIGH 2,000" });
    expect(dialog).toHaveTextContent("Only people play: empty seats stay empty.");
    expect(dialog).toHaveTextContent("Your balance is 1,240; this table's stake is 2,000.");
    expect(within(dialog).getByRole("button", { name: "Stake 2,000" })).toBeDisabled();
  });
});

describe("an invite link to a credit match", () => {
  it("shows the stake panel, then joins with the stake", async () => {
    apiMock.mockResolvedValue(ME);
    render(
      <MemoryRouter initialEntries={["/join/GER123"]}>
        <Routes>
          <Route path="/join/:code" element={<JoinTable />} />
        </Routes>
      </MemoryRouter>,
    );
    await settle();
    serverSends("credit_table_info", { lobbyId: "GER123", name: "Friends", tier: "LOW", gameType: "muushig", stake: 100 });
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Stake · LOW 100" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Stake 100" }));
    expect(emitted("join_lobby").at(-1)).toEqual({ lobbyId: "GER123", playerName: "ANN #0001", buyIn: 100 });
  });
});

describe("the waiting table at a credit match", () => {
  const human = (name, extra = {}) => ({ kind: "human", name, avatar: { variant: "2", custom: null }, isHost: false, connected: true, ...extra });
  const credit = (over = {}) => ({ tier: "LOW", stake: 100, botsFill: true, pot: 100, staked: 1, seats: null, settling: false, result: null, deciding: 0, ...over });
  const table = (over = {}) => ({
    lobbyId: "PUB-GER001",
    gameType: "muushig",
    name: "Ger",
    isPrivate: false,
    status: "waiting",
    code: "GER001",
    mySeat: 0,
    isHost: true,
    seats: [human("ANN #0001", { isHost: true }), null, null, null, null],
    credit: credit(),
    ...over,
  });
  const props = (over = {}) => ({ messages: [], onSendMessage: vi.fn(), onExit: vi.fn(), onAddCpu: vi.fn(), onRemoveCpu: vi.fn(), onSetCpuLevel: vi.fn(), onStart: vi.fn(), onRestake: vi.fn(), title: "MUUSHIG", fillsEmptySeats: true, ...over });

  it("shows the pot, Hard bots in the empty seats with no CPU controls, and START waits for a second stake", () => {
    render(<WaitingTable {...props({ table: table() })} />);
    expect(screen.getByText("POT 100")).toBeInTheDocument();
    expect(screen.getByText(/1 × 100 · LOW · winner takes all/)).toBeInTheDocument();
    expect(screen.getAllByText("HARD BOT")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /add \w+ cpu/i })).toBeNull();
    expect(screen.getByText("STAKED 100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start game/i })).toBeDisabled();
    expect(screen.getByText("Needs 2 players with stakes in. Empty seats are Hard bots.")).toBeInTheDocument();
    expect(screen.getByText("EXIT before the deal and your 100 comes back.")).toBeInTheDocument();
  });

  it("at a Thirteen credit match empty seats stay empty, with no CPU controls", () => {
    render(<WaitingTable {...props({ title: "THIRTEEN", fillsEmptySeats: false, table: table({ gameType: "thirteen", seats: [human("ANN #0001", { isHost: true }), null, null, null], credit: credit({ botsFill: false }) }) })} />);
    expect(screen.queryByText("HARD BOT")).toBeNull();
    expect(screen.getAllByText("EMPTY SEAT")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /add \w+ cpu/i })).toBeNull();
    expect(screen.getByText("Needs 2 players with stakes in. Empty seats stay empty.")).toBeInTheDocument();
  });

  it("START opens once 2 have staked", () => {
    render(<WaitingTable {...props({ table: table({ seats: [human("ANN #0001", { isHost: true }), human("BOB #0002"), null, null, null], credit: credit({ staked: 2, pot: 200 }) }) })} />);
    expect(screen.getByRole("button", { name: /start game/i })).toBeEnabled();
  });

  it("after a match, someone without a seat gets PLAY AGAIN", async () => {
    const onRestake = vi.fn();
    render(<WaitingTable {...props({ onRestake, table: table({ mySeat: null, isHost: false, seats: [null, human("BOB #0002", { isHost: true }), null, null, null], credit: credit({ deciding: 2 }) }) })} />);
    expect(screen.getByText(/2 deciding/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /play again · 100/i }));
    expect(onRestake).toHaveBeenCalled();
  });
});

describe("a credit match in play and at its end", () => {
  const NAMES = ["ANN #0001", "BOB #0002", "Bot Saturn", "Bot Venus", "Bot Mars"];
  const players = NAMES.map((name, id) => ({ id, name, score: 15 - id, eaten: 0 }));
  const face = () => ({ variant: 1, customAvatarData: null });
  const results = [0, 1, 2, 3, 4].map((seat) => ({ seat, eaten: 1, folded: false, delta: -1, score: seat === 0 ? 0 : 5 + seat }));

  it("the scoreboard shows a covered seat's rounds left, and a forfeited one", () => {
    const { rerender } = render(<MuushigScoreBoard players={players} faceFor={face} covered={[{ staked: true, away: false }, { staked: true, away: true, roundsLeft: 1, forfeited: false }, null, null, null]} />);
    expect(screen.getByText("AWAY 1")).toBeInTheDocument();
    rerender(<MuushigScoreBoard players={players} faceFor={face} covered={[null, { staked: true, away: true, roundsLeft: 0, forfeited: true }, null, null, null]} />);
    expect(screen.getByText("FORFEITED")).toBeInTheDocument();
  });

  const end = (result, extra = {}) =>
    render(<RoundResults round={6} players={players} faceFor={face} results={results} matchWinner={0} onExit={vi.fn()} credit={{ stake: 100, result, onPlayAgain: vi.fn(), error: "", ...extra }} />);

  it("waits for the pot to be paid, then names the winner and each staked seat's net", () => {
    const { unmount } = end(null);
    expect(screen.getByRole("status")).toHaveTextContent("PAYING OUT THE POT...");
    expect(screen.getByRole("button", { name: /play again · 100/i })).toBeDisabled();
    unmount();
    end({ pot: 200, payouts: [{ seat: 0, amount: 200 }], cpuTake: 0, winners: [0], staked: [0, 1], forfeited: [], void: false });
    expect(screen.getByRole("status")).toHaveTextContent("ANN WINS 200 CREDITS");
    expect(screen.getByText("+100")).toBeInTheDocument();
    expect(screen.getByText("−100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play again · 100/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "REMATCH" })).toBeNull();
  });

  it("says when a bot took the pot, and shows a PLAY AGAIN refusal", () => {
    end({ pot: 200, payouts: [], cpuTake: 200, winners: [3], staked: [0, 1], forfeited: [], void: false }, { error: "Your balance is 40; this table's stake is 100" });
    expect(screen.getByRole("status")).toHaveTextContent("A BOT WON: THE 200 POT IS LOST");
    expect(screen.getAllByText("−100")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("Your balance is 40; this table's stake is 100");
  });

  it("names everyone who split the pot", () => {
    end({ pot: 300, payouts: [{ seat: 0, amount: 150 }, { seat: 1, amount: 150 }], cpuTake: 0, winners: [0, 1], staked: [0, 1, 2], forfeited: [], void: false });
    expect(screen.getByRole("status")).toHaveTextContent("ANN & BOB SPLIT THE 300 POT");
  });
});
