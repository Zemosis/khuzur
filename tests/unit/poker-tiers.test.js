import { describe, it, expect } from "vitest";
import { TIERS, TIER_IDS, isTier, buyInRange, topUpRange, fmt } from "../../src/utils/poker/tiers.js";

describe("credit tiers", () => {
  it("are LOW, MID and HIGH with the agreed blinds and buy-ins", () => {
    expect(TIER_IDS).toEqual(["LOW", "MID", "HIGH"]);
    expect(TIERS.LOW).toMatchObject({ smallBlind: 5, bigBlind: 10, minBuyIn: 200, maxBuyIn: 1000 });
    expect(TIERS.MID).toMatchObject({ smallBlind: 25, bigBlind: 50, minBuyIn: 1000, maxBuyIn: 5000 });
    expect(TIERS.HIGH).toMatchObject({ smallBlind: 100, bigBlind: 200, minBuyIn: 4000, maxBuyIn: 20000 });
    expect(isTier("MID")).toBe(true);
    expect(isTier("toString")).toBe(false);
  });

  it("a buy-in runs from the tier minimum to the tier maximum or the balance", () => {
    expect(buyInRange("LOW", 5000)).toEqual({ min: 200, max: 1000, ratholed: false, ok: true });
    expect(buyInRange("LOW", 150)).toEqual({ min: 200, max: 150, ratholed: false, ok: false });
  });

  it("leaving within the hour raises the minimum to the stack you left with, up to the tier max", () => {
    expect(buyInRange("MID", 9000, { amount: 3400 })).toMatchObject({ min: 3400, ratholed: true, ok: true });
    expect(buyInRange("MID", 9000, { amount: 9000 })).toMatchObject({ min: 5000, max: 5000, ratholed: true });
    expect(buyInRange("MID", 9000, { amount: 500 })).toMatchObject({ min: 1000, ratholed: false });
  });

  it("topping up fills to the tier max; at 0 chips it's a rebuy from the tier minimum", () => {
    expect(topUpRange("LOW", 5000, 600)).toEqual({ min: 1, max: 400, ok: true });
    expect(topUpRange("LOW", 5000, 1000)).toEqual({ min: 1, max: 0, ok: false });
    expect(topUpRange("LOW", 5000, 0)).toEqual({ min: 200, max: 1000, ok: true });
    expect(topUpRange("LOW", 100, 0)).toEqual({ min: 200, max: 100, ok: false });
  });

  it("formats credits with thousands separators", () => {
    expect(fmt(20000)).toBe("20,000");
    expect(fmt(340)).toBe("340");
  });
});
