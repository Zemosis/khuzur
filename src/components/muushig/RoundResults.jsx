// ROUND RESULTS — the overlay after a round's 5 tricks, and at match end.
//
// Each row: place, avatar, name, piles eaten, the score change and the new
// score. A player who ate all 5 gets ROUND WON; at match end the winner is
// named and the host can start a rematch. At a credit match the end says who
// took the pot, each staked seat shows what it won or lost, and everyone
// gets PLAY AGAIN (a new stake) in place of the host's REMATCH.

import React from "react";
import { PixelAvatar } from "../PixelCard";
import { fmt } from "../../utils/poker/tiers";
import { signed } from "../credits/signed";

const baseName = (name = "") => name.split(" #")[0];

function Row({ place, r, player, face, net = null }) {
  const tone = r.folded ? "#8a7fb0" : r.delta < 0 ? "#9bd14f" : "#e85a7a";
  return (
    <div className="flex items-center gap-3 px-3 py-2" style={{ backgroundColor: "#14102a", boxShadow: "0 0 0 2px #1f1a3d" }}>
      <span className="font-pixel-display text-[10px] w-6" style={{ color: place === 1 ? "#f4c430" : "#8a7fb0" }}>
        #{place}
      </span>
      <PixelAvatar variant={face.variant} customAvatarData={face.customAvatarData} size={34} eliminated={r.folded} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-pixel-display text-[11px] text-parchment truncate">{baseName(player.name)}</span>
          {r.eaten >= 5 && (
            <span className="font-pixel-display text-[10px] leading-none px-1.5 py-1" style={{ backgroundColor: "#f4c430", color: "#1a1024" }}>
              ROUND WON
            </span>
          )}
        </div>
        <div className="font-pixel-body text-[18px] leading-none mt-1 text-bone/70">{r.folded ? "folded" : `${r.eaten} eaten`}</div>
      </div>
      {net != null && (
        <span className="font-pixel-display text-[10px] text-right tabular-nums" style={{ color: net > 0 ? "#f4c430" : "#e85a7a" }}>
          {signed(net)}
        </span>
      )}
      <span className="font-pixel-display text-[12px] w-12 text-right" style={{ color: tone }}>
        {r.folded ? "±0" : `${r.delta > 0 ? "+" : ""}${r.delta}`}
      </span>
      <span className="font-pixel-display text-[14px] text-glow-gold w-14 text-right">{r.score}</span>
    </div>
  );
}

/** Who took a credit match's pot, in a line. */
function potLine(result, players) {
  if (result.void) return "THE MATCH WAS VOID: EVERY STAKE WENT BACK";
  const names = result.payouts.map((p) => baseName(players[p.seat].name).toUpperCase());
  if (!names.length) return `A BOT WON: THE ${fmt(result.pot)} POT IS LOST`;
  if (names.length === 1) return `${names[0]} WINS ${fmt(result.payouts[0].amount)} CREDITS`;
  return `${names.join(" & ")} SPLIT THE ${fmt(result.pot)} POT`;
}

/**
 * onNext: deals the next round (practice); without it the round closes by
 * itself (online). onRematch: absent for an online player who isn't the host.
 * credit: at a credit match, { stake, result (null while it's saved), onPlayAgain, error }.
 */
const RoundResults = ({ round, results, players, faceFor, matchWinner = null, onNext, onRematch, onExit, credit = null }) => {
  const over = matchWinner !== null;
  const result = over ? credit?.result : null;
  // Each staked seat's net once the pot is paid: its payout less its stake.
  const netOf = (seat) => {
    if (!result || result.void || !result.staked.includes(seat)) return null;
    return (result.payouts.find((p) => p.seat === seat)?.amount ?? 0) - credit.stake;
  };
  // The match's own order (engine endRound): lowest score, then more piles
  // eaten this round, then seat, so a tie at match end puts the winner first.
  const ranked = [...results].sort((a, b) => a.score - b.score || b.eaten - a.eaten || a.seat - b.seat);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(10,7,18,0.8)", backdropFilter: "blur(3px)" }}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex flex-col gap-4 p-4 sm:p-6 w-[480px] max-w-full max-h-full overflow-y-auto"
        style={{ backgroundColor: "#1f1a3d", border: "4px solid #0a0712", boxShadow: "0 0 0 4px #463a78, 8px 8px 0 #0a0712" }}
      >
        <div className="text-center">
          <div className={`font-pixel-display text-[16px] text-glow-gold ${over ? "shimmer-text" : ""}`}>
            {over ? "MATCH OVER" : `ROUND ${round} SCORED`}
          </div>
          {over && (
            <div className="font-pixel-display text-[11px] text-parchment mt-3">{baseName(players[matchWinner].name).toUpperCase()} WINS THE MATCH!</div>
          )}
          {over && credit && (
            <div role="status" className={`font-pixel-display text-[11px] mt-3 ${result ? "text-glow-gold" : "text-bone/70 blink"}`}>
              {result ? potLine(result, players) : "PAYING OUT THE POT..."}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-3 font-pixel-display text-[10px] text-bone/50">
          <span className="w-12 text-right">ROUND</span>
          <span className="w-14 text-right">SCORE</span>
        </div>
        <div className="flex flex-col gap-1.5 -mt-2">
          {ranked.map((r, i) => (
            <Row key={r.seat} place={i + 1} r={r} player={players[r.seat]} face={faceFor(r.seat)} net={netOf(r.seat)} />
          ))}
        </div>
        <div className="flex justify-center items-center gap-3 mt-1">
          {over ? (
            <>
              <button
                onClick={onExit}
                className="pixel-btn font-pixel-display text-[11px] px-5 py-3"
                style={{ backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" }}
              >
                EXIT
              </button>
              {credit ? (
                <button
                  onClick={credit.onPlayAgain}
                  disabled={!result}
                  autoFocus
                  className="pixel-btn font-pixel-display text-[11px] px-6 py-3"
                  style={{ backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#1a3a0e" }}
                >
                  PLAY AGAIN · {fmt(credit.stake)}
                </button>
              ) : onRematch ? (
                <button
                  onClick={onRematch}
                  autoFocus
                  className="pixel-btn font-pixel-display text-[11px] px-6 py-3"
                  style={{ backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#1a3a0e" }}
                >
                  REMATCH
                </button>
              ) : (
                <span className="font-pixel-display text-[10px] text-bone/70 blink">WAITING FOR THE HOST</span>
              )}
            </>
          ) : onNext ? (
            <button
              onClick={onNext}
              autoFocus
              className="pixel-btn font-pixel-display text-[11px] px-6 py-3"
              style={{ backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#1a3a0e" }}
            >
              NEXT ROUND
            </button>
          ) : (
            // Online: the server deals the next round itself.
            <span className="font-pixel-display text-[10px] text-bone/70 blink">NEXT ROUND STARTING...</span>
          )}
        </div>
        {over && credit?.error && (
          <p role="alert" className="font-pixel-body text-[20px] text-center leading-tight" style={{ color: "#e85a7a" }}>
            {credit.error}
          </p>
        )}
      </div>
    </div>
  );
};

export default RoundResults;
