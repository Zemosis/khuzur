// TURN BANNER — "YOUR TURN" pops up in the middle of the screen for a moment
// when your turn starts, so it can't be missed. It never blocks a click.

import React, { useEffect, useState } from "react";

const SHOW_MS = 1500;

export default function TurnBanner({ active }) {
  const [shown, setShown] = useState(false);
  // Starts "not your turn", so a table that opens on your turn (a reload,
  // joining mid-round) shows it too.
  const [wasActive, setWasActive] = useState(false);
  // Your turn just started: show it (state from the change, not an effect).
  if (active !== wasActive) {
    setWasActive(active);
    setShown(active);
  }

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none" aria-live="assertive">
      <div
        className="turn-banner font-pixel-display text-[28px] sm:text-[40px] px-8 py-4 tracking-widest"
        style={{
          backgroundColor: "#f4c430",
          color: "#1a1024",
          border: "4px solid #0a0712",
          boxShadow: "0 0 0 4px #c89820, 6px 6px 0 4px #0a0712, 0 0 48px rgba(244,196,48,0.7)",
        }}
      >
        YOUR TURN
      </div>
    </div>
  );
}
