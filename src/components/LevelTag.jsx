// LEVEL TAG — a player's level as a small gold "LV 7" beside their name: at
// the table, at a waiting table and on match pages. Guests and CPUs have no
// level, so they get nothing.

import { INK } from "./pixelTokens";

export default function LevelTag({ level, className = "" }) {
  if (!level) return null;
  return (
    <span
      title={`Level ${level}`}
      className={`font-pixel-display text-[8px] leading-none px-1 py-0.5 shrink-0 whitespace-nowrap ${className}`}
      style={{ backgroundColor: "#f4c430", color: INK }}
    >
      LV {level}
    </span>
  );
}
