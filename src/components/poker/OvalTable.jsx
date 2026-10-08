// OVAL TABLE — the poker felt: a wide green oval with a wooden rim, the five
// board cards in the middle, the pot above them as a pile of chips (side pots
// as extra tags) and the hand's result below; the other five seats around the
// rim, each player's bet this street as a chip stack between their seat and
// the middle (the blinds' marked SB / BB), and the dealer button in front of
// the dealer.
//
// Seats are placed relative to you: 0 is you (your area sits below the
// table, outside this component), then 1–5 clockwise from your left. On a
// phone (`layout` "strip") the five sit in a row above a smaller oval.

import React from "react";
import { PixelCard } from "../PixelCard";
import ChipStack from "./ChipStack";

// [x%, y%] of the container, by seat relative to you (1–5).
const SEAT_AT = {
  full: { 1: [9, 74], 2: [12, 16], 3: [50, 2], 4: [88, 16], 5: [91, 74] },
  row: { 1: [7, 66], 2: [9, 14], 3: [50, 2], 4: [91, 14], 5: [93, 66] },
};
// Where each seat's bet sits on the felt (0 = yours, at the bottom edge), and
// the dealer button beside it.
const BET_AT = { 0: [50, 82], 1: [24, 64], 2: [27, 32], 3: [50, 22], 4: [73, 32], 5: [76, 64] };
const DEALER_AT = { 0: [62, 84], 1: [16, 56], 2: [17, 38], 3: [62, 16], 4: [83, 38], 5: [84, 56] };

/** The dealer button: a white pixel disc marked D. */
function DealerButton({ rel, seat }) {
  const [x, y] = DEALER_AT[rel];
  return (
    <div
      data-testid="dealer-button"
      data-seat={seat}
      title="Dealer"
      className="absolute flex items-center justify-center font-pixel-display text-[11px] leading-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: 26,
        height: 26,
        transform: "translate(-50%, -50%)",
        transition: "left 400ms ease-in-out, top 400ms ease-in-out",
        backgroundColor: "#ead8b1",
        color: "#1a1024",
        clipPath: "polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)",
        boxShadow: "inset 0 -4px 0 #a89870",
      }}
    >
      D
    </div>
  );
}

/**
 * seats: { 1..5: node } placed around the rim. bets: { 0..5: { amount, label } } (0 = yours; label "SB" / "BB").
 * dealer: { rel, seat } for the dealer button (rel as for seats), or null.
 * board: card objects. pots: [{ amount }] main pot first (shown above the board).
 * banner: a line under the board (the hand's result, "Waiting for players…").
 */
export default function OvalTable({ layout = "full", seats = {}, bets = {}, dealer = null, board = [], pots = [], banner = null, cardWidth = 56, children }) {
  const strip = layout === "strip";
  const at = SEAT_AT[layout] || SEAT_AT.full;
  const total = pots.reduce((a, p) => a + p.amount, 0);

  const felt = (
    <div
      className="absolute"
      style={{
        inset: strip ? "4% 2%" : layout === "row" ? "16% 13% 8%" : "18% 14% 10%",
        borderRadius: "50% / 50%",
        background: "radial-gradient(ellipse at 50% 45%, #2c6650 0%, #1a4030 45%, #0e2418 80%, #061810 100%)",
        border: "6px solid #6b3a1f",
        boxShadow: "0 0 0 4px #0a0712, 0 0 0 12px #2a1810, 0 0 0 16px #0a0712, inset 0 0 0 8px #1a3a2c, inset 0 0 80px rgba(0,0,0,0.6)",
      }}
    >
      <div className="absolute pointer-events-none" style={{ inset: 14, borderRadius: "50% / 50%", border: "2px dashed rgba(155,209,79,0.18)" }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-2 min-h-[22px]" aria-label="Pot">
          {total > 0 && <ChipStack amount={total} label="POT" big testId="pot" />}
          {pots.length > 1 &&
            pots.slice(1).map((p, i) => (
              <span key={i} className="font-pixel-display text-[9px] px-1.5 py-1" style={{ backgroundColor: "#0a0712", color: "#ead8b1", boxShadow: "0 0 0 2px #1a3a2c" }}>
                SIDE {p.amount}
              </span>
            ))}
        </div>
        <div className="flex gap-1.5" aria-label="Board">
          {Array.from({ length: 5 }, (_, i) =>
            board[i] ? (
              <PixelCard key={board[i].id} rank={board[i].rank} suit={board[i].suit} width={cardWidth} />
            ) : (
              <div key={i} style={{ width: cardWidth, height: Math.round(cardWidth * 1.4375), border: "2px dashed rgba(155,209,79,0.25)" }} />
            ),
          )}
        </div>
        <div className="min-h-[24px] font-pixel-display text-[11px] text-center px-2" style={{ color: "#ead8b1" }} role="status" aria-live="polite">
          {banner}
        </div>
      </div>
      {Object.entries(bets).map(
        ([rel, bet]) =>
          bet?.amount > 0 && (
            <div key={rel} className="absolute" style={{ left: `${BET_AT[rel][0]}%`, top: `${BET_AT[rel][1]}%`, transform: "translate(-50%, -50%)", transition: "all 300ms" }}>
              <ChipStack amount={bet.amount} label={bet.label} />
            </div>
          ),
      )}
      {dealer && <DealerButton rel={dealer.rel} seat={dealer.seat} />}
      {children}
    </div>
  );

  if (strip) {
    return (
      <div className="flex-1 min-h-0 w-full flex flex-col">
        <div className="flex justify-center gap-1.5 relative z-10">
          {[1, 2, 3, 4, 5].map((rel) => (
            <div key={rel}>{seats[rel]}</div>
          ))}
        </div>
        <div className="relative flex-1 min-h-[220px] mt-6">{felt}</div>
      </div>
    );
  }
  return (
    <div className="relative flex-1 min-h-0 w-full">
      {felt}
      {[1, 2, 3, 4, 5].map((rel) => (
        <div key={rel} className="absolute z-10" style={{ left: `${at[rel][0]}%`, top: `${at[rel][1]}%`, transform: "translate(-50%, 0)" }}>
          {seats[rel]}
        </div>
      ))}
    </div>
  );
}
