// LEADERBOARD — credits are the ranking: everyone who has played for credits,
// by balance plus what's at a table. Laid out like a competitive game's
// ranked board: a header strip (emblem, the view's big title, the view
// switch), one wide row per player (rank, credits, avatar and name, each
// game's net on the right; #1 taller with a star, #2 and #3 in silver and
// bronze, ties sharing the color), and a footer with a name search and pages.
//
// Two views: TOP 100, and YOUR STANDING (you with the five above and below).
// A row opens to where that player's credits came from.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/PixelUI";
import { PixelAvatar } from "../components/PixelCard";
import PixelIcon from "../components/PixelIcon";
import SettingsModal from "../components/SettingsModal";
import SourceBreakdown from "../components/credits/SourceBreakdown";
import { signed } from "../components/credits/signed";
import { INK } from "../components/pixelTokens";
import { api } from "../lib/api";
import { seatAvatar } from "../utils/avatarConstants";
import { fmt } from "../utils/poker/tiers";
import { connectSocket } from "../utils/socket";
import { useAuth } from "../hooks/useAuth";
import { NARROW_W, useViewport } from "../hooks/useTableMetrics";

const ACCENT = "#f4c430";
const PAGE = 10;
const MEDAL = { 1: "#f4c430", 2: "#c8c4dc", 3: "#d0844a" };
// A column per game: the credits won or lost there. `live`: the game has
// credit tables; until then its column reads SOON and "—".
const GAMES = [
  { key: "thirteen", name: "Thirteen", live: false },
  { key: "muushig", name: "Muushig", live: false },
  { key: "poker", name: "Poker", live: true },
  { key: "blackjack", name: "Blackjack", live: true },
];
const VIEWS = [
  ["top", "Top 100"],
  ["me", "Your standing"],
];
const COLS = "grid-cols-[56px_96px_minmax(0,1fr)] sm:grid-cols-[96px_150px_minmax(0,1fr)_repeat(4,104px)]";

/** A pixel credit coin. */
function Coin({ size = 12 }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 6 6" shapeRendering="crispEdges" className="shrink-0">
      <rect x="1" y="0" width="4" height="6" fill="#c89820" />
      <rect x="0" y="1" width="6" height="4" fill="#c89820" />
      <rect x="1" y="1" width="4" height="4" fill="#f4c430" />
      <rect x="2" y="2" width="1" height="2" fill="#fff3b0" />
    </svg>
  );
}

/** One cell per game, under its column (wide screens). */
function GameCells({ sources }) {
  return GAMES.map(({ key, name, live }) => (
    <span key={key} className="max-sm:hidden text-right font-pixel-body text-[20px] tabular-nums" aria-label={live ? `${name} ${signed(sources?.[key] ?? 0)}` : `${name}: soon`}>
      {live ? <span className="text-parchment">{signed(sources?.[key] ?? 0)}</span> : <span className="text-bone/30">—</span>}
    </span>
  ));
}

/** On a phone, the games with credit tables, under the name. */
function GameNets({ sources }) {
  return (
    <span className="sm:hidden flex gap-4 font-pixel-body text-[20px] tabular-nums">
      {GAMES.filter((g) => g.live).map(({ key, name }) => (
        <span key={key} className="whitespace-nowrap">
          <span className="text-parchment">{signed(sources?.[key] ?? 0)}</span>{" "}
          <span className="font-pixel-display text-[9px] text-bone/60 uppercase">{name}</span>
        </span>
      ))}
    </span>
  );
}

/** One player; opens to where their credits came from. */
function Row({ r, open, onToggle }) {
  const face = seatAvatar(r);
  // #1's big avatar would push a phone row past the edge.
  const narrow = useViewport().vw < NARROW_W;
  const first = r.rank === 1;
  const medal = MEDAL[r.rank];
  return (
    <li aria-current={r.me ? "true" : undefined} style={{ borderTop: "3px solid #0a0712", backgroundColor: r.me ? "#3a2a10" : first ? "#211a3c" : "#181432" }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${r.rank}. ${r.name} #${r.tag}: ${fmt(r.total)} credits`}
        className={`pixel-hbtn w-full grid items-center gap-3 sm:gap-4 pr-4 text-left ${COLS}`}
        style={{ minHeight: first ? 96 : 66, boxShadow: r.me ? `inset 0 0 0 3px ${ACCENT}` : undefined }}
      >
        <span
          className="self-stretch flex items-center justify-center gap-1.5 font-pixel-display tabular-nums"
          style={{ fontSize: first ? 30 : 20, color: medal ?? "#ead8b1", backgroundColor: "rgba(10,7,18,0.45)" }}
        >
          {r.rank}
          {first && <PixelIcon name="star" size={12} color={ACCENT} />}
        </span>
        <span className="flex items-center gap-2 font-pixel-display text-[12px] sm:text-[14px] text-glow-gold tabular-nums">
          <Coin size={first ? 16 : 12} />
          {fmt(r.total)}
        </span>
        <span className="flex items-center gap-3 min-w-0 py-2">
          <PixelAvatar variant={face.variant} size={first && !narrow ? 64 : 44} customAvatarData={face.customAvatarData} />
          <span className="flex flex-col gap-1 min-w-0">
            <span className="font-pixel-body text-[22px] sm:text-[24px] text-parchment truncate">
              {r.name} <span className="text-bone/50 text-[18px]">#{r.tag}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {r.atTable && (
                <span className="font-pixel-display text-[8px] px-1.5 py-1" style={{ backgroundColor: "#2a8a8c", color: "#0a2a2c" }}>
                  AT TABLE
                </span>
              )}
              {/* On a phone the games' nets go under the name. */}
              <GameNets sources={r.sources} />
            </span>
          </span>
        </span>
        <GameCells sources={r.sources} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 sm:pl-[262px] sm:pr-6">
          <SourceBreakdown sources={r.sources ?? {}} total={r.total} label={`Where ${r.name}'s credits came from`} />
        </div>
      )}
    </li>
  );
}

function Header({ view, onView }) {
  return (
    <div className="grid gap-2 grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[96px_minmax(0,1fr)_200px]">
      <div className="flex items-center justify-center" style={{ backgroundColor: "#1f1a3d", boxShadow: "0 0 0 3px #0a0712" }}>
        <PixelIcon name="crown" size={36} color={ACCENT} />
      </div>
      <div className="flex flex-col items-center justify-center py-3" style={{ backgroundColor: "#ead8b1", boxShadow: "0 0 0 3px #0a0712, inset 0 -5px 0 #c8b890" }}>
        <span className="font-pixel-display text-[9px] text-[#463a78]">CREDITS · ALL TIME</span>
        <h2 className="font-pixel-display text-[22px] sm:text-[30px] text-[#1a1024] uppercase mt-2">{VIEWS.find(([id]) => id === view)[1]}</h2>
      </div>
      <div role="tablist" aria-label="Leaderboard view" className="max-sm:col-span-2 flex sm:flex-col gap-2 justify-center">
        {VIEWS.map(([id, text]) => (
          <button
            key={id}
            role="tab"
            aria-selected={id === view}
            onClick={() => onView(id)}
            className="pixel-hbtn flex-1 font-pixel-display text-[10px] uppercase px-3 py-2.5 leading-none"
            style={{ backgroundColor: id === view ? ACCENT : INK, color: id === view ? INK : "#ead8b1", boxShadow: "0 0 0 3px #2a234d" }}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Pager({ page, pages, onPage }) {
  const btn = (label, to, icon, disabled) => (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={() => onPage(to)}
      className="pixel-hbtn w-9 h-9 flex items-center justify-center disabled:opacity-30"
      style={{ backgroundColor: INK, color: "#ead8b1", boxShadow: "0 0 0 2px #2a234d" }}
    >
      {icon}
    </button>
  );
  return (
    <div className="flex items-center gap-2">
      {btn("First page", 0, <><PixelIcon name="left" size={9} /><PixelIcon name="left" size={9} /></>, page === 0)}
      {btn("Previous page", page - 1, <PixelIcon name="left" size={10} />, page === 0)}
      <span className="font-pixel-body text-[20px] text-parchment px-3 h-9 flex items-center tabular-nums" style={{ backgroundColor: "#ead8b1", color: "#1a1024" }}>
        Page {page + 1}/{pages}
      </span>
      {btn("Next page", page + 1, <PixelIcon name="right" size={10} />, page >= pages - 1)}
      {btn("Last page", pages - 1, <><PixelIcon name="right" size={9} /><PixelIcon name="right" size={9} /></>, page >= pages - 1)}
    </div>
  );
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const { identity, isGuest } = useAuth();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("top");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    connectSocket(identity);
  }, [identity.name, identity.tag]);

  useEffect(() => {
    api("/leaderboard", { base: "/api/credits" })
      .then(setBoard)
      .catch((err) => setError(err.message));
  }, []);

  const rows = view === "top" ? (board?.top ?? []) : (board?.me?.around ?? []);
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.name} #${r.tag}`.toLowerCase().includes(q)) : rows;
  }, [rows, query]);
  // Your standing is eleven rows at most: one page.
  const pageSize = view === "top" ? PAGE : found.length || 1;
  const pages = Math.max(1, Math.ceil(found.length / pageSize));
  const shown = found.slice(page * pageSize, (page + 1) * pageSize);

  const switchView = (next) => {
    setView(next);
    setPage(0);
    setOpen(null);
  };
  const search = (text) => {
    setQuery(text);
    setPage(0);
  };
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));

  let empty = null;
  if (error) empty = `Couldn't load the leaderboard: ${error}`;
  else if (!board) empty = "Loading the leaderboard...";
  else if (view === "top" && !rows.length) empty = "No one has played for credits yet.";
  else if (view === "me" && isGuest) empty = "Sign in to see where you stand.";
  else if (view === "me" && !board.me) empty = "Play a hand at a credit table to get on the board.";
  else if (!found.length) empty = `Nobody called "${query.trim()}" here.`;

  return (
    <div className="relative w-full h-screen starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TopBar title="Leaderboard" accent={ACCENT} backLabel="Back" onBack={back} onSettings={() => setShowSettings(true)} />
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full max-w-[1240px] mx-auto p-4 sm:p-6 flex flex-col gap-4">
          <Header view={view} onView={switchView} />

          <section aria-label="Standings" style={{ backgroundColor: "#14102a", boxShadow: "0 0 0 3px #0a0712" }}>
            <div
              aria-hidden
              className={`grid gap-3 sm:gap-4 pr-4 py-2 font-pixel-display text-[9px] uppercase text-bone/60 ${COLS}`}
              style={{ backgroundColor: "#0a0712" }}
            >
              <span className="text-center">Rank</span>
              <span>Credits</span>
              <span>Player</span>
              {GAMES.map(({ key, name, live }) => (
                <span key={key} className="max-sm:hidden flex flex-col items-end gap-1">
                  {name}
                  {!live && (
                    <span className="text-[7px] px-1 py-0.5 leading-none" style={{ backgroundColor: "#e85a7a", color: "#1a1024" }}>
                      SOON
                    </span>
                  )}
                </span>
              ))}
            </div>
            {empty ? (
              <p role={error ? "alert" : undefined} className="p-6 font-pixel-body text-[22px] text-bone">
                {empty}
              </p>
            ) : (
              <ol aria-label={view === "top" ? "Top 100" : "Your standing"} className="flex flex-col">
                {shown.map((r) => {
                  const key = `${r.rank}-${r.name}-${r.tag}`;
                  return <Row key={key} r={r} open={open === key} onToggle={() => setOpen(open === key ? null : key)} />;
                })}
              </ol>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderTop: "3px solid #0a0712", backgroundColor: "#0f0c22" }}>
              <input
                type="search"
                value={query}
                onChange={(e) => search(e.target.value)}
                placeholder="Search..."
                aria-label="Search players"
                className="flex-1 min-w-[180px] max-w-[460px] font-pixel-body text-[20px] px-3 h-9 text-parchment"
                style={{ backgroundColor: INK, border: "2px solid #2a234d" }}
              />
              {view === "top" && found.length > PAGE && <Pager page={page} pages={pages} onPage={setPage} />}
            </div>
          </section>
        </div>
      </main>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
