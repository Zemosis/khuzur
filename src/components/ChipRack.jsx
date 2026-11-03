// CHIP RACK — a row of round casino chips to tap, each adding its value to a
// bet: Blackjack's betting bar and Poker's raise. `unit` scales the rack, so a
// high-stakes poker table's chips are worth more.

import React from "react";

// Worth (times `unit`), face and ink, smallest first.
const FACES = [
  [10, "#ead8b1", "#0a0712"],
  [50, "#e85a7a", "#0a0712"],
  [100, "#2a8a8c", "#0a0712"],
  [500, "#c89820", "#0a0712"],
  [1000, "#9bd14f", "#0a0712"],
  [5000, "#463a78", "#ead8b1"],
];

/** 500 → "500", 1000 → "1K", 1500 → "1.5K", 2000000 → "2M". */
function chipLabel(n) {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  return n >= 1000 ? `${n / 1000}K` : String(n);
}

/** onPick(value). canPick(value): whether that chip can go on. size: the chips' width, px. */
export default function ChipRack({ onPick, canPick = () => true, unit = 1, size = 44 }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chips">
      {FACES.map(([worth, face, ink]) => {
        const value = worth * unit;
        return (
          <button
            key={worth}
            onClick={() => onPick(value)}
            disabled={!canPick(value)}
            className="pixel-pick font-pixel-display text-[10px] leading-none flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ width: size, height: size, borderRadius: "50%", backgroundColor: face, color: ink, border: "4px dashed #ead8b1", boxShadow: "0 3px 0 #0a0712, 0 0 0 2px #0a0712" }}
          >
            {chipLabel(value)}
          </button>
        );
      })}
    </div>
  );
}
