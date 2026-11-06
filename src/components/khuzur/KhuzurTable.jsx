// KHUZUR TABLE — the felt and everyone round it. Up to six seats, you at the
// foot (your hand, under the table, is your seat) and the rest clockwise from
// your left (utils/seatPosition). Each plate shows the face, the name, the
// team colour, the cards held and a tag: DEALER, TURN, or a place once out.
//
// Across the middle of the felt, left to right: the draw pile with the
// face-up trump tucked under it, the stack, the dead pile. `overlay` is drawn
// over the felt (the draw for the deal).

import React, { useRef } from "react";
import { PixelAvatar, PixelCard } from "../PixelCard";
import Suit from "../muushig/Suit";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { useElementWidth } from "../../hooks/useElementWidth";
import { INK } from "../pixelTokens";
import StackColumns from "./StackColumns";
import { toPixelCardProps } from "./cardProps";

// Where each seat's plate sits, in % of the table box.
const PLATE_AT = {
  bottom: [50, 100],
  bottomLeft: [5, 74],
  left: [3, 46],
  topLeft: [17, 6],
  top: [50, 3],
  topRight: [83, 6],
  right: [97, 46],
  bottomRight: [95, 74],
};
// Which way a seat lies from the middle, for cards flying in from it.
const DIRECTION = {
  bottom: [0, 1],
  bottomLeft: [-1, 0.6],
  left: [-1, 0],
  topLeft: [-0.8, -1],
  top: [0, -1],
  topRight: [0.8, -1],
  right: [1, 0],
  bottomRight: [1, 0.6],
};

function Chip({ label, bg, fg = INK, blink = false }) {
  return (
    <span className={`font-pixel-display text-[9px] leading-none px-1.5 py-1 whitespace-nowrap ${blink ? "blink" : ""}`} style={{ backgroundColor: bg, color: fg, boxShadow: "0 0 0 2px #0a0712" }}>
      {label}
    </span>
  );
}

function Plate({ name, face, color, count, chips, active, out, compact }) {
  return (
    <div
      className={`relative flex items-center ${compact ? "flex-col gap-1 px-1.5 pt-2.5 pb-1.5" : "gap-2 p-2 pt-3"}`}
      style={{
        width: compact ? 78 : 160,
        backgroundColor: active ? "#241a3a" : "#1f1a3d",
        border: `3px solid ${active ? "#f4c430" : "#2a234d"}`,
        boxShadow: `inset 0 -4px 0 ${color}, 3px 3px 0 #0a0712${active ? ", 0 0 16px rgba(244,196,48,0.45)" : ""}`,
        opacity: out ? 0.6 : 1,
      }}
    >
      {chips.length > 0 && (
        <span className="absolute -top-3 inset-x-1 flex justify-end gap-1 pointer-events-none">
          {chips.map((chip) => (
            <Chip key={chip.label} {...chip} />
          ))}
        </span>
      )}
      <PixelAvatar variant={face.variant} customAvatarData={face.customAvatarData} size={compact ? 20 : 36} active={active} eliminated={out} />
      <div className={`min-w-0 text-center ${compact ? "w-full" : "flex-1"}`}>
        <div className="font-pixel-display text-[9px] truncate" style={{ color: "#ead8b1" }} title={name}>
          {name}
        </div>
        <div className="font-pixel-body text-[18px] leading-none mt-1" style={{ color: "#c8b890" }}>
          {out ? "OUT" : `${count} card${count === 1 ? "" : "s"}`}
        </div>
      </div>
    </div>
  );
}

function Pile({ count, cw, label, faceDown = true, stacked = count > 0, children }) {
  const ch = Math.round(cw * CARD_RATIO);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: cw + 8, height: ch + 6 }}>
        {children}
        {stacked ? (
          <div className="absolute" style={{ left: 2, top: 0 }}>
            <PixelCard faceDown={faceDown} width={cw} />
          </div>
        ) : (
          <div className="absolute" style={{ left: 2, top: 0, width: cw, height: ch, border: "3px dashed rgba(234,216,177,0.25)" }} />
        )}
      </div>
      <div className="font-pixel-display text-[9px] leading-none text-bone/80">
        {label} {count}
      </div>
    </div>
  );
}

/**
 * seats: [{ seat, position, name, face, color, count, chips, active, out }]
 * (not your own). game: the engine state. drawing: the draw for the deal is
 * on, so the piles and the stack stay hidden under it.
 */
export default function KhuzurTable({ game, seats, colorOf, positionOfSeat, compact, overlay, drawing = false }) {
  const boxRef = useRef(null);
  const width = useElementWidth(boxRef);
  const feltW = width * 0.74;
  const pileW = Math.max(30, Math.min(72, Math.round(feltW * 0.07)));
  const columns = game.stack?.layers[0].length ?? 1;
  const stackW = Math.max(26, Math.min(64, Math.floor((feltW * 0.56) / columns) - 8));
  const fromOf = (seat) => {
    const [dx, dy] = DIRECTION[positionOfSeat(seat)] ?? [0, 0];
    return [Math.round(dx * feltW * 0.3), Math.round(dy * feltW * 0.18)];
  };
  const trumpCard = game.trumpCard;

  return (
    <div ref={boxRef} className="relative w-full" style={{ aspectRatio: compact ? "1.25 / 1" : "2.2 / 1", maxHeight: "100%" }}>
      <div
        className="absolute"
        style={{
          left: "13%",
          right: "13%",
          top: "13%",
          bottom: "8%",
          borderRadius: "999px",
          background: "radial-gradient(ellipse at center, #2f7a4c 0%, #23603b 70%, #1b4d2f 100%)",
          border: "10px solid #7a5a2b",
          boxShadow: `0 0 0 4px ${INK}, inset 0 0 0 3px #1a3a2c, 0 10px 0 rgba(10,7,18,0.5)`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center gap-[4%]" style={{ visibility: drawing ? "hidden" : "visible" }}>
          {/* The face-up trump is the pile's last card, so it counts. */}
          <Pile count={game.drawPile.length + (trumpCard ? 1 : 0)} stacked={game.drawPile.length > 0} cw={pileW} label="DRAW">
            {trumpCard && (
              <div className="absolute" style={{ left: pileW * 0.5, top: pileW * 0.35, transform: "rotate(90deg)", transformOrigin: "center" }} data-testid="trump-card">
                <PixelCard {...toPixelCardProps(trumpCard)} width={pileW} />
              </div>
            )}
          </Pile>
          <div className="flex flex-col items-center gap-2 min-w-[30%]">
            {game.trumpSuit && (
              <div className="font-pixel-display text-[9px] leading-none px-2 py-1.5" style={{ backgroundColor: "#0a0712", color: "#ead8b1" }}>
                TRUMP <Suit suit={game.trumpSuit} size={12} />
              </div>
            )}
            <StackColumns layers={game.stack?.layers} owners={game.stack?.owners} cardW={stackW} colorOf={colorOf} fromOf={fromOf} />
          </div>
          <Pile count={game.deadPile.length} cw={pileW} label="DEAD" />
        </div>
        {overlay && <div className="absolute inset-0 pointer-events-none">{overlay({ feltW, feltH: feltW * (compact ? 0.62 : 0.4), cardW: pileW })}</div>}
      </div>
      {seats.map((s) => {
        const [x, y] = PLATE_AT[s.position] ?? PLATE_AT.top;
        const half = (compact ? 78 : 160) / 2 + 4; // keeps the plate on screen
        return (
          <div key={s.seat} className="absolute z-20" style={{ left: `clamp(${half}px, ${x}%, calc(100% - ${half}px))`, top: `${y}%`, transform: "translate(-50%, -50%)" }} data-seat={s.seat}>
            <Plate {...s} compact={compact} />
          </div>
        );
      })}
    </div>
  );
}
