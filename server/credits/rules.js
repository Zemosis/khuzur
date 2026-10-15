// CREDIT RULES — the numbers and checks the credit code shares, free of the
// database so they can be tested alone.

export const START_BALANCE = 1000;
export const CLAIM_TO = 1000;
export const CLAIM_EVERY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = Number(process.env.CREDIT_RETRY_MS) || 5000;

/** A refusal the player can act on: its message is shown to them as is. */
export class CreditError extends Error {}

/**
 * Where CLAIM stands: { state: "ready", amount } | { state: "wait", nextAt }
 * | { state: "over" } | { state: "frozen" }. onTable: what the player holds
 * at a credit table — stack, chips waiting to land and chips in the pot.
 */
export function claimState({ balance, lastClaimAt, frozen = false, onTable = 0, now = Date.now() }) {
  if (frozen) return { state: "frozen" };
  const total = balance + onTable;
  if (total >= CLAIM_TO) return { state: "over" };
  const nextAt = new Date(lastClaimAt).getTime() + CLAIM_EVERY_MS;
  if (now < nextAt) return { state: "wait", nextAt: new Date(nextAt).toISOString() };
  return { state: "ready", amount: CLAIM_TO - total };
}

/** 51_600_000 -> "14h 20m" (rounded up to the minute). */
export function untilText(ms) {
  const minutes = Math.ceil(ms / 60_000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** { ok: false, error } for a refusal; anything else is logged and told as "unavailable". */
export function failure(err) {
  if (err instanceof CreditError) return { ok: false, error: err.message };
  console.error("[credits]", err);
  return { ok: false, error: "Credits are unavailable right now. Try again in a moment." };
}

/** Runs fn until it succeeds (the database may be briefly away). Refusals aren't retried. */
export async function retry(fn, label) {
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof CreditError) throw err;
      console.error(`[credits] ${label} failed, retrying:`, err.message);
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}
