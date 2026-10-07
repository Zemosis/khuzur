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

  // 13 cards in the 900px test hand sit 63px apart.
  const STEP = 63;
  const drag = (el, dx, dy = 0) => {
    fireEvent.pointerDown(el, { clientX: 300, clientY: 500, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 300 + dx, clientY: 500 + dy, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 300 + dx, clientY: 500 + dy, pointerId: 1 });
  };

  it("dragging a card along the hand moves it to where it's dropped", () => {
    const onReorder = vi.fn();
    const { container } = render(<Harness hand={HAND} onReorder={onReorder} />);
    // By rank: 3♦ 3♠ 4♦ 5♣ 6♥ 7♥ 9♣ 10♦ J♥ Q♣ K♠ A♠ 2♦
    drag(byLabel(container, "3♦"), STEP * 2 + 5);
    expect(onReorder).toHaveBeenCalledWith(["3♠", "4♦", "3♦", "5♣", "6♥", "7♥", "9♣", "10♦", "J♥", "Q♣", "K♠", "A♠", "2♦"]);
    onReorder.mockClear();
    drag(byLabel(container, "2♦"), -STEP * 12);
    expect(onReorder).toHaveBeenCalledWith(["2♦", "3♦", "3♠", "4♦", "5♣", "6♥", "7♥", "9♣", "10♦", "J♥", "Q♣", "K♠", "A♠"]);
  });

  it("a drag isn't a click: it doesn't select; a press that barely moves still does", async () => {
    const { container } = render(<Harness hand={HAND} onReorder={() => {}} />);
    const card = byLabel(container, "7♥");
    drag(card, STEP * 2);
    fireEvent.click(card);
    expect(selected(container)).toEqual([]);
    drag(card, 3, 2);
    fireEvent.click(card);
    expect(selected(container)).toEqual(["7♥"]);
  });

  it("dropping a card back where it was changes nothing", () => {
    const onReorder = vi.fn();
    const { container } = render(<Harness hand={HAND} onReorder={onReorder} />);
    drag(byLabel(container, "7♥"), 20);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("nothing drags while the cards are being dealt", () => {
    const onReorder = vi.fn();
    const { container } = render(<Harness hand={HAND} onReorder={onReorder} isDealing />);
    drag(byLabel(container, "7♥"), STEP * 3);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("shows your own order; cards new to the hand join at the right", () => {
    const { container } = render(<Harness hand={HAND} sortMode="custom" order={["A♠", "3♦", "K♠", "2♦", "J♥", "10♦", "9♣", "7♥", "6♥", "5♣", "4♦", "3♠"]} />);
    expect(labels(container)).toEqual(["A♠", "3♦", "K♠", "2♦", "J♥", "10♦", "9♣", "7♥", "6♥", "5♣", "4♦", "3♠", "Q♣"]);
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
