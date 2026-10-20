// GAME CHAT — table chat and the move log, as two tabs.
//
// Chat messages carry an unread count on the CHAT tab while you're reading
// the log. The list scrolls inside its own box (never the page), and stays
// pinned to the newest message. When the server holds a chat flood
// (`blocked`, see hooks/useChatLimit), `notice` says why and nothing sends.
// A player's name opens a MUTE button: their messages disappear for you (see
// utils/chatPrefs), and a strip above the list brings them back.

import React, { useLayoutEffect, useRef, useState } from "react";
import { PixelAvatar } from "../PixelCard";
import PixelIcon from "../PixelIcon";
import CardChip from "../CardChip";
import { MAX_CHAT, setMuted, useChatPrefs } from "../../utils/chatPrefs";

const QUICK_REPLIES = ["gg", "wp", "oof", "lol", "nice", "?"];
const baseName = (name = "") => name.split(" #")[0];

function Tab({ active, onClick, children, badge = 0 }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="pixel-hbtn relative h-full px-3 font-pixel-display text-[11px] tracking-wider"
      style={{
        color: active ? "#5fd4d6" : "#8a7fb0",
        boxShadow: active ? "inset 0 -3px 0 #5fd4d6" : "none",
      }}
    >
      {children}
      {badge > 0 && (
        <span
          className="ml-1.5 font-pixel-display text-[10px] px-1 py-0.5 leading-none align-middle"
          style={{ backgroundColor: "#e85a7a", color: "#1a1024" }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

const GameChat = ({ messages = [], onSendMessage, avatarFor, colorFor, notice = null, blocked = false }) => {
  const [inputText, setInputText] = useState("");
  const [tab, setTab] = useState("chat");
  const [seenChat, setSeenChat] = useState(0);
  const listRef = useRef(null);
  const { muted } = useChatPrefs();

  const chatMessages = messages.filter((m) => m.type !== "SYSTEM" && !muted.includes(m.sender));
  const logMessages = messages.filter((m) => m.type === "SYSTEM");
  const visible = tab === "log" ? logMessages : chatMessages;
  const unread = tab === "chat" ? 0 : Math.max(0, chatMessages.length - seenChat);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length, tab]);

  const switchTab = (next) => {
    // Leaving or entering chat both mean everything so far has been seen.
    setSeenChat(chatMessages.length);
    setTab(next);
  };

  const send = (text) => {
    if (blocked || !text.trim()) return false;
    onSendMessage(text);
    if (tab !== "chat") switchTab("chat");
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Held: keep what was typed, to send once chat opens again.
    if (send(inputText)) setInputText("");
  };

  return (
    <section className="flex flex-col flex-1 min-h-0" aria-label="Chat">
      <div
        role="tablist"
        className="flex items-stretch justify-between pr-3"
        style={{ height: 40, backgroundColor: "#1a1024" }}
      >
        <div className="flex">
          <Tab active={tab === "chat"} onClick={() => switchTab("chat")} badge={unread}>
            CHAT
          </Tab>
          <Tab active={tab === "log"} onClick={() => switchTab("log")}>
            LOG
          </Tab>
        </div>
        <span className="self-center font-pixel-display text-[10px] text-bone/50">
          {tab === "log"
            ? `${logMessages.filter((m) => MOVE_KINDS.has(m.kind) && !BLINDS.has(m.action)).length} MOVES`
            : `${visible.length} MSGS`}
        </span>
      </div>

      {tab === "chat" && muted.length > 0 && <MutedStrip muted={muted} />}

      <div
        ref={listRef}
        className={`flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col ${tab === "log" ? "gap-1" : "gap-2"}`}
        role="log"
        aria-live="polite"
      >
        {visible.length === 0 && (
          <div className="m-auto font-pixel-body text-[20px] text-bone/50 text-center">
            {tab === "log" ? "Moves will be logged here." : "Say hi to the table!"}
          </div>
        )}
        {visible.map((msg) =>
          msg.type === "SYSTEM" ? (
            <LogLine key={msg.id} msg={msg} color={colorFor?.(msg.playerIndex)} />
          ) : (
            <ChatMessage key={msg.id} msg={msg} avatar={avatarFor?.(msg)} />
          ),
        )}
      </div>

      {notice && (
        <div
          role="status"
          className="px-3 py-1.5 font-pixel-body text-[18px] leading-none"
          style={{ borderTop: "3px solid #1f1a3d", backgroundColor: "#2e0f1d", color: "#e85a7a" }}
        >
          {notice}
        </div>
      )}
      <form onSubmit={handleSubmit} className="p-2 flex gap-1.5" style={{ borderTop: "3px solid #1f1a3d", backgroundColor: "#14102a" }}>
        <input
          type="text"
          value={inputText}
          maxLength={MAX_CHAT}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Say something..."
          aria-label="Chat message"
          className="flex-1 min-w-0 font-pixel-body text-[20px] px-2 py-1.5 text-parchment"
          style={{ backgroundColor: "#0a0712", border: "2px solid #1f1a3d", boxShadow: "inset 0 2px 0 0 rgba(0,0,0,0.5)" }}
        />
        <button
          type="submit"
          disabled={blocked || !inputText.trim()}
          className="pixel-btn font-pixel-display px-3"
          style={{ backgroundColor: "#5fd4d6", borderColor: "#2a8a8c", color: "#0a3a3a" }}
          aria-label="Send"
        >
          <PixelIcon name="right" size={14} />
        </button>
      </form>
      <div className="px-2 pb-2 grid grid-cols-6 gap-1" style={{ backgroundColor: "#14102a" }}>
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            disabled={blocked}
            className="pixel-btn pixel-choice font-pixel-body text-[18px] leading-none py-1.5"
            style={{ "--tone": "#463a78", backgroundColor: "#1f1a3d", borderColor: "#0a0712", color: "#ead8b1" }}
          >
            {q}
          </button>
        ))}
      </div>
    </section>
  );
};

function Divider({ children, color = "#8a7fb0" }) {
  return (
    <div className="flex items-center gap-2 my-1" style={{ color }}>
      <span className="flex-1" style={{ height: 2, backgroundColor: "currentColor", opacity: 0.35 }} />
      <span className="font-pixel-display text-[10px] tracking-wider whitespace-nowrap">{children}</span>
      <span className="flex-1" style={{ height: 2, backgroundColor: "currentColor", opacity: 0.35 }} />
    </div>
  );
}

// What counts as a move for the LOG tab's count (a poker blind doesn't).
const MOVE_KINDS = new Set(["play", "pass", "action"]);
const BLINDS = new Set(["sb", "bb"]);
// Poker's moves, each a coloured chip: [label, background, text].
const ACTION_CHIP = {
  sb: ["SMALL BLIND", "#1f3a4d", "#5fd4d6"],
  bb: ["BIG BLIND", "#1f3a4d", "#5fd4d6"],
  fold: ["FOLD", "#2a234d", "#8a7fb0"],
  check: ["CHECK", "#463a78", "#ead8b1"],
  call: ["CALL", "#5fd4d6", "#0a3a3a"],
  bet: ["BET", "#f4c430", "#1a1024"],
  raise: ["RAISE TO", "#f4c430", "#1a1024"],
  allin: ["ALL-IN", "#e85a7a", "#3a0e1a"],
};

// The entry's line as words, for screen readers: what's drawn is hidden from them.
const Said = ({ text }) => (text ? <span className="sr-only">{text}</span> : null);

// One log entry: plays as name + combo + card chips, passes dimmed, and
// dividers where a trick or round ends; for poker, moves as a name and a
// coloured chip, each street's cards, and the pot's winner in gold. Old
// plain-text entries still render.
function LogLine({ msg, color = "#ead8b1" }) {
  const name = (
    <span className="font-pixel-display text-[10px] shrink-0" style={{ color }}>
      {msg.name}
    </span>
  );

  if (msg.kind === "round") {
    return (
      <div
        className="font-pixel-display text-[10px] tracking-wider text-center py-1.5 mt-1"
        style={{ backgroundColor: "#1f1a3d", color: "#f4c430" }}
      >
        {msg.label ?? `ROUND ${msg.round}`}
      </div>
    );
  }

  if (msg.kind === "action") {
    const [label, bg, fg] = ACTION_CHIP[msg.action] ?? [String(msg.action).toUpperCase(), "#463a78", "#ead8b1"];
    const folded = msg.action === "fold";
    return (
      <div className={`flex items-center gap-2 px-2 py-1 ${folded ? "opacity-60" : ""}`} title={msg.timestamp}>
        <Said text={msg.text} />
        <span aria-hidden className="contents">
          {name}
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="font-pixel-display text-[8px] leading-none px-1.5 py-1 whitespace-nowrap" style={{ backgroundColor: bg, color: fg, boxShadow: "1px 1px 0 #0a0712" }}>
              {label}
            </span>
            {msg.amount != null && <span className="font-pixel-body text-[20px] leading-none text-glow-gold tabular-nums">{msg.amount}</span>}
          </span>
        </span>
      </div>
    );
  }

  if (msg.kind === "street") {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 my-0.5" style={{ backgroundColor: "#0e2418", boxShadow: "inset 3px 0 0 #9bd14f" }} title={msg.timestamp}>
        <Said text={msg.text} />
        <span aria-hidden className="contents">
          <span className="font-pixel-display text-[10px] tracking-wider" style={{ color: "#9bd14f" }}>
            {msg.label}
          </span>
          <span className="ml-auto flex flex-wrap justify-end gap-1">
            {msg.cards.map((c) => (
              <CardChip key={c.id || c.rank + c.suit} card={c} />
            ))}
          </span>
        </span>
      </div>
    );
  }

  if (msg.kind === "win") {
    return (
      <div className="flex flex-col gap-1 px-2 py-1.5 my-0.5" style={{ backgroundColor: "#2a2410", boxShadow: "inset 3px 0 0 #f4c430, 0 0 0 1px rgba(244,196,48,0.25)" }} title={msg.timestamp}>
        <Said text={msg.text} />
        <span aria-hidden className="flex items-center gap-2">
          {name}
          <span className="font-pixel-display text-[8px] leading-none px-1.5 py-1" style={{ backgroundColor: "#f4c430", color: "#1a1024", boxShadow: "1px 1px 0 #0a0712" }}>
            WINS
          </span>
          <span className="ml-auto font-pixel-body text-[20px] leading-none text-glow-gold tabular-nums">{msg.amount}</span>
        </span>
        {msg.hand && (
          <span aria-hidden className="font-pixel-body text-[18px] leading-none" style={{ color: "#f4c430" }}>
            {msg.hand}
          </span>
        )}
      </div>
    );
  }
  if (msg.kind === "trick") return <Divider>{msg.name} {msg.verb || "TAKES THE TRICK"}</Divider>;
  if (msg.kind === "roundEnd") return <Divider color="#f4c430">{msg.name} {msg.verb || "WINS THE ROUND"}</Divider>;

  if (msg.kind === "pass") {
    return (
      <div className="flex items-center gap-2 px-2 py-1 opacity-60" title={msg.timestamp}>
        <Said text={msg.text} />
        <span aria-hidden={msg.text ? true : undefined} className="contents">
          {name}
          <span className="font-pixel-body text-[18px] leading-none text-bone/80">{msg.verb || "passed"}</span>
        </span>
      </div>
    );
  }

  if (msg.kind === "play") {
    return (
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5"
        style={{ backgroundColor: "#14102a", boxShadow: `inset 3px 0 0 ${color}` }}
        title={msg.timestamp}
      >
        <Said text={msg.text} />
        <span aria-hidden={msg.text ? true : undefined} className="contents">
          {name}
          {msg.cards.length > 1 && <span className="font-pixel-body text-[18px] leading-none text-bone/70 min-w-0">{msg.combo}</span>}
          <span className="ml-auto flex flex-wrap justify-end gap-1">
            {msg.cards.map((c) => (
              <CardChip key={c.id || c.rank + c.suit} card={c} />
            ))}
          </span>
        </span>
      </div>
    );
  }

  return <div className="font-pixel-body text-[18px] leading-tight text-bone/75">{msg.text}</div>;
}

// Who you've muted, each a button to unmute them.
function MutedStrip({ muted }) {
  return (
    <div
      role="group"
      aria-label="Muted players"
      className="flex flex-wrap items-center gap-1.5 px-3 py-1.5"
      style={{ borderBottom: "3px solid #1f1a3d", backgroundColor: "#14102a" }}
    >
      <span className="font-pixel-display text-[9px] text-bone/50">MUTED</span>
      {muted.map((name) => (
        <button
          key={name}
          onClick={() => setMuted(name, false)}
          aria-label={`Unmute ${baseName(name)}`}
          title="Unmute"
          className="pixel-hbtn font-pixel-display text-[9px] leading-none px-1.5 py-1 flex items-center gap-1"
          style={{ backgroundColor: "#1f1a3d", color: "#ead8b1", boxShadow: "0 0 0 2px #0a0712" }}
        >
          {baseName(name)} <PixelIcon name="close" size={8} />
        </button>
      ))}
    </div>
  );
}

function ChatMessage({ msg, avatar }) {
  const [menu, setMenu] = useState(false);
  const name = baseName(msg.sender);
  return (
    <div className={`flex gap-2 items-start ${msg.isMe ? "flex-row-reverse" : ""}`}>
      <PixelAvatar variant={avatar?.variant ?? 2} customAvatarData={avatar?.customAvatarData} size={34} />
      <div className={`min-w-0 max-w-[80%] flex flex-col ${msg.isMe ? "items-end" : "items-start"}`}>
        <div className="flex items-baseline gap-1.5">
          {msg.isMe ? (
            <span className="font-pixel-display text-[10px]" style={{ color: "#5fd4d6" }}>
              {name}
            </span>
          ) : (
            <button
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              title="Mute this player"
              className="pixel-hbtn font-pixel-display text-[10px]"
              style={{ color: "#f4c430" }}
            >
              {name}
            </button>
          )}
          {menu && (
            <button
              onClick={() => setMuted(msg.sender, true)}
              aria-label={`Mute ${name}`}
              className="pixel-hbtn font-pixel-display text-[9px] leading-none px-1.5 py-1"
              style={{ backgroundColor: "#7a1530", color: "#ead8b1", boxShadow: "0 0 0 2px #0a0712" }}
            >
              MUTE
            </button>
          )}
          <span className="font-pixel-body text-[18px] leading-none text-bone/40">{msg.timestamp}</span>
        </div>
        <div
          className="font-pixel-body text-[20px] leading-tight px-2 py-1 mt-0.5 break-words max-w-full"
          style={{
            backgroundColor: msg.isMe ? "#2a8a8c" : "#1f1a3d",
            color: msg.isMe ? "#06201f" : "#ead8b1",
            border: "2px solid #0a0712",
          }}
        >
          {msg.text}
        </div>
      </div>
    </div>
  );
}

export default GameChat;
