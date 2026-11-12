// STANDINGS — the end of a Khuzur match, built like Muushig's results: a
// MATCH OVER title naming the winners, then every place, best first, with its
// players' faces in their team colour, then what it paid (children: the
// credit result and the XP and gold). PLAY AGAIN deals the next match (or
// stakes for it at a credit table); LEAVE goes back to the lobby.

import React from "react";
import { PixelAvatar } from "../PixelCard";
import { ordinal } from "./teams";

/**
 * rows: [{ place, names, faces, color, mine }], best first.
 * playAgain: { label, onClick, disabled }.
 */
export default function Standings({ rows, playAgain, onLeave, children }) {
  const first = rows.find((r) => r.place === 1);
  const won = first?.mine;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(10,7,18,0.8)", backdropFilter: "blur(3px)" }}>
      <div
        role="dialog"
        aria-label="STANDINGS"
        aria-modal="true"
        className="flex flex-col gap-4 p-4 sm:p-6 w-[480px] max-w-full max-h-full overflow-y-auto"
        style={{ backgroundColor: "#1f1a3d", border: "4px solid #0a0712", boxShadow: "0 0 0 4px #a8552a, 8px 8px 0 #0a0712" }}
      >
        <div className="text-center">
          <h2 className="font-pixel-display text-[16px] text-glow-gold shimmer-text">MATCH OVER</h2>
          {first && (
            <div className="font-pixel-display text-[11px] mt-3" style={{ color: won ? "#9bd14f" : "#ead8b1" }}>
              {won ? (first.names.length > 1 ? "YOUR TEAM WINS!" : "YOU WIN!") : `${first.names.join(" & ").toUpperCase()} ${first.names.length > 1 ? "WIN" : "WINS"}`}
            </div>
          )}
          <div className="font-pixel-display text-[9px] text-bone/50 mt-2">STANDINGS</div>
        </div>
        <ol className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={row.place}
              className="flex items-center gap-3 px-3 py-2"
              style={{
                backgroundColor: row.mine ? "#2a1f3a" : "#14102a",
                border: `2px solid ${row.place === 1 ? "#f4c430" : "#0a0712"}`,
                boxShadow: `inset 5px 0 0 ${row.color}`,
              }}
            >
              <span className="font-pixel-display text-[12px] w-12 shrink-0" style={{ color: row.place === 1 ? "#f4c430" : "#ead8b1" }}>
                {ordinal(row.place)}
              </span>
              {row.faces && (
                <span className="flex -space-x-1.5 shrink-0">
                  {row.faces.map((face, i) => (
                    <PixelAvatar key={i} variant={face.variant} customAvatarData={face.customAvatarData} size={28} />
                  ))}
                </span>
              )}
              <span className="font-pixel-body text-[22px] text-parchment leading-tight min-w-0">{row.names.join(" · ")}</span>
              {row.mine && (
                <span className="ml-auto font-pixel-display text-[8px] px-1.5 py-1 shrink-0" style={{ backgroundColor: "#5fd4d6", color: "#0a2a2c" }}>
                  YOU
                </span>
              )}
            </li>
          ))}
        </ol>
        {children}
        <div className="flex justify-center items-center gap-3 mt-1">
          <button type="button" onClick={onLeave} className="pixel-btn font-pixel-display text-[11px] px-5 py-3" style={{ backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" }}>
            LEAVE
          </button>
          <button
            type="button"
            onClick={playAgain.onClick}
            disabled={playAgain.disabled}
            autoFocus
            className="pixel-btn font-pixel-display text-[11px] px-6 py-3 disabled:opacity-50"
            style={{ backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#1a3a0e" }}
          >
            {playAgain.label}
          </button>
        </div>
      </div>
    </div>
  );
}
