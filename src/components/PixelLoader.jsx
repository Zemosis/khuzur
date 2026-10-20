// PIXEL LOADER — a 3×3 grid of pixels that light up one after another and go
// out in the same order, on a loop: a retro "working on it" (after Framer's
// 3 Pixel Grid, "snake" preset). Hard square cells that snap on and off, no
// fades. Pure CSS (index.css, .pixel-loader); with REDUCED animations it
// holds still, every other cell lit.

import React from "react";

// When each cell (left to right, top to bottom) lights, in ms: the snake
// winds along the top row, back along the middle, and out along the bottom.
const SNAKE = [0, 80, 160, 400, 320, 240, 480, 560, 640];

/**
 * cell: one pixel's size in px; on / off: lit and unlit colors. label: what
 * it stands for, or null inside a button, which names itself (a button's
 * contents are hidden from screen readers anyway).
 */
export default function PixelLoader({ cell = 5, gap = 1, on = "#f4c430", off = "rgba(10,7,18,0.35)", label = "Loading" }) {
  return (
    <span
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className="pixel-loader inline-grid shrink-0"
      style={{ gridTemplateColumns: `repeat(3, ${cell}px)`, gap, "--on": on, "--off": off }}
    >
      {SNAKE.map((delay, i) => (
        <span key={i} className="pixel-loader-cell" data-still-on={i % 2 === 0 || undefined} style={{ width: cell, height: cell, animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}
