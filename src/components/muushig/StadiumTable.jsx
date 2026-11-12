// STADIUM TABLE — the Muushig table, built like Poker's (see poker/
// tableShape.js): a card room table with straight sides and round ends, green
// felt in an oak rim. Five seats round it: you at the foot, the other four
// clockwise from your left, two at each end. Each plate sits just off the rim
// (see MuushigSeat), their cards face down on the felt in front of them. Your
// hand, under the table, is your seat: you need no plate.
//
// Across the middle of the felt, left to right: the draw pile, the trick and
// the dead pile; the trump over the trick, the trick counter under it.
//   trump  the face-up trump card, lying sideways, while the dealer can still
//          take it; once taken, a badge with the trump suit.
//   trick  a card that beats the top card goes on top; one that doesn't is
//          tucked underneath. So the top card is always the one eating it.
//   draw   what players draw from when they swap cards.
//   dead   discards and folded hands.
// The dealer button travels round a track on the felt, always clockwise, and
// the rim glows toward the seat on turn.
//
// The table keeps its shape whatever the space: a box of a fixed aspect ratio,
// everything in it placed by percentages and sized to its width. `layout`
// "compact" (phones under 640 px wide) stands it up, the plates on the rim and
// no cards in front of them. Under its minimum height the table keeps that
// height (its area scrolls).

import React, { useId, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { useElementWidth } from "../../hooks/useElementWidth";
import { DealerButton } from "../poker/OvalTable";
import { stadiumPath, stadiumPoint } from "../poker/tableShape";
import { GEOMETRY, SEAT_NAMES, fractionOf, onFelt, plateAt, turnAt } from "./stadiumGeometry";
import { SUIT_NAME, suitColor } from "./suits";
import { SeatFan } from "./MuushigSeat";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (f) => `${f * 100}%`;
const baseName = (name = "") => name.split(" #")[0];

export function Label({ children, color = "rgba(234,216,177,0.55)" }) {
  return (
    <div className="font-pixel-display text-[8px] tracking-widest leading-none whitespace-nowrap text-center" style={{ color }}>
      {children}
    </div>
  );
}

export function EmptySpot({ w, h, children }) {
  return (
    <div
      className="flex items-center justify-center text-center font-pixel-display text-[9px] leading-tight px-1"
      style={{ width: w, height: h, border: "3px dashed rgba(234,216,177,0.2)", color: "rgba(234,216,177,0.4)" }}
    >
      {children}
    </div>
  );
}

/** Something lying on the felt at `at` ([x, y], fractions of the felt), centred there. */
export function Spot({ geo, at, z = "z-[12]", className = "", children }) {
  return (
    <div className={`absolute ${z} ${className}`} style={{ ...onFelt(geo, at), transform: "translate(-50%, -50%)" }}>
      {children}
    </div>
  );
}

/** The draw or dead pile: a straight face-down stack (the dead one darker), its name and count under it. */
export function Pile({ label, count, cw, dead = false, boxRef }) {
  const ch = Math.round(cw * CARD_RATIO);
  const layers = Math.min(count, 3);
  return (
    <div className="flex flex-col items-center gap-2" aria-label={`${label} pile: ${count}`}>
      <div ref={boxRef} className="relative" style={{ width: cw, height: ch }}>
        {count === 0 ? (
          <EmptySpot w={cw} h={ch}>
            EMPTY
          </EmptySpot>
        ) : (
          Array.from({ length: layers }, (_, i) => (
            <div
              key={i}
              className="absolute inset-0"
              style={{
                transform: `translate(${-i * 2}px, ${-i * 2}px)`,
                filter: `${dead ? "brightness(0.55) saturate(0.6) " : ""}drop-shadow(2px 3px 0 rgba(10,7,18,0.5))`,
              }}
            >
              <PixelCard faceDown width={cw} />
            </div>
          ))
        )}
      </div>
      <Label>
        {label} <span style={{ color: dead ? "rgba(234,216,177,0.75)" : "#5fd4d6" }}>{count}</span>
      </Label>
    </div>
  );
}

/**
 * The trump: the face-up card lying sideways, or — once the dealer has taken
 * it — a badge with the suit. trumpRef is the sideways card's box (a card
 * height wide), where the card flies from when it's taken.
 */
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
      <div className="flex flex-col items-center gap-2">
        <Label color="#f4c430">TRUMP</Label>
        <div
          ref={(el) => {
            flipRef.current = el;
            if (trumpRef) trumpRef.current = el;
          }}
          className="relative"
          style={{ width: Math.round(cw * CARD_RATIO), height: cw }}
        >
          <div className="absolute left-1/2 top-1/2" style={{ transform: "translate(-50%, -50%) rotate(90deg)", filter: "drop-shadow(0 0 10px rgba(244,196,48,0.5))" }}>
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

// Stable pseudo-random numbers per card, so the stack never reshuffles.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/**
 * The trick: cards in stack order, bottom first. Buried cards cross at a tilt
 * and dim; the top card sits nearly straight with its player's name. A new
 * card flies in from its player's plate (entry: { seat: [x, y] }, px from the
 * trick).
 */
function TrickStack({ stack, cw, entry }) {
  const ch = Math.round(cw * CARD_RATIO);
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
      const [fx, fy] = entry[s.seat] || entry.bottom;
      if (!el) return;
      gsap.fromTo(
        el,
        { x: fx, y: fy, rotation: gsap.utils.random(-30, 30), scale: 1.15, autoAlpha: 0 },
        { x: 0, y: 0, rotation: 0, scale: 1, autoAlpha: 1, duration: 0.4, ease: "back.out(1.3)", overwrite: true },
      );
    });
  }, [stack, entry]);

  if (!stack.length) {
    return (
      <EmptySpot w={cw} h={ch}>
        LEAD
      </EmptySpot>
    );
  }

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
        style={{ bottom: 0, transform: "translate(-50%, 70%)", zIndex: stack.length + 2, backgroundColor: "#f4c430", color: "#1a1024", boxShadow: "0 0 0 2px #0a0712" }}
      >
        {baseName(top.name).toUpperCase()}
      </div>
    </div>
  );
}

/**
 * The felt and its rim, drawn in the table's own units with hard edges, for
 * the pixel look. turnT: where round the rim the seat on turn sits; a gold
 * glow there, kept inside the felt, slides round as the turn passes.
 */
export function Felt({ geo, turnSeat }) {
  const id = useId().replace(/:/g, "");
  const { felt } = geo;
  const glow = turnSeat ? stadiumPoint(felt, geo.seats[turnSeat].t) : null;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${geo.width} ${geo.height}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden>
      <defs>
        <clipPath id={`${id}-felt`}>
          <path d={stadiumPath(felt, null, 11)} />
        </clipPath>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0%" stopColor="#f4c430" stopOpacity="0.6" />
          <stop offset="45%" stopColor="#f4c430" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#f4c430" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={stadiumPath(felt, null, -3)} fill="#0a0712" transform="translate(0 7)" />
      <path d={stadiumPath(felt, null, -3)} fill="#6b3a1f" />
      <path d={stadiumPath(felt, null, 7)} fill="#0a3a2c" />
      <path d={stadiumPath(felt, null, 11)} fill="#17604a" />
      <path d={stadiumPath(felt, null, geo.track + 15)} fill="none" stroke="rgba(234,216,177,0.14)" strokeWidth="2" strokeDasharray="10 8" />
      {glow && (
        <g clipPath={`url(#${id}-felt)`}>
          <g data-turn-side={turnSeat} style={{ transform: `translate(${glow.x}px, ${glow.y}px)`, transition: "transform 400ms ease-in-out" }}>
            <circle className="turn-edge" r={geo.sizes.glow} fill={`url(#${id}-glow)`} shapeRendering="auto" />
          </g>
        </g>
      )}
    </svg>
  );
}

/**
 * seats: { bottomLeft, topLeft, topRight, bottomRight } — each
 *   { plate: node (a MuushigSeat), cards: how many it holds, out: folded }.
 * stack: the trick in stack order, bottom first: { key, card, seat, name }.
 * trump: the trump card; trumpTakenBy: the dealer's name once they've taken
 *   it; trumpRef: ref to the face-up trump card while it lies on the felt.
 * drawCount / deadCount and drawRef / deadRef: the piles and their card boxes.
 * phaseLabel: shown instead of the trick counter before tricks start; false
 *   hides it.
 * dealing: hides the trump, the trick and the piles while the deal plays.
 * overlay({ cardWidth, spots, pileY, labelY, countBelow }): drawn over the felt, in a box the
 *   felt's size (the draw for the deal, the dealer banner, the deal
 *   animation). spots: where each seat's card lies in the draw for the deal,
 *   [x, y] px from its centre; pileY / labelY: the draw's pile and caption,
 *   px above it; countBelow: where the pile's count goes (see DealDraw).
 * centerRef: ref to that box: dealt cards fly from its centre.
 * dealerSeat: the seat the dealer button sits by. turnSeat: the seat the rim
 *   glows toward: whose turn it is.
 * banner: drawn over everything (the YOUR TURN banner).
 */
export default function StadiumTable({
  layout = "full",
  seats = {},
  stack = [],
  trump = null,
  trumpTakenBy = null,
  trumpRef,
  drawCount = 0,
  deadCount = 0,
  drawRef,
  deadRef,
  trickNumber = 1,
  tricksPerRound = 5,
  phaseLabel,
  dealing = false,
  overlay,
  centerRef,
  dealerSeat = null,
  turnSeat = null,
  banner = null,
}) {
  const geo = GEOMETRY[layout] ?? GEOMETRY.full;
  const rootRef = useRef(null);
  const width = useElementWidth(rootRef);
  const scale = width ? clamp(width / geo.width, 0.5, 1.5) : 1;
  const size = Object.fromEntries(Object.entries(geo.sizes).map(([k, v]) => [k, Math.round(v * scale)]));
  const ratio = geo.width / geo.height;
  const cx = (geo.felt.x0 + geo.felt.x1) / 2;
  const cy = (geo.felt.y0 + geo.felt.y1) / 2;
  // px from the felt's centre, from the table's units.
  const fromCentre = ({ x, y }, [ox, oy] = [cx, cy]) => [Math.round((x - ox) * scale), Math.round((y - oy) * scale)];
  const trickAt = [geo.felt.x0 + geo.trickAt[0] * (geo.felt.x1 - geo.felt.x0), geo.felt.y0 + geo.trickAt[1] * (geo.felt.y1 - geo.felt.y0)];
  const entry = Object.fromEntries(SEAT_NAMES.map((s) => [s, fromCentre(stadiumPoint(geo.felt, geo.seats[s].t, 10), trickAt)]));
  const spots = Object.fromEntries(SEAT_NAMES.map((s) => [s, fromCentre(stadiumPoint(geo.felt, geo.seats[s].t, geo.seats[s].draw))]));
  // The draw for the deal. Lying down, the pile sits a little high, leaving
  // room for your card below it, and counts its cards beside it. Stood up (a
  // phone), the caption goes to the head of the table, clear of the cards
  // drawn by the plates there, and the count under the pile.
  const feltH = (geo.felt.y1 - geo.felt.y0) * scale;
  const drawLayout =
    layout === "compact"
      ? { pileY: 0, labelY: -Math.round(feltH / 2 - 44 * scale), countBelow: true }
      : { pileY: -Math.round(22 * scale), labelY: -Math.round(22 * scale + size.trick * CARD_RATIO * 0.5 + 34) };
  const feltBox = {
    left: pct(geo.felt.x0 / geo.width),
    top: pct(geo.felt.y0 / geo.height),
    width: pct((geo.felt.x1 - geo.felt.x0) / geo.width),
    height: pct((geo.felt.y1 - geo.felt.y0) / geo.height),
  };

  return (
    // The minimum height goes on an outer box: a size container whose height came only from a
    // min-height measured 0 tall in Chromium (see OvalTable).
    <div className="relative w-full h-full" style={{ minHeight: geo.minHeight }}>
      {/* Inset a little: plates keep their size as the table shrinks, so they stand off its edges. */}
      <div className="absolute" style={{ inset: "12px 0 8px", containerType: "size" }}>
        <div
          ref={rootRef}
          data-muushig-table
          data-layout={layout}
          className="absolute left-1/2 top-1/2"
          style={{ width: `min(100cqw, calc(100cqh * ${ratio}))`, height: `min(100cqh, calc(100cqw / ${ratio}))`, transform: "translate(-50%, -50%)" }}
        >
          <Felt geo={geo} turnSeat={turnSeat} />

          {!dealing && (
            <>
              <Spot geo={geo} at={geo.trumpAt}>
                <TrumpSpot trump={trump} takenBy={trumpTakenBy} cw={size.trump} trumpRef={trumpRef} />
              </Spot>
              <Spot geo={geo} at={geo.trickAt} z="z-[14]">
                <TrickStack stack={stack} cw={size.trick} entry={entry} />
              </Spot>
              <Spot geo={geo} at={geo.drawAt}>
                <Pile label="DRAW" count={drawCount} cw={size.pile} boxRef={drawRef} />
              </Spot>
              <Spot geo={geo} at={geo.deadAt}>
                <Pile label="DEAD" count={deadCount} cw={size.pile} dead boxRef={deadRef} />
              </Spot>
            </>
          )}

          {phaseLabel !== false && (
            <Spot geo={geo} at={geo.labelAt} z="z-[13]">
              <div className="font-pixel-display text-[10px] leading-none px-2 py-1.5 whitespace-nowrap" style={{ backgroundColor: "#0a0712", color: "#ead8b1", boxShadow: "0 0 0 2px #0a3a2c" }}>
                {phaseLabel ?? (
                  <>
                    TRICK <span className="text-glow-gold">{trickNumber}</span>/{tricksPerRound}
                  </>
                )}
              </div>
            </Spot>
          )}

          {SEAT_NAMES.map((name) => {
            const s = seats[name];
            const at = geo.seats[name];
            if (!s) return null;
            return (
              <React.Fragment key={name}>
                {name !== "bottom" &&
                  (at.fan ? (
                    <div className="absolute z-[16]" style={{ ...fractionOf(geo, stadiumPoint(geo.felt, at.t, at.fan)), transform: "translate(-50%, -50%)" }}>
                      <SeatFan seat={name} count={s.cards} cardW={size.fan} turn={turnAt(geo, at.t)} hidden={s.out} />
                    </div>
                  ) : (
                    // No cards shown in front of the seat: the deal and card flights aim at its plate.
                    <div data-deal-seat={name} data-card-w={size.fan} className="absolute w-px h-px" style={fractionOf(geo, stadiumPoint(geo.felt, at.t))} />
                  ))}
                {s.plate && (
                  <div className="absolute z-[25]" style={plateAt(geo, at.t, width)}>
                    {s.plate}
                  </div>
                )}
              </React.Fragment>
            );
          })}
          {dealerSeat && <DealerButton geo={geo} t={geo.seats[dealerSeat].t + geo.seats[dealerSeat].button} seat={dealerSeat} size={size.button} />}

          <div ref={centerRef} className="absolute z-30 pointer-events-none" style={feltBox}>
            {overlay?.({ cardWidth: size.trick, spots, ...drawLayout })}
          </div>
          {banner}
        </div>
      </div>
    </div>
  );
}
