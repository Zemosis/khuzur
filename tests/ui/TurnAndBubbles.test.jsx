// Whose turn it is, made hard to miss, and chat bubbles over the seats.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import OpponentSection from "../../src/components/thirteen/OpponentSection";
import ChatBubble from "../../src/components/ChatBubble";
import TurnBanner from "../../src/components/TurnBanner";
import PlayArea from "../../src/components/thirteen/PlayArea";
import RoundTable from "../../src/components/muushig/RoundTable";
import { useTurnTitle } from "../../src/hooks/useTurnTitle";
import { renderHook } from "@testing-library/react";

const player = (over = {}) => ({ id: 1, name: "ANN #0001", hand: [{ hidden: true }, { hidden: true }], isEliminated: false, ...over });
const plate = (container) => container.querySelector("[data-plate]");

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

describe("a seat's chat bubble", () => {
  it("shows what they said over their seat, newest last", () => {
    render(<OpponentSection player={player()} bubble={["hi", "ready?"]} />);
    const bubble = screen.getByRole("note", { name: "ANN says" });
    expect(bubble).toHaveTextContent("hi");
    expect(bubble.textContent).toMatch(/hi.*ready\?/);
  });

  it("no bubble when they haven't said anything", () => {
    render(<OpponentSection player={player()} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("a long message is cut short in the bubble", () => {
    render(<ChatBubble name="ANN" lines={["x".repeat(200)]} />);
    expect(screen.getByRole("note").textContent.length).toBeLessThan(120);
    expect(screen.getByRole("note")).toHaveTextContent("…");
  });
});

describe("whose turn it is", () => {
  it("the player on turn gets a big TURN tag with an arrow", () => {
    render(<OpponentSection player={player()} isActive />);
    expect(screen.getByText("TURN")).toBeInTheDocument();
    expect(screen.getByTestId("turn-arrow")).toBeInTheDocument();
  });

  it("everyone else dims while it's someone's turn", () => {
    const { container } = render(<OpponentSection player={player()} dimmed />);
    expect(plate(container).style.opacity).toBe("0.6");
  });

  it("a table that opens on your turn shows YOUR TURN too", () => {
    render(<TurnBanner active />);
    expect(screen.getByText("YOUR TURN")).toBeInTheDocument();
  });

  it("YOUR TURN shows for a moment when your turn starts, then goes", () => {
    vi.useFakeTimers();
    const { rerender } = render(<TurnBanner active={false} />);
    expect(screen.queryByText("YOUR TURN")).not.toBeInTheDocument();
    rerender(<TurnBanner active />);
    expect(screen.getByText("YOUR TURN")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.queryByText("YOUR TURN")).not.toBeInTheDocument();
  });

  it("the Thirteen felt glows on the side of the player on turn", () => {
    const { container, rerender } = render(<PlayArea turnSide="left" />);
    expect(container.querySelector('[data-turn-side="left"]')).not.toBeNull();
    rerender(<PlayArea turnSide={null} />);
    expect(container.querySelector("[data-turn-side]")).toBeNull();
  });

  it("the Muushig table glows toward the seat on turn", () => {
    const { container } = render(<RoundTable seats={{}} turnSeat="topLeft" stack={[]} />);
    expect(container.querySelector('[data-turn-side="topLeft"]')).not.toBeNull();
  });

  it("a hidden tab's title flashes YOUR TURN until you look again", () => {
    vi.useFakeTimers();
    document.title = "Khuzur";
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    const { rerender } = renderHook(({ on }) => useTurnTitle(on), { initialProps: { on: true } });
    act(() => vi.advanceTimersByTime(1000));
    expect(document.title).toContain("YOUR TURN");
    rerender({ on: false });
    expect(document.title).toBe("Khuzur");
  });
});
