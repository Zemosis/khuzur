// ACTION BAR — your controls once the cards are out: insurance's YES / NO
// when the dealer shows an Ace, HIT / STAND / DOUBLE / SPLIT on your turn
// (each enabled only when the table says it's legal), and at the end of the
// round what it won or lost you, with the XP and gold it paid. Otherwise a
// status line says what the table is waiting for.

import React from "react";
import Countdown from "../poker/Countdown";
import { PHASES } from "../../utils/blackjack/engine";
import { insuranceCost } from "../../utils/blackjack/rules";
import { clock, fmt, roundNet, short } from "./tableInfo";

const BTN = "pixel-btn font-pixel-display text-[10px] px-3 py-2.5 whitespace-nowrap";
const ACTIONS = [
  ["HIT", "hit", { backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#142a08" }],
  ["STAND", "stand", { backgroundColor: "#f4c430", borderColor: "#c89820", color: "#0a0712" }],
  ["DOUBLE", "double", { backgroundColor: "#5fd4d6", borderColor: "#2a8a8c", color: "#0a2a2c" }],
  ["SPLIT", "split", { backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }],
];

function Timer({ endsAt, children }) {
  if (endsAt == null) return null;
  return (
    <Countdown endsAt={endsAt}>
      {(n) => <span className="font-pixel-display text-[10px] leading-none text-glow-cyan whitespace-nowrap">{children ? `${children} ${clock(n)}` : clock(n)}</span>}
    </Countdown>
  );
}

const Status = ({ children, color = "#ead8b1" }) => (
  <span className="font-pixel-body text-[20px] leading-none" style={{ color }}>
    {children}
  </span>
);

/**
 * view: the blackjack_state view. endsAt: the running clock's end (a
 * Date.now() time), or null. reward: this round's progress_reward, or null.
 * onAction(type), onInsurance(take). status: a line that overrides the
 * usual one (saving, closing). children: extra buttons (END TABLE).
 */
export default function ActionBar({ view, endsAt = null, reward = null, onAction, onInsurance, status = null, children }) {
  const mine = view.seats[view.mySeat] ?? null;
  const inRound = !!mine?.inRound;
  const myTurn = view.phase === PHASES.TURNS && view.turn?.seat === view.mySeat;
  let body;

  if (view.phase === PHASES.INSURANCE && inRound && !mine.answered) {
    body = (
      <>
        <span className="font-pixel-display text-[10px] leading-none text-parchment whitespace-nowrap">{`INSURANCE FOR ${fmt(insuranceCost(mine.bet))}?`}</span>
        <button className={BTN} style={{ backgroundColor: "#f4c430", borderColor: "#c89820", color: "#0a0712" }} onClick={() => onInsurance(true)}>
          YES
        </button>
        <button className={BTN} style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }} onClick={() => onInsurance(false)}>
          NO
        </button>
        <span className="ml-auto flex flex-col items-end gap-1">
          <Timer endsAt={endsAt} />
          <span className="font-pixel-body text-[18px] leading-none text-bone">no answer = no</span>
        </span>
      </>
    );
  } else if (myTurn) {
    body = (
      <>
        {ACTIONS.map(([label, key, tone]) => (
          <button key={label} className={BTN} style={tone} disabled={!view.legal?.[key]} onClick={() => onAction(label)}>
            {label}
          </button>
        ))}
        <span className="ml-auto">
          <Timer endsAt={endsAt}>YOUR TURN</Timer>
        </span>
      </>
    );
  } else if (view.phase === PHASES.ROUND_OVER && inRound) {
    const net = roundNet(mine, view.dealer);
    body = (
      <>
        <span className="font-pixel-display text-[10px] leading-none whitespace-nowrap" style={{ color: net > 0 ? "#9bd14f" : net < 0 ? "#e85a7a" : "#ead8b1" }}>
          {net > 0 ? `YOU WON ${fmt(net)}` : net < 0 ? `YOU LOST ${fmt(-net)}` : "PUSH"}
        </span>
        {reward && <span className="font-pixel-body text-[20px] leading-none text-bone">{`+${reward.xp} XP · +${reward.gold} GOLD`}</span>}
        <span className="ml-auto">{status ? <Status color="#f4c430">{status}</Status> : <Status>Next round soon…</Status>}</span>
      </>
    );
  } else {
    body = (
      <>
        <Status color={status ? "#f4c430" : undefined}>{status ?? waitingLine(view, inRound)}</Status>
        <span className="ml-auto">
          <Timer endsAt={endsAt} />
        </span>
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 min-h-[44px]">
      {body}
      {children}
    </div>
  );
}

/** The status line when you have nothing to do. */
function waitingLine(view, inRound) {
  switch (view.phase) {
    case PHASES.WAITING:
      return "Waiting for players…";
    case PHASES.BETTING:
      return "Bets are going down…";
    case PHASES.DEALING:
      return "Dealing…";
    case PHASES.INSURANCE:
      return "Waiting for insurance answers…";
    case PHASES.TURNS: {
      const who = view.seats[view.turn?.seat];
      return who ? `Waiting for ${short(who.name)}…` : "Waiting…";
    }
    case PHASES.DEALER:
      return "The dealer plays…";
    case PHASES.ROUND_OVER:
      return inRound ? "" : "Next round soon…";
    default:
      return "";
  }
}
