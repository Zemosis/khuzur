import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GameControls from "../../src/components/thirteen/GameControls";

const setup = (props = {}) => {
  const handlers = { onPlay: vi.fn(), onPass: vi.fn(), onClear: vi.fn(), onSelectAll: vi.fn(), onSortModeChange: vi.fn() };
  render(<GameControls {...handlers} {...props} />);
  return handlers;
};
const btn = (name) => screen.getByRole("button", { name });

describe("GameControls", () => {
  it("everything but sorting is disabled when it's not your turn", () => {
    setup({ canPlay: true, canPass: true, isPlayerTurn: false });
    expect(btn(/^PLAY/)).toBeDisabled();
    expect(btn(/^PASS/)).toBeDisabled();
    expect(btn("CLEAR")).toBeDisabled();
    expect(btn("ALL")).toBeDisabled();
    expect(btn("RANK")).toBeEnabled();
  });

  it("PASS is disabled while leading a trick", () => {
    setup({ isPlayerTurn: true, canPass: false, canPlay: true });
    expect(btn(/^PASS/)).toBeDisabled();
    expect(btn(/^PLAY/)).toBeEnabled();
  });

  it("buttons call their handlers and show key hints on your turn", async () => {
    const user = userEvent.setup();
    const h = setup({ isPlayerTurn: true, canPlay: true, canPass: true, canSelect: true, selectedCount: 2 });
    expect(btn(/^PLAY/)).toHaveTextContent("(SPACE)");
    expect(btn(/^PASS/)).toHaveTextContent("(P)");
    await user.click(btn(/^PLAY/));
    await user.click(btn(/^PASS/));
    await user.click(btn("CLEAR"));
    await user.click(btn("ALL"));
    expect([h.onPlay, h.onPass, h.onClear, h.onSelectAll].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  it("Space plays and P passes, only when allowed", async () => {
    const user = userEvent.setup();
    const h = setup({ isPlayerTurn: true, canPlay: true, canPass: false });
    await user.keyboard(" ");
    await user.keyboard("p");
    expect(h.onPlay).toHaveBeenCalledTimes(1);
    expect(h.onPass).not.toHaveBeenCalled();
  });

  it("keyboard shortcuts do nothing when it isn't your turn", async () => {
    const user = userEvent.setup();
    const h = setup({ isPlayerTurn: false, canPlay: true, canPass: true });
    await user.keyboard(" p");
    expect(h.onPlay).not.toHaveBeenCalled();
    expect(h.onPass).not.toHaveBeenCalled();
  });

  it("CLEAR needs a selection", () => {
    setup({ isPlayerTurn: true, canSelect: true, selectedCount: 0 });
    expect(btn("CLEAR")).toBeDisabled();
    expect(btn("ALL")).toBeEnabled();
  });

  it("the sort toggle shows the active mode and switches", async () => {
    const user = userEvent.setup();
    const h = setup({ sortMode: "suit" });
    expect(btn("SUIT")).toHaveAttribute("aria-pressed", "true");
    expect(btn("RANK")).toHaveAttribute("aria-pressed", "false");
    await user.click(btn("RANK"));
    expect(h.onSortModeChange).toHaveBeenCalledWith("rank");
  });

  it("shows the selection, combo and errors", () => {
    const { rerender } = render(<GameControls message="Your turn" selectedCount={3} comboInfo={{ isValid: false, text: "Invalid" }} />);
    expect(screen.getByText("Your turn", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByText("Invalid")).toBeInTheDocument();
    rerender(<GameControls message="Your turn" errorMessage="Must play a stronger combination" />);
    expect(screen.getByText("Must play a stronger combination")).toBeInTheDocument();
    expect(screen.queryByText("Your turn")).not.toBeInTheDocument();
  });

  it("on your turn the status line turns gold", () => {
    const { rerender } = render(<GameControls message="Your turn!" isPlayerTurn />);
    expect(screen.getByText("Your turn!")).toHaveStyle({ color: "#f4c430" });
    rerender(<GameControls message="Waiting for ANN..." />);
    expect(screen.getByText("Waiting for ANN...")).not.toHaveStyle({ color: "#f4c430" });
  });
});
