// BALANCE PANEL — the CREDITS tab's account panel: your balance (and what's at
// a table), CLAIM, why you can't play if you can't, the leaderboard, and a
// note when a restart sent your table credits home.

import React from "react";
import { useNavigate } from "react-router-dom";
import { Panel, Btn, HeaderBtn } from "../PixelUI";
import PixelIcon from "../PixelIcon";
import { TONES } from "../pixelTokens";
import ClaimButton from "./ClaimButton";
import RestartNotice from "./RestartNotice";
import { fmt } from "../../utils/poker/tiers";

export default function BalancePanel({ credits, isGuest, error, onSignIn, onClaim, claiming, onDismissNotice }) {
  const navigate = useNavigate();
  return (
    <Panel
      title="Credits"
      icon="spade"
      deep="#c89820"
      right={
        <HeaderBtn onClick={() => navigate("/leaderboard")} bg="#f4c430">
          <PixelIcon name="star" size={12} />
          Leaderboard
        </HeaderBtn>
      }
    >
      <div className="flex-1 flex flex-col justify-center gap-2.5 min-h-0" style={{ padding: "var(--pad)" }}>
        {isGuest ? (
          <>
            <p className="font-pixel-body text-[22px] text-bone leading-tight">Sign in to play for credits.</p>
            <Btn tone={TONES.poison} onClick={onSignIn} className="w-full">
              Sign in
            </Btn>
          </>
        ) : !credits ? (
          <p className="font-pixel-body text-[22px] text-bone">{error ? `Couldn't load your credits: ${error}` : "Loading your credits..."}</p>
        ) : (
          <>
            <RestartNotice notice={credits.notice} onDismiss={onDismissNotice} />
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-pixel-display text-[18px] text-glow-gold tabular-nums">{fmt(credits.balance)}</span>
              <span className="font-pixel-body text-[20px] text-bone truncate">
                credits{credits.seat ? ` + ${fmt(credits.onTable)} at ${credits.seat.tableName}` : ""}
              </span>
            </div>
            {credits.canPlay ? (
              // Keyed by the claim, so its countdown restarts from now whenever the claim changes.
              <ClaimButton key={credits.claim.nextAt ?? credits.claim.state} claim={credits.claim} onClaim={onClaim} busy={claiming} />
            ) : (
              <p className="font-pixel-body text-[20px] leading-tight" style={{ color: "#e85a7a" }}>
                {credits.whyNot}
              </p>
            )}
            {error && (
              <p role="alert" className="font-pixel-body text-[20px]" style={{ color: "#e85a7a" }}>
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
