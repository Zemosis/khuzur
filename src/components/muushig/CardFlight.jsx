// CARD FLIGHT — cards crossing the table in legs, one leg after another:
//
//   swap         seat → dead pile, then draw pile → seat
//   fold         seat → dead pile
//   take trump   seat → dead pile, then the trump card → seat
//   eat          the trick on the felt → the winner's plate (or your side)
//
// Places a leg can start or end at:
//   seat   an opponent's fan (found by data-deal-seat), cards face down
//   hand   your hand: cards leave face up from where they sat (fromRects,
//          measured before the move). Cards arriving in your hand are flown
//          by PlayerHand itself (its `arrival`), so they land in their real
//          slots; here that leg only waits for them.
//   dead   the dead pile (deadRef)
//   draw   the draw pile (drawRef)
//   trump  the face-up trump card on the felt (trumpRef)
//   trick  the trick's cards where they lie on the felt (fromRects)
//   plate  a player's name plate (found by data-plate), where their eaten
//          piles are counted
//   mine   your side of the table (mineRef)
// A card shown face up (`faces`) turns face down as it lands.

import React, { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { FLY, STAGGER, legTime } from "./flightTiming";

const FAN_CARD_W = 44; // PixelCard "small", the default for a seat's cards

const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/**
 * legs: [{ count, from, to, faces, stagger }]; faces are the cards shown face
 * up (or null for backs); stagger overrides the gap between cards.
 * fromRects: { x, y, width, rotation } per card leaving your hand or the
 * trick. seat: the seat's data-deal-seat name; rotation: its fan's turn.
 * onLeg(i): leg i starts (i ≥ 1). onLand: one card landed. onDone: all over.
 */
const CardFlight = ({ legs, fromRects, seat, rotation = 0, cardWidth, deadRef, drawRef, trumpRef, mineRef, onLeg, onLand, onDone }) => {
  const spriteRefs = useRef([]);
  const cb = useRef({});
  // Declared first, so the flight below always calls the latest callbacks.
  useLayoutEffect(() => {
    cb.current = { onLeg, onLand, onDone };
  });

  const W = cardWidth;
  const H = Math.round(W * CARD_RATIO);

  // Mounted once per move (keyed by it). Explicit from-values everywhere:
  // StrictMode runs this effect twice.
  useLayoutEffect(() => {
    const fire = (name, ...args) => () => cb.current[name]?.(...args);
    const box = (ref) => ref?.current?.getBoundingClientRect();
    const fanEl = document.querySelector(`[data-deal-seat="${seat}"]`);
    const fan = fanEl?.getBoundingClientRect();
    const plate = document.querySelector(`[data-plate="${seat}"]`)?.getBoundingClientRect();
    const mine = box(mineRef);
    const trump = box(trumpRef);
    // The seat's cards are the size it says (data-card-w), else a small card's.
    const fanScale = (Number(fanEl?.dataset.cardW) || FAN_CARD_W) / W;

    // Where a card sits at each place: centre, scale and turn.
    const place = (where, i) => {
      if (where === "seat") return fan && { ...center(fan), scale: fanScale, rotation };
      if (where === "hand" || where === "trick") return fromRects?.[i] && { ...fromRects[i], scale: fromRects[i].width / W };
      if (where === "plate") return plate && { ...center(plate), scale: fanScale, rotation: gsap.utils.random(-8, 8) };
      if (where === "mine") return mine && { x: mine.left + mine.width / 2, y: mine.top + mine.height * 0.4, scale: 0.6, rotation: gsap.utils.random(-8, 8) };
      if (where === "dead") return box(deadRef) && { ...center(box(deadRef)), scale: box(deadRef).width / W, rotation: gsap.utils.random(-6, 6) };
      if (where === "draw") return box(drawRef) && { ...center(box(drawRef)), scale: box(drawRef).width / W, rotation: 0 };
      // The trump card lies sideways, so its box is a card height wide.
      if (where === "trump") return trump && { ...center(trump), scale: trump.height / W, rotation: 90 };
      return null;
    };
    // Sprites sit at the viewport origin (the layer is fixed).
    const pose = (p) => ({ x: p.x - W / 2, y: p.y - H / 2, scale: p.scale, rotation: p.rotation });

    const tl = gsap.timeline({ onComplete: fire("onDone") });
    let start = 0;
    legs.forEach((leg, l) => {
      if (l > 0) tl.call(fire("onLeg", l), null, start);
      const stagger = leg.stagger ?? STAGGER;
      for (let i = 0; i < leg.count; i++) {
        const t = start + i * stagger;
        if (leg.to === "hand") {
          // PlayerHand flies this one; only count it in.
          tl.call(fire("onLand"), null, t + FLY);
          continue;
        }
        const el = spriteRefs.current[l]?.[i];
        const from = place(leg.from, i);
        const to = place(leg.to, i);
        if (!el || !from || !to) {
          tl.call(fire("onLand"), null, t + FLY);
          continue;
        }
        const face = el.querySelector("[data-face]");
        const back = el.querySelector("[data-back]");
        tl.fromTo(el, { ...pose(from), autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, t);
        if (face) tl.set(face, { autoAlpha: 1 }, 0).set(back, { autoAlpha: 0 }, 0);
        tl.to(el, { ...pose(to), duration: FLY, ease: "power2.inOut" }, t);
        // A face-up card turns face down as it lands.
        if (face) {
          const turn = t + FLY - 0.06;
          tl.to(el, { scaleX: 0, duration: 0.06, ease: "power1.in" }, turn - 0.06)
            .set(face, { autoAlpha: 0 }, turn)
            .set(back, { autoAlpha: 1 }, turn)
            .to(el, { scaleX: to.scale, duration: 0.06, ease: "power1.out" }, turn);
        }
        tl.set(el, { autoAlpha: 0 }, t + FLY).call(fire("onLand"), null, t + FLY);
      }
      start += legTime(leg.count, stagger);
    });
    // A leg into your hand ends when PlayerHand's cards have landed and turned.
    tl.set({}, {}, start + 0.1);

    // The CPUs wait for the flight, so it must not stall without animation
    // frames: jump to the end (firing every landing) when the tab is hidden,
    // or on the clock once the flight's own length has passed, since a window
    // merely covered by another (GNOME/Wayland) gets no frames while visible.
    const skipToEnd = () => tl.progress() < 1 && tl.progress(1);
    const skipIfHidden = () => document.hidden && skipToEnd();
    skipIfHidden();
    document.addEventListener("visibilitychange", skipIfHidden);
    const deadline = setTimeout(skipToEnd, (tl.duration() + 0.5) * 1000);
    return () => {
      clearTimeout(deadline);
      document.removeEventListener("visibilitychange", skipIfHidden);
      tl.kill();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sprite = { position: "absolute", left: 0, top: 0, width: W, height: H, visibility: "hidden" };
  return (
    <div className="fixed inset-0 z-40 pointer-events-none" aria-hidden="true">
      {legs.map((leg, l) =>
        leg.to === "hand"
          ? null
          : Array.from({ length: leg.count }, (_, i) => (
              <div
                key={`${l}-${i}`}
                ref={(el) => {
                  spriteRefs.current[l] ??= [];
                  spriteRefs.current[l][i] = el;
                }}
                style={sprite}
              >
                {leg.faces?.[i] && (
                  <div data-face className="absolute inset-0">
                    <PixelCard rank={leg.faces[i].rank} suit={leg.faces[i].suit} width={W} />
                  </div>
                )}
                <div data-back className="absolute inset-0">
                  <PixelCard faceDown width={W} />
                </div>
              </div>
            )),
      )}
    </div>
  );
};

export default CardFlight;
