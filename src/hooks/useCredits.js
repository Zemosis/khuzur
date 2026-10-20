// USE CREDITS — the signed-in player's credits from /api/credits/me: balance,
// CLAIM, whether they can play (and why not), rathole minimums by tier and a
// restart notice (until dismissNotice). Guests get null. enabled: false waits for refresh().

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "./useAuth";

const CREDITS = { base: "/api/credits" };

/** How long a claim's loader (PixelLoader) shows at the least. */
export const LOADER_MIN_MS = 600;

/** `promise`'s value, but not before `ms` have passed: a quick answer would only flash the loader. */
const atLeast = (ms, promise) => Promise.all([promise, new Promise((r) => setTimeout(r, ms))]).then(([v]) => v);

export function useCredits({ enabled = true } = {}) {
  const { isGuest, loading } = useAuth();
  const [credits, setCredits] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (isGuest) return setCredits(null);
    try {
      setCredits(await api("/me", CREDITS));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [isGuest]);

  useEffect(() => {
    if (enabled && !loading) refresh();
  }, [enabled, loading, refresh]);

  /**
   * True once the claim went through. busy holds for at least LOADER_MIN_MS,
   * so the buttons' pixel loader shows instead of flashing.
   */
  const claim = useCallback(async () => {
    setBusy(true);
    try {
      setCredits(await atLeast(LOADER_MIN_MS, api("/claim", { method: "POST", ...CREDITS })));
      setError("");
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  // The restart notice goes at once; the server forgets it too.
  const dismissNotice = useCallback(async () => {
    setCredits((c) => c && { ...c, notice: null });
    try {
      await api("/notice", { method: "POST", ...CREDITS });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  return { credits, error, busy, refresh, claim, dismissNotice };
}
