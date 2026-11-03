// OVAL TABLE — the poker table, built like Blackjack's: the hooded dealer above
// the felt with what they call in a bubble, the players' plates just off the
// rim, their cards and betting circles on the felt in front of them. It's the
// shape of a card room table (tableShape.js): straight sides and round ends,
// with a curve cut into the top edge for the dealer. Green felt, oak rim.
//
// Seven seats, mirrored: you at the foot, the other six clockwise from your
// left, three up each side, the dealer between them at the head. On the felt:
// the board in the middle, the pot over it, the deck to the dealer's left and
// the muck to their right (see TablePiles). The dealer button travels round a
// track on the felt, always clockwise. Before the first hand a countdown
// stands over the board.
//
// Everything moves the way a dealer would move it (cardMotion.js): a hand's
// cards are swept to the muck and back into the deck, which is riffled and
// dealt round the table; the board comes off the deck face down and turns
// over; chips fly from a plate to its circle, into the pot at the end of a
// street, and from the pot to whoever won it.
//
// The table keeps its shape whatever the space: a box of a fixed aspect ratio,
// everything in it placed by percentages, and cards, chips and circles scaled
// to its width, so nothing runs into anything on a smaller screen. `layout`
// "compact" (phones under 640 px wide) stands the table up. Under its minimum
// height (a phone on its side) the table keeps that height and its area scrolls.

import React, { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { useElementWidth } from "../../hooks/useElementWidth";
import { reducedMotion } from "../../utils/motion";
import DealerPortrait from "../blackjack/DealerPortrait";
import ChipStack from "./ChipStack";
import { useBoardReveal, useChipMotion, useDeal } from "./cardMotion";
import { Deck, Muck } from "./TablePiles";
import Countdown from "./Countdown";
import { nextLap, stadiumPath, stadiumPoint } from "./tableShape";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (f) => `${f * 100}%`;

// Each table in its own units: its size, the felt, and by seat relative to you
// (0 = you): how far round the rim it sits (t, see tableShape), how far in its
// cards lie and where its betting circle is ([t, inset]). The seats mirror each
// other across the table: three up each side, you at the foot with your circle
// straight in front of you. button: how far past a seat's t the dealer button
// sits (unless the seat says otherwise: the right side's mirror the left's,
// sitting before their seat), on a track `track` in from the rim; it still
// always travels clockwise.
// deckAt / muckAt / potAt / boardAt / printAt: where those lie, as fractions of
// the table. Sizes are px on a table this wide, and scale with it; plateW
// doesn't, its words being a fixed size.
const GEOMETRY = {
  full: {
    width: 1100,
    height: 540,
    felt: { x0: 150, y0: 92, x1: 950, y1: 468 },
    notch: { half: 92, depth: 24 },
    minHeight: 460,
    portraitPx: 3,
    outside: true,
    plateW: 156,
    seats: [
      { t: 0, cards: 120, bet: [0, 40], button: 0.06 },
      { t: 0.15, cards: 58, bet: [0.122, 122] },
      { t: 0.25, cards: 54, bet: [0.25, 122], button: 0.045 },
      { t: 0.35, cards: 58, bet: [0.378, 122], button: 0.046 },
      { t: 0.65, cards: 58, bet: [0.622, 122], button: -0.046 },
      { t: 0.75, cards: 54, bet: [0.75, 122], button: -0.045 },
      { t: 0.85, cards: 58, bet: [0.878, 122], button: -0.03 },
    ],
    button: 0.03,
    track: 34,
    deckAt: [0.61, 0.262],
    muckAt: [0.39, 0.262],
    potAt: 0.348,
    printAt: 0.275,
    boardAt: 0.43,
    sizes: { seatCard: 46, heroCard: 60, boardCard: 58, pileCard: 40, circle: 58, button: 30, chip: 16 },
  },
  compact: {
    width: 380,
    height: 640,
    felt: { x0: 46, y0: 74, x1: 334, y1: 596 },
    notch: null,
    minHeight: 500,
    portraitPx: 2,
    outside: false,
    plateW: 66,
    seats: [
      { t: 0, cards: 150, bet: [0, 96], button: 0.07 },
      { t: 0.125, cards: 58, bet: [0.17, 104], button: 0.058 },
      { t: 0.22, cards: 58, bet: [0.205, 104] },
      { t: 0.345, cards: 50, bet: [0.33, 96] },
      { t: 0.655, cards: 50, bet: [0.67, 96] },
      { t: 0.78, cards: 58, bet: [0.795, 104] },
      { t: 0.875, cards: 58, bet: [0.83, 104], button: -0.058 },
    ],
    button: 0.035,
    track: 40,
    deckAt: [0.6, 0.17],
    muckAt: [0.4, 0.17],
    potAt: 0.3,
    printAt: 0.222,
    boardAt: 0.445,
    sizes: { seatCard: 24, heroCard: 42, boardCard: 46, pileCard: 22, circle: 36, button: 22, chip: 10 },
  },
};

/** A point of the table as a fraction of its width and height. */
const fractionOf = (geo, { x, y }) => ({ left: pct(x / geo.width), top: pct(y / geo.height) });

/**
 * Where a seat's plate goes: just off the rim (`outside`), else on it, and
 * never past the table's sides however narrow it gets. tableW: its width, px.
 */
function plateAt(geo, t, tableW) {
  const p = stadiumPoint(geo.felt, t, geo.outside ? -6 : 0);
  const most = Math.max(Math.abs(p.nx), Math.abs(p.ny));
  const [pullX, pullY] = geo.outside ? [p.nx / most, p.ny / most] : [0, 0];
  const shift = (k) => `calc(-50% + ${(k * 50).toFixed(1)}%)`;
  const base = fractionOf(geo, p);
  if (!tableW) return { ...base, transform: `translate(${shift(pullX)}, ${shift(pullY)})` };
  const half = geo.plateW / 2;
  const x = (p.x / geo.width) * tableW + pullX * half;
  return { ...base, left: clamp(x, half + 2, tableW - half - 2), transform: `translate(-50%, ${shift(pullY)})` };
}

/** The dealer button: a white pixel disc marked D, carried clockwise round the felt to its seat. */
function DealerButton({ geo, t, seat, size }) {
  const ref = useRef(null);
  const at = useRef(t);
  useLayoutEffect(() => {
    const el = ref.current;
    const place = (v) => Object.assign(el.style, fractionOf(geo, stadiumPoint(geo.felt, v, geo.track)));
    const to = nextLap(at.current, t);
    const step = { v: at.current };
    if (Math.abs(to - step.v) < 1e-6) return void place(to);
    place(step.v);
    const tween = gsap.to(step, { v: to, duration: reducedMotion() ? 0.05 : 0.7 + (to - step.v) * 0.8, ease: "power2.inOut", onUpdate: () => place(step.v), onComplete: () => (at.current = to) });
    return () => {
      at.current = step.v;
      tween.kill();
    };
  }, [geo, t]);
  return (
    <div
      ref={ref}
      data-testid="dealer-button"
      data-seat={seat}
      title="Dealer"
      className="absolute z-[18] flex items-center justify-center font-pixel-display leading-none"
      style={{
        ...fractionOf(geo, stadiumPoint(geo.felt, t, geo.track)),
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round((size * 0.4) / 2) * 2),
        transform: "translate(-50%, -50%)",
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

/** A deck or muck lying on the felt by the dealer, with its name printed under it. */
function Pile({ at: [x, y], label, z, children }) {
  return (
    <div className={`absolute ${z} flex flex-col items-center gap-1.5`} style={{ left: pct(x), top: pct(y), transform: "translate(-50%, -50%)" }}>
      <div style={{ filter: "drop-shadow(3px 4px 0 rgba(10,7,18,0.55))" }}>{children}</div>
      {label && <span className="font-pixel-display text-[8px] tracking-widest leading-none" style={{ color: "rgba(234,216,177,0.42)" }}>{label}</span>}
    </div>
  );
}

/** A seat's betting circle, printed on the felt, with its bet as a chip stack (data-bet-rel / data-amount, for the chips' motion). */
function BetCircle({ rel, at, bet, size, chip, active }) {
  return (
    <div className="absolute z-[12] flex items-center justify-center" data-bet-circle data-bet-rel={rel} data-amount={bet?.amount ?? 0} style={{ ...at, width: size, height: size, transform: "translate(-50%, -50%)" }}>
      <div className="absolute inset-0" style={{ borderRadius: "50%", border: active ? "3px solid #f4c430" : "3px dashed rgba(234,216,177,0.28)", boxShadow: active ? "0 0 14px rgba(244,196,48,0.5)" : "none" }} />
      {bet?.amount > 0 && <ChipStack amount={bet.amount} label={bet.label} chipSize={chip} />}
    </div>
  );
}

/**
 * A hand's result over the board: for each winner the hand's rank as a big
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

/** The first hand's countdown, over the board. */
function FirstHand({ endsAt, cardWidth }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" role="timer" aria-label="First hand">
      <Countdown endsAt={endsAt}>
        {(n) => (
          <div className="flex flex-col items-center gap-2 px-5 py-3" style={{ backgroundColor: "rgba(10,7,18,0.85)", border: "3px solid #1f1a3d", boxShadow: "0 0 0 3px #0a0712, 4px 4px 0 3px #0a0712" }}>
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
  );
}

/** The board's five places: cards as they come, dashed outlines until then. */
function Board({ board, best, cardWidth }) {
  const ref = useRef(null);
  useBoardReveal(ref, board.length);
  return (
    <div ref={ref} className="flex gap-1.5" aria-label="Board" data-board>
      {Array.from({ length: 5 }, (_, i) =>
        board[i] ? (
          <div key={board[i].id} className="relative" data-board-card>
            <PixelCard rank={board[i].rank} suit={board[i].suit} width={cardWidth} style={{ boxShadow: best.includes(board[i].id) ? "0 0 0 3px #9bd14f" : undefined }} />
          </div>
        ) : (
          <div key={i} style={{ width: cardWidth, height: Math.round(cardWidth * CARD_RATIO), border: "2px dashed rgba(234,216,177,0.2)" }} />
        ),
      )}
    </div>
  );
}

/** The felt and its rim, drawn in the table's own units; hard edges, for the pixel look. */
function Felt({ geo }) {
  const { felt, notch } = geo;
  const inner = notch && { ...notch, depth: notch.depth };
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${geo.width} ${geo.height}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden>
      <path d={stadiumPath(felt, notch, -3)} fill="#0a0712" transform="translate(0 7)" />
      <path d={stadiumPath(felt, notch, -3)} fill="#6b3a1f" />
      <path d={stadiumPath(felt, inner, 7)} fill="#0a3a2c" />
      <path d={stadiumPath(felt, inner, 11)} fill="#17604a" />
      <path d={stadiumPath(felt, null, geo.track + 15)} fill="none" stroke="rgba(234,216,177,0.14)" strokeWidth="2" strokeDasharray="10 8" />
    </svg>
  );
}

/**
 * plate(rel): the seat's plate on the rim, for 0..6 (0 = you). cards(rel,
 * cardWidth): its cards on the felt. bets: { 0..5: { amount, label } } (label
 * "SB" / "BB"). turnRel: the seat on turn, whose circle lights up, or null.
 * winners: the seats (rel) that won the hand, which the pot flies to. hand:
 * the hand's number, so a new hand's chips aren't taken for the last one's.
 * dealer: { rel, seat } for the dealer button (rel as for seats), or null.
 * line: what the dealer says (null: nothing).
 * board: card objects; best: card ids to light up (the winning hand).
 * pots: [{ amount }] main pot first (shown above the board).
 * banner: a line under the board ("Waiting for players…"); print: lines
 * printed on the felt between the deck and the muck, the game and the stakes
 * (a phone, or a table too narrow for them, prints only the last: the words
 * don't shrink with the table).
 * result: once a hand is over, its winners: [{ name, amount, label, detail }]
 *   (label and detail null when nobody showed), shown over the board.
 * muck: cards folded this hand. countdown: when the first hand deals (a
 *   Date.now() time), counted down over the board; null for none.
 * deal: { key, order } to deal a new hand round the table (see useDeal), or
 *   null; onDealt(key) once its cards have landed.
 * children: drawn over the table (the YOUR TURN banner).
 */
export default function OvalTable({ layout = "full", plate, cards, bets = {}, turnRel = null, winners = [], hand = null, dealer = null, line = null, board = [], best = [], pots = [], banner = null, print = null, result = null, muck = 0, countdown = null, deal = null, onDealt, children }) {
  const geo = GEOMETRY[layout] ?? GEOMETRY.full;
  const compact = layout === "compact";
  const rootRef = useRef(null);
  useDeal(rootRef, deal, onDealt);
  useChipMotion(rootRef, { hand, winners });
  const width = useElementWidth(rootRef);
  const scale = width ? clamp(width / geo.width, 0.55, 1.35) : 1;
  const size = Object.fromEntries(Object.entries(geo.sizes).map(([k, v]) => [k, Math.round(v * scale)]));
  const ratio = geo.width / geo.height;
  const centred = { left: "50%", transform: "translateX(-50%)" };
  const total = pots.reduce((a, p) => a + p.amount, 0);

  return (
    // The minimum height goes on an outer box: a size container whose height came only from a
    // min-height measured 0 tall in Chromium, and the table vanished on short screens.
    <div className="relative w-full h-full" style={{ minHeight: geo.minHeight }}>
      <div className="absolute inset-0" style={{ containerType: "size" }}>
        <div
          ref={rootRef}
          data-poker-table
          data-layout={layout}
          className="absolute left-1/2 top-1/2"
          style={{ width: `min(100cqw, calc(100cqh * ${ratio}))`, height: `min(100cqh, calc(100cqw / ${ratio}))`, transform: "translate(-50%, -50%)" }}
        >
          <Felt geo={geo} />
          <div className="absolute z-10" style={{ ...centred, top: 0 }}>
            <DealerPortrait px={geo.portraitPx} line={line} />
          </div>

          <Pile at={geo.muckAt} label={!compact && "MUCK"} z="z-[15]">
          <Muck count={muck} cardWidth={size.pileCard} />
        </Pile>
        <Pile at={geo.deckAt} label={!compact && "DECK"} z="z-30">
          <Deck cardWidth={size.pileCard} />
        </Pile>

        <div className="absolute z-[14] flex items-end gap-2 w-max" data-pot style={{ ...centred, top: pct(geo.potAt), transform: "translate(-50%, -100%)" }} aria-label="Pot">
            {result?.length ? <Result winners={result} cardWidth={size.boardCard} shallow={compact} /> : total > 0 && <ChipStack amount={total} label="POT" chipSize={size.chip + 4} testId="pot" />}
            {!result?.length &&
              pots.length > 1 &&
              pots.slice(1).map((p, i) => (
                <span key={i} className="font-pixel-display text-[9px] px-1.5 py-1" style={{ backgroundColor: "#0a0712", color: "#ead8b1", boxShadow: "0 0 0 2px #0a3a2c" }}>
                  SIDE {p.amount}
                </span>
              ))}
          </div>

          <div className="absolute z-[13]" style={{ left: "50%", top: pct(geo.boardAt), transform: "translate(-50%, -50%)" }}>
            <Board board={board} best={best} cardWidth={size.boardCard} />
            {countdown != null && <FirstHand endsAt={countdown} cardWidth={size.boardCard} />}
          </div>
          {print && (
          <div
            className={`absolute z-[13] text-center whitespace-nowrap pointer-events-none ${compact ? "font-pixel-body text-[18px] leading-none" : "font-pixel-display text-[10px] leading-[2] tracking-wider"}`}
            style={{ left: "50%", top: pct(geo.printAt), transform: "translate(-50%, -50%)", color: "rgba(234,216,177,0.42)" }}
          >
            {(compact || scale < 0.95 ? print.slice(-1) : print).map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        )}
        <div className="absolute z-[13] text-center whitespace-nowrap" style={{ left: "50%", top: pct(geo.boardAt + 0.13), transform: "translate(-50%, -50%)" }} role="status" aria-live="polite">
          {banner && (
            <span className="font-pixel-display text-[10px] leading-snug" style={{ color: "#ead8b1", textShadow: "2px 2px 0 #0a0712" }}>
              {banner}
            </span>
          )}
        </div>

        {geo.seats.map(({ t, cards: inset, bet }, rel) => (
            <React.Fragment key={rel}>
              <BetCircle rel={rel} at={fractionOf(geo, stadiumPoint(geo.felt, bet[0], bet[1]))} bet={bets[rel]} size={size.circle} chip={size.chip} active={turnRel === rel} />
              <div className="absolute z-20" data-seat-cards={rel} style={{ ...fractionOf(geo, stadiumPoint(geo.felt, t, inset)), transform: "translate(-50%, -50%)" }}>
                {cards?.(rel, rel === 0 ? size.heroCard : size.seatCard)}
              </div>
              <div className="absolute z-[25]" data-plate-rel={rel} style={plateAt(geo, t, width)}>
                {plate?.(rel)}
              </div>
            </React.Fragment>
          ))}
          {dealer && <DealerButton geo={geo} t={geo.seats[dealer.rel].t + (geo.seats[dealer.rel].button ?? geo.button)} seat={dealer.seat} size={size.button} />}
          {children}
        </div>
      </div>
    </div>
  );
}
