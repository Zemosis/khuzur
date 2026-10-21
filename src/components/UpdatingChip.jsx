// UPDATING CHIP — a small box in the bottom-right corner while a screen that
// already shows something fetches it again: the page stays as it was and
// this says it's being refreshed. "failed" says the refresh didn't land (the
// last figures stay up).

import React from "react";
import SquareSnake from "./loading-ui/SquareSnake";
import { INK } from "./pixelTokens";

/** state: "updating" | "failed" | null (hidden). */
export default function UpdatingChip({ state }) {
  if (!state) return null;
  const failed = state === "failed";
  return (
    <div
      role="status"
      className="fixed z-40 flex items-center gap-2.5 px-3 py-2 font-pixel-display text-[10px] uppercase pointer-events-none"
      style={{ right: 16, bottom: 16, backgroundColor: INK, color: failed ? "#e85a7a" : "#f4c430", boxShadow: `0 0 0 3px ${failed ? "#7a1530" : "#463a78"}, 4px 4px 0 3px #0a0712` }}
    >
      {failed ? "Couldn't update: showing the last figures" : (
        <>
          <SquareSnake size={3} label={null} className="text-[16px]" />
          Updating
        </>
      )}
    </div>
  );
}
