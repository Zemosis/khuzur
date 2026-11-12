// TRUMP REVEAL — what follows the deal at a Khuzur table, on the felt: the
// deck left in the middle turns its top card face up — the trump — which
// grows, glows and names its suit; then it slides to the draw pile's spot and
// turns sideways, and the rest of the deck lands on top of it, so the trump
// peeks out from under the pile. Last, a banner names who leads first.
//
// Positions are px from the felt's centre (this sits in the felt's overlay
// box, see KhuzurTable). TRUMP_REVEAL_MS is its whole length: the server
// waits that long too before the first move (khuzurGame's trumpReveal).

import React, { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { reducedMotion } from "../../utils/motion";
import { soundManager } from "../../utils/SoundManager";
import { SUIT_NAME, suitColor } from "../muushig/suits";
import { toPixelCardProps } from "./cardProps";

export const TRUMP_REVEAL_MS = 3200;
const LAYERS = 3; // as many as the draw pile shows (KhuzurTable's DrawPile), 2px apart, so the handover is seamless

const safeSound = (name) => {
  try {
    soundManager[name]?.();
  } catch {
    /* audio not ready */
  }
};

/**
 * trump: the trump card. cw: the deck's card width; pileW: the draw pile's.
 * drawSpot: [x, y], the pile's centre. pileCount: cards left to draw (not
 * the trump). leader: who leads first ("YOU" or a name). onDone: once it's
 * all on the table.
 */
export default function TrumpReveal({ trump, cw, pileW, drawSpot, pileCount, leader, onDone }) {
  const deckRef = useRef(null);
  const trumpRef = useRef(null);
  const faceRef = useRef(null);
  const backRef = useRef(null);
  const labelRef = useRef(null);
  const bannerRef = useRef(null);
  const ch = Math.round(cw * CARD_RATIO);
  const [dx, dy] = drawSpot;
  const scale = pileW / cw;
  // Where the trump comes to rest: sideways, peeking out to the right from under the pile.
  const peek = Math.round(pileW * CARD_RATIO * 0.42);
  const layers = Math.min(LAYERS, Math.max(1, pileCount));

  useLayoutEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDone();
    };
    if (reducedMotion()) {
      const t = setTimeout(finish, 700);
      return () => clearTimeout(t);
    }
    const tl = gsap.timeline({ onComplete: finish });
    // Over the deck while it's shown, under it once it's laid at the pile.
    gsap.set(trumpRef.current, { x: 0, y: -2 * LAYERS, rotation: 0, scale: 1, zIndex: 3 });
    gsap.set(faceRef.current, { scaleX: 0 });
    gsap.set(backRef.current, { scaleX: 1 });
    gsap.set(labelRef.current, { autoAlpha: 0, xPercent: -50 });
    gsap.set(bannerRef.current, { autoAlpha: 0, xPercent: -50, yPercent: -50 });
    // Lift the top card off the deck and turn it over.
    tl.to(trumpRef.current, { y: -ch * 0.35, duration: 0.25, ease: "power2.out" })
      .to(backRef.current, { scaleX: 0, duration: 0.14, ease: "power1.in" })
      .call(() => safeSound("playSnap"))
      .to(faceRef.current, { scaleX: 1, duration: 0.14, ease: "power1.out" })
      // Grow and glow: this is the trump.
      .to(trumpRef.current, { scale: 1.45, duration: 0.3, ease: "back.out(2)" })
      .fromTo(labelRef.current, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.2 }, "<0.1")
      .to({}, { duration: 0.75 })
      .to(labelRef.current, { autoAlpha: 0, duration: 0.15 })
      .set(trumpRef.current, { zIndex: 1 })
      // To the draw pile's spot, sideways.
      .to(trumpRef.current, { x: dx + peek, y: dy, rotation: 90, scale, duration: 0.45, ease: "power2.inOut" }, "<")
      // The rest of the deck on top of it.
      .to(deckRef.current, { x: dx, y: dy, scale, duration: 0.4, ease: "power2.inOut" }, ">-0.05")
      .call(() => safeSound("playDeal"))
      // Who starts.
      .fromTo(bannerRef.current, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.25, ease: "back.out(2.2)" }, ">0.05")
      .to({}, { duration: 0.65 })
      .to(bannerRef.current, { autoAlpha: 0, duration: 0.15 });
    // A tab without frames (hidden, or covered) still gets the table: end on the clock.
    const deadline = setTimeout(() => {
      tl.kill();
      finish();
    }, TRUMP_REVEAL_MS + 400);
    return () => {
      clearTimeout(deadline);
      tl.kill();
    };
    // One reveal per mount (the page keys it by match).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const box = { position: "absolute", left: 0, top: 0, width: cw, height: ch, marginLeft: -cw / 2, marginTop: -ch / 2 };
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute" style={{ left: "50%", top: "50%", width: 0, height: 0 }}>
        {/* The trump, under the deck once it's in place. */}
        <div ref={trumpRef} style={{ ...box, zIndex: 1, filter: "drop-shadow(0 0 12px rgba(244,196,48,0.7)) drop-shadow(2px 3px 0 rgba(10,7,18,0.5))" }}>
          <div ref={backRef} className="absolute inset-0">
            <PixelCard faceDown width={cw} />
          </div>
          <div ref={faceRef} className="absolute inset-0">
            <PixelCard {...toPixelCardProps(trump)} width={cw} />
          </div>
        </div>
        <div ref={deckRef} style={{ position: "absolute", left: 0, top: 0, zIndex: 2 }}>
          {Array.from({ length: layers }, (_, k) => (
            <div key={k} style={{ ...box, transform: `translate(${-k * 2}px, ${-k * 2}px)`, filter: "drop-shadow(2px 3px 0 rgba(10,7,18,0.5))" }}>
              <PixelCard faceDown width={cw} />
            </div>
          ))}
        </div>
        <div ref={labelRef} className="absolute flex items-center gap-2 px-3 py-2 whitespace-nowrap" style={{ visibility: "hidden", left: 0, top: ch * 0.55 + 18, zIndex: 3, backgroundColor: "#0a0712", boxShadow: "0 0 0 3px #f4c430, 0 0 18px rgba(244,196,48,0.5)" }}>
          <span className="font-pixel-display text-[12px] text-glow-gold">TRUMP</span>
          {trump?.suit && (
            <>
              <span style={{ color: suitColor(trump.suit), fontSize: 22, lineHeight: 1 }}>{trump.suit}</span>
              <span className="font-pixel-display text-[11px] text-parchment">{SUIT_NAME[trump.suit]}</span>
            </>
          )}
        </div>
        <div
          ref={bannerRef}
          className="absolute font-pixel-display text-[14px] sm:text-[18px] leading-none px-5 py-3 whitespace-nowrap tracking-wider"
          style={{ left: 0, top: 0, zIndex: 4, visibility: "hidden", backgroundColor: "#f08a4b", color: "#1a1024", boxShadow: "0 0 0 4px #0a0712, 6px 6px 0 4px #0a0712" }}
        >
          {leader === "YOU" ? "YOU LEAD FIRST" : `${leader.toUpperCase()} LEADS FIRST`}
        </div>
      </div>
    </div>
  );
}
