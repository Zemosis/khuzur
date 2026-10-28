// HALF-MOON TABLE — the casino blackjack table: a felt half-moon with an oak
// rim, flat edge at the top and the curve at the bottom. The hooded dealer
// sits above the flat edge, centred, with the dealer's cards and total just
// below it and the table's rules printed across the felt. On the flat edge
// the shoe is at screen right (the dealer's left, as in a casino) and the
// discard tray at screen left. The five seats follow the curve, seat 0
// ("first base") at screen right, so play goes right to left.
//
// The table keeps its shape whatever the space: a box of a fixed aspect ratio
// (sized with container units against the area it's given), everything in it
// placed by percentages. `layout` "compact" (phones under 640 px wide) is a
// taller box with smaller cards and plates. Under its minimum height (a
// phone on its side) the table keeps that height and its area scrolls.

import React from "react";
import { PixelCard } from "../PixelCard";
import DealerPortrait from "./DealerPortrait";
import BlackjackSeat from "./BlackjackSeat";
import { SEAT_SIZE, dealerLine, dealerTag } from "./tableInfo";
import { PHASES } from "../../utils/blackjack/engine";

const GEOMETRY = {
  full: {
    ratio: 960 / 540,
    minHeight: 460, // below it (phones on their side) the table scrolls rather than overlap
    felt: { left: "2%", right: "2%", top: "16%", bottom: "8%" },
    portraitPx: 3,
    dealerTop: "19%",
    rulesTop: "31%",
    shoe: { right: "21%", top: "17.5%" },
    tray: { left: "24%", top: "18%" },
    // Each seat's betting circle centre (x%, y%), seat 0 first.
    seats: [
      [88, 61],
      [70.5, 71],
      [50, 75],
      [29.5, 71],
      [12, 61],
    ],
  },
  compact: {
    ratio: 380 / 600,
    minHeight: 500,
    felt: { left: "1%", right: "1%", top: "12%", bottom: "5%" },
    portraitPx: 2,
    dealerTop: "14%",
    rulesTop: "22%",
    shoe: { right: "7%", top: "13.5%" },
    tray: { left: "7%", top: "14%" },
    seats: [
      [89, 50],
      [70, 65],
      [50, 77],
      [30, 65],
      [11, 50],
    ],
  },
};

const BETWEEN_ROUNDS = new Set([PHASES.WAITING, PHASES.BETTING]);

function DealerHand({ view, cardW }) {
  const tag = dealerTag(view);
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1" aria-label="Dealer's cards">
        {view.dealer.cards.map((c, i) =>
          c ? <PixelCard key={c.id ?? i} rank={c.rank} suit={c.suit} width={cardW} /> : <PixelCard key={`hole-${i}`} faceDown width={cardW} />,
        )}
      </div>
      {tag && (
        <span className="font-pixel-display text-[9px] leading-none px-1.5 py-1 whitespace-nowrap" style={{ backgroundColor: tag.bg, color: tag.fg, boxShadow: "0 0 0 2px #0a0712" }}>
          {tag.label}
        </span>
      )}
    </div>
  );
}

function Shoe({ compact }) {
  const w = compact ? 34 : 50;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex justify-center" style={{ width: w, height: Math.round(w * 1.3), backgroundColor: "#6b3a1f", border: "3px solid #0a0712", boxShadow: "3px 3px 0 #0a0712", paddingTop: 5 }}>
        <PixelCard faceDown width={w - 16} />
      </div>
      {!compact && <span className="font-pixel-body text-[18px] leading-none text-bone/60">SHOE</span>}
    </div>
  );
}

/** The discard tray: a sliver per few dozen cards gone from the shoe. */
function Tray({ discarded, compact }) {
  const slivers = Math.min(8, Math.ceil(Math.max(0, discarded) / 26));
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-[3px] p-[3px]" style={{ width: compact ? 40 : 60, height: compact ? 20 : 26, backgroundColor: "#2e0f1d", border: "3px solid #0a0712" }}>
        {Array.from({ length: slivers }, (_, i) => (
          <i key={i} className="block h-full" style={{ width: compact ? 3 : 4, backgroundColor: "#ead8b1", boxShadow: "1px 0 0 #c8b890" }} />
        ))}
      </div>
      {!compact && <span className="font-pixel-body text-[18px] leading-none text-bone/60">DISCARD</span>}
    </div>
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
 * view: the blackjack_state view. mySeat: your seat (-1: none).
 * onSit(seat): SIT on an empty seat. faceFor(seat): PixelAvatar props.
 * layout: "full" | "compact".
 */
export default function HalfMoonTable({ view, mySeat, onSit, layout = "full", faceFor = () => null }) {
  const geo = GEOMETRY[layout] ?? GEOMETRY.full;
  const compact = layout === "compact";
  const mine = view.seats[mySeat] ?? null;
  const canSit = !!mine && BETWEEN_ROUNDS.has(view.phase) && !(mine.bet > 0);
  const onTable = view.dealer.cards.length + view.seats.reduce((n, p) => n + (p?.hands ?? []).reduce((m, h) => m + h.cards.length, 0), 0);
  const centred = { left: "50%", transform: "translateX(-50%)" };

  return (
    <div className="relative w-full h-full" style={{ containerType: "size", minHeight: geo.minHeight }}>
      <div
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
            ...geo.felt,
            backgroundColor: "#4a1a2c",
            border: `${compact ? 6 : 8}px solid #6b3a1f`,
            borderTopWidth: compact ? 8 : 10,
            borderRadius: "0 0 50% 50% / 0 0 92% 92%",
            boxShadow: "0 6px 0 #0a0712, inset 0 0 0 4px #2e0f1d",
          }}
        />

        <div className="absolute z-10" style={{ ...centred, top: 0 }}>
          <DealerPortrait px={geo.portraitPx} line={dealerLine(view)} />
        </div>
        <div className="absolute" style={{ ...geo.tray }}>
          <Tray discarded={(view.dealt ?? 0) - onTable} compact={compact} />
        </div>
        <div className="absolute" style={{ ...geo.shoe }}>
          <Shoe compact={compact} />
        </div>
        <div className="absolute" style={{ ...centred, top: geo.dealerTop }}>
          <DealerHand view={view} cardW={SEAT_SIZE[layout]?.card ?? SEAT_SIZE.full.card} />
        </div>
        <div className="absolute" style={{ ...centred, top: geo.rulesTop }}>
          <RulesPrint compact={compact} />
        </div>

        {geo.seats.map(([x, y], seat) => {
          const player = view.seats[seat] ?? null;
          return (
            <div key={seat} data-seat={seat} className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)", zIndex: 20 }}>
              <BlackjackSeat
                seat={seat}
                player={player}
                face={player ? faceFor(seat) : null}
                isMe={seat === mySeat}
                turnHand={view.phase === PHASES.TURNS && view.turn?.seat === seat ? view.turn.hand : null}
                phase={view.phase}
                layout={layout}
                edge={seat === 0 ? "right" : seat === 4 ? "left" : null}
                xpLevel={view.levels?.[seat] ?? null}
                canSit={canSit}
                onSit={onSit}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
