// GAME LOBBY — the one lobby screen every game mode shares.
//
// A game passes a config (see pages/thirteen/LobbySelection.jsx) naming its
// title, accent, route and socket events; everything else — layout, identity
// card, hosting, joining, practice and the table list — lives here so new
// games get the same screen for free.
//
// Layout: a fixed-width left column of four panels and a table list filling
// the rest. The three action panels share one row height (1fr each) and one
// internal structure — a header and two control rows — so the column reads as
// a symmetric stack at any viewport height. Control heights scale with the
// viewport (--ctl) so the whole screen fits without scrolling from 1366x657
// laptops up to 1080p. Narrower than lg (phones, split screens) the panels
// stack at their natural height and the screen scrolls; on a wide but short
// window each row keeps at least its content's height and the screen scrolls
// rather than squeezing panels into each other.

import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket, connectSocket } from "../../utils/socket";
import { PixelAvatar } from "../PixelCard";
import PixelIcon from "../PixelIcon";
import { useAuth } from "../../hooks/useAuth";
import { Panel, Btn, HeaderBtn, TopBar } from "../PixelUI";
import { INK, TONES, inputStyle } from "../pixelTokens";
import SettingsModal from "../SettingsModal";
import LoginModal from "../auth/LoginModal";
import { gameRoute } from "../../lib/games";
import BalancePanel from "../credits/BalancePanel";
import CreditHostPanel from "../credits/CreditHostPanel";
import BuyInPanel from "../credits/BuyInPanel";
import StakePanel from "../credits/StakePanel";
import ClaimButton from "../credits/ClaimButton";
import { useCredits } from "../../hooks/useCredits";
import { TIERS, buyInRange, fmt } from "../../utils/poker/tiers";
import { STAKES, STAKE_TIERS } from "../../utils/stakes";
import { levelProgress } from "../../utils/progression";

// A stake game's tier buttons: the one amount everyone at the table stakes.
const STAKE_BUTTONS = STAKE_TIERS.map((id) => ({ id, label: fmt(STAKES[id]), title: `Everyone stakes ${fmt(STAKES[id])}; the winner takes the pot` }));

const CODE_LENGTH = 6;

const DIFFICULTIES = [
  { id: "EASY", label: "Easy", color: "#9bd14f", deep: "#6a9a30", skulls: 1 },
  { id: "MEDIUM", label: "Medium", color: "#f4c430", deep: "#c89820", skulls: 2 },
  { id: "HARD", label: "Hard", color: "#e85a7a", deep: "#a83a5a", skulls: 3 },
];

// ------------------------------------------------------------ adventurer ----

function AdventurerCard({ game, onSignIn }) {
  const navigate = useNavigate();
  const { identity, isGuest } = useAuth();
  const { into, need } = levelProgress(identity.exp);
  const pct = (into / need) * 100;

  // The one action lives in the header so the body stays a single tight row.
  const action = isGuest ? (
    <HeaderBtn onClick={onSignIn} bg="#9bd14f">
      Sign in
    </HeaderBtn>
  ) : (
    <HeaderBtn onClick={() => navigate("/profile")} bg="#ead8b1" title="Edit profile and see your stats">
      <PixelIcon name="pencil" size={12} />
      Edit
    </HeaderBtn>
  );

  return (
    <Panel title="Adventurer" icon="user" deep={game.accent.deep} right={action}>
      <div className="flex items-center gap-3" style={{ padding: "var(--pad) 12px" }}>
        <div style={{ boxShadow: `0 0 0 3px ${INK}` }}>
          <PixelAvatar variant={identity.avatar} size={51} customAvatarData={identity.customAvatar} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-pixel-display text-[15px] text-parchment truncate">
              {identity.name}
            </span>
            <span className="font-pixel-body text-[22px] text-bone leading-none">#{identity.tag}</span>
            {isGuest ? (
              <span className="ml-auto font-pixel-display text-[9px] uppercase text-bone/60">Guest</span>
            ) : (
              <span className="ml-auto font-pixel-display text-[9px] text-glow-gold tabular-nums whitespace-nowrap">{fmt(identity.gold ?? 0)} GOLD</span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span
              className="font-pixel-display text-[10px] px-1.5 py-1 leading-none shrink-0"
              style={{ backgroundColor: game.accent.main, color: INK, boxShadow: `0 0 0 2px ${INK}` }}
            >
              LV {identity.level}
            </span>
            <div
              className="flex-1 relative"
              style={{ height: 12, backgroundColor: INK, boxShadow: "0 0 0 2px #2a234d" }}
              role="progressbar"
              aria-label="Experience toward next level"
              aria-valuenow={into}
              aria-valuemin={0}
              aria-valuemax={need}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  backgroundColor: game.accent.main,
                  boxShadow: "inset 0 3px 0 rgba(255,255,255,0.35)",
                }}
              />
            </div>
            <span className="font-pixel-body text-[20px] text-bone leading-none shrink-0">
              {into}/{need} XP
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// --------------------------------------------------------- action panels ----

/** Body of an action panel: two control rows, vertically centred. */
function ActionBody({ children }) {
  return (
    <div className="flex-1 flex flex-col justify-center gap-2.5 min-h-0" style={{ padding: "var(--pad)" }}>
      {children}
    </div>
  );
}

function HostPanel({ game, onCreate }) {
  const [name, setName] = useState(game.defaultTableName);
  return (
    <Panel title="Host a table" icon="crown" deep="#2a8a8c">
      <ActionBody>
        <label className="sr-only" htmlFor="table-name">
          Table name
        </label>
        <input
          id="table-name"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder="Table name"
          className="w-full font-pixel-body text-[22px] px-3 text-parchment placeholder:text-mist"
          style={inputStyle}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <Btn tone={TONES.cyan} onClick={() => onCreate(name, false)} title="Anyone can join from the list">
            <PixelIcon name="globe" size={14} />
            Public
          </Btn>
          <Btn tone={TONES.rose} onClick={() => onCreate(name, true)} title="Only people with the code can join">
            <PixelIcon name="lock" size={14} />
            Private
          </Btn>
        </div>
      </ActionBody>
    </Panel>
  );
}

function JoinPanel({ onJoin }) {
  const [code, setCode] = useState("");
  const inputRef = useRef(null);
  const chars = code.padEnd(CODE_LENGTH, " ").split("");
  const ready = code.length === CODE_LENGTH;

  function submit(e) {
    e.preventDefault();
    if (ready) onJoin(code);
  }

  return (
    <Panel title="Join with a code" icon="key" deep="#a83a5a">
      <form onSubmit={submit} className="contents">
        <ActionBody>
          {/* The boxes are a picture of the real input laid over them. */}
          <div className="relative" onClick={() => inputRef.current?.focus()}>
            <div className="grid grid-cols-6 gap-2" aria-hidden>
              {chars.map((ch, i) => {
                const filled = ch.trim();
                const active = i === code.length;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-center font-pixel-display text-[18px]"
                    style={{
                      ...inputStyle,
                      borderColor: filled ? "#e85a7a" : active ? "#6b5a9a" : "#2a234d",
                      color: filled ? "#ead8b1" : "#463a78",
                    }}
                  >
                    {filled || ""}
                  </div>
                );
              })}
            </div>
            <input
              ref={inputRef}
              aria-label="Table code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/^PUB-?/, "").replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH))
              }
              autoComplete="off"
              spellCheck={false}
              className="absolute inset-0 w-full h-full opacity-0 cursor-text"
            />
          </div>
          <Btn tone={TONES.rose} type="submit" disabled={!ready} className="w-full">
            <PixelIcon name="play" size={14} />
            Join table
          </Btn>
        </ActionBody>
      </form>
    </Panel>
  );
}

function PracticePanel({ onStart }) {
  return (
    <Panel title="Practice vs CPU" icon="skull" deep="#6a9a30">
      <ActionBody>
        {/* Exactly two control rows tall, like the other panels; shrinks if cramped. */}
        <div className="grid grid-cols-3 gap-2.5 min-h-0" style={{ height: "calc(var(--ctl) * 2 + 10px)" }}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => onStart(d.id)}
              className="pixel-btn pixel-choice flex flex-col items-center justify-center gap-2"
              style={{ backgroundColor: INK, borderColor: d.deep, color: d.color, "--tone": d.color }}
              title={`Start a ${d.label.toLowerCase()} game against the computer`}
            >
              <span className="font-pixel-display text-[12px] uppercase">{d.label}</span>
              <span className="flex gap-1">
                {[1, 2, 3].map((n) => (
                  <PixelIcon key={n} name="skull" size={12} className={n <= d.skulls ? "" : "opacity-30"} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </ActionBody>
    </Panel>
  );
}

/** A game with no CPU practice: one private table for you, friends join by code. */
function PlayAlonePanel({ onPlay }) {
  return (
    <Panel title="Play alone" icon="skull" deep="#6a9a30">
      <ActionBody>
        <p className="font-pixel-body text-[22px] text-bone leading-tight">A private table just for you. Friends can join with its code.</p>
        <Btn tone={TONES.poison} onClick={onPlay} className="w-full">
          <PixelIcon name="play" size={14} />
          PLAY ALONE
        </Btn>
      </ActionBody>
    </Panel>
  );
}

// ------------------------------------------------------------- tables ----

function SeatPips({ current, max, color }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${current} of ${max} seats taken`}>
      {Array.from({ length: max }).map((_, j) => (
        <div
          key={j}
          className="max-sm:hidden"
          style={{
            width: 10,
            height: 14,
            backgroundColor: j < current ? color : "#2a234d",
            boxShadow: `0 0 0 1px ${INK}`,
          }}
        />
      ))}
      <span className="sm:ml-1.5 font-pixel-body text-[20px] text-bone">
        {current}/{max}
      </span>
    </div>
  );
}

function TablesPanel({ game, lobbies, onJoin, onRefresh }) {
  // On phones the host moves under the table name.
  const cols = "grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_120px_110px]";
  return (
    <Panel
      title="Open tables"
      icon="cards"
      deep="#463a78"
      className="h-full"
      right={
        <HeaderBtn onClick={onRefresh} bg="#8a7ac0">
          <PixelIcon name="refresh" size={12} />
          Refresh
        </HeaderBtn>
      }
    >
      <div
        className={`grid ${cols} items-center gap-3 px-3 sm:px-4 shrink-0 font-pixel-display text-[10px] uppercase text-bone/70`}
        style={{ height: 36, backgroundColor: INK }}
      >
        <div>Table</div>
        <div className="max-sm:hidden">Host</div>
        <div>Seats</div>
        <div />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {lobbies.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
            <PixelIcon name="cards" size={48} color="#2a234d" />
            <p className="font-pixel-display text-[12px] text-parchment uppercase">No open tables</p>
            <p className="font-pixel-body text-[22px] text-bone/80 max-w-sm leading-tight">
              Host a public table and it appears here for everyone playing {game.title}.
            </p>
          </div>
        ) : (
          lobbies.map((lobby, i) => {
            const full = lobby.current >= lobby.max;
            // A credit match takes no one new once it's dealt (only its own players, back to their seats).
            const closed = full || (lobby.stake != null && lobby.inProgress);
            return (
              <div
                key={lobby.id}
                data-table={lobby.id}
                className={`grid ${cols} items-center px-3 sm:px-4 gap-3`}
                style={{
                  minHeight: 60,
                  backgroundColor: i % 2 ? "#181432" : "transparent",
                  borderBottom: "2px solid #1f1a3d",
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-pixel-display text-[12px] text-parchment truncate">{lobby.name}</span>
                    <span
                      className="font-pixel-display text-[8px] px-1.5 py-1 shrink-0"
                      style={
                        lobby.inProgress
                          ? { backgroundColor: "#7a1530", color: "#ead8b1" }
                          : { backgroundColor: "#2a8a8c", color: "#0a2a2c" }
                      }
                    >
                      {lobby.inProgress ? "PLAYING" : "WAITING"}
                    </span>
                    {lobby.tier && (
                      <span className="font-pixel-display text-[8px] px-1.5 py-1 shrink-0" style={{ backgroundColor: "#c89820", color: INK }}>
                        {lobby.tier === "HOUSE" ? "CREDITS" : lobby.stake != null ? `${lobby.tier} · ${fmt(lobby.stake)}` : `${lobby.tier} ${TIERS[lobby.tier].smallBlind}/${TIERS[lobby.tier].bigBlind}`}
                      </span>
                    )}
                  </div>
                  <div className="font-pixel-body text-[18px] text-bone/60 leading-none mt-1 truncate">
                    {lobby.id}
                    {lobby.stake != null && lobby.current > 0 && <span className="text-glow-gold"> · pot {fmt(lobby.stake * lobby.current)}</span>}
                    <span className="sm:hidden"> · {lobby.host}</span>
                  </div>
                </div>
                <div className="max-sm:hidden font-pixel-body text-[22px] text-bone truncate">{lobby.host}</div>
                <SeatPips current={lobby.current} max={lobby.max} color={game.accent.main} />
                <div className="flex justify-end">
                  <Btn
                    tone={closed ? TONES.dusk : TONES.poison}
                    disabled={closed}
                    onClick={() => onJoin(lobby.id)}
                    className="px-4"
                    style={{ height: 40 }}
                  >
                    {full ? "Full" : closed ? "Playing" : "Join"}
                  </Btn>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------ the screen ----

export default function GameLobby({ game }) {
  const navigate = useNavigate();
  const { identity, isGuest } = useAuth();
  const [lobbies, setLobbies] = useState([]);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const playerName = `${identity.name} #${identity.tag}`;
  const ev = game.events;
  // A game with credits has FREE and CREDITS tabs. Poker's credit tables take
  // a buy-in (credits: { kind: "buyIn" }); a stake game's take one fixed stake each.
  // Back from a credit table, the lobby opens on the CREDITS tab.
  const location = useLocation();
  const [mode, setMode] = useState(game.credits && location.state?.tab === "credits" ? "credits" : "free");
  const credit = !!game.credits && mode === "credits";
  const { credits, error: creditsError, busy: claiming, refresh: refreshCredits, claim, dismissNotice } = useCredits({ enabled: !!game.credits });
  const stakes = game.credits?.kind === "stake";
  // A house game's credit tables take no buy-in: its seats are bought at the table.
  const house = game.credits?.kind === "house";
  // The buy-in or stake panel: { tier, tableName, lobbyId? | create: { name, isPrivate }, busy, error }.
  const [buyIn, setBuyIn] = useState(null);
  const buyInRef = useRef(null); // the socket handlers read the panel without re-subscribing
  useEffect(() => {
    buyInRef.current = buyIn;
  }, [buyIn]);

  useEffect(() => {
    connectSocket(identity);
  }, [identity.name, identity.tag]);

  useEffect(() => {
    let errorTimer;
    const refresh = () => socket.emit(ev.list, { gameType: game.id });
    // The table may be another game's (a code typed here): open the page it belongs to.
    const onJoined = (data) => navigate(data.gameType ? gameRoute(data.gameType) : game.route, { state: { ...data, playerName } });
    const onError = (msg) => {
      if (buyInRef.current) return setBuyIn((b) => b && { ...b, busy: false, error: String(msg) });
      setError(msg);
      clearTimeout(errorTimer);
      errorTimer = setTimeout(() => setError(""), 4000);
    };
    const onTableInfo = ({ lobbyId, name, tier, stake }) => setBuyIn({ tier, stake, tableName: name, lobbyId, busy: false, error: "" });

    refresh();
    socket.on("connect", refresh);
    socket.on(ev.listUpdate, setLobbies);
    socket.on(ev.joined, onJoined);
    socket.on("error_message", onError);
    socket.on("credit_table_info", onTableInfo);
    return () => {
      // Off this screen the list's updates are just traffic.
      if (ev.unlist) socket.emit(ev.unlist);
      clearTimeout(errorTimer);
      socket.off("connect", refresh);
      socket.off(ev.listUpdate, setLobbies);
      socket.off(ev.joined, onJoined);
      socket.off("error_message", onError);
      socket.off("credit_table_info", onTableInfo);
    };
  }, [ev, game.id, game.route, navigate, playerName]);

  function createTable(name, isPrivate) {
    socket.emit(ev.create, { lobbyName: name.trim() || `${identity.name}'s table`, playerName, isPrivate, gameType: game.id });
  }

  function createCreditTable(name, tier, isPrivate) {
    if (house) {
      return socket.emit(ev.create, { lobbyName: name.trim() || `${identity.name}'s table`, playerName, isPrivate, gameType: game.id, tier: "HOUSE" });
    }
    setBuyIn({ tier, stake: stakes ? STAKES[tier] : null, tableName: name.trim() || `${identity.name}'s table`, create: { isPrivate }, busy: false, error: "" });
  }

  function joinTable(lobbyId) {
    const table = lobbies.find((l) => l.id === lobbyId);
    if (table?.tier && table.tier !== "HOUSE") return setBuyIn({ tier: table.tier, stake: table.stake, tableName: table.name, lobbyId, busy: false, error: "" });
    socket.emit(ev.join, { lobbyId, playerName });
  }

  function confirmBuyIn(amount) {
    setBuyIn((b) => ({ ...b, busy: true, error: "" }));
    if (buyIn.create) {
      socket.emit(ev.create, { lobbyName: buyIn.tableName, playerName, isPrivate: buyIn.create.isPrivate, gameType: game.id, tier: buyIn.tier, buyIn: amount });
    } else socket.emit(ev.join, { lobbyId: buyIn.lobbyId, playerName, buyIn: amount });
  }

  // A private table for one: free, or on credits when the CREDITS tab is open.
  function playAlone(name) {
    const lobbyName = (name || "").trim() || game.defaultTableName;
    socket.emit(ev.create, { lobbyName, playerName, isPrivate: true, gameType: game.id, ...(credit ? { tier: "HOUSE" } : {}) });
  }

  function startPractice(difficulty) {
    navigate(game.route, {
      state: {
        lobbyId: `SOLO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        isHost: true,
        playerName,
        mySocketId: socket.id || `solo-${Date.now()}`,
        myPlayerIndex: 0,
        aiDifficulty: difficulty,
      },
    });
  }

  return (
    <div
      className="relative w-full h-screen starfield font-pixel-body text-parchment flex flex-col overflow-hidden"
    >
      <TopBar title={game.title} accent={game.accent.main} onSettings={() => setShowSettings(true)} />

      {error && (
        <div
          role="alert"
          className="absolute left-1/2 -translate-x-1/2 z-20 font-pixel-body text-[22px] px-4 py-2"
          style={{ top: 72, backgroundColor: "#7a1530", color: "#ead8b1", boxShadow: `0 0 0 4px ${INK}` }}
        >
          {error}
        </div>
      )}

      {game.credits && (
        <div role="tablist" aria-label="Stakes" className="flex gap-2 shrink-0" style={{ padding: "var(--gap) var(--gap) 0" }}>
          {[
            ["free", "Free"],
            ["credits", "Credits"],
          ].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className="pixel-btn font-pixel-display text-[11px] uppercase px-4 py-2.5"
              style={
                mode === id
                  ? { backgroundColor: game.accent.main, borderColor: game.accent.deep, color: INK }
                  : { backgroundColor: "#1f1a3d", borderColor: INK, color: "#ead8b1" }
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <main
        className="flex-1 min-h-0 w-full flex flex-col lg:grid lg:grid-cols-[clamp(380px,24vw,480px)_minmax(0,1fr)] overflow-y-auto"
        style={{ padding: "var(--gap)", gap: "var(--gap)" }}
      >
        <div className="grid shrink-0 lg:grid-rows-[auto_repeat(3,minmax(min-content,1fr))]" style={{ gap: "var(--gap)" }}>
          <AdventurerCard game={game} onSignIn={() => setShowLogin(true)} />
          {credit ? (
            <>
              <BalancePanel credits={credits} isGuest={isGuest} error={creditsError} onSignIn={() => setShowLogin(true)} onClaim={claim} claiming={claiming} onDismissNotice={dismissNotice} />
              <CreditHostPanel
                defaultName={game.defaultTableName}
                tiers={house ? null : stakes ? STAKE_BUTTONS : undefined}
                onPlayAlone={game.playAlone ? () => playAlone(game.defaultTableName) : undefined}
                disabled={isGuest || !credits?.canPlay}
                onCreate={createCreditTable}
              />
              <JoinPanel onJoin={joinTable} />
            </>
          ) : (
            <>
              <HostPanel game={game} onCreate={createTable} />
              <JoinPanel onJoin={joinTable} />
              {game.playAlone ? <PlayAlonePanel onPlay={() => playAlone(game.defaultTableName)} /> : <PracticePanel onStart={startPractice} />}
            </>
          )}
        </div>
        <div className="shrink-0 h-[420px] lg:h-auto lg:min-h-0">
          <TablesPanel
            game={game}
            lobbies={game.credits ? lobbies.filter((l) => !!l.tier === credit) : lobbies}
            onJoin={joinTable}
            onRefresh={() => socket.emit(ev.list)}
          />
        </div>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      {buyIn && credits && buyIn.stake != null && (
        <StakePanel
          tier={buyIn.tier}
          stake={buyIn.stake}
          tableName={buyIn.tableName}
          balance={credits.balance}
          bots={game.id === "muushig"}
          busy={buyIn.busy}
          error={buyIn.error}
          onConfirm={confirmBuyIn}
          onCancel={() => setBuyIn(null)}
        >
          <ClaimButton claim={credits.claim} onClaim={() => claim().then(refreshCredits)} busy={claiming} />
        </StakePanel>
      )}
      {buyIn && credits && buyIn.stake == null && (
        <BuyInPanel
          tier={buyIn.tier}
          tableName={buyIn.tableName}
          balance={credits.balance}
          range={buyInRange(buyIn.tier, credits.balance, credits.rathole?.[buyIn.tier])}
          rathole={credits.rathole?.[buyIn.tier]}
          busy={buyIn.busy}
          error={buyIn.error}
          onConfirm={confirmBuyIn}
          onCancel={() => setBuyIn(null)}
        >
          <ClaimButton claim={credits.claim} onClaim={() => claim().then(refreshCredits)} busy={claiming} />
        </BuyInPanel>
      )}
    </div>
  );
}
