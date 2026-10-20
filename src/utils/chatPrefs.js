// CHAT PREFS — your own say over table chat: speech bubbles on or off
// (remembered in this browser, like the animation setting) and the players
// you've muted (until the page is reloaded). Muting is yours alone: nobody
// else at the table is told, and the muted player can still talk to everyone
// else. Kept outside React so the chat panel, the bubbles and Settings all
// agree; useChatPrefs() re-renders on a change.

import { useSyncExternalStore } from "react";

const KEY = "khuzur_bubbles";

/** The longest chat message; the server cuts anything longer (server/chatGuard.js). */
export const MAX_CHAT = 120;

let state = {
  bubbles: (() => {
    try {
      return localStorage.getItem(KEY) !== "off";
    } catch {
      return true;
    }
  })(),
  muted: [], // senders' full names ("ANN #0001")
};
const listeners = new Set();

const update = (next) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};

/** True unless the player turned speech bubbles off. */
export const bubblesOn = () => state.bubbles;

export function setBubblesOn(on) {
  update({ bubbles: !!on });
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private window: the choice just won't persist */
  }
}

export const isMuted = (name) => state.muted.includes(name);

export function setMuted(name, on) {
  if (isMuted(name) === !!on) return;
  update({ muted: on ? [...state.muted, name] : state.muted.filter((n) => n !== name) });
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** { bubbles, muted } — current, and re-rendered when either changes. */
export const useChatPrefs = () => useSyncExternalStore(subscribe, () => state);
