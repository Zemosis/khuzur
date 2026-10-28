// BLACKJACK SEAT — one of the five places round the half-moon, drawn around
// its betting circle (the table positions the circle's centre): the circle
// holds the bet as a chip stack (once a round is won, the bet and its
// winnings together), and the seat's hands sit above it (side by side after a split, the
// hand being played outlined in gold under a bobbing arrow). Once a round is
// settled each hand's total gives way to its result.
//
// The player's plate (SeatPlate) sits apart, on the table's rim: avatar,
// name, bankroll, in the betting window READY / BETTING / SITTING OUT, and
// the callouts of what they just did. An empty seat's plate is dashed, with
// SIT.
//
// Cards and chips carry the data-bj-* marks cardMotion.js moves them by.

import React from "react";
import { PixelAvatar, PixelCard } from "../PixelCard";
import ChipStack from "../poker/ChipStack";
import LevelTag from "../LevelTag";
import Callout from "../Callout";
import PixelIcon from "../PixelIcon";
import { PHASES } from "../../utils/blackjack/engine";
import { MIN_BET } from "../../utils/blackjack/rules";
import { SEAT_SIZE, fmt, resultTag, roundNet, short, totalTag } from "./tableInfo";

function Tag({ label, bg, fg = "#0a0712", ...rest }) {
  return (
    <span
      className="font-pixel-display text-[9px] leading-none px-1.5 py-1 whitespace-nowrap"
      style={{ backgroundColor: bg, color: fg, boxShadow: "0 0 0 2px #0a0712" }}
      {...rest}
    >
      {label}
    </span>
  );
}

/**
 * A card where it lies on the table: the slot holds its place, the card
 * inside it is what moves. deal: its place in the deal's order (only the
 * first two cards of each hand). owner: its hand (data-bj-tag of the total).
 */
export function TableCard({ card, width, deal = null, owner, style, ...rest }) {
  return (
    <div data-bj-card={card?.id ?? "hole"} data-bj-deal={deal ?? undefined} data-bj-owner={owner} style={style} {...rest}>
      <div data-bj-move>{card ? <PixelCard rank={card.rank} suit={card.suit} width={width} /> : <PixelCard faceDown width={width} />}</div>
    </div>
  );
}

/**
 * Where a seat's hands sit over its circle: centred, except split hands at
 * the table's edges, which grow inward so a phone doesn't cut them off.
 */
function handsAnchor(edge, count) {
  if (count > 1 && edge === "right") return { right: 0 };
  if (count > 1 && edge === "left") return { left: 0 };
  return { left: "50%", transform: "translateX(-50%)" };
}

/** READY / BETTING / SITTING OUT while betting; SITTING OUT (or LEFT) during a round it isn't in. */
function statusOf(player, phase) {
  if (player.leaving) return { label: "LEFT", bg: "#2a234d", fg: "#c8b890" };
  if (phase === PHASES.BETTING) {
    if (player.ready) return { label: "READY", bg: "#9bd14f" };
    if (player.bet > 0 || (player.skipped === 0 && player.bankroll >= MIN_BET)) return { label: "BETTING", bg: "#2a234d", fg: "#c8b890" };
    return { label: "SITTING OUT", bg: "#2a234d", fg: "#c8b890" };
  }
  if (phase !== PHASES.WAITING && !player.inRound) return { label: "SITTING OUT", bg: "#2a234d", fg: "#c8b890" };
  return null;
}

function Hand({ hand, owner, cardW, current, settled, showBet, dealAt }) {
  const tag = settled && hand.result ? resultTag(hand) : totalTag(hand);
  const step = Math.round(cardW * 0.5);
  return (
    <div className="relative flex flex-col items-center gap-1.5">
      {current && (
        <span data-bj-wait className="absolute inset-x-0 bottom-full mb-1 pointer-events-none" style={{ height: 18 }}>
          <span data-testid="turn-arrow" className="turn-arrow absolute left-1/2 top-0" style={{ color: "#f4c430", filter: "drop-shadow(2px 2px 0 #0a0712)" }}>
            <PixelIcon name="down" size={18} />
          </span>
        </span>
      )}
      <span data-bj-tag={owner}>
        <Tag label={tag.label} bg={tag.bg} fg={tag.fg} data-result={settled && hand.result ? hand.result : undefined} />
      </span>
      <div className="relative flex items-end" style={{ padding: 3 }}>
        {current && <div data-bj-wait className="absolute inset-0 pointer-events-none" style={{ boxShadow: "0 0 0 3px #f4c430, 0 0 12px rgba(244,196,48,0.5)" }} />}
        {hand.cards.map((c, i) => (
          <TableCard
            key={c.id ?? i}
            card={c}
            width={cardW}
            owner={owner}
            deal={dealAt && i < 2 ? dealAt(i) : null}
            style={{ marginLeft: i ? step - cardW : 0, marginBottom: i * 5 }}
          />
        ))}
      </div>
      {showBet && <span className="font-pixel-body text-[18px] leading-none text-glow-gold tabular-nums">{fmt(hand.bet)}</span>}
    </div>
  );
}

/**
 * seat: 0–4. player: the view's seat (null: empty). isMe: your seat.
 * turnHand: the hand being played here, or null. dealer: the view's dealer
 * (for what a settled round paid). dealAt(i): the place of the hand's i-th
 * card in the deal's order. edge: "left" | "right" for a seat at the
 * table's edge, else null.
 */
export default function BlackjackSeat({ seat, player, isMe = false, turnHand = null, phase, dealer = null, dealAt = null, layout = "full", edge = null }) {
  const size = SEAT_SIZE[layout] ?? SEAT_SIZE.full;
  const compact = layout === "compact";
  const playing = !!player?.inRound && player.hands.length > 0;
  const bet = playing ? player.hands.reduce((sum, h) => sum + h.bet, 0) : (player?.bet ?? 0);
  const active = turnHand != null || (isMe && phase === PHASES.BETTING);
  const settled = phase === PHASES.ROUND_OVER;
  const won = settled && playing && dealer ? roundNet(player, dealer) : 0;
  const split = playing && player.hands.length > 1;

  return (
    <div className="relative" style={{ width: size.circle, height: size.circle }}>
      {/* The betting circle, printed on the felt. */}
      <div
        className="absolute inset-0"
        style={{
          borderRadius: "50%",
          border: active ? "3px solid #f4c430" : "3px dashed rgba(234,216,177,0.35)",
          boxShadow: active ? "0 0 14px rgba(244,196,48,0.5)" : "none",
        }}
      />
      {bet > 0 && (
        <div data-bj-chips={seat} data-bj-amount={bet + won} className="absolute inset-0 flex items-center justify-center">
          <ChipStack amount={bet + won} chipSize={size.chip} />
        </div>
      )}
      {/* The winnings on their way from the dealer: shown only as they fly (cardMotion.js). */}
      {won > 0 && (
        <div data-bj-win={seat} aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ visibility: "hidden" }}>
          <ChipStack amount={won} chipSize={size.chip} testId="win" />
        </div>
      )}

      {playing && (
        <div
          className="absolute flex items-end gap-2 z-[5]"
          style={{ bottom: "100%", marginBottom: compact ? 4 : 8, ...handsAnchor(edge, player.hands.length) }}
          aria-label={`${isMe ? "Your" : `${short(player.name)}'s`} cards`}
        >
          {player.hands.map((hand, i) => (
            <Hand
              key={i}
              hand={hand}
              owner={`s${seat}h${i}`}
              cardW={split ? size.splitCard : size.card}
              current={turnHand === i}
              settled={settled}
              showBet={split}
              dealAt={!split ? dealAt : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The plate on the rim. player: the view's seat (null: empty, with SIT).
 * face: PixelAvatar props. callout: { id, label, bg, fg, delay } to pop over
 * it, or null; onCalloutDone(id) once it's gone. canSit / onSit: SIT on an
 * empty seat (active only when canSit).
 */
export function SeatPlate({ seat, player, face, isMe = false, onTurn = false, phase, layout = "full", edge = null, xpLevel = null, canSit = false, onSit, callout = null, onCalloutDone }) {
  const size = SEAT_SIZE[layout] ?? SEAT_SIZE.full;
  const compact = layout === "compact";
  if (!player)
    return (
      <div className="flex items-center justify-center" style={{ width: size.plate, height: compact ? 40 : 66, border: "3px dashed #463a78", backgroundColor: "rgba(20,16,42,0.6)" }}>
        <button
          onClick={() => onSit?.(seat)}
          disabled={!canSit}
          className="pixel-btn font-pixel-display text-[10px] px-2 py-1"
          style={{ backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#142a08" }}
        >
          SIT
        </button>
      </div>
    );
  return (
    <div className="relative">
      {callout && <Callout key={callout.id} label={callout.label} bg={callout.bg} fg={callout.fg} delay={callout.delay} onDone={() => onCalloutDone?.(callout.id)} />}
      <Plate player={player} face={face} isMe={isMe} onTurn={onTurn} status={statusOf(player, phase)} size={size} compact={compact} edge={edge} xpLevel={xpLevel} />
    </div>
  );
}

// A status tag wider than a phone's plate grows inward at the table's edges.
const TAG_ALIGN = { left: "justify-start", right: "justify-end" };

function Plate({ player, face, isMe, onTurn, status, size, compact, edge, xpLevel }) {
  return (
    <div
      className={`relative flex items-center ${compact ? "flex-col gap-1 px-1 pt-2.5 pb-1.5" : "gap-2 p-2 pt-2.5"}`}
      style={{
        width: size.plate,
        backgroundColor: "#1f1a3d",
        border: `3px solid ${onTurn ? "#5fd4d6" : isMe ? "#f4c430" : "#2a234d"}`,
        boxShadow: "3px 3px 0 #0a0712",
        opacity: player.leaving || status?.label === "SITTING OUT" ? 0.6 : 1,
      }}
    >
      {status && (
        <span className={`absolute -top-3 inset-x-0 flex pointer-events-none whitespace-nowrap ${(compact && TAG_ALIGN[edge]) || "justify-center"}`}>
          <Tag {...status} />
        </span>
      )}
      <PixelAvatar variant={face?.variant} customAvatarData={face?.customAvatarData} size={size.face} />
      <div className={`min-w-0 ${compact ? "w-full text-center" : "flex-1"}`}>
        <div className={`flex items-center gap-1 min-w-0 ${compact ? "justify-center" : ""}`}>
          <span className={`font-pixel-display truncate ${compact ? "text-[10px]" : "text-[12px]"}`} style={{ color: isMe ? "#f4c430" : "#ead8b1" }} title={short(player.name)}>
            {short(player.name)}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 mt-1 ${compact ? "justify-center" : ""}`}>
          <span className={`font-pixel-body leading-none text-bone tabular-nums ${compact ? "text-[18px]" : "text-[22px]"}`}>{fmt(player.bankroll)}</span>
          {!compact && <LevelTag level={xpLevel} />}
        </div>
      </div>
    </div>
  );
}
