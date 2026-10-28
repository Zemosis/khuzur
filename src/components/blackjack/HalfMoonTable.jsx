// HALF-MOON TABLE — the casino blackjack table: a felt half-moon with an oak
// rim, flat edge at the top and the curve at the bottom. The hooded dealer
// sits above the flat edge, centred, with the dealer's cards and total just
// below it and the table's rules printed across the felt. On the flat edge
// the shoe is at screen right (the dealer's left, as in a casino) and the
// discard tray at screen left. The five players sit round the curve, their
// plates just off the felt outside the rim (on a phone, on the rim) and their
// betting circles on the felt just inside it, seat 0 ("first base") at
// screen right, so play goes right to left.
//
// The table keeps its shape whatever the space: a box of a fixed aspect ratio
// (sized with container units against the area it's given), everything in it
// placed by percentages. `layout` "compact" (phones under 640 px wide) is a
// taller box with smaller cards and plates. Under its minimum height (a
// phone on its side) the table keeps that height and its area scrolls.
//
// Cards and chips move as each view arrives (cardMotion.js), and what each
// player does pops over their plate (seatCallouts.js).

import React, { useRef } from "react";
import { PixelCard } from "../PixelCard";
import DealerPortrait from "./DealerPortrait";
import BlackjackSeat, { SeatPlate, TableCard } from "./BlackjackSeat";
import { SEAT_SIZE, dealerLine, dealerTag } from "./tableInfo";
import { useTableMotion } from "./cardMotion";
import { useSeatCallouts } from "./seatCallouts";
import { PHASES } from "../../utils/blackjack/engine";

// The rim's curve: the felt's bottom corners are rounded this far up its height.
const CURVE = 0.92;

/**
 * The seats round the rim, seat 0 first. For each angle (degrees from
 * straight down, positive toward screen right):
 * - circle: the betting circle's centre, `inset` inside the rim, square to
 *   it or, with `up` (0–1), leaning that far toward straight up so it sits
 *   over its plate
 * - plate: where the plate goes, `outset` outside the rim. `outside`: that
 *   point is the edge of the plate nearest the rim, so the plate sits off the
 *   felt; otherwise it's the plate's centre, kept `margin` % in from the
 *   table's sides.
 * - pull: how far to shift the plate off its point, [x, y] in halves of its
 *   size (0, 0: centred on it)
 * Points are [x%, y%] of the table; inset and outset fractions of its height.
 */
function rimSeats({ ratio, felt }, { angles, inset, outset, up, outside = false, margin = 0 }) {
  const a = ((1 - felt.left - felt.right) * ratio) / 2; // in table heights
  const h = 1 - felt.top - felt.bottom;
  const b = h * CURVE;
  const cx = felt.left * ratio + a;
  const cy = felt.top + h - b;
  return angles.map((deg) => {
    const t = (deg * Math.PI) / 180;
    const x = cx + a * Math.sin(t);
    const y = cy + b * Math.cos(t);
    // Straight out from the curve.
    const nx = Math.sin(t) / a;
    const ny = Math.cos(t) / b;
    const len = Math.hypot(nx, ny);
    const at = (d) => [((x + (nx / len) * d) / ratio) * 100, (y + (ny / len) * d) * 100];
    const [px, py] = at(outset);
    // The plate's edge in the rim's direction touches the point.
    const most = Math.max(Math.abs(nx), Math.abs(ny));
    const pull = outside ? [nx / most, ny / most] : [0, 0];
    const ix = (nx / len) * (1 - up);
    const iy = (ny / len) * (1 - up) + up;
    const ilen = Math.hypot(ix, iy);
    const circle = [((x - (ix / ilen) * inset) / ratio) * 100, (y - (iy / ilen) * inset) * 100];
    return { circle, plate: outside ? [px, py] : [Math.min(100 - margin, Math.max(margin, px)), py], pull };
  });
}

const pct = (f) => `${f * 100}%`;

// The full table is wider than its felt: the plates sit off it, round the rim.
const FULL = { ratio: 1100 / 540, felt: { left: 0.08, right: 0.08, top: 0.16, bottom: 0.13 } };
const COMPACT = { ratio: 380 / 600, felt: { left: 0.01, right: 0.01, top: 0.12, bottom: 0.08 } };

const GEOMETRY = {
  full: {
    ...FULL,
    minHeight: 460, // below it (phones on their side) the table scrolls rather than overlap
    portraitPx: 3,
    dealerTop: "18%",
    rulesTop: "37.5%",
    shuffleAt: { left: "50%", top: "46%" },
    shoe: { right: "25%", top: "17.5%" },
    tray: { left: "25%", top: "17.5%" },
    seats: rimSeats(FULL, { angles: [55, 28, 0, -28, -55], inset: 0.085, outset: 0.012, up: 0.75, outside: true }),
  },
  compact: {
    ...COMPACT,
    minHeight: 500,
    portraitPx: 2,
    dealerTop: "13.5%",
    rulesTop: "26%",
    shuffleAt: { left: "50%", top: "38%" },
    shoe: { right: "7%", top: "13.5%" },
    tray: { left: "7%", top: "14%" },
    seats: rimSeats(COMPACT, { angles: [70, 45, 0, -45, -70], inset: 0.11, outset: 0.01, up: 0, margin: 9.5 }),
  },
};

const BETWEEN_ROUNDS = new Set([PHASES.WAITING, PHASES.BETTING]);

/** dealAt(i): the place of the dealer's i-th card in the deal's order. */
function DealerHand({ view, cardW, dealAt }) {
  const tag = dealerTag(view);
  return (
    <div className="flex items-center gap-2" data-bj-dealer>
      <div className="flex gap-1.5" aria-label="Dealer's cards" style={{ minHeight: Math.round(cardW * 1.4375) }}>
        {view.dealer.cards.map((c, i) => (
          // Keyed by place, so the hole card turns over where it lies.
          <TableCard key={`dealer-${i}`} card={c} width={cardW} owner="dealer" deal={i < 2 ? dealAt(i) : null} data-bj-dealer-card={i} />
        ))}
      </div>
      {tag && (
        <span data-bj-tag="dealer">
          <span className="font-pixel-display text-[10px] leading-none px-1.5 py-1 whitespace-nowrap" style={{ backgroundColor: tag.bg, color: tag.fg, boxShadow: "0 0 0 2px #0a0712" }}>
            {tag.label}
          </span>
        </span>
      )}
    </div>
  );
}

/** The wooden holder the shoe and the tray share, cardW wide cards in it. */
function Holder({ cardW, label, children, ...rest }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative flex justify-center"
        style={{ width: cardW + 16, height: Math.round(cardW * 1.4375) + 18, backgroundColor: "#6b3a1f", border: "3px solid #0a0712", boxShadow: "3px 3px 0 #0a0712, inset 0 -6px 0 #4a2812", paddingTop: 8 }}
        {...rest}
      >
        {children}
      </div>
      {label && <span className="font-pixel-body text-[18px] leading-none text-bone/60">{label}</span>}
    </div>
  );
}

/** The shoe, with the deck in it the deal comes from (and a new shoe is shuffled on the felt). */
function Shoe({ cardW, compact }) {
  return (
    <Holder cardW={cardW} label={!compact && "SHOE"} data-bj-shoe>
      <div data-bj-deck className="relative z-10" style={{ width: cardW, height: Math.round(cardW * 1.4375) }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} data-deck-layer className="absolute left-0" style={{ top: -i, zIndex: i }}>
            <PixelCard faceDown width={cardW} />
          </div>
        ))}
      </div>
    </Holder>
  );
}

/** The discard tray: a card back on the pile per couple of dozen cards gone from the shoe. */
function Tray({ discarded, cardW, compact }) {
  const pile = Math.min(8, Math.ceil(Math.max(0, discarded) / 26));
  return (
    <Holder cardW={cardW} label={!compact && "DISCARD"} data-bj-tray>
      <div className="relative" style={{ width: cardW, height: Math.round(cardW * 1.4375), border: pile ? "none" : "2px dashed rgba(234,216,177,0.3)" }}>
        {Array.from({ length: pile }, (_, i) => (
          <div key={i} className="absolute left-0" style={{ top: -i * 2, zIndex: i }}>
            <PixelCard faceDown width={cardW} />
          </div>
        ))}
      </div>
    </Holder>
  );
}

function RulesPrint({ compact }) {
  const lines = compact
    ? ["BLACKJACK PAYS 3 TO 2", "DEALER STANDS ON ALL 17s", "INSURANCE PAYS 2 TO 1"]
    : ["BLACKJACK PAYS 3 TO 2", "DEALER STANDS ON ALL 17s · INSURANCE PAYS 2 TO 1"];
  return (
    <div
      className={`text-center whitespace-nowrap pointer-events-none ${compact ? "font-pixel-body text-[18px] leading-[1.05]" : "font-pixel-display text-[10px] leading-[2] tracking-wider"}`}
      style={{ color: "rgba(234,216,177,0.5)" }}
    >
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

/**
 * view: the blackjack_state view. motion: a ref the table writes `busyUntil`
 * to (when its moves under way end), or none. mySeat: your seat (-1: none).
 * onSit(seat): SIT on an empty seat. faceFor(seat): PixelAvatar props.
 * layout: "full" | "compact".
 */
export default function HalfMoonTable({ view, motion = null, mySeat, onSit, layout = "full", faceFor = () => null }) {
  const geo = GEOMETRY[layout] ?? GEOMETRY.full;
  const compact = layout === "compact";
  const size = SEAT_SIZE[layout] ?? SEAT_SIZE.full;
  const mine = view.seats[mySeat] ?? null;
  const canSit = !!mine && BETWEEN_ROUNDS.has(view.phase) && !(mine.bet > 0);
  const onTable = view.dealer.cards.length + view.seats.reduce((n, p) => n + (p?.hands ?? []).reduce((m, h) => m + h.cards.length, 0), 0);
  const centred = { left: "50%", transform: "translateX(-50%)" };
  const rootRef = useRef(null);
  const ownMotionRef = useRef({ busyUntil: 0 });
  useTableMotion(rootRef, view, motion ?? ownMotionRef);
  const [calloutFor, calloutDone] = useSeatCallouts(view);

  // The deal goes round twice, first base first and the dealer last.
  const dealing = view.seats.flatMap((p, i) => (p?.inRound ? [i] : []));
  const lap = dealing.length + 1;
  const dealerDealAt = (i) => i * lap + dealing.length;

  return (
    <div className="relative w-full h-full" style={{ containerType: "size", minHeight: geo.minHeight }}>
      <div
        ref={rootRef}
        className="absolute left-1/2 top-1/2"
        data-layout={layout}
        style={{
          width: `min(100cqw, calc(100cqh * ${geo.ratio}))`,
          height: `min(100cqh, calc(100cqw / ${geo.ratio}))`,
          transform: "translate(-50%, -50%)",
        }}
      >
        {/* The felt: flat top edge, curved bottom, oak rim. */}
        <div
          className="absolute"
          style={{
            left: pct(geo.felt.left),
            right: pct(geo.felt.right),
            top: pct(geo.felt.top),
            bottom: pct(geo.felt.bottom),
            backgroundColor: "#4a1a2c",
            border: `${compact ? 6 : 8}px solid #6b3a1f`,
            borderTopWidth: compact ? 8 : 10,
            borderRadius: `0 0 50% 50% / 0 0 ${CURVE * 100}% ${CURVE * 100}%`,
            boxShadow: "0 6px 0 #0a0712, inset 0 0 0 4px #2e0f1d",
          }}
        />

        <div className="absolute z-10" style={{ ...centred, top: 0 }}>
          <DealerPortrait px={geo.portraitPx} line={dealerLine(view)} />
        </div>
        <div className="absolute" style={{ ...geo.tray }}>
          <Tray discarded={(view.dealt ?? 0) - onTable} cardW={size.shoeCard} compact={compact} />
        </div>
        <div className="absolute z-30" style={{ ...geo.shoe }}>
          <Shoe cardW={size.shoeCard} compact={compact} />
        </div>
        <div className="absolute z-[15]" style={{ ...centred, top: geo.dealerTop }}>
          <DealerHand view={view} cardW={size.dealerCard} dealAt={dealerDealAt} />
        </div>
        <div className="absolute" style={{ ...centred, top: geo.rulesTop }}>
          <RulesPrint compact={compact} />
        </div>
        <div data-bj-shuffle className="absolute" style={{ ...geo.shuffleAt, width: 0, height: 0 }} />

        {geo.seats.map(({ circle: [x, y] }, seat) => {
          const player = view.seats[seat] ?? null;
          const k = dealing.indexOf(seat);
          return (
            <div key={seat} data-seat={seat} className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)", zIndex: 20 }}>
              <BlackjackSeat
                seat={seat}
                player={player}
                isMe={seat === mySeat}
                turnHand={view.phase === PHASES.TURNS && view.turn?.seat === seat ? view.turn.hand : null}
                phase={view.phase}
                dealer={view.dealer}
                dealAt={k < 0 ? null : (i) => i * lap + k}
                layout={layout}
                edge={seat === 0 ? "right" : seat === 4 ? "left" : null}
              />
            </div>
          );
        })}
        {geo.seats.map(({ plate: [x, y], pull: [px, py] }, seat) => {
          const player = view.seats[seat] ?? null;
          const shift = (k) => `calc(-50% + ${(k * 50).toFixed(1)}%)`;
          return (
            <div key={seat} data-plate={seat} className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: `translate(${shift(px)}, ${shift(py)})`, zIndex: 25 }}>
              <SeatPlate
                seat={seat}
                player={player}
                face={player ? faceFor(seat) : null}
                isMe={seat === mySeat}
                onTurn={view.phase === PHASES.TURNS && view.turn?.seat === seat}
                phase={view.phase}
                layout={layout}
                edge={seat === 0 ? "right" : seat === 4 ? "left" : null}
                xpLevel={view.levels?.[seat] ?? null}
                canSit={canSit}
                onSit={onSit}
                callout={player ? calloutFor(seat) : null}
                onCalloutDone={(id) => calloutDone(seat, id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
