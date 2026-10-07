// ROUND TABLE — the Muushig table: a round felt with four opponents sitting
// symmetrically around it (top-left, top-right, bottom-left, bottom-right);
// you sit at the bottom, where your hand is.
//
// On the felt:
//   centre  the trick stack. A card that beats the top card goes on top; a
//           card that doesn't is tucked underneath. So the top card is always
//           the one eating the pile.
//   top     the trump. While the dealer can still take it, the face-up trump
//           card lies there; once taken, a badge shows the trump suit.
//   bottom  the trick counter.
// The draw and dead piles sit beside your hand (see SidePiles).
//
// The felt is sized from the space it gets, so the same layout works on a
// laptop and on a big screen. `layout` follows the opponents' seats (see
// OpponentSection): "full" seats in columns either side; "row" slim plates in
// narrower columns (short screens); "strip" all four in a row above the felt,
// clockwise from your left (phones held upright).

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { SUIT_NAME, suitColor } from "./suits";

const SEAT_W = 224; // side seat: plate + gap + sideways fan, as in Thirteen
const SEAT_H = 168; // tallest side seat (fan box)
const ROW_SEAT_W = 150; // slim plate on a short screen
const GAP = 20;
const RIM = 18; // wood rim + outline drawn outside the felt
const MAX_D = 560;
const MIN_D = 150;

// Where a played card flies in from, as a fraction of the table diameter.
const ENTRY = {
  bottom: [0, 0.6],
  bottomLeft: [-0.75, 0.3],
  topLeft: [-0.75, -0.3],
  topRight: [0.75, -0.3],
  bottomRight: [0.75, 0.3],
};

// Stable pseudo-random numbers per card, so the stack never reshuffles.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const baseName = (name = "") => name.split(" #")[0];

function SpotLabel({ children, color = "rgba(234,216,177,0.75)" }) {
  return (
    <div className="font-pixel-display text-[10px] leading-none mb-2 whitespace-nowrap text-center" style={{ color }}>
      {children}
    </div>
  );
}

function EmptySpot({ w, h, children }) {
  return (
    <div
      className="flex items-center justify-center text-center font-pixel-display text-[10px] leading-tight px-1"
      style={{ width: w, height: h, border: "3px dashed rgba(234,216,177,0.2)", color: "rgba(234,216,177,0.4)" }}
    >
      {children}
    </div>
  );
}

// The trump: the face-up card lying sideways, or — once the dealer has taken
// it — a badge with the suit.
function TrumpSpot({ trump, takenBy, cw, trumpRef }) {
  const flipRef = useRef(null);
  // The trump is turned face up when the deal ends: a quick flip.
  useLayoutEffect(() => {
    if (!flipRef.current) return;
    gsap.fromTo(flipRef.current, { scaleX: 0 }, { scaleX: 1, duration: 0.28, ease: "back.out(1.6)" });
  }, [trump?.id]);

  if (!trump) return null;
  if (!takenBy) {
    return (
      <div className="flex flex-col items-center">
        <SpotLabel color="#f4c430">TRUMP</SpotLabel>
        <div
          ref={(el) => {
            flipRef.current = el;
            if (trumpRef) trumpRef.current = el;
          }}
          className="relative"
          style={{ width: Math.round(cw * CARD_RATIO), height: cw }}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{ transform: "translate(-50%, -50%) rotate(90deg)", filter: "drop-shadow(0 0 10px rgba(244,196,48,0.5))" }}
          >
            <PixelCard rank={trump.rank} suit={trump.suit} width={cw} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex items-center gap-3 px-3 py-2"
      style={{ backgroundColor: "rgba(10,7,18,0.7)", border: "3px solid #f4c430", boxShadow: "0 0 0 2px #0a0712, 0 0 14px rgba(244,196,48,0.35)" }}
      title={`${baseName(takenBy)} took the ${trump.rank}${trump.suit}`}
    >
      <span style={{ color: suitColor(trump.suit), fontSize: 30, lineHeight: 1, textShadow: "2px 2px 0 #0a0712" }}>{trump.suit}</span>
      <div className="flex flex-col gap-1.5">
        <span className="font-pixel-display text-[10px] leading-none text-glow-gold">TRUMP</span>
        <span className="font-pixel-display text-[10px] leading-none text-bone/70 whitespace-nowrap">{SUIT_NAME[trump.suit]}</span>
      </div>
    </div>
  );
}

// The trick: cards in stack order, bottom first. Buried cards cross at a
// tilt and dim; the top card sits nearly straight with its player's name.
function TrickStack({ stack, cw, ch, D }) {
  const itemRefs = useRef(new Map());
  const seenRef = useRef(null);

  useLayoutEffect(() => {
    const keys = stack.map((s) => s.key);
    const seen = seenRef.current;
    seenRef.current = new Set(keys);
    if (!seen) return; // first render: the trick is already on the table
    stack.forEach((s) => {
      if (seen.has(s.key)) return;
      const el = itemRefs.current.get(s.key);
      const [fx, fy] = ENTRY[s.seat] || ENTRY.bottom;
      if (!el) return;
      gsap.fromTo(
        el,
        { x: fx * D, y: fy * D, rotation: gsap.utils.random(-30, 30), scale: 1.15, autoAlpha: 0 },
        { x: 0, y: 0, rotation: 0, scale: 1, autoAlpha: 1, duration: 0.4, ease: "back.out(1.3)", overwrite: true },
      );
    });
  }, [stack, D]);

  if (!stack.length) return <EmptySpot w={cw} h={ch}>LEAD</EmptySpot>;

  const top = stack[stack.length - 1];
  return (
    <div className="relative" style={{ width: cw, height: ch }}>
      {stack.map((s, i) => {
        const isTop = i === stack.length - 1;
        const r = hash(s.key);
        const r2 = hash(s.key + "*");
        const rotation = isTop ? (r - 0.5) * 6 : (i % 2 ? 1 : -1) * (10 + r * 12);
        return (
          <div
            key={s.key}
            data-trick-card={s.card.id}
            className="absolute inset-0"
            style={{
              zIndex: i + 1,
              transform: `translate(${isTop ? 0 : (r2 - 0.5) * 24}px, ${isTop ? 0 : (r - 0.5) * 14}px) rotate(${rotation}deg)`,
              filter: isTop ? "none" : `brightness(${Math.max(0.5, 0.82 - (stack.length - 2 - i) * 0.1)})`,
              transition: "transform 260ms ease-out, filter 260ms ease-out",
            }}
          >
            <div ref={(el) => (el ? itemRefs.current.set(s.key, el) : itemRefs.current.delete(s.key))}>
              <div style={{ boxShadow: isTop ? "0 0 0 3px #f4c430, 0 0 0 6px #0a0712, 0 0 18px rgba(244,196,48,0.45)" : "none" }}>
                <PixelCard rank={s.card.rank} suit={s.card.suit} width={cw} />
              </div>
            </div>
          </div>
        );
      })}
      <div
        className="absolute left-1/2 font-pixel-display text-[10px] leading-none px-1.5 py-1 whitespace-nowrap"
        style={{
          bottom: 0,
          transform: "translate(-50%, 70%)",
          zIndex: stack.length + 2,
          backgroundColor: "#f4c430",
          color: "#1a1024",
          boxShadow: "0 0 0 2px #0a0712",
        }}
      >
        {baseName(top.name).toUpperCase()}
      </div>
    </div>
  );
}

// Where the dealer marker sits for each seat, as a fraction of the diameter:
// on the felt's edge, facing that seat.
const DEALER_SPOT = {
  bottom: [0, 0.41],
  bottomLeft: [-0.3, 0.17],
  topLeft: [-0.3, -0.12],
  topRight: [0.3, -0.12],
  bottomRight: [0.3, 0.17],
};

function DealerMarker({ seat, D }) {
  const [fx, fy] = DEALER_SPOT[seat] || DEALER_SPOT.bottom;
  return (
    <div
      className="absolute left-1/2 top-1/2 z-20 pointer-events-none"
      style={{
        transform: `translate(-50%, -50%) translate(${Math.round(fx * D)}px, ${Math.round(fy * D)}px)`,
        // Slides to the next dealer's side when the deal passes.
        transition: "transform 600ms ease-in-out",
      }}
      title="Dealer"
    >
      <div
        className="font-pixel-display text-[10px] leading-none px-2 py-1.5 whitespace-nowrap"
        style={{ backgroundColor: "#5fd4d6", color: "#0a3a3a", boxShadow: "0 0 0 2px #0a0712, 2px 2px 0 2px #0a0712, 0 0 12px rgba(95,212,214,0.5)" }}
      >
        DEALER
      </div>
    </div>
  );
}

// A gold glow on the rim, toward the seat whose turn it is.
function TurnGlow({ seat, D }) {
  const [fx, fy] = DEALER_SPOT[seat] || DEALER_SPOT.bottom;
  const len = Math.hypot(fx, fy) || 1;
  const r = D * 0.5;
  const size = Math.round(D * 0.34);
  return (
    <div
      data-turn-side={seat}
      aria-hidden
      className="turn-edge absolute left-1/2 top-1/2 pointer-events-none"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        transform: `translate(-50%, -50%) translate(${Math.round((fx / len) * r)}px, ${Math.round((fy / len) * r)}px)`,
        background: "radial-gradient(circle, rgba(244,196,48,0.75) 0%, rgba(244,196,48,0.25) 45%, rgba(244,196,48,0) 70%)",
        transition: "transform 400ms ease-in-out",
      }}
    />
  );
}

function Felt({ D, stack, trump, trumpTakenBy, trickNumber, tricksPerRound, phaseLabel, maxCardWidth, dealing, overlay, centerRef, dealerSeat, trumpRef, turnSeat }) {
  const cw = Math.round(Math.max(48, Math.min(maxCardWidth, D * 0.2)));
  const ch = Math.round(cw * CARD_RATIO);
  const at = (fy) => ({
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: `translate(-50%, -50%) translate(0, ${Math.round(fy * D)}px)`,
  });

  return (
    <div
      ref={centerRef}
      className="relative shrink-0"
      style={{
        width: D,
        height: D,
        borderRadius: "50%",
        background: "radial-gradient(circle at 50% 45%, #2c6650 0%, #1a4030 45%, #0e2418 80%, #061810 100%)",
        border: "6px solid #6b3a1f",
        boxShadow:
          "0 0 0 4px #0a0712, 0 0 0 12px #2a1810, 0 0 0 16px #0a0712, inset 0 0 0 8px #1a3a2c, inset 0 0 80px rgba(0,0,0,0.6), 0 0 60px rgba(155,209,79,0.10)",
      }}
    >
      <div className="absolute pointer-events-none" style={{ inset: 16, borderRadius: "50%", border: "2px dashed rgba(155,209,79,0.18)" }} />

      {!dealing && (
        <>
          <div style={at(-0.3)}>
            <TrumpSpot trump={trump} takenBy={trumpTakenBy} cw={cw} trumpRef={trumpRef} />
          </div>

          <div style={at(0.04)}>
            <TrickStack stack={stack} cw={cw} ch={ch} D={D} />
          </div>
        </>
      )}

      {turnSeat && <TurnGlow seat={turnSeat} D={D} />}
      {dealerSeat && <DealerMarker seat={dealerSeat} D={D} />}

      {overlay?.(cw, D)}

      {phaseLabel !== false && (
        <div style={at(0.3)}>
          <div
            className="font-pixel-display text-[10px] leading-none px-2 py-1.5 whitespace-nowrap"
            style={{ backgroundColor: "#0a0712", color: "#ead8b1", boxShadow: "0 0 0 2px #1a3a2c" }}
          >
            {phaseLabel ?? (
              <>
                TRICK <span className="text-glow-gold">{trickNumber}</span>/{tricksPerRound}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * seats: { topLeft, topRight, bottomLeft, bottomRight } — rendered seat nodes.
 * layout: "full" | "row" | "strip" — where the seats go (see above).
 * stack: the trick in stack order, bottom first: { key, card, seat, name }.
 * trumpTakenBy: the dealer's name once they've taken the trump card.
 * phaseLabel: shown instead of the trick counter before tricks start;
 *   false hides the counter.
 * dealing: hides the trump and the trick while the deal animation runs.
 * overlay: (cardWidth, diameter) => node drawn on the felt (the draw for
 *   the deal, the dealer banner, the deal animation).
 * centerRef: ref to the felt, where dealt cards fly from.
 * dealerSeat: seat name (bottom, bottomLeft, …) the DEALER marker faces.
 * turnSeat: seat name the rim glows toward: whose turn it is.
 * trumpRef: ref to the face-up trump card while it lies on the felt.
 */
const RoundTable = ({ seats, layout = "full", maxCardWidth = 100, ...felt }) => {
  const boxRef = useRef(null);
  const [box, setBox] = useState(null);

  // Re-attached when the layout swaps the measured box.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout]);

  if (layout === "strip") {
    const D = box ? Math.max(MIN_D, Math.min(MAX_D, box.h - RIM * 2, box.w - RIM * 2)) : 0;
    return (
      <div className="flex-1 min-h-0 w-full flex flex-col">
        <div className="flex justify-center gap-1.5 relative z-10">
          {seats.bottomLeft}
          {seats.topLeft}
          {seats.topRight}
          {seats.bottomRight}
        </div>
        {/* The seats' DEAL tag marks the dealer; on a felt this small the
            marker would sit on the trump. */}
        <div ref={boxRef} className="flex-1 min-h-0 flex items-center justify-center mt-3">
          {box && <Felt D={D} maxCardWidth={maxCardWidth} {...felt} dealerSeat={null} />}
        </div>
      </div>
    );
  }

  const seatW = layout === "row" ? ROW_SEAT_W : SEAT_W;
  const D = box ? Math.max(MIN_D, Math.min(MAX_D, box.h - RIM * 2, box.w - 2 * (seatW + GAP) - RIM * 2)) : 0;
  const colH = layout === "row" ? D : Math.max(D, SEAT_H * 2 + 8);

  return (
    <div ref={boxRef} className="flex-1 min-h-0 w-full flex items-center justify-center" style={{ gap: GAP + RIM }}>
      {box && (
        <>
          <div className="flex flex-col justify-around items-end shrink-0" style={{ width: seatW, height: colH }}>
            {seats.topLeft}
            {seats.bottomLeft}
          </div>
          <Felt D={D} maxCardWidth={maxCardWidth} {...felt} />
          <div className="flex flex-col justify-around items-start shrink-0" style={{ width: seatW, height: colH }}>
            {seats.topRight}
            {seats.bottomRight}
          </div>
        </>
      )}
    </div>
  );
};

export default RoundTable;
