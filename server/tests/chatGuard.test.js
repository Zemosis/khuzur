// The chat flood guard: generous for talking, but a burst of spam is cut off,
// and someone who keeps at it is muted for a while.

import { describe, it, expect } from "vitest";
import { createChatGuard, cleanChat, MAX_CHAT } from "../chatGuard.js";

/** A guard on a clock the test moves by hand. */
const guardAt = () => {
  let t = 1_000_000;
  const guard = createChatGuard({ now: () => t });
  return { guard, wait: (ms) => (t += ms) };
};

/** Spends p1's whole allowance, then gets turned away `times` times. */
const spam = (guard, times) => {
  for (let i = 0; i < 5; i++) guard.check("p1", `burst ${i}`);
  let last;
  for (let i = 0; i < times; i++) last = guard.check("p1", `spam ${i}`);
  return last;
};

describe("chat guard", () => {
  it("lets 5 messages go back to back, then holds the 6th for up to 2 seconds", () => {
    const { guard } = guardAt();
    for (let i = 0; i < 5; i++) expect(guard.check("p1", `hi ${i}`)).toEqual({ ok: true });
    const held = guard.check("p1", "hi 5");
    expect(held).toMatchObject({ ok: false, reason: "slow" });
    expect(held.retryInMs).toBeGreaterThan(0);
    expect(held.retryInMs).toBeLessThanOrEqual(2000);
  });

  it("after a burst, one more message goes out every 2 seconds", () => {
    const { guard, wait } = guardAt();
    for (let i = 0; i < 5; i++) guard.check("p1", `hi ${i}`);
    wait(2000);
    expect(guard.check("p1", "again")).toEqual({ ok: true });
    expect(guard.check("p1", "too soon")).toMatchObject({ ok: false, reason: "slow" });
  });

  it("someone chatting at a normal pace is never held", () => {
    const { guard, wait } = guardAt();
    for (let i = 0; i < 100; i++) {
      expect(guard.check("p1", `line ${i}`)).toEqual({ ok: true });
      wait(2500);
    }
  });

  it("the same message 3 times in a row is fine; a 4th within 10s is not", () => {
    const { guard, wait } = guardAt();
    for (let i = 0; i < 3; i++) {
      expect(guard.check("p1", "gg")).toEqual({ ok: true });
      wait(2100);
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
    for (let i = 0; i < 5; i++) guard.check("p1", `hi ${i}`);
    expect(guard.check("p1", "more")).toMatchObject({ ok: false });
    expect(guard.check("p2", "hello")).toEqual({ ok: true });
  });

  it("a third turn-away within 30s mutes the player for 30s", () => {
    const { guard, wait } = guardAt();
    expect(spam(guard, 2)).toMatchObject({ reason: "slow" });
    const muted = guard.check("p1", "one more");
    expect(muted).toEqual({ ok: false, reason: "muted", retryInMs: 30_000 });
    wait(29_000);
    expect(guard.check("p1", "let me talk")).toEqual({ ok: false, reason: "muted", retryInMs: 1000 });
    wait(1000);
    expect(guard.check("p1", "sorry")).toEqual({ ok: true });
  });

  it("turn-aways spread over more than 30s don't add up to a mute", () => {
    const { guard, wait } = guardAt();
    for (let round = 0; round < 3; round++) {
      expect(spam(guard, 1)).toMatchObject({ reason: "slow" });
      wait(31_000);
    }
  });

  it("muting again within 10 minutes lasts 2 minutes", () => {
    const { guard, wait } = guardAt();
    spam(guard, 3);
    wait(30_000 + 60_000);
    expect(spam(guard, 3)).toEqual({ ok: false, reason: "muted", retryInMs: 120_000 });
  });

  it("10 quiet minutes after a mute, the next one is back to 30s", () => {
    const { guard, wait } = guardAt();
    spam(guard, 3);
    wait(30_000 + 10 * 60_000);
    expect(spam(guard, 3)).toEqual({ ok: false, reason: "muted", retryInMs: 30_000 });
  });

  it("forgets players who have been quiet for a while", () => {
    const { guard, wait } = guardAt();
    guard.check("p1", "hi");
    wait(61_000);
    guard.check("p2", "hi");
    guard.prune(60_000);
    expect(guard.size()).toBe(1);
  });

  it("remembers a recently muted player, so leaving and coming back doesn't reset it", () => {
    const { guard, wait } = guardAt();
    spam(guard, 3);
    wait(5 * 60_000);
    guard.prune(60_000);
    expect(guard.size()).toBe(1);
    wait(6 * 60_000);
    guard.prune(60_000);
    expect(guard.size()).toBe(0);
  });
});

describe("cleanChat", () => {
  it("keeps ordinary text, emoji and Mongolian as they are", () => {
    expect(cleanChat("gg wp 👍")).toBe("gg wp 👍");
    expect(cleanChat("Сайн байна уу")).toBe("Сайн байна уу");
    expect(cleanChat("👨‍👩‍👧")).toBe("👨‍👩‍👧");
  });

  it("collapses runs of spaces and line breaks, and trims", () => {
    expect(cleanChat("  hello \n\n\n   there\t ")).toBe("hello there");
  });

  it("drops control and invisible characters, like a right-to-left override", () => {
    expect(cleanChat("ab\u0000c‮d​e")).toBe("abcde");
  });

  it("allows at most 2 stacked accents on a letter (no zalgo)", () => {
    const zalgo = "h́̂̃̄̅i";
    expect(cleanChat(zalgo)).toBe("h́̂i");
    expect(cleanChat("café")).toBe("café");
  });

  it(`caps a message at ${MAX_CHAT} characters`, () => {
    expect(MAX_CHAT).toBe(120);
    expect(cleanChat("x".repeat(500))).toHaveLength(120);
    expect(Array.from(cleanChat("😀".repeat(200)))).toHaveLength(120);
  });

  it("turns anything that isn't text into an empty string", () => {
    expect(cleanChat(undefined)).toBe("");
    expect(cleanChat(null)).toBe("");
    expect(cleanChat("   \n ")).toBe("");
  });
});
