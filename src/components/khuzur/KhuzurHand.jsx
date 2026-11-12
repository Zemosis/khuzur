// KHUZUR HAND — your cards under the table, fanned like the other games'
// hands (see thirteen/PlayerHand): a gentle arc, each card tilted a little,
// a picked card lifted. Each card is a button named for the card ("J♠",
// "Gray joker"), so picking works from the keyboard too.
//
// A big hand (after pick-ups) closes up so it always fits the width, each
// card still showing its corner. A card that just arrived (drawn, picked up)
// rises into place.
//
// While you beat, a card can also be dragged: it follows the pointer, and
// letting go over a card of the stack's top layer places it there (the page
// decides, see onDrop). A press that barely moves is still a click.

import React, { useRef } from "react";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { useElementWidth } from "../../hooks/useElementWidth";
import { toPixelCardProps } from "./cardProps";
import { useCardDrag } from "./useCardDrag";

const MIN_SHOWN = 0.36; // of a card's width, the least of each card left showing

/** A card's label for screen readers and tests: "J♠", "Gray joker". */
const cardLabel = (card) => (card.joker ? (card.joker === "gray" ? "Gray joker" : "Colored joker") : `${card.rank}${card.suit}${card.copy === 2 ? " (2)" : ""}`);

/** Where card i of n sits: its centre's x from the middle, how far it dips, its tilt. */
function slot(i, n, cardW, width) {
  const mid = (n - 1) / 2;
  const d = i - mid;
  const room = Math.max(0, width - cardW - 24);
  const spacing = n > 1 ? Math.min(cardW * 0.78, room / (n - 1)) : 0;
  const dip = cardW * 0.1;
  return { x: d * spacing, y: mid ? (d * d * dip) / (mid * mid) : 0, rotation: d * Math.min(2.4, 24 / Math.max(n - 1, 1)) };
}

/**
 * cards: in the order shown. selected: picked card ids. onToggle(id).
 * cardW: the full card width (a big hand shrinks to fit, never below
 * MIN_SHOWN of a card each). enabled: your turn, cards can be picked.
 * emptyMessage: shown when you hold nothing. hidden: ids of cards still in
 * the air on their way here (see CardFlights): their slot is kept, the card
 * shows once it lands.
 * draggable: cards can be dragged (beating). onDragOver(id, x, y) as one moves
 * (null id once it's let go); onDrop(id, x, y) where it's let go, client px.
 */
export default function KhuzurHand({ cards, selected, onToggle, cardW: fullW, enabled, emptyMessage = null, hidden = null, draggable = false, onDragOver, onDrop }) {
  const ref = useRef(null);
  const { bind, onClick, dragging, ghost } = useCardDrag({ enabled: draggable && enabled, onMove: onDragOver, onDrop });
  const width = useElementWidth(ref);
  const n = cards.length;
  // Shrink the cards only when even the closest fan wouldn't fit.
  const cardW = n > 1 && width > 0 ? Math.max(34, Math.min(fullW, Math.floor((width - 24) / (1 + MIN_SHOWN * (n - 1))))) : fullW;
  const cardH = Math.round(cardW * CARD_RATIO);
  const fullH = Math.round(fullW * CARD_RATIO);
  const base = Math.round(cardW * 0.1 + (cardW / 2) * Math.sin((14 * Math.PI) / 180)) + 6;
  const lift = Math.round(cardH * 0.16);
  const liftVars = { "--lift": `${lift}px`, "--hover-lift": `${Math.round(cardH * 0.07)}px` };

  return (
    // Headroom over the cards for a picked one to lift into, clear of the YOUR TURN mark above.
    // Clipped at the bottom: a card rising into the hand (kz-rise) starts below it, and mustn't push the page into scrolling.
    <div ref={ref} className="relative w-full select-none" style={{ height: fullH + base + Math.round(fullH * 0.16) + 14, overflowY: "clip" }} aria-label="Your hand">
      {n === 0 && emptyMessage ? (
        <div className="absolute inset-0 flex items-center justify-center font-pixel-display text-[12px] text-glow-gold text-center px-4">{emptyMessage}</div>
      ) : (
        // Rendered in a fixed order (by id), each card placed by its slot in `cards`: a re-sort or
        // a pick-up then only changes transforms, and every card slides to its new place. (Listed
        // in hand order instead, React would move the elements, and a moved element restarts its
        // rise and skips the slide, so the hand scrambles.)
        [...cards]
          .map((card, i) => ({ card, i }))
          .sort((a, b) => (a.card.id < b.card.id ? -1 : 1))
          .map(({ card, i }) => {
            const on = selected.includes(card.id);
            const s = slot(i, n, cardW, width || fullW * n);
            return (
              <button
                key={card.id}
                type="button"
                aria-label={cardLabel(card)}
                aria-pressed={on}
                data-hand-card={card.id}
                disabled={!enabled}
                onClick={onClick(() => onToggle(card.id))}
                {...bind(card.id, card, cardW)}
                className="absolute p-0 bg-transparent border-0 kz-rise"
                style={{
                  left: "50%",
                  bottom: base,
                  width: cardW,
                  height: cardH,
                  marginLeft: -cardW / 2,
                  zIndex: i + 1,
                  transform: `translate(${s.x}px, ${s.y}px) rotate(${s.rotation}deg)`,
                  transformOrigin: "50% 100%",
                  transition: "transform 320ms ease-out",
                  cursor: enabled ? (draggable ? "grab" : "pointer") : "default",
                  visibility: hidden?.has(card.id) ? "hidden" : undefined,
                  opacity: dragging === card.id ? 0 : undefined, // only the carried copy shows; its slot stays open
                  touchAction: draggable ? "none" : undefined,
                }}
              >
                <PixelCard {...toPixelCardProps(card)} width={cardW} selected={on} selectable={enabled} style={liftVars} />
              </button>
            );
          })
      )}
      {ghost}
    </div>
  );
}
