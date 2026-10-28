import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RulebookPicker from "../../src/components/RulebookPicker";
import RulesModal from "../../src/components/thirteen/RulesModal";

const SECTIONS = ["The goal", "Card order", "Playing a round", "Combinations", "5-card hands", "Breaking ties", "Scoring", "CPU levels", "Playing for credits", "XP, levels and gold", "Controls"];

describe("RulesModal", () => {
  it("is a labelled dialog with every section in the nav and the body", () => {
    render(<RulesModal onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "HOW TO PLAY THIRTEEN" });
    const nav = within(dialog).getByRole("navigation", { name: "Rule sections" });
    SECTIONS.forEach((label) => {
      expect(within(nav).getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
      expect(within(dialog).getByRole("heading", { name: new RegExp(label) })).toBeInTheDocument();
    });
  });

  it("explains the pass rule the engine enforces", () => {
    render(<RulesModal onClose={() => {}} />);
    expect(screen.getByText("PASSING SKIPS ONE TURN")).toBeInTheDocument();
    expect(screen.getByText(/can't play until your turn comes around again/)).toBeInTheDocument();
    expect(screen.getByText(/leader of a trick can't pass/)).toBeInTheDocument();
    expect(screen.queryByText(/until the trick ends/)).not.toBeInTheDocument();
  });

  it("describes the three CPU levels, and that they never see your cards", () => {
    render(<RulesModal onClose={() => {}} />);
    const section = screen.getByRole("heading", { name: /CPU levels/ }).closest("section");
    ["EASY", "MEDIUM", "HARD"].forEach((level) => expect(within(section).getAllByText(level).length).toBeGreaterThan(0));
    expect(within(section).getByText("NO PEEKING")).toBeInTheDocument();
  });

  it("says what a match pays in XP and gold, and what levels cost", () => {
    render(<RulesModal onClose={() => {}} />);
    const section = screen.getByRole("heading", { name: /XP, levels and gold/ }).closest("section");
    expect(within(section).getByText("70 XP and 80 gold")).toBeInTheDocument();
    expect(section).toHaveTextContent("Level 2 takes 100 XP, and each level after takes 50 more, up to 1,500 a level");
    expect(section).toHaveTextContent("level 5 pays 250");
  });

  it("states the scoring thresholds from GAME_SETTINGS", () => {
    render(<RulesModal onClose={() => {}} />);
    expect(screen.getAllByText(/30/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10/).length).toBeGreaterThan(0);
  });

  it("focuses CLOSE, and CLOSE, Escape and the backdrop all close it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<RulesModal onClose={onClose} />);
    const close = screen.getByRole("button", { name: /CLOSE/ });
    expect(close).toHaveFocus();
    await user.click(close);
    await user.keyboard("{Escape}");
    await user.pointer({ keys: "[MouseLeft>]", target: container.firstChild });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("clicking inside the dialog doesn't close it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RulesModal onClose={onClose} />);
    await user.click(screen.getByRole("heading", { name: /Scoring/ }));
    await user.click(screen.getByRole("button", { name: /Scoring/ }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the rulebook picker has Blackjack with 3:2, stands on all 17s, insurance 2:1", async () => {
    const user = userEvent.setup();
    render(<RulebookPicker />);
    await user.click(screen.getByRole("button", { name: /Rules/ }));
    await user.click(screen.getByRole("menuitem", { name: /BLACKJACK/ }));
    const dialog = screen.getByRole("dialog", { name: "HOW TO PLAY BLACKJACK" });
    expect(within(dialog).getByText(/3:2/)).toBeInTheDocument();
    expect(within(dialog).getByText(/stands on all 17s/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/insurance pays 2:1/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: /XP, levels and gold/ })).toBeInTheDocument();
    expect(within(dialog).getByText(/for each round you bet in/)).toBeInTheDocument();
    expect(within(dialog).getByText("A round pays the same with nobody else at the table")).toBeInTheDocument();
    expect(within(dialog).queryByText(/only if another person/)).toBeNull();
    expect(within(dialog).queryByText(/Playing CPUs alone/)).toBeNull();
  });
});
