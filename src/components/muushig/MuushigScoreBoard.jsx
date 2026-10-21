// MUUSHIG SCOREBOARD — standings for the match, lowest score first (first to
// 0 wins).
//
// Same rows as Thirteen's scoreboard: place, avatar, name + status chip, and
// the score on the right. The sub line shows this round's eaten tricks and
// what they will do to the score (-1 per trick, +5 for none). The bar under
// the score fills as a player closes in on 0. At a credit match a seat a bot
// is covering shows how many rounds its player has left to come back.

import React from "react";
import { PixelAvatar } from "../PixelCard";

const PLACE_COLOR = ["#f4c430", "#ead8b1", "#c89820", "#8a7fb0", "#8a7fb0"];
const baseName = (name = "") => name.split(" #")[0];

function StatusChip({ label, bg, fg = "#1a1024", blink = false }) {
  return (
    <span
      className={`font-pixel-display text-[10px] leading-none px-1.5 py-1 shrink-0 whitespace-nowrap ${blink ? "blink" : ""}`}
      style={{ backgroundColor: bg, color: fg }}
    >
      {label}
    </span>
  );
}

/** Score change this round: -1 per eaten trick, +5 for none, 0 when folded. */
const roundDelta = (p) => (p.folded ? 0 : p.eaten > 0 ? -p.eaten : 5);

/** covered: a credit match's seats ({ away, roundsLeft, forfeited } or null per seat). */
const MuushigScoreBoard = ({ players = [], currentPlayerIndex = -1, dealerIndex = -1, startScore = 15, myIndex = -1, faceFor, covered = null }) => {
  const ranked = players
    .map((p, i) => ({ ...p, originalIndex: i }))
    // Same order as the match result: lowest score, then more piles eaten this round.
    .sort((a, b) => a.score - b.score || (b.eaten || 0) - (a.eaten || 0) || a.originalIndex - b.originalIndex);

  return (
    <section className="flex flex-col" style={{ borderBottom: "4px solid #0a0712" }} aria-label="Scoreboard">
      <div
        className="px-3 flex items-center justify-between font-pixel-display text-[12px] tracking-wider"
        style={{ height: 40, backgroundColor: "#1a1024", color: "#e85a7a" }}
      >
        <span>SCOREBOARD</span>
        <span className="text-[10px] text-bone/70">FIRST TO 0</span>
      </div>

      <ol className="p-2 flex flex-col gap-1">
        {ranked.map((player, rankIdx) => {
          const index = player.originalIndex;
          const isActive = index === currentPlayerIndex && !player.folded;
          const isMe = index === myIndex;
          const pct = Math.max(0, Math.min(100, (1 - player.score / startScore) * 100));
          const delta = roundDelta(player);
          const face = faceFor?.(index) || { variant: (index % 5) + 1 };

          return (
            <li
              key={player.id ?? index}
              className="relative flex items-center gap-2 pl-2.5 pr-2 py-1"
              style={{
                backgroundColor: isActive ? "#2e1a3a" : "#14102a",
                border: `2px solid ${isActive ? "#f4c430" : "#1f1a3d"}`,
                opacity: player.folded ? 0.6 : 1,
              }}
            >
              {isMe && (
                <span className="absolute left-0 top-0 bottom-0" style={{ width: 4, backgroundColor: "#5fd4d6" }} aria-label="You" />
              )}
              <span className="font-pixel-display text-[10px] shrink-0" style={{ width: 22, color: PLACE_COLOR[rankIdx] }}>
                #{rankIdx + 1}
              </span>
              <PixelAvatar variant={face.variant} customAvatarData={face.customAvatarData} size={34} eliminated={player.folded} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-pixel-display text-[10px] text-parchment truncate">{baseName(player.name)}</span>
                  {index === dealerIndex && (
                    <span title="Dealer">
                      <StatusChip label="D" bg="#5fd4d6" fg="#0a3a3a" />
                    </span>
                  )}
                  {player.folded ? (
                    <StatusChip label="FOLD" bg="#463a78" fg="#ead8b1" />
                  ) : isActive ? (
                    <StatusChip label="TURN" bg="#f4c430" blink />
                  ) : null}
                  {covered?.[index]?.forfeited ? (
                    <span title="Away too long: this seat is a bot's now">
                      <StatusChip label="FORFEITED" bg="#7a1530" fg="#ead8b1" />
                    </span>
                  ) : covered?.[index]?.away ? (
                    <span title={`A bot is covering. ${covered[index].roundsLeft} round${covered[index].roundsLeft === 1 ? "" : "s"} left to come back`}>
                      <StatusChip label={`AWAY ${covered[index].roundsLeft}`} bg="#c89820" />
                    </span>
                  ) : null}
                </div>
                <div className="font-pixel-body text-[18px] leading-none mt-1 text-bone/70 whitespace-nowrap">
                  {player.folded ? (
                    "sitting out"
                  ) : player.eaten >= 5 ? (
                    <span className="text-glow-gold">round won · -5</span>
                  ) : (
                    <>
                      {player.eaten} eaten
                      <span className="text-bone/40"> · </span>
                      <span style={{ color: delta < 0 ? "#9bd14f" : "#e85a7a" }}>
                        {delta > 0 ? "+" : ""}
                        {delta}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right" style={{ width: 58 }}>
                <div className="font-pixel-display text-[12px] text-glow-gold leading-none">
                  {player.score}
                  <span className="text-[10px] text-bone/50">pt</span>
                </div>
                <div className="mt-1.5" style={{ height: 6, backgroundColor: "#0a0712", boxShadow: "0 0 0 1px #1f1a3d" }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      transition: "width 300ms ease",
                      backgroundColor: pct >= 66 ? "#9bd14f" : pct >= 33 ? "#f4c430" : "#e85a7a",
                    }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default MuushigScoreBoard;
