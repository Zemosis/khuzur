// STANDINGS — the end of a Khuzur match: every place, best first, with its
// players in their team colour. PLAY AGAIN deals the next match at the same
// table; LEAVE goes back to the builder.

import React from "react";
import { INK } from "../pixelTokens";

import { ordinal } from "./teams";

export default function Standings({ rows, onPlayAgain, onLeave }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(10,7,18,0.7)" }}>
      <div
        role="dialog"
        aria-label="STANDINGS"
        className="flex flex-col gap-3 p-5 min-w-[280px] max-w-[92vw]"
        style={{ backgroundColor: "#14102a", border: "4px solid #a8552a", boxShadow: `0 0 0 4px ${INK}` }}
      >
        <h2 className="font-pixel-display text-[14px] text-center" style={{ color: "#f08a4b" }}>
          STANDINGS
        </h2>
        <ol className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.place} className="flex items-center gap-3 px-3 py-2" style={{ backgroundColor: row.mine ? "#2a1f3a" : "#0a0712", boxShadow: `inset 4px 0 0 ${row.color}` }}>
              <span className="font-pixel-display text-[12px] w-12" style={{ color: row.place === 1 ? "#f4c430" : "#ead8b1" }}>
                {ordinal(row.place)}
              </span>
              <span className="font-pixel-body text-[22px] text-parchment leading-tight">{row.names.join(" · ")}</span>
            </li>
          ))}
        </ol>
        <div className="flex gap-2 justify-center pt-1">
          <button type="button" onClick={onPlayAgain} className="pixel-btn font-pixel-display text-[11px] px-4 py-2.5" style={{ backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: INK }}>
            PLAY AGAIN
          </button>
          <button type="button" onClick={onLeave} className="pixel-btn font-pixel-display text-[11px] px-4 py-2.5" style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}>
            LEAVE
          </button>
        </div>
      </div>
    </div>
  );
}
