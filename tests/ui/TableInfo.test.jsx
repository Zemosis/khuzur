import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ScoreBoard from "../../src/components/thirteen/ScoreBoard";
import OpponentSection from "../../src/components/thirteen/OpponentSection";
import PlayArea from "../../src/components/thirteen/PlayArea";
import { cards } from "../helpers/cards.js";

const player = (id, over = {}) => ({
  id,
  name: `P${id} #000${id}`,
  hand: Array.from({ length: 13 }, () => ({ hidden: true })),
  score: 0,
  isEliminated: false,
  hasPassed: false,
  ...over,
});

describe("ScoreBoard", () => {
  const players = [
    player(0, { score: 12 }),
    player(1, { score: 3, hasPassed: true, hand: [{}, {}] }),
    player(2, { score: 30, isEliminated: true, hand: [] }),
    player(3, { score: 7 }),
  ];

  const rows = () => within(screen.getByRole("region", { name: "Scoreboard" })).getAllByRole("listitem");

  it("ranks lowest score first and shows score out of 30", () => {
    render(<ScoreBoard players={players} currentPlayerIndex={3} roundNumber={4} />);
    expect(screen.getByText("ROUND 4")).toBeInTheDocument();
    const r = rows();
    expect(r.map((li) => within(li).getByText(/^P\d$/).textContent)).toEqual(["P1", "P3", "P0", "P2"]);
    expect(r[0]).toHaveTextContent("#1");
    expect(r[0]).toHaveTextContent("3/30");
    expect(r[0]).toHaveTextContent("2 cards");
  });

  it("marks turn, pass and out, and your own row", () => {
    render(<ScoreBoard players={players} currentPlayerIndex={3} myIndex={0} />);
    const [p1, p3, p0, p2] = rows();
    expect(within(p3).getByText("TURN")).toBeInTheDocument();
    expect(within(p1).getByText("PASS")).toBeInTheDocument();
    expect(within(p2).getByText("OUT")).toBeInTheDocument();
    expect(within(p0).getByLabelText("You")).toBeInTheDocument();
    expect(within(p1).queryByLabelText("You")).toBeNull();
  });

  it("an eliminated player never shows as on turn", () => {
    render(<ScoreBoard players={players} currentPlayerIndex={2} />);
    expect(screen.queryByText("TURN")).toBeNull();
  });

  it("shows match wins", () => {
    render(<ScoreBoard players={players} matchWins={[0, 2, 0, 0]} />);
    expect(rows()[0]).toHaveTextContent("2W");
  });
});

describe("OpponentSection", () => {
  it("shows the name without its tag and the card count", () => {
    render(<OpponentSection player={player(1, { hand: [{}] })} />);
    expect(screen.getByText("P1")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("card")).toBeInTheDocument();
  });

  it.each([
    [{ isActive: true }, "TURN"],
    [{ hasPassed: true }, "PASS"],
    [{ player: player(1, { isEliminated: true }) }, "OUT"],
  ])("status chip %#", (props, chip) => {
    render(<OpponentSection player={player(1)} {...props} />);
    expect(screen.getByText(chip)).toBeInTheDocument();
  });

  it("OUT wins over TURN and PASS", () => {
    render(<OpponentSection player={player(1, { isEliminated: true })} isActive hasPassed />);
    expect(screen.getByText("OUT")).toBeInTheDocument();
    expect(screen.queryByText("TURN")).toBeNull();
  });

  it("keeps a landing spot for the deal", () => {
    const { container } = render(<OpponentSection player={player(1)} position="left" />);
    expect(container.querySelector('[data-deal-seat="left"]')).not.toBeNull();
  });
});

describe("PlayArea", () => {
  const play = (i, ids, type, seat = "bottom") => ({ key: `1-1-${i}`, index: i, cards: cards(ids), type, seat });

  it("waits for the first play", () => {
    render(<PlayArea roundNumber={2} />);
    expect(screen.getByText("ROUND 2")).toBeInTheDocument();
    expect(screen.getByText("WAITING FOR FIRST PLAY...")).toBeInTheDocument();
  });

  it("shows who played what while the trick is open", () => {
    render(<PlayArea pile={[play(0, "5♦ 5♠", "PAIR")]} trickOpen lastPlayerName="Bob" />);
    expect(screen.getByText(/BOB PLAYED/)).toBeInTheDocument();
    expect(screen.getByText("PAIR")).toBeInTheDocument();
    expect(screen.getByText("BEAT THIS OR PASS")).toBeInTheDocument();
  });

  it("announces the new leader once a trick is won", () => {
    render(<PlayArea pile={[play(0, "2♠", "SINGLE")]} trickOpen={false} leaderName="Ann" />);
    expect(screen.getByText(/TRICK WON/)).toBeInTheDocument();
    expect(screen.getByText("ANN")).toBeInTheDocument();
    expect(screen.getByText("ANY COMBINATION CAN LEAD")).toBeInTheDocument();
  });

  it("keeps every play of the round on the felt, newest on top", () => {
    const { container } = render(
      <PlayArea pile={[play(0, "3♦", "SINGLE"), play(2, "9♠", "SINGLE"), play(3, "3♣ 4♣ 5♣ 6♣ 7♣", "STRAIGHT_FLUSH")]} trickOpen />,
    );
    expect(container.querySelectorAll(".pixel-card")).toHaveLength(7);
    expect(screen.getByText("STRAIGHT FLUSH")).toBeInTheDocument();
  });
});
