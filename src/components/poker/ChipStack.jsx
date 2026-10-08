// CHIP STACK — an amount as pixel chips: a stack per value, each chip a
// flat pixel disc coloured by its value (see chips.js), with the exact
// amount under the pile and, for a blind, an SB / BB label.

import React from "react";
import { CHIP_COLORS, chipColumns } from "./chips";

function Chip({ value, size }) {
  const { face, edge } = CHIP_COLORS[value];
  return (
    <span
      data-chip={value}
      className="block"
      style={{
        width: size,
        height: Math.round(size * 0.4),
        marginTop: -Math.round(size * 0.18),
        backgroundColor: face,
        boxShadow: `0 0 0 2px #0a0712, inset 0 -3px 0 ${edge}, inset 4px 0 0 rgba(255,255,255,0.25), inset -4px 0 0 rgba(255,255,255,0.25)`,
      }}
    />
  );
}

/** label: "SB" | "BB" for a blind. big: the pot's larger chips. */
export default function ChipStack({ amount, label = null, big = false, testId = "bet" }) {
  const size = big ? 22 : 16;
  return (
    <div className="flex flex-col items-center gap-1" data-testid={testId}>
      <div className="flex items-end gap-0.5" style={{ paddingTop: Math.round(size * 0.18) }}>
        {chipColumns(amount).map(({ value, count }) => (
          <div key={value} className="flex flex-col-reverse">
            {Array.from({ length: count }, (_, i) => (
              <Chip key={i} value={value} size={size} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 font-pixel-display text-[10px] leading-none text-parchment whitespace-nowrap">
        {label && (
          <span className="px-1 py-0.5 text-[8px]" style={{ backgroundColor: "#5fd4d6", color: "#0a3a3a", boxShadow: "0 0 0 2px #0a0712" }}>
            {label}
          </span>
        )}
        {amount}
      </div>
    </div>
  );
}
