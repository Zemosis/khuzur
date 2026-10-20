// CHAT BUBBLE — what a player just said, in a speech bubble beside their seat
// (see hooks/useChatBubbles for when and for how long). Pixel style, with a
// tail pointing at the seat. Each line is cut short past MAX_CHARS; the chat
// panel has the full text.
//
// Every seat opens its bubble in a fixed direction chosen for that seat, into
// space no other seat uses: `side` is where the bubble goes ("above", "below",
// "left" or "right" of the seat) and `align` which edge of the seat it lines
// up with ("start" = left / top, "center", "end" = right / bottom). A seat at
// the edge of the screen lines up with its outer edge so the bubble grows
// inward, never off screen.

import React from "react";

const MAX_CHARS = 60;
const TAIL_INSET = 18; // tail's distance from an aligned edge
const clip = (text) => (text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text);

const VERTICAL = { above: true, below: true };

/** The bubble's position against its seat. Centring uses `translate`, so the
 *  pop-in animation (index.css) can scale it without undoing that. */
function placement(side, align, gap) {
  const along = VERTICAL[side]
    ? { start: { left: 0 }, center: { left: "50%", translate: "-50% 0" }, end: { right: 0 } }[align]
    : { start: { top: 0 }, center: { top: "50%", translate: "0 -50%" }, end: { bottom: 0 } }[align];
  const across = {
    above: { bottom: "100%", marginBottom: gap },
    below: { top: "100%", marginTop: gap },
    left: { right: "100%", marginRight: gap },
    right: { left: "100%", marginLeft: gap },
  }[side];
  return { ...across, ...along };
}

/** The tail: a turned square showing two of its borders, the corner at the seat. */
function tailStyle(side, align) {
  const along = VERTICAL[side]
    ? { start: { left: TAIL_INSET }, center: { left: "50%" }, end: { right: TAIL_INSET } }[align]
    : { start: { top: TAIL_INSET }, center: { top: "50%" }, end: { bottom: TAIL_INSET } }[align];
  const shift = align === "end" ? "50%" : "-50%";
  const across = {
    above: { top: "100%", borderTop: "none", borderLeft: "none", transform: `translate(${shift}, -6px) rotate(45deg)` },
    below: { bottom: "100%", borderBottom: "none", borderRight: "none", transform: `translate(${shift}, 6px) rotate(45deg)` },
    left: { left: "100%", borderBottom: "none", borderLeft: "none", transform: `translate(-6px, ${shift}) rotate(45deg)` },
    right: { right: "100%", borderTop: "none", borderRight: "none", transform: `translate(6px, ${shift}) rotate(45deg)` },
  }[side];
  return { ...along, ...across };
}

// `gap`: room between the bubble and the seat, e.g. to clear a seat's TURN
// tag and arrow.
export default function ChatBubble({ name, lines, side = "above", align = "center", gap = 14 }) {
  return (
    <div
      role="note"
      aria-label={`${name} says`}
      data-side={side}
      data-align={align}
      className="chat-bubble absolute z-40 pointer-events-none flex flex-col gap-0.5 px-2.5 py-1.5 font-pixel-body text-[18px] leading-[1.05]"
      style={{
        ...placement(side, align, gap),
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
        className="absolute"
        style={{ width: 12, height: 12, backgroundColor: "#ead8b1", border: "3px solid #0a0712", ...tailStyle(side, align) }}
      />
    </div>
  );
}
