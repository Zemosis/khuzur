// Khuzur's in-game rulebook follows docs/khuzur-rulebook.md section by
// section, and the RULES picker and the table header open it.

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KhuzurRules from "../../src/components/khuzur/KhuzurRules";
import RulebookPicker from "../../src/components/RulebookPicker";

const SECTIONS = [
  "Cards",
  "The table",
  "The dealer",
  "Dealing and trump",
  "Leading",
  "Beating and picking up",
  "Drawing back up",
  "The trump 7",
  "Going out and standings",
  "Time limit and surrender",
  "Playing online",
  "CPU levels",
  "Playing for credits",
  "XP, levels and gold",
];

describe("KhuzurRules", () => {
  it("has every section of the rulebook, in order", () => {
    render(<KhuzurRules onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "HOW TO PLAY KHUZUR" });
    const headings = within(dialog).getAllByRole("heading", { level: 2 }).map((h) => h.textContent.replace(/^\d+/, ""));
    expect(headings).toEqual(SECTIONS);
  });

  it("draws the lead examples with real cards, jokers included", () => {
    const { container } = render(<KhuzurRules onClose={() => {}} />);
    expect(container.querySelectorAll(".joker-gray").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".joker-color").length).toBeGreaterThan(0);
    expect(screen.getByText(/at most one/i)).toBeInTheDocument();
  });

  it("explains online seats, the team vote, and that 1st takes the pot", () => {
    render(<KhuzurRules onClose={() => {}} />);
    expect(screen.getByText(/SIT HERE/)).toBeInTheDocument();
    expect(screen.getByText(/every person on your team has to agree/i)).toBeInTheDocument();
    expect(screen.getByText(/1st place takes the pot/i)).toBeInTheDocument();
    expect(screen.getAllByText("EASY").length).toBeGreaterThan(0);
  });

  it("states the deck sizes and the 2-minute online turn", () => {
    render(<KhuzurRules onClose={() => {}} />);
    expect(screen.getAllByText(/34 cards/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/66 cards/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 minutes/)).toBeInTheDocument();
  });
});

describe("the RULES picker", () => {
  it("lists Khuzur and opens its rulebook", async () => {
    const user = userEvent.setup();
    render(<RulebookPicker />);
    await user.click(screen.getByRole("button", { name: /Rules/ }));
    await user.click(screen.getByRole("menuitem", { name: /KHUZUR/ }));
    expect(screen.getByRole("dialog", { name: "HOW TO PLAY KHUZUR" })).toBeInTheDocument();
  });
});
