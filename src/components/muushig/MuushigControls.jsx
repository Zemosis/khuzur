// MUUSHIG CONTROLS — the bar under your hand: a status line, the sort toggle,
// and the buttons for the current phase (GO IN / FOLD, SWAP, TAKE TRUMP,
// THROW). The page decides which buttons show; the primary one also fires on
// SPACE.
//
// One row on a wide table. On a phone the status line takes its own row and
// the buttons share the width of the next; `dense` (a short screen) trims
// labels and padding to stay on one row.

import React, { useEffect } from "react";

const TONES = {
  green: { backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#1a3a0e" },
  gold: { backgroundColor: "#f4c430", borderColor: "#c89820", color: "#1a1024" },
  rose: { backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" },
  dusk: { backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" },
};

/**
 * buttons: [{ label, onClick, disabled, tone, primary }]
 * warning: shown in rose instead of the message (e.g. a rejected move)
 * highlight: your turn — the message reads in gold
 * children: extra controls shown before the buttons (the draw's depth picker)
 */
const MuushigControls = ({ message = "", warning = null, highlight = false, buttons = [], sortMode = "rank", onSortModeChange, dense = false, children }) => {
  const primary = buttons.find((b) => b.primary && !b.disabled);

  useEffect(() => {
    if (!primary) return;
    const onKey = (e) => {
      if (e.code !== "Space" || e.target.closest?.("input, textarea")) return;
      e.preventDefault();
      primary.onClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primary]);

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 mt-1 px-2">
      <div
        className="basis-full sm:basis-0 sm:flex-1 min-w-0 flex items-center gap-3 px-3 py-2"
        style={{ backgroundColor: "#0a0712", border: "3px solid #1f1a3d", minHeight: dense ? 40 : 46 }}
      >
        {/* A live region: screen readers hear each new instruction ("Your lead…"). */}
        <div
          role="status"
          className="font-pixel-body text-[20px] leading-none"
          style={{
            color: warning ? "#e85a7a" : highlight ? "#f4c430" : "rgba(200,184,144,0.85)",
            textShadow: highlight && !warning ? "0 0 8px rgba(244,196,48,0.6)" : undefined,
          }}
        >
          {warning || message}
        </div>
      </div>

      {/* Sort toggle — works any time, not just on your turn */}
      <div
        className="flex items-stretch gap-1 p-1"
        role="group"
        aria-label="Sort hand"
        style={{ backgroundColor: "#0a0712", border: "3px solid #1f1a3d" }}
      >
        {!dense && <span className="font-pixel-display text-[10px] text-bone/60 self-center px-2 max-md:hidden">SORT</span>}
        {[
          ["rank", "RANK"],
          ["suit", "SUIT"],
        ].map(([mode, label]) => {
          const on = sortMode === mode;
          return (
            <button
              key={mode}
              onClick={() => onSortModeChange?.(mode)}
              aria-pressed={on}
              className="pixel-btn font-pixel-display text-[10px] px-3 max-sm:px-2 py-2"
              style={{
                backgroundColor: on ? "#9bd14f" : "#1f1a3d",
                borderColor: on ? "#6a9a30" : "#0a0712",
                color: on ? "#1a3a0e" : "#ead8b1",
              }}
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
          onClick={b.onClick}
          disabled={b.disabled}
          className={`pixel-btn font-pixel-display text-sm py-3 whitespace-nowrap max-sm:flex-1 max-sm:px-3 max-sm:text-[12px] ${dense ? "px-4" : "px-6"} ${b.primary && !b.disabled ? "pulse-gold" : ""}`}
          style={TONES[b.tone] || TONES.green}
        >
          {b.label}
          {b.primary && !b.disabled && !dense && <span className="text-[8px] ml-1 max-sm:hidden">(SPACE)</span>}
        </button>
      ))}
    </div>
  );
};

export default MuushigControls;
