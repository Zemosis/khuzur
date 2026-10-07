import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RulesModal from "../../src/components/thirteen/RulesModal";

const SECTIONS = ["The goal", "Card order", "Playing a round", "Combinations", "5-card hands", "Breaking ties", "Scoring", "Controls"];

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
});
