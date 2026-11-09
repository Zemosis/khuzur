// TABLE BUILDER — the switches for a Khuzur table's shape: players per team,
// teams (or players), the deal. In full (a practice game's builder) a live
// table sits beside them; compact (the host at a waiting table) is the
// switches alone, since the seats around them are the picture.

import React from "react";
import TablePreview from "./TablePreview";
import { INK } from "../pixelTokens";
import { KHUZUR_ACCENT } from "./teams";
import { createDeck } from "../../utils/khuzur/cards";
import { isValidTable } from "../../utils/khuzur/engine";

const PER_TEAM = [
  [1, "SOLO"],
  [2, "PAIRS"],
  [3, "TRIOS"],
];
const DEALS = [
  [5, "5 CARDS · 1 DECK"],
  [7, "7 CARDS · 2 DECKS"],
];

/** A row of choices that behave as radio buttons. */
function Choice({ label, options, value, onChange, compact }) {
  return (
    <div className={compact ? "flex items-center gap-2" : "flex flex-col gap-1.5"}>
      <div className={`font-pixel-display text-[10px] uppercase text-bone/70 tracking-wider ${compact ? "w-[84px] text-left shrink-0 whitespace-nowrap" : ""}`}>{label}</div>
      <div role="radiogroup" aria-label={label} className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
        {options.map(({ id, text, disabled }) => {
          const on = id === value;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(id)}
              className={`pixel-btn font-pixel-display text-[10px] uppercase disabled:opacity-40 ${compact ? "px-2 py-1.5" : "px-2.5 py-2"}`}
              style={on ? { backgroundColor: KHUZUR_ACCENT.main, borderColor: KHUZUR_ACCENT.deep, color: INK } : { backgroundColor: "#1f1a3d", borderColor: INK, color: "#ead8b1" }}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * value: { perTeam, teams, handSize, soloCount, teamCount } (the last two keep
 * each mode's count when switching back and forth); onChange(next value).
 */
export default function TableBuilder({ value, onChange, compact = false }) {
  const { perTeam, handSize, soloCount } = value;
  const set = (patch) => {
    const next = { ...value, ...patch };
    next.teams = next.perTeam === 1 ? next.soloCount : next.perTeam === 3 ? 2 : next.teamCount;
    if (next.perTeam === 3) next.teamCount = 2;
    onChange(next);
  };
  const table = { perTeam, teams: value.teams, handSize };
  const players = perTeam * value.teams;
  const dealt = players * handSize;
  const left = createDeck(handSize).length - dealt - 1;

  const choices = (
    <>
      <Choice compact={compact} label={compact ? "Per team" : "Players per team"} value={perTeam} onChange={(v) => set({ perTeam: v })} options={PER_TEAM.map(([id, text]) => ({ id, text }))} />
      {perTeam === 1 ? (
        <Choice compact={compact} label="Players" value={soloCount} onChange={(v) => set({ soloCount: v })} options={[2, 3, 4, 5, 6].map((id) => ({ id, text: compact ? String(id) : `${id} PLAYERS` }))} />
      ) : (
        <Choice
          compact={compact}
          label="Teams"
          value={value.teams}
          onChange={(v) => set({ teamCount: v })}
          options={[2, 3].map((id) => ({ id, text: `${id} TEAMS`, disabled: !isValidTable({ perTeam, teams: id }) }))}
        />
      )}
      <Choice compact={compact} label="Deal" value={handSize} onChange={(v) => set({ handSize: v })} options={DEALS.map(([id, text]) => ({ id, text: compact ? `${id} CARDS` : text }))} />
    </>
  );

  if (compact) return <div className="flex flex-col gap-1.5">{choices}</div>;
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex flex-col gap-3 sm:w-[55%]">
        {choices}
        <p className="font-pixel-body text-[19px] text-bone leading-tight">
          {players} players × {handSize} = {dealt} dealt · trump + {left} left to draw
        </p>
      </div>
      <div className="flex-1 flex items-center justify-center max-sm:max-w-[300px] max-sm:mx-auto max-sm:w-full">
        <TablePreview table={table} />
      </div>
    </div>
  );
}
