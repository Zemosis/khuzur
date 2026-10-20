// CARD CHIP — a card named small and inline, rank and suit on a card face:
// the move log and the match page's round highlights.

import React from "react";

const RED_SUITS = new Set(["♥", "♦"]);

export default function CardChip({ card }) {
  return (
    <span
      className="inline-flex items-center font-pixel-display text-[10px] leading-none px-1 py-1"
      style={{
        backgroundColor: "#ead8b1",
        color: RED_SUITS.has(card.suit) ? "#c0203a" : "#1a1024",
        boxShadow: "inset 0 -2px 0 #c8b890, 1px 1px 0 #0a0712",
      }}
    >
      {card.rank}
      <span className="text-[13px] ml-px">{card.suit}</span>
    </span>
  );
}
