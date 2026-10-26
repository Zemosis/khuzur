// REWARD PANEL — what a finished online match paid you: the XP and gold
// counting up, your XP bar filling (and starting over at each new level),
// and a LEVEL UP banner with the level's gold. The server sends `reward` in
// the match's last state once it's saved (see rewardViewOf in server/index.js).
// Also the small "+4 XP · +3 GOLD" float a poker hand pays, and its level-up.

import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useCountUp } from "../hooks/useCountUp";
import { reducedMotion } from "../utils/motion";
import { levelProgress } from "../utils/progression";
import { fmt } from "../utils/poker/tiers";
import { INK } from "./pixelTokens";

const GOLD = "#f4c430";
const FILL_DELAY_MS = 350;
const FILL_MS = 1400;

/** Once a reward lands, the lobby bar and profile catch up with it. */
function useRefreshProfile(reward) {
  const { fetchProfile } = useAuth();
  const key = reward ? `${reward.expAfter}:${reward.levelAfter}` : null;
  useEffect(() => {
    if (key) fetchProfile?.().catch(() => {});
    // fetchProfile is a new function each render; the reward is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** The XP bar at `exp` total XP, with its LV badge. */
function XpBar({ exp }) {
  const { level, into, need } = levelProgress(exp);
  return (
    <div className="flex items-center gap-2 w-full">
      <span
        className="font-pixel-display text-[10px] px-1.5 py-1 leading-none shrink-0"
        style={{ backgroundColor: GOLD, color: INK, boxShadow: `0 0 0 2px ${INK}` }}
      >
        LV {level}
      </span>
      <div
        className="flex-1 relative"
        style={{ height: 12, backgroundColor: INK, boxShadow: "0 0 0 2px #2a234d" }}
        role="progressbar"
        aria-label="Experience toward next level"
        aria-valuenow={into}
        aria-valuemin={0}
        aria-valuemax={need}
      >
        <div style={{ width: `${(into / need) * 100}%`, height: "100%", backgroundColor: GOLD, boxShadow: "inset 0 3px 0 rgba(255,255,255,0.35)" }} />
      </div>
      <span className="font-pixel-body text-[20px] text-bone leading-none shrink-0 tabular-nums">
        {into}/{need}
      </span>
    </div>
  );
}

/** LEVEL UP! LV n · +gold. */
function LevelUpBanner({ level, gold }) {
  return (
    <div role="status" className="result-pop flex flex-col items-center gap-1">
      <span className="font-pixel-display text-[14px] text-glow-gold shimmer-text">LEVEL UP!</span>
      <span className="font-pixel-display text-[10px] text-parchment">
        LV {level} · <span className="text-glow-gold">+{fmt(gold)} GOLD</span>
      </span>
    </div>
  );
}

/**
 * The end-of-match block. `reward`: undefined while the match is being
 * saved, null when it paid you nothing (you left before the end),
 * { unpaid: "cpus" } when no other person played it to the end, else the
 * server's reward. A guest is asked to sign in instead.
 */
export default function RewardPanel({ reward }) {
  const { isGuest } = useAuth();
  if (isGuest) {
    return <p className="font-pixel-display text-[9px] text-bone/70 text-center leading-relaxed">SIGN IN TO EARN XP AND GOLD</p>;
  }
  if (reward === undefined) {
    return (
      <p role="status" className="font-pixel-display text-[9px] text-bone/70 text-center blink">
        ADDING UP YOUR REWARDS...
      </p>
    );
  }
  if (!reward) return null;
  if (reward.unpaid) {
    return (
      <p className="font-pixel-display text-[9px] text-bone/70 text-center leading-relaxed">
        NO XP OR GOLD: ONLY CPUS PLAYED TO THE END. PLAY WITH PEOPLE TO EARN.
      </p>
    );
  }
  return <Earned key={`${reward.expBefore}:${reward.expAfter}`} reward={reward} />;
}

function Earned({ reward }) {
  useRefreshProfile(reward);
  // The bar rolls from where you were to where the match took you.
  const [target, setTarget] = useState(() => (reducedMotion() ? reward.expAfter : reward.expBefore));
  useEffect(() => {
    const id = setTimeout(() => setTarget(reward.expAfter), FILL_DELAY_MS);
    return () => clearTimeout(id);
  }, [reward.expAfter]);
  const { shown } = useCountUp(target, FILL_MS);

  const done = reward.xp ? (shown - reward.expBefore) / reward.xp : 1;
  const levelNow = levelProgress(shown).level;

  return (
    <div className="w-full flex flex-col items-center gap-3" aria-label="What this match paid you">
      <div className="flex items-baseline justify-center gap-6">
        <span className="font-pixel-display text-[12px] text-glow-cyan tabular-nums">+{Math.round(reward.xp * done)} XP</span>
        <span className="font-pixel-display text-[12px] text-glow-gold tabular-nums">+{fmt(Math.round(reward.gold * done))} GOLD</span>
      </div>
      <XpBar exp={shown} />
      {levelNow > reward.levelBefore && <LevelUpBanner level={levelNow} gold={reward.levelUpGold} />}
    </div>
  );
}

/**
 * A poker hand's pay: a "+4 XP · +3 GOLD" that floats up and fades, and on a
 * level-up the banner for a few seconds. `reward` is the latest
 * progress_reward; `onDone` clears it.
 */
export function HandReward({ reward, onDone }) {
  useRefreshProfile(reward);
  const leveled = !!reward && reward.levelAfter > reward.levelBefore;
  useEffect(() => {
    if (!reward) return;
    const id = setTimeout(onDone, leveled ? 4000 : 1600);
    return () => clearTimeout(id);
  }, [reward, leveled, onDone]);
  if (!reward) return null;
  return (
    <div className="pointer-events-none flex flex-col items-center gap-2 whitespace-nowrap">
      <span className="reward-float font-pixel-display text-[10px] px-2 py-1" style={{ backgroundColor: INK, boxShadow: "0 0 0 2px #2a234d" }}>
        <span className="text-glow-cyan">+{reward.xp} XP</span> · <span className="text-glow-gold">+{reward.gold} GOLD</span>
      </span>
      {leveled && (
        <div className="px-4 py-3" style={{ backgroundColor: "#1f1a3d", boxShadow: `0 0 0 4px ${INK}, 0 0 0 7px #463a78` }}>
          <LevelUpBanner level={reward.levelAfter} gold={reward.levelUpGold} />
        </div>
      )}
    </div>
  );
}
