// The chat flood guard: generous for talking, but a burst of spam is cut off.

import { describe, it, expect } from "vitest";
import { createChatGuard } from "../chatGuard.js";

/** A guard on a clock the test moves by hand. */
const guardAt = () => {
  let t = 1_000_000;
  const guard = createChatGuard({ now: () => t });
  return { guard, wait: (ms) => (t += ms) };
};

describe("chat guard", () => {
  it("lets 6 messages go back to back, then holds the 7th for about a second", () => {
    const { guard } = guardAt();
    for (let i = 0; i < 6; i++) expect(guard.check("p1", `hi ${i}`)).toEqual({ ok: true });
    const held = guard.check("p1", "hi 6");
    expect(held).toMatchObject({ ok: false, reason: "slow" });
    expect(held.retryInMs).toBeGreaterThan(0);
    expect(held.retryInMs).toBeLessThanOrEqual(1000);
  });

  it("after a burst, one more message goes out every second", () => {
    const { guard, wait } = guardAt();
    for (let i = 0; i < 6; i++) guard.check("p1", `hi ${i}`);
    wait(1000);
    expect(guard.check("p1", "again")).toEqual({ ok: true });
    expect(guard.check("p1", "too soon")).toMatchObject({ ok: false, reason: "slow" });
  });

  it("someone chatting at a normal pace is never held", () => {
    const { guard, wait } = guardAt();
    for (let i = 0; i < 100; i++) {
      expect(guard.check("p1", `line ${i}`)).toEqual({ ok: true });
      wait(1500);
    }
  });

  it("the same message 3 times in a row is fine; a 4th within 10s is not", () => {
    const { guard, wait } = guardAt();
    for (let i = 0; i < 3; i++) {
      expect(guard.check("p1", "gg")).toEqual({ ok: true });
      wait(1100);
    }
    expect(guard.check("p1", "gg")).toMatchObject({ ok: false, reason: "repeat" });
    expect(guard.check("p1", "wp")).toEqual({ ok: true });
  });

  it("a repeat is allowed again once 10s have passed", () => {
    const { guard, wait } = guardAt();
    for (let i = 0; i < 3; i++) guard.check("p1", "gg");
    wait(10_000);
    expect(guard.check("p1", "gg")).toEqual({ ok: true });
  });

  it("each player has their own allowance", () => {
    const { guard } = guardAt();
    for (let i = 0; i < 6; i++) guard.check("p1", `hi ${i}`);
    expect(guard.check("p1", "more")).toMatchObject({ ok: false });
    expect(guard.check("p2", "hello")).toEqual({ ok: true });
  });

  it("forgets players who have been quiet for a while", () => {
    const { guard, wait } = guardAt();
    guard.check("p1", "hi");
    wait(61_000);
    guard.check("p2", "hi");
    guard.prune(60_000);
    expect(guard.size()).toBe(1);
  });
});
