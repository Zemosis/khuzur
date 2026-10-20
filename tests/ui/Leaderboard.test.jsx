import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Leaderboard from "../../src/pages/Leaderboard";

const { apiMock, auth } = vi.hoisted(() => ({ apiMock: vi.fn(), auth: { isGuest: false } }));
vi.mock("../../src/lib/api", () => ({ api: apiMock }));
vi.mock("../../src/utils/socket", () => ({ socket: {}, connectSocket: () => {} }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, online: 1 }) }));
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ identity: { name: "ME", tag: "0001", avatar: "1" }, isGuest: auth.isGuest, loading: false }) }));

const sources = (poker = 0, claimed = 0) => ({ start: 1000, claimed, poker, admin: 0 });
const rowOf = (rank, name, total, extra = {}) => ({
  rank, name, tag: "0001", avatar: { variant: "1", custom: null }, total, atTable: false, me: false,
  sources: sources(total - 1000), ...extra,
});
const open = async (body) => {
  apiMock.mockResolvedValue(body);
  const r = render(
    <MemoryRouter>
      <Leaderboard />
    </MemoryRouter>,
  );
  await act(async () => {});
  return r;
};
const items = (name) => within(screen.getByRole("list", { name })).getAllByRole("listitem");
const names = (name) => items(name).map((li) => within(li).getAllByRole("button")[0].getAttribute("aria-label"));

// Braces: a function returned from beforeEach is run as teardown, and mockReset returns the mock.
beforeEach(() => {
  apiMock.mockReset();
  auth.isGuest = false;
});

describe("leaderboard", () => {
  const four = [rowOf(1, "ANN", 30000, { atTable: true }), rowOf(2, "BOB", 2000), rowOf(2, "CAT", 2000), rowOf(4, "DAN", 900, { sources: sources(-400, 300) })];

  it("lists everyone with their credits and each game's net, under a TOP 100 banner", async () => {
    await open({ top: four, me: null });
    expect(apiMock).toHaveBeenCalledWith("/leaderboard", { base: "/api/credits" });
    expect(screen.getByRole("heading", { name: "Top 100" })).toBeInTheDocument();
    expect(names("Top 100")).toEqual(["1. ANN #0001: 30,000 credits", "2. BOB #0001: 2,000 credits", "2. CAT #0001: 2,000 credits", "4. DAN #0001: 900 credits"]);
    const rows = items("Top 100");
    expect(rows[0]).toHaveTextContent(/AT TABLE.*\+29,000 Poker/);
    expect(rows[3]).toHaveTextContent("−400 Poker");
    expect(rows[3]).not.toHaveTextContent("+300"); // claims only in the breakdown
    // A column per game: poker's net, and Thirteen and Muushig marked as coming.
    expect(within(rows[3]).getByLabelText("Poker −400")).toBeInTheDocument();
    expect(within(rows[3]).getByLabelText("Thirteen: soon")).toHaveTextContent("—");
    expect(within(rows[3]).getByLabelText("Muushig: soon")).toHaveTextContent("—");
  });

  it("a row opens to where its credits came from: the start as a note, then claims and each game", async () => {
    await open({ top: four, me: null });
    const dan = screen.getByRole("button", { name: "4. DAN #0001: 900 credits" });
    await userEvent.click(dan);
    expect(dan).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Started with 1,000")).toBeInTheDocument();
    const breakdown = screen.getByRole("list", { name: "Where DAN's credits came from" });
    expect(within(breakdown).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Daily claims+300", "Poker−400"]);
    await userEvent.click(dan);
    expect(screen.queryByRole("list", { name: "Where DAN's credits came from" })).toBeNull();
  });

  it("shows ten to a page, and pages through the rest", async () => {
    const many = Array.from({ length: 23 }, (_, i) => rowOf(i + 1, `P${i + 1}`, 5000 - i));
    await open({ top: many, me: null });
    expect(items("Top 100")).toHaveLength(10);
    expect(screen.getByText("Page 1/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(names("Top 100")[0]).toBe("11. P11 #0001: 4,990 credits");
    await userEvent.click(screen.getByRole("button", { name: "Last page" }));
    expect(items("Top 100")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("search narrows the list by name, from the first page", async () => {
    const many = Array.from({ length: 23 }, (_, i) => rowOf(i + 1, i === 20 ? "ZED" : `P${i + 1}`, 5000 - i));
    await open({ top: many, me: null });
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search players" }), "zed");
    expect(names("Top 100")).toEqual(["21. ZED #0001: 4,980 credits"]);
    await userEvent.clear(screen.getByRole("searchbox", { name: "Search players" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search players" }), "nobody");
    expect(screen.getByText('Nobody called "nobody" here.')).toBeInTheDocument();
  });

  it("YOUR STANDING shows you with five above and five below, marked", async () => {
    const around = Array.from({ length: 11 }, (_, i) => rowOf(150 + i, `P${150 + i}`, 900 - i, { me: i === 5 }));
    await open({ top: four, me: { rank: 155, total: 895, around } });
    await userEvent.click(screen.getByRole("tab", { name: "Your standing" }));
    expect(screen.getByRole("heading", { name: "Your standing" })).toBeInTheDocument();
    const rows = items("Your standing");
    expect(rows).toHaveLength(11);
    expect(rows[5]).toHaveAttribute("aria-current", "true");
    expect(screen.queryByText(/Page \d/)).toBeNull();
  });

  it("YOUR STANDING asks a guest to sign in, and a player not yet on the board to play a credit hand", async () => {
    auth.isGuest = true;
    const { unmount } = await open({ top: four, me: null });
    await userEvent.click(screen.getByRole("tab", { name: "Your standing" }));
    expect(screen.getByText("Sign in to see where you stand.")).toBeInTheDocument();
    unmount();

    auth.isGuest = false;
    await open({ top: four, me: null });
    await userEvent.click(screen.getByRole("tab", { name: "Your standing" }));
    expect(screen.getByText("Play a hand at a credit table to get on the board.")).toBeInTheDocument();
  });

  it("says when nobody has played yet", async () => {
    await open({ top: [], me: null });
    expect(screen.getByText("No one has played for credits yet.")).toBeInTheDocument();
  });
});
