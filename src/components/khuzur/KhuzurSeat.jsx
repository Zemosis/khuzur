// KHUZUR SEAT — an opponent at the Khuzur table (see KhuzurTable), drawn like
// Muushig's: a plate just off the rim with the face, the name and how many
// cards they hold, their team's colour along its foot, and their cards face
// down on the felt in front of them (Muushig's SeatFan).
//
// Tags over the plate: the team on the left (MATE for yours), the status on
// the right (TURN, or their place once out). The seat on turn has a gold
// border under a bobbing arrow; the others are `dimmed` meanwhile. What a
// player just said opens in a ChatBubble beside the plate.
//
// `layout` follows the table: "compact" (phones) is a tiny upright plate.

import React, { useState } from "react";
import Callout from "../Callout";
import { PixelAvatar } from "../PixelCard";
import ChatBubble from "../ChatBubble";
import PixelIcon from "../PixelIcon";
import { INK } from "../pixelTokens";

const short = (name = "") => name.split(" #")[0];

const PLATE = {
  full: { w: 178, face: 36 },
  compact: { w: 74, face: 18 },
};

function Chip({ label, bg, fg = INK, blink = false }) {
  return (
    <span
      className={`inline-block font-pixel-display leading-none whitespace-nowrap text-[9px] px-1.5 py-1 ${blink ? "blink" : ""}`}
      style={{ backgroundColor: bg, color: fg, boxShadow: "0 0 0 2px #0a0712" }}
    >
      {label}
    </span>
  );
}

/** How many cards a seat holds, or OUT once they're out. Over five reads in rose: a big hand is trouble. */
function Held({ count, place, compact }) {
  if (place) {
    return (
      <div className="font-pixel-display text-[8px] leading-none mt-1.5" style={{ color: "#8a7fb0" }}>
        OUT
      </div>
    );
  }
  return (
    <div className={`flex items-baseline gap-1.5 mt-1 ${compact ? "justify-center" : ""}`}>
      <span className={`font-pixel-display leading-none ${compact ? "text-[8px]" : "text-[11px]"}`} style={{ color: count > 5 ? "#e85a7a" : "#f4c430" }}>
        {count}
      </span>
      {!compact && <span className="font-pixel-body text-[17px] leading-none text-bone/60">card{count === 1 ? "" : "s"}</span>}
    </div>
  );
}

/**
 * player: an engine seat ({ name, type, level }). face: PixelAvatar props.
 * seat: its place on the table (bottomLeft, top, …). color: its team colour.
 * count: cards held. place: where it finished, once out (else null).
 * tag: the left chip ({ label, bg, fg }) or null; chip: the right one.
 * isActive: on turn. dimmed: someone else is. bubble: lines just said;
 * bubbleAt: { side, align }. callout: { id, label, bg, fg }, what just
 * happened here (PICK UP, BEATEN!, OUT · 1ST…), each id popped once.
 */
export default function KhuzurSeat({ layout = "full", player, face, seat, color, count, place = null, tag = null, chip = null, isActive = false, dimmed = false, bubble = null, bubbleAt, callout = null }) {
  const compact = layout === "compact";
  const [calledOut, setCalledOut] = useState(null);
  const plate = PLATE[layout] ?? PLATE.full;
  return (
    <div className="relative" style={{ width: plate.w }} data-seat={seat}>
      {bubble && <ChatBubble name={short(player.name)} lines={bubble} side={bubbleAt?.side ?? "above"} align={bubbleAt?.align ?? "center"} gap={bubbleAt?.side === "above" ? 30 : 12} />}
      {callout && callout.id !== calledOut && <Callout key={callout.id} {...callout} onDone={() => setCalledOut(callout.id)} />}
      {isActive && !compact && (
        <span data-testid="turn-arrow" className="turn-arrow absolute left-1/2 -top-9 z-30 pointer-events-none" style={{ color: "#f4c430", filter: "drop-shadow(2px 2px 0 #0a0712)" }}>
          <PixelIcon name="down" size={18} />
        </span>
      )}
      <div
        data-plate={seat}
        className={`relative flex items-center ${compact ? "flex-col text-center gap-1 px-1 pt-2.5 pb-2" : "gap-2 p-2 pt-2.5 pb-3"}`}
        style={{
          width: plate.w,
          backgroundColor: isActive ? "#241a3a" : "#1f1a3d",
          border: `3px solid ${isActive ? "#f4c430" : "#2a234d"}`,
          boxShadow: `inset 0 -4px 0 ${color}, 3px 3px 0 #0a0712${isActive ? ", 0 0 16px rgba(244,196,48,0.45)" : ""}`,
          opacity: place ? 0.55 : dimmed ? 0.72 : 1,
          transition: "opacity 300ms ease-out, border-color 200ms",
        }}
      >
        {(chip || tag) && (
          <span className={`absolute -top-3 inset-x-1 flex ${tag && chip && !compact ? "justify-between" : compact ? "justify-center" : tag ? "justify-start" : "justify-end"} pointer-events-none`}>
            {tag && (!compact || !chip) && <Chip {...tag} />}
            {chip && <Chip {...chip} />}
          </span>
        )}
        <PixelAvatar variant={face?.variant} customAvatarData={face?.customAvatarData} size={plate.face} active={isActive} eliminated={!!place} />
        <div className={`min-w-0 ${compact ? "w-full" : "flex-1"}`}>
          <div className={`flex items-center gap-1 min-w-0 ${compact ? "justify-center" : ""}`}>
            <span className={`font-pixel-display truncate ${compact ? "text-[8px]" : "text-[10px]"}`} style={{ color: "#ead8b1" }} title={player.type === "AI" && player.level ? `${short(player.name)} · ${player.level} CPU` : short(player.name)}>
              {short(player.name)}
            </span>
          </div>
          <Held count={count} place={place} compact={compact} />
        </div>
      </div>
    </div>
  );
}
