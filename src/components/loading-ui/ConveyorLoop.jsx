// CONVEYOR LOOP — three block glyphs (█ ▓ ▒) running along a ░ track, from
// Loading UI (https://www.loading-ui.com/docs/components/conveyor-loop, MIT).
// Ported to JSX; its keyframes live in index.css (.loading-ui-conveyor),
// where REDUCED animations hold it still. Takes the text color; `mask` is the
// color behind it, which hides the track under the moving blocks.

import React from "react";

const BLOCKS = ["█", "▓", "▒"];

/** length: track cells. label: what it stands for, or null where the parent names itself (a button). */
export default function ConveyorLoop({ length = 6, mask = "#0a0712", className = "", style, label = "Loading" }) {
  const columns = Math.max(2, Math.floor(length));
  const tail = BLOCKS.length - 1;
  return (
    <span
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={`loading-ui-conveyor relative inline-flex shrink-0 items-center overflow-hidden font-mono leading-none select-none ${className}`}
      style={{ "--loader-width": `${columns}ch`, "--loader-start-x": `-${tail}ch`, "--loader-end-x": `${columns + tail}ch`, "--mask-color": mask, ...style }}
    >
      <span aria-hidden="true" className="absolute inset-0 whitespace-nowrap opacity-40">
        {"░".repeat(columns)}
      </span>
      {BLOCKS.map((glyph, index) => (
        <span key={glyph} aria-hidden="true" data-block style={{ zIndex: 3 - index, animationDelay: `calc(var(--delay, 0.05s) * ${index})` }}>
          {glyph}
        </span>
      ))}
    </span>
  );
}
