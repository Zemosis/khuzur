// SOURCE BREAKDOWN — where a player's credits came from. Everyone starts with
// the same 1,000, so that's a note, not a bar; the bars are what moved it:
// daily claims, each game's net won or lost, and any admin move. Start plus
// the bars is their credits (server/credits/leaderboard.js).
//
// A diverging bar per source from a shared zero line: gains to the right in
// teal, losses to the left in rose, every value also printed with its sign,
// so color is never the only cue. Sources that never moved are left out.

import React from "react";
import { fmt } from "../../utils/poker/tiers";
import { signed } from "./signed";

const GAIN = "#179fa2";
const LOSS = "#e15474";

// In order; games join here as they get credit tables.
const SOURCES = [
  ["claimed", "Daily claims"],
  ["poker", "Poker"],
  ["thirteen", "Thirteen"],
  ["muushig", "Muushig"],
  ["admin", "Admin"],
];


const GRID = { gridTemplateColumns: "110px minmax(0,1fr) 72px", columnGap: 12 };

export default function SourceBreakdown({ sources, total, label = "Where the credits came from" }) {
  const rows = SOURCES.filter(([key]) => sources[key]).map(([key, name]) => [key, name, sources[key]]);
  const max = Math.max(1, ...rows.map(([, , v]) => Math.abs(v)));
  return (
    <div className="flex flex-col gap-2">
      <p className="font-pixel-body text-[19px] text-bone/80">Started with {fmt(sources.start ?? 0)}</p>
      {rows.length ? (
        <ul aria-label={label} className="flex flex-col gap-1.5">
          {rows.map(([key, name, v]) => {
            const w = `${(Math.abs(v) / max) * 50}%`;
            return (
              <li key={key} className="grid items-center font-pixel-body text-[19px]" style={GRID}>
                <span className="text-bone">{name}</span>
                <span className="relative h-3" aria-hidden style={{ backgroundColor: "#0a0712" }}>
                  <span className="absolute top-0 bottom-0" style={{ left: "50%", width: 2, marginLeft: -1, backgroundColor: "#463a78" }} />
                  <span
                    className="absolute top-0 bottom-0"
                    style={v >= 0 ? { left: "50%", width: w, backgroundColor: GAIN } : { right: "50%", width: w, backgroundColor: LOSS }}
                  />
                </span>
                <span className="text-right tabular-nums text-parchment">{signed(v)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="font-pixel-body text-[19px] text-bone/60">Nothing won, lost or claimed yet.</p>
      )}
      <div className="grid font-pixel-body text-[19px] pt-1.5" style={{ ...GRID, borderTop: "2px solid #2a234d" }}>
        <span className="font-pixel-display text-[9px] text-bone/70 self-center">CREDITS</span>
        <span />
        <span className="text-right tabular-nums text-glow-gold">{fmt(total)}</span>
      </div>
    </div>
  );
}
