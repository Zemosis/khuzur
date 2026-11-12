// KHUZUR CONTROLS — the bar under your hand, built like Muushig's: a status
// box (who you are, what's happening, why the main button is off), the sort
// toggle, any extra controls (the turn clock, the draw's depth picker) and the
// buttons for the moment: LEAD, BEAT and PICK UP, SWAP 7, SURRENDER, TAKE. The
// page decides which buttons show; the primary one also fires on SPACE.
//
// One row on a wide table. On a phone the status box takes its own row and
// the buttons share the width of the next; `dense` (a short screen) trims
// labels and padding.

import React, { useEffect } from "react";
import { INK } from "../pixelTokens";

const TONES = {
  green: { backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#1a3a0e" },
  gold: { backgroundColor: "#f4c430", borderColor: "#c89820", color: INK },
  orange: { backgroundColor: "#f08a4b", borderColor: "#a8552a", color: INK },
  rose: { backgroundColor: "#e85a7a", borderColor: "#a83a5a", color: INK },
  roseSoft: { backgroundColor: "#2a0e18", borderColor: "#7a1530", color: "#e85a7a" }, // a way out (PICK UP), quieter than the move
  cyan: { backgroundColor: "#5fd4d6", borderColor: "#2a8a8c", color: "#0a2a2c" },
  dusk: { backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" },
  blood: { backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" },
};

/**
 * tag: a chip at the start of the status box (YOU · DEALER, in your team's colour).
 * message: what's happening; hint: a second, dimmer line (why LEAD is off).
 * warning: a refused move, shown as an alert in rose.
 * highlight: your turn — the message reads in gold.
 * buttons: [{ label, onClick, disabled, tone, primary, progress }]; small ones (SURRENDER) go last, quieter.
 * The primary one is the biggest, and stays bright while it waits (progress: "3/7" beside it).
 * children: extra controls shown before the buttons.
 */
export default function KhuzurControls({ tag = null, message = "", hint = null, warning = null, highlight = false, buttons = [], sortMode = "rank", onSortModeChange, dense = false, children }) {
  const primary = buttons.find((b) => b.primary && !b.disabled);

  useEffect(() => {
    if (!primary) return;
    const onKey = (e) => {
      if (e.code !== "Space" || e.target.closest?.("input, textarea, button")) return;
      e.preventDefault();
      primary.onClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primary]);

  return (
    // Laid out by its own width (a container), not the window's: the sidebar takes a share of it.
    <div className="@container mt-1 px-2">
      {/* On a phone the buttons wrap: two rows are always kept, so the table doesn't jump between turns. */}
      <div className="flex flex-wrap @min-[1180px]:flex-nowrap items-center content-start justify-between gap-2 @min-[1180px]:gap-3 max-sm:min-h-[204px]">
        {/* A fixed height, whatever it says: two lines (what's happening, and why the main button is
            off) always have their room, so the table above never grows or shrinks as you pick cards. */}
        <div
          className="basis-full @min-[1180px]:basis-0 @min-[1180px]:flex-1 min-w-0 flex items-center gap-3 px-3 py-2 h-[84px] sm:h-[66px]"
          style={{ backgroundColor: "#0a0712", border: `3px solid ${warning ? "#7a1530" : "#1f1a3d"}` }}
        >
          {tag}
          <div className="min-w-0 flex-1 flex flex-col gap-1">
            {warning ? (
              <div role="alert" className="font-pixel-body text-[20px] leading-none line-clamp-2 sm:line-clamp-1" style={{ color: "#e85a7a" }} title={typeof warning === "string" ? warning : undefined}>
                {warning}
              </div>
            ) : (
              <div
                role="status"
                className="font-pixel-body text-[20px] leading-none line-clamp-2 sm:line-clamp-1"
                title={typeof message === "string" ? message : undefined}
                style={{ color: highlight ? "#f4c430" : "rgba(200,184,144,0.85)", textShadow: highlight ? "0 0 8px rgba(244,196,48,0.6)" : undefined }}
              >
                {message}
              </div>
            )}
            <div className="font-pixel-body text-[17px] leading-none text-bone/50 truncate" aria-hidden={!hint || !!warning}>
              {hint && !warning ? hint : "\u00a0"}
            </div>
          </div>
        </div>

        {/* Sort toggle — works any time, not just on your turn */}
        <div className="flex items-stretch gap-1 p-1" role="group" aria-label="Sort hand" style={{ backgroundColor: "#0a0712", border: "3px solid #1f1a3d", minHeight: 52 }}>
          {!dense && <span className="font-pixel-display text-[10px] text-bone/60 self-center px-2 max-md:hidden">SORT</span>}
          {[
            ["rank", "RANK"],
            ["suit", "SUIT"],
          ].map(([mode, label]) => {
            const on = sortMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onSortModeChange?.(mode)}
                aria-pressed={on}
                className="pixel-btn font-pixel-display text-[10px] px-3 max-sm:px-2 py-2"
                style={{ backgroundColor: on ? "#9bd14f" : "#1f1a3d", borderColor: on ? "#6a9a30" : "#0a0712", color: on ? "#1a3a0e" : "#ead8b1" }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {children}

        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.onClick}
            disabled={b.disabled}
            className={`pixel-btn font-pixel-display whitespace-nowrap ${b.primary ? "is-waiting" : ""} ${
              b.small ? "text-[10px] py-2.5 px-3" : b.primary ? `text-base py-3 max-sm:flex-1 max-sm:px-3 max-sm:text-[12px] ${dense ? "px-6" : "px-10"}` : `text-sm py-3 max-sm:flex-1 max-sm:px-3 max-sm:text-[11px] ${dense ? "px-4" : "px-6"}`
            } ${b.primary && !b.disabled ? "pulse-gold" : ""}`}
            style={TONES[b.tone] || TONES.gold}
          >
            {b.label}
            {b.progress && (
              <span aria-hidden className="text-[10px] ml-2 tabular-nums">
                {b.progress}
              </span>
            )}
            {b.primary && !b.disabled && !dense && (
              <span aria-hidden className="text-[8px] ml-1 max-sm:hidden">
                (SPACE)
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
