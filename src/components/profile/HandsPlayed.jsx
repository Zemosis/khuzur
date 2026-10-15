// HANDS PLAYED — how many times the player led or beat with each Thirteen hand
// type, like a run's hand list in Balatro. Every type is listed, strongest
// last, so a never-played Royal Flush still shows as 0.
//
// One measure across categories: one hue, the count printed beside each bar.

import React from "react";
import { COMBO_NAMES, COMBO_TYPES } from "../../utils/constants";

const ORDER = [
  COMBO_TYPES.SINGLE,
  COMBO_TYPES.PAIR,
  COMBO_TYPES.TRIPLE,
  COMBO_TYPES.FOUR_OF_A_KIND,
  COMBO_TYPES.STRAIGHT,
  COMBO_TYPES.FLUSH,
  COMBO_TYPES.FULL_HOUSE,
  COMBO_TYPES.POKER,
  COMBO_TYPES.STRAIGHT_FLUSH,
  COMBO_TYPES.ROYAL_FLUSH,
];
const BAR = "#5fd4d6";

/** hands: { SINGLE: n, PAIR: n, … } (types never played may be missing). */
export default function HandsPlayed({ hands }) {
  const max = Math.max(1, ...ORDER.map((t) => hands[t] || 0));
  return (
    <ul className="flex flex-col gap-2" aria-label="Hands played">
      {ORDER.map((type) => {
        const n = hands[type] || 0;
        return (
          <li key={type} className="grid items-center gap-3" style={{ gridTemplateColumns: "140px minmax(0,1fr) 56px" }}>
            <span className="font-pixel-body text-[20px] text-bone leading-none">{COMBO_NAMES[type]}</span>
            <div style={{ height: 14, backgroundColor: "#0a0712", boxShadow: "0 0 0 2px #1f1a3d" }}>
              <div style={{ width: `${(n / max) * 100}%`, minWidth: n ? 4 : 0, height: "100%", backgroundColor: BAR }} />
            </div>
            <span className="font-pixel-body text-[20px] text-parchment text-right tabular-nums">{n}</span>
          </li>
        );
      })}
    </ul>
  );
}
