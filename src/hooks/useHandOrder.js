// HAND ORDER — how your hand is laid out. By rank or by suit (the RANK / SUIT
// buttons; the choice is remembered across visits), or in your own order once
// you drag cards around. Your own order lasts for the round (`roundKey`): the
// next deal is sorted by whichever of RANK or SUIT you last picked.

import { useState } from "react";

const KEY = "khuzur_sort";

const saved = () => {
  try {
    return localStorage.getItem(KEY) === "suit" ? "suit" : "rank";
  } catch {
    return "rank";
  }
};

export function useHandOrder(roundKey) {
  const [sortMode, setSortMode] = useState(saved);
  const [custom, setCustom] = useState({ key: null, ids: null });
  const order = custom.key === roundKey ? custom.ids : null;

  /** RANK or SUIT: sorts the hand again, replacing your own order. */
  const pick = (mode) => {
    setSortMode(mode);
    setCustom({ key: null, ids: null });
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* private window: the choice just won't persist */
    }
  };

  /** Your own order after a drag: card ids, left to right. */
  const reorder = (ids) => setCustom({ key: roundKey, ids });

  return { mode: order ? "custom" : sortMode, order, pick, reorder };
}
