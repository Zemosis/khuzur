// OPPONENT SEAT — one player around the table: a name plate plus a preview of
// the cards they hold, always on the table side of the plate.
//
// Every seat uses the same plate and the same preview, so the table reads as
// symmetric: left and right are exact mirrors with tall plates, the top seat
// has a wide plate. Each fan is built like the player's own hand and turned to
// open toward the table. At most SHOWN backs are drawn; past that the last
// back is blurred and carries the rest as "+N".
//
// Small screens drop the fan (`layout`):
//   strip  phones held upright: a small upright plate sharing a strip above
//          the felt with the other opponents. Its status chip moves to the
//          bottom edge so it can't collide with the left tag.
//   row    short screens (phones on their side): a slim plate, stacked in a
//          column beside the felt.

import React, { useRef, useState } from "react";
import gsap from "gsap";
import { PixelAvatar, PixelCard } from "../PixelCard";
import Callout from "../Callout";
import ChatBubble from "../ChatBubble";
import PixelIcon from "../PixelIcon";
import { reducedMotion } from "../../utils/motion";

const CARD_W = 44;
const CARD_H = 64;
const SHOWN = 5; // backs drawn, the last one blurred when there are more
const STEP = 22; // offset between two backs
const ANGLE = 6; // degrees of fan between two backs
// Fan box before it is turned to face the table.
const FAN_W = CARD_W + (SHOWN - 1) * STEP + 28;
const FAN_H = CARD_H + 14;
// How far each seat's fan is turned so it opens toward the table: the fan is
// built like your own hand (opening upward), then rotated.
const TURN = { top: 180, left: 90, right: 270 };

const CHIP_PLACE = { left: "absolute -top-3 left-2", right: "absolute -top-3 right-2", bottom: "absolute -bottom-3" };

function StatusChip({ label, bg, fg = "#1a1024", blink, side = "right", hidden = false, innerRef, big = false }) {
  const chip = (
    <span
      ref={innerRef}
      className={`${side === "bottom" ? "" : CHIP_PLACE[side]} font-pixel-display leading-none whitespace-nowrap ${big ? "text-[12px] px-2 py-1.5" : "text-[10px] px-1.5 py-1"} ${blink ? "blink" : ""}`}
      style={{ backgroundColor: bg, color: fg, boxShadow: "0 0 0 2px #0a0712", visibility: hidden ? "hidden" : "visible" }}
    >
      {label}
    </span>
  );
  // Centred on the edge by a wrapper, so the chip's own transform stays free
  // for the landing bounce.
  return side === "bottom" ? <span className="absolute -bottom-3 inset-x-0 flex justify-center pointer-events-none">{chip}</span> : chip;
}

// Card backs held as a fan facing the table. Past SHOWN cards, the last back
// is blurred and carries the rest as "+N".
function HandPreview({ count, position }) {
  const drawn = Math.min(count, SHOWN);
  const blurLast = count > SHOWN;
  const extra = count - (SHOWN - 1);
  const mid = (drawn - 1) / 2;
  const turn = TURN[position];
  const sideways = position !== "top";
  const box = sideways ? { width: FAN_H, height: FAN_W } : { width: FAN_W, height: FAN_H };

  return (
    <div className="relative shrink-0" style={box}>
      <div
        className="absolute"
        style={{
          width: FAN_W,
          height: FAN_H,
          left: (box.width - FAN_W) / 2,
          top: (box.height - FAN_H) / 2,
          transform: `rotate(${turn}deg)`,
        }}
      >
        {Array.from({ length: drawn }, (_, i) => {
          const d = i - mid;
          // The "+N" card ends the fan in reading order. The top fan is turned
          // 180 degrees, so there its last card is the first one drawn; it is
          // stacked on top either way.
          const endIndex = position === "top" ? 0 : drawn - 1;
          const blurred = blurLast && i === endIndex;
          const rotation = d * ANGLE;
          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: FAN_W / 2 - CARD_W / 2 + d * STEP,
                bottom: 4 - d * d * 1.4,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: "50% 100%",
                zIndex: position === "top" ? drawn - i : i,
              }}
            >
              <div style={{ filter: blurred ? "blur(1.5px) brightness(0.7)" : "none" }}>
                <PixelCard faceDown size="small" />
              </div>
              {blurred && (
                <div
                  className="absolute inset-0 flex items-center justify-center font-pixel-display text-[12px] text-parchment"
                  style={{ transform: `rotate(${-turn - rotation}deg)`, textShadow: "2px 2px 0 #0a0712" }}
                >
                  +{extra}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TOP_PLATE_W = 184;
const SIDE_PLATE_W = 124;

// Games can override the plate's status chip (`chip`, null for none), add a
// second chip on the left (`tag`), replace the card count line (`detail`),
// name the seat for the deal animation (`dealSeat`, default: the position),
// and announce a decision over the avatar (`callout`: { id, label, bg, fg };
// each new id plays once, and the chip stays hidden until it lands).
// The player on turn gets a big TURN tag and a bobbing arrow; the others can
// be `dimmed` meanwhile. `bubble` (lines) shows what they just said.
const OpponentSection = ({
  player,
  isActive = false,
  hasPassed = false,
  position = "top",
  face,
  chip,
  tag,
  detail,
  dealSeat,
  callout,
  layout = "full",
  dimmed = false,
  bubble = null,
}) => {
  const { name, hand, isEliminated } = player;
  const count = hand.length;
  const vertical = position !== "top";
  const chipRef = useRef(null);
  const [landedId, setLandedId] = useState(null);
  const announcing = callout && callout.id !== landedId;
  const land = (id) => {
    setLandedId(id);
    if (chipRef.current && !reducedMotion()) {
      gsap.fromTo(chipRef.current, { scale: 1.6 }, { scale: 1, duration: 0.25, ease: "back.out(2)" });
    }
  };

  // Cards always sit between the plate and the table.
  // The top hand tucks up against its plate, held just in front of it.
  const compact = layout !== "full";
  const strip = layout === "strip";
  const arrangement = {
    strip: "flex-col flex-1 min-w-0",
    row: "w-full",
    full: { top: "flex-col -space-y-1", left: "flex-row gap-3", right: "flex-row-reverse gap-3" }[position],
  }[layout];
  const chipSide = strip ? "bottom" : "right";
  const cardCount = (
    <div className="font-pixel-body text-[18px] leading-none mt-1.5 text-bone/70 whitespace-nowrap">
      <span className="text-glow-cyan">{count}</span> {count === 1 ? "card" : "cards"}
    </div>
  );

  return (
    <div className={`flex items-center ${arrangement}`} data-seat={position} style={strip ? { maxWidth: 132 } : undefined}>
      <div
        data-plate={dealSeat ?? position}
        className={`relative flex items-center ${
          strip
            ? "w-full flex-col justify-center text-center gap-1 px-1 pt-3 pb-3"
            : compact
            ? "w-full gap-2 px-2 pt-2.5 pb-1.5"
            : vertical
              ? "flex-col justify-center text-center gap-2 px-2 py-3"
              : "gap-2.5 px-2.5 py-2"
        }`}
        style={{
          width: compact ? undefined : vertical ? SIDE_PLATE_W : TOP_PLATE_W,
          minHeight: vertical && !compact ? FAN_W - 8 : undefined,
          backgroundColor: isActive ? "#241a3a" : "#14102a",
          border: `4px solid ${isActive ? "#f4c430" : "#0a0712"}`,
          boxShadow: isActive
            ? "0 0 0 4px #0a0712, 0 0 18px rgba(244,196,48,0.45)"
            : "0 0 0 4px #0a0712, inset 0 4px 0 rgba(255,255,255,0.04)",
          animation: isActive ? "pulse-glow 1.6s ease-in-out infinite" : "none",
          // A fold dims the seat once its callout has landed.
          opacity: isEliminated && !announcing ? 0.55 : dimmed ? 0.6 : 1,
          transition: "opacity 300ms ease-out",
        }}
      >
        {announcing && <Callout key={callout.id} {...callout} targetRef={chipRef} onDone={() => land(callout.id)} />}
        {bubble && (
          // Above the seat it clears the TURN tag and arrow.
          <ChatBubble name={name.split(" #")[0]} lines={bubble} tail={position === "top" || strip ? "up" : "down"} gap={position === "top" || strip ? 14 : 40} />
        )}
        {isActive && (
          <span data-testid="turn-arrow" className="turn-arrow absolute left-1/2 -top-8 z-30 pointer-events-none" style={{ color: "#f4c430", filter: "drop-shadow(2px 2px 0 #0a0712)" }}>
            <PixelIcon name="down" size={18} />
          </span>
        )}
        {chip !== undefined ? (
          chip && <StatusChip {...chip} big={chip.label === "TURN"} side={chipSide} innerRef={chipRef} hidden={announcing} />
        ) : isEliminated ? (
          <StatusChip label="OUT" bg="#7a1530" fg="#ead8b1" side={chipSide} />
        ) : isActive ? (
          <StatusChip label="TURN" bg="#f4c430" blink big side={chipSide} />
        ) : hasPassed ? (
          <StatusChip label="PASS" bg="#463a78" fg="#ead8b1" side={chipSide} />
        ) : null}
        {tag && <StatusChip {...tag} side="left" />}
        <PixelAvatar
          variant={face?.variant ?? ((player.id || 0) % 5) + 1}
          customAvatarData={face?.customAvatarData}
          size={strip || compact ? 34 : vertical ? 68 : 51}
          active={isActive}
          eliminated={isEliminated && !announcing}
        />
        <div className={`min-w-0 max-w-full ${strip ? "w-full" : compact ? "flex-1" : ""}`}>
          <div className={`font-pixel-display text-parchment truncate ${compact ? "text-[10px]" : "text-[11px]"}`}>{name.split(" #")[0]}</div>
          {/* Compact, the deal lands on the card count: there is no fan. */}
          {compact ? <div data-deal-seat={dealSeat ?? position}>{detail ?? cardCount}</div> : (detail ?? cardCount)}
        </div>
      </div>

      {/* Always rendered (empty while dealing) so the seat keeps its shape;
          the deal animation lands cards on it. */}
      {!compact && (
        <div data-deal-seat={dealSeat ?? position} style={{ visibility: isEliminated ? "hidden" : "visible" }}>
          <HandPreview count={count} position={position} />
        </div>
      )}
    </div>
  );
};

export default OpponentSection;
