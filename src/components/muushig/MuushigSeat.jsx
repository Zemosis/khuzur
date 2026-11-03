// MUUSHIG SEAT — an opponent at the stadium table (see StadiumTable), drawn
// like Poker's: a plate on the rim with the face, the name and the piles eaten
// this round (five boxes; all five wins the round), and (SeatFan) the cards
// they hold, face down on the felt in front of them.
//
// Tags over the plate: its status on the right (TURN, FOLD, IN, DRAW…), and a
// second one on the left. A decision (IN! / FOLD) pops over the plate as a
// Callout and shrinks into the status tag, which waits hidden until it lands.
// The seat on turn has a gold border under a bobbing arrow; the others can be
// `dimmed` meanwhile. What a player
// just said opens in a ChatBubble beside the plate, where `bubbleAt` says.
//
// `layout` follows the table: "compact" (phones) is a tiny upright plate.

import React, { useRef, useState } from "react";
import gsap from "gsap";
import { PixelAvatar, PixelCard } from "../PixelCard";
import Callout from "../Callout";
import ChatBubble from "../ChatBubble";
import PixelIcon from "../PixelIcon";
import LevelTag from "../LevelTag";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { reducedMotion } from "../../utils/motion";

const short = (name = "") => name.split(" #")[0];

const PLATE = {
  full: { w: 156, face: 36 },
  compact: { w: 70, face: 18 },
};

function Chip({ label, bg, fg = "#1a1024", blink = false, innerRef, hidden = false }) {
  return (
    <span
      ref={innerRef}
      className={`inline-block font-pixel-display leading-none whitespace-nowrap text-[9px] px-1.5 py-1 ${blink ? "blink" : ""}`}
      style={{ backgroundColor: bg, color: fg, boxShadow: "0 0 0 2px #0a0712", visibility: hidden ? "hidden" : "visible" }}
    >
      {label}
    </span>
  );
}

/** Piles eaten this round, one box per trick; gold once eaten, glowing on a sweep. */
function Eaten({ eaten, folded, compact }) {
  if (folded) {
    return (
      <div className="font-pixel-display text-[8px] leading-none mt-1.5" style={{ color: "#8a7fb0" }}>
        FOLDED
      </div>
    );
  }
  const sweep = eaten >= 5;
  const pip = compact ? 7 : 10;
  return (
    <div className={`flex gap-[3px] mt-1.5 ${compact ? "justify-center" : ""}`} title={`${eaten} eaten this round`} aria-label={`${eaten} of 5 piles eaten`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            width: pip,
            height: pip,
            backgroundColor: i < eaten ? "#f4c430" : "#0a0712",
            boxShadow: i < eaten ? `inset 0 -2px 0 #c89820, 0 0 0 1px #0a0712${sweep ? ", 0 0 6px rgba(244,196,48,0.8)" : ""}` : "inset 0 0 0 2px #463a78",
          }}
        />
      ))}
    </div>
  );
}

/**
 * player: an engine seat ({ name, eaten, status }). face: PixelAvatar props.
 * seat: its name on the table (bottomLeft, topLeft, …), for the cards flying
 * to it (data-plate).
 * chip: the status tag ({ label, bg, fg, blink }) or null; tag: the left one.
 * isActive: on turn. dimmed: someone else is. callout: { id, label, bg, fg },
 * each new id played once. bubble: lines just said; bubbleAt: { side, align }.
 */
export default function MuushigSeat({ layout = "full", player, face, seat, chip = null, tag = null, isActive = false, dimmed = false, callout = null, bubble = null, bubbleAt, xpLevel = null }) {
  const compact = layout === "compact";
  const plate = PLATE[layout] ?? PLATE.full;
  const folded = player.status === "fold";
  const chipRef = useRef(null);
  const [landedId, setLandedId] = useState(null);
  const announcing = callout && callout.id !== landedId;
  const land = (id) => {
    setLandedId(id);
    if (chipRef.current && !reducedMotion()) gsap.fromTo(chipRef.current, { scale: 1.6 }, { scale: 1, duration: 0.25, ease: "back.out(2)" });
  };

  return (
    <div className="relative" style={{ width: plate.w }} data-seat={seat}>
      {bubble && <ChatBubble name={short(player.name)} lines={bubble} side={bubbleAt?.side ?? "above"} align={bubbleAt?.align ?? "center"} gap={bubbleAt?.side === "above" ? 30 : 12} />}
      {announcing && <Callout key={callout.id} {...callout} targetRef={chipRef} onDone={() => land(callout.id)} />}
      {isActive && !compact && (
        <span data-testid="turn-arrow" className="turn-arrow absolute left-1/2 -top-9 z-30 pointer-events-none" style={{ color: "#f4c430", filter: "drop-shadow(2px 2px 0 #0a0712)" }}>
          <PixelIcon name="down" size={18} />
        </span>
      )}
      <div
        data-plate={seat}
        className={`relative flex items-center ${compact ? "flex-col text-center gap-1 px-1 pt-2.5 pb-1.5" : "gap-2 p-2 pt-2.5"}`}
        style={{
          width: plate.w,
          backgroundColor: isActive ? "#241a3a" : "#1f1a3d",
          border: `3px solid ${isActive ? "#f4c430" : "#2a234d"}`,
          boxShadow: isActive ? "3px 3px 0 #0a0712, 0 0 16px rgba(244,196,48,0.45)" : "3px 3px 0 #0a0712",
          // A fold dims the seat once its callout has landed.
          opacity: folded && !announcing ? 0.55 : dimmed ? 0.7 : 1,
          transition: "opacity 300ms ease-out, border-color 200ms",
        }}
      >
        {(chip || tag) && (
          <span className={`absolute -top-3 inset-x-1 flex ${tag && !compact ? "justify-between" : compact ? "justify-center" : "justify-end"} pointer-events-none`}>
            {tag && !compact && <Chip {...tag} />}
            {chip ? <Chip {...chip} innerRef={chipRef} hidden={announcing} /> : compact && tag && <Chip {...tag} />}
          </span>
        )}
        <PixelAvatar variant={face?.variant} customAvatarData={face?.customAvatarData} size={plate.face} active={isActive} eliminated={folded && !announcing} />
        <div className={`min-w-0 ${compact ? "w-full" : "flex-1"}`}>
          <div className={`flex items-center gap-1 min-w-0 ${compact ? "justify-center" : ""}`}>
            <span className={`font-pixel-display truncate ${compact ? "text-[8px]" : "text-[10px]"}`} style={{ color: "#ead8b1" }} title={short(player.name)}>
              {short(player.name)}
            </span>
            {!compact && <LevelTag level={xpLevel} />}
          </div>
          <Eaten eaten={player.eaten} folded={folded} compact={compact} />
        </div>
      </div>
    </div>
  );
}

const SHOWN = 5;

/**
 * An opponent's cards, face down on the felt: a fan built like your own hand
 * (opening upward), turned `turn` degrees to open toward the middle of the
 * table. The box is what the deal and card flights aim at (data-deal-seat),
 * with the cards' width on it (data-card-w), so they land at the right size.
 */
export function SeatFan({ seat, count, cardW, turn, hidden = false }) {
  const cardH = Math.round(cardW * CARD_RATIO);
  const step = Math.round(cardW * 0.42);
  const drawn = Math.min(count, SHOWN);
  const mid = (drawn - 1) / 2;
  const fanW = cardW + (SHOWN - 1) * step + 12;
  const fanH = cardH + 10;
  const box = Math.round(Math.max(fanW, fanH) * 0.8);
  return (
    <div data-deal-seat={seat} data-card-w={cardW} className="relative" style={{ width: box, height: box, visibility: hidden ? "hidden" : "visible" }} aria-label={`${count} cards`}>
      <div className="absolute left-1/2 top-1/2" style={{ width: fanW, height: fanH, transform: `translate(-50%, -50%) rotate(${turn}deg)` }}>
        {Array.from({ length: drawn }, (_, i) => {
          const d = i - mid;
          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: fanW / 2 - cardW / 2 + d * step,
                bottom: 4 - d * d * 1.2,
                transform: `rotate(${d * 6}deg)`,
                transformOrigin: "50% 100%",
                filter: "drop-shadow(2px 3px 0 rgba(10,7,18,0.45))",
              }}
            >
              <PixelCard faceDown width={cardW} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
