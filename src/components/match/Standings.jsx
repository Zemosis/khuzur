// STANDINGS — every seat's finish, best first. Each row picks the player the
// summary and the timeline are about; yours is marked YOU. A player who left
// shows as LEFT, and the CPU that finished their seat gets its own row. At a
// credit match each staked player's row ends with the credits they won or
// lost (nets, by seat). A signed-in player's level (as it is now) sits by
// their name.

import React from "react";
import { INK } from "../pixelTokens";
import { ordinal } from "../profile/ordinal";
import { seatName } from "../../utils/matchSummary";
import { seatColor } from "./seatColors";
import { signed } from "../credits/signed";
import LevelTag from "../LevelTag";

const ACCENT = "#f4c430";

function Chip({ bg, fg = INK, children }) {
  return (
    <span className="font-pixel-display text-[8px] leading-none px-1.5 py-1 whitespace-nowrap" style={{ backgroundColor: bg, color: fg }}>
      {children}
    </span>
  );
}

export default function Standings({ standings, you, picked, onPick, nets = null }) {
  return (
    <div className="flex flex-col gap-1.5 p-3" role="list" aria-label="Standings">
      {standings.map((s) => {
        const on = s.seat === picked;
        const tag = s.name?.split(" #")[1];
        return (
          <button
            key={`${s.seat}-${s.kind}-${s.leftEarly}`}
            role="listitem"
            aria-pressed={on}
            aria-label={`${seatName(s)}: ${s.place ? ordinal(s.place) : "no place"}`}
            onClick={() => onPick(s.seat)}
            className="pixel-hbtn grid items-center gap-3 px-2.5 text-left font-pixel-body text-[20px]"
            style={{
              gridTemplateColumns: "54px minmax(0,1fr) auto auto",
              minHeight: 46,
              backgroundColor: on ? "#241a3a" : INK,
              boxShadow: `0 0 0 2px ${on ? ACCENT : "#2a234d"}`,
              opacity: s.leftEarly ? 0.6 : 1,
            }}
          >
            <span
              className="font-pixel-display text-[10px] text-center py-1"
              style={{ backgroundColor: s.place === 1 ? ACCENT : "#1f1a3d", color: s.place === 1 ? INK : "#ead8b1" }}
            >
              {s.leftEarly ? "LEFT" : s.place ? ordinal(s.place) : "-"}
            </span>
            {/* The chips wrap under the name on a narrow screen, never over it. */}
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 py-1.5">
              <span className="flex items-center gap-2 min-w-0 max-w-full">
                <span aria-hidden className="shrink-0" style={{ width: 12, height: 12, backgroundColor: seatColor(s.seat), boxShadow: `0 0 0 2px ${INK}` }} />
                <span className="truncate text-parchment">{seatName(s)}</span>
                {tag && <span className="text-bone/50 text-[18px] shrink-0">#{tag}</span>}
                <LevelTag level={s.xpLevel} />
              </span>
              {s.seat === you && s.kind === "human" && <Chip bg="#5fd4d6">YOU</Chip>}
              {s.kind === "cpu" && <Chip bg="#463a78" fg="#ead8b1">{s.level ? `CPU · ${s.level}` : "CPU"}</Chip>}
              {s.cpuTookOver && <Chip bg="#2a234d" fg="#ead8b1">CPU TOOK OVER</Chip>}
            </span>
            <span className="text-right tabular-nums text-parchment whitespace-nowrap">{s.score ?? "-"} pts</span>
            {(() => {
              const net = s.kind === "human" ? nets?.[s.seat] : null;
              return (
                <span
                  className="text-right tabular-nums whitespace-nowrap min-w-[52px]"
                  title={net == null ? undefined : "Credits won or lost"}
                  style={{ color: net > 0 ? "#f4c430" : net < 0 ? "#e85a7a" : "#8a7fb0" }}
                >
                  {net == null ? "" : `${signed(net)} CR`}
                </span>
              );
            })()}
          </button>
        );
      })}
    </div>
  );
}
