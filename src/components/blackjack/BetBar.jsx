// BET BAR — your controls in the betting window: chips that add to your bet,
// a box for any amount, CLEAR, REBET (last round's bet), x2, and DEAL, which
// sends the bet and says you're ready. Chips, CLEAR, REBET and x2 go to the
// table at once; a typed amount goes on DEAL or blur, and while the box holds
// an amount the table can't take, the table's bet is cleared. A free table's seat below the minimum gets REBUY instead.

import React, { useState } from "react";
import Countdown from "../poker/Countdown";
import { MIN_BET } from "../../utils/blackjack/rules";
import { clock } from "./tableInfo";

// The chip rack: value, label, face, ink.
const CHIPS = [
  [10, "10", "#ead8b1", "#0a0712"],
  [50, "50", "#e85a7a", "#0a0712"],
  [100, "100", "#2a8a8c", "#0a0712"],
  [500, "500", "#c89820", "#0a0712"],
  [1000, "1K", "#9bd14f", "#0a0712"],
  [5000, "5K", "#463a78", "#ead8b1"],
];
const BTN = "pixel-btn font-pixel-display text-[10px] px-3 py-2.5 whitespace-nowrap";
const TONE = {
  dusk: { backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" },
  cyan: { backgroundColor: "#5fd4d6", borderColor: "#2a8a8c", color: "#0a2a2c" },
  poison: { backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#142a08" },
  gold: { backgroundColor: "#f4c430", borderColor: "#c89820", color: "#0a0712" },
};

/**
 * seat: your seat in the view (bankroll, bet, lastBet, ready). credit: a
 * credit table (no REBUY). endsAt: when the window closes (a Date.now()
 * time), or null. onBet(amount), onDeal(amount), onRebuy().
 */
export default function BetBar({ seat, credit = false, endsAt = null, onBet, onDeal, onRebuy, compact = false, children }) {
  const [amount, setAmount] = useState(seat.bet || 0);
  const bankroll = seat.bankroll;
  const valid = (n) => Number.isInteger(n) && n >= MIN_BET && n <= bankroll;
  const broke = !credit && bankroll < MIN_BET;

  // Chips, CLEAR, REBET and x2 go to the table at once (a bet it takes, or 0 to clear).
  const change = (n) => {
    setAmount(n);
    if (n === 0 || valid(n)) onBet(n);
  };
  // A typed amount stays in the box until it's committed (blur or DEAL). While the box holds an
  // amount the table can't take, the table's bet is cleared so the circle and the box agree.
  const typed = (n) => {
    setAmount(n);
    if (!valid(n)) onBet(0);
  };
  const commit = (e) => {
    if (e.relatedTarget?.tagName === "BUTTON") return; // moving to a button: it sends (chips, DEAL, ...)
    const n = valid(amount) ? amount : 0;
    if (n !== (seat.bet || 0)) onBet(n);
  };

  const timer = endsAt != null && (
    <Countdown endsAt={endsAt}>{(n) => <span className="font-pixel-display text-[10px] leading-none text-glow-cyan whitespace-nowrap">{`PLACE YOUR BETS ${clock(n)}`}</span>}</Countdown>
  );

  if (broke) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-pixel-body text-[20px] leading-none text-bone">Out of chips: rebuy to keep playing.</span>
        <button className={BTN} style={TONE.gold} onClick={onRebuy}>
          REBUY
        </button>
        {children}
        <span className="ml-auto">{timer}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center ${compact ? "gap-2" : "gap-2.5"}`}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chips">
        {CHIPS.map(([value, label, face, ink]) => (
          <button
            key={value}
            onClick={() => change(amount + value)}
            disabled={amount + value > bankroll}
            className="pixel-pick font-pixel-display text-[10px] leading-none flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              width: compact ? 38 : 44,
              height: compact ? 38 : 44,
              borderRadius: "50%",
              backgroundColor: face,
              color: ink,
              border: "4px dashed #ead8b1",
              boxShadow: "0 3px 0 #0a0712, 0 0 0 2px #0a0712",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Bet amount"
        placeholder="0"
        value={amount ? String(amount) : ""}
        onChange={(e) => typed(Number(e.target.value.replace(/\D/g, "").slice(0, 12)) || 0)}
        onBlur={commit}
        className="font-pixel-body text-[22px] leading-none px-2 py-1 text-parchment tabular-nums"
        style={{ width: compact ? 92 : 110, backgroundColor: "#0a0712", border: "3px solid #2a234d", boxShadow: "inset 0 3px 0 rgba(0,0,0,0.5)" }}
      />
      <button className={BTN} style={TONE.dusk} onClick={() => change(0)} disabled={amount === 0}>
        CLEAR
      </button>
      <button className={BTN} style={TONE.cyan} onClick={() => change(seat.lastBet)} disabled={!valid(seat.lastBet)}>
        REBET
      </button>
      <button className={BTN} style={TONE.cyan} onClick={() => change(amount * 2)} disabled={!(amount > 0) || amount * 2 > bankroll}>
        x2
      </button>
      <button className={BTN} style={TONE.poison} onClick={() => onDeal(amount)} disabled={!valid(amount) || (seat.ready && seat.bet === amount)}>
        {seat.ready && seat.bet === amount ? "READY" : "DEAL"}
      </button>
      {children}
      <span className="ml-auto">{timer}</span>
    </div>
  );
}
