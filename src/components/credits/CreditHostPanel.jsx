// CREDIT HOST PANEL — host a credit table: its name, its stakes (LOW, MID,
// HIGH) and public or private. The buy-in (or stake) panel opens next.
// `tiers` are the buttons: [{ id, label, title }]; poker's blinds by default.

import React, { useState } from "react";
import { Panel, Btn } from "../PixelUI";
import PixelIcon from "../PixelIcon";
import { INK, TONES, inputStyle } from "../pixelTokens";
import { TIERS, TIER_IDS, fmt } from "../../utils/poker/tiers";

const POKER_TIERS = TIER_IDS.map((id) => {
  const t = TIERS[id];
  return { id, label: `${t.smallBlind}/${t.bigBlind}`, title: `Blinds ${t.smallBlind}/${t.bigBlind}, buy in ${fmt(t.minBuyIn)}–${fmt(t.maxBuyIn)}` };
});

export default function CreditHostPanel({ defaultName, tiers = POKER_TIERS, disabled = false, onCreate }) {
  const [name, setName] = useState(defaultName);
  const [tier, setTier] = useState("LOW");
  return (
    <Panel title="Host a credit table" icon="crown" deep="#2a8a8c">
      <div className="flex-1 flex flex-col justify-center gap-2.5 min-h-0" style={{ padding: "var(--pad)" }}>
        <label className="sr-only" htmlFor="credit-table-name">
          Table name
        </label>
        <input
          id="credit-table-name"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder="Table name"
          className="w-full font-pixel-body text-[22px] px-3 text-parchment placeholder:text-mist"
          style={inputStyle}
        />
        <div role="radiogroup" aria-label="Stakes" className="grid grid-cols-3 gap-2">
          {tiers.map(({ id, label, title }) => {
            const on = tier === id;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={on}
                onClick={() => setTier(id)}
                title={title}
                className="pixel-btn flex flex-col items-center justify-center gap-1 py-1.5"
                style={{ backgroundColor: on ? "#5fd4d6" : INK, borderColor: on ? "#2a8a8c" : "#2a234d", color: on ? INK : "#ead8b1" }}
              >
                <span className="font-pixel-display text-[11px]">{id}</span>
                <span className="font-pixel-body text-[18px] leading-none">{label}</span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Btn tone={TONES.cyan} disabled={disabled} onClick={() => onCreate(name, tier, false)} title="Anyone can join from the list">
            <PixelIcon name="globe" size={14} />
            Public
          </Btn>
          <Btn tone={TONES.rose} disabled={disabled} onClick={() => onCreate(name, tier, true)} title="Only people with the code can join">
            <PixelIcon name="lock" size={14} />
            Private
          </Btn>
        </div>
      </div>
    </Panel>
  );
}
