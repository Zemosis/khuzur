// PLAYER MENU — the main menu's player badge. The whole badge (avatar, name,
// tag) is one button; it opens a menu with the quick avatar switch (presets,
// your painted avatar, + to paint one) and a link to your profile and stats.
// It's as tall as the menu's buttons, and fills its row on phones. Signed
// in, it also shows your level, your gold and credits, and your rank when
// it's in the top 500. Your XP bar lives on the profile page.
// Guests can't save an avatar, so they get a note instead of the switch.
// The menu ends with Sign in (guests) or Sign out.

import React, { useEffect, useRef, useState } from "react";
import { PixelAvatar } from "../PixelCard";
import PixelIcon from "../PixelIcon";
import { fmt } from "../../utils/poker/tiers";
import { useCountUp } from "../../hooks/useCountUp";
import { levelProgress } from "../../utils/progression";

const PRESETS = ["1", "2", "3", "4", "5"];

const pickStyle = (selected) => ({
  padding: 3,
  border: selected ? "3px solid #f4c430" : "3px solid #1f1a3d",
  backgroundColor: selected ? "#2a1f1a" : "#0a0712",
  boxShadow: selected ? "0 0 10px rgba(244,196,48,0.5)" : "none",
  cursor: "pointer",
  transition: "border-color 120ms ease, box-shadow 120ms ease",
  flexShrink: 0,
});

// Your leaderboard rank shows beside your credits only near the top.
const SHOWN_RANKS = 500;

/** A pixel coin: gold, lit top-left, shaded bottom-right. */
const Coin = () => (
  <span
    aria-hidden
    className="inline-block shrink-0"
    style={{ width: 8, height: 8, backgroundColor: "#f4c430", boxShadow: "inset -2px -2px 0 #c89820, inset 2px 2px 0 #ffe066, 0 0 0 1px #0a0712" }}
  />
);

export default function PlayerMenu({ identity, isGuest, credits = null, rank = null, onSelectAvatar, onPaint, onViewProfile, onSignIn, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = String(identity.avatar);
  // A claim rolls the balance up, and the badge glows as it lands; gold rolls up after a match.
  const { shown, landed } = useCountUp(credits);
  const { shown: gold, landed: goldLanded } = useCountUp(isGuest ? null : (identity.gold ?? 0));

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (variant) => {
    setOpen(false);
    onSelectAvatar(variant);
  };

  return (
    <div ref={ref} className="relative max-sm:flex-1 max-sm:min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Avatar and profile"
        // As tall as the buttons beside it (the settings button is 52). Its
        // face is flat (badge-face), so the avatar gets the full height.
        className={`pixel-btn badge-face relative flex items-center gap-2.5 w-full pl-2 pr-3 text-left ${landed || goldLanded ? "badge-landed" : ""}`}
        style={{
          height: 52,
          backgroundColor: open ? "#2a234d" : "#1f1a3d",
          borderColor: "#0a0712",
        }}
      >
        <span className="shrink-0 flex" style={{ boxShadow: "0 0 0 2px #0a0712" }}>
          <PixelAvatar variant={identity.avatar} size={30} customAvatarData={current === "custom" ? identity.customAvatar : null} />
        </span>
        {/* Who you are: name and tag over your level. */}
        <span className="flex flex-col justify-center items-start gap-2 min-w-0">
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="font-pixel-display text-[10px] text-parchment leading-none">{identity.name}</span>{" "}
            <span className="font-pixel-body text-[16px] leading-none text-bone/60">#{identity.tag}</span>
          </span>
          {isGuest ? (
            <span className="font-pixel-display text-[8px] leading-none text-bone/70 uppercase">Guest</span>
          ) : (
            <span className="font-pixel-display text-[8px] leading-none px-1 py-0.5" style={{ backgroundColor: "#f4c430", color: "#0a0712" }}>
              LV {levelProgress(identity.exp ?? 0).level}
            </span>
          )}
        </span>
        {/* What you hold: gold over credits (and your rank near the top). */}
        {!isGuest && (
          <>
            <span aria-hidden className="self-stretch w-[2px] my-1 shrink-0" style={{ backgroundColor: "#2a234d" }} />
            <span className="flex flex-col justify-center items-start gap-2 min-w-[84px] font-pixel-display text-[9px] leading-none tabular-nums whitespace-nowrap">
              <span className="flex items-center gap-1.5 text-glow-gold" title="Gold">
                <Coin />
                {fmt(gold)}
                <span className="sr-only"> gold</span>
              </span>
              {credits != null && (
                <span className="text-parchment" title="Credits">
                  {fmt(shown)} CR
                  {rank && rank <= SHOWN_RANKS && <span className="text-bone/60"> · #{rank}</span>}
                </span>
              )}
            </span>
          </>
        )}
        <span className="text-bone/70 ml-auto" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms ease" }}>
          <PixelIcon name="down" size={10} />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Player menu"
          className="absolute right-0 flex flex-col gap-2"
          style={{
            top: "calc(100% + 8px)",
            width: "max-content",
            maxWidth: "calc(100vw - 32px)",
            zIndex: 100,
            backgroundColor: "#14102a",
            border: "3px solid #c89820",
            boxShadow: "0 0 0 3px #0a0712, 0 4px 12px rgba(0,0,0,0.5)",
            padding: 8,
          }}
        >
          {isGuest ? (
            <p className="font-pixel-body text-[18px] text-bone/80 leading-tight px-1" style={{ maxWidth: 230 }}>
              Sign in to choose an avatar and keep your stats.
            </p>
          ) : (
            <>
              <div className="flex gap-1.5">
                {PRESETS.map((v) => (
                  <button
                    key={v}
                    role="menuitemradio"
                    aria-checked={current === v}
                    aria-label={`Avatar ${v}`}
                    onClick={() => pick(v)}
                    className="pixel-pick"
                    style={pickStyle(current === v)}
                  >
                    <PixelAvatar variant={v} size={34} />
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {identity.customAvatar && (
                  <button
                    role="menuitemradio"
                    aria-checked={current === "custom"}
                    aria-label="Painted avatar"
                    onClick={() => pick("custom")}
                    className="pixel-pick"
                    style={pickStyle(current === "custom")}
                  >
                    <PixelAvatar variant="custom" size={34} customAvatarData={identity.customAvatar} />
                  </button>
                )}
                <button
                  role="menuitem"
                  aria-label="Paint your avatar"
                  title="Paint your avatar"
                  onClick={() => {
                    setOpen(false);
                    onPaint();
                  }}
                  className="pixel-pick flex items-center justify-center"
                  style={{ ...pickStyle(false), width: 48, height: 48, color: "#f4c430", fontFamily: "'Press Start 2P', monospace", fontSize: 16 }}
                >
                  +
                </button>
              </div>
            </>
          )}

          <div style={{ height: 2, backgroundColor: "#1f1a3d" }} />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onViewProfile();
            }}
            className="pixel-hbtn flex items-center gap-2 px-2 py-2 font-pixel-display text-[10px] uppercase text-parchment text-left"
          >
            <PixelIcon name="user" size={12} />
            View profile & stats
          </button>
          {(isGuest ? onSignIn : onSignOut) && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                (isGuest ? onSignIn : onSignOut)();
              }}
              className={`pixel-hbtn flex items-center gap-2 px-2 py-2 font-pixel-display text-[10px] uppercase text-left ${isGuest ? "text-glow-gold" : "text-bone/80"}`}
            >
              <PixelIcon name={isGuest ? "key" : "back"} size={12} />
              {isGuest ? "Sign in" : "Sign out"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
