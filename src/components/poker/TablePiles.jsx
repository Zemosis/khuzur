// TABLE PILES — the house's deck and the muck, lying on the felt either side
// of the board. Before each hand the deck slides to the middle, riffles
// (its layers, data-deck-layer), deals and slides back; the flop, turn and
// river come out of it (data-deck). Every folded hand lands on the muck
// (data-muck), darker, which grows with what's been folded this hand and is
// a faint outline while empty. See cardMotion.js.

import React from "react";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";

const DECK_LAYERS = 6; // thick enough to riffle

/** The deck: a straight stack of backs. */
export function Deck({ cardWidth }) {
  return (
    <div className="relative" style={{ width: cardWidth, height: Math.round(cardWidth * CARD_RATIO) }} data-deck title="Deck">
      {Array.from({ length: DECK_LAYERS }, (_, i) => (
        // The layer is moved by the riffle; the card inside keeps the stack's offset.
        <div key={i} className="absolute inset-0" data-deck-layer>
          <div className="absolute inset-0" style={{ transform: `translate(${-i}px, ${-i}px)` }}>
            <PixelCard faceDown width={cardWidth} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The muck: `count` cards folded this hand, as a darker stack. */
export function Muck({ count = 0, cardWidth }) {
  const layers = Math.min(count, 3);
  return (
    <div className="relative" style={{ width: cardWidth, height: Math.round(cardWidth * CARD_RATIO) }} data-muck title={`Muck: ${count}`}>
      {layers === 0 ? (
        <div className="absolute inset-0" style={{ border: "2px dashed rgba(155,209,79,0.18)" }} />
      ) : (
        Array.from({ length: layers }, (_, i) => (
          <div key={i} className="absolute inset-0" style={{ transform: `translate(${-i * 2}px, ${-i * 2}px) rotate(${(i - 1) * 6}deg)`, filter: "brightness(0.55) saturate(0.6)" }}>
            <PixelCard faceDown width={cardWidth} />
          </div>
        ))
      )}
    </div>
  );
}
