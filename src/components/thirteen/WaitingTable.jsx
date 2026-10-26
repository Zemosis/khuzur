// WAITING TABLE — an online table before the deal (Thirteen's 4 seats or
// Muushig's 5). Seats sit where they will during the match (you at the
// bottom); empty ones are shadow spots the host can fill with CPUs at a
// chosen level, and the host taps a seated CPU's level to change it. The felt
// holds the invite panel and the START button. The game page shows this until
// the server's first game state.
//
// On a phone the other seats share a strip at the top, as at the game table;
// on any small screen the chat slides out from the header and the table
// scrolls if it has to.
//
// A credit match (table.credit) seats only players who staked: empty seats
// are Hard bots nobody can change (Muushig) or stay empty (Thirteen), the
// felt shows the pot, START needs MIN_STAKED players, and after a match those
// who haven't staked again see PLAY AGAIN instead of a seat.

import React, { useCallback, useState } from "react";
import { PixelAvatar } from "../PixelCard";
import PixelIcon from "../PixelIcon";
import LevelTag from "../LevelTag";
import GameChat from "./GameChat";
import { seatAvatar } from "../../utils/avatarConstants";
import { positionOf } from "../../utils/seatPosition";
import { useTableMetrics } from "../../hooks/useTableMetrics";
import { useUnread } from "../../hooks/useUnread";
import { useChatBubbles } from "../../hooks/useChatBubbles";
import ChatBubble from "../ChatBubble";
import { TableHeader, TableSidebar } from "../TableChrome";
import { fmt } from "../../utils/poker/tiers";
import { MIN_STAKED } from "../../utils/stakes";

const SIDE_SEAT_W = 224;
const LEVELS = ["EASY", "MEDIUM", "HARD"];
const LEVEL_COLOR = { EASY: "#9bd14f", MEDIUM: "#f4c430", HARD: "#e85a7a" };
const nextLevel = (level) => LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length];

const shortName = (name = "") => name.split(" #")[0];

/** The avatar a seat shows: a CPU's by seat number, a player's own. */
function seatFace(seat, index) {
  return seat.kind === "cpu" ? { variant: (index % 5) + 1, customAvatarData: null } : seatAvatar(seat, index);
}

// Where each seat's chat bubble opens (see ChatBubble), into space no other
// seat uses: along the top, outward; the side seats', above; yours, to the
// right. In the phone strip they open below, the end seats' lined up with
// their outer edge so nothing runs off screen; yours sits above your seat.
const BUBBLE_AT = {
  top: { side: "right", align: "start" },
  topLeft: { side: "left", align: "start" },
  topRight: { side: "right", align: "start" },
  left: { side: "above", align: "start" },
  bottomLeft: { side: "above", align: "start" },
  right: { side: "above", align: "end" },
  bottomRight: { side: "above", align: "end" },
  bottom: { side: "right", align: "center" },
};
const STRIP_ALIGN = { left: "start", bottomLeft: "start", right: "end", bottomRight: "end" };

function bubbleAt(pos, small) {
  if (pos === "bottom") return small ? { side: "above", align: "center" } : BUBBLE_AT.bottom;
  return small ? { side: "below", align: STRIP_ALIGN[pos] ?? "center" } : BUBBLE_AT[pos];
}

function SeatSlot({ seat, index, isHost, onAddCpu, onRemoveCpu, onSetCpuLevel, face, small = false, bubble = null, bubblePlace, credit = null }) {
  const base = `relative flex flex-col items-center justify-center gap-2 py-3 text-center ${small ? "flex-1 min-w-0 px-1.5" : "px-3"}`;
  const size = small ? { maxWidth: 132, minHeight: 112 } : { width: 184, minHeight: 124 };

  if (!seat && credit?.botsFill) {
    return (
      <div className={base} style={{ ...size, border: "4px dashed #2a234d", backgroundColor: "rgba(20,16,42,0.45)" }}>
        <PixelIcon name="user" size={24} color="#2a234d" />
        <div className="font-pixel-display text-[10px]" style={{ color: LEVEL_COLOR.HARD }}>
          HARD BOT
        </div>
        <div className="font-pixel-body text-[16px] text-bone/50 leading-none">unless a player sits</div>
      </div>
    );
  }

  if (!seat) {
    return (
      <div
        className={base}
        style={{ ...size, border: "4px dashed #2a234d", backgroundColor: "rgba(20,16,42,0.45)" }}
      >
        <PixelIcon name="user" size={24} color="#2a234d" />
        <div className="font-pixel-display text-[10px] text-bone/40">EMPTY SEAT</div>
        {isHost && !credit && (
          <div className="flex flex-wrap justify-center gap-1">
            {LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => onAddCpu(index, level)}
                aria-label={`Add ${level} CPU to seat ${index + 1}`}
                className={`pixel-btn font-pixel-display text-[8px] py-1.5 whitespace-nowrap ${small ? "px-1" : "px-1.5"}`}
                style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: LEVEL_COLOR[level] }}
              >
                {/* A phone seat is too narrow for "+ MEDIUM" on one line. */}
                {small ? level : `+ ${level}`}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const isCpu = seat.kind === "cpu";
  const level = seat.level || "MEDIUM";
  const avatar = face || seatFace(seat, index);
  return (
    <div
      className={base}
      style={{
        ...size,
        backgroundColor: "#14102a",
        border: "4px solid #0a0712",
        boxShadow: "0 0 0 4px #0a0712, inset 0 4px 0 rgba(255,255,255,0.04)",
        opacity: !isCpu && !seat.connected ? 0.55 : 1,
      }}
    >
      {bubble && <ChatBubble name={shortName(seat.name)} lines={bubble} {...bubblePlace} />}
      {seat.isHost && (
        <span
          className="absolute -top-3 left-2 font-pixel-display text-[9px] px-1.5 py-1 flex items-center gap-1"
          style={{ backgroundColor: "#f4c430", color: "#1a1024", boxShadow: "0 0 0 2px #0a0712" }}
        >
          <PixelIcon name="crown" size={9} /> HOST
        </span>
      )}
      {isCpu && isHost && (
        <button
          onClick={() => onRemoveCpu(index)}
          aria-label={`Remove ${seat.name}`}
          className="absolute -top-3 right-2 pixel-hbtn px-1 py-0.5"
          style={{ backgroundColor: "#7a1530", color: "#ead8b1", boxShadow: "0 0 0 2px #0a0712" }}
        >
          <PixelIcon name="close" size={10} />
        </button>
      )}
      <PixelAvatar variant={avatar.variant} customAvatarData={avatar.customAvatarData} size={51} />
      <div className="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
        <span className="font-pixel-display text-[10px] text-parchment truncate">{isCpu ? seat.name : shortName(seat.name)}</span>
        {!isCpu && <LevelTag level={seat.xpLevel} />}
      </div>
      {isCpu &&
        (isHost ? (
          <button
            onClick={() => onSetCpuLevel(index, nextLevel(level))}
            aria-label={`${seat.name}: ${level}. Change level`}
            className="pixel-btn font-pixel-display text-[8px] px-2 py-1 whitespace-nowrap flex items-center gap-1"
            style={{ backgroundColor: "#0a0712", borderColor: "#2a234d", color: LEVEL_COLOR[level] }}
          >
            {level}
            <PixelIcon name="right" size={8} />
          </button>
        ) : (
          <span className="font-pixel-display text-[8px]" style={{ color: LEVEL_COLOR[level] }}>
            {level}
          </span>
        ))}
      {!isCpu && credit && (
        <span className="font-pixel-display text-[8px] text-glow-gold">STAKED {fmt(credit.stake)}</span>
      )}
      {!isCpu && !seat.connected && (
        <div className="font-pixel-body text-[16px] text-rose blink">reconnecting…</div>
      )}
    </div>
  );
}

/** A credit match's pot: what's in, and the rule. */
function PotBanner({ credit }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-2" style={{ backgroundColor: "#2a1f08", boxShadow: "0 0 0 4px #c89820" }}>
      <div className="font-pixel-display text-[16px] text-glow-gold tabular-nums">POT {fmt(credit.pot)}</div>
      <div className="font-pixel-body text-[18px] text-bone leading-none">
        {credit.staked} × {fmt(credit.stake)} · {credit.tier} · winner takes all
      </div>
    </div>
  );
}

function InvitePanel({ table, seatedCount, hostName, onStart, onRestake, errorMessage, fillsEmptySeats }) {
  const [copied, setCopied] = useState(null);
  // One START per press: a double-click would be rejected after the game has
  // already begun. A rejection (e.g. no longer host) re-arms the button.
  const [starting, setStarting] = useState(false);
  const [seenError, setSeenError] = useState(errorMessage);
  if (errorMessage !== seenError) {
    setSeenError(errorMessage);
    if (errorMessage) setStarting(false);
  }
  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };
  const link = `${window.location.origin}/join/${table.code}`;
  // Muushig fills empty seats at START; Thirteen plays with whoever is seated.
  // A credit match needs MIN_STAKED players with stakes in.
  const credit = table.credit;
  const canStart = credit ? credit.staked >= MIN_STAKED : fillsEmptySeats || seatedCount >= 2;
  const [restaking, setRestaking] = useState(false);
  if (errorMessage !== seenError && restaking) setRestaking(false);

  return (
    <div
      className="flex flex-col items-center gap-4 p-4 sm:p-6 text-center"
      style={{ backgroundColor: "rgba(10,7,18,0.8)", border: "4px solid #0a0712", boxShadow: "0 0 0 4px #463a78", maxWidth: 520 }}
    >
      {credit && <PotBanner credit={credit} />}
      <div className="font-pixel-display text-[14px] text-glow-gold">WAITING FOR PLAYERS</div>
      <div className="font-pixel-body text-[22px] text-bone/80">
        {seatedCount}/{table.seats.length} seated
        {credit?.deciding > 0 && <span className="text-bone/60"> · {credit.deciding} deciding</span>}
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="font-pixel-display text-[9px] text-bone/60 flex items-center gap-2">
          <PixelIcon name={table.isPrivate ? "lock" : "globe"} size={10} />
          {table.isPrivate ? "PRIVATE TABLE CODE" : "TABLE CODE"}
        </div>
        <div className="font-pixel-display text-[22px] tracking-[0.3em] text-glow-cyan">{table.code}</div>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={() => copy("code", table.code)}
          className="pixel-btn font-pixel-display text-[10px] px-3 py-2"
          style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}
        >
          COPY CODE
        </button>
        <button
          onClick={() => copy("link", link)}
          className="pixel-btn font-pixel-display text-[10px] px-3 py-2"
          style={{ backgroundColor: "#5fd4d6", borderColor: "#2a8a8c", color: "#0a2a2c" }}
        >
          COPY INVITE LINK
        </button>
      </div>
      <div className="font-pixel-body text-[18px] text-glow-cyan h-5" aria-live="polite">
        {copied === "code" ? "Code copied!" : copied === "link" ? "Invite link copied!" : ""}
      </div>

      {credit && table.mySeat == null ? (
        <>
          <button
            onClick={() => {
              setRestaking(true);
              onRestake();
            }}
            disabled={restaking}
            className="pixel-btn font-pixel-display text-[14px] px-8 py-4 flex items-center gap-3"
            style={{ backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#1a1024" }}
          >
            <PixelIcon name="play" size={14} /> PLAY AGAIN · {fmt(credit.stake)}
          </button>
          <div className="font-pixel-body text-[18px] text-bone/60">Stake {fmt(credit.stake)} to take a seat for the next match, or EXIT.</div>
        </>
      ) : table.isHost ? (
        <>
          <button
            onClick={() => {
              setStarting(true);
              onStart();
            }}
            disabled={starting || !canStart}
            className="pixel-btn font-pixel-display text-[14px] px-8 py-4 flex items-center gap-3"
            style={{ backgroundColor: "#f4c430", borderColor: "#c89820", color: "#1a1024" }}
          >
            <PixelIcon name="play" size={14} /> START GAME
          </button>
          <div className="font-pixel-body text-[18px] text-bone/60">
            {credit
              ? `Needs ${MIN_STAKED} players with stakes in. ${credit.botsFill ? "Empty seats are Hard bots." : "Empty seats stay empty."}`
              : fillsEmptySeats
                ? "Empty seats are filled with MEDIUM CPUs when you start."
                : "Start with 2 to 4 players. Empty seats stay empty."}
          </div>
        </>
      ) : (
        <div className="font-pixel-display text-[10px] text-bone/70 blink">Waiting for {hostName} to start</div>
      )}
      {credit && table.mySeat != null && (
        <div className="font-pixel-body text-[18px] text-bone/60">EXIT before the deal and your {fmt(credit.stake)} comes back.</div>
      )}
    </div>
  );
}

export default function WaitingTable({
  table,
  messages,
  onSendMessage,
  onExit,
  onAddCpu,
  onRemoveCpu,
  onSetCpuLevel,
  onStart,
  onRestake, // PLAY AGAIN at a credit match
  errorMessage,
  myFace,
  fillsEmptySeats = false,
  chatLimit, // { notice, blocked } for the chat box (hooks/useChatLimit)
  title = "THIRTEEN",
  titleClass = "text-glow-gold",
  titleColor,
}) {
  const { compact, narrow } = useTableMetrics();
  const [panelOpen, setPanelOpen] = useState(false);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const unread = useUnread(messages, panelOpen);
  const bubbles = useChatBubbles(messages);
  const five = table.seats.length === 5;
  const at = {};
  table.seats.forEach((seat, i) => {
    at[positionOf(i, table.mySeat, table.seats.length)] = { seat, index: i };
  });
  const slot = (pos, small = false) => (
    <SeatSlot
      seat={at[pos].seat}
      index={at[pos].index}
      isHost={table.isHost}
      onAddCpu={onAddCpu}
      onRemoveCpu={onRemoveCpu}
      onSetCpuLevel={onSetCpuLevel}
      face={at[pos].index === table.mySeat ? myFace : undefined}
      small={small}
      credit={table.credit}
      bubble={
        at[pos].index === table.mySeat
          ? bubbles.mine
          : at[pos].seat?.kind === "human"
            ? bubbles.bubbleFor(at[pos].seat.name)
            : null
      }
      bubblePlace={bubbleAt(pos, small)}
    />
  );
  const seatedCount = table.seats.filter(Boolean).length;
  // Chat shows each sender with their seat's avatar; yours is your own.
  const avatarFor = (msg) => {
    if (msg.isMe) return myFace;
    const index = table.seats.findIndex((s) => s && shortName(s.name) === shortName(msg.sender));
    if (index < 0) return undefined;
    return index === table.mySeat ? myFace : seatFace(table.seats[index], index);
  };
  const hostName = shortName(table.seats.find((s) => s?.isHost)?.name || "the host");
  const invite = (
    <div className="flex flex-col items-center gap-3">
      <InvitePanel
        table={table}
        seatedCount={seatedCount}
        hostName={hostName}
        onStart={onStart}
        onRestake={onRestake}
        errorMessage={errorMessage}
        fillsEmptySeats={fillsEmptySeats}
      />
      {errorMessage && (
        <div role="alert" className="font-pixel-body text-[20px] px-3 py-1" style={{ backgroundColor: "#7a1530", color: "#ead8b1" }}>
          {errorMessage}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative w-full h-full font-pixel-body text-parchment overflow-hidden flex flex-col" style={{ position: "fixed", inset: 0 }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, #2e0f1d 0%, #14102a 60%, #0a0712 100%)" }} />

      <TableHeader
        compact={compact}
        narrow={narrow}
        onExit={onExit}
        badge={
          <div className="font-pixel-display text-[10px] text-bone/60 whitespace-nowrap">
            {table.name.toUpperCase()} <span className="text-glow-cyan">#{table.code}</span>
          </div>
        }
        title={title}
        kicker={null}
        titleClass={titleClass}
        titleColor={titleColor}
        onPanel={() => setPanelOpen(true)}
        unread={unread}
      />

      <div className="relative flex-1 grid min-h-0" style={{ gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1fr) 300px" }}>
        {narrow ? (
          <div className="relative flex flex-col items-center gap-6 min-h-0 overflow-y-auto px-2 pt-5 pb-4">
            {/* The other seats, clockwise from your left. */}
            <div className="flex justify-center gap-2 w-full">
              {(five ? ["bottomLeft", "topLeft", "topRight", "bottomRight"] : ["left", "top", "right"]).map((pos) => (
                <React.Fragment key={pos}>{slot(pos, true)}</React.Fragment>
              ))}
            </div>
            <div className="w-full">{invite}</div>
            {slot("bottom")}
          </div>
        ) : (
          <div className="relative flex flex-col items-center justify-between min-h-0 overflow-y-auto px-4 py-4">
            {five ? (
              <div className="flex justify-center gap-10">
                {slot("topLeft")}
                {slot("topRight")}
              </div>
            ) : (
              slot("top")
            )}
            <div
              className="grid items-center gap-4 w-full mx-auto"
              style={{ gridTemplateColumns: `${SIDE_SEAT_W}px minmax(0,1fr) ${SIDE_SEAT_W}px`, maxWidth: SIDE_SEAT_W * 2 + 820 + 32 }}
            >
              <div className="flex justify-center">{slot(five ? "bottomLeft" : "left")}</div>
              {invite}
              <div className="flex justify-center">{slot(five ? "bottomRight" : "right")}</div>
            </div>
            {slot("bottom")}
          </div>
        )}

        <TableSidebar compact={compact} open={panelOpen} onClose={closePanel}>
          <GameChat messages={messages} onSendMessage={onSendMessage} avatarFor={avatarFor} {...chatLimit} />
        </TableSidebar>
      </div>
    </div>
  );
}
