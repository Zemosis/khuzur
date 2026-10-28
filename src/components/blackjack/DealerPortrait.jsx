// DEALER PORTRAIT — the Hooded House: a faceless figure in a purple hooded
// cloak with two gold eyes and a gold clasp, drawn from a 16×16 sprite map as
// crisp SVG pixels in a gold-framed portrait, with what the dealer says in a
// speech bubble beside it.

import React from "react";
import ChatBubble from "../ChatBubble";

// The spec's sprite: p cloak, P cloak shadow, V face void, Y eyes, G clasp.
const SPRITE = [
  "......pppp......",
  ".....pppppp.....",
  "....pppppppp....",
  "...ppPPPPPPpp...",
  "...pPVVVVVVPp...",
  "..pppVVVVVVppp..",
  "..ppVYYVVYYVpp..",
  "..ppVVVVVVVVpp..",
  "..pPVVVVVVVVPp..",
  "..pppPVVVVPppp..",
  ".pppppPVVPppppp.",
  ".ppppppGGpppppp.",
  "pppppppGGppppppp",
  "pppppPPGGPPppppp",
  "ppppPPPGGPPPpppp",
  "pppPPPPGGPPPPppp",
];
const COLORS = { p: "#463a78", P: "#2a234d", V: "#0a0712", Y: "#f4c430", G: "#c89820" };

// One rect per pixel, worked out once.
const PIXELS = SPRITE.flatMap((row, y) => [...row].flatMap((c, x) => (COLORS[c] ? [{ x, y, fill: COLORS[c] }] : [])));

/** px: the size of one sprite pixel. line: the bubble's text (null: none). */
export default function DealerPortrait({ px = 4, line = null }) {
  const side = 16 * px;
  return (
    <div className="relative flex flex-col items-center gap-1.5">
      <div style={{ border: "4px solid #c89820", boxShadow: "4px 4px 0 #0a0712", backgroundColor: "#1f1a3d", padding: 4, lineHeight: 0 }}>
        <svg width={side} height={side} viewBox="0 0 16 16" shapeRendering="crispEdges" role="img" aria-label="The dealer">
          {PIXELS.map(({ x, y, fill }) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
          ))}
        </svg>
      </div>
      <span className="font-pixel-display text-[10px] leading-none text-glow-gold" style={{ textShadow: "2px 2px 0 #0a0712" }}>
        DEALER
      </span>
      {line && (
        <div className="absolute left-0 top-0" style={{ width: side + 16, height: side + 16 }}>
          <ChatBubble name="Dealer" lines={[line]} side="right" align="center" gap={12} />
        </div>
      )}
    </div>
  );
}
