// SCOREBOARD — standings for the current match, lowest score first.
//
// Names only (no #tag: it can't fit at a readable size). Each row: place,
// avatar, name + status chip, cards left, and score against the elimination
// limit. The player whose turn it is gets a gold frame; your own row has a
// cyan marker on the left.

import React from "react";
import { PixelAvatar } from "../PixelCard";
import { GAME_SETTINGS } from "../../utils/constants";

const PLACE_COLOR = ["#f4c430", "#ead8b1", "#c89820", "#8a7fb0"];

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

/** covered: a credit match's seats ({ away, roundsLeft, forfeited } or null per seat). */
const ScoreBoard = ({ players = [], currentPlayerIndex = 0, roundNumber = 1, matchWins = [0, 0, 0, 0], myIndex = -1, faceFor, covered = null }) => {
  const maxScore = GAME_SETTINGS.ELIMINATION_SCORE;

  const ranked = players
    .map((p, i) => ({ ...p, originalIndex: i }))
    .sort((a, b) => a.score - b.score || a.originalIndex - b.originalIndex);

  return (
    <section className="flex flex-col" style={{ borderBottom: "4px solid #0a0712" }} aria-label="Scoreboard">
      <div
        className="px-3 flex items-center justify-between font-pixel-display text-[12px] tracking-wider"
        style={{ height: 40, backgroundColor: "#1a1024", color: "#f4c430" }}
      >
        <span>SCOREBOARD</span>
        <span className="text-[10px] text-bone/70">ROUND {roundNumber}</span>
      </div>

      <ol className="p-2 flex flex-col gap-1">
        {ranked.map((player, rankIdx) => {
          const index = player.originalIndex;
          const isActive = index === currentPlayerIndex && !player.isEliminated;
          const isMe = index === myIndex;
          const pct = Math.min((player.score / maxScore) * 100, 100);
          const wins = matchWins[index] || 0;

          return (
            <li
              key={player.id ?? index}
              className="relative flex items-center gap-2 pl-2.5 pr-2 py-1"
              style={{
                backgroundColor: isActive ? "#2e1a3a" : "#14102a",
                border: `2px solid ${isActive ? "#f4c430" : "#1f1a3d"}`,
                opacity: player.isEliminated ? 0.6 : 1,
              }}
            >
              {isMe && (
                <span className="absolute left-0 top-0 bottom-0" style={{ width: 4, backgroundColor: "#5fd4d6" }} aria-label="You" />
              )}
              <span className="font-pixel-display text-[10px] shrink-0" style={{ width: 22, color: PLACE_COLOR[rankIdx] }}>
                #{rankIdx + 1}
              </span>
              <PixelAvatar
                variant={faceFor ? faceFor(index).variant : ((player.id ?? index) % 5) + 1}
                customAvatarData={faceFor?.(index).customAvatarData}
                size={34}
                eliminated={player.isEliminated}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-pixel-display text-[10px] text-parchment truncate">{baseName(player.name)}</span>
                  {player.isEliminated ? (
                    <StatusChip label="OUT" bg="#7a1530" fg="#ead8b1" />
                  ) : isActive ? (
                    <StatusChip label="TURN" bg="#f4c430" blink />
                  ) : player.hasPassed ? (
                    <StatusChip label="PASS" bg="#463a78" fg="#ead8b1" />
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
                  {player.hand.length} cards
                  {wins > 0 && <span className="text-glow-gold"> · {wins}W</span>}
                </div>
              </div>
              <div className="shrink-0 text-right" style={{ width: 58 }}>
                <div className="font-pixel-display text-[12px] text-glow-gold leading-none">
                  {player.score}
                  <span className="text-[10px] text-bone/50">/{maxScore}</span>
                </div>
                <div className="mt-1.5" style={{ height: 6, backgroundColor: "#0a0712", boxShadow: "0 0 0 1px #1f1a3d" }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      transition: "width 300ms ease",
                      backgroundColor: pct >= 80 ? "#e85a7a" : pct >= 60 ? "#f4c430" : "#9bd14f",
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

export default ScoreBoard;
