// BLACKJACK SCOREBOARD — everyone at the table by what they've won or lost
// since sitting down, most first: the net in green or rose beside their name
// (a rebuy doesn't wipe it), and under it the rounds they played, how many
// they came out ahead and how often they rebought. Balances are on the
// plates at the table.
// The player on their turn gets a gold frame; your row a cyan marker. Same
// rows as the other games' scoreboards.

import React from "react";
import { PixelAvatar } from "../PixelCard";
import { fmt, short } from "./tableInfo";

const PLACE_COLOR = ["#f4c430", "#ead8b1", "#c89820", "#8a7fb0", "#8a7fb0"];

const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `-${fmt(-n)}` : "0");

/** seats: the view's seats. turn: the seat on its turn, or null. faceFor(seat): PixelAvatar props. */
export default function BlackjackScoreBoard({ seats = [], turn = null, mySeat = -1, faceFor }) {
  const ranked = seats
    .map((p, seat) => p && { ...p, seat })
    .filter(Boolean)
    .sort((a, b) => (b.net ?? 0) - (a.net ?? 0) || a.seat - b.seat);

  return (
    <section className="flex flex-col" style={{ borderBottom: "4px solid #0a0712" }} aria-label="Scoreboard">
      <div className="px-3 flex items-center justify-between font-pixel-display text-[12px] tracking-wider" style={{ height: 40, backgroundColor: "#1a1024", color: "#5fd4d6" }}>
        <span>SCOREBOARD</span>
        <span className="text-[10px] text-bone/70">NET</span>
      </div>
      {ranked.length === 0 ? (
        <p className="px-3 py-3 font-pixel-body text-[20px] text-bone/60">Nobody's seated yet.</p>
      ) : (
        <ol className="p-2 flex flex-col gap-1">
          {ranked.map((p, rank) => {
            const net = p.net ?? 0;
            const face = faceFor?.(p.seat) || { variant: (p.seat % 5) + 1 };
            const onTurn = p.seat === turn;
            return (
              <li
                key={p.seat}
                data-score-seat={p.seat}
                className="relative flex items-center gap-2 pl-2.5 pr-2 py-1"
                style={{ backgroundColor: onTurn ? "#2e1a3a" : "#14102a", border: `2px solid ${onTurn ? "#f4c430" : "#1f1a3d"}`, opacity: p.leaving ? 0.6 : 1 }}
              >
                {p.seat === mySeat && <span className="absolute left-0 top-0 bottom-0" style={{ width: 4, backgroundColor: "#5fd4d6" }} aria-label="You" />}
                <span className="font-pixel-display text-[10px] shrink-0" style={{ width: 22, color: PLACE_COLOR[rank] }}>
                  #{rank + 1}
                </span>
                <PixelAvatar variant={face.variant} customAvatarData={face.customAvatarData} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 min-w-0">
                    <span className="font-pixel-display text-[10px] text-parchment truncate">{short(p.name)}</span>
                    <span data-net className="font-pixel-display text-[12px] tabular-nums leading-none shrink-0" style={{ color: net > 0 ? "#9bd14f" : net < 0 ? "#e85a7a" : "rgba(200,184,144,0.7)" }}>
                      {signed(net)}
                    </span>
                  </div>
                  {/* Wraps rather than running under the net when there's a lot to say. */}
                  <div className="font-pixel-body text-[18px] leading-tight mt-1 text-bone/70">
                    <span className="whitespace-nowrap">{p.rounds ?? 0} played</span> · <span className="whitespace-nowrap">{p.won ?? 0} won</span>
                    {p.rebuys > 0 && (
                      <>
                        {" · "}
                        <span className="whitespace-nowrap">{`${p.rebuys} rebuy${p.rebuys === 1 ? "" : "s"}`}</span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
