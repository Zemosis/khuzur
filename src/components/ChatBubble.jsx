// CHAT BUBBLE — what a player just said, in a speech bubble over their seat
// (see hooks/useChatBubbles for when and for how long). Pixel style, with a
// tail pointing at the seat: `tail` "down" sits the bubble above it, "up"
// below it. Each line is cut short past MAX_CHARS; the chat panel has the
// full text.

import React from "react";

const MAX_CHARS = 60;
const clip = (text) => (text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text);

// `gap`: room between the bubble and the seat, e.g. to clear a seat's TURN
// tag and arrow.
export default function ChatBubble({ name, lines, tail = "down", gap = 14 }) {
  const place = tail === "down" ? { bottom: "100%", marginBottom: gap } : { top: "100%", marginTop: gap };
  return (
    <div
      role="note"
      aria-label={`${name} says`}
      className="chat-bubble absolute left-1/2 z-40 pointer-events-none flex flex-col gap-0.5 px-2.5 py-1.5 font-pixel-body text-[18px] leading-[1.05]"
      style={{
        ...place,
        transform: "translateX(-50%)",
        width: "max-content",
        maxWidth: 190,
        backgroundColor: "#ead8b1",
        color: "#1a1024",
        border: "3px solid #0a0712",
        boxShadow: "3px 3px 0 #0a0712",
        overflowWrap: "anywhere",
      }}
    >
      {lines.map((line, i) => (
        // Older lines fade back; the newest is the one to read.
        <div key={`${i}-${line}`} style={{ opacity: i === lines.length - 1 ? 1 : 0.6 }}>
          {clip(line)}
        </div>
      ))}
      <span
        aria-hidden
        className="absolute left-1/2"
        style={{
          width: 12,
          height: 12,
          backgroundColor: "#ead8b1",
          border: "3px solid #0a0712",
          ...(tail === "down"
            ? { top: "100%", borderTop: "none", borderLeft: "none", transform: "translate(-50%, -6px) rotate(45deg)" }
            : { bottom: "100%", borderBottom: "none", borderRight: "none", transform: "translate(-50%, 6px) rotate(45deg)" }),
        }}
      />
    </div>
  );
}
