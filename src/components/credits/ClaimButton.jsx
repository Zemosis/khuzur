// CLAIM — back up to 1,000 credits once a day, or why not yet.

import React, { useEffect, useState } from "react";
import { Btn } from "../PixelUI";
import { INK, TONES } from "../pixelTokens";
import { fmt } from "../../utils/poker/tiers";
import ConveyorLoop from "../loading-ui/ConveyorLoop";

/** 51_600_000 -> "14h 20m" (rounded up to the minute). */
function untilText(ms) {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** claim: the server's claim state ({ state: "ready" | "wait" | "over" | "frozen", … }). */
export default function ClaimButton({ claim, onClaim, busy = false }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (claim?.state !== "wait") return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [claim?.state]);

  if (!claim || claim.state === "frozen") return null;
  const due = claim.state === "wait" && Date.parse(claim.nextAt) <= now;
  if (claim.state === "ready" || due) {
    return (
      <Btn tone={TONES.poison} onClick={onClaim} disabled={busy} className={`w-full ${busy ? "is-busy" : ""}`}>
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            {/* Blocks running along a track, while the claim goes through. */}
            <ConveyorLoop length={5} mask="#9bd14f" label={null} className="text-[14px]" />
            Claiming
          </span>
        ) : claim.state === "ready" ? (
          `Claim +${fmt(claim.amount)}`
        ) : (
          "Claim"
        )}
      </Btn>
    );
  }
  return (
    <div
      role="status"
      className="font-pixel-display text-[10px] uppercase text-center px-3 flex items-center justify-center"
      style={{ minHeight: "var(--ctl)", backgroundColor: INK, border: "3px solid #2a234d", color: "#c8b890" }}
    >
      {claim.state === "wait" ? `Next claim in ${untilText(Date.parse(claim.nextAt) - now)}` : "Over 1,000: nothing to claim"}
    </div>
  );
}
