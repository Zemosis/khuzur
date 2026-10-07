// PLAY AREA — the felt, with the round's plays stacked on it.
//
// Every play this round stays on the table as a pile: each lands on top of
// the one before at an alternating tilt, so the pile crosses into an X and
// only the play to beat reads clearly. The newest play flies in from the seat
// that played it. When a trick is won the whole pile dims and the felt names
// the next leader; the pile clears when a new round is dealt.

import React, { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { PixelCard } from "../PixelCard";
import { COMBO_NAMES } from "../../utils/constants";

const MAX_PILE = 16; // older plays are fully covered anyway
const ENTRY = {
  bottom: { x: 0, y: 320 },
  top: { x: 0, y: -320 },
  left: { x: -460, y: 0 },
  right: { x: 460, y: 0 },
};

// Stable pseudo-random numbers per play, so the pile never reshuffles on a
// re-render.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function pileTransform(play, depth) {
  const r = hash(play.key);
  const r2 = hash(play.key + "*");
  const sign = play.index % 2 === 0 ? -1 : 1;
  // The newest play sits nearly straight; the ones under it cross.
  const rotation = depth === 0 ? sign * (2 + r * 3) : sign * (12 + r * 10);
  return { rotation, x: (r2 - 0.5) * 28, y: (r - 0.5) * 18 };
}

function PlayGroup({ cards, cardWidth }) {
  const n = cards.length;
  const step = n <= 4 ? cardWidth * 0.5 : cardWidth * 0.36;
  const mid = (n - 1) / 2;
  return (
    <div className="flex items-center justify-center">
      {cards.map((c, i) => (
        <div
          key={c.id || i}
          style={{
            marginLeft: i === 0 ? 0 : step - cardWidth,
            transform: `rotate(${(i - mid) * 3}deg) translateY(${Math.abs(i - mid) * 2}px)`,
          }}
        >
          <PixelCard rank={c.rank} suit={c.suit} width={cardWidth} />
        </div>
      ))}
    </div>
  );
}

// A glowing gold bar along the felt's edge on the side of the player on turn.
const EDGE = {
  top: { top: -8, left: "12%", right: "12%", height: 8 },
  bottom: { bottom: -8, left: "12%", right: "12%", height: 8 },
  left: { left: -8, top: "12%", bottom: "12%", width: 8 },
  right: { right: -8, top: "12%", bottom: "12%", width: 8 },
};
function TurnEdge({ side }) {
  return (
    <div
      data-turn-side={side}
      aria-hidden
      className="turn-edge absolute z-10 pointer-events-none"
      style={{ ...EDGE[side], backgroundColor: "#f4c430", boxShadow: "0 0 0 2px #0a0712, 0 0 24px 6px rgba(244,196,48,0.75)" }}
    />
  );
}

const PlayArea = ({
  pile = [],
  trickOpen = false,
  leaderName = null,
  lastPlayerName = null,
  roundNumber = 1,
  isDealing = false,
  cardWidth = 80,
  showRound = true, // the compact header shows the round instead
  turnSide = null, // bottom | left | top | right: the felt edge facing the player on turn glows
}) => {
  const topRef = useRef(null);
  const prevTopKeyRef = useRef(null);

  const shown = pile.slice(-MAX_PILE);
  const top = shown[shown.length - 1] || null;

  useLayoutEffect(() => {
    const key = top?.key || null;
    if (!key || key === prevTopKeyRef.current || !topRef.current) {
      prevTopKeyRef.current = key;
      return;
    }
    prevTopKeyRef.current = key;
    const from = ENTRY[top.seat] || ENTRY.bottom;
    gsap.fromTo(
      topRef.current,
      { x: from.x, y: from.y, rotation: gsap.utils.random(-25, 25), scale: 1.2, autoAlpha: 0 },
      { x: 0, y: 0, rotation: 0, scale: 1, autoAlpha: 1, duration: 0.36, ease: "back.out(1.4)", overwrite: true },
    );
  }, [top]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="relative w-full h-full" style={{ maxWidth: 820, maxHeight: 400 }}>
        <div
          className="relative felt-bg w-full h-full"
          style={{
            minHeight: 150,
            border: "4px solid #2e0f1d",
            boxShadow:
              "0 0 0 4px #0a0712, inset 0 0 0 2px #7a1530, inset 0 0 60px rgba(0,0,0,0.5), 0 0 32px rgba(232,90,122,0.15)",
          }}
        >
          {turnSide && <TurnEdge side={turnSide} />}
          {showRound && (
            <div
              className="absolute -top-3 -left-3 font-pixel-display text-[10px] px-3 py-1.5"
              style={{
                backgroundColor: "#f4c430",
                color: "#1a1024",
                border: "3px solid #0a0712",
                boxShadow: "2px 2px 0 #0a0712",
                zIndex: 20,
              }}
            >
              ROUND {roundNumber}
            </div>
          )}

          {!top && !isDealing && (
            <div className="absolute inset-0 flex items-center justify-center font-pixel-display text-[10px] text-bone/50 tracking-wider">
              WAITING FOR FIRST PLAY...
            </div>
          )}

          {top && (
            <>
              <div
                className="absolute top-2 left-0 right-0 text-center font-pixel-display text-[10px] tracking-widest"
                style={{ color: "rgba(234,216,177,0.7)", zIndex: 20 }}
              >
                {trickOpen ? (
                  <>
                    {lastPlayerName ? `${lastPlayerName.toUpperCase()} PLAYED ` : ""}
                    <span className="text-glow-gold text-[11px]">
                      {(COMBO_NAMES[top.type] || "CARDS").toUpperCase()}
                    </span>
                  </>
                ) : (
                  <>
                    TRICK WON · <span className="text-glow-gold text-[11px]">{(leaderName || "").toUpperCase()}</span> LEADS
                  </>
                )}
              </div>

              {/* The pile */}
              {shown.map((play, i) => {
                // A won trick buries even the newest play: nothing to beat.
                const depth = shown.length - 1 - i + (trickOpen ? 0 : 1);
                const t = pileTransform(play, depth);
                return (
                  <div
                    key={play.key}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{
                      zIndex: i + 1,
                      transform: `translate(${t.x}px, ${t.y}px) rotate(${t.rotation}deg)`,
                      filter: depth === 0 ? "none" : `brightness(${Math.max(0.45, 0.8 - depth * 0.08)})`,
                      // A buried play swings to its crossed tilt and dims.
                      transition: "transform 260ms ease-out, filter 260ms ease-out",
                    }}
                  >
                    <div ref={i === shown.length - 1 ? topRef : undefined}>
                      <PlayGroup cards={play.cards} cardWidth={cardWidth} />
                    </div>
                  </div>
                );
              })}

              <div
                className="absolute bottom-2 left-0 right-0 text-center font-pixel-display text-[10px] text-rose/80 tracking-wider"
                style={{ zIndex: 20 }}
              >
                {trickOpen ? "BEAT THIS OR PASS" : "ANY COMBINATION CAN LEAD"}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayArea;
