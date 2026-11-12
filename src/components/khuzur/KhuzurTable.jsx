// KHUZUR TABLE — the felt and everyone round it, built like Muushig's (see
// muushig/StadiumTable): a card room table with straight sides and round
// ends, green felt in an oak rim. Up to six seats: you at the foot (your hand,
// under the table, is your seat), the rest clockwise from your left
// (utils/seatPosition), each plate (KhuzurSeat) just off the rim with their
// cards face down on the felt in front of them.
//
// Across the middle of the felt, left to right: the draw pile with the
// face-up trump tucked sideways under it, the stack, the dead pile. A line
// under the stack says what it's waiting for (and the trump and the decks).
// The dealer button travels round the rim, and the rim glows toward the seat
// on turn.
//
// The table keeps its shape whatever the space: a box of a fixed aspect
// ratio, everything in it placed by percentages and sized to its width.
// `layout` "compact" (phones) stands it up, the plates on the rim and no
// cards in front of them.

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { useElementWidth } from "../../hooks/useElementWidth";
import { DealerButton } from "../poker/OvalTable";
import { stadiumPoint } from "../poker/tableShape";
import { fractionOf, plateAt, turnAt } from "../muushig/stadiumGeometry";
import KhuzurFan from "./KhuzurFan";
import { EmptySpot, Felt, Pile, Spot } from "../muushig/StadiumTable";
import { KHUZUR_GEOMETRY, KHUZUR_SEAT_NAMES, STACK_PEEK, stackPeeks, stackRows } from "./khuzurGeometry";
import StackColumns from "./StackColumns";
import { toPixelCardProps } from "./cardProps";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const ROOMY_PX = 858; // a table at least this wide has room for the felt line's long form

/** The space the table has, { w, h } px, kept current. */
function useBoxSize(ref) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setBox({ w: el.offsetWidth, h: el.offsetHeight });
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/**
 * The big-screen shape that gives the bigger felt in a w × h space: the
 * longer `wide` table when the space is wide enough for it to win.
 */
function pickShape(w, h) {
  if (!w || !h) return "full";
  const felt = (key) => {
    const g = KHUZUR_GEOMETRY[key];
    const scale = Math.min(w / g.width, h / g.height);
    return scale * scale * (g.felt.x1 - g.felt.x0) * (g.felt.y1 - g.felt.y0);
  };
  // Plates keep their size: shrunk too far, the wide table's three top seats would touch.
  const wideScale = Math.min(w / KHUZUR_GEOMETRY.wide.width, h / KHUZUR_GEOMETRY.wide.height);
  return wideScale >= 0.6 && felt("wide") > felt("full") * 1.08 ? "wide" : "full";
}
/** Marks the dead pile's card box, where swept stacks fly to (see CardFlights). */
const markDead = (el) => el?.setAttribute("data-kz-pile", "dead");

/**
 * The draw pile: a straight face-down stack with the trump card lying
 * sideways under it, sticking out to the right. Once the pile is gone the
 * trump lies there alone until someone draws it. count: the pile's cards and
 * the trump (it's drawn last, so it counts).
 */
function DrawPile({ count, trump, cw }) {
  const ch = Math.round(cw * CARD_RATIO);
  const pile = Math.max(0, count - (trump ? 1 : 0));
  const layers = Math.min(pile, 3);
  const peek = Math.round(ch * 0.42); // how far the trump sticks out
  return (
    // The caption hangs under the pile, out of the flow: the pile's own box is centred on its
    // spot, exactly where TrumpReveal lays the deck, so the handover doesn't jump.
    <div className="relative" aria-label={`DRAW pile: ${count}`}>
      <div className="relative" style={{ width: cw, height: ch }} data-kz-pile="draw">
        {count === 0 ? (
          <EmptySpot w={cw} h={ch}>
            EMPTY
          </EmptySpot>
        ) : (
          <>
            {trump && (
              <div
                data-testid="trump-card"
                data-kz-pile="trump"
                className="absolute left-1/2 top-1/2"
                style={{ transform: `translate(-50%, -50%) translate(${peek}px, 0) rotate(90deg)`, filter: "drop-shadow(0 0 8px rgba(244,196,48,0.45)) drop-shadow(2px 3px 0 rgba(10,7,18,0.5))" }}
                title={trump.joker ? "Trump card" : `Trump card: ${trump.rank}${trump.suit}`}
              >
                <PixelCard {...toPixelCardProps(trump)} width={cw} />
              </div>
            )}
            {Array.from({ length: layers }, (_, i) => (
              <div key={i} className="absolute inset-0" style={{ transform: `translate(${-i * 2}px, ${-i * 2}px)`, filter: "drop-shadow(2px 3px 0 rgba(10,7,18,0.5))" }}>
                <PixelCard faceDown width={cw} />
              </div>
            ))}
          </>
        )}
      </div>
      <div className="absolute left-1/2 font-pixel-display text-[8px] tracking-widest leading-none whitespace-nowrap" style={{ top: "100%", marginTop: 8, transform: "translateX(-50%)", color: "#5fd4d6" }}>
        {`DRAW ${count}`}
      </div>
    </div>
  );
}

/**
 * game: the engine state (its stack, piles and trump).
 * seats: { [position]: { plate: node (a KhuzurSeat), cards, out } } — not yours.
 * colorOf(seat): a seat's team colour. positionOfSeat(seat): where it sits.
 * dealing: the deal is on: the piles and the stack wait for it, each seat's
 * cards (seats[].cards) count up as they land.
 * label({ roomy }): the line under the stack; roomy: there's room for its
 * longer form (a big table). drawing: the draw for the deal is
 * on, so the piles and the stack stay hidden under it.
 * overlay({ cardWidth, spots, pileY, labelY, countBelow, pileW, drawSpot }):
 * drawn over the felt (the draw for the deal, the deal, the trump reveal);
 * drawSpot is the draw pile's centre, px from the felt's.
 * stackHidden: ids of stack cards still flying in from your hand.
 * dealerSeat / turnSeat: positions for the dealer button and the rim glow.
 * banner: drawn over everything (the YOUR TURN banner).
 * onShape(shape): told which shape the table took ("full", "wide" or
 * "compact"), so the page turns flown cards to match.
 * staged / onUnstage / onStagedMove / onStagedDrop / dropCol / targets: the
 * beat being placed (see StackColumns).
 */
export default function KhuzurTable({ layout = "full", game, seats = {}, colorOf, positionOfSeat, label = null, drawing = false, dealing = false, overlay, dealerSeat = null, turnSeat = null, banner = null, stackHidden = null, onShape, staged = null, onUnstage, onStagedMove, onStagedDrop, dropCol = null, targets = false }) {
  const spaceRef = useRef(null);
  const space = useBoxSize(spaceRef);
  const shape = layout === "compact" ? "compact" : pickShape(space.w, space.h);
  useEffect(() => onShape?.(shape), [shape, onShape]);
  const geo = KHUZUR_GEOMETRY[shape] ?? KHUZUR_GEOMETRY.full;
  const rootRef = useRef(null);
  const width = useElementWidth(rootRef);
  const scale = width ? clamp(width / geo.width, 0.5, 1.5) : 1;
  const size = Object.fromEntries(Object.entries(geo.sizes).map(([k, v]) => [k, Math.round(v * scale)]));
  const ratio = geo.width / geo.height;
  const feltW = geo.felt.x1 - geo.felt.x0;
  const feltH = geo.felt.y1 - geo.felt.y0;
  const cx = (geo.felt.x0 + geo.felt.x1) / 2;
  const cy = (geo.felt.y0 + geo.felt.y1) / 2;
  const fromCentre = ({ x, y }, [ox, oy] = [cx, cy]) => [Math.round((x - ox) * scale), Math.round((y - oy) * scale)];

  // The stack fits its box: narrower cards for more columns, a second row for a lead of 5 or 7.
  // However many layers land, the pile keeps its size (see StackColumns), so a beat never
  // shrinks or moves the cards.
  const layers = game.stack?.layers ?? [];
  const columns = layers[0]?.length ?? 1;
  const rows = stackRows(columns);
  const perRow = rows[0].length;
  const boxW = geo.stackBox[0] * feltW * scale;
  const boxH = geo.stackBox[1] * feltH * scale;
  const fitW = (boxW - (perRow - 1) * Math.max(6, size.stack * 0.16)) / perRow;
  const fitH = (boxH - (rows.length - 1) * 6) / (rows.length * CARD_RATIO * (1 + STACK_PEEK * stackPeeks(columns)));
  const stackW = Math.max(22, Math.floor(Math.min(size.stack, fitW, fitH)));
  const stackAt = [geo.felt.x0 + geo.stackAt[0] * feltW, geo.felt.y0 + geo.stackAt[1] * feltH];
  const entry = Object.fromEntries(KHUZUR_SEAT_NAMES.map((s) => [s, fromCentre(stadiumPoint(geo.felt, geo.seats[s].t, 10), stackAt)]));
  const fromOf = (seat) => entry[positionOfSeat(seat)] ?? entry.bottom;

  // The draw for the deal: where each seat's card lies, px from the felt's centre.
  const spots = Object.fromEntries(
    KHUZUR_SEAT_NAMES.map((s) => [s, geo.drawSpots ? geo.drawSpots[s].map((v) => Math.round(v * scale)) : fromCentre(stadiumPoint(geo.felt, geo.seats[s].t, geo.seats[s].draw))]),
  );
  // On a big table the pile is a little smaller, its caption under it, every drawn card round it.
  const drawCw = geo.drawSpots ? Math.round(size.stack * 0.85) : size.stack;
  const drawLayout =
    layout === "compact"
      ? { pileY: 0, labelY: -Math.round((feltH * scale) / 2 - 44 * scale), countBelow: true }
      : { pileY: -Math.round(8 * scale), labelY: Math.round(-8 * scale + drawCw * CARD_RATIO * 0.5 + 20) };
  const feltBox = {
    left: `${(geo.felt.x0 / geo.width) * 100}%`,
    top: `${(geo.felt.y0 / geo.height) * 100}%`,
    width: `${(feltW / geo.width) * 100}%`,
    height: `${(feltH / geo.height) * 100}%`,
  };

  return (
    <div className="relative w-full h-full" style={{ minHeight: geo.minHeight }}>
      <div ref={spaceRef} className="absolute" style={{ inset: "14px 0 6px", containerType: "size" }}>
        <div
          ref={rootRef}
          data-khuzur-table
          data-layout={layout}
          className="absolute left-1/2 top-1/2"
          style={{ width: `min(100cqw, calc(100cqh * ${ratio}))`, height: `min(100cqh, calc(100cqw / ${ratio}))`, transform: "translate(-50%, -50%)" }}
        >
          <Felt geo={geo} turnSeat={turnSeat} />

          {!drawing && !dealing && (
            <>
              <Spot geo={geo} at={geo.drawAt}>
                <DrawPile count={game.drawPile.length + (game.trumpCard ? 1 : 0)} trump={game.trumpCard} cw={size.pile} />
              </Spot>
              <Spot geo={geo} at={geo.deadAt} className="kz-fade">
                <Pile label="DEAD" count={game.deadPile.length} cw={size.pile} dead boxRef={markDead} />
              </Spot>
              <Spot geo={geo} at={geo.stackAt} z="z-[14]" className="kz-fade">
                {layers.length ? (
                  <StackColumns
                    layers={layers}
                    owners={game.stack.owners}
                    cardW={stackW}
                    colorOf={colorOf}
                    fromOf={fromOf}
                    hidden={stackHidden}
                    staged={staged}
                    stagedColor={staged ? colorOf(game.turn) : null}
                    onUnstage={onUnstage}
                    onStagedMove={onStagedMove}
                    onStagedDrop={onStagedDrop}
                    dropCol={dropCol}
                    targets={targets}
                  />
                ) : (
                  <EmptySpot w={size.stack} h={Math.round(size.stack * CARD_RATIO)}>
                    LEAD
                  </EmptySpot>
                )}
              </Spot>
              {label && (
                <Spot geo={geo} at={geo.labelAt} z="z-[13]" className="kz-fade">
                  {label({ roomy: layout === "full" && scale * geo.width >= ROOMY_PX })}
                </Spot>
              )}
            </>
          )}

          {KHUZUR_SEAT_NAMES.map((name) => {
            const s = seats[name];
            const at = geo.seats[name];
            if (!s || name === "bottom") return null;
            return (
              <React.Fragment key={name}>
                {at.fan ? (
                  !drawing && (
                    <div className="absolute z-[16]" style={{ ...fractionOf(geo, stadiumPoint(geo.felt, at.t, at.fan)), transform: "translate(-50%, -50%)" }}>
                      <KhuzurFan seat={name} count={s.cards} cardW={size.fan} turn={turnAt(geo, at.t)} hidden={s.out || !s.cards} />
                    </div>
                  )
                ) : (
                  // No cards shown in front of the seat: dealt and drawn cards fly to the rim by its plate.
                  <div data-deal-seat={name} data-card-w={size.fan} className="absolute w-px h-px" style={fractionOf(geo, stadiumPoint(geo.felt, at.t, 14))} />
                )}
                <div className="absolute z-[25]" style={plateAt(geo, at.t, width)}>
                  {s.plate}
                </div>
              </React.Fragment>
            );
          })}
          {dealerSeat && <DealerButton geo={geo} t={geo.seats[dealerSeat].t + geo.seats[dealerSeat].button} seat={dealerSeat} size={size.button} />}

          <div className="absolute z-30 pointer-events-none" style={feltBox}>
            {overlay?.({ cardWidth: size.stack, drawCw, spots, ...drawLayout, pileW: size.pile, drawSpot: [Math.round((geo.drawAt[0] - 0.5) * feltW * scale), Math.round((geo.drawAt[1] - 0.5) * feltH * scale)] })}
          </div>
          {banner}
        </div>
      </div>
    </div>
  );
}
