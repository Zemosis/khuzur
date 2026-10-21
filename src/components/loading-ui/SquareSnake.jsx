// SQUARE SNAKE — four block glyphs (█ ▓ ▒ ░) chasing round a square, from
// Loading UI (https://www.loading-ui.com/docs/components/square-snake, MIT).
// Ported to JSX; its keyframes live in index.css (.loading-ui-square-snake),
// where REDUCED animations hold it still. Takes the text color.

import React from "react";

const BLOCKS = ["█", "▓", "▒", "░"];

/** size: cells along a side. label: what it stands for, or null where the parent names itself. */
export default function SquareSnake({ size = 4, className = "", style, label = "Loading" }) {
  const cells = Math.max(2, Math.floor(size));
  return (
    <span
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={`loading-ui-square-snake relative inline-flex shrink-0 overflow-hidden font-mono leading-none select-none ${className}`}
      style={{ "--loader-size": `${cells}ch`, "--loader-x": `${cells - 1}ch`, "--loader-y": `${cells - 1}ch`, ...style }}
    >
      {BLOCKS.map((glyph, index) => (
        <span key={glyph} aria-hidden="true" style={{ animationDelay: `calc(var(--delay, 0.125s) * -${BLOCKS.length - 1 - index})` }}>
          {glyph}
        </span>
      ))}
    </span>
  );
}
