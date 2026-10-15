// The in-game poker rulebook covers credit tables, with the stakes taken from
// the same tier table the server checks buy-ins against.

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PokerRules from "../../src/components/poker/PokerRules";

describe("poker rules", () => {
  it("has a Credit tables section listing each tier's blinds and buy-in", () => {
    render(<PokerRules onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "HOW TO PLAY POKER" });
    const nav = within(dialog).getByRole("navigation", { name: "Rule sections" });
    expect(within(nav).getByRole("button", { name: /Credit tables/ })).toBeInTheDocument();
    expect(within(dialog).getByText("LOW: blinds 5/10, buy in 200–1,000. People only, no CPUs.")).toBeInTheDocument();
    expect(within(dialog).getByText("HIGH: blinds 100/200, buy in 4,000–20,000. People only, no CPUs.")).toBeInTheDocument();
  });
});
