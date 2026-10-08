import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Profile from "../../src/pages/Profile";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../src/lib/api", () => ({ api }));
vi.mock("../../src/utils/socket", () => ({ socket: {}, connectSocket: () => {} }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, online: 1 }) }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    isGuest: false,
    loading: false,
    identity: { name: "KINGER", tag: "123A", avatar: "1", customAvatar: null, level: 1, exp: 0, coins: 0 },
    profile: { avatar: "1" },
    updateProfile: async () => {},
    signOut: () => {},
  }),
}));

// The /stats payload: one view per game filter.
const view = (over = {}) => ({
  games: 0,
  wins: 0,
  losses: 0,
  deadLast: 0,
  winRate: null,
  avgFinish: null,
  fieldSize: null,
  streak: { current: 0, bestWin: 0 },
  placements: [],
  rounds: { won: 0, played: 0 },
  time: { totalSeconds: 0, avgSeconds: null, lastPlayedAt: null },
  recent: [],
  ...over,
});
const pokerView = (over = {}) => ({
  sessions: 0,
  hands: 0,
  handsWon: 0,
  winRate: null,
  net: 0,
  biggestPot: 0,
  vpip: null,
  showdowns: 0,
  showdownsWon: 0,
  time: { totalSeconds: 0, lastPlayedAt: null },
  ...over,
});
const empty = {
  overall: view(),
  thirteen: view({ extras: {}, hands: {} }),
  muushig: view({ extras: {} }),
  poker: pokerView(),
};
const match = (game, place, of, won, daysAgo) => ({
  id: `${game}-${daysAgo}`,
  game,
  place,
  of,
  won,
  leftEarly: false,
  solo: game === "muushig",
  score: 5,
  seconds: 600,
  finishedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
});
const played = {
  overall: view({
    games: 7,
    wins: 3,
    losses: 4,
    deadLast: 2,
    winRate: 42.9,
    avgFinish: 2.4,
    fieldSize: 4.3,
    streak: { current: 2, bestWin: 3 },
    placements: [
      { place: 1, times: 3 },
      { place: 2, times: 1 },
      { place: 4, times: 2 },
      { place: 5, times: 1 },
    ],
    rounds: { won: 12, played: 40 },
    time: { totalSeconds: 5400, avgSeconds: 771, lastPlayedAt: new Date().toISOString() },
    recent: [match("thirteen", 1, 4, true, 0), match("muushig", 5, 5, false, 1)],
  }),
  thirteen: view({
    games: 5,
    wins: 3,
    losses: 2,
    deadLast: 1,
    winRate: 60,
    avgFinish: 2,
    fieldSize: 4,
    placements: [{ place: 1, times: 3 }, { place: 4, times: 2 }],
    rounds: { won: 10, played: 30 },
    recent: [match("thirteen", 1, 4, true, 0)],
    extras: { rounds_played: 30, rounds_won: 10, cards_left_total: 90 },
    hands: { SINGLE: 40, PAIR: 6, STRAIGHT: 2 },
  }),
  muushig: view({
    games: 2,
    losses: 2,
    deadLast: 1,
    recent: [match("muushig", 5, 5, false, 1)],
    extras: { eaten: 14, gone_in: 9, folded: 3, sweeps: 1, rounds_played: 12, rounds_won: 2 },
  }),
};

const renderProfile = async (data) => {
  api.mockResolvedValue(data);
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
  await screen.findByRole("group", { name: "Game" });
};
const tile = (label) => screen.getByText(label, { selector: "span" }).parentElement;
const section = (title) => screen.getByRole("heading", { name: title }).closest("section");

beforeEach(() => api.mockReset());

describe("Profile stats", () => {
  it("shows every stat at zero before any match, and no rating anywhere", async () => {
    await renderProfile(empty);
    expect(tile("Games")).toHaveTextContent("0");
    expect(tile("Wins")).toHaveTextContent("0");
    expect(tile("Losses")).toHaveTextContent("0");
    expect(tile("Dead last")).toHaveTextContent("0");
    expect(tile("Win rate")).toHaveTextContent("-");
    expect(within(section("Recent matches")).getByText("No matches yet")).toBeInTheDocument();
    expect(screen.queryByText(/rating/i)).not.toBeInTheDocument();
  });

  it("shows the overall view first and switches per game", async () => {
    const user = userEvent.setup();
    await renderProfile(played);
    const filter = screen.getByRole("group", { name: "Game" });
    expect(within(filter).getByRole("button", { name: "Overall" })).toHaveAttribute("aria-pressed", "true");
    expect(tile("Games")).toHaveTextContent("7");
    expect(tile("Dead last")).toHaveTextContent("2");
    expect(tile("Streak")).toHaveTextContent("2W");
    expect(tile("Streak")).toHaveTextContent("Best win run 3");
    expect(within(section("Finishing places")).getByText("5th")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hands played" })).not.toBeInTheDocument();

    await user.click(within(filter).getByRole("button", { name: "Thirteen" }));
    expect(tile("Games")).toHaveTextContent("5");
    expect(tile("Win rate")).toHaveTextContent("60%");
    expect(within(section("Finishing places")).queryByText("5th")).not.toBeInTheDocument();
    const hands = section("Hands played");
    expect(within(hands).getByText("Pair").parentElement).toHaveTextContent("6");
    expect(within(hands).getByText("Royal Flush").parentElement).toHaveTextContent("0");
    const thirteen = section("Thirteen");
    expect(within(thirteen).getByText("Went out first").nextSibling).toHaveTextContent("10");
    expect(within(thirteen).getByText("Avg cards left when caught").nextSibling).toHaveTextContent("4.5");

    await user.click(within(filter).getByRole("button", { name: "Muushig" }));
    expect(tile("Games")).toHaveTextContent("2");
    const muushig = section("Muushig");
    expect(within(muushig).getByText("Piles eaten").nextSibling).toHaveTextContent("14");
    expect(within(muushig).getByText("Went in / folded").nextSibling).toHaveTextContent("9 / 3");
    expect(within(muushig).getByText("Sweeps").nextSibling).toHaveTextContent("1");
  });

  it("the Poker tab shows hands and chips, not places", async () => {
    const user = userEvent.setup();
    await renderProfile({
      ...empty,
      poker: pokerView({ sessions: 3, hands: 120, handsWon: 30, winRate: 25, net: -340, biggestPot: 900, vpip: 28.5, showdowns: 20, showdownsWon: 11 }),
    });
    await user.click(within(screen.getByRole("group", { name: "Game" })).getByRole("button", { name: "Poker" }));
    expect(tile("Hands")).toHaveTextContent("120");
    expect(tile("Hands")).toHaveTextContent("at 3 tables");
    expect(tile("Hands won")).toHaveTextContent("25% of hands");
    expect(tile("Chips")).toHaveTextContent("-340");
    expect(tile("Biggest pot")).toHaveTextContent("900");
    const poker = section("Poker");
    expect(within(poker).getByText("Played the hand (VPIP)").nextSibling).toHaveTextContent("28.5%");
    expect(within(poker).getByText("Showdowns won").nextSibling).toHaveTextContent("11 / 20");
    expect(screen.queryByText("Dead last")).not.toBeInTheDocument();
  });

  it("lists recent matches, or graphs their placings", async () => {
    const user = userEvent.setup();
    await renderProfile(played);
    const recent = section("Recent matches");
    expect(within(recent).getByText("1st of 4")).toBeInTheDocument();
    expect(within(recent).getByText("5th of 5")).toBeInTheDocument();
    expect(within(recent).getByText("vs CPU")).toBeInTheDocument();

    await user.click(within(recent).getByRole("button", { name: "Graph" }));
    expect(within(recent).getByRole("img", { name: /finishing place over your last 2 matches/i })).toBeInTheDocument();
    expect(within(recent).queryByText("1st of 4")).not.toBeInTheDocument();
  });
});
