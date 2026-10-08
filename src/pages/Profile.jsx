// PROFILE — edit your identity on the left, read your record on the right.
//
// Reached from your name on the main menu, or the Adventurer card's Edit
// button in any game lobby. Guests get a sign-in prompt instead: they have no
// saved profile or stats.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PixelAvatar } from "../components/PixelCard";
import PixelIcon from "../components/PixelIcon";
import { Panel, Btn, TopBar } from "../components/PixelUI";
import { INK, TONES, inputStyle } from "../components/pixelTokens";
import PlacementGraph from "../components/profile/PlacementGraph";
import HandsPlayed from "../components/profile/HandsPlayed";
import { ordinal } from "../components/profile/ordinal";
import PlacementBars from "../components/profile/PlacementBars";
import SettingsModal from "../components/SettingsModal";
import LoginModal from "../components/auth/LoginModal";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { connectSocket } from "../utils/socket";

const ACCENT = "#f4c430";
const EXP_PER_LEVEL = 100;
const PRESETS = ["1", "2", "3", "4", "5"];
const GAME_NAMES = { thirteen: "Thirteen", muushig: "Muushig", poker: "Poker" };

const num = (v) => (v == null ? null : Number(v));

function formatDuration(seconds) {
  const s = num(seconds) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ------------------------------------------------------------ edit side ----

function EditProfile() {
  const navigate = useNavigate();
  const { identity, profile, updateProfile, signOut } = useAuth();
  const [name, setName] = useState(identity.name);
  const [tag, setTag] = useState(identity.tag);
  const [avatar, setAvatar] = useState(String(profile?.avatar || identity.avatar));
  const [status, setStatus] = useState({ kind: "idle", text: "" });

  const dirty =
    name !== identity.name || tag !== identity.tag || avatar !== String(profile?.avatar || identity.avatar);
  const valid = name.length >= 1 && tag.length === 4;
  const expIntoLevel = identity.exp % EXP_PER_LEVEL;

  async function save(e) {
    e.preventDefault();
    if (!valid) return;
    setStatus({ kind: "busy", text: "" });
    try {
      await updateProfile({ username: name, tag, avatar });
      setStatus({ kind: "ok", text: "Profile saved" });
    } catch (err) {
      setStatus({ kind: "error", text: err.message || "Couldn't save your profile" });
    }
  }

  const options = [...PRESETS, ...(identity.customAvatar ? ["custom"] : [])];

  return (
    <Panel title="Edit profile" icon="pencil" deep="#c89820" className="max-lg:shrink-0">
      <form onSubmit={save} className="flex-1 flex flex-col p-4 overflow-y-auto min-h-0" style={{ gap: "var(--gap)" }}>
        {/* Preview: exactly how other players see you. */}
        <div className="flex items-center gap-4">
          <div style={{ boxShadow: `0 0 0 4px ${INK}` }}>
            <PixelAvatar
              variant={avatar === "custom" ? "custom" : Number(avatar)}
              size={102}
              customAvatarData={identity.customAvatar}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-pixel-display text-[18px] text-parchment">{name || "?"}</span>
              <span className="font-pixel-body text-[26px] text-bone">#{tag.padEnd(4, "_")}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="font-pixel-display text-[10px] px-1.5 py-1 leading-none whitespace-nowrap shrink-0"
                style={{ backgroundColor: ACCENT, color: INK, boxShadow: `0 0 0 2px ${INK}` }}
              >
                LV {identity.level}
              </span>
              <span className="font-pixel-body text-[20px] text-bone">
                {expIntoLevel}/{EXP_PER_LEVEL} XP to level {identity.level + 1}
              </span>
            </div>
            <div className="font-pixel-body text-[20px] text-bone/70 mt-1">{identity.coins} coins</div>
          </div>
        </div>

        <fieldset>
          <legend className="font-pixel-display text-[11px] text-parchment mb-3">Avatar</legend>
          <div className="flex flex-wrap gap-2.5">
            {options.map((v) => {
              const selected = avatar === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAvatar(v)}
                  aria-pressed={selected}
                  className="pixel-pick"
                  aria-label={v === "custom" ? "Your painted avatar" : `Avatar ${v}`}
                  style={{
                    padding: 3,
                    backgroundColor: selected ? "#2a1f1a" : INK,
                    boxShadow: `0 0 0 3px ${selected ? ACCENT : "#2a234d"}`,
                  }}
                >
                  <PixelAvatar
                    variant={v === "custom" ? "custom" : Number(v)}
                    size={51}
                    customAvatarData={identity.customAvatar}
                  />
                </button>
              );
            })}

          </div>
          <Btn tone={TONES.dusk} onClick={() => navigate("/avatar-paint")} className="w-full mt-4" style={{ height: 44 }}>
            <PixelIcon name="pencil" size={14} />
            {identity.customAvatar ? "Edit your painted avatar" : "Paint your own avatar"}
          </Btn>
        </fieldset>

        <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) 120px" }}>
          <label className="flex flex-col gap-2">
            <span className="font-pixel-display text-[11px] text-parchment">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              className="font-pixel-display text-[14px] px-3 text-parchment uppercase"
              style={{ ...inputStyle, height: 48, letterSpacing: "0.12em" }}
            />
            <span className="font-pixel-body text-[18px] text-bone/70">Up to 6 letters or digits</span>
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-pixel-display text-[11px] text-parchment">Tag</span>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
              className="font-pixel-display text-[14px] px-3 text-parchment uppercase"
              style={{ ...inputStyle, height: 48, letterSpacing: "0.2em" }}
            />
            <span className="font-pixel-body text-[18px] text-bone/70">Exactly 4</span>
          </label>
        </div>

        <div className="flex flex-col gap-3 mt-auto">
          {status.text && (
            <p
              role={status.kind === "error" ? "alert" : "status"}
              className="font-pixel-body text-[22px]"
              style={{ color: status.kind === "error" ? "#e85a7a" : "#9bd14f" }}
            >
              {status.text}
            </p>
          )}
          <Btn
            tone={{ bg: ACCENT, deep: "#c89820", ink: INK }}
            type="submit"
            disabled={!dirty || !valid || status.kind === "busy"}
            className="w-full"
            style={{ height: 48 }}
          >
            {status.kind === "busy" ? "Saving..." : "Save changes"}
          </Btn>
          <Btn
            tone={TONES.dusk}
            onClick={() => {
              signOut();
              navigate("/");
            }}
            className="w-full"
            style={{ height: 44 }}
          >
            Sign out
          </Btn>
        </div>
      </form>
    </Panel>
  );
}

// ----------------------------------------------------------- stats side ----

const FILTERS = [
  ["overall", "Overall"],
  ["thirteen", "Thirteen"],
  ["muushig", "Muushig"],
  ["poker", "Poker"],
];
// Seats at the table, so how many places a match can end in.
const PLACES = { thirteen: 4, muushig: 5 };

function StatTile({ label, value, note }) {
  return (
    <div className="flex flex-col gap-2 p-3" style={{ backgroundColor: INK, boxShadow: "0 0 0 2px #2a234d" }}>
      <span className="font-pixel-body text-[20px] text-bone leading-none">{label}</span>
      <span className="font-pixel-display text-[20px] text-parchment leading-none">{value}</span>
      <span className="font-pixel-body text-[18px] text-bone/70 leading-none">{note}</span>
    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-3">
        <h3 className="font-pixel-display text-[11px] text-parchment">{title}</h3>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** A row of pixel toggle buttons; `label` names the group for screen readers. */
function Toggle({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {options.map(([id, text]) => {
        const on = id === value;
        return (
          <button
            key={id}
            aria-pressed={on}
            onClick={() => onChange(id)}
            className="pixel-hbtn font-pixel-display text-[10px] uppercase px-3 py-2 leading-none"
            style={{ backgroundColor: on ? ACCENT : INK, color: on ? INK : "#ead8b1", boxShadow: "0 0 0 2px #2a234d" }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

function Facts({ rows }) {
  return (
    <dl className="grid font-pixel-body text-[20px]" style={{ gridTemplateColumns: "minmax(0,1fr) auto", rowGap: 6, columnGap: 16 }}>
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-bone">{label}</dt>
          <dd className="text-parchment text-right tabular-nums">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function RecentList({ matches }) {
  if (!matches.length) return <p className="font-pixel-body text-[20px] text-bone/70 px-3">No matches yet</p>;
  return (
    <div className="flex flex-col">
      {matches.map((m, i) => (
        <div
          key={m.id}
          className="grid items-center gap-3 px-3 font-pixel-body text-[20px]"
          style={{ gridTemplateColumns: "96px minmax(0,1fr) 80px 80px 70px 110px", minHeight: 44, backgroundColor: i % 2 ? "#181432" : "transparent" }}
        >
          <span
            className="font-pixel-display text-[10px] text-center py-1"
            style={{ backgroundColor: m.won ? ACCENT : INK, color: m.won ? INK : "#ead8b1", boxShadow: "0 0 0 2px #2a234d" }}
          >
            {m.leftEarly ? "Quit" : m.place ? `${ordinal(m.place)} of ${m.of}` : "-"}
          </span>
          <span className="text-parchment truncate">{GAME_NAMES[m.game] || m.game}</span>
          <span className="text-bone/80">{m.solo ? "vs CPU" : "Online"}</span>
          <span className="text-bone text-right tabular-nums">{m.score ?? "-"} pts</span>
          <span className="text-bone/80 text-right tabular-nums">{formatDuration(m.seconds)}</span>
          <span className="text-bone/70 text-right">{new Date(m.finishedAt).toLocaleDateString()}</span>
        </div>
      ))}
    </div>
  );
}

function ThirteenFacts({ extras }) {
  const played = extras.rounds_played || 0;
  const won = extras.rounds_won || 0;
  const caught = played - won;
  return (
    <Facts
      rows={[
        ["Went out first", won],
        ["Avg cards left when caught", caught > 0 ? ((extras.cards_left_total || 0) / caught).toFixed(1) : "-"],
      ]}
    />
  );
}

function MuushigFacts({ extras }) {
  return (
    <Facts
      rows={[
        ["Piles eaten", extras.eaten || 0],
        ["Went in / folded", `${extras.gone_in || 0} / ${extras.folded || 0}`],
        ["Sweeps", extras.sweeps || 0],
      ]}
    />
  );
}

// Poker has no places or wins: hands, chips won or lost, and how you play.
function PokerSheet({ v }) {
  const net = v.net > 0 ? `+${v.net}` : String(v.net);
  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatTile label="Hands" value={v.hands} note={`at ${v.sessions} ${v.sessions === 1 ? "table" : "tables"}`} />
        <StatTile label="Hands won" value={v.handsWon} note={v.winRate == null ? "-" : `${v.winRate}% of hands`} />
        <StatTile label="Chips" value={net} note="won or lost, all tables" />
        <StatTile label="Biggest pot" value={v.biggestPot} note="won in one hand" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Poker">
          <Facts
            rows={[
              ["Played the hand (VPIP)", v.vpip == null ? "-" : `${v.vpip}%`],
              ["Showdowns won", `${v.showdownsWon} / ${v.showdowns}`],
            ]}
          />
        </Section>
        <Section title="Time">
          <Facts
            rows={[
              ["Time played", formatDuration(v.time.totalSeconds)],
              ["Last played", v.time.lastPlayedAt ? new Date(v.time.lastPlayedAt).toLocaleDateString() : "-"],
            ]}
          />
        </Section>
      </div>
    </>
  );
}

// Everything shows from the first visit: a player with no matches sees zeros
// rather than an empty screen. Rating is hidden for now.
function StatsSheet({ data }) {
  const [filter, setFilter] = useState("overall");
  const [recentView, setRecentView] = useState("list");
  if (filter === "poker") {
    return (
      <div className="flex-1 flex flex-col gap-6 p-4 overflow-y-auto min-h-0">
        <Toggle label="Game" options={FILTERS} value={filter} onChange={setFilter} />
        <PokerSheet v={data.poker} />
      </div>
    );
  }
  const v = data[filter];
  const deadPct = v.games ? Math.round((v.deadLast / v.games) * 100) : 0;
  const streak = v.streak.current;
  const places = PLACES[filter] || Math.max(4, ...v.placements.map((p) => p.place));

  return (
    <div className="flex-1 flex flex-col gap-6 p-4 overflow-y-auto min-h-0">
      <Toggle label="Game" options={FILTERS} value={filter} onChange={setFilter} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatTile label="Games" value={v.games} note={`${v.wins} won, ${v.losses} lost`} />
        <StatTile label="Wins" value={v.wins} note={`${v.winRate == null ? "-" : `${v.winRate}%`} of games`} />
        <StatTile label="Losses" value={v.losses} note={`${v.games ? 100 - Math.round((v.wins / v.games) * 100) : 0}% of games`} />
        <StatTile label="Dead last" value={v.deadLast} note={`${deadPct}% of games`} />
        <StatTile label="Win rate" value={v.winRate == null ? "-" : `${v.winRate}%`} note={`${v.wins} of ${v.games}`} />
        <StatTile
          label="Avg finish"
          value={v.avgFinish == null ? "-" : Number(v.avgFinish).toFixed(1)}
          note={PLACES[filter] ? `of ${PLACES[filter]} players` : "1st is best"}
        />
        <StatTile
          label="Streak"
          value={streak === 0 ? "-" : `${Math.abs(streak)}${streak > 0 ? "W" : "L"}`}
          note={`Best win run ${v.streak.bestWin}`}
        />
        <StatTile label="Rounds won" value={v.rounds.won} note={`of ${v.rounds.played} played`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Finishing places">
          <PlacementBars placements={v.placements} places={places} />
        </Section>
        <Section title="Time">
          <Facts
            rows={[
              ["Time played", formatDuration(v.time.totalSeconds)],
              ["Avg match", v.time.avgSeconds == null ? "-" : formatDuration(v.time.avgSeconds)],
              ["Last played", v.time.lastPlayedAt ? new Date(v.time.lastPlayedAt).toLocaleDateString() : "-"],
            ]}
          />
        </Section>
      </div>

      {filter === "thirteen" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Thirteen">
            <ThirteenFacts extras={v.extras || {}} />
          </Section>
          <Section title="Hands played">
            <HandsPlayed hands={v.hands || {}} />
          </Section>
        </div>
      )}
      {filter === "muushig" && (
        <Section title="Muushig">
          <MuushigFacts extras={v.extras || {}} />
        </Section>
      )}

      <Section
        title="Recent matches"
        right={
          <Toggle
            label="Recent matches view"
            options={[
              ["list", "List"],
              ["graph", "Graph"],
            ]}
            value={recentView}
            onChange={setRecentView}
          />
        }
      >
        {recentView === "graph" ? <PlacementGraph matches={v.recent} /> : <RecentList matches={v.recent} />}
      </Section>
    </div>
  );
}

function StatsPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/stats")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Panel title="Stats" icon="star" deep="#463a78" className="max-lg:shrink-0 lg:h-full">
      {error ? (
        <p role="alert" className="p-6 font-pixel-body text-[22px] text-rose">
          Couldn't load your stats: {error}
        </p>
      ) : !data ? (
        <p className="p-6 font-pixel-body text-[22px] text-bone">Loading your stats...</p>
      ) : (
        <StatsSheet data={data} />
      )}
    </Panel>
  );
}

// ------------------------------------------------------------ the screen ----

export default function Profile() {
  const navigate = useNavigate();
  const { isGuest, loading, identity } = useAuth();
  const [showSettings, setShowSettings] = useState(false);

  // Keeps the top bar's server status live, as on every other screen.
  useEffect(() => {
    connectSocket(identity);
  }, [identity.name, identity.tag]);
  const [showLogin, setShowLogin] = useState(false);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));

  return (
    <div className="relative w-full h-screen starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TopBar
        title="Profile"
        accent={ACCENT}
        backLabel="Back"
        onBack={back}
        onSettings={() => setShowSettings(true)}
      />

      {loading ? null : isGuest ? (
        <main className="flex-1 flex items-center justify-center p-4">
          <Panel title="Profile" icon="user" deep="#c89820" className="max-w-md w-full">
            <div className="flex flex-col items-center gap-4 p-6 text-center">
              <p className="font-pixel-body text-[24px] text-bone leading-tight">
                Sign in to pick your name and avatar and keep your stats between games.
              </p>
              <Btn tone={TONES.poison} onClick={() => setShowLogin(true)} className="px-6" style={{ height: 48 }}>
                Sign in
              </Btn>
            </div>
          </Panel>
        </main>
      ) : (
        <main className="flex-1 min-h-0 w-full p-4 flex flex-col gap-4 lg:grid lg:grid-cols-[420px_minmax(0,1fr)] overflow-y-auto lg:overflow-hidden">
          {/* Side by side from lg; narrower, the panels stack and the page scrolls. */}
          <EditProfile />
          <StatsPanel />
        </main>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
