// CREDIT TIERS — the stakes a credit table plays for and what you may bring
// to it. The browser's buy-in panel and the server's checks both read this
// file; server/game/poker/tiers.js is a byte-identical copy.

export const TIERS = {
  LOW: { id: "LOW", smallBlind: 5, bigBlind: 10, minBuyIn: 200, maxBuyIn: 1000 },
  MID: { id: "MID", smallBlind: 25, bigBlind: 50, minBuyIn: 1000, maxBuyIn: 5000 },
  HIGH: { id: "HIGH", smallBlind: 100, bigBlind: 200, minBuyIn: 4000, maxBuyIn: 20000 },
};
export const TIER_IDS = Object.keys(TIERS);
export const isTier = (id) => typeof id === "string" && Object.hasOwn(TIERS, id);

// Leave a table and, for this long, your next buy-in at that tier is at least the stack you left with.
export const RATHOLE_MS = 60 * 60 * 1000;

/** 2340 -> "2,340". */
export const fmt = (n) => Number(n).toLocaleString("en-US");

/**
 * What a player may sit down with at `tierId`: { min, max, ratholed, ok }.
 * rathole: { amount } — the stack they left a table at this tier with in the
 * last hour — or null.
 */
export function buyInRange(tierId, balance, rathole = null) {
  const t = TIERS[tierId];
  const ratholed = !!rathole && rathole.amount > t.minBuyIn;
  const min = ratholed ? Math.min(rathole.amount, t.maxBuyIn) : t.minBuyIn;
  const max = Math.min(t.maxBuyIn, balance);
  return { min, max, ratholed, ok: max >= min };
}

/**
 * What a seated player holding `onTable` (stack plus chips waiting to land)
 * may add: up to the tier max. With nothing left it's a rebuy, from the tier minimum.
 */
export function topUpRange(tierId, balance, onTable) {
  const t = TIERS[tierId];
  const min = onTable === 0 ? t.minBuyIn : 1;
  const max = Math.max(0, Math.min(t.maxBuyIn - onTable, balance));
  return { min, max, ok: max >= min };
}
