// PIXEL CARD - Pure CSS card component (no images)

import React from "react";
import CustomAvatarCanvas from "./CustomAvatarCanvas";
import { presetAvatar } from "../utils/avatarConstants";
import { cardSizeStyle } from "./pixelTokens";
import JokerFace from "./JokerFace";

const SUIT_COLOR = {
  "♠": "suit-black",
  "♣": "suit-black",
  "♥": "suit-red",
  "♦": "suit-red",
};

export function PixelCard({
  rank = "A",
  suit = "♠",
  joker = null, // "gray" | "color": a joker face (Khuzur); rank and suit are ignored
  size = "medium",
  faceDown = false,
  selected = false,
  dim = false,
  selectable = false,
  onClick,
  style,
  rotate = 0,
  width,
  className = "",
}) {
  const sized = cardSizeStyle(width);
  const sizeClass = sized ? "sized" : size === "large" ? "large" : size === "small" ? "small" : "";
  const colorClass = SUIT_COLOR[suit] || "suit-black";

  if (faceDown) {
    return (
      <div
        className={`pixel-card pixel-card-back ${sizeClass} ${className}`}
        style={{
          ...sized,
          ...style,
          transform: rotate ? `rotate(${rotate}deg)` : style?.transform,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#f4c430",
            fontFamily: "'Press Start 2P', monospace",
            fontSize: sized ? "var(--back-fs)" : size === "large" ? 24 : size === "small" ? 12 : 18,
            textShadow: "1px 1px 0 #000",
          }}
        >
          ♦
        </div>
      </div>
    );
  }

  const jokerClass = joker ? `joker-${joker}` : "";
  return (
    <div
      className={`pixel-card ${sizeClass} ${jokerClass} ${selected ? "selected" : ""} ${dim ? "dim" : ""} ${selectable ? "selectable" : ""} ${className}`}
      onClick={selectable ? onClick : undefined}
      style={{
        ...sized,
        ...style,
        transform:
          rotate && !selected ? `rotate(${rotate}deg)` : style?.transform,
      }}
    >
      {joker ? (
        <JokerFace kind={joker} />
      ) : (
        <>
          <span className={`corner tl ${colorClass}`}>
            {rank}
            <span className="suit">{suit}</span>
          </span>
          <span className={`center-suit ${colorClass}`}>{suit}</span>
          <span className={`corner br ${colorClass}`}>
            {rank}
            <span className="suit">{suit}</span>
          </span>
        </>
      )}
    </div>
  );
}

export function CardFan({ count = 5, size = "small", spread = 14 }) {
  const cards = Array.from({ length: count });
  const mid = (count - 1) / 2;
  return (
    <div
      style={{
        position: "relative",
        width: count * 8 + 40,
        height: size === "small" ? 64 : 92,
      }}
    >
      {cards.map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${i * 6}px`,
            top: `${Math.abs(i - mid) * 1.5}px`,
            transform: `rotate(${(i - mid) * (spread / count)}deg)`,
            transformOrigin: "bottom center",
            zIndex: i,
          }}
        >
          <PixelCard faceDown size={size} />
        </div>
      ))}
    </div>
  );
}

export function PixelAvatar({
  variant = 1,
  size = 51,
  active = false,
  eliminated = false,
  customAvatarData = null,
}) {
  // Built-in and painted avatars share one pixel-exact renderer.
  const data = variant === "custom" && customAvatarData ? customAvatarData : presetAvatar(variant);
  return (
    <div
      style={{
        opacity: eliminated ? 0.35 : 1,
        // A glow round the square, not a drop-shadow filter: a filter paints
        // the face into a bitmap first, which comes out blurred between pixels.
        boxShadow: active ? "0 0 10px 2px rgba(244,196,48,0.6)" : "none",
        flexShrink: 0,
      }}
    >
      <CustomAvatarCanvas avatarData={data} size={size} />
    </div>
  );
}

export function PixelButton({
  children,
  color = "gold",
  size = "md",
  onClick,
  disabled,
  className = "",
  style,
}) {
  const palette = {
    gold: { bg: "#f4c430", text: "#1a1024", border: "#c89820" },
    cyan: { bg: "#5fd4d6", text: "#0a3a3a", border: "#2a8a8c" },
    rose: { bg: "#e85a7a", text: "#3a0e1a", border: "#a83a5a" },
    poison: { bg: "#9bd14f", text: "#1a3a0e", border: "#6a9a30" },
    dusk: { bg: "#463a78", text: "#ead8b1", border: "#2a234d" },
    bone: { bg: "#ead8b1", text: "#1a1024", border: "#a89870" },
    danger: { bg: "#7a1530", text: "#ead8b1", border: "#3a0a18" },
  }[color];
  const sizes = {
    sm: "px-3 py-2 text-[11px]",
    md: "px-5 py-2.5 text-xs",
    lg: "px-7 py-3.5 text-sm",
    xl: "px-9 py-4 text-base",
  }[size];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`pixel-btn font-pixel-display ${sizes} uppercase ${className}`}
      style={{
        backgroundColor: palette.bg,
        color: palette.text,
        borderColor: palette.border,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function PixelPanel({
  children,
  className = "",
  style,
  accent = "default",
  title,
  icon,
}) {
  const accentColors = {
    default: { border: "#1a1024", bg: "#1f1a3d" },
    gold: { border: "#c89820", bg: "#2a1f1a" },
    cyan: { border: "#2a8a8c", bg: "#0e2a2c" },
    rose: { border: "#a83a5a", bg: "#2a0e18" },
    felt: { border: "#7a1530", bg: "#3a1424" },
    dusk: { border: "#463a78", bg: "#1a1530" },
  };
  const c = accentColors[accent] || accentColors.default;
  return (
    <div
      className={`relative ${className}`}
      style={{
        backgroundColor: c.bg,
        border: `4px solid ${c.border}`,
        boxShadow:
          "0 0 0 4px #0a0712, inset 0 4px 0 0 rgba(255,255,255,0.06), inset 0 -4px 0 0 rgba(0,0,0,0.4)",
        ...style,
      }}
    >
      {title && (
        <div
          className="font-pixel-display text-[12px] uppercase tracking-wider px-3 py-2.5 flex items-center gap-2 text-shadow-hard-sm"
          style={{
            backgroundColor: c.border,
            color: "#ead8b1",
            borderBottom: "4px solid #0a0712",
          }}
        >
          {icon && <span>{icon}</span>}
          <span>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

export function HeartIcons({ count, max = 3, color = "#e85a7a" }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          style={{
            color: i < count ? color : "#3a0e1a",
            textShadow: i < count ? "1px 1px 0 #000" : "none",
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ♥
        </span>
      ))}
    </span>
  );
}

export default PixelCard;
