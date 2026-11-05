// The Khuzur builder: pick players per team, teams and the deal, see the
// table, and START a practice table (spec "The host's builder").

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LobbyKhuzur from "../../src/pages/khuzur/LobbyKhuzur";

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => navigate }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, online: 2 }) }));
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ identity: { name: "LOOKER", tag: "0009", avatar: "1" } }) }));

const renderLobby = () =>
  render(
    <MemoryRouter>
      <LobbyKhuzur />
    </MemoryRouter>,
  );
const choose = (name) => userEvent.click(screen.getByRole("radio", { name }));

beforeEach(() => navigate.mockClear());

describe("LobbyKhuzur", () => {
  it("starts on pairs, 2 teams and the 5-card deal", () => {
    renderLobby();
    expect(screen.getByRole("radio", { name: "PAIRS" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "2 TEAMS" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "5 CARDS · 1 DECK" })).toBeChecked();
    expect(screen.getByText("4 players × 5 = 20 dealt · trump + 13 left to draw")).toBeInTheDocument();
  });

  it("trios can only be 2 teams", async () => {
    renderLobby();
    await choose("PAIRS");
    await choose("3 TEAMS");
    await choose("TRIOS");
    expect(screen.getByRole("radio", { name: "3 TEAMS" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "2 TEAMS" })).toBeChecked();
    expect(screen.getByText("6 players × 5 = 30 dealt · trump + 3 left to draw")).toBeInTheDocument();
  });

  it("counts the deal for 2v2v2 with two decks", async () => {
    renderLobby();
    await choose("3 TEAMS");
    await choose("7 CARDS · 2 DECKS");
    expect(screen.getByText("6 players × 7 = 42 dealt · trump + 23 left to draw")).toBeInTheDocument();
  });

  it("solo picks a player count from 2 to 6", async () => {
    renderLobby();
    await choose("SOLO");
    expect(screen.queryByRole("radio", { name: "2 TEAMS" })).not.toBeInTheDocument();
    await choose("5 PLAYERS");
    expect(screen.getByText("5 players × 5 = 25 dealt · trump + 8 left to draw")).toBeInTheDocument();
  });

  it("draws one seat per player, yours at the bottom, with teammates marked", async () => {
    renderLobby();
    await choose("3 TEAMS");
    expect(screen.getAllByTestId("preview-seat")).toHaveLength(6);
    expect(screen.getByText("YOU")).toBeInTheDocument();
    expect(screen.getAllByText("MATE")).toHaveLength(1);
  });

  it("START opens the table with what was chosen", async () => {
    renderLobby();
    await choose("3 TEAMS");
    await choose("7 CARDS · 2 DECKS");
    await userEvent.click(screen.getByRole("button", { name: /START/ }));
    expect(navigate).toHaveBeenCalledWith("/game-khuzur", {
      state: { table: { perTeam: 2, teams: 3, handSize: 7 }, playerName: "LOOKER #0009" },
    });
  });
});
