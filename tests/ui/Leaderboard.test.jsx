import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Leaderboard from "../../src/pages/Leaderboard";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("../../src/lib/api", () => ({ api: apiMock }));
vi.mock("../../src/utils/socket", () => ({ socket: {}, connectSocket: () => {} }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, online: 1 }) }));
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ identity: { name: "ME", tag: "0001", avatar: "1" }, isGuest: false, loading: false }) }));

const rowOf = (rank, name, total, extra = {}) => ({ rank, name, tag: "0001", avatar: { variant: "1", custom: null }, total, atTable: false, me: false, ...extra });
const render_ = async (body) => {
  apiMock.mockResolvedValue(body);
  render(
    <MemoryRouter>
      <Leaderboard />
    </MemoryRouter>,
  );
  await act(async () => {});
};

beforeEach(() => apiMock.mockReset());

describe("leaderboard", () => {
  it("lists the top players with ranks, totals and who's at a table", async () => {
    await render_({ top: [rowOf(1, "ANN", 30000, { atTable: true }), rowOf(2, "BOB", 2000), rowOf(2, "CAT", 2000)], me: null });
    expect(apiMock).toHaveBeenCalledWith("/leaderboard", { base: "/api/credits" });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringMatching(/1.*ANN #0001.*AT TABLE.*30,000/), expect.stringMatching(/2.*BOB #0001.*2,000/), expect.stringMatching(/2.*CAT #0001.*2,000/)]);
  });

  it("highlights you in the top 100", async () => {
    await render_({ top: [rowOf(1, "ANN", 3000), rowOf(2, "ME", 2000, { me: true })], me: { rank: 2, total: 2000, around: null } });
    expect(screen.getByText("ME #0001").closest("tr")).toHaveAttribute("aria-current", "true");
    expect(screen.queryByText("Your rank")).toBeNull();
  });

  it("outside the top 100 shows your rank with five above and five below", async () => {
    const around = Array.from({ length: 11 }, (_, i) => rowOf(150 + i, `P${150 + i}`, 900 - i, { me: i === 5 }));
    await render_({ top: [rowOf(1, "ANN", 30000)], me: { rank: 155, total: 895, around } });
    const mine = screen.getByRole("table", { name: "Your rank" });
    expect(within(mine).getAllByRole("row").slice(1)).toHaveLength(11);
    expect(within(mine).getByText("P155 #0001").closest("tr")).toHaveAttribute("aria-current", "true");
  });

  it("says when nobody has played yet", async () => {
    await render_({ top: [], me: null });
    expect(screen.getByText("No one has played for credits yet.")).toBeInTheDocument();
  });
});
