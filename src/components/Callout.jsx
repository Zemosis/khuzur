// CALLOUT — a decision announced over a player: a speech bubble pops up
// centred on the top edge of its (relative) parent, holds, then shrinks into
// `targetRef` (a status chip, which takes over from it) or, with no target,
// floats up and fades. Key it by the decision so each one plays once.
// `delay` (ms) holds it back, hidden, before it pops.

import React, { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { reducedMotion } from "../utils/motion";

const CALLOUT_HOLD = 0.45; // seconds the callout rests before it shrinks away

function Callout({ label, bg, fg = "#1a1024", targetRef, delay = 0, onDone }) {
  const bubbleRef = useRef(null);

  // Mounted once per decision (keyed by its id), so onDone never changes.
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    if (reducedMotion()) {
      const timer = setTimeout(onDone, delay + 900);
      return () => clearTimeout(timer);
    }
    // Measured when the flight starts, from the bubble's resting place.
    const offset = () => {
      const from = el.getBoundingClientRect();
      const to = targetRef?.current?.getBoundingClientRect();
      if (!to) return { x: 0, y: -from.height, scale: 0.4 };
      return {
        x: to.left + to.width / 2 - (from.left + from.width / 2),
        y: to.top + to.height / 2 - (from.top + from.height / 2),
        scale: Math.max(0.3, to.width / from.width),
      };
    };
    let flight = null;
    const tl = gsap.timeline({ delay: delay / 1000, onComplete: onDone });
    tl.fromTo(el, { scale: 0.2, y: 14, autoAlpha: 0 }, { scale: 1, y: 0, autoAlpha: 1, duration: 0.3, ease: "back.out(2.4)" })
      .to(el, { rotation: -4, duration: 0.08, yoyo: true, repeat: 3, ease: "none" })
      .to(el, { rotation: 0, duration: 0.04 })
      .to(el, {
        x: () => (flight ??= offset()).x,
        y: () => (flight ??= offset()).y,
        scale: () => (flight ??= offset()).scale,
        duration: 0.32,
        ease: "power2.in",
        delay: CALLOUT_HOLD,
      })
      .to(el, { autoAlpha: 0, duration: 0.06 });
    return () => tl.kill();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute left-1/2 top-0 z-30 pointer-events-none" style={{ transform: "translate(-50%, -78%)" }}>
      <div ref={bubbleRef} className="relative" style={{ visibility: "hidden" }}>
        <div
          className="font-pixel-display text-[16px] leading-none px-3 py-2 whitespace-nowrap"
          style={{ backgroundColor: bg, color: fg, boxShadow: "0 0 0 3px #0a0712, 3px 3px 0 3px #0a0712, 0 0 18px rgba(0,0,0,0.5)" }}
        >
          {label}
        </div>
        {/* Tail pointing down at the avatar */}
        <div
          className="absolute left-1/2"
          style={{ top: "100%", marginTop: 2, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: `8px solid #0a0712` }}
        />
        <div
          className="absolute left-1/2"
          style={{ top: "100%", marginTop: -1, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `6px solid ${bg}` }}
        />
      </div>
    </div>
  );
}

export default Callout;
