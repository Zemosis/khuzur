import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlayerHand from "../../src/components/thirteen/PlayerHand";
import { cards } from "../helpers/cards.js";
import { setReducedMotion } from "../../src/utils/motion";

const faces = (container) => [...container.querySelectorAll(".pixel-card:not(.pixel-card-back)")];
const label = (el) => el.querySelector(".corner.tl").textContent;
const labels = (container) => faces(container).map(label);
const byLabel = (container, id) => faces(container).find((el) => label(el) === id);
const selected = (container) => faces(container).filter((el) => el.classList.contains("selected")).map(label);

/** PlayerHand with its selection held in real state, like the game page. */
function Harness({ hand, onChange = () => {}, ...props }) {
  const [sel, setSel] = useState([]);
  return (
    <PlayerHand
      hand={hand}
      selectedCards={sel}
      onSelectionChange={(next) => {
        setSel(next);
        onChange(next);
      }}
      {...props}
    />
  );
}

const HAND = cards("K♠ 3♦ 7♥ 3♠ 2♦ 9♣ 10♦ J♥ Q♣ A♠ 4♦ 5♣ 6♥");

describe("PlayerHand", () => {
  it("renders all 13 cards sorted by rank", () => {
    const { container } = render(<Harness hand={HAND} />);
    expect(labels(container)).toEqual(["3♦", "3♠", "4♦", "5♣", "6♥", "7♥", "9♣", "10♦", "J♥", "Q♣", "K♠", "A♠", "2♦"]);
  });

  it("sorts by suit when asked", () => {
    const { container } = render(<Harness hand={cards("K♠ 3♦ 7♥ 3♠ 9♣")} sortMode="suit" />);
    expect(labels(container)).toEqual(["3♦", "9♣", "7♥", "3♠", "K♠"]);
  });

  it("keeps deal order while dealing", () => {
    const { container } = render(<Harness hand={cards("K♠ 3♦ 7♥")} isDealing />);
    expect(labels(container)).toEqual(["K♠", "3♦", "7♥"]);
  });

  it("click toggles a card in and out of the selection", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness hand={HAND} />);
    await user.click(byLabel(container, "7♥"));
    await user.click(byLabel(container, "3♦"));
    expect(selected(container).sort()).toEqual(["3♦", "7♥"]);
    await user.click(byLabel(container, "7♥"));
    expect(selected(container)).toEqual(["3♦"]);
  });

  it("shift-click selects the whole range in the order shown", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness hand={HAND} />);
    await user.click(byLabel(container, "4♦"));
    await user.keyboard("{Shift>}");
    await user.click(byLabel(container, "7♥"));
    await user.keyboard("{/Shift}");
    expect(selected(container)).toEqual(["4♦", "5♣", "6♥", "7♥"]);
  });

  it("takes clicks while the hand sorts itself after the deal", async () => {
    // Your turn opens as the deal ends, just as the hand arcs into order; a
    // click then used to be dropped, leaving PLAY grey.
    setReducedMotion(false);
    try {
      const user = userEvent.setup();
      const { container, rerender } = render(<Harness hand={HAND} isDealing />);
      rerender(<Harness hand={HAND} />);
      await user.click(byLabel(container, "7♥"));
      expect(selected(container)).toEqual(["7♥"]);
    } finally {
      setReducedMotion(true);
    }
  });

  it("shift-click picks cards without highlighting text like a copy selection", () => {
    const { container } = render(<Harness hand={HAND} />);
    // fireEvent returns false when the browser's own action was prevented.
    expect(fireEvent.mouseDown(byLabel(container, "7♥"), { shiftKey: true })).toBe(false);
    expect(fireEvent.mouseDown(byLabel(container, "7♥"))).toBe(true);
    expect(container.querySelector('[aria-label="Your hand"]')).toHaveClass("select-none");
  });

  it("ignores clicks while inactive or dealing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container, rerender } = render(<Harness hand={HAND} isActive={false} onChange={onChange} />);
    await user.click(byLabel(container, "7♥"));
    rerender(<Harness hand={HAND} isDealing onChange={onChange} />);
    await user.click(byLabel(container, "7♥"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("an empty hand says whether you won or were knocked out", () => {
    const { getByText, rerender } = render(<Harness hand={[]} />);
    expect(getByText("NO CARDS — YOU WIN!")).toBeInTheDocument();
    rerender(<Harness hand={[]} isEliminated />);
    expect(getByText(/YOU'RE OUT/)).toBeInTheDocument();
  });

  it("drops played cards from the fan", () => {
    const { container, rerender } = render(<Harness hand={cards("3♦ 4♦ 5♦")} />);
    rerender(<Harness hand={cards("3♦ 5♦")} />);
    expect(labels(container)).toEqual(["3♦", "5♦"]);
  });
});
