// The Khuzur practice table, driven like a player would: the page opens on a
// prepared engine state and the hand, the buttons and the stack are used.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import GameKhuzur from "../../src/pages/khuzur/GameKhuzur";
import { seededRandom } from "../helpers/cards.js";
import { c, cs } from "../helpers/khuzur.js";

// The page opens on whatever state `start.state` holds (or a real new match).
const { start } = vi.hoisted(() => ({ start: { state: null, failLead: null } }));
vi.mock("../../src/utils/khuzur/engine", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createMatch: (opts) => start.state ?? real.createMatch(opts),
    lead: (...args) => {
      if (start.failLead) throw new Error(start.failLead);
      return real.lead(...args);
    },
  };
});
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ identity: { name: "TESTER", tag: "0001", avatar: "1", customAvatar: null } }),
}));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, online: 2 }) }));

const E = await vi.importActual("../../src/utils/khuzur/engine.js");
const TABLE = { perTeam: 1, teams: 2, handSize: 5 };

/** A 1v1 PLAY state: your hand, the CPU's, whose turn, the stack. */
function playing({ mine, theirs = "A♠ A♦ K♠ K♦ Q♠", turn = 0, stack = null, trumpCard = "A♥", phase, places }) {
  const players = [{ name: "TESTER", type: "HUMAN" }, { name: "Bot Saturn", type: "AI" }];
  const s = E.deal(E.createMatch({ players, table: TABLE, rng: seededRandom(1) }), 1, seededRandom(1));
  return {
    ...s,
    players: s.players.map((p, i) => ({ ...p, hand: cs(i === 0 ? mine : theirs) })),
    trumpSuit: "♥",
    trumpCard: trumpCard ? c(trumpCard) : null,
    drawPile: cs("7♣ 8♣ 9♦ 10♦ J♣ Q♣ 7♠ 8♠"),
    stack,
    turn,
    phase: phase ?? s.phase,
    places: places ?? s.places,
    events: [],
  };
}

function open(state) {
  start.state = state;
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/game-khuzur", state: { table: TABLE, playerName: "TESTER #0001" } }]}>
      <Routes>
        <Route path="/game-khuzur" element={<GameKhuzur />} />
        <Route path="/lobby-khuzur" element={<div>KHUZUR LOBBY</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const pick = async (...names) => {
  for (const name of names) await userEvent.click(screen.getByRole("button", { name }));
};
const btn = (name) => screen.getByRole("button", { name });

beforeEach(() => {
  start.state = null;
  start.failLead = null;
});

describe("leading", () => {
  it("LEAD lights up only for a valid lead, and puts the cards on the stack", async () => {
    open(playing({ mine: "J♠ J♦ 9♣ Q♦ 7♦" }));
    await pick("J♠", "Q♦");
    expect(btn("LEAD")).toBeDisabled();
    expect(screen.getByText("Lead 1, 3, 5 or 7 cards")).toBeInTheDocument();
    await pick("Q♦", "J♦", "9♣");
    expect(btn("LEAD")).toBeEnabled();
    await userEvent.click(btn("LEAD"));
    expect(screen.getAllByTestId("stack-card")).toHaveLength(3);
  });

  it("says why a lead isn't valid", async () => {
    open(playing({ mine: "J♠ J♦ 9♣ Q♦ 7♦" }));
    await pick("J♠", "Q♦", "9♣");
    expect(screen.getByText("Every card needs a pair, except one")).toBeInTheDocument();
  });

  it("shows the engine's reason when a move is refused, and keeps going", async () => {
    start.failLead = "Not your turn";
    open(playing({ mine: "J♠ J♦ 9♣ Q♦ 7♦" }));
    await pick("7♦");
    await userEvent.click(btn("LEAD"));
    expect(screen.getByRole("alert")).toHaveTextContent("Not your turn");
    expect(btn("7♦")).toBeInTheDocument();
  });
});

describe("beating", () => {
  const facing = (mine) => playing({ mine, turn: 0, stack: { leader: 1, layers: [cs("9♣")], owners: [1], pending: [0] } });

  it("BEAT lights up only when the picked cards beat the top layer", async () => {
    open(facing("8♠ 10♣ 7♦ 7♣ 8♦"));
    await pick("8♠");
    expect(btn("BEAT")).toBeDisabled();
    await pick("8♠", "10♣");
    expect(btn("BEAT")).toBeEnabled();
  });

  it("PICK UP takes the stack into your hand", async () => {
    open(facing("8♠ 10♣ 7♦ 7♣ 8♦"));
    await userEvent.click(btn("PICK UP"));
    expect(screen.queryAllByTestId("stack-card")).toHaveLength(0);
    expect(btn("9♣")).toBeInTheDocument();
  });
});

describe("the trump 7", () => {
  it("SWAP 7 shows on your turn and brings the old trump card into your hand", async () => {
    open(playing({ mine: "7♥ J♦ 9♣ Q♦ 7♦" }));
    await userEvent.click(btn("SWAP 7"));
    expect(btn("A♥")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SWAP 7" })).not.toBeInTheDocument();
  });

  it("isn't offered without the trump 7", () => {
    open(playing({ mine: "J♠ J♦ 9♣ Q♦ 7♦" }));
    expect(screen.queryByRole("button", { name: "SWAP 7" })).not.toBeInTheDocument();
  });
});

describe("the rules", () => {
  it("RULES in the header opens the rulebook", async () => {
    open(playing({ mine: "J♠ J♦ 9♣ Q♦ 7♦" }));
    await userEvent.click(screen.getByRole("button", { name: "Rules" }));
    expect(screen.getByRole("dialog", { name: "HOW TO PLAY KHUZUR" })).toBeInTheDocument();
  });
});

describe("the end of the match", () => {
  it("shows the standings, and PLAY AGAIN deals the next match", async () => {
    open(playing({ mine: "", theirs: "J♠", phase: E.PHASES.MATCH_OVER, places: [1, 2] }));
    const standings = screen.getByRole("dialog", { name: "STANDINGS" });
    expect(standings).toHaveTextContent("1ST");
    expect(standings).toHaveTextContent("TESTER");
    expect(standings).toHaveTextContent("2ND");
    expect(standings).toHaveTextContent("Bot Saturn");
    await userEvent.click(btn("PLAY AGAIN"));
    expect(screen.queryByRole("dialog", { name: "STANDINGS" })).not.toBeInTheDocument();
    expect(screen.getAllByText("MATCH 2").length).toBeGreaterThan(0);
  });

  it("SURRENDER asks first, then ends the match with you last", async () => {
    open(playing({ mine: "J♠ J♦ 9♣ Q♦ 7♦" }));
    await userEvent.click(btn("SURRENDER"));
    await userEvent.click(btn("YES, SURRENDER"));
    const standings = screen.getByRole("dialog", { name: "STANDINGS" });
    expect(standings).toHaveTextContent("1ST");
    expect(standings).toHaveTextContent("Bot Saturn");
  });

  it("a player who is out can't surrender, and the CPUs play on faster", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const table = { perTeam: 1, teams: 3, handSize: 5 };
      const players = [{ name: "TESTER", type: "HUMAN" }, { name: "Bot Saturn", type: "AI" }, { name: "Bot Venus", type: "AI" }];
      const s = E.deal(E.createMatch({ players, table, rng: seededRandom(1) }), 0, seededRandom(1));
      const state = {
        ...s,
        players: s.players.map((p, i) => ({ ...p, hand: cs(["", "9♦ 7♠", "10♦ 7♥"][i]), out: i === 0 })),
        places: [1, null, null],
        trumpSuit: "♥",
        trumpCard: null,
        drawPile: [],
        stack: null,
        turn: 1,
        events: [],
      };
      start.state = state;
      render(
        <MemoryRouter initialEntries={[{ pathname: "/game-khuzur", state: { table, playerName: "TESTER #0001" } }]}>
          <Routes>
            <Route path="/game-khuzur" element={<GameKhuzur />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.queryByRole("button", { name: "SURRENDER" })).not.toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getAllByTestId("stack-card").length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("LEAVE goes back to the builder", async () => {
    open(playing({ mine: "", theirs: "J♠", phase: E.PHASES.MATCH_OVER, places: [1, 2] }));
    await userEvent.click(btn("LEAVE"));
    expect(screen.getByText("KHUZUR LOBBY")).toBeInTheDocument();
  });
});
