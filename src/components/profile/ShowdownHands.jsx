// SHOWDOWN HANDS — Poker's answer to Thirteen's hands played: how often the
// player showed each hand rank at a showdown, and how often it won. Every
// rank is listed, so a never-shown royal flush still reads 0: by rank
// (strongest last), or by how often it was shown (most first; ties keep rank
// order). Each bar is the times shown, its green part the times it won.

import React from "react";

const RANKS = [
  ["HIGH CARD", "High card"],
  ["PAIR", "Pair"],
  ["TWO PAIR", "Two pair"],
  ["THREE OF A KIND", "Three of a kind"],
  ["STRAIGHT", "Straight"],
  ["FLUSH", "Flush"],
  ["FULL HOUSE", "Full house"],
  ["FOUR OF A KIND", "Four of a kind"],
  ["STRAIGHT FLUSH", "Straight flush"],
  ["ROYAL FLUSH", "Royal flush"],
];
const SHOWN = "#463a78";
const WON = "#9bd14f";

/** ranks: { "TWO PAIR": { shown, won }, … } (ranks never shown may be missing). sort: "rank" | "shown". */
export default function ShowdownHands({ ranks, sort = "rank" }) {
  const at = (id) => ranks[id] ?? { shown: 0, won: 0 };
  const max = Math.max(1, ...RANKS.map(([id]) => at(id).shown));
  const order = sort === "shown" ? [...RANKS].sort(([a], [b]) => at(b).shown - at(a).shown) : RANKS;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2" aria-label="Showdown hands">
        {order.map(([id, name]) => {
          const { shown, won } = at(id);
          return (
            <li key={id} className="grid items-center gap-3" style={{ gridTemplateColumns: "140px minmax(0,1fr) 72px" }}>
              <span className="font-pixel-body text-[20px] text-bone leading-none">{name}</span>
              <div className="relative" style={{ height: 14, backgroundColor: "#0a0712", boxShadow: "0 0 0 2px #1f1a3d" }}>
                <div className="absolute inset-y-0 left-0" style={{ width: `${(shown / max) * 100}%`, minWidth: shown ? 4 : 0, backgroundColor: SHOWN }} />
                <div className="absolute inset-y-0 left-0" style={{ width: `${(won / max) * 100}%`, minWidth: won ? 4 : 0, backgroundColor: WON }} />
              </div>
              <span className="font-pixel-body text-[20px] text-parchment text-right tabular-nums" title={`Won ${won} of ${shown}`}>
                {won}/{shown}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-4 font-pixel-body text-[18px] text-bone/70" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 12, height: 12, backgroundColor: WON }} /> won
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 12, height: 12, backgroundColor: SHOWN }} /> shown, lost
        </span>
      </div>
    </div>
  );
}
