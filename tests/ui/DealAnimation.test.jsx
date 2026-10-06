import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import gsap from "gsap";
import DealAnimation from "../../src/components/thirteen/DealAnimation";

const setHidden = (hidden) => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
};

afterEach(() => setHidden(false));

describe("DealAnimation", () => {
  it("finishes on its own and reports completion exactly once", async () => {
    const onComplete = vi.fn();
    const onDealProgress = vi.fn();
    render(<DealAnimation onComplete={onComplete} onDealProgress={onDealProgress} />);
    await waitFor(() => expect(onComplete).toHaveBeenCalled(), { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 200));
    expect(onComplete).toHaveBeenCalledTimes(1);
  }, 10000);

  it("skips straight to the end when the tab is hidden mid-deal", () => {
    const onComplete = vi.fn();
    render(<DealAnimation onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
    setHidden(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    setHidden(false);
    setHidden(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("skips immediately if the round starts while the tab is already hidden", () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    const onComplete = vi.fn();
    render(<DealAnimation onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("still finishes on time when animation frames stop but the page counts as visible", async () => {
    // A window covered by another one (GNOME/Wayland) gets no frames, yet
    // document.hidden stays false, so the visibility skip never fires.
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
    gsap.ticker.sleep(); // re-wakes on the next tween, picking up the dead rAF
    try {
      const onComplete = vi.fn();
      render(<DealAnimation onComplete={onComplete} />);
      await new Promise((r) => setTimeout(r, 4000));
      expect(onComplete).toHaveBeenCalledTimes(1);
    } finally {
      raf.mockRestore();
      gsap.ticker.sleep();
      gsap.ticker.wake();
    }
  }, 8000);

  it("stops listening once unmounted", () => {
    const onComplete = vi.fn();
    const { unmount } = render(<DealAnimation onComplete={onComplete} />);
    unmount();
    setHidden(true);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// Online the server sets when the deal ends, and every seat's deal ends then.
describe("DealAnimation online (endsAt)", () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  it("holds the table until the set end, even when the animation is done sooner", async () => {
    // Reduced animations (the test setup) deal in about 1.5s.
    const onComplete = vi.fn();
    render(<DealAnimation endsAt={performance.now() + 2500} onComplete={onComplete} />);
    await wait(2100);
    expect(onComplete).not.toHaveBeenCalled();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 1500 });
  }, 8000);

  it("a hidden tab still ends at the set time, not before", async () => {
    const onComplete = vi.fn();
    render(<DealAnimation endsAt={performance.now() + 600} onComplete={onComplete} />);
    setHidden(true);
    expect(onComplete).not.toHaveBeenCalled();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 1500 });
  });

  it("a deal already over (rejoining late) ends at once", async () => {
    const onComplete = vi.fn();
    render(<DealAnimation endsAt={performance.now() - 100} onComplete={onComplete} />);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 200 });
  });
});
