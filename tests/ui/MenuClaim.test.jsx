// The main menu's claim strip: always there for a signed-in player, saying
// what CLAIM can do right now.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import MenuClaim from "../../src/components/credits/MenuClaim";

afterEach(() => vi.useRealTimers());

const inMs = (ms) => new Date(Date.now() + ms).toISOString();

describe("menu claim strip", () => {
  it("ready: a CLAIM button with the amount", () => {
    render(<MenuClaim claim={{ state: "ready", amount: 760 }} onClaim={async () => true} />);
    expect(screen.getByRole("button", { name: "CLAIM +760 CR" })).toBeEnabled();
  });

  it("under 1,000 but claimed today: a countdown that ticks down, then turns into CLAIM", () => {
    vi.useFakeTimers();
    render(<MenuClaim claim={{ state: "wait", nextAt: inMs(3_602_000) }} onClaim={async () => true} />);
    const strip = screen.getByRole("timer", { name: "Next claim" });
    expect(strip).toHaveTextContent("NEXT CLAIM 01:00:02");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(strip).toHaveTextContent("NEXT CLAIM 01:00:00");
    act(() => vi.advanceTimersByTime(3_600_000));
    expect(screen.getByRole("button", { name: "CLAIM" })).toBeEnabled();
  });

  it("1,000 or more: a locked CLAIM that says it's full, nothing to press", () => {
    render(<MenuClaim claim={{ state: "over" }} onClaim={async () => true} />);
    expect(screen.getByText(/full, claim under 1,000/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("frozen, or not loaded yet: nothing", () => {
    const { container, rerender } = render(<MenuClaim claim={{ state: "frozen" }} onClaim={async () => true} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<MenuClaim claim={undefined} onClaim={async () => true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("while claiming: the pixel loader, then the amount floats off", async () => {
    let finish;
    const onClaim = () => new Promise((r) => (finish = r));
    const { rerender } = render(<MenuClaim claim={{ state: "ready", amount: 760 }} onClaim={onClaim} />);
    await act(async () => screen.getByRole("button", { name: "CLAIM +760 CR" }).click());
    rerender(<MenuClaim claim={{ state: "ready", amount: 760 }} onClaim={onClaim} busy />);
    expect(screen.getByRole("button", { name: "Claiming" })).toBeDisabled();
    // The claim lands: the server now says 1,000, so it locks.
    rerender(<MenuClaim claim={{ state: "over" }} onClaim={onClaim} />);
    await act(async () => finish(true));
    expect(screen.getByRole("status")).toHaveTextContent("+760 CR");
    expect(screen.getByText(/full, claim under 1,000/)).toBeInTheDocument();
  });
});
