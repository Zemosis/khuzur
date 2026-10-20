// CHAT GUARD — stops chat floods without getting in the way of talking.
//
// Each player has a small allowance: BURST messages can go out back to back,
// then one more every REFILL_MS (a token bucket). Chatting at a normal pace
// never runs it dry; pasting walls of text or hammering "gg" does. The same
// text more than REPEAT_LIMIT times in a row, within REPEAT_WINDOW_MS, is
// turned away too. Keyed by player, not socket, so a second tab or a
// reconnect doesn't reset it.
//
// Someone turned away STRIKES times within STRIKE_WINDOW_MS is muted: for
// MUTE_MS the first time, MUTE_AGAIN_MS if it happens again before
// MUTE_MEMORY_MS of good behaviour has passed since the last mute ended.

const BURST = 5;
const REFILL_MS = 2000;
const REPEAT_LIMIT = 3;
const REPEAT_WINDOW_MS = 10_000;
const STRIKES = 3;
const STRIKE_WINDOW_MS = 30_000;
const MUTE_MS = 30_000;
const MUTE_AGAIN_MS = 120_000;
const MUTE_MEMORY_MS = 10 * 60_000;

export const MAX_CHAT = 120;

/**
 * A chat message as it goes out: control and invisible characters dropped
 * (emoji joiners kept), at most 2 accents stacked on a letter (no zalgo
 * towers spilling out of the bubbles), whitespace collapsed to single spaces,
 * and at most MAX_CHAT characters.
 */
export function cleanChat(raw) {
  if (typeof raw !== "string") return "";
  const text = raw
    .normalize("NFC")
    .replace(/[\t\n\r\v\f]/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "‍" || c === "‌" ? c : ""))
    .replace(/(\p{M}{2})\p{M}+/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
  return Array.from(text).slice(0, MAX_CHAT).join("").trim();
}

export function createChatGuard({ now = Date.now } = {}) {
  // key -> { tokens, at, lastText, repeats, lastAt, strikes, mutedUntil, mutes }
  const players = new Map();

  /** Counts a turn-away; the one that makes STRIKES mutes the player. */
  function strike(p, t, refused) {
    p.strikes = p.strikes.filter((s) => t - s < STRIKE_WINDOW_MS);
    p.strikes.push(t);
    if (p.strikes.length < STRIKES) return refused;
    if (t - p.mutedUntil >= MUTE_MEMORY_MS) p.mutes = 0;
    const ms = p.mutes ? MUTE_AGAIN_MS : MUTE_MS;
    p.mutes += 1;
    p.mutedUntil = t + ms;
    p.strikes = [];
    return { ok: false, reason: "muted", retryInMs: ms };
  }

  /** { ok: true } to send, or { ok: false, reason: "slow" | "repeat" | "muted", retryInMs }. */
  function check(key, text) {
    const t = now();
    const p = players.get(key) || {
      tokens: BURST, at: t, lastText: null, repeats: 0, lastAt: 0, strikes: [], mutedUntil: -Infinity, mutes: 0,
    };
    players.set(key, p);
    p.tokens = Math.min(BURST, p.tokens + (t - p.at) / REFILL_MS);
    p.at = t;

    if (t < p.mutedUntil) return { ok: false, reason: "muted", retryInMs: p.mutedUntil - t };

    const again = text === p.lastText && t - p.lastAt < REPEAT_WINDOW_MS;
    if (again && p.repeats >= REPEAT_LIMIT) {
      return strike(p, t, { ok: false, reason: "repeat", retryInMs: REPEAT_WINDOW_MS - (t - p.lastAt) });
    }
    if (p.tokens < 1) {
      return strike(p, t, { ok: false, reason: "slow", retryInMs: Math.ceil((1 - p.tokens) * REFILL_MS) });
    }
    p.tokens -= 1;
    p.repeats = again ? p.repeats + 1 : 1;
    p.lastText = text;
    p.lastAt = t;
    return { ok: true };
  }

  /**
   * Forgets players quiet for longer than `idleMs` (their allowance is full
   * again anyway), unless a mute of theirs is still remembered.
   */
  function prune(idleMs) {
    const t = now();
    for (const [key, p] of players) {
      if (t - p.at > idleMs && t - p.mutedUntil >= MUTE_MEMORY_MS) players.delete(key);
    }
  }

  return { check, prune, size: () => players.size };
}
