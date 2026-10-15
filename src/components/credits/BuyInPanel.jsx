// BUY-IN PANEL — how many credits to bring to a credit table: a slider and an
// exact amount between the table's minimum and maximum. It says why when the
// minimum is raised (you left a table at this tier within the hour) or when
// you can't afford it. Used to sit down, to ADD CHIPS and to REBUY.

import React, { useState } from "react";
import Modal from "./Modal";
import { Btn } from "../PixelUI";
import { TONES, inputStyle } from "../pixelTokens";
import { TIERS, fmt } from "../../utils/poker/tiers";

const TITLES = { sit: "Buy in", add: "Add chips", rebuy: "Rebuy" };
const VERBS = { sit: "Sit with", add: "Add", rebuy: "Rebuy" };
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * range: { min, max, ok } from buyInRange / topUpRange. rathole: { amount,
 * until } when leaving a table at this tier within the hour raised the
 * minimum. busy: sent, waiting on the server (nothing more is sent). error:
 * the server's refusal. children show when the range can't be met (CLAIM).
 */
export default function BuyInPanel({ tier, tableName, mode = "sit", balance, range, rathole = null, busy = false, error = "", onConfirm, onCancel, children }) {
  const t = TIERS[tier];
  const [amount, setAmount] = useState(range.min);
  const clamp = (n) => Math.max(range.min, Math.min(range.max, Math.round(Number(n) || 0)));
  const value = clamp(amount);
  const fill = Math.round(((value - range.min) / Math.max(1, range.max - range.min)) * 100);
  const confirm = () => !busy && range.ok && onConfirm(value);

  return (
    <Modal title={`${TITLES[mode]} · ${tier} ${t.smallBlind}/${t.bigBlind}`} icon="spade" deep="#c89820" onClose={busy ? undefined : onCancel}>
      {tableName && <p className="font-pixel-display text-[12px] text-parchment truncate">{tableName}</p>}
      <p className="font-pixel-body text-[22px] text-bone leading-none">
        Balance <span className="text-glow-gold tabular-nums">{fmt(balance)}</span>
        {mode === "sit" && (
          <span className="text-bone/70">
            {" "}
            · table {fmt(t.minBuyIn)}–{fmt(t.maxBuyIn)}
          </span>
        )}
      </p>
      {rathole && range.min > t.minBuyIn && (
        <p role="note" className="font-pixel-body text-[20px] leading-tight" style={{ color: "#f4c430" }}>
          You left a {tier} table with {fmt(rathole.amount)}. Minimum is {fmt(range.min)} until {clock(rathole.until)}.
        </p>
      )}
      {range.ok ? (
        <>
          <div className="flex items-center gap-2">
            <Btn tone={TONES.dusk} onClick={() => setAmount(range.min)} className="px-3" style={{ height: 40 }}>
              Min
            </Btn>
            <input
              type="range"
              aria-label="Buy-in slider"
              min={range.min}
              max={range.max}
              value={value}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="pixel-range flex-1 min-w-0"
              style={{ "--fill": `${fill}%` }}
            />
            <Btn tone={TONES.dusk} onClick={() => setAmount(range.max)} className="px-3" style={{ height: 40 }}>
              Max
            </Btn>
          </div>
          <input
            type="number"
            aria-label="Credits to bring"
            min={range.min}
            max={range.max}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => setAmount(value)}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
            className="font-pixel-body text-[24px] px-3 text-parchment w-full"
            style={inputStyle}
          />
        </>
      ) : (
        <p role="alert" className="font-pixel-body text-[22px] leading-tight" style={{ color: "#e85a7a" }}>
          {balance < range.min
            ? `Your balance is ${fmt(balance)}; ${mode === "sit" ? "this table's minimum" : "the minimum"} is ${fmt(range.min)}.`
            : "You already have the most this table allows."}
        </p>
      )}
      {!range.ok && children}
      {error && (
        <p role="alert" className="font-pixel-body text-[22px] leading-tight" style={{ color: "#e85a7a" }}>
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <Btn tone={TONES.dusk} onClick={onCancel} disabled={busy} style={{ height: 44 }}>
          Cancel
        </Btn>
        <Btn tone={TONES.poison} onClick={confirm} disabled={busy || !range.ok} style={{ height: 44 }}>
          {busy ? "..." : `${VERBS[mode]} ${fmt(value)}`}
        </Btn>
      </div>
    </Modal>
  );
}
