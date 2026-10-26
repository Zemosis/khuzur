// MAIN MENU - Pixel Retro Landing Page

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  PixelCard,
  PixelButton,
} from "../components/PixelCard";
import { useAuth } from "../hooks/useAuth";
import { useCredits } from "../hooks/useCredits";
import RestartNotice from "../components/credits/RestartNotice";
import MenuClaim from "../components/credits/MenuClaim";
import { VERSION } from "../utils/changelog";
import { useServerStats } from "../hooks/useServerStats";
import { connectSocket } from "../utils/socket";
import LoginModal from "../components/auth/LoginModal";
import PlayerMenu from "../components/auth/PlayerMenu";
import SettingsModal from "../components/SettingsModal";
import PixelIcon from "../components/PixelIcon";
import RulebookPicker from "../components/RulebookPicker";
import { reducedMotion } from "../utils/motion";

const MainMenu = () => {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { identity, isGuest, needsProfileSetup, signOut, updateProfile } = useAuth();
  const { credits, dismissNotice, claim, busy: claiming, error: creditsError } = useCredits({ enabled: !isGuest });
  const stats = useServerStats();

  useEffect(() => {
    connectSocket(identity);
  }, [identity.name, identity.tag]);

  return (
    <div className="relative w-full min-h-dvh starfield font-pixel-body text-parchment overflow-x-hidden flex flex-col">
      {/* After a restart sent your table credits home: where they went. */}
      {!isGuest && credits?.notice && (
        <div className="absolute left-1/2 -translate-x-1/2 z-30 w-[min(560px,calc(100%-32px))]" style={{ top: 88 }}>
          <RestartNotice notice={credits.notice} onDismiss={dismissNotice} />
        </div>
      )}
      {/* Distant pixel mountains silhouette */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "20%",
          background: "linear-gradient(180deg, transparent 0%, #0a0712 100%)",
          pointerEvents: "none",
        }}
      />
      <Mountains />

      {/* TOP BAR: the hall on the left (where you can go), you on the right
          (your claim, your badge, settings). Everything is 52 tall. On phones
          the hall keeps the first row and your side takes the second, with
          the claim under it. */}
      <header className="relative flex flex-wrap items-center gap-x-3 gap-y-3 px-4 sm:px-8 py-3">
        <div className="flex items-center gap-3 mr-auto">
          <div
            style={{
              width: 36,
              height: 36,
              background:
                "linear-gradient(180deg, #f4c430 0%, #c89820 50%, #6b3a1f 100%)",
              border: "3px solid #0a0712",
              boxShadow: "2px 2px 0 #0a0712, inset 0 0 0 1px #ffe066",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 16,
              color: "#1a1024",
              textShadow: "1px 1px 0 rgba(255,224,102,0.5)",
            }}
          >
            ♠
          </div>
          <div className="font-pixel-display text-[14px] tracking-wider text-glow-gold max-[399px]:hidden">
            KHUZUR
          </div>
          <span aria-hidden className="self-stretch w-[3px] mx-1 sm:mx-2 max-[399px]:hidden" style={{ backgroundColor: "#2a234d" }} />
          <nav aria-label="Hall" className="flex items-center gap-2 sm:gap-3">
            <RulebookPicker />
            {/* Credits are the ranking: everyone's balance, best first. */}
            <button
              onClick={() => navigate("/leaderboard")}
              aria-label="Leaderboard"
              title="Leaderboard: everyone's credits"
              className="pixel-btn font-pixel-display text-xs px-4 uppercase flex items-center gap-2 max-sm:px-3"
              style={{ height: 52, backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}
            >
              <PixelIcon name="crown" size={12} />
              <span className="max-sm:hidden">Ranks</span>
            </button>
            <button
              className="pixel-btn font-pixel-display text-xs px-4 uppercase relative max-sm:px-3"
              style={{ height: 52, backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}
              title="Coming soon — spend gold on card skins"
            >
              Shop
              <span
                className="font-pixel-display"
                style={{
                  position: "absolute",
                  top: -8,
                  right: -8,
                  fontSize: 7,
                  padding: "2px 4px",
                  backgroundColor: "#e85a7a",
                  color: "#ead8b1",
                  border: "2px solid #0a0712",
                  letterSpacing: "0.05em",
                }}
              >
                SOON
              </span>
            </button>
          </nav>
        </div>

        {/* Signing in and out lives in the player menu and in Settings. */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 max-sm:w-full">
          {!isGuest && (
            <div className="max-sm:order-last max-sm:w-full">
              <MenuClaim claim={credits?.claim} onClaim={claim} busy={claiming} error={creditsError} />
            </div>
          )}
          <PlayerMenu
            identity={identity}
            isGuest={isGuest}
            credits={isGuest ? null : (credits?.balance ?? null)}
            rank={isGuest ? null : (credits?.rank ?? null)}
            onSelectAvatar={(v) => updateProfile({ avatar: v }).catch(console.error)}
            onPaint={() => navigate("/avatar-paint")}
            onViewProfile={() => navigate("/profile")}
            onSignIn={() => setShowLogin(true)}
            onSignOut={signOut}
          />
          <button
            onClick={() => setShowSettings(true)}
            className="pixel-btn font-pixel-display shrink-0"
            style={{
              backgroundColor: "#463a78",
              borderColor: "#2a234d",
              color: "#ead8b1",
              width: 52,
              height: 52,
              padding: 0,
              fontSize: 16,
            }}
            title="Settings"
            aria-label="Settings"
          >
            <PixelIcon name="gear" size={16} className="mx-auto" />
          </button>
        </div>
      </header>

      {/* The hero and the game row sit centred between the top bar and the footer. */}
      <main className="relative flex-1 flex flex-col justify-center pt-6 pb-10">
      {/* HERO */}
      <div className="relative flex flex-col items-center text-center px-4 pb-2">
        <h1
          className="font-pixel-display text-[22px] sm:text-[30px] md:text-[36px] leading-tight"
          style={{
            color: "#fff7d8",
            textShadow:
              "2px 2px 0 #1a1024, 0 0 18px rgba(255,247,216,0.55), 0 0 32px rgba(244,196,48,0.35)",
          }}
        >
          CHOOSE YOUR GAME
        </h1>
      </div>

      {/* GAME CARDS: one row that scrolls sideways once the games outgrow it */}
      <GameRail>
        <GameTile
          id="13"
          title="THIRTEEN"
          tag="2-4 PLAYERS"
          desc="Be the first to empty your hand. Beat the last play with a higher single, pair, triple or 5-card hand."
          accent="gold"
          cards={[
            { rank: "A", suit: "♠" },
            { rank: "K", suit: "♥" },
            { rank: "Q", suit: "♦" },
            { rank: "J", suit: "♣" },
            { rank: "10", suit: "♠" },
          ]}
          difficulty={2}
          lobbies={stats.lobbies?.thirteen}
          hovered={hovered === "13"}
          onMouseEnter={() => setHovered("13")}
          onMouseLeave={() => setHovered(null)}
          onClick={() => navigate("/lobby-13")}
        />
        <GameTile
          id="muushig"
          title="MUUSHIG"
          tag="5 PLAYERS"
          desc="Trick-taking with trumps. Start at 15 points, each trick you win takes one off, and the first to reach 0 wins."
          accent="rose"
          cards={[
            { rank: "2", suit: "♣" },
            { rank: "3", suit: "♦" },
            { rank: "4", suit: "♥" },
            { rank: "5", suit: "♠" },
            { rank: "6", suit: "♣" },
          ]}
          difficulty={3}
          lobbies={stats.lobbies?.muushig}
          hovered={hovered === "muushig"}
          onMouseEnter={() => setHovered("muushig")}
          onMouseLeave={() => setHovered(null)}
          onClick={() => navigate("/lobby-muushig")}
        />
        <GameTile
          id="poker"
          title="POKER"
          tag="2-6 PLAYERS"
          desc="No-limit Texas Hold'em. Two cards of your own, five on the table: bet, bluff and take the pot."
          accent="moss"
          cards={[
            { rank: "A", suit: "♠" },
            { rank: "A", suit: "♥" },
            { rank: "K", suit: "♦" },
            { rank: "K", suit: "♣" },
            { rank: "Q", suit: "♠" },
          ]}
          difficulty={2}
          lobbies={stats.lobbies?.poker}
          hovered={hovered === "poker"}
          onMouseEnter={() => setHovered("poker")}
          onMouseLeave={() => setHovered(null)}
          onClick={() => navigate("/lobby-poker")}
        />
        <GameTile
          id="locked"
          title="???"
          tag="COMING"
          desc="Coming soon."
          accent="dusk"
          locked
          difficulty={0}
          hovered={hovered === "locked"}
          onMouseEnter={() => setHovered("locked")}
          onMouseLeave={() => setHovered(null)}
        />
      </GameRail>
      </main>

      {/* FOOTER */}
      <div className="relative">
        <div className="checker-strip h-2" />
        <div className="flex flex-wrap items-center justify-center sm:justify-between gap-x-4 gap-y-1 px-4 sm:px-8 py-2 bg-void">
          <div className="font-pixel-body text-bone/60 text-sm">
            v{VERSION} — patch{" "}
            <span className="text-parchment">"CUTE RAY"</span>
            <span className="text-mist mx-2">|</span>
            <Link to="/patch-notes" className="underline hover:text-parchment">
              Patch notes
            </Link>
            <span className="text-mist mx-2">|</span>
            <Link to="/privacy" className="underline hover:text-parchment">
              Privacy
            </Link>
          </div>
          <div className="flex items-center gap-4 font-pixel-body text-bone/70 text-sm">
            {stats.connected ? (
              <>
                <span>{stats.online ?? "—"} ONLINE</span>
                <span className="text-mist">|</span>
                <span>{stats.tables ?? "—"} TABLES OPEN</span>
                <span className="text-mist">|</span>
                <span className="text-glow-gold">
                  PING {stats.ping != null ? `${stats.ping}MS` : "—"}
                </span>
              </>
            ) : (
              <span style={{ color: "#e85a7a" }}>SERVER OFFLINE</span>
            )}
          </div>
        </div>
      </div>

      {(showLogin || needsProfileSetup) && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          initialSetup={needsProfileSetup}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          account={{
            isGuest,
            onSignIn: () => setShowLogin(true),
            onSignOut: signOut,
          }}
        />
      )}
    </div>
  );
};

// The game tiles in one sideways-scrolling row. Pixel arrows either side step
// it one tile at a time; they only show when the row doesn't fit, and each
// greys out at its end. The tiles stay centred while they all fit.
function GameRail({ children }) {
  const railRef = useRef(null);
  const [edges, setEdges] = useState({ overflow: false, start: true, end: true });

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ overflow: max > 1, start: el.scrollLeft <= 1, end: el.scrollLeft >= max - 1 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (ro && railRef.current) ro.observe(railRef.current.firstElementChild);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [measure]);

  const step = (dir) => {
    const el = railRef.current;
    const tile = el?.firstElementChild?.firstElementChild;
    if (!el || !tile) return;
    const gap = parseFloat(getComputedStyle(el.firstElementChild).columnGap) || 0;
    el.scrollBy({ left: dir * (tile.offsetWidth + gap), behavior: reducedMotion() ? "auto" : "smooth" });
  };

  const arrow = (dir) => (
    <button
      type="button"
      onClick={() => step(dir)}
      disabled={dir < 0 ? edges.start : edges.end}
      aria-label={dir < 0 ? "Previous games" : "More games"}
      className="pixel-btn flex-none self-center flex items-center justify-center"
      style={{
        width: 40,
        height: 40,
        padding: 0,
        backgroundColor: "#463a78",
        borderColor: "#2a234d",
        color: "#ead8b1",
        visibility: edges.overflow ? "visible" : "hidden",
      }}
    >
      <PixelIcon name={dir < 0 ? "left" : "right"} size={14} />
    </button>
  );

  return (
    <div className="relative flex items-start gap-2 sm:gap-4 px-2 sm:px-6 pt-2 min-w-0">
      {arrow(-1)}
      {/* Padding inside the rail leaves room for the tiles' lift and outline. */}
      <div
        ref={railRef}
        onScroll={measure}
        className="game-rail flex-1 min-w-0 overflow-x-auto snap-x snap-mandatory scroll-px-3"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="flex w-max mx-auto gap-6 lg:gap-10 px-3 pt-4 pb-6">{children}</div>
      </div>
      {arrow(1)}
    </div>
  );
}

function GameTile({
  title,
  tag,
  desc,
  accent,
  cards = [],
  difficulty = 1,
  lobbies,
  locked,
  hovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}) {
  const accentMap = {
    gold: {
      border: "#c89820",
      bg: "#2a1f1a",
      text: "#f4c430",
      tagBg: "#f4c430",
      tagText: "#1a1024",
    },
    rose: {
      border: "#a83a5a",
      bg: "#2a0e18",
      text: "#e85a7a",
      tagBg: "#e85a7a",
      tagText: "#3a0e1a",
    },
    moss: {
      border: "#6a9a30",
      bg: "#13240f",
      text: "#9bd14f",
      tagBg: "#9bd14f",
      tagText: "#1a3a0e",
    },
    dusk: {
      border: "#2a234d",
      bg: "#14102a",
      text: "#7a6abf",
      tagBg: "#463a78",
      tagText: "#ead8b1",
    },
  }[accent];

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={!locked ? onClick : undefined}
      className="cursor-pointer transition-transform flex-none snap-start w-[min(300px,calc(100vw-128px))]"
      style={{
        transform: hovered && !locked ? "translateY(-8px)" : "translateY(0)",
        transition: "transform 120ms ease",
      }}
    >
      <div
        className="relative"
        style={{
          backgroundColor: accentMap.bg,
          border: `4px solid ${accentMap.border}`,
          boxShadow:
            hovered && !locked
              ? `0 0 0 4px #0a0712, 0 12px 0 #0a0712, inset 0 4px 0 rgba(255,255,255,0.08), 0 0 28px ${accentMap.text}55`
              : "0 0 0 4px #0a0712, 0 6px 0 #0a0712, inset 0 4px 0 rgba(255,255,255,0.06)",
          transition: "box-shadow 120ms ease",
        }}
      >
        {/* Tag stripe */}
        <div
          className="flex items-center justify-between px-3 py-1.5"
          style={{
            backgroundColor: accentMap.tagBg,
            borderBottom: "4px solid #0a0712",
          }}
        >
          <span
            className="font-pixel-display text-[9px]"
            style={{ color: accentMap.tagText }}
          >
            {tag}
          </span>
          <span
            className="font-pixel-display text-[9px]"
            style={{ color: accentMap.tagText }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} style={{ opacity: i < difficulty ? 1 : 0.25 }}>
                <PixelIcon name="star" size={9} />
              </span>
            ))}
          </span>
        </div>

        {/* Card preview */}
        <div className="relative h-[110px] flex items-end justify-center pb-2 dither-light overflow-hidden">
          {locked ? (
            <div
              style={{
                fontSize: 70,
                color: "#463a78",
                fontFamily: "'Press Start 2P', monospace",
                textShadow: "4px 4px 0 #0a0712",
              }}
            >
              ?
            </div>
          ) : (
            <div className="flex" style={{ marginTop: 24 }}>
              {cards.map((c, i) => {
                const mid = (cards.length - 1) / 2;
                return (
                  <div
                    key={i}
                    style={{
                      marginLeft: i === 0 ? 0 : -24,
                      transform: hovered
                        ? `rotate(${(i - mid) * 9}deg) translateY(${Math.abs(i - mid) * 3 - 8}px)`
                        : `rotate(${(i - mid) * 6}deg) translateY(${Math.abs(i - mid) * 2}px)`,
                      transformOrigin: "bottom center",
                      zIndex: i,
                      transition: "transform 200ms ease",
                    }}
                  >
                    <PixelCard rank={c.rank} suit={c.suit} size="medium" />
                  </div>
                );
              })}
            </div>
          )}

          {hovered && !locked && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: `radial-gradient(circle at 50% 60%, ${accentMap.text}33 0%, transparent 60%)`,
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        {/* Title block */}
        <div
          className="px-5 py-2"
          style={{ borderTop: "3px solid #0a0712", backgroundColor: "#0a0712" }}
        >
          <div
            className="font-pixel-display text-2xl text-shadow-hard mb-2"
            style={{ color: accentMap.text }}
          >
            {title}
          </div>
          {/* min-height fits the longest (3-line) description so all three
              tiles stay the same height */}
          <div className="font-pixel-body text-base text-parchment/80 leading-snug mb-2 min-h-[64px]">
            {desc}
          </div>

          <div className="flex items-center justify-between">
            <div className="font-pixel-body text-bone/70 text-sm">
              <span>
                {locked || lobbies == null
                  ? "—"
                  : `${lobbies} ${lobbies === 1 ? "lobby" : "lobbies"} open`}
              </span>
            </div>
            {locked ? (
              <div
                className="font-pixel-display text-[10px] px-3 py-2"
                style={{
                  backgroundColor: "#0a0712",
                  color: "#7a6abf",
                  border: "2px solid #2a234d",
                }}
              >
                LOCKED
              </div>
            ) : (
              <PixelButton
                color={{ gold: "gold", moss: "poison" }[accent] || "rose"}
                size="md"
              >
                PLAY
              </PixelButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Mountains() {
  return (
    <svg
      viewBox="0 0 1280 200"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        height: 200,
        opacity: 0.6,
        pointerEvents: "none",
      }}
    >
      <path
        d="M0,200 L0,140 L60,140 L60,120 L100,120 L100,100 L140,100 L140,80 L180,80 L180,100 L220,100 L220,120 L260,120 L260,140 L320,140 L320,110 L360,110 L360,90 L400,90 L400,70 L440,70 L440,90 L480,90 L480,120 L540,120 L540,150 L600,150 L600,130 L640,130 L640,100 L680,100 L680,80 L720,80 L720,110 L760,110 L760,130 L820,130 L820,150 L880,150 L880,120 L920,120 L920,90 L960,90 L960,110 L1000,110 L1000,140 L1060,140 L1060,160 L1120,160 L1120,130 L1160,130 L1160,110 L1200,110 L1200,140 L1240,140 L1240,160 L1280,160 L1280,200 Z"
        fill="#1a1530"
      />
      <path
        d="M0,200 L0,170 L80,170 L80,160 L160,160 L160,180 L240,180 L240,160 L320,160 L320,170 L400,170 L400,150 L480,150 L480,170 L560,170 L560,160 L640,160 L640,180 L720,180 L720,160 L800,160 L800,170 L880,170 L880,150 L960,150 L960,170 L1040,170 L1040,160 L1120,160 L1120,180 L1200,180 L1200,160 L1280,160 L1280,200 Z"
        fill="#0a0712"
      />
    </svg>
  );
}

export default MainMenu;
