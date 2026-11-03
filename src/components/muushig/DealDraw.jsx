// DEAL DRAW — the draw for the first deal, played out on the felt.
//
// A face-down pile sits in the middle. Each draw lifts the cards above the
// chosen depth, slides that card out, flies it to a spot in front of the
// drawer and turns it face up; it stays there until the draw is over. While
// it's your turn the pile previews your pick: the cards above it lift and the
// card you'd take glows.
// Once someone wins, their card pops and the rest dim, then onDone. The page
// names the winner only once the last card drawn has landed (see DRAW_LAND_MS).

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { reducedMotion } from "../../utils/motion";
import { DRAW_FLY, DRAW_SLIDE, DRAW_TURN } from "./flightTiming";

const LAYERS = 12; // pile cards drawn, enough to show the deepest draw
const REVEAL_MS = 1600; // how long the winning card shows before onDone

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] || "TH"}`;
const place = (x, y) => `translate(-50%, -50%) translate(${x}px, ${y}px)`;

/**
 * The pile, top card last. cut: the depth being drawn (0 for none); the cards
 * above it lift. chosen: whether the card at that depth is still in the pile
 * (your preview), so it glows.
 */
function Pile({ count, cw, cut, chosen, y = 0, countBelow = false }) {
  const ch = Math.round(cw * CARD_RATIO);
  const n = Math.min(count, LAYERS);
  const lift = Math.round(ch * 0.3);
  return (
    <div className="absolute left-1/2 top-1/2" style={{ width: cw, height: ch, transform: `translate(-50%, -50%) translate(0, ${y}px)` }}>
      {Array.from({ length: n }, (_, k) => {
        const i = n - 1 - k; // depth from the top, 0 = top card
        const above = cut > 0 && i < cut - 1;
        const glow = chosen && i === cut - 1;
        const y = -(n - 1 - i) * 2 - (above ? lift : glow ? 6 : 0); // a pile 2px per card high
        return (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              transform: `translate(${above ? Math.round(cw * 0.3) : 0}px, ${y}px) rotate(${above ? 8 : 0}deg)`,
              transition: "transform 160ms ease-out",
              filter: glow ? "drop-shadow(0 0 8px #f4c430) drop-shadow(0 0 2px #f4c430)" : undefined,
            }}
          >
            <PixelCard faceDown width={cw} />
          </div>
        );
      })}
      {chosen && cut > 0 && (
        <div
          className="absolute font-pixel-display text-[10px] leading-none px-1.5 py-1 whitespace-nowrap"
          style={{ left: "100%", top: "50%", transform: "translate(8px, -50%)", backgroundColor: "#f4c430", color: "#1a1024", boxShadow: "0 0 0 2px #0a0712" }}
        >
          {ordinal(cut)}
        </div>
      )}
      {countBelow ? (
        <div className="absolute left-1/2 font-pixel-display text-[10px] leading-none text-bone/60 whitespace-nowrap" style={{ top: "100%", transform: "translate(-50%, 8px)" }}>
          {count} LEFT
        </div>
      ) : (
        // Beside the pile, not under it: the card you draw lands below.
        <div
          className="absolute font-pixel-display text-[10px] leading-none text-bone/60 whitespace-nowrap text-right"
          style={{ right: "100%", top: "50%", transform: "translate(-12px, -50%)" }}
        >
          {count}
          <br />
          <span className="text-[8px]">LEFT</span>
        </div>
      )}
    </div>
  );
}

/** A drawn card: out of the pile (at `from`, relative to its spot), to its spot, face up. */
function DrawnCard({ card, depth, w, from, tone, pop }) {
  const moveRef = useRef(null);
  const flipRef = useRef(null);
  const backRef = useRef(null);
  const popRef = useRef(null);

  // Mounted once per draw (keyed by it). Explicit from-values: StrictMode
  // runs this effect twice.
  useLayoutEffect(() => {
    if (reducedMotion()) {
      gsap.set(backRef.current, { autoAlpha: 0 });
      return;
    }
    const tl = gsap.timeline();
    tl.set(backRef.current, { autoAlpha: 1 }, 0)
      .set(flipRef.current, { scaleX: 1 }, 0)
      .fromTo(moveRef.current, { x: from.x, y: from.y, scale: from.scale, rotation: 0 }, { x: from.x + from.slide, rotation: 10, duration: DRAW_SLIDE, ease: "power2.out" }, 0)
      .to(moveRef.current, { x: 0, y: 0, scale: 1, rotation: gsap.utils.random(-6, 6), duration: DRAW_FLY, ease: "power2.inOut" })
      .to(flipRef.current, { scaleX: 0, duration: DRAW_TURN / 2, ease: "power1.in" })
      .set(backRef.current, { autoAlpha: 0 })
      .to(flipRef.current, { scaleX: 1, duration: DRAW_TURN / 2, ease: "power1.out" });
    return () => tl.kill();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!pop || reducedMotion()) return;
    gsap.fromTo(popRef.current, { scale: 1 }, { scale: 1.25, duration: 0.18, ease: "power2.out", yoyo: true, repeat: 1 });
  }, [pop]);

  const glow = tone === "win" ? "#f4c430" : null;
  return (
    <div
      ref={popRef}
      style={{
        opacity: tone === "out" ? 0.45 : 1,
        filter: tone === "out" ? "grayscale(0.6)" : glow ? `drop-shadow(0 0 10px ${glow}) drop-shadow(0 0 2px ${glow})` : undefined,
        transition: "opacity 300ms, filter 300ms",
      }}
    >
      <div ref={moveRef}>
        <div ref={flipRef} className="relative">
          <PixelCard rank={card.rank} suit={card.suit} width={w} />
          <div ref={backRef} className="absolute inset-0 invisible">
            <PixelCard faceDown width={w} />
          </div>
          <div
            className="absolute font-pixel-display text-[9px] leading-none px-1 py-0.5 whitespace-nowrap"
            style={{ right: -6, top: -8, backgroundColor: "#0a0712", color: "rgba(234,216,177,0.8)", boxShadow: "0 0 0 2px #1a3a2c" }}
            title={`Drawn ${depth} deep`}
          >
            {ordinal(depth)}
          </div>
          {tone === "win" && (
            <div
              className="absolute left-1/2 font-pixel-display text-[10px] leading-none px-1.5 py-1 whitespace-nowrap"
              style={{ bottom: -10, transform: "translateX(-50%)", backgroundColor: "#5fd4d6", color: "#0a3a3a", boxShadow: "0 0 0 2px #0a0712" }}
            >
              DEALS
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * cw: the pile's card width.
 * spots: where each seat's drawn card lies, { seat: [x, y] } px from the
 *   felt's centre. pileY: the pile's height, px from the centre (a little
 *   above it, leaving room for your card below). labelY: the caption's, the same.
 * countBelow: the cards left are counted under the pile, not beside it.
 * count: cards left in the pile.
 * draws: each seat's latest draw, [{ key, seat, card, depth }], seat being
 *   its name (bottom, bottomLeft, …).
 * latest: key of the newest draw, whose cut the pile shows as it's taken.
 * preview: the depth you're about to draw (0 when it isn't your turn).
 * label: the caption over the pile.
 * winner: the seat name that deals, once the draw is over and its last card
 *   has landed, or null.
 */
const DealDraw = ({ cw, spots, pileY = 0, labelY, countBelow = false, count, draws, latest, preview = 0, label, winner, onDone }) => {
  const w = Math.round(cw * 0.75);
  const reduce = reducedMotion();

  // The pile shows the newest draw's cut while its card slides out.
  const [settled, setSettled] = useState(null);
  const newest = draws.find((d) => d.key === latest);
  useEffect(() => {
    if (!latest) return;
    const timer = setTimeout(() => setSettled(latest), (DRAW_SLIDE + 0.1) * 1000);
    return () => clearTimeout(timer);
  }, [latest]);
  const cutting = newest && latest !== settled && !reduce ? newest.depth : 0;

  // Once there's a winner: show it, then move on.
  const revealed = winner !== null;
  useEffect(() => {
    if (winner === null) return;
    const done = setTimeout(() => onDone?.(), reduce ? 900 : REVEAL_MS);
    return () => clearTimeout(done);
  }, [winner, onDone, reduce]);

  const toneOf = (seat) => (revealed ? (seat === winner ? "win" : "out") : null);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <Pile count={count} cw={cw} cut={preview || cutting} chosen={preview > 0} y={pileY} countBelow={countBelow} />

      {draws.map((d) => {
        const [x, y] = spots[d.seat] || spots.bottom;
        return (
          <div key={d.key} className="absolute left-1/2 top-1/2" style={{ transform: place(x, y) }}>
            <DrawnCard
              card={d.card}
              depth={d.depth}
              w={w}
              from={{ x: -x, y: pileY - y, scale: cw / w, slide: Math.round(cw * 0.45) }}
              tone={toneOf(d.seat)}
              pop={revealed && d.seat === winner}
            />
          </div>
        );
      })}

      {label && (
        <div className="absolute left-1/2 top-1/2" style={{ transform: place(0, labelY) }}>
          <div
            className="font-pixel-display text-[10px] leading-none px-2 py-1.5 whitespace-nowrap"
            style={{ backgroundColor: "#0a0712", color: "#ead8b1", boxShadow: "0 0 0 2px #1a3a2c" }}
          >
            {label}
          </div>
        </div>
      )}
    </div>
  );
};

export default DealDraw;
