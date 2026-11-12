// TABLE CHROME — what every game table shares around the felt: the header
// bar and the sidebar (scoreboard and chat).
//
// On a wide screen the header centres the match, the game and the round, and
// the sidebar is a column beside the table. On a compact one (phones, tablets,
// split screens; see useTableMetrics) the header keeps to one tight row and
// the sidebar slides out over the table from a header button, which counts
// chat messages that arrived while it was shut (hooks/useUnread).

import React, { useEffect } from "react";
import PixelIcon from "./PixelIcon";
import { SignalBars } from "./PixelUI";

/** LOCAL for games played in the browser, else the server's ping. */
export function ConnectionSignal({ local, connected, ping }) {
  return (
    <div className="flex items-center gap-1.5 font-pixel-body text-sm">
      {local ? (
        <>
          <SignalBars level={3} color="#9bd14f" />
          <span className="text-bone/70">LOCAL</span>
        </>
      ) : !connected ? (
        <>
          <SignalBars level={1} color="#e85a7a" />
          <span style={{ color: "#e85a7a" }}>OFFLINE</span>
        </>
      ) : (
        <>
          <SignalBars
            level={ping == null || ping < 80 ? 3 : ping < 160 ? 2 : 1}
            color={ping == null || ping < 80 ? "#9bd14f" : ping < 160 ? "#f4c430" : "#e85a7a"}
          />
          <span className="text-bone/70">{ping != null ? `${ping}ms` : "..."}</span>
        </>
      )}
    </div>
  );
}

const square = { width: 36, height: 36, padding: 0 };

/**
 * badge: shown beside EXIT (the table code, practice level); hidden on small
 * screens. kicker: the small line over the title (null for none).
 * match / round: omit either to leave its box out. signal: node for
 * the right side. rulesTone: { bg, deep, ink } for the RULES button.
 * onPanel / unread: the compact layout's sidebar button. extra: a node right
 * of the title (Khuzur's turn clock), on every layout.
 */
export function TableHeader({
  compact,
  narrow,
  onExit,
  badge,
  title,
  kicker = "NOW PLAYING",
  titleClass = "text-glow-gold",
  titleColor,
  match,
  round,
  signal,
  rulesTone,
  onRules,
  onSettings,
  onPanel,
  unread = 0,
  extra = null,
}) {
  const box = { backgroundColor: "#0a0712", border: "3px solid #1f1a3d" };
  return (
    <div
      className={`relative flex items-center justify-between z-10 ${compact ? "gap-2 px-3 py-2" : "px-5 py-3"}`}
      style={{ backgroundColor: "rgba(10,7,18,0.85)", borderBottom: "4px solid #0a0712", backdropFilter: "blur(2px)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onExit}
          aria-label="Exit"
          className="pixel-btn font-pixel-display text-[10px] px-3 py-2 shrink-0"
          style={{ backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" }}
        >
          <span className="flex items-center gap-2">
            <PixelIcon name="back" size={12} />
            {!narrow && "EXIT"}
          </span>
        </button>
        {badge && <div className="ml-2 min-w-0 max-md:hidden">{badge}</div>}
        {compact && (
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-pixel-display text-[12px] sm:text-sm truncate ${titleClass}`} style={{ color: titleColor }}>
              {title}
            </span>
            {round !== undefined && (
              <span className="font-pixel-display text-[10px] leading-none px-1.5 py-1 text-glow-gold shrink-0" style={box}>
                R{round}
              </span>
            )}
            {extra}
          </div>
        )}
      </div>

      {!compact && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
          {match !== undefined && (
            <div className="flex flex-col items-center px-3 py-1" style={box}>
              <div className="font-pixel-display text-[8px] text-bone/60 tracking-wider">MATCH</div>
              <div className="font-pixel-display text-sm text-glow-gold">{match}</div>
            </div>
          )}
          <div className="flex flex-col items-center">
            {kicker && <div className="font-pixel-display text-[8px] text-bone/60 tracking-wider">{kicker}</div>}
            <div className={`font-pixel-display text-base ${titleClass}`} style={{ color: titleColor }}>
              {title}
            </div>
          </div>
          {round !== undefined && (
            <div className="flex flex-col items-center px-3 py-1" style={box}>
              <div className="font-pixel-display text-[8px] text-bone/60 tracking-wider">ROUND</div>
              <div className="font-pixel-display text-sm text-glow-gold">{round}</div>
            </div>
          )}
          {extra}
        </div>
      )}

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {signal && <div className="max-sm:hidden">{signal}</div>}
        {compact && onPanel && (
          <button
            onClick={onPanel}
            aria-label={unread ? `Scoreboard and chat, ${unread} unread` : "Scoreboard and chat"}
            title="Scoreboard and chat"
            className="pixel-btn relative"
            style={{ ...square, backgroundColor: "#2a8a8c", borderColor: "#1a5a5c", color: "#0a2a2c" }}
          >
            <PixelIcon name="chat" size={16} className="mx-auto" />
            {unread > 0 && (
              <span
                className="absolute font-pixel-display text-[8px] leading-none px-1 py-0.5"
                style={{ top: -8, right: -8, backgroundColor: "#e85a7a", color: "#1a1024", boxShadow: "0 0 0 2px #0a0712" }}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        )}
        {onRules && (
          <button
            onClick={onRules}
            aria-label="Rules"
            className="pixel-btn font-pixel-display text-[10px] flex items-center justify-center gap-2"
            style={{
              backgroundColor: rulesTone.bg,
              borderColor: rulesTone.deep,
              color: rulesTone.ink,
              height: 36,
              ...(narrow ? { width: 36, padding: 0 } : { paddingLeft: 12, paddingRight: 12 }),
            }}
            title="How to play"
          >
            <PixelIcon name="book" size={14} />
            {!narrow && "RULES"}
          </button>
        )}
        {onSettings && (
          <button
            onClick={onSettings}
            aria-label="Settings"
            className="pixel-btn font-pixel-display"
            style={{ ...square, backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1", fontSize: 12 }}
            title="Settings"
          >
            <PixelIcon name="gear" size={16} className="mx-auto" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The scoreboard-and-chat column. Compact, it is a panel that slides in from
 * the right over a dimmed table; it stays mounted while shut so the chat
 * keeps its tab and scroll.
 */
export function TableSidebar({ compact, open, onClose, children }) {
  const frame = { borderColor: "#0a0712", background: "#0e0a1f" };
  useEffect(() => {
    if (!compact || !open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact, open, onClose]);
  if (!compact) {
    return (
      <div className="flex flex-col min-h-0 border-l-4" style={frame}>
        {children}
      </div>
    );
  }
  return (
    <>
      {open && <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(10,7,18,0.6)" }} onClick={onClose} aria-hidden />}
      <aside
        aria-label="Scoreboard and chat"
        inert={!open}
        className="fixed top-0 right-0 bottom-0 z-40 flex flex-col border-l-4"
        style={{
          ...frame,
          width: "min(320px, 88vw)",
          transform: open ? "none" : "translateX(100%)",
          visibility: open ? "visible" : "hidden",
          transition: open ? "transform 180ms ease-out" : "transform 180ms ease-in, visibility 0s 180ms",
          boxShadow: open ? "-6px 0 0 rgba(10,7,18,0.5)" : "none",
        }}
      >
        <div className="flex items-center justify-end px-2 shrink-0" style={{ height: 44, backgroundColor: "#0a0712" }}>
          <button
            onClick={onClose}
            className="pixel-hbtn flex items-center gap-2 font-pixel-display text-[10px] px-2 py-1.5 text-parchment"
          >
            CLOSE
            <PixelIcon name="close" size={12} />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
