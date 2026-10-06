// DEAL ANIMATION — riffle shuffle, then a one-card-at-a-time deal.
//
// The deck sits at the table center. Two riffles split it into halves and
// interleave them back, then the cards go out round-robin from the dealer's
// left. Opponent cards fly to their seat's fan (found by data-deal-seat) and
// only count once they land. The player's own cards are flown by PlayerHand
// itself, so the real card lands in its real slot; here they only count.
//
// Defaults are Thirteen's (4 seats, 13 cards each); Muushig passes its own
// seat layout and 5 cards.
//
// Online, `endsAt` (a performance.now() time, from the server's dealMsLeft)
// is when the deal ends at every seat, and the server takes no move before
// it. The deal plays faster if it has less time than it needs (you're behind,
// or rejoined mid-deal) and the table waits for that moment if it finished
// sooner (reduced animations, a hidden tab), so the turn opens for everyone
// together. Without it (practice) the deal ends when its animation does.

import React, { useLayoutEffect, useRef, useState } from "react";
import { PixelCard } from "../PixelCard";
import { soundManager } from "../../utils/SoundManager";
import { CARD_RATIO, DEAL_FLY, DEAL_STAGGER } from "../../hooks/useTableMetrics";
import { reducedMotion } from "../../utils/motion";
import gsap from "gsap";

const safeSound = (method) => {
  try {
    soundManager[method]?.();
  } catch {
    /* audio not ready yet */
  }
};

const DECK_LAYERS = 12;
const POOL_SIZE = 8; // flying sprites reused round-robin
const FAN_CARD_W = 44; // PixelCard "small", used by opponent fans
const SEATS = ["bottom", "left", "top", "right"];
// Landing rotation per seat: side fans hold cards sideways, the top seat's
// cards turn to face the player across the table.
const SEAT_ROTATION = { left: 90, top: 180, right: 270 };
const ALL_IN = [true, true, true, true];

const stackY = (k) => -k * 1.5;

const DealAnimation = ({
  dealerIndex = 0,
  viewIndex = 0,
  deckWidth = 72,
  seatsIn = ALL_IN, // false for eliminated seats, who get no cards
  seats = SEATS, // data-deal-seat names, clockwise from the player
  seatRotation = SEAT_ROTATION, // landing rotation per seat name
  cardsPerSeat = 13,
  endsAt = null,
  onDealProgress,
  onComplete,
}) => {
  const [phase, setPhase] = useState("shuffle");
  const containerRef = useRef(null);
  const deckRef = useRef(null);
  const layerRefs = useRef([]);
  const poolRefs = useRef([]);
  const progressRef = useRef(onDealProgress);
  const completeRef = useRef(onComplete);
  progressRef.current = onDealProgress;
  completeRef.current = onComplete;

  const deckH = Math.round(deckWidth * CARD_RATIO);
  // Stable dependency for the effect (a fresh array every render otherwise).
  const seatsKey = seatsIn.map(Number).join("");
  const layoutKey = `${seats.join(",")}|${JSON.stringify(seatRotation)}`;
  const seatsRef = useRef(seats);
  const rotationRef = useRef(seatRotation);
  seatsRef.current = seats;
  rotationRef.current = seatRotation;

  useLayoutEffect(() => {
    const container = containerRef.current;
    const layers = layerRefs.current.filter(Boolean);
    const pool = poolRefs.current.filter(Boolean);
    if (!container || layers.length < DECK_LAYERS) return;

    const reduce = reducedMotion();
    const fly = reduce ? 0.12 : DEAL_FLY;
    const stagger = reduce ? 0.02 : DEAL_STAGGER;
    const synced = endsAt != null;
    const budget = synced ? Math.max(0, endsAt - performance.now()) / 1000 : null;
    // Card flights run off the timeline, so they take its speed-up by hand.
    let speed = 1;

    let order = [...layers];
    // Explicit values everywhere: StrictMode runs this effect twice, and a
    // from() tween would pick up the half-run first pass as its end state.
    order.forEach((el, k) => gsap.set(el, { x: 0, y: stackY(k), rotation: 0, zIndex: k, autoAlpha: 1 }));
    gsap.set(deckRef.current, { y: 0 });
    gsap.set(pool, { autoAlpha: 0 });

    const tl = gsap.timeline();

    if (!reduce) {
      tl.fromTo(
        layers,
        { y: (k) => stackY(k) - 36, autoAlpha: 0 },
        { y: (k) => stackY(k), autoAlpha: 1, duration: 0.24, stagger: 0.015, ease: "power2.out" },
      );

      // Riffle: bottom half left, top half right, then drop them back one
      // card at a time, alternating sides, each new card landing on top.
      const half = DECK_LAYERS / 2;
      const spread = deckWidth * 0.7;
      for (let pass = 0; pass < 2; pass++) {
        const left = order.slice(0, half);
        const right = order.slice(half);
        tl.call(() => safeSound("playShuffle"), null, ">0.06");
        tl.to(left, { x: -spread, rotation: -9, y: (i) => stackY(i), duration: 0.2, ease: "power2.out" }, "<");
        tl.to(right, { x: spread, rotation: 9, y: (i) => stackY(i), duration: 0.2, ease: "power2.out" }, "<");
        const merged = [];
        for (let i = 0; i < half; i++) merged.push(left[i], right[i]);
        const start = tl.duration() + 0.05;
        merged.forEach((el, k) => {
          const at = start + k * 0.032;
          tl.set(el, { zIndex: 100 + k }, at);
          tl.to(el, { x: 0, rotation: 0, y: stackY(k), duration: 0.14, ease: "power2.in" }, at);
        });
        tl.set(merged, { zIndex: (k) => k });
        order = merged;
      }

      // Square the deck up with a tap on the table.
      tl.to(deckRef.current, { y: -8, duration: 0.09, ease: "power2.out" }, ">0.04");
      tl.to(deckRef.current, { y: 0, duration: 0.14, ease: "power2.in" });
    }

    tl.call(() => setPhase("dealing"));

    const seatTarget = (seat) => {
      const el = document.querySelector(`[data-deal-seat="${seat}"]`);
      const c = container.getBoundingClientRect();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - (c.left + c.width / 2),
        y: r.top + r.height / 2 - (c.top + c.height / 2),
      };
    };

    // Cards to each seat still in the match, round-robin from the dealer's left.
    const seatNames = seatsRef.current;
    const rotations = rotationRef.current;
    const n = seatNames.length;
    const dealSeats = [];
    for (let k = 1; k <= n; k++) {
      const seat = (dealerIndex + k) % n;
      if (seatsKey[seat] !== "0") dealSeats.push(seat);
    }
    const total = dealSeats.length * cardsPerSeat;
    const counts = Array(n).fill(0);
    const land = (seat) => {
      counts[seat]++;
      progressRef.current?.([...counts]);
    };

    for (let i = 0; i < total; i++) {
      const seat = dealSeats[i % dealSeats.length];
      const pos = seatNames[(seat - viewIndex + n) % n];

      tl.call(
        () => {
          // The deck thins as it deals.
          const visible = Math.ceil(((total - i - 1) / total) * DECK_LAYERS);
          order.forEach((el, k) => gsap.set(el, { autoAlpha: k < visible ? 1 : 0 }));
          if (i % 2 === 0) safeSound("playDeal");

          if (pos === "bottom") return land(seat);

          const el = pool[i % POOL_SIZE];
          const t = seatTarget(pos);
          if (!el || !t) return land(seat);
          gsap.fromTo(
            el,
            { x: 0, y: stackY(DECK_LAYERS), rotation: 0, scale: 1, autoAlpha: 1 },
            {
              x: t.x,
              y: t.y,
              rotation: (rotations[pos] || 0) + gsap.utils.random(-6, 6),
              scale: FAN_CARD_W / deckWidth,
              duration: fly / speed,
              ease: "power2.out",
              overwrite: true,
              onComplete: () => {
                land(seat);
                gsap.set(el, { autoAlpha: 0 });
              },
            },
          );
        },
        null,
        i === 0 ? ">0.1" : `>${stagger}`,
      );
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      completeRef.current?.();
    };
    if (synced) {
      speed = Math.max(1, (tl.duration() + fly + 0.2) / Math.max(budget, 0.001));
      tl.timeScale(speed);
    } else {
      tl.call(finish, null, `>${fly + 0.2}`);
    }

    // Without animation frames the timeline stalls and holds the game (your
    // turn, and solo CPUs, wait on the deal) until the player looks again.
    // Skip straight to the dealt table instead; online, that's still at the
    // deal's set end.
    const skipToEnd = () => {
      if (done) return;
      tl.kill();
      gsap.killTweensOf(pool);
      if (!synced) finish();
    };
    // A hidden tab says so...
    const skipIfHidden = () => document.hidden && skipToEnd();
    skipIfHidden();
    document.addEventListener("visibilitychange", skipIfHidden);
    // ...but a window merely covered by another (GNOME/Wayland) gets no frames
    // while still counting as visible. Timers keep running there, so the deal
    // also ends on the clock once its own length (online: its set end) has passed.
    const deadline = setTimeout(
      () => {
        skipToEnd();
        finish();
      },
      synced ? budget * 1000 : (tl.duration() + 0.5) * 1000,
    );

    return () => {
      clearTimeout(deadline);
      document.removeEventListener("visibilitychange", skipIfHidden);
      tl.kill();
      gsap.killTweensOf(pool);
    };
  }, [dealerIndex, viewIndex, deckWidth, seatsKey, layoutKey, cardsPerSeat, endsAt]);

  const cardBox = { position: "absolute", marginLeft: -deckWidth / 2, marginTop: -deckH / 2 };

  return (
    <div ref={containerRef} className="absolute inset-0 z-30 pointer-events-none" style={{ overflow: "visible" }}>
      <div className="absolute" style={{ left: "50%", top: "50%", width: 0, height: 0 }}>
        <div ref={deckRef}>
          {Array.from({ length: DECK_LAYERS }, (_, i) => (
            <div key={i} ref={(el) => (layerRefs.current[i] = el)} style={cardBox}>
              <PixelCard faceDown width={deckWidth} />
            </div>
          ))}
        </div>

        {Array.from({ length: POOL_SIZE }, (_, i) => (
          <div key={i} ref={(el) => (poolRefs.current[i] = el)} style={{ ...cardBox, zIndex: 200 }}>
            <PixelCard faceDown width={deckWidth} />
          </div>
        ))}

        <div
          className="absolute font-pixel-display text-[12px] text-glow-gold"
          style={{ left: 0, top: -(deckH / 2 + 40), transform: "translateX(-50%)", whiteSpace: "nowrap", letterSpacing: "0.15em" }}
        >
          {phase === "shuffle" ? "SHUFFLING" : "DEALING"}
        </div>
      </div>
    </div>
  );
};

export default DealAnimation;
