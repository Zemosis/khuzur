import { describe, it, expect, vi } from "vitest";
import { claimState, untilText, failure, CreditError, CLAIM_EVERY_MS } from "../../server/credits/rules.js";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const longAgo = new Date(NOW - CLAIM_EVERY_MS - 1).toISOString();

describe("claim state", () => {
  it("tops you up to exactly 1000 once a day has passed", () => {
    expect(claimState({ balance: 200, lastClaimAt: longAgo, onTable: 300, now: NOW })).toEqual({ state: "ready", amount: 500 });
  });

  it("counts what you hold at a table, chips in the pot included", () => {
    expect(claimState({ balance: 100, lastClaimAt: longAgo, onTable: 900, now: NOW })).toEqual({ state: "over" });
  });

  it("waits 24 hours from the last claim", () => {
    const last = new Date(NOW - 3_600_000).toISOString();
    expect(claimState({ balance: 0, lastClaimAt: last, now: NOW })).toEqual({ state: "wait", nextAt: new Date(NOW + CLAIM_EVERY_MS - 3_600_000).toISOString() });
  });

  it("says frozen before anything else", () => {
    expect(claimState({ balance: 0, lastClaimAt: longAgo, frozen: true, now: NOW })).toEqual({ state: "frozen" });
  });

  it("writes a wait as hours and minutes", () => {
    expect(untilText(14 * 3_600_000 + 20 * 60_000)).toBe("14h 20m");
    expect(untilText(14 * 3_600_000 + 20 * 60_000 + 5000)).toBe("14h 21m"); // rounded up: never promises a claim early
    expect(untilText(59_000)).toBe("0h 1m");
  });

  it("passes a refusal on and hides anything else", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(failure(new CreditError("Your balance is 340"))).toEqual({ ok: false, error: "Your balance is 340" });
    expect(failure(new Error("connection reset"))).toEqual({ ok: false, error: "Credits are unavailable right now. Try again in a moment." });
  });
});
