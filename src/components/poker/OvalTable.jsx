// OVAL TABLE — the poker felt and the seats around it, laid out like the
// tables in Thirteen and Muushig: everyone sits outside the felt. The other
// five sit clockwise from your left: two in a column on the left (1 lower,
// 2 upper), one above the felt (3), two in a column on the right (4 upper,
// 5 lower); your hand (`hero`) lies under the felt.
//
// On the felt: the five board cards in the middle, the pot above them as a
// pile of chips (side pots as extra tags) and the hand's result below; each
// player's bet this street as a chip stack at the edge in front of them (the
// blinds' marked SB / BB), and the dealer button beside the dealer's bet.
// The house's deck lies left of the board and the muck right of it: hands
// are shuffled and dealt from the middle, folded hands land on the muck (see
// TablePiles and cardMotion.js). Before the first hand a countdown stands
// over the board.
//
// The felt is sized from the room it gets, and your hand's box has a fixed
// height, so nothing on the table moves or resizes whatever is (or isn't)
// dealt. `layout`: "full"; "row" (short screens: slim plates); "strip"
// (phones: all five in a row above the felt).

import React, { useEffect, useRef, useState } from "react";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import ChipStack from "./ChipStack";
import { useBoardReveal, useDeal } from "./cardMotion";
import { Deck, Muck } from "./TablePiles";
import Countdown from "./Countdown";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The felt's width / height, and its largest width.
const ASPECT = { full: 1.75, row: 2.2 };
const MAX_FELT_W = 980;
// A side column: the plate plus its cards hanging toward the felt.
const COL_W = { full: 206, row: 190 };
const GAP = 28; // between a column and the felt's rim
// The top seat's plate, and the room from it to the felt (its cards hang beside it).
const TOP_H = { full: 81, row: 54 };
const TOP_GAP = { full: 30, row: 10 };
const COLUMN_H = 2 * 165 + 40; // two tall plates and the room between
// Each seat's bet at the felt's edge in front of it, and the dealer button
// beside it: [x%, y%] of the felt, by seat relative to you (0 = you).
const BET_AT = { 0: [50, 84], 1: [13, 66], 2: [13, 34], 3: [50, 15], 4: [87, 34], 5: [87, 66] };
const DEALER_AT = { 0: [61, 86], 1: [16, 80], 2: [16, 20], 3: [62, 13], 4: [84, 20], 5: [84, 80] };
// On a phone the five sit above the felt.
// The side bets and buttons keep clear of the deck and the muck either side of the board.
const STRIP_BET_AT = { 0: [50, 84], 1: [18, 67], 2: [22, 22], 3: [50, 12], 4: [78, 22], 5: [82, 67] };
const STRIP_DEALER_AT = { 0: [64, 86], 1: [13, 34], 2: [30, 13], 3: [64, 12], 4: [70, 13], 5: [87, 34] };

const pct = ([x, y]) => ({ left: `${x}%`, top: `${y}%` });

/** The dealer button: a white pixel disc marked D. */
function DealerButton({ at, seat }) {
  return (
    <div
      data-testid="dealer-button"
      data-seat={seat}
      title="Dealer"
      className="absolute z-[5] flex items-center justify-center font-pixel-display text-[11px] leading-none"
      style={{
        ...pct(at),
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

/** One seat's bet: a chip stack centred on its spot. */
function Bet({ at, bet }) {
  return (
    <div className="absolute z-[5]" style={{ ...pct(at), transform: "translate(-50%, -50%)" }}>
      <ChipStack amount={bet.amount} label={bet.label} />
    </div>
  );
}

/**
 * A hand's result under the board: for each winner the hand's rank as a big
 * gold label, what it was made of, and who won how much. On a shallow felt,
 * one line each.
 */
function Result({ winners, cardWidth, shallow }) {
  return (
    <div className="result-pop flex items-start justify-center gap-6" aria-label="Result">
      {winners.map((w) =>
        shallow ? (
          <div key={w.name} className="flex items-center gap-2 whitespace-nowrap">
            {w.label && <ResultLabel label={w.label} size={8} />}
            <span className="font-pixel-display text-[9px]" style={{ color: "#ead8b1", textShadow: "2px 2px 0 #0a0712" }}>{`${w.name} wins ${w.amount}`}</span>
          </div>
        ) : (
          <div key={w.name} className="flex flex-col items-center gap-1.5">
            {w.label && <ResultLabel label={w.label} size={cardWidth >= 60 ? 16 : 8} />}
            {w.detail && (
              <div className="font-pixel-body text-[20px] leading-none whitespace-nowrap" style={{ color: "#ead8b1", textShadow: "2px 2px 0 #0a0712" }}>
                {w.detail}
              </div>
            )}
            <div className="font-pixel-display text-[10px] whitespace-nowrap" style={{ color: "#9bd14f", textShadow: "2px 2px 0 #0a0712" }}>{`${w.name} wins ${w.amount}`}</div>
          </div>
        ),
      )}
    </div>
  );
}

// The pixel font is only crisp at multiples of 8px, and takes no shadow:
// dark letters on gold read cleanly.
function ResultLabel({ label, size }) {
  return (
    <div
      className="font-pixel-display leading-none whitespace-nowrap"
      style={{
        fontSize: size,
        padding: size >= 16 ? "8px 12px" : "4px 6px",
        textShadow: "none",
        backgroundColor: "#f4c430",
        color: "#1a1024",
        boxShadow: "0 0 0 3px #0a0712, 3px 3px 0 3px #0a0712, 0 0 22px rgba(244,196,48,0.55)",
      }}
    >
      {label}
    </div>
  );
}

/**
 * The middle of the felt: the pot over the board, the result under it, the
 * deck left of it and the muck right of it. None of them moves the board.
 * result: the hand's winners (see Result), shown instead of the banner.
 * countdown: when the first hand deals (a Date.now() time), shown over the board.
 */
function Center({ board, best, pots, banner, result = null, cardWidth, muck = 0, countdown = null, shallow = false }) {
  const total = pots.reduce((a, p) => a + p.amount, 0);
  const boardRef = useRef(null);
  useBoardReveal(boardRef, board.length);
  const pileW = Math.max(16, Math.round(cardWidth * 0.62));
  const side = Math.max(8, Math.round(cardWidth * 0.18));
  return (
    <div className="absolute left-1/2 top-1/2" style={{ transform: "translate(-50%, -50%)" }}>
      <div className="absolute top-1/2 right-full z-20" style={{ marginRight: side, transform: "translateY(-50%)" }}>
        <Deck cardWidth={pileW} />
      </div>
      <div className="absolute top-1/2 left-full z-[15]" style={{ marginLeft: side, transform: "translateY(-50%)" }}>
        <Muck count={muck} cardWidth={pileW} />
      </div>
      <div className="absolute left-1/2 bottom-full flex items-end gap-2 w-max" style={{ marginBottom: shallow ? 4 : 12, transform: "translateX(-50%)" }} aria-label="Pot">
        {total > 0 && <ChipStack amount={total} label="POT" big testId="pot" />}
        {pots.length > 1 &&
          pots.slice(1).map((p, i) => (
            <span key={i} className="font-pixel-display text-[9px] px-1.5 py-1" style={{ backgroundColor: "#0a0712", color: "#ead8b1", boxShadow: "0 0 0 2px #1a3a2c" }}>
              SIDE {p.amount}
            </span>
          ))}
      </div>
      <div ref={boardRef} className="flex gap-1.5" aria-label="Board" data-board>
        {Array.from({ length: 5 }, (_, i) =>
          board[i] ? (
            <PixelCard
              key={board[i].id}
              rank={board[i].rank}
              suit={board[i].suit}
              width={cardWidth}
              style={{ boxShadow: best.includes(board[i].id) ? "0 0 0 3px #9bd14f" : undefined }}
            />
          ) : (
            <div key={i} style={{ width: cardWidth, height: Math.round(cardWidth * CARD_RATIO), border: "2px dashed rgba(155,209,79,0.22)" }} />
          ),
        )}
      </div>
      <div
        className="absolute left-1/2 top-full mt-2.5 w-max max-w-[min(520px,80vw)] font-pixel-display text-[11px] leading-snug text-center"
        style={{ transform: "translateX(-50%)", color: "#ead8b1", textShadow: "2px 2px 0 #0a0712" }}
        role="status"
        aria-live="polite"
      >
        {countdown == null && (result?.length ? <Result winners={result} cardWidth={cardWidth} shallow={shallow} /> : banner)}
      </div>
      {countdown != null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" role="timer" aria-label="First hand">
          <Countdown endsAt={countdown}>
            {(n) => (
              <div
                className="flex flex-col items-center gap-2 px-5 py-3"
                style={{ backgroundColor: "rgba(10,7,18,0.85)", border: "3px solid #1f1a3d", boxShadow: "0 0 0 3px #0a0712, 4px 4px 0 3px #0a0712" }}
              >
                <div className="font-pixel-display text-[10px] tracking-widest whitespace-nowrap" style={{ color: "#ead8b1" }}>
                  {n > 0 ? "FIRST HAND IN" : "SHUFFLE UP"}
                </div>
                {n > 0 && (
                  <div key={n} className="countdown-tick font-pixel-display leading-none" style={{ color: "#f4c430", fontSize: Math.max(20, Math.round(cardWidth * 0.5)), textShadow: "3px 3px 0 #0a0712" }}>
                    {n}
                  </div>
                )}
              </div>
            )}
          </Countdown>
        </div>
      )}
    </div>
  );
}

function Felt({ style, children }) {
  return (
    <div
      className="absolute"
      style={{
        ...style,
        borderRadius: "50% / 50%",
        background: "radial-gradient(ellipse at 50% 45%, #2c6650 0%, #1a4030 45%, #0e2418 80%, #061810 100%)",
        border: "6px solid #6b3a1f",
        boxShadow: "0 0 0 4px #0a0712, 0 0 0 12px #2a1810, 0 0 0 16px #0a0712, inset 0 0 0 8px #1a3a2c, inset 0 0 80px rgba(0,0,0,0.6)",
      }}
    >
      <div className="absolute pointer-events-none" style={{ inset: 14, borderRadius: "50% / 50%", border: "2px dashed rgba(155,209,79,0.18)" }} />
      {children}
    </div>
  );
}

/** The size of a box, kept current; re-attached when `key` swaps the box. */
function useBox(key) {
  const ref = useRef(null);
  const [box, setBox] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);
  return [ref, box];
}

/**
 * seat(rel, position): the seat node for 1..5; position is "left", "right" or
 *   "top" (strip: "top" for all).
 * bets: { 0..5: { amount, label } } (0 = yours; label "SB" / "BB").
 * dealer: { rel, seat } for the dealer button (rel as for seats), or null.
 * board: card objects; best: card ids to light up (the winning hand).
 * pots: [{ amount }] main pot first (shown above the board).
 * banner: a line under the board ("Waiting for players…").
 * result: once a hand is over, its winners: [{ name, amount, label, detail }]
 *   (label and detail null when nobody showed), shown under the board.
 * muck: cards folded this hand. countdown: when the first hand deals (a
 *   Date.now() time), counted down over the board; null for none.
 * deal: { key, order } to deal a new hand round the table (see useDeal), or
 *   null; onDealt(key) once its cards have landed.
 * hero: (cardWidth, cramped) => your hand, in a box under the felt sized for
 *   cards that wide; `cramped` on a short screen, where the box has no room to spare.
 * cardWidth: the board's cards on a phone (elsewhere the felt sizes them).
 * heroWidth: your cards' width.
 * children: drawn over the felt (the YOUR TURN banner).
 */
export default function OvalTable({ layout = "full", seat, bets = {}, dealer = null, board = [], best = [], pots = [], banner = null, result = null, muck = 0, countdown = null, deal = null, onDealt, hero = null, cardWidth = 40, heroWidth = 100, children }) {
  const [ref, box] = useBox(layout);
  const tableRef = useRef(null);
  useDeal(tableRef, deal, onDealt);
  const placed = Object.entries(bets).filter(([, bet]) => bet?.amount > 0);
  const strip = layout === "strip";
  const row = layout === "row";
  const heroBox = (
    <div className="relative w-full shrink-0" style={{ height: Math.round(heroWidth * CARD_RATIO) + (row ? 8 : 22) }}>
      {hero?.(heroWidth, row)}
    </div>
  );

  if (strip) {
    return (
      <div ref={tableRef} data-poker-table className="flex-1 min-h-0 w-full flex flex-col">
        {/* Room over the row for the seats' chips and under it for their cards, so the felt never moves. */}
        <div className="flex justify-center gap-1.5 relative z-10" style={{ paddingTop: 12, paddingBottom: Math.round(30 * CARD_RATIO) + 8 }}>
          {[1, 2, 3, 4, 5].map((rel) => (
            <div key={rel}>{seat(rel, "top")}</div>
          ))}
        </div>
        <div className="relative flex-1 min-h-[200px] mt-3">
          <Felt style={{ inset: "4% 2%" }}>
            <Center board={board} best={best} pots={pots} banner={banner} result={result} cardWidth={cardWidth} muck={muck} countdown={countdown} />
            {placed.map(([rel, bet]) => (
              <Bet key={rel} at={STRIP_BET_AT[rel]} bet={bet} />
            ))}
            {dealer && <DealerButton at={STRIP_DEALER_AT[dealer.rel]} seat={dealer.seat} />}
            {children}
          </Felt>
        </div>
        <div className="mt-3">{heroBox}</div>
      </div>
    );
  }

  const aspect = ASPECT[layout] ?? ASPECT.full;
  const colW = COL_W[layout] ?? COL_W.full;
  const topGap = TOP_GAP[layout] ?? TOP_GAP.full;
  const topH = (TOP_H[layout] ?? TOP_H.full) + topGap;
  const feltW = box ? clamp(Math.min(box.w - 2 * (colW + GAP), (box.h - topH - (row ? 0 : 24)) * aspect, MAX_FELT_W), 200, MAX_FELT_W) : 0;
  const feltH = feltW / aspect;
  const boardW = clamp(Math.round(feltH * 0.19), row ? 28 : 34, 84);
  const colH = row ? topH + feltH : Math.max(topH + feltH, COLUMN_H);

  return (
    <div ref={tableRef} data-poker-table className="flex-1 min-h-0 w-full flex flex-col">
      <div ref={ref} className="flex-1 min-h-0 w-full flex items-center justify-center" style={{ gap: GAP }}>
        {box && (
          <>
            <div className="flex flex-col justify-around items-start shrink-0" style={{ width: colW, height: colH }}>
              {seat(2, "left")}
              {seat(1, "left")}
            </div>
            <div className="relative flex flex-col items-center shrink-0" style={{ gap: topGap }}>
              <div className="relative z-10">{seat(3, "top")}</div>
              <div className="relative" style={{ width: feltW, height: feltH }}>
                <Felt style={{ inset: 0 }}>
                  <Center board={board} best={best} pots={pots} banner={banner} result={result} cardWidth={boardW} muck={muck} countdown={countdown} shallow={row} />
                  {placed.map(([rel, bet]) => (
                    <Bet key={rel} at={BET_AT[rel]} bet={bet} />
                  ))}
                  {dealer && <DealerButton at={DEALER_AT[dealer.rel]} seat={dealer.seat} />}
                  {children}
                </Felt>
              </div>
            </div>
            <div className="flex flex-col justify-around items-end shrink-0" style={{ width: colW, height: colH }}>
              {seat(4, "right")}
              {seat(5, "right")}
            </div>
          </>
        )}
      </div>
      {heroBox}
    </div>
  );
}
