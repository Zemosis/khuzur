// SUMMARY — the picked player's match beside the table's average. A figure
// better than the average is green, worse is red. Thirteen adds the hands
// they played, when the match recorded them (players only, not CPUs).

import React from "react";
import HandsPlayed from "../profile/HandsPlayed";
import { summaryRows } from "../../utils/matchSummary";

const fmt = (v) => (v == null ? "-" : Number.isInteger(v) ? v : v.toFixed(1));

function tone({ mine, avg, better }) {
  if (mine == null || avg == null || Math.abs(mine - avg) < 0.05) return "#ead8b1";
  return (better === "high" ? mine > avg : mine < avg) ? "#9bd14f" : "#e85a7a";
}

export default function Summary({ gameType, rounds, seat, name, hands }) {
  const rows = summaryRows(gameType, rounds, seat);
  return (
    <div className="flex flex-col gap-4 p-3">
      <h3 className="font-pixel-display text-[11px] text-parchment">{name}</h3>
      <div role="table" aria-label={`${name} against the table`} className="grid font-pixel-body text-[20px]" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto", columnGap: 18, rowGap: 6 }}>
        <div role="row" className="contents">
          {/* Takes its grid cell: a visually hidden (absolute) label would shift the row. */}
          <span role="columnheader"><span className="sr-only">Figure</span></span>
          <span role="columnheader" className="font-pixel-display text-[9px] text-bone/60 text-right">PLAYER</span>
          <span role="columnheader" className="font-pixel-display text-[9px] text-bone/60 text-right">TABLE AVG</span>
        </div>
        {rows.map((r) => (
          <div role="row" key={r.label} className="contents">
            <span role="rowheader" className="text-bone">{r.label}</span>
            <span role="cell" className="text-right tabular-nums" style={{ color: tone(r) }}>{fmt(r.mine)}</span>
            <span role="cell" className="text-right tabular-nums text-bone/70">{fmt(r.avg)}</span>
          </div>
        ))}
      </div>
      {gameType === "thirteen" && hands && Object.keys(hands).length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-pixel-display text-[9px] text-bone/70">HANDS PLAYED</h4>
          <HandsPlayed hands={hands} />
        </div>
      )}
    </div>
  );
}
