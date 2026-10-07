// CHAT BUBBLES — a chat message pops up over its sender's seat for a few
// seconds, as well as going in the chat panel.
//
// A bubble stays 4s, plus a little for a long message, at most 8s. Messages
// in a row from one player stack in the same bubble (the last 3, newest at
// the bottom) and each one restarts its clock, so a quick back-and-forth
// stays readable. Chat that was already there when the table opened, and the
// move log, never pop up.

import { useEffect, useRef, useState } from "react";

const MIN_MS = 4000;
const PER_CHAR_MS = 60; // past the first 10 characters
const MAX_MS = 8000;
const KEEP = 3;
const ME = "\u0000me";

/** How long a bubble showing `text` (as its newest line) stays up. */
export const bubbleMs = (text = "") => Math.min(MAX_MS, MIN_MS + Math.max(0, text.length - 10) * PER_CHAR_MS);

const baseName = (name = "") => name.split(" #")[0];

export function useChatBubbles(messages = []) {
  // Messages there when the table opened are history, not news.
  const seenRef = useRef(null);
  const [bubbles, setBubbles] = useState({}); // sender -> { lines, until }

  useEffect(() => {
    if (!seenRef.current) {
      seenRef.current = new Set(messages.map((m) => m.id));
      return;
    }
    const seen = seenRef.current;
    const fresh = messages.filter((m) => m.type !== "SYSTEM" && !seen.has(m.id));
    if (!fresh.length) return;
    fresh.forEach((m) => seen.add(m.id));
    const now = Date.now();
    setBubbles((prev) => {
      const next = { ...prev };
      for (const m of fresh) {
        const key = m.isMe ? ME : m.sender;
        const lines = [...(next[key]?.lines || []), m.text].slice(-KEEP);
        next[key] = { lines, until: now + bubbleMs(m.text) };
      }
      return next;
    });
  }, [messages]);

  // Clears each bubble when its time is up.
  useEffect(() => {
    const untils = Object.values(bubbles).map((b) => b.until);
    if (!untils.length) return;
    const timer = setTimeout(
      () => setBubbles((prev) => Object.fromEntries(Object.entries(prev).filter(([, b]) => b.until > Date.now()))),
      Math.max(0, Math.min(...untils) - Date.now()) + 1,
    );
    return () => clearTimeout(timer);
  }, [bubbles]);

  /** The lines over a seat (by its player's name, or yours with isMe), or null. */
  const bubbleFor = (name, isMe = false) => {
    if (isMe) return bubbles[ME]?.lines ?? null;
    if (bubbles[name]) return bubbles[name].lines;
    const match = Object.keys(bubbles).find((key) => key !== ME && baseName(key) === baseName(name));
    return match ? bubbles[match].lines : null;
  };

  return { bubbleFor };
}
