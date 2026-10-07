// YOUR TURN MARK — while it's your turn: a gold "YOUR TURN" tab on a thin
// gold rule along the top of your hand, and a soft warm light under the
// cards. It holds still (the banner already announced the turn) and never
// blocks a click. Goes inside a positioned (relative) hand area.

import React from "react";

const GOLD = "#f4c430";
const VOID = "#0a0712";

export default function YourTurnMark() {
  return (
    <div aria-hidden data-your-turn-mark className="your-turn-mark absolute inset-0 pointer-events-none">
      {/* Light from below, strongest under the middle of the hand. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 100% at 50% 100%, rgba(244,196,48,0.14) 0%, rgba(244,196,48,0.05) 50%, rgba(244,196,48,0) 80%)",
        }}
      />
      {/* The rule fades out toward both ends. */}
      <div
        className="absolute left-0 right-0 top-0"
        style={{
          height: 2,
          background: `linear-gradient(90deg, rgba(244,196,48,0) 4%, ${GOLD} 30%, ${GOLD} 70%, rgba(244,196,48,0) 96%)`,
          boxShadow: "0 0 10px rgba(244,196,48,0.45)",
        }}
      />
      <span
        className="absolute left-1/2 top-0 z-20 font-pixel-display text-[11px] leading-none tracking-widest whitespace-nowrap px-3 py-1.5"
        style={{
          transform: "translate(-50%, -50%)",
          backgroundColor: GOLD,
          color: "#1a1024",
          boxShadow: `0 0 0 2px ${VOID}, 3px 3px 0 2px ${VOID}`,
        }}
      >
        YOUR TURN
      </span>
    </div>
  );
}
