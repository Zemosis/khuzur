// KHUZUR FAN — an opponent's cards, face down on the felt in front of them,
// built like Muushig's SeatFan but for Khuzur's hands, which grow: after a
// few pick-ups a player can hold a dozen or more. The fan widens and closes
// up as it grows, up to SHOWN cards; past that a +N tag says how many more.
// It's turned `turn` degrees to open toward the middle of the table. The box
// is what dealt and drawn cards fly to (data-deal-seat), with the cards'
// width on it (data-card-w).

import React from "react";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";

const SHOWN = 12;
const FULL = 5; // up to this many, the fan spreads like Muushig's

export default function KhuzurFan({ seat, count, cardW, turn, hidden = false }) {
  const cardH = Math.round(cardW * CARD_RATIO);
  const drawn = Math.min(count, SHOWN);
  // A wider fan as the hand grows, each card closer to the next.
  const span = cardW * 0.42 * (FULL - 1) * (drawn > FULL ? 1 + (drawn - FULL) / (SHOWN - FULL) : 1);
  const step = drawn > 1 ? Math.min(cardW * 0.42, span / (drawn - 1)) : 0;
  const mid = (drawn - 1) / 2;
  const maxW = cardW + cardW * 0.42 * (FULL - 1) * 2 + 12;
  const fanH = cardH + 10;
  const box = Math.round(Math.max(cardW + cardW * 0.42 * (FULL - 1) + 12, fanH) * 0.8);
  const tilt = drawn > FULL ? 6 * (FULL / drawn) : 6;
  return (
    <div data-deal-seat={seat} data-card-w={cardW} className="relative" style={{ width: box, height: box, visibility: hidden ? "hidden" : "visible" }} aria-label={`${count} cards`}>
      <div className="absolute left-1/2 top-1/2" style={{ width: maxW, height: fanH, transform: `translate(-50%, -50%) rotate(${turn}deg)` }}>
        {Array.from({ length: drawn }, (_, i) => {
          const d = i - mid;
          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: maxW / 2 - cardW / 2 + d * step,
                bottom: 4 - d * d * (1.2 * (FULL / Math.max(FULL, drawn)) ** 2),
                transform: `rotate(${d * tilt}deg)`,
                transformOrigin: "50% 100%",
                filter: "drop-shadow(2px 3px 0 rgba(10,7,18,0.45))",
                transition: "left 220ms ease-out, transform 220ms ease-out",
              }}
            >
              <PixelCard faceDown width={cardW} />
            </div>
          );
        })}
        {count > SHOWN && (
          <span
            className="absolute left-1/2 font-pixel-display text-[9px] leading-none px-1.5 py-1 whitespace-nowrap"
            style={{ bottom: -6, transform: `translateX(-50%) rotate(${-turn}deg)`, backgroundColor: "#e85a7a", color: "#1a1024", boxShadow: "0 0 0 2px #0a0712" }}
          >
            +{count - SHOWN}
          </span>
        )}
      </div>
    </div>
  );
}
