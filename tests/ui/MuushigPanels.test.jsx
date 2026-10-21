// The Muushig table's panels: the in-game rulebook (kept in step with the
// engine's numbers), the round results overlay and the scoreboard.

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MuushigRules from "../../src/components/muushig/MuushigRules";
import RoundResults from "../../src/components/muushig/RoundResults";
import MuushigScoreBoard from "../../src/components/muushig/MuushigScoreBoard";
import { MAX_DRAW_DEPTH, MAX_FOLDS_IN_A_ROW, MIN_PLAYING, START_SCORE, ZERO_PILES_PENALTY } from "../../src/utils/muushig/engine";

const SECTIONS = ["The goal", "Cards", "Dealer, deal, trump", "Go in or fold", "Swapping cards", "Playing tricks", "Scoring", "CPU levels", "Playing for credits", "Controls"];
const NAMES = ["You", "Bot Saturn", "Bot Venus", "Bot Mars", "Bot Jupiter"];
const players = (over = []) => NAMES.map((name, id) => ({ id, name, score: 15, eaten: 0, ...over[id] }));
const face = () => ({ variant: 1, customAvatarData: null });

describe("MuushigRules", () => {
  it("is a labelled dialog with every section in the nav and the body", () => {
    render(<MuushigRules onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "HOW TO PLAY MUUSHIG" });
    const nav = within(dialog).getByRole("navigation", { name: "Rule sections" });
    for (const label of SECTIONS) {
      expect(within(nav).getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
      expect(within(dialog).getByRole("heading", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("states the numbers the engine enforces", () => {
    render(<MuushigRules onClose={() => {}} />);
    expect(screen.getAllByText(`${START_SCORE} points`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(`gain ${ZERO_PILES_PENALTY} points`)).length).toBeGreaterThan(0);
    expect(screen.getByText(`AT LEAST ${MIN_PLAYING} MUST GO IN`)).toBeInTheDocument();
    expect(screen.getByText(`NO ${MAX_FOLDS_IN_A_ROW + 1} FOLDS IN A ROW`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`from 1 to ${MAX_DRAW_DEPTH} cards down`))).toBeInTheDocument();
    expect(screen.getByText(/whoever ate more piles in that last round/)).toBeInTheDocument();
  });

  it("describes the three CPU levels, and that they never see your cards", () => {
    render(<MuushigRules onClose={() => {}} />);
    const section = screen.getByRole("heading", { name: /CPU levels/ }).closest("section");
    ["EASY", "MEDIUM", "HARD"].forEach((level) => expect(within(section).getAllByText(level).length).toBeGreaterThan(0));
    expect(within(section).getByText("NO PEEKING")).toBeInTheDocument();
    expect(within(section).getByText(/an ace there is a pile in the bag/)).toBeInTheDocument();
  });

  it("closes from the button and with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MuushigRules onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("RoundResults", () => {
  const result = (seat, eaten, folded, delta, score) => ({ seat, eaten, folded, delta, score });

  it("ranks a scored round lowest score first, with each change, and moves on", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <RoundResults
        round={3}
        players={players()}
        faceFor={face}
        results={[
          result(0, 2, false, -2, 8),
          result(1, 0, false, 5, 14),
          result(2, 0, true, 0, 11),
          result(3, 3, false, -3, 6),
          result(4, 0, true, 0, 12),
        ]}
        onNext={onNext}
      />,
    );
    expect(screen.getByText("ROUND 3 SCORED")).toBeInTheDocument();
    const rows = screen.getAllByText(/^#\d$/).map((el) => el.parentElement);
    expect(rows.map((r) => within(r).getByText(new RegExp(NAMES.join("|"))).textContent)).toEqual(["Bot Mars", "You", "Bot Venus", "Bot Jupiter", "Bot Saturn"]);
    expect(rows[0]).toHaveTextContent("3 eaten");
    expect(rows[0]).toHaveTextContent("-3");
    expect(rows[2]).toHaveTextContent("folded");
    expect(rows[2]).toHaveTextContent("±0");
    expect(rows[4]).toHaveTextContent("+5");
    await user.click(screen.getByRole("button", { name: "NEXT ROUND" }));
    expect(onNext).toHaveBeenCalled();
  });

  it("marks a sweep as ROUND WON", () => {
    render(
      <RoundResults
        round={1}
        players={players()}
        faceFor={face}
        results={[result(0, 5, false, -5, 10), ...[1, 2, 3, 4].map((s) => result(s, 0, false, 5, 20))]}
        onNext={() => {}}
      />,
    );
    expect(screen.getByText("ROUND WON").closest("div.flex.items-center.gap-3")).toHaveTextContent("You");
  });

  it("at match end names the winner, ranks them first, and offers a rematch or exit", async () => {
    const user = userEvent.setup();
    const onRematch = vi.fn();
    const onExit = vi.fn();
    render(
      <RoundResults
        round={9}
        players={players()}
        faceFor={face}
        matchWinner={3}
        results={[result(0, 1, false, -1, 4), result(1, 0, true, 0, 9), result(2, 0, false, 5, 12), result(3, 4, false, -4, -1), result(4, 0, true, 0, 7)]}
        onRematch={onRematch}
        onExit={onExit}
      />,
    );
    expect(screen.getByText("MATCH OVER")).toBeInTheDocument();
    expect(screen.getByText("BOT MARS WINS THE MATCH!")).toBeInTheDocument();
    expect(screen.getByText("#1").parentElement).toHaveTextContent("Bot Mars");
    expect(screen.queryByRole("button", { name: "NEXT ROUND" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "REMATCH" }));
    await user.click(screen.getByRole("button", { name: "EXIT" }));
    expect(onRematch).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });

  it("on a tie for the lowest score, ranks the match winner (more piles that round) first", () => {
    // Rulebook §8: You and Bot Saturn both finish on 0; Bot Saturn ate more piles, so wins.
    render(
      <RoundResults
        round={7}
        players={players()}
        faceFor={face}
        matchWinner={1}
        results={[result(0, 2, false, -2, 0), result(1, 3, false, -3, 0), result(2, 0, true, 0, 9), result(3, 0, true, 0, 9), result(4, 0, true, 0, 9)]}
        onRematch={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByText("BOT SATURN WINS THE MATCH!")).toBeInTheDocument();
    expect(screen.getByText("#1").parentElement).toHaveTextContent("Bot Saturn");
  });
});

describe("MuushigScoreBoard", () => {
  it("ranks lowest score first and shows each player's round so far", () => {
    render(
      <MuushigScoreBoard
        players={players([{ score: 9, eaten: 2 }, { score: 4, eaten: 0 }, { score: 12, folded: true }, { score: 7, eaten: 5 }, { score: 15 }])}
        currentPlayerIndex={1}
        dealerIndex={4}
        myIndex={0}
        faceFor={face}
      />,
    );
    const rows = within(screen.getByRole("region", { name: "Scoreboard" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent.match(new RegExp(NAMES.join("|")))[0])).toEqual(["Bot Saturn", "Bot Mars", "You", "Bot Venus", "Bot Jupiter"]);
    expect(rows[0]).toHaveTextContent("TURN");
    expect(rows[0]).toHaveTextContent("0 eaten · +5");
    expect(rows[1]).toHaveTextContent("round won · -5");
    expect(rows[2]).toHaveTextContent("2 eaten · -2");
    expect(rows[2].querySelector('[aria-label="You"]')).not.toBeNull();
    expect(rows[3]).toHaveTextContent("FOLD");
    expect(rows[3]).toHaveTextContent("sitting out");
    expect(within(rows[4]).getByTitle("Dealer")).toHaveTextContent("D");
  });

  it("breaks a tie on score the way the match does: more piles eaten this round first", () => {
    render(<MuushigScoreBoard players={players([{ score: 0, eaten: 2 }, { score: 0, eaten: 3 }])} faceFor={face} />);
    const rows = within(screen.getByRole("region", { name: "Scoreboard" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Bot Saturn");
    expect(rows[1]).toHaveTextContent("You");
  });
});
