// PLAYER MENU — the main menu's player badge. The whole badge (avatar, name,
// tag) is one button; it opens a menu with the quick avatar switch (presets,
// your painted avatar, + to paint one) and a link to your profile and stats.
// Signed in, the badge also shows your credit balance.
// Guests can't save an avatar, so they get a note instead of the switch.

import React, { useEffect, useRef, useState } from "react";
import { PixelAvatar } from "../PixelCard";
import PixelIcon from "../PixelIcon";
import { fmt } from "../../utils/poker/tiers";

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

export default function PlayerMenu({ identity, isGuest, credits = null, onSelectAvatar, onPaint, onViewProfile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = String(identity.avatar);

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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Avatar and profile"
        className="pixel-hbtn flex items-center gap-2 px-3 py-2 text-left"
        style={{
          backgroundColor: open ? "#2a234d" : "#1f1a3d",
          border: "3px solid #0a0712",
          boxShadow: "inset 0 2px 0 0 rgba(255,255,255,0.06)",
        }}
      >
        <PixelAvatar variant={identity.avatar} size={34} customAvatarData={current === "custom" ? identity.customAvatar : null} />
        <span>
          <span className="block font-pixel-display text-[8px] text-bone uppercase">{isGuest ? "Guest" : "Player"}</span>
          <span className="block font-pixel-body text-xs text-parchment leading-none">
            {identity.name} #{identity.tag}
          </span>
          {credits != null && <span className="block font-pixel-display text-[8px] text-glow-gold mt-1 tabular-nums">{fmt(credits)} CR</span>}
        </span>
        <span className="text-bone/70" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms ease" }}>
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
        </div>
      )}
    </div>
  );
}
