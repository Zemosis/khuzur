// ROUND LIST — every round, folded to one line (who won it) and opening to
// each seat's result and the round's key plays. Matches recorded before key
// plays were kept just show the results.

import React from "react";
import CardChip from "../CardChip";
import { COMBO_NAMES } from "../../utils/constants";
import { seatName } from "../../utils/matchSummary";
import { seatColor } from "./seatColors";

const Cards = ({ cards = [] }) => (
  <span className="inline-flex flex-wrap gap-1 align-middle">
    {cards.map((c, i) => (
      <CardChip key={i} card={c} />
    ))}
  </span>
);

function headline(gameType, round, nameOf) {
  if (gameType === "muushig") {
    if (round.winnerSeat != null) return `${nameOf(round.winnerSeat)} swept the round`;
    const most = Math.max(...round.results.map((r) => r.eaten ?? 0));
    const top = round.results.filter((r) => !r.folded && most > 0 && r.eaten === most).map((r) => nameOf(r.seat));
    return top.length ? `Most piles: ${top.join(", ")}` : "No piles eaten";
  }
  return round.winnerSeat != null ? `${nameOf(round.winnerSeat)} went out first` : "";
}

function Highlights({ gameType, highlights, nameOf }) {
  if (!highlights?.length) return null;
  const items = [];
  if (gameType === "muushig") {
    const went = highlights.filter((h) => h.type === "in").map((h) => nameOf(h.seat));
    const folded = highlights.filter((h) => h.type === "fold").map((h) => nameOf(h.seat));
    if (went.length) items.push(<>Went in: {went.join(", ")}</>);
    if (folded.length) items.push(<>Folded: {folded.join(", ")}</>);
    for (const h of highlights) {
      if (h.type === "takeTrump") items.push(<>{nameOf(h.seat)} took the trump <Cards cards={[h.card]} /></>);
      else if (h.type === "keepTrump") items.push(<>{nameOf(h.seat)} left the trump</>);
      else if (h.type === "eat") items.push(<>Trick {h.trick}: {nameOf(h.seat)} ate{h.card && <> with <Cards cards={[h.card]} /></>}</>);
    }
  } else {
    for (const h of highlights) {
      const combo = COMBO_NAMES[h.combo] || "";
      if (h.type === "win") items.push(<>{nameOf(h.seat)} went out with {combo && `${combo.toLowerCase()} `}<Cards cards={h.cards} /></>);
      else if (h.type === "big") items.push(<>{nameOf(h.seat)} played {combo.toLowerCase()} <Cards cards={h.cards} /></>);
      else if (h.type === "two") items.push(<>{nameOf(h.seat)} played a 2 <Cards cards={h.cards} /></>);
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="font-pixel-display text-[9px] text-bone/70">KEY PLAYS</h4>
      <ul className="flex flex-col gap-1.5 font-pixel-body text-[19px] text-bone leading-tight">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// Cards left in Thirteen (a seat already knocked out sits the round out: "-").
function detail(gameType, r, winnerSeat) {
  if (gameType === "muushig") return r.folded ? "folded" : r.eaten ?? 0;
  if (r.seat !== winnerSeat && r.eliminated && !r.cardsLeft) return "-";
  return r.cardsLeft ?? 0;
}

export default function RoundList({ gameType, rounds, seats, picked }) {
  const byseat = Object.fromEntries(seats.map((s) => [s.seat, s]));
  const nameOf = (seat) => (byseat[seat] ? seatName(byseat[seat]) : `seat ${seat + 1}`);
  if (!rounds.length) return <p className="font-pixel-body text-[20px] text-bone/70 p-3">No rounds were recorded for this match.</p>;
  return (
    <div className="flex flex-col gap-2 p-3">
      {rounds.map((round) => (
        <details key={round.number} className="group" style={{ backgroundColor: "#0a0712", boxShadow: "0 0 0 2px #2a234d" }}>
          <summary className="flex items-center gap-3 px-3 py-2 cursor-pointer list-none font-pixel-body text-[20px]">
            <span className="font-pixel-display text-[10px] text-glow-gold w-[86px] shrink-0">ROUND {round.number}</span>
            <span className="text-parchment truncate">{headline(gameType, round, nameOf)}</span>
            <span aria-hidden className="ml-auto font-pixel-display text-[10px] text-bone/60 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="flex flex-col gap-3 px-3 pb-3">
            <table className="w-full font-pixel-body text-[19px]">
              <thead>
                <tr className="font-pixel-display text-[9px] text-bone/60">
                  <th className="text-left font-normal py-1">PLAYER</th>
                  <th className="text-right font-normal">{gameType === "muushig" ? "PILES" : "CARDS"}</th>
                  <th className="text-right font-normal">POINTS</th>
                  <th className="text-right font-normal">SCORE</th>
                </tr>
              </thead>
              <tbody>
                {round.results.map((r) => (
                  <tr key={r.seat} style={{ color: r.seat === picked ? "#ead8b1" : "#c8b890" }}>
                    <td className="py-0.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden style={{ width: 8, height: 8, backgroundColor: seatColor(r.seat) }} />
                        {nameOf(r.seat)}
                        {r.seat === round.winnerSeat && <span className="font-pixel-display text-[8px] px-1 py-0.5" style={{ backgroundColor: "#f4c430", color: "#1a1024" }}>{gameType === "muushig" ? "SWEEP" : "OUT"}</span>}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{detail(gameType, r, round.winnerSeat)}</td>
                    <td className="text-right tabular-nums">{r.points == null ? "-" : `${r.points > 0 ? "+" : ""}${r.points}`}</td>
                    <td className="text-right tabular-nums">{r.scoreAfter ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Highlights gameType={gameType} highlights={round.highlights} nameOf={nameOf} />
          </div>
        </details>
      ))}
    </div>
  );
}
