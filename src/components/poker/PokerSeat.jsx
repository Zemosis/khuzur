// POKER SEAT — one player beside the table, drawn like the seats in Thirteen
// and Muushig: a plate with the face, name and stack, and the two cards
// beside it on the table side (backs, or faces once shown). Chips on the
// plate's edges: its status at the top right (TURN, FOLDED, ALL-IN, WIN…)
// and its place in line to act (2ND, 3RD…) on the bottom edge. The seat on turn glows gold under a bobbing arrow, its
// turn clock draining under the plate. A CPU's level is a line under its
// stack (on a phone, its chip if nothing more pressing; a short screen has
// no room for it). An empty seat is a dashed plate, with
// + CPU for the host, which asks for the CPU's level.
//
// `position` says where the seat is: "left" and "right" columns (tall
// plates), "top" (a wide plate). `layout` follows the table: "row" (short
// screens) slim plates, "strip" (phones) a tiny plate with its cards under
// it. The cards hang off the plate, so the seat is exactly its plate.

import React, { useState } from "react";
import { PixelAvatar, PixelCard } from "../PixelCard";
import PixelIcon from "../PixelIcon";
import { LEVEL_COLOR } from "./seatInfo";
import { useMuck } from "./cardMotion";

const short = (name = "") => name.split(" #")[0];

// Plate sizes: [width, avatar] by layout and position.
const PLATE = {
  side: { w: 124, face: 68 },
  top: { w: 184, face: 51 },
  row: { w: 140, face: 34 },
  strip: { w: 68, face: 20 },
};
const CARD_W = { full: 44, row: 28, strip: 30 };
// Where the cards hang: toward the felt.
const CARDS_PLACE = {
  right: { left: "100%", top: "50%", marginLeft: 10, transform: "translateY(-50%)" },
  left: { right: "100%", top: "50%", marginRight: 10, transform: "translateY(-50%)" },
  below: { top: "100%", left: "50%", marginTop: 8, transform: "translateX(-50%)" },
};

function Chip({ label, bg, fg = "#1a1024", big = false, blink = false, className = "" }) {
  return (
    <span
      className={`font-pixel-display leading-none whitespace-nowrap ${big ? "text-[12px] px-2 py-1.5" : "text-[9px] px-1.5 py-1"} ${blink ? "blink" : ""} ${className}`}
      style={{ backgroundColor: bg, color: fg, boxShadow: "0 0 0 2px #0a0712" }}
    >
      {label}
    </span>
  );
}

const plateOf = (layout, position) => (layout === "full" ? (position === "top" ? PLATE.top : PLATE.side) : PLATE[layout]);
const cardsAt = (layout, position) => (layout === "strip" ? "below" : position === "right" ? "left" : "right");

/**
 * player: an engine seat (null: empty). face: PixelAvatar props. rel: the
 * seat relative to you, which the deal looks for (see useDeal).
 * tags: seatTags() for it. place: its place in line to act ("2ND"), or null.
 * clockMs / clockKey: the turn clock's time left, restarted when the key changes.
 * best: card ids to light up (the winning hand at a showdown).
 * onAddCpu(level): the host adds a CPU here at EASY | MEDIUM | HARD.
 */
export default function PokerSeat({ layout = "full", position = "left", ...props }) {
  const plate = plateOf(layout, position);
  if (!props.player) return <EmptySeat layout={layout} position={position} plate={plate} onAddCpu={props.isHost ? props.onAddCpu : null} />;
  return <TakenSeat layout={layout} position={position} plate={plate} {...props} />;
}

function TakenSeat({ player, face, rel, layout, position, plate, tags = [], isTurn = false, place = null, clockMs = null, clockKey, best = [], winner = false, isHost = false, onRemoveCpu }) {
  const [showCards, cardsRef] = useMuck(player.inHand && !player.folded && player.hole.length > 0, player.folded);
  const strip = layout === "strip";
  const slim = layout === "row";
  const tall = layout === "full" && position !== "top";
  const cardW = CARD_W[layout];
  const dim = player.folded || player.sittingOut || player.leaving;
  const level = tags.find((t) => LEVEL_COLOR[t.label]);
  const status = [
    isTurn && { label: "TURN", bg: "#f4c430", big: !strip, blink: true },
    winner && { label: "WIN", bg: "#9bd14f", fg: "#1a3a0e" },
    ...tags.filter((t) => !LEVEL_COLOR[t.label]),
  ].filter(Boolean);

  return (
    <div className="relative" style={{ width: plate.w }} data-seat-name={short(player.name)}>
      {isTurn && !strip && (
        <span data-testid="turn-arrow" className="turn-arrow absolute left-1/2 -top-9 z-30 pointer-events-none" style={{ color: "#f4c430", filter: "drop-shadow(2px 2px 0 #0a0712)" }}>
          <PixelIcon name="down" size={18} />
        </span>
      )}
      <div
        data-seat-plate
        className={`relative flex items-center ${
          strip ? "flex-col text-center gap-1 px-1 pt-3 pb-2" : tall ? "flex-col text-center gap-2 px-2 pt-4 pb-3" : slim ? "gap-2 px-1.5 pt-2 pb-1.5" : "gap-2 px-2 pt-3 pb-2"
        }`}
        style={{
          width: plate.w,
          backgroundColor: isTurn ? "#241a3a" : "#14102a",
          border: `${strip || slim ? 3 : 4}px solid ${isTurn ? "#f4c430" : winner ? "#9bd14f" : "#0a0712"}`,
          boxShadow: isTurn ? "0 0 0 4px #0a0712, 0 0 18px rgba(244,196,48,0.45)" : "0 0 0 4px #0a0712, inset 0 4px 0 rgba(255,255,255,0.04)",
          animation: isTurn ? "pulse-glow 1.6s ease-in-out infinite" : "none",
          opacity: dim ? 0.55 : 1,
          transition: "opacity 300ms ease-out",
        }}
      >
        {/* A phone's tiny plate has room for one chip: the most important. */}
        {strip ? (
          (status[0] || place || level) && (
            <span className="absolute -top-3 inset-x-0 flex justify-center pointer-events-none">
              <Chip {...(status[0] || (place ? { label: place, bg: "#1f1a3d", fg: "#f4c430" } : level))} />
            </span>
          )
        ) : (
          <>
            {status.length > 0 && (
              <span className="absolute -top-3 right-1.5 flex gap-1 pointer-events-none">
                {status.map((t) => (
                  <Chip key={t.label} {...t} />
                ))}
              </span>
            )}
            {place && (
              <span className="absolute -bottom-3 inset-x-0 flex justify-center pointer-events-none">
                <Chip label={place} bg="#1f1a3d" fg="#f4c430" />
              </span>
            )}
          </>
        )}
        <PixelAvatar variant={face?.variant} customAvatarData={face?.customAvatarData} size={plate.face} active={isTurn} eliminated={player.folded} />
        <div className={`min-w-0 ${tall || strip ? "w-full" : "flex-1"}`}>
          <div className={`font-pixel-display text-parchment truncate ${strip ? "text-[8px]" : "text-[10px]"}`} title={short(player.name)}>
            {short(player.name)}
          </div>
          <div className={`font-pixel-body leading-none mt-1 text-glow-gold tabular-nums ${strip ? "text-[16px]" : "text-[20px]"}`}>{player.stack}</div>
          {level && !strip && !slim && (
            <div className="font-pixel-display text-[8px] leading-none mt-1.5" style={{ color: level.bg }}>
              {level.label}
            </div>
          )}
        </div>
        {isHost && onRemoveCpu && player.type === "AI" && (
          <button
            aria-label={`Remove ${short(player.name)}`}
            className="absolute -bottom-2 -right-2 z-10 font-pixel-display text-[9px] px-1 py-0.5"
            style={{ backgroundColor: "#7a1530", color: "#ead8b1", boxShadow: "0 0 0 2px #0a0712" }}
            onClick={onRemoveCpu}
          >
            ×
          </button>
        )}
        {isTurn && clockMs != null && (
          <div className="absolute left-0 right-0 -bottom-[8px] h-[4px]" style={{ backgroundColor: "#0a0712" }}>
            <div key={clockKey} data-testid="turn-clock" className="poker-clock h-full" style={{ backgroundColor: "#f4c430", animationDuration: `${clockMs}ms` }} />
          </div>
        )}
      </div>
      {showCards && (
        <div ref={cardsRef} className="absolute flex z-[5]" style={CARDS_PLACE[cardsAt(layout, position)]} aria-label={`${short(player.name)}'s cards`}>
          {player.hole.map((c, i) => (
            // Backs tuck together; shown faces spread so both ranks read.
            <div key={c.id ?? i} data-deal-rel={rel} data-deal-card={i} style={{ marginLeft: i ? -Math.round(cardW * (c.hidden ? 0.45 : 0.1)) : 0 }}>
              {c.hidden ? (
                <PixelCard faceDown width={cardW} />
              ) : (
                <PixelCard rank={c.rank} suit={c.suit} width={cardW} style={{ boxShadow: best.includes(c.id) ? "0 0 0 3px #9bd14f" : undefined }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A dashed plate; for the host, + CPU opens a pick of the CPU's level. */
function EmptySeat({ layout, position, plate, onAddCpu }) {
  const [picking, setPicking] = useState(false);
  const tall = layout === "full" && position !== "top";
  return (
    <div
      className="relative flex flex-col items-center justify-center gap-2 font-pixel-display text-[9px] text-bone/50"
      data-seat-plate
      style={{ width: plate.w, height: tall ? 165 : layout === "full" ? 81 : layout === "row" ? 59 : 64, border: "3px dashed #2a234d" }}
    >
      {!onAddCpu && "EMPTY"}
      {onAddCpu && (
        <button
          className="pixel-btn font-pixel-display text-[9px] px-2 py-1.5"
          style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}
          onClick={() => setPicking((p) => !p)}
          aria-haspopup="menu"
          aria-expanded={picking}
        >
          + CPU
        </button>
      )}
      {picking && (
        <div
          role="menu"
          aria-label="CPU level"
          className="absolute left-1/2 top-full z-40 mt-2 flex flex-col gap-1 p-1.5"
          style={{ transform: "translateX(-50%)", backgroundColor: "#1f1a3d", border: "3px solid #0a0712", boxShadow: "4px 4px 0 #0a0712" }}
        >
          {["EASY", "MEDIUM", "HARD"].map((level) => (
            <button
              key={level}
              role="menuitem"
              className="pixel-hbtn font-pixel-display text-[9px] px-3 py-1.5 text-left"
              style={{ color: LEVEL_COLOR[level] }}
              onClick={() => {
                setPicking(false);
                onAddCpu(level);
              }}
            >
              {level}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
