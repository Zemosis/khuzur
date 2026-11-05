// KHUZUR LOBBY — the table builder the host uses (practice only for now):
// players per team, how many teams (or players), the deal, and a live table
// beside the switches. START seats you with CPUs in every other seat.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Btn, Panel, TopBar } from "../../components/PixelUI";
import PixelIcon from "../../components/PixelIcon";
import SettingsModal from "../../components/SettingsModal";
import TablePreview from "../../components/khuzur/TablePreview";
import { INK, TONES } from "../../components/pixelTokens";
import { createDeck } from "../../utils/khuzur/cards";
import { isValidTable } from "../../utils/khuzur/engine";

export const KHUZUR_ACCENT = { main: "#f08a4b", deep: "#a8552a" };
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
function Choice({ label, options, value, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-pixel-display text-[10px] uppercase text-bone/70 tracking-wider">{label}</div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
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
              className="pixel-btn font-pixel-display text-[11px] uppercase px-3 py-2.5 disabled:opacity-40"
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

export default function LobbyKhuzur() {
  const navigate = useNavigate();
  const { identity } = useAuth();
  const [perTeam, setPerTeam] = useState(2);
  const [teamCount, setTeamCount] = useState(2);
  const [soloCount, setSoloCount] = useState(4);
  const [handSize, setHandSize] = useState(5);
  const [showSettings, setShowSettings] = useState(false);

  const teams = perTeam === 1 ? soloCount : perTeam === 3 ? 2 : teamCount;
  const table = { perTeam, teams, handSize };
  const players = perTeam * teams;
  const dealt = players * handSize;
  const left = createDeck(handSize).length - dealt - 1;

  const start = () =>
    navigate("/game-khuzur", { state: { table, playerName: `${identity.name} #${identity.tag}` } });

  return (
    <div className="relative w-full h-screen starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TopBar title="Khuzur" accent={KHUZUR_ACCENT.main} onSettings={() => setShowSettings(true)} />
      <main className="flex-1 min-h-0 w-full overflow-y-auto flex justify-center" style={{ padding: "var(--gap)" }}>
        <Panel title="Build your table" icon="cards" deep={KHUZUR_ACCENT.deep} className="w-full max-w-[980px] h-fit">
          <div className="flex flex-col md:flex-row gap-6 p-4">
            <div className="flex flex-col gap-4 md:w-[46%]">
              <Choice
                label="Players per team"
                value={perTeam}
                onChange={(v) => {
                  setPerTeam(v);
                  if (v === 3) setTeamCount(2);
                }}
                options={PER_TEAM.map(([id, text]) => ({ id, text }))}
              />
              {perTeam === 1 ? (
                <Choice
                  label="Players"
                  value={soloCount}
                  onChange={setSoloCount}
                  options={[2, 3, 4, 5, 6].map((id) => ({ id, text: `${id} PLAYERS` }))}
                />
              ) : (
                <Choice
                  label="Teams"
                  value={teams}
                  onChange={setTeamCount}
                  options={[2, 3].map((id) => ({ id, text: `${id} TEAMS`, disabled: !isValidTable({ perTeam, teams: id }) }))}
                />
              )}
              <Choice label="Deal" value={handSize} onChange={setHandSize} options={DEALS.map(([id, text]) => ({ id, text }))} />
              <p className="font-pixel-body text-[20px] text-bone leading-tight">
                {players} players × {handSize} = {dealt} dealt · trump + {left} left to draw
              </p>
              <p className="font-pixel-body text-[18px] text-bone/60 leading-tight">Practice against CPUs. Online tables come later.</p>
              <Btn tone={TONES.poison} onClick={start} className="w-full">
                <PixelIcon name="play" size={14} />
                START
              </Btn>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <TablePreview table={table} />
            </div>
          </div>
        </Panel>
      </main>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
