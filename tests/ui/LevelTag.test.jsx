// A signed-in player's level shows as "LV n" beside their name: at Thirteen's
// and Muushig's seats, at a poker seat and on a match page. Guests and CPUs
// have none.

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import LevelTag from "../../src/components/LevelTag";
import OpponentSection from "../../src/components/thirteen/OpponentSection";
import PokerSeat from "../../src/components/poker/PokerSeat";
import Standings from "../../src/components/match/Standings";

const opponent = { id: 1, name: "ANN #0001", hand: [{ hidden: true }], isEliminated: false };
const pokerPlayer = { name: "BOB #0002", type: "HUMAN", stack: 500, inHand: false, folded: false, hole: [] };

describe("LevelTag", () => {
  it("reads LV n, and is nothing without a level", () => {
    const { container } = render(<LevelTag level={null} />);
    expect(container).toBeEmptyDOMElement();
    render(<LevelTag level={12} />);
    expect(screen.getByTitle("Level 12")).toHaveTextContent("LV 12");
  });

  it.each(["full", "row", "strip"])("sits beside an opponent's name (%s)", (layout) => {
    render(<OpponentSection player={opponent} xpLevel={4} layout={layout} />);
    expect(screen.getByText("LV 4")).toBeInTheDocument();
  });

  it("a guest or CPU seat has none", () => {
    render(<OpponentSection player={opponent} />);
    expect(screen.queryByText(/^LV /)).not.toBeInTheDocument();
  });

  it("sits beside a poker player's name", () => {
    render(<PokerSeat player={pokerPlayer} face={{ variant: 1 }} xpLevel={9} />);
    expect(screen.getByText("LV 9")).toBeInTheDocument();
  });

  it("shows on a match page's standings, for people only", () => {
    const standings = [
      { seat: 0, name: "ANN #0001", kind: "human", xpLevel: 6, place: 1, score: 0 },
      { seat: 1, name: "Bot Mars", kind: "cpu", level: "HARD", xpLevel: null, place: 2, score: 12 },
    ];
    render(<Standings standings={standings} you={0} picked={0} onPick={() => {}} />);
    const [ann, bot] = screen.getAllByRole("listitem");
    expect(within(ann).getByText("LV 6")).toBeInTheDocument();
    expect(within(bot).queryByText(/^LV /)).not.toBeInTheDocument();
  });
});
