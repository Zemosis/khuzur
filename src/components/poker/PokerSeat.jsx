// POKER SEAT — one player at the table, drawn like Blackjack's: a plate on the
// rim with the face, name and stack, and (SeatCards) their two cards on the
// felt in front of them, backs or faces once shown. Tags over the plate: its
// status (TURN, FOLDED, ALL-IN, WIN…), and under it its place in line to act
// (2ND, 3RD…). The seat on turn has a cyan border, under a bobbing arrow (yours
// has your cards outlined instead), its turn clock draining under the plate;
// your own plate is gold. What a player
// does pops over the plate (a Callout). A CPU's level is a line under its
// stack (on a phone, its tag if nothing more pressing). An empty seat is a
// dashed plate, with + CPU for the host, which asks for the CPU's level.
//
// `layout` follows the table: "compact" (phones) is a tiny plate.

import React, { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { reducedMotion } from "../../utils/motion";
import { PixelAvatar, PixelCard } from "../PixelCard";
import PixelIcon from "../PixelIcon";
import LevelTag from "../LevelTag";
import Callout from "../Callout";
import { HandReward } from "../RewardPanel";
import { LEVEL_COLOR } from "./seatInfo";
import { useMuck } from "./cardMotion";

const short = (name = "") => name.split(" #")[0];

const PLATE = {
  full: { w: 156, h: 66, face: 36 },
  compact: { w: 66, h: 62, face: 17 },
};

function Chip({ label, bg, fg = "#1a1024", blink = false }) {
  return (
    <span className={`font-pixel-display leading-none whitespace-nowrap text-[9px] px-1.5 py-1 ${blink ? "blink" : ""}`} style={{ backgroundColor: bg, color: fg, boxShadow: "0 0 0 2px #0a0712" }}>
      {label}
    </span>
  );
}

/**
 * player: an engine seat (null: empty). face: PixelAvatar props. isMe: your own.
 * tags: seatTags() for it. place: its place in line to act ("2ND"), or null.
 * clockMs / clockKey: the turn clock's time left, restarted when the key changes.
 * callout: { id, label, bg, fg, delay } to pop over it, or null; onCalloutDone(id).
 * reward: what the hand paid you, floating up from your plate until onRewardDone.
 * below: a line under the stack ("+300 next hand").
 * opensUp: the + CPU menu opens over the plate, for seats near the table's foot.
 * onAddCpu(level): the host adds a CPU here at EASY | MEDIUM | HARD.
 */
export default function PokerSeat({ layout = "full", ...props }) {
  const plate = PLATE[layout] ?? PLATE.full;
  if (!props.player) return <EmptySeat plate={plate} onAddCpu={props.isHost ? props.onAddCpu : null} opensUp={props.opensUp} />;
  return <TakenSeat compact={layout === "compact"} plate={plate} {...props} />;
}

function TakenSeat({ player, face, compact, plate, isMe = false, tags = [], isTurn = false, place = null, clockMs = null, clockKey, winner = false, isHost = false, onRemoveCpu, xpLevel = null, callout = null, onCalloutDone, reward = null, onRewardDone, below = null }) {
  const dim = player.folded || player.sittingOut || player.leaving;
  const level = tags.find((t) => LEVEL_COLOR[t.label]);
  const status = [
    isTurn && { label: "TURN", bg: "#f4c430", blink: true },
    winner && { label: "WIN", bg: "#9bd14f", fg: "#1a3a0e" },
    ...tags.filter((t) => !LEVEL_COLOR[t.label]),
  ].filter(Boolean);

  return (
    <div className="relative" style={{ width: plate.w }} data-seat-name={short(player.name)}>
      {callout && <Callout key={callout.id} label={callout.label} bg={callout.bg} fg={callout.fg} delay={callout.delay} onDone={() => onCalloutDone?.(callout.id)} />}
      {reward && (
        <div className="absolute z-40 bottom-full mb-2 left-1/2" style={{ transform: "translateX(-50%)" }}>
          <HandReward key={`${reward.expAfter}`} reward={reward} onDone={onRewardDone} />
        </div>
      )}
      {isTurn && !compact && !isMe && (
        <span data-testid="turn-arrow" className="turn-arrow absolute left-1/2 -top-9 z-30 pointer-events-none" style={{ color: "#f4c430", filter: "drop-shadow(2px 2px 0 #0a0712)" }}>
          <PixelIcon name="down" size={18} />
        </span>
      )}
      <div
        data-seat-plate
        className={`relative flex items-center ${compact ? "flex-col text-center gap-1 px-1 pt-2.5 pb-1.5" : "gap-2 p-2 pt-2.5"}`}
        style={{
          width: plate.w,
          backgroundColor: "#1f1a3d",
          border: `3px solid ${isTurn ? "#5fd4d6" : winner ? "#9bd14f" : isMe ? "#f4c430" : "#2a234d"}`,
          boxShadow: "3px 3px 0 #0a0712",
          opacity: dim ? 0.6 : 1,
          transition: "opacity 300ms ease-out",
        }}
      >
        {/* A phone's tiny plate has room for one tag: the most important. */}
        {compact ? (
          (status[0] || place || level) && (
            <span className="absolute -top-3 inset-x-0 flex justify-center pointer-events-none">
              <Chip {...(status[0] || (place ? { label: place, bg: "#1f1a3d", fg: "#f4c430" } : level))} />
            </span>
          )
        ) : (
          <>
            {status.length > 0 && (
              <span className="absolute -top-3 right-1 flex gap-1 pointer-events-none">
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
        <PixelAvatar variant={face?.variant} customAvatarData={face?.customAvatarData} size={plate.face} eliminated={player.folded} />
        <div className={`min-w-0 ${compact ? "w-full" : "flex-1"}`}>
          <div className={`flex items-center gap-1 min-w-0 ${compact ? "justify-center" : ""}`}>
            <span className={`font-pixel-display truncate ${compact ? "text-[8px]" : "text-[10px]"}`} style={{ color: isMe ? "#f4c430" : "#ead8b1" }} title={short(player.name)}>
              {short(player.name)}
            </span>
          </div>
          <div className={`flex items-center gap-1.5 mt-1 ${compact ? "justify-center" : ""}`}>
            <span className={`font-pixel-body leading-none text-bone tabular-nums ${compact ? "text-[18px]" : "text-[20px]"}`}>{player.stack.toLocaleString("en-US")}</span>
            {!compact && <LevelTag level={xpLevel} />}
          </div>
          {level && !compact && (
            <div className="font-pixel-display text-[8px] leading-none mt-1" style={{ color: level.bg }}>
              {level.label}
            </div>
          )}
          {below && <div className="font-pixel-body text-[18px] leading-none mt-1" style={{ color: "#9bd14f" }}>{below}</div>}
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
    </div>
  );
}

/**
 * A seat's two cards on the felt, flying to the muck when it folds. rel: the
 * seat relative to you, which the deal looks for (see useDeal). best: card ids
 * to light up (the winning hand at a showdown). Your own lie wider apart; a
 * label names whose they are. Cards shown at a showdown turn over.
 */
export function SeatCards({ player, rel, cardW, best = [], label, spread = 0.1 }) {
  const holding = !!player?.inHand && !player.folded && player.hole.length > 0;
  const [show, ref] = useMuck(holding, !!player?.folded);
  const hidden = (player?.hole ?? []).map((c) => !!c.hidden);
  const wasHidden = useRef(hidden);
  useLayoutEffect(() => {
    const before = wasHidden.current;
    wasHidden.current = hidden;
    const el = ref.current;
    if (!el) return;
    const turned = [...el.children].filter((_, i) => before[i] && !hidden[i]);
    if (!turned.length) return;
    const tween = gsap.fromTo(turned, { scaleX: 0 }, { scaleX: 1, duration: reducedMotion() ? 0.05 : 0.24, stagger: 0.08, ease: "power2.out", clearProps: "transform" });
    return () => tween.progress(1).kill();
  });
  if (!show || !player) return null;
  return (
    <div ref={ref} className="flex" aria-label={label}>
      {player.hole.map((c, i) => (
        // Backs tuck together; shown faces spread so both ranks read.
        <div key={c.id ?? i} className="relative" data-deal-rel={rel} data-deal-card={i} style={{ marginLeft: i ? -Math.round(cardW * (c.hidden ? 0.45 : spread)) : 0 }}>
          {c.hidden ? <PixelCard faceDown width={cardW} /> : <PixelCard rank={c.rank} suit={c.suit} width={cardW} style={{ boxShadow: best.includes(c.id) ? "0 0 0 3px #9bd14f" : undefined }} />}
        </div>
      ))}
    </div>
  );
}

/** A dashed plate; for the host, + CPU opens a pick of the CPU's level. */
function EmptySeat({ plate, onAddCpu, opensUp = false }) {
  const [picking, setPicking] = useState(false);
  return (
    <div
      className="relative flex flex-col items-center justify-center gap-2 font-pixel-display text-[9px] text-bone/50"
      data-seat-plate
      style={{ width: plate.w, height: plate.h, border: "3px dashed #463a78", backgroundColor: "rgba(20,16,42,0.6)" }}
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
          className={`absolute left-1/2 z-40 flex flex-col gap-1 p-1.5 ${opensUp ? "bottom-full mb-2" : "top-full mt-2"}`}
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
