// BLACKJACK SEAT — one of the five places on the half-moon's curve, drawn
// around its betting circle (the table positions the circle's centre): the
// circle holds the bet as a chip stack, the seat's hands sit above it (side
// by side after a split, the hand being played outlined in gold), and the
// player's plate sits below it: avatar, name, bankroll, and in the betting
// window READY / BETTING / SITTING OUT. Once a round is settled each hand's
// total gives way to its result. An empty seat is a dashed plate with SIT.

import React from "react";
import { PixelAvatar, PixelCard } from "../PixelCard";
import ChipStack from "../poker/ChipStack";
import LevelTag from "../LevelTag";
import { PHASES } from "../../utils/blackjack/engine";
import { MIN_BET } from "../../utils/blackjack/rules";
import { SEAT_SIZE, fmt, resultTag, short, totalTag } from "./tableInfo";

function Tag({ label, bg, fg = "#0a0712", ...rest }) {
  return (
    <span
      className="font-pixel-display text-[9px] leading-none px-1.5 py-1 whitespace-nowrap"
      style={{ backgroundColor: bg, color: fg, boxShadow: "0 0 0 2px #0a0712" }}
      {...rest}
    >
      {label}
    </span>
  );
}

/** READY / BETTING / SITTING OUT while betting; SITTING OUT (or LEFT) during a round it isn't in. */
function statusOf(player, phase) {
  if (player.leaving) return { label: "LEFT", bg: "#2a234d", fg: "#c8b890" };
  if (phase === PHASES.BETTING) {
    if (player.ready) return { label: "READY", bg: "#9bd14f" };
    if (player.bet > 0 || (player.skipped === 0 && player.bankroll >= MIN_BET)) return { label: "BETTING", bg: "#2a234d", fg: "#c8b890" };
    return { label: "SITTING OUT", bg: "#2a234d", fg: "#c8b890" };
  }
  if (phase !== PHASES.WAITING && !player.inRound) return { label: "SITTING OUT", bg: "#2a234d", fg: "#c8b890" };
  return null;
}

function Hand({ hand, cardW, current, settled, showBet }) {
  const tag = settled && hand.result ? resultTag(hand) : totalTag(hand);
  const step = Math.round(cardW * 0.42);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span>
        <Tag label={tag.label} bg={tag.bg} fg={tag.fg} data-result={settled && hand.result ? hand.result : undefined} />
      </span>
      <div className="flex items-end" style={{ padding: 3, boxShadow: current ? "0 0 0 3px #f4c430, 0 0 12px rgba(244,196,48,0.5)" : "none" }}>
        {hand.cards.map((c, i) => (
          <div key={c.id ?? i} style={{ marginLeft: i ? step - cardW : 0, marginBottom: i * 5 }}>
            <PixelCard rank={c.rank} suit={c.suit} width={cardW} />
          </div>
        ))}
      </div>
      {showBet && <span className="font-pixel-body text-[18px] leading-none text-glow-gold tabular-nums">{fmt(hand.bet)}</span>}
    </div>
  );
}

/**
 * seat: 0–4. player: the view's seat (null: empty). face: PixelAvatar props.
 * isMe: your seat. turnHand: the hand being played here, or null.
 * canSit / onSit: SIT on an empty seat (active only when canSit).
 * edge: "left" | "right" for a seat at the table's edge, else null.
 */
export default function BlackjackSeat({ seat, player, face, isMe = false, turnHand = null, phase, layout = "full", edge = null, xpLevel = null, canSit = false, onSit }) {
  const size = SEAT_SIZE[layout] ?? SEAT_SIZE.full;
  const compact = layout === "compact";
  const playing = !!player?.inRound && player.hands.length > 0;
  const bet = playing ? player.hands.reduce((sum, h) => sum + h.bet, 0) : (player?.bet ?? 0);
  const active = turnHand != null || (isMe && phase === PHASES.BETTING);
  const status = player ? statusOf(player, phase) : null;
  const settled = phase === PHASES.ROUND_OVER;

  return (
    <div className="relative" style={{ width: size.circle, height: size.circle }}>
      {/* The betting circle, printed on the felt. */}
      <div
        className="absolute inset-0"
        style={{
          borderRadius: "50%",
          border: active ? "3px solid #f4c430" : "3px dashed rgba(234,216,177,0.35)",
          boxShadow: active ? "0 0 14px rgba(244,196,48,0.5)" : "none",
        }}
      />
      {bet > 0 && (
        <div className="absolute left-1/2 top-1/2" style={{ transform: "translate(-50%, -50%)" }}>
          <ChipStack amount={bet} chipSize={size.chip} />
        </div>
      )}

      {playing && (
        <div
          className="absolute left-1/2 flex items-end gap-2 z-[5]"
          style={{ bottom: "100%", marginBottom: compact ? 4 : 8, transform: "translateX(-50%)" }}
          aria-label={`${isMe ? "Your" : `${short(player.name)}'s`} cards`}
        >
          {player.hands.map((hand, i) => (
            <Hand key={i} hand={hand} cardW={size.card} current={turnHand === i} settled={settled} showBet={player.hands.length > 1} />
          ))}
        </div>
      )}

      <div className="absolute left-1/2" style={{ top: "100%", marginTop: compact ? 10 : 14, transform: "translateX(-50%)" }}>
        {player ? (
          <Plate player={player} face={face} isMe={isMe} onTurn={turnHand != null} status={status} size={size} compact={compact} edge={edge} xpLevel={xpLevel} />
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ width: size.plate, height: compact ? 40 : 50, border: "3px dashed #463a78" }}
          >
            <button
              onClick={() => onSit?.(seat)}
              disabled={!canSit}
              className="pixel-btn font-pixel-display text-[10px] px-2 py-1"
              style={{ backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#142a08" }}
            >
              SIT
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// A status tag wider than a phone's plate grows inward at the table's edges.
const TAG_ALIGN = { left: "justify-start", right: "justify-end" };

function Plate({ player, face, isMe, onTurn, status, size, compact, edge, xpLevel }) {
  return (
    <div
      className={`relative flex items-center ${compact ? "flex-col gap-1 px-1 pt-2.5 pb-1.5" : "gap-1.5 p-1.5 pt-2"}`}
      style={{
        width: size.plate,
        backgroundColor: "#1f1a3d",
        border: `3px solid ${onTurn ? "#5fd4d6" : isMe ? "#f4c430" : "#2a234d"}`,
        boxShadow: "3px 3px 0 #0a0712",
        opacity: player.leaving || status?.label === "SITTING OUT" ? 0.6 : 1,
      }}
    >
      {status && (
        <span className={`absolute -top-3 inset-x-0 flex pointer-events-none whitespace-nowrap ${(compact && TAG_ALIGN[edge]) || "justify-center"}`}>
          <Tag {...status} />
        </span>
      )}
      <PixelAvatar variant={face?.variant} customAvatarData={face?.customAvatarData} size={size.face} />
      <div className={`min-w-0 ${compact ? "w-full text-center" : "flex-1"}`}>
        <div className={`flex items-center gap-1 min-w-0 ${compact ? "justify-center" : ""}`}>
          <span className="font-pixel-display truncate text-[10px]" style={{ color: isMe ? "#f4c430" : "#ead8b1" }} title={short(player.name)}>
            {short(player.name)}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 mt-1 ${compact ? "justify-center" : ""}`}>
          <span className="font-pixel-body leading-none text-bone tabular-nums text-[18px]">{fmt(player.bankroll)}</span>
          {!compact && <LevelTag level={xpLevel} />}
        </div>
      </div>
    </div>
  );
}
