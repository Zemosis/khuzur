// CHAT GUARD — stops chat floods without getting in the way of talking.
//
// Each player has a small allowance: BURST messages can go out back to back,
// then one more every REFILL_MS (a token bucket). Chatting at a normal pace
// never runs it dry; pasting walls of text or hammering "gg" does. The same
// text more than REPEAT_LIMIT times in a row, within REPEAT_WINDOW_MS, is
// turned away too. Keyed by player, not socket, so a second tab or a
// reconnect doesn't reset it.

const BURST = 6;
const REFILL_MS = 1000;
const REPEAT_LIMIT = 3;
const REPEAT_WINDOW_MS = 10_000;

export function createChatGuard({ now = Date.now } = {}) {
  const players = new Map(); // key -> { tokens, at, lastText, repeats, lastAt }

  /** { ok: true } to send, or { ok: false, reason: "slow" | "repeat", retryInMs }. */
  function check(key, text) {
    const t = now();
    const p = players.get(key) || { tokens: BURST, at: t, lastText: null, repeats: 0, lastAt: 0 };
    players.set(key, p);
    p.tokens = Math.min(BURST, p.tokens + (t - p.at) / REFILL_MS);
    p.at = t;

    const again = text === p.lastText && t - p.lastAt < REPEAT_WINDOW_MS;
    if (again && p.repeats >= REPEAT_LIMIT) {
      return { ok: false, reason: "repeat", retryInMs: REPEAT_WINDOW_MS - (t - p.lastAt) };
    }
    if (p.tokens < 1) {
      return { ok: false, reason: "slow", retryInMs: Math.ceil((1 - p.tokens) * REFILL_MS) };
    }
    p.tokens -= 1;
    p.repeats = again ? p.repeats + 1 : 1;
    p.lastText = text;
    p.lastAt = t;
    return { ok: true };
  }

  /** Forgets players quiet for longer than `idleMs` (their allowance is full again anyway). */
  function prune(idleMs) {
    const t = now();
    for (const [key, p] of players) if (t - p.at > idleMs) players.delete(key);
  }

  return { check, prune, size: () => players.size };
}
