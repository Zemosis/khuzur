import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BetControls from "../../src/components/poker/BetControls";

// Facing a raise to 30 with 1000 behind: 30 to call, raises from 50 to 1000.
const facing = { toCall: 30, canCheck: false, canRaise: true, minRaiseTo: 50, maxRaiseTo: 1000 };
const setup = (props = {}) => {
  const onMove = vi.fn();
  render(<BetControls legal={facing} pot={45} currentBet={30} onMove={onMove} message="Your turn" {...props} />);
  return onMove;
};

describe("BetControls", () => {
  it("offers fold, call and a raise starting at the minimum", async () => {
    const onMove = setup();
    await userEvent.click(screen.getByRole("button", { name: /FOLD/ }));
    await userEvent.click(screen.getByRole("button", { name: /CALL 30/ }));
    await userEvent.click(screen.getByRole("button", { name: "RAISE TO 50" }));
    expect(onMove.mock.calls.map(([m]) => m)).toEqual([{ type: "fold" }, { type: "call" }, { type: "raise", amount: 50 }]);
  });

  it("CHECK when there's nothing to call, BET when nobody has bet", () => {
    setup({ legal: { ...facing, toCall: 0, canCheck: true, minRaiseTo: 10 }, currentBet: 0 });
    expect(screen.getByRole("button", { name: /CHECK/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BET 10" })).toBeInTheDocument();
  });

  it("½ POT and POT size the raise from the pot after calling; ALL-IN goes all in", async () => {
    const onMove = setup();
    await userEvent.click(screen.getByRole("button", { name: "POT" }));
    expect(screen.getByRole("spinbutton", { name: "Raise to" })).toHaveValue(105); // 30 to call, then raise by the 75 in the pot: 30 + 75
    await userEvent.click(screen.getByRole("button", { name: "½ POT" }));
    expect(screen.getByRole("spinbutton", { name: "Raise to" })).toHaveValue(68);
    await userEvent.click(screen.getAllByRole("button", { name: "ALL-IN" })[0]);
    await userEvent.click(screen.getAllByRole("button", { name: "ALL-IN" })[1]);
    expect(onMove).toHaveBeenLastCalledWith({ type: "allin" });
  });

  it("keeps a typed amount inside the limits", async () => {
    const onMove = setup();
    const box = screen.getByRole("spinbutton", { name: "Raise to" });
    fireEvent.change(box, { target: { value: "12" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onMove).toHaveBeenLastCalledWith({ type: "raise", amount: 50 });
  });

  it("F, C and R act from the keyboard, but not while typing", () => {
    const onMove = setup();
    fireEvent.keyDown(window, { key: "c" });
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.keyDown(window, { key: "f" });
    expect(onMove.mock.calls.map(([m]) => m.type)).toEqual(["call", "raise", "fold"]);
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Raise to" }), { key: "f" });
    expect(onMove).toHaveBeenCalledTimes(3);
  });

  it("no raise row when you can't raise, and no buttons when it isn't your turn", () => {
    const { rerender } = render(<BetControls legal={{ ...facing, canRaise: false }} pot={45} currentBet={30} onMove={() => {}} />);
    expect(screen.queryByRole("group", { name: "Raise amount" })).not.toBeInTheDocument();
    rerender(<BetControls legal={null} pot={45} currentBet={30} onMove={() => {}} message="Waiting for ANN…" />);
    expect(screen.queryByRole("button", { name: /FOLD/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for ANN…");
  });
});
