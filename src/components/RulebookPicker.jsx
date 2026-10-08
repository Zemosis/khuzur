// RULEBOOK PICKER — the main menu's RULES button: a dropdown listing every
// game, which opens that game's rulebook (the same one the table header opens).

import React, { useEffect, useRef, useState } from "react";
import PixelIcon from "./PixelIcon";
import RulesModal from "./thirteen/RulesModal";
import MuushigRules from "./muushig/MuushigRules";
import PokerRules from "./poker/PokerRules";

const GAMES = [
  { id: "thirteen", label: "Thirteen", color: "#f4c430", Rules: RulesModal },
  { id: "muushig", label: "Muushig", color: "#e85a7a", Rules: MuushigRules },
  { id: "poker", label: "Poker", color: "#9bd14f", Rules: PokerRules },
];

export default function RulebookPicker() {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(null);
  const ref = useRef(null);

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

  const Rules = GAMES.find((g) => g.id === reading)?.Rules;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="pixel-btn font-pixel-display text-xs px-4 py-2.5 uppercase flex items-center gap-2 max-sm:px-3 max-sm:self-stretch"
        style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}
        title="Read a game's rules"
      >
        <PixelIcon name="book" size={14} />
        <span className="max-sm:sr-only">Rules</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Rulebook"
          className="absolute right-0 flex flex-col p-2 gap-1"
          style={{
            top: "calc(100% + 8px)",
            width: 200,
            zIndex: 100,
            backgroundColor: "#1f1a3d",
            border: "3px solid #0a0712",
            boxShadow: "4px 4px 0 #0a0712, inset 0 2px 0 0 rgba(255,255,255,0.06)",
          }}
        >
          {GAMES.map((g) => (
            <button
              key={g.id}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setReading(g.id);
              }}
              className="pixel-hbtn text-left flex items-center gap-3 px-3 py-2"
            >
              <span style={{ color: g.color }}>
                <PixelIcon name="book" size={12} />
              </span>
              <span className="font-pixel-display text-[10px] tracking-wider" style={{ color: g.color }}>
                {g.label.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      )}

      {Rules && <Rules onClose={() => setReading(null)} />}
    </div>
  );
}
