// POKER SCOREBOARD — everyone at the table by chips, most first: their stack
// (chips in the pot this hand included) and what they've won or lost since
// sitting down. Same rows as the other games' scoreboards.

import React from "react";
import { PixelAvatar } from "../PixelCard";
import { chipsOf } from "./seatInfo";

const PLACE_COLOR = ["#f4c430", "#ead8b1", "#c89820", "#8a7fb0", "#8a7fb0", "#8a7fb0"];
const short = (name = "") => name.split(" #")[0];


export default function PokerScoreBoard({ seats = [], running = false, turn = null, mySeat = -1, faceFor, blinds }) {
  const ranked = seats
    .map((p, seat) => p && { ...p, seat })
    .filter(Boolean)
    .sort((a, b) => chipsOf(b, running) - chipsOf(a, running) || a.seat - b.seat);

  return (
    <section className="flex flex-col" style={{ borderBottom: "4px solid #0a0712" }} aria-label="Scoreboard">
      <div className="px-3 flex items-center justify-between font-pixel-display text-[12px] tracking-wider" style={{ height: 40, backgroundColor: "#1a1024", color: "#9bd14f" }}>
        <span>SCOREBOARD</span>
        <span className="text-[10px] text-bone/70">BLINDS {blinds}</span>
      </div>
      <ol className="p-2 flex flex-col gap-1">
        {ranked.map((p, rank) => {
          const net = chipsOf(p, running) - p.bought;
          const face = faceFor?.(p.seat) || { variant: (p.seat % 5) + 1 };
          return (
            <li
              key={p.seat}
              className="relative flex items-center gap-2 pl-2.5 pr-2 py-1"
              style={{ backgroundColor: p.seat === turn ? "#2e1a3a" : "#14102a", border: `2px solid ${p.seat === turn ? "#f4c430" : "#1f1a3d"}`, opacity: p.sittingOut ? 0.6 : 1 }}
            >
              {p.seat === mySeat && <span className="absolute left-0 top-0 bottom-0" style={{ width: 4, backgroundColor: "#5fd4d6" }} aria-label="You" />}
              <span className="font-pixel-display text-[10px] shrink-0" style={{ width: 22, color: PLACE_COLOR[rank] }}>
                #{rank + 1}
              </span>
              <PixelAvatar variant={face.variant} customAvatarData={face.customAvatarData} size={34} />
              <div className="flex-1 min-w-0">
                <div className="font-pixel-display text-[10px] text-parchment truncate">{short(p.name)}</div>
                <div className="font-pixel-body text-[18px] leading-none mt-1" style={{ color: net > 0 ? "#9bd14f" : net < 0 ? "#e85a7a" : "rgba(200,184,144,0.7)" }}>
                  {net > 0 ? "+" : ""}
                  {net}
                </div>
              </div>
              <div className="font-pixel-display text-[12px] text-glow-gold tabular-nums shrink-0">{chipsOf(p, running)}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
