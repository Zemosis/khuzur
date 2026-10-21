// STAKE PANEL — what sitting at a credit match costs: one fixed stake, the
// same for everyone, and what happens to it. When the balance can't cover it
// the reason shows instead, with CLAIM (children) if one is ready. Used to
// host, to join and to PLAY AGAIN. bots: the game fills empty seats with
// CPUs (Muushig); otherwise only people play (Thirteen).

import React from "react";
import Modal from "./Modal";
import { Btn } from "../PixelUI";
import { TONES } from "../pixelTokens";
import { fmt } from "../../utils/poker/tiers";
import { FORFEIT_ROUNDS } from "../../utils/stakes";

export default function StakePanel({ tier, stake, tableName, balance, bots = true, busy = false, error = "", onConfirm, onCancel, children }) {
  const ok = balance >= stake;
  return (
    <Modal title={`Stake · ${tier} ${fmt(stake)}`} icon="spade" deep="#c89820" onClose={busy ? undefined : onCancel}>
      {tableName && <p className="font-pixel-display text-[12px] text-parchment truncate">{tableName}</p>}
      <p className="font-pixel-body text-[22px] text-bone leading-none">
        Balance <span className="text-glow-gold tabular-nums">{fmt(balance)}</span>
      </p>
      <ul className="flex flex-col gap-1.5 font-pixel-body text-[20px] text-bone leading-tight">
        <li>
          Everyone stakes {fmt(stake)}. <span className="text-glow-gold">The winner takes the pot.</span>
        </li>
        <li>{bots ? "Empty seats are Hard bots. If a bot wins, the pot is lost." : "Only people play: empty seats stay empty."}</li>
        <li>
          Leave mid-match and a bot plays for you. Come back within {FORFEIT_ROUNDS} rounds or your stake is lost.
        </li>
      </ul>
      {!ok && (
        <>
          <p role="alert" className="font-pixel-body text-[22px] leading-tight" style={{ color: "#e85a7a" }}>
            Your balance is {fmt(balance)}; this table's stake is {fmt(stake)}.
          </p>
          {children}
        </>
      )}
      {error && (
        <p role="alert" className="font-pixel-body text-[22px] leading-tight" style={{ color: "#e85a7a" }}>
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <Btn tone={TONES.dusk} onClick={onCancel} disabled={busy} style={{ height: 44 }}>
          Cancel
        </Btn>
        <Btn tone={TONES.poison} onClick={() => !busy && ok && onConfirm(stake)} disabled={busy || !ok} style={{ height: 44 }}>
          {busy ? "..." : `Stake ${fmt(stake)}`}
        </Btn>
      </div>
    </Modal>
  );
}
