// MATCH DETAIL — one finished match, opened from Recent matches on a profile
// (or a shared link): the final standings, one player's summary against the
// table, the score timeline and every round's results and key plays. Picking
// a row in the standings switches the summary and brightens their line; it
// starts on you when you played, otherwise on the winner.
//
// Public-table matches open for anyone; a private one only for its players
// (server/matches.js). Anything unavailable reads as not found. A poker table
// has a page of its own (PokerTablePage): your time there.

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Panel, TopBar } from "../components/PixelUI";
import SettingsModal from "../components/SettingsModal";
import Standings from "../components/match/Standings";
import Summary from "../components/match/Summary";
import ScoreTimeline from "../components/match/ScoreTimeline";
import RoundList from "../components/match/RoundList";
import PokerTablePage from "../components/match/PokerTablePage";
import { seatName } from "../utils/matchSummary";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { connectSocket } from "../utils/socket";

const GAME = {
  thirteen: { name: "Thirteen", deep: "#c89820" },
  muushig: { name: "Muushig", deep: "#b8405e" },
};

function formatDuration(seconds) {
  const m = Math.round((seconds || 0) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** One entry per seat: whoever finished it (a leaver only if nobody did). */
function seatsOf(standings) {
  const bySeat = new Map();
  for (const s of standings) {
    const had = bySeat.get(s.seat);
    if (!had || (had.leftEarly && !s.leftEarly)) bySeat.set(s.seat, s);
  }
  return [...bySeat.values()].sort((a, b) => a.seat - b.seat);
}

export default function MatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { identity } = useAuth();
  const [match, setMatch] = useState(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    connectSocket(identity);
  }, [identity.name, identity.tag]);

  useEffect(() => {
    let live = true;
    setMatch(null);
    setError("");
    api(`/${encodeURIComponent(id)}`, { base: "/api/matches" })
      .then((m) => {
        if (!live) return;
        setMatch(m);
        setPicked(m.you ?? m.standings?.[0]?.seat ?? 0);
      })
      .catch((err) => live && setError(err.status === 404 ? "This match isn't available. It may be private, or still being played." : err.message));
    return () => {
      live = false;
    };
  }, [id]);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/profile"));
  const game = GAME[match?.gameType] || GAME.thirteen;
  const poker = match?.gameType === "poker";
  const seats = match && !poker ? seatsOf(match.standings) : [];
  const pickedSeat = seats.find((s) => s.seat === picked);
  const pickedRow = match?.standings?.find((s) => s.seat === picked && !s.leftEarly) ?? pickedSeat;

  return (
    <div className="relative w-full h-screen starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TopBar title={poker ? "Table" : "Match"} accent="#f4c430" backLabel="Back" onBack={back} onSettings={() => setShowSettings(true)} />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full max-w-[1100px] mx-auto p-4 flex flex-col gap-4">
          {error ? (
            <Panel title="Match" icon="cards" deep="#463a78">
              <p className="font-pixel-body text-[22px] text-bone p-6 text-center">
                {error}
              </p>
            </Panel>
          ) : !match ? (
            <p className="font-pixel-body text-[22px] text-bone/70 text-center p-8" role="status">
              Loading the match…
            </p>
          ) : poker ? (
            <PokerTablePage table={match} />
          ) : (
            <>
              <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h1 className="font-pixel-display text-[18px]" style={{ color: game.deep }}>
                  {game.name.toUpperCase()}
                </h1>
                <span className="font-pixel-body text-[20px] text-bone">
                  {new Date(match.finishedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                  {formatDuration(match.durationSeconds)} · {match.roundCount ?? match.rounds.length} rounds ·{" "}
                  {match.isPrivate ? "Private table" : "Public table"}
                </span>
              </header>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start">
                <Panel title="Standings" icon="crown" deep={game.deep}>
                  <Standings standings={match.standings} you={match.you} picked={picked} onPick={setPicked} />
                </Panel>
                <Panel title="Summary" icon="user" deep="#463a78">
                  {pickedSeat && (
                    <Summary
                      gameType={match.gameType}
                      rounds={match.rounds}
                      seat={picked}
                      name={seatName(pickedSeat)}
                      hands={pickedRow?.stats?.hands}
                    />
                  )}
                </Panel>
              </div>

              <Panel title="Timeline" icon="star" deep="#463a78">
                <ScoreTimeline gameType={match.gameType} rounds={match.rounds} seats={seats} picked={picked} />
              </Panel>

              <Panel title="Rounds" icon="cards" deep="#463a78">
                <RoundList gameType={match.gameType} rounds={match.rounds} seats={seats} picked={picked} />
              </Panel>
            </>
          )}
        </div>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
