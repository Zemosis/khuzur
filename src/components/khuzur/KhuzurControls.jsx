// KHUZUR CONTROLS — the buttons under your hand. Leading: LEAD. Beating:
// BEAT and PICK UP. SWAP 7 while you may swap the trump 7. SURRENDER at any
// time during play. `reason` says why the main button is off.

import React from "react";
import { INK } from "../pixelTokens";

const TONES = {
  gold: { backgroundColor: "#f4c430", borderColor: "#c89820", color: INK },
  rose: { backgroundColor: "#e85a7a", borderColor: "#a83a5a", color: INK },
  cyan: { backgroundColor: "#5fd4d6", borderColor: "#2a8a8c", color: INK },
  dusk: { backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" },
  blood: { backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" },
};

function Button({ tone, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="pixel-btn font-pixel-display text-[11px] uppercase px-4 py-2.5 disabled:opacity-40"
      style={TONES[tone]}
    >
      {children}
    </button>
  );
}

export default function KhuzurControls({ mode, canLead, canBeat, reason, canSwap, onLead, onBeat, onPickUp, onSwap, onSurrender, playing = true }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {mode === "lead" && (
          <Button tone="gold" onClick={onLead} disabled={!canLead}>
            LEAD
          </Button>
        )}
        {mode === "beat" && (
          <>
            <Button tone="gold" onClick={onBeat} disabled={!canBeat}>
              BEAT
            </Button>
            <Button tone="rose" onClick={onPickUp}>
              PICK UP
            </Button>
          </>
        )}
        {canSwap && (
          <Button tone="cyan" onClick={onSwap}>
            SWAP 7
          </Button>
        )}
        {playing && (
          <Button tone="blood" onClick={onSurrender}>
            SURRENDER
          </Button>
        )}
      </div>
      {mode !== "wait" && reason && <div className="font-pixel-body text-[18px] text-bone/70 leading-none">{reason}</div>}
    </div>
  );
}
