// MENU CLAIM — the main menu's claim chip, beside the player badge and as
// tall as it. It's always there for a signed-in player and says what CLAIM
// can do right now:
//   ready      under 1,000 and a day since the last claim: CLAIM +N CR, with a
//              soft glow and a pixel shine sweeping across now and then
//   wait       under 1,000 but claimed in the last day: a ticking countdown
//              and a bar filling toward ready; it turns into CLAIM at zero
//   over       1,000 or more: a dim, locked CLAIM, nothing to press (hidden
//              on phones, where it would take a whole row)
//   (claiming) the pixel loader, held long enough to see (useCredits)
// After a claim the amount floats up off the chip toward the balance badge,
// which counts up (PlayerMenu). Frozen accounts and guests get nothing.
// Every state is the same height, so the bar never jumps.

import React, { useEffect, useState } from "react";
import { fmt } from "../../utils/poker/tiers";
import ConveyorLoop from "../loading-ui/ConveyorLoop";
import PixelIcon from "../PixelIcon";
import { INK } from "../pixelTokens";

const DAY_MS = 24 * 60 * 60 * 1000;
const FLOAT_MS = 900;
const HEIGHT = 52;

const two = (n) => String(n).padStart(2, "0");
/** 3_602_000 -> "01:00:02". */
function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/** claim: the server's claim state; onClaim: useCredits().claim (true once it went through); error: why the last one failed. */
export default function MenuClaim({ claim, onClaim, busy = false, error = "" }) {
  const [floating, setFloating] = useState(null); // the amount just claimed, while it floats off
  const [now, setNow] = useState(() => Date.now());
  const waiting = claim?.state === "wait";

  // The countdown ticks every second.
  useEffect(() => {
    if (!waiting) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0); // catch up now: `now` may date from long before the wait began
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [waiting, claim?.nextAt]);

  useEffect(() => {
    if (floating == null) return;
    const id = setTimeout(() => setFloating(null), FLOAT_MS);
    return () => clearTimeout(id);
  }, [floating]);

  if (!claim || claim.state === "frozen") return null;

  const left = waiting ? Date.parse(claim.nextAt) - now : 0;
  const state = busy ? "busy" : claim.state === "ready" || (waiting && left <= 0) ? "ready" : claim.state;
  const amount = claim.state === "ready" && claim.amount ? ` +${fmt(claim.amount)} CR` : "";
  const box = "claim-swap w-full flex items-center justify-center gap-2 px-4 font-pixel-display text-[10px] uppercase whitespace-nowrap";

  let body;
  if (state === "ready" || state === "busy") {
    body = (
      <button
        key="ready"
        aria-label={state === "busy" ? "Claiming" : `CLAIM${amount}`}
        aria-busy={state === "busy" || undefined}
        disabled={state === "busy"}
        onClick={async () => {
          const got = claim.amount ?? 0;
          if (await onClaim()) setFloating(got);
        }}
        title={error || "Back up to 1,000 credits, once a day"}
        className={`pixel-btn relative overflow-hidden ${box} text-xs ${state === "busy" ? "is-busy" : "claim-pulse"}`}
        style={{ height: HEIGHT, backgroundColor: "#9bd14f", borderColor: error ? "#e85a7a" : "#6a9a30", color: "#1a3a0e" }}
      >
        {state === "busy" ? (
          <>
            <ConveyorLoop length={5} mask="#9bd14f" label={null} className="text-[14px]" />
            CLAIMING
          </>
        ) : (
          <>
            <span aria-hidden className="claim-shine" />
            CLAIM{amount}
          </>
        )}
      </button>
    );
  } else if (state === "wait") {
    const done = Math.min(1, Math.max(0, 1 - left / DAY_MS));
    body = (
      <div
        key="wait"
        role="timer"
        aria-label="Next claim"
        className={`relative ${box} text-bone`}
        style={{ height: HEIGHT, backgroundColor: "#1f1a3d", boxShadow: `0 0 0 3px ${INK}` }}
      >
        <span className="flex flex-col items-center gap-1.5 leading-none">
          <span className="text-[7px] text-bone/70">NEXT CLAIM</span>{" "}
          <span className="text-parchment tabular-nums">{clock(left)}</span>
        </span>
        <span
          role="progressbar"
          aria-label="Until the next claim"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(done * 100)}
          className="absolute left-0 bottom-0 h-[3px]"
          style={{ width: `${done * 100}%`, backgroundColor: "#9bd14f", transition: "width 1s linear" }}
        />
      </div>
    );
  } else {
    body = (
      <div
        key="over"
        className={`${box} text-bone/40 max-sm:hidden`}
        style={{ height: HEIGHT, backgroundColor: INK, boxShadow: "0 0 0 3px #2a234d" }}
        title="CLAIM tops you back up to 1,000 once a day, when you're below it"
      >
        <PixelIcon name="lock" size={10} />
        CLAIM
        <span className="sr-only"> — full, claim under 1,000</span>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {body}
      {floating != null && (
        <span role="status" className="claim-float absolute left-3 -top-2 pointer-events-none font-pixel-display text-[11px] px-2 py-1" style={{ backgroundColor: "#9bd14f", color: "#1a3a0e", boxShadow: `0 0 0 2px ${INK}` }}>
          +{fmt(floating)} CR
        </span>
      )}
    </div>
  );
}
