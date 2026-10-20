// The match page: standings, one player's summary, the timeline and the rounds.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MatchDetail from "../../src/pages/MatchDetail";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../src/lib/api", () => ({ api }));
vi.mock("../../src/utils/socket", () => ({ socket: {}, connectSocket: () => {} }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, online: 1 }) }));
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ identity: { name: "ANN", tag: "0001" } }) }));

const res = (seat, cardsLeft, points, scoreAfter, eliminated = false) => ({ seat, cardsLeft, points, scoreAfter, eaten: null, folded: null, eliminated });
const thirteen = {
  id: "11111111-1111-4111-8111-111111111111",
  gameType: "thirteen",
  startedAt: "2026-10-19T10:00:00Z",
  finishedAt: "2026-10-19T10:20:00Z",
  durationSeconds: 1200,
  roundCount: 2,
  isPrivate: false,
  you: 1,
  standings: [
    { seat: 0, name: "Bot Saturn", kind: "cpu", level: "HARD", place: 1, score: 2, roundsWon: 2, leftEarly: false, cpuTookOver: false, ratingDelta: null, stats: null },
    { seat: 1, name: "ANN #0001", kind: "human", level: null, place: 2, score: 9, roundsWon: 0, leftEarly: false, cpuTookOver: false, ratingDelta: -12, stats: { hands: { SINGLE: 7, PAIR: 2 } } },
    { seat: 2, name: null, kind: "cpu", level: null, place: 3, score: 30, roundsWon: 0, leftEarly: false, cpuTookOver: false, ratingDelta: null, stats: null },
  ],
  rounds: [
    {
      number: 1,
      winnerSeat: 0,
      results: [res(0, 0, 0, 0), res(1, 4, 4, 4), res(2, 13, 26, 26)],
      highlights: [
        { type: "big", seat: 2, combo: "FOUR_OF_A_KIND", cards: ["♠", "♣", "♦", "♥"].map((suit) => ({ rank: "7", suit })) },
        { type: "win", seat: 0, combo: "PAIR", cards: [{ rank: "9", suit: "♥" }, { rank: "9", suit: "♦" }] },
      ],
    },
    { number: 2, winnerSeat: 0, results: [res(0, 0, 2, 2), res(1, 5, 5, 9), res(2, 4, 4, 30, true)], highlights: null },
  ],
};

const open = (data) => {
  if (data instanceof Error) api.mockRejectedValue(data);
  else api.mockResolvedValue(data);
  render(
    <MemoryRouter initialEntries={[`/match/${thirteen.id}`]}>
      <Routes>
        <Route path="/match/:id" element={<MatchDetail />} />
      </Routes>
    </MemoryRouter>,
  );
};
const panel = (title) => screen.getByRole("heading", { name: title }).closest("section");

// Braces: a function returned from beforeEach is run as teardown, and mockReset returns the mock.
beforeEach(() => {
  api.mockReset();
});

describe("match page", () => {
  it("asks the server for this match", async () => {
    open(thirteen);
    await screen.findByRole("list", { name: "Standings" });
    expect(api).toHaveBeenCalledWith(`/${thirteen.id}`, { base: "/api/matches" });
  });

  it("lists every seat best first, marks you, names CPUs and gives an unnamed one its seat", async () => {
    open(thirteen);
    const rows = within(await screen.findByRole("list", { name: "Standings" })).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Bot Saturn: 1st", "ANN: 2nd", "CPU · seat 3: 3rd"]);
    expect(rows[0]).toHaveTextContent("CPU · HARD");
    expect(rows[1]).toHaveTextContent("YOU");
    expect(rows[1]).toHaveTextContent("-12");
  });

  it("starts the summary on you, with your hands; picking another row switches to them", async () => {
    const user = userEvent.setup();
    open(thirteen);
    await screen.findByRole("list", { name: "Standings" });
    const summary = panel("Summary");
    expect(within(summary).getByRole("table", { name: "ANN against the table" })).toBeInTheDocument();
    expect(within(summary).getByRole("list", { name: "Hands played" })).toBeInTheDocument();

    await user.click(screen.getByRole("listitem", { name: "Bot Saturn: 1st" }));
    expect(within(summary).getByRole("table", { name: "Bot Saturn against the table" })).toBeInTheDocument();
    const won = within(summary).getByRole("rowheader", { name: "Rounds won" }).parentElement;
    expect(won).toHaveTextContent("2");
    expect(within(summary).queryByRole("list", { name: "Hands played" })).toBeNull();
  });

  it("draws the timeline with a legend naming every seat", async () => {
    open(thirteen);
    const timeline = (await screen.findAllByRole("heading", { name: "Timeline" }))[0].closest("section");
    expect(within(timeline).getByRole("img", { name: /score after each round/i })).toBeInTheDocument();
    const legend = within(timeline).getByRole("list", { name: "Seats" });
    expect(legend).toHaveTextContent("Bot Saturn");
    expect(legend).toHaveTextContent("CPU · seat 3");
  });

  it("each round opens to its results and key plays", async () => {
    open(thirteen);
    await screen.findByRole("list", { name: "Standings" });
    const rounds = panel("Rounds");
    expect(within(rounds).getAllByText("Bot Saturn went out first")).toHaveLength(2);
    const first = within(rounds).getByText("ROUND 1").closest("details");
    expect(first).toHaveTextContent("KEY PLAYS");
    expect(first).toHaveTextContent("CPU · seat 3 played four of a kind");
    expect(first).toHaveTextContent("Bot Saturn went out with pair");
    // A match recorded before key plays: just the results.
    expect(within(rounds).getByText("ROUND 2").closest("details")).not.toHaveTextContent("KEY PLAYS");
  });

  it("a match it can't show reads as not available", async () => {
    open(Object.assign(new Error("Match not found"), { status: 404 }));
    expect(await screen.findByText(/This match isn.t available/)).toBeInTheDocument();
  });

  describe("a poker table", () => {
    const hand = (n, net, extra) => ({ n, net, won: net > 0 ? net + 10 : 0, hole: ["A♠", "A♦"], board: ["2♣", "7♦", "9♥", "J♠", "3♣"], folded: null, showdown: false, rank: null, shown: null, winners: [], ...extra });
    const poker = {
      id: thirteen.id,
      gameType: "poker",
      table: "High Rollers",
      tier: "LOW",
      isPrivate: false,
      startedAt: "2026-10-19T10:00:00Z",
      finishedAt: "2026-10-19T11:00:00Z",
      durationSeconds: 3600,
      handCount: 40,
      you: {
        name: "ANN #0001",
        net: 30,
        seconds: 1800,
        handsPlayed: 3,
        handsWon: 1,
        biggestPot: 60,
        vpipHands: 2,
        showdowns: 1,
        showdownsWon: 1,
        showdownRanks: { PAIR: { shown: 1, won: 1 } },
        hands: [
          hand(1, 50, { showdown: true, rank: "PAIR", shown: "Pair of aces", winners: [{ name: "ANN #0001", hand: "Pair of aces" }] }),
          hand(2, -10, { hole: ["7♣", "2♦"], board: [], folded: "PREFLOP", winners: [{ name: "Bot Saturn", hand: null }] }),
          hand(3, -10, { hole: ["K♣", "Q♦"], folded: "TURN", winners: [{ name: "BOB #0002", hand: "Two pair, jacks and nines" }] }),
        ],
      },
      players: [
        { name: "ANN #0001", kind: "human", net: 30, hands: 3, you: true },
        { name: "Bot Saturn", kind: "cpu", net: 10, hands: 3, you: false },
        { name: "BOB #0002", kind: "human", net: -40, hands: 3, you: false },
      ],
    };

    it("shows your figures, everyone's chips and your chips over the hands", async () => {
      open(poker);
      expect(await screen.findByRole("heading", { name: "POKER" })).toBeInTheDocument();
      expect(screen.getByText(/High Rollers/)).toHaveTextContent("40 hands dealt");
      expect(screen.getByText("LOW")).toBeInTheDocument();
      const players = within(panel("Players")).getAllByRole("listitem");
      expect(players.map((li) => li.textContent)).toEqual(["1ANNYOU3 hands+30", "2Bot SaturnCPU3 hands+10", "3BOB3 hands-40"]);
      expect(within(panel("Your chips")).getByRole("img", { name: "Chips won or lost over 3 hands: +30 at the end." })).toBeInTheDocument();
      expect(within(panel("Showdown hands")).getByText("Pair").parentElement).toHaveTextContent("1/1");
    });

    it("lists every hand with your cards, the board and who won with what; filters to wins and showdowns", async () => {
      const user = userEvent.setup();
      open(poker);
      const list = await screen.findByRole("list", { name: "Your hands" });
      const rows = () => within(list).getAllByRole("listitem");
      expect(rows()).toHaveLength(3);
      expect(rows()[0]).toHaveTextContent("You won with pair of aces");
      expect(rows()[0]).toHaveTextContent("+50");
      expect(rows()[1]).toHaveTextContent("no flop");
      expect(rows()[1]).toHaveTextContent("You folded preflop · Bot Saturn won");
      expect(rows()[2]).toHaveTextContent("You folded on the turn · BOB won with two pair, jacks and nines");
      expect(within(rows()[2]).getByLabelText("Your cards")).toHaveTextContent("K♣Q♦");
      await user.click(screen.getByRole("button", { name: "Won" }));
      expect(rows()).toHaveLength(1);
      await user.click(screen.getByRole("button", { name: "Showdowns" }));
      expect(rows().map((r) => r.firstChild.textContent)).toEqual(["#1"]);
    });

    it("a table from before hands were logged keeps its totals and says why there's no detail", async () => {
      open({ ...poker, you: { ...poker.you, hands: null, showdownRanks: {} } });
      expect(await screen.findByRole("heading", { name: "POKER" })).toBeInTheDocument();
      expect(screen.getAllByText(/played before hands were kept hand by hand/)).toHaveLength(3);
      expect(screen.queryByRole("list", { name: "Your hands" })).not.toBeInTheDocument();
    });
  });
});
