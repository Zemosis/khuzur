// POKER SEAT — one player around the oval: face, name and stack, their two
// cards (backs, or faces once shown), and tags for the button, the blinds,
// all-in, folded and sitting out. The seat on turn gets the gold TURN tag,
// the bobbing arrow and the turn clock draining under the plate. An empty
// seat is a dashed spot, with +CPU for the host.

import React from "react";
import { PixelAvatar, PixelCard } from "../PixelCard";
import PixelIcon from "../PixelIcon";

const short = (name = "") => name.split(" #")[0];

function Tag({ label, bg, fg = "#1a1024" }) {
  return (
    <span className="font-pixel-display text-[9px] leading-none px-1.5 py-1 whitespace-nowrap" style={{ backgroundColor: bg, color: fg, boxShadow: "0 0 0 2px #0a0712" }}>
      {label}
    </span>
  );
}

/**
 * player: an engine seat (null: empty). face: PixelAvatar props.
 * clockMs / clockKey: the turn clock's time left, restarted when the key changes.
 * best: card ids to light up (the winning hand at a showdown).
 */
export default function PokerSeat({ player, face, tags = [], isTurn = false, clockMs = null, clockKey, best = [], winner = false, cardWidth = 40, small = false, isHost = false, onAddCpu, onRemoveCpu }) {
  if (!player) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 font-pixel-display text-[9px] text-bone/50"
        style={{ width: small ? 96 : 132, minHeight: small ? 64 : 84, border: "3px dashed #2a234d" }}
      >
        EMPTY
        {isHost && onAddCpu && (
          <button className="pixel-btn font-pixel-display text-[9px] px-2 py-1.5" style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }} onClick={onAddCpu}>
            + CPU
          </button>
        )}
      </div>
    );
  }

  const dim = player.folded || player.sittingOut || player.leaving;
  return (
    <div className="relative flex flex-col items-center" data-seat-name={short(player.name)}>
      {isTurn && (
        <span data-testid="turn-arrow" className="turn-arrow absolute left-1/2 -top-8 z-30 pointer-events-none" style={{ color: "#f4c430", filter: "drop-shadow(2px 2px 0 #0a0712)" }}>
          <PixelIcon name="down" size={18} />
        </span>
      )}
      <div className="flex gap-1 mb-1 flex-wrap justify-center min-h-[18px]">
        {isTurn && <Tag label="TURN" bg="#f4c430" />}
        {winner && <Tag label="WIN" bg="#9bd14f" fg="#1a3a0e" />}
        {tags.map((t) => (
          <Tag key={t.label} {...t} />
        ))}
      </div>
      <div
        className="relative flex items-center gap-2 px-2 py-1.5"
        style={{
          width: small ? 96 : 132,
          backgroundColor: "#14102a",
          border: `3px solid ${isTurn ? "#f4c430" : winner ? "#9bd14f" : "#1f1a3d"}`,
          boxShadow: "0 0 0 3px #0a0712",
          opacity: dim ? 0.55 : 1,
          transition: "opacity 300ms ease-out",
        }}
      >
        <PixelAvatar variant={face?.variant} customAvatarData={face?.customAvatarData} size={small ? 26 : 34} eliminated={player.folded} />
        <div className="min-w-0 flex-1">
          <div className="font-pixel-display text-[9px] text-parchment truncate">{short(player.name)}</div>
          <div className="font-pixel-body text-[18px] leading-none mt-1 text-glow-gold tabular-nums">{player.stack}</div>
        </div>
        {isHost && onRemoveCpu && player.type === "AI" && (
          <button aria-label={`Remove ${short(player.name)}`} className="absolute -top-2 -right-2 font-pixel-display text-[9px] px-1 py-0.5" style={{ backgroundColor: "#7a1530", color: "#ead8b1" }} onClick={onRemoveCpu}>
            ×
          </button>
        )}
        {isTurn && clockMs != null && (
          <div className="absolute left-0 right-0 -bottom-[7px] h-[4px]" style={{ backgroundColor: "#0a0712" }}>
            <div key={clockKey} data-testid="turn-clock" className="poker-clock h-full" style={{ backgroundColor: "#f4c430", animationDuration: `${clockMs}ms` }} />
          </div>
        )}
      </div>
      {player.inHand && !player.folded && player.hole.length > 0 && (
        <div className="flex mt-1.5" aria-label={`${short(player.name)}'s cards`}>
          {player.hole.map((c, i) =>
            c.hidden ? (
              <PixelCard key={i} faceDown width={cardWidth} style={{ marginLeft: i ? -cardWidth * 0.45 : 0 }} />
            ) : (
              <PixelCard
                key={c.id}
                rank={c.rank}
                suit={c.suit}
                width={cardWidth}
                style={{ marginLeft: i ? -cardWidth * 0.45 : 0, boxShadow: best.includes(c.id) ? "0 0 0 3px #9bd14f" : undefined }}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
