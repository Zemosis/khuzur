// LEADERBOARD — everyone who has played for credits, by balance plus what's
// at a table. The top 100 for everyone; outside it, your rank with the five
// above and below you.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar, Panel } from "../components/PixelUI";
import { PixelAvatar } from "../components/PixelCard";
import SettingsModal from "../components/SettingsModal";
import { api } from "../lib/api";
import { seatAvatar } from "../utils/avatarConstants";
import { fmt } from "../utils/poker/tiers";
import { connectSocket } from "../utils/socket";
import { useAuth } from "../hooks/useAuth";

const ACCENT = "#f4c430";

function Rows({ rows, label }) {
  return (
    <table aria-label={label} className="w-full border-collapse">
      <thead>
        <tr className="font-pixel-display text-[10px] uppercase text-bone/70" style={{ backgroundColor: "#0a0712" }}>
          <th className="text-left px-3 py-2 w-[72px]">Rank</th>
          <th className="text-left px-3 py-2">Player</th>
          <th className="text-right px-3 py-2">Credits</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const face = seatAvatar(r);
          return (
            <tr
              key={`${r.rank}-${r.name}-${r.tag}`}
              aria-current={r.me ? "true" : undefined}
              style={{ backgroundColor: r.me ? "#3a2a10" : i % 2 ? "#181432" : "transparent", boxShadow: r.me ? `inset 0 0 0 3px ${ACCENT}` : undefined }}
            >
              <td className="px-3 py-2 font-pixel-display text-[12px] tabular-nums" style={{ color: r.rank <= 3 ? ACCENT : "#ead8b1" }}>
                {r.rank}
              </td>
              <td className="px-3 py-2">
                <span className="flex items-center gap-3 min-w-0">
                  <PixelAvatar variant={face.variant} size={34} customAvatarData={face.customAvatarData} />
                  <span className="font-pixel-body text-[22px] text-parchment truncate">
                    {r.name} #{r.tag}
                  </span>
                  {r.atTable && (
                    <span className="font-pixel-display text-[8px] px-1.5 py-1 shrink-0" style={{ backgroundColor: "#2a8a8c", color: "#0a2a2c" }}>
                      AT TABLE
                    </span>
                  )}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-pixel-display text-[12px] text-glow-gold tabular-nums">{fmt(r.total)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const { identity } = useAuth();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    connectSocket(identity);
  }, [identity.name, identity.tag]);

  useEffect(() => {
    api("/leaderboard", { base: "/api/credits" })
      .then(setBoard)
      .catch((err) => setError(err.message));
  }, []);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));

  return (
    <div className="relative w-full h-screen starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TopBar title="Leaderboard" accent={ACCENT} backLabel="Back" onBack={back} onSettings={() => setShowSettings(true)} />
      <main className="flex-1 min-h-0 w-full max-w-[860px] mx-auto p-4 flex flex-col gap-4 overflow-y-auto">
        <Panel title="Credits · all time" icon="star" deep="#c89820">
          {error ? (
            <p role="alert" className="p-6 font-pixel-body text-[22px] text-rose">
              Couldn't load the leaderboard: {error}
            </p>
          ) : !board ? (
            <p className="p-6 font-pixel-body text-[22px] text-bone">Loading the leaderboard...</p>
          ) : board.top.length === 0 ? (
            <p className="p-6 font-pixel-body text-[22px] text-bone">No one has played for credits yet.</p>
          ) : (
            <Rows rows={board.top} label="Top 100" />
          )}
        </Panel>
        {board?.me?.around && (
          <Panel title="Your rank" icon="user" deep="#463a78">
            <Rows rows={board.me.around} label="Your rank" />
          </Panel>
        )}
      </main>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
