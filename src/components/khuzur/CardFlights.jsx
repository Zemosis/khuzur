// CARD FLIGHTS — Khuzur's cards on the move between places on the table:
// drawn from the pile to a seat, a stack picked up into a hand, a beaten stack
// swept to the dead pile. Each flight is a sprite in a layer over the whole
// page that flies from one box on screen to another (getBoundingClientRect
// boxes, so it works whatever the table's size), growing or shrinking to the
// size it lands at, then calls onLand and goes.
//
// The page works out the flights (see useCardFlights in GameKhuzur); this
// only flies them.

import React, { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { toPixelCardProps } from "./cardProps";

const FLY = 0.42; // seconds in the air

/** One card in the air. from / to: { x, y, w } (centre and width, px); card: shown face up, else face down; duration: seconds, else FLY. */
function Sprite({ flight, onLand }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { from, to, delay = 0, turn = 0 } = flight;
    const w = from.w;
    const tween = gsap.fromTo(
      el,
      { x: from.x - w / 2, y: from.y - (w * CARD_RATIO) / 2, rotation: flight.spin ?? 0, scale: 1, autoAlpha: delay ? 0 : 1 },
      {
        x: to.x - w / 2,
        y: to.y - (w * CARD_RATIO) / 2,
        rotation: turn,
        scale: to.w / w,
        autoAlpha: 1,
        delay,
        duration: flight.duration ?? FLY,
        ease: "power2.inOut",
        immediateRender: true,
        onStart: () => gsap.set(el, { autoAlpha: 1 }),
        onComplete: () => onLand(flight.id),
      },
    );
    return () => tween.kill();
  }, [flight, onLand]);

  return (
    <div ref={ref} className="absolute left-0 top-0" style={{ width: flight.from.w, transformOrigin: "50% 50%", visibility: "hidden", filter: "drop-shadow(3px 4px 0 rgba(10,7,18,0.45))" }}>
      {flight.card ? <PixelCard {...toPixelCardProps(flight.card)} width={flight.from.w} /> : <PixelCard faceDown width={flight.from.w} />}
    </div>
  );
}

/** flights: [{ id, from, to, card, delay, turn, spin, duration }]. onLand(id): one has landed (keep it stable). */
export default function CardFlights({ flights, onLand }) {
  if (!flights.length) return null;
  return (
    <div className="fixed inset-0 z-[45] pointer-events-none overflow-hidden" aria-hidden>
      {flights.map((f) => (
        <Sprite key={f.id} flight={f} onLand={onLand} />
      ))}
    </div>
  );
}
