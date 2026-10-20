// BET CONTROLS — the bar under a poker table: a status line, then your move
// when it's your turn: FOLD, CHECK or CALL n, and a raise row (½ POT, POT,
// ALL-IN, a slider and the exact amount). Keys: F folds, C checks or calls,
// R raises; Enter in the amount box raises too. Raises are "to" amounts, as
// the engine takes them. The bar keeps its height whether or not it's your
// turn, so the table above never resizes. On a phone (`compact`) and on a
// short screen (`short`, all in one row) the raise row folds into a drawer
// that opens over the table.

import React, { useEffect, useState } from "react";

const BTN = "pixel-btn font-pixel-display text-[11px] px-4 py-3 whitespace-nowrap";
const ROW_H = 46; // one row of the bar: the status line and the buttons
const TONE = {
  fold: { backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" },
  call: { backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" },
  raise: { backgroundColor: "#f4c430", borderColor: "#c89820", color: "#1a1024" },
  preset: { backgroundColor: "#1f1a3d", borderColor: "#0a0712", color: "#ead8b1" },
};

const typing = (e) => /^(INPUT|TEXTAREA)$/.test(e.target?.tagName) && e.target.type !== "range";

/**
 * legal: legalActions() for your seat, or null when it isn't your turn.
 * pot: every chip in this hand (potSize); currentBet: the bet to match.
 * message: the status line (whose turn, what just happened); warning shows instead, in rose.
 */
export default function BetControls({ legal, pot = 0, currentBet = 0, onMove, message = "", warning = null, compact = false, short = false, children }) {
  const drawn = compact || short; // the raise row is a drawer
  const [amount, setAmount] = useState(legal?.minRaiseTo ?? 0);
  const [drawer, setDrawer] = useState(false);
  // A new turn (or a new minimum) starts the amount at the minimum raise.
  const turnKey = legal ? `${legal.minRaiseTo}-${legal.maxRaiseTo}-${currentBet}` : null;
  const [shownKey, setShownKey] = useState(turnKey);
  if (turnKey !== shownKey) {
    setShownKey(turnKey);
    setAmount(legal?.minRaiseTo ?? 0);
    setDrawer(false);
  }

  const clamp = (n) => (legal ? Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(n))) : 0);
  // A pot-sized raise: call first, then raise by the whole pot.
  const potRaise = (fraction) => clamp(currentBet + (pot + (legal?.toCall ?? 0)) * fraction);
  const raise = (to = amount) => onMove(to >= legal.maxRaiseTo ? { type: "allin" } : { type: "raise", amount: clamp(to) });
  const checkOrCall = () => onMove(legal.canCheck ? { type: "check" } : { type: "call" });

  useEffect(() => {
    if (!legal) return;
    const onKey = (e) => {
      if (typing(e) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "f") onMove({ type: "fold" });
      else if (k === "c") checkOrCall();
      else if (k === "r" && legal.canRaise) raise();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const raiseWord = currentBet === 0 ? "BET" : "RAISE TO";
  const raiseRow = legal?.canRaise && (
    <div className={`flex items-center gap-2 ${drawn ? "flex-wrap" : ""}`} style={{ minHeight: ROW_H }} role="group" aria-label="Raise amount">
      <button className={BTN} style={TONE.preset} onClick={() => setAmount(potRaise(0.5))}>
        ½ POT
      </button>
      <button className={BTN} style={TONE.preset} onClick={() => setAmount(potRaise(1))}>
        POT
      </button>
      <button className={BTN} style={TONE.preset} onClick={() => setAmount(legal.maxRaiseTo)}>
        ALL-IN
      </button>
      <input
        type="range"
        aria-label="Raise slider"
        min={legal.minRaiseTo}
        max={legal.maxRaiseTo}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="pixel-range flex-1 min-w-[60px]"
        // How far along the slider is, for its gold fill (see .pixel-range in index.css).
        style={{ "--fill": `${Math.round(((clamp(amount) - legal.minRaiseTo) / Math.max(1, legal.maxRaiseTo - legal.minRaiseTo)) * 100)}%` }}
      />
      <input
        type="number"
        aria-label="Raise to"
        min={legal.minRaiseTo}
        max={legal.maxRaiseTo}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        onBlur={() => setAmount(clamp(amount))}
        onKeyDown={(e) => e.key === "Enter" && raise(clamp(amount))}
        className="font-pixel-body text-[20px] w-[84px] px-2 py-1 text-parchment"
        style={{ backgroundColor: "#0a0712", border: "3px solid #1f1a3d" }}
      />
      <button className={BTN} style={TONE.raise} onClick={() => raise(clamp(amount))}>
        {amount >= legal.maxRaiseTo ? "ALL-IN" : `${raiseWord} ${clamp(amount)}`}
      </button>
    </div>
  );

  const buttons = (
    <>
      {children}
      {legal && (
        <>
          <button className={BTN} style={TONE.fold} onClick={() => onMove({ type: "fold" })}>
            FOLD{!compact && <span className="text-[8px] opacity-70"> (F)</span>}
          </button>
          <button className={BTN} style={TONE.call} onClick={checkOrCall}>
            {legal.canCheck ? "CHECK" : `CALL ${legal.toCall}`}
            {!compact && <span className="text-[8px] opacity-70"> (C)</span>}
          </button>
          {drawn && legal.canRaise && (
            <button className={BTN} style={TONE.raise} onClick={() => setDrawer((d) => !d)} aria-expanded={drawer}>
              {raiseWord.split(" ")[0]}
            </button>
          )}
        </>
      )}
    </>
  );

  return (
    // Room for two rows, used or not: on a wide screen the raise row over
    // the status line and buttons; on a phone the status line over the
    // buttons. A short screen has one row.
    <div className="relative flex flex-col justify-end gap-2 shrink-0" style={{ minHeight: short && !compact ? ROW_H : ROW_H * 2 + 8 }}>
      {drawn && drawer && raiseRow && (
        <div className="absolute left-0 right-0 bottom-full mb-2 z-40 p-2" style={{ backgroundColor: "#14102a", border: "3px solid #0a0712", boxShadow: "4px 4px 0 #0a0712" }}>
          {raiseRow}
        </div>
      )}
      {!drawn && raiseRow}
      <div className={`flex items-stretch gap-2 ${compact ? "flex-col" : "flex-wrap"}`}>
        <div className="flex-1 min-w-[160px] flex items-center px-4" style={{ backgroundColor: "#0a0712", border: "3px solid #1f1a3d", minHeight: ROW_H }}>
          <div role="status" className="font-pixel-body text-[20px] leading-none" style={{ color: warning ? "#e85a7a" : legal ? "#f4c430" : "rgba(200,184,144,0.85)" }}>
            {warning || message}
          </div>
        </div>
        {compact ? (
          <div className="flex gap-2 [&>*]:flex-1 [&>*]:min-w-0 [&>*]:px-2" style={{ minHeight: ROW_H }}>
            {buttons}
          </div>
        ) : (
          buttons
        )}
      </div>
    </div>
  );
}
