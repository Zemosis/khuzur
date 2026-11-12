// KHUZUR SCOREBOARD — the sidebar's view of the match, built like Muushig's
// scoreboard: every seat with its face, name and how many cards it holds, the
// one on turn lit gold. Teams are grouped under a strip in their colour,
// with their place once they're out (first team out wins). In a free for all
// each seat is its own row.

import React from "react";
import { PixelAvatar } from "../PixelCard";
import { TEAM_COLORS, TEAM_NAMES, ordinal } from "./teams";

const short = (name = "") => name.split(" #")[0];

function StatusChip({ label, bg, fg = "#1a1024", blink = false }) {
  return (
    <span className={`font-pixel-display text-[10px] leading-none px-1.5 py-1 shrink-0 whitespace-nowrap ${blink ? "blink" : ""}`} style={{ backgroundColor: bg, color: fg }}>
      {label}
    </span>
  );
}

function Row({ player, face, isActive, isMe, isDealer, place, count }) {
  return (
    <li
      className="relative flex items-center gap-2 pl-2.5 pr-2 py-1"
      style={{ backgroundColor: isActive ? "#2e1a3a" : "#14102a", border: `2px solid ${isActive ? "#f4c430" : "#1f1a3d"}`, opacity: place ? 0.6 : 1 }}
    >
      {isMe && <span className="absolute left-0 top-0 bottom-0" style={{ width: 4, backgroundColor: "#5fd4d6" }} aria-label="You" />}
      <PixelAvatar variant={face.variant} customAvatarData={face.customAvatarData} size={30} eliminated={!!place} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-pixel-display text-[10px] text-parchment truncate">{short(player.name)}</span>
          {isDealer && (
            <span title="Dealer">
              <StatusChip label="D" bg="#5fd4d6" fg="#0a3a3a" />
            </span>
          )}
          {isActive && <StatusChip label="TURN" bg="#f4c430" blink />}
        </div>
        <div className="font-pixel-body text-[18px] leading-none mt-1 text-bone/70 whitespace-nowrap">{place ? "out" : `${count} card${count === 1 ? "" : "s"} left`}</div>
      </div>
      <div className="shrink-0 font-pixel-display text-[12px] leading-none text-right" style={{ width: 40, color: place === 1 ? "#f4c430" : place ? "#ead8b1" : count > 5 ? "#e85a7a" : "#ead8b1" }}>
        {place ? ordinal(place) : count}
      </div>
    </li>
  );
}

/**
 * game: the engine state. table: its shape. turn: the seat on turn (-1 for
 * none). dealer: the dealer's seat (-1 to hide). myIndex: your seat.
 * faceFor(seat): PixelAvatar props. countOf(seat): the cards it shows holding
 * (none before the deal, then as they're dealt).
 */
export default function KhuzurScoreBoard({ game, table, turn = -1, dealer = -1, myIndex = -1, faceFor, countOf = (seat) => game.players[seat].hand.length }) {
  const teams = table.perTeam > 1; // grouped under team strips
  const row = (p) => (
    <Row key={p.id} player={p} face={faceFor(p.id)} isActive={p.id === turn && !p.out} isMe={p.id === myIndex} isDealer={p.id === dealer} place={p.out ? game.places[p.team] : null} count={countOf(p.id)} />
  );
  // Teams (or players) still in first, then the ones out by place.
  const groups = Array.from({ length: table.teams }, (_, team) => ({ team, place: game.places[team], seats: game.players.filter((p) => p.team === team) })).sort(
    (a, b) => (a.place ?? 99) - (b.place ?? 99) || a.team - b.team,
  );

  return (
    <section className="flex flex-col" style={{ borderBottom: "4px solid #0a0712" }} aria-label="Scoreboard">
      <div className="px-3 flex items-center justify-between font-pixel-display text-[12px] tracking-wider" style={{ height: 40, backgroundColor: "#1a1024", color: "#f08a4b" }}>
        <span>{`MATCH ${game.matchNumber}`}</span>
        <span className="text-[10px] text-bone/70">FIRST OUT WINS</span>
      </div>
      <div className="p-2 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "42vh" }}>
        {teams
          ? groups.map(({ team, place, seats }) => (
              <div key={team} className="flex flex-col gap-1">
                <div className="flex items-center justify-between px-2 py-1 font-pixel-display text-[9px] leading-none" style={{ backgroundColor: "#0a0712", boxShadow: `inset 3px 0 0 ${TEAM_COLORS[team]}`, color: TEAM_COLORS[team] }}>
                  <span>
                    {TEAM_NAMES[team]} TEAM{seats.some((p) => p.id === myIndex) ? " · YOU" : ""}
                  </span>
                  {place && <span style={{ color: place === 1 ? "#f4c430" : "#ead8b1" }}>{ordinal(place)}</span>}
                </div>
                <ol className="flex flex-col gap-1">{seats.map(row)}</ol>
              </div>
            ))
          : (
            <ol className="flex flex-col gap-1">
              {groups.flatMap((g) => g.seats).map(row)}
            </ol>
          )}
      </div>
    </section>
  );
}
