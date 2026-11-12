// GAME KHUZUR — a Khuzur table, practice or online.
//
// The rules live in utils/khuzur/ and the CPU in utils/khuzur/ai.js.
// Practice (no lobby, or a SOLO- one) runs in the browser: you in seat 0
// against CPUs at the level picked. Online, the server runs the game
// (server/game/khuzurGame.js) and sends each player their redacted view;
// the waiting table comes first, where you pick your seat and so your team.
// Both draw the same table (KhuzurPlay): you at the bottom, the rest
// clockwise from your left.
//
// A refused move shows its reason and nothing changes. Practice CPUs move one
// at a time, about two seconds apart, so you can follow the stack: the cards
// they play slide in and glow, a callout names the move over their seat, and
// the bar under your hand says what was just played.
//
// Beating: click a card and it's placed on a top card it beats (one that
// leaves the rest coverable), or drag it onto the very card you mean. Click
// a placed card to take it back; BEAT plays them once every card is covered.
// Online, the other players see a face-down card on each covered card.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { socket, connectSocket } from "../../utils/socket";
import { useChatLimit } from "../../hooks/useChatLimit";
import { useSoloMatchReport } from "../../hooks/useSoloMatchReport";
import { useHandOrder } from "../../hooks/useHandOrder";
import { useChatBubbles } from "../../hooks/useChatBubbles";
import { useTurnTitle } from "../../hooks/useTurnTitle";
import { useUnread } from "../../hooks/useUnread";
import { khuzurSoloReport } from "../../utils/soloReport";
import WaitingTable from "../../components/thirteen/WaitingTable";
import TableBuilder from "../../components/khuzur/TableBuilder";
import GameChat from "../../components/thirteen/GameChat";
import RewardPanel from "../../components/RewardPanel";
import TurnBanner from "../../components/TurnBanner";
import YourTurnMark from "../../components/YourTurnMark";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useTableMetrics, useViewport } from "../../hooks/useTableMetrics";
import { ConnectionSignal, TableHeader, TableSidebar } from "../../components/TableChrome";
import SettingsModal from "../../components/SettingsModal";
import DealDraw from "../../components/muushig/DealDraw";
import DealAnimation from "../../components/thirteen/DealAnimation";
import CardFlights from "../../components/khuzur/CardFlights";
import TrumpReveal, { TRUMP_REVEAL_MS } from "../../components/khuzur/TrumpReveal";
import Callout from "../../components/Callout";
import { KHUZUR_GEOMETRY, KHUZUR_SEAT_NAMES } from "../../components/khuzur/khuzurGeometry";
import { turnAt } from "../../components/muushig/stadiumGeometry";
import Suit from "../../components/muushig/Suit";
import KhuzurTable from "../../components/khuzur/KhuzurTable";
import KhuzurSeat from "../../components/khuzur/KhuzurSeat";
import KhuzurHand from "../../components/khuzur/KhuzurHand";
import KhuzurControls from "../../components/khuzur/KhuzurControls";
import KhuzurScoreBoard from "../../components/khuzur/KhuzurScoreBoard";
import Standings from "../../components/khuzur/Standings";
import KhuzurRules from "../../components/khuzur/KhuzurRules";
import { FFA_COLOR, TEAM_COLORS, TEAM_NAMES, decksOf, ordinal, seatColor, shapeOf, teammates } from "../../components/khuzur/teams";
import { INK } from "../../components/pixelTokens";
import PixelIcon from "../../components/PixelIcon";
import { BOT_NAMES } from "../../utils/constants";
import { positionOf, seatPositions } from "../../utils/seatPosition";
import { reducedMotion } from "../../utils/motion";
import { soundManager } from "../../utils/SoundManager";
import { LEAD_SIZES, beats, cardPower, coverWith, isJoker, isValidLead } from "../../utils/khuzur/cards";
import {
  PHASES,
  canSwapSeven,
  concede,
  createMatch,
  isValidTable,
  leadLimit,
  maxDrawDepth,
  pickUp,
  seatCount,
  standings,
  startNextMatch,
  topLayer,
} from "../../utils/khuzur/engine";
import { aiAction, applyAction, cheapestLead } from "../../utils/khuzur/ai";
import { useServerStats } from "../../hooks/useServerStats";

const DEFAULT_TABLE = { perTeam: 2, teams: 2, handSize: 5 };
const CPU_VARIANTS = [2, 3, 4, 5, 6];
const CPU_DELAY = 1900; // long enough to see what each CPU played
const CPU_DELAY_REDUCED = 1200;
const CPU_DELAY_OUT = 1000; // once you're out, the CPUs play the rest out a little quicker
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const short = (name = "") => name.split(" #")[0];
/** The builder's value for a table the server sent. */
const buildOf = (t) => ({ ...t, soloCount: t.perTeam === 1 ? t.teams : 4, teamCount: t.perTeam === 2 ? t.teams : 2 });
// Where each seat's chat bubble opens (see ChatBubble), into space no other seat uses.
const BUBBLE_AT = {
  bottomLeft: { side: "above", align: "start" },
  left: { side: "above", align: "start" },
  topLeft: { side: "left", align: "start" },
  top: { side: "right", align: "start" },
  topRight: { side: "right", align: "start" },
  right: { side: "above", align: "end" },
  bottomRight: { side: "above", align: "end" },
};
const DENSE_H = 640; // under this tall, the controls bar trims itself
const MIN_DEAL_MS = 2500; // online, the least a deal you watched the draw for takes to show
const HOLD_MS = 1000; // a beaten stack stays on the table this long, the last beat on top, before it's swept away
const CLEAR_PAUSE = HOLD_MS + 600; // a CPU's extra wait after a stack is beaten: the hold, then the sweep and the draws
const validTable = (t) => (t && isValidTable(t) && [5, 7].includes(t.handSize) ? t : null);

/** A practice move from `seat`: the engine's, with SURRENDER as concede. */
function practiceMove(state, seat, move) {
  if (move.type === "surrender") return concede(state, seat);
  if (move.type === "keepPlaying") return state;
  return applyAction(state, { ...move, seat });
}

/** A CPU's move, or the plainest legal one if the CPU fails: a CPU never stalls the table. */
function cpuMove(state) {
  try {
    return applyAction(state, aiAction(state));
  } catch (err) {
    console.error("[khuzur] CPU move failed:", err);
    const seat = state.turn;
    if (state.phase !== PHASES.PLAY) return applyAction(state, { type: "drawForDeal", seat, depth: 1 });
    if (state.stack) return pickUp(state, seat);
    return applyAction(state, { type: "lead", seat, cardIds: cheapestLead(state.players[seat].hand, 1, state.trumpSuit).map((c) => c.id) });
  }
}

/** The last move beat the whole stack: it's held a moment, then swept to the dead pile (see useCardFlights). */
const justCleared = (game) => {
  const events = game.events ?? [];
  return events.findLastIndex((e) => e.type === "dead") > events.findLastIndex((e) => e.type === "lead");
};

/** This match's cards have been dealt (every match deals, after the draw for the deal if it has one). */
const hasDeal = (game) => (game.events ?? []).some((e) => e.type === "deal");

/** This match opened with the draw for the deal (the first at a table does). */
const drewForDeal = (game) => game.phase === PHASES.DRAW || (game.events ?? []).some((e) => e.type === "firstDealer");

/**
 * The turn clock, in the header right of the title: whose turn it is and the
 * time they have left, m:ss, ticking; rose for the last 10 seconds. Online
 * only, while a person is on turn (a CPU takes no clock).
 */
function TurnClock({ deadline, who, mine, compact }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const low = left <= 10;
  const time = (
    <span data-testid="turn-clock" className={`font-pixel-display leading-none tabular-nums ${compact ? "text-[10px]" : "text-sm"} ${low ? "blink" : ""}`} style={{ color: low ? "#e85a7a" : mine ? "#f4c430" : "#ead8b1" }}>
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </span>
  );
  const box = { backgroundColor: low ? "#2a0e18" : "#0a0712", border: `3px solid ${low ? "#7a1530" : mine ? "#c89820" : "#1f1a3d"}` };
  if (compact) {
    return (
      <span className="flex items-center gap-1.5 px-1.5 py-1 shrink-0" style={box} title={`${who}: ${left} seconds left`}>
        <PixelIcon name="clock" size={10} />
        {time}
      </span>
    );
  }
  return (
    <div className="flex flex-col items-center px-3 py-1 min-w-[84px]" style={box} title={`${who}: ${left} seconds left`}>
      <div className="font-pixel-display text-[8px] tracking-wider max-w-[120px] truncate" style={{ color: mine ? "#f4c430" : "rgba(234,216,177,0.6)" }}>
        {mine ? "YOUR TURN" : who.toUpperCase()}
      </div>
      {time}
    </div>
  );
}

/** Why the picked cards aren't a lead you may make, or null. */
function leadReason(cards, limit) {
  if (!cards.length) return `Pick cards to lead, at most ${limit}`;
  if (cards.length > limit) return `At most ${plural(limit, "card")}`;
  if (!LEAD_SIZES.includes(cards.length)) return "Lead 1, 3, 5 or 7 cards";
  if (!isValidLead(cards)) return "Every card needs a pair, except one";
  return null;
}

/** Why the placed cards can't be played yet, or null. placed: per top card, a card or null. */
function beatReason(placed) {
  const done = placed.filter(Boolean).length;
  if (done === placed.length) return null;
  if (placed.length === 1) return "Click a card that beats it, or drag it on";
  return done ? `${done} of ${placed.length} covered: click or drag a card onto each` : `Cover all ${placed.length}: click a card, or drag it onto the card it beats`;
}

/** Why `card` can't beat `target`, for the bar. */
const cantBeat = (card, target, trumpSuit) =>
  isJoker(target)
    ? `${cardText(card)} can't beat ${cardText(target)}`
    : `${cardText(card)} can't beat ${cardText(target)}: a higher ${target.suit === trumpSuit ? "trump" : `${target.suit} or a trump`} does`;

/**
 * Where a clicked card goes: on an uncovered top card it beats, keeping the
 * rest coverable by the cards still in hand if it can, the card with the
 * fewest other answers first, then the strongest. null if it beats none.
 */
function autoColumn(card, top, placed, rest, trumpSuit) {
  const open = top.map((_, col) => col).filter((col) => !placed[col] && beats(card, top[col], trumpSuit));
  if (!open.length) return null;
  const others = (col) => rest.filter((c) => beats(c, top[col], trumpSuit)).length;
  const keepsCover = (col) => {
    const left = top.filter((_, i) => i !== col && !placed[i]);
    return !left.length || !!coverWith(left, rest, trumpSuit);
  };
  const ranked = [...open].sort((a, b) => others(a) - others(b) || cardPower(top[b], trumpSuit) - cardPower(top[a], trumpSuit));
  return ranked.find(keepsCover) ?? ranked[0];
}

const SUIT_ORDER = ["♠", "♥", "♣", "♦"];

/** Your hand in order: by power (RANK), or by suit with the trumps and jokers last (SUIT). */
function sortedHand(hand, trumpSuit, mode) {
  const power = (c) => cardPower(c, trumpSuit);
  if (mode !== "suit") return [...hand].sort((a, b) => power(a) - power(b));
  const group = (c) => (c.joker ? 9 : c.suit === trumpSuit ? 8 : SUIT_ORDER.indexOf(c.suit));
  return [...hand].sort((a, b) => group(a) - group(b) || power(a) - power(b));
}

const LEVEL_COLOR = { EASY: "#9bd14f", MEDIUM: "#f4c430", HARD: "#e85a7a" };
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const nth = (n) => ordinal(n).toLowerCase();
const cardText = (c) => (c.joker ? (c.joker === "gray" ? "the gray joker" : "the colored joker") : `${c.rank}${c.suit}`);

const cardsText = (cards) => cards.map(cardText).join(" ");

/** The last move played, in words for the bar ("Bot Mars led J♠ J♦ 9♣."), or null. */
function lastMoveText(game, mySeat) {
  const events = game.events ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const who = e.seat === mySeat ? "You" : short(game.players[e.seat]?.name);
    if (e.type === "lead") return `${who} led ${cardsText(e.cards)}.`;
    if (e.type === "beat") {
      const dead = events.slice(i + 1).some((x) => x.type === "dead");
      return `${who} beat with ${cardsText(e.cards)}${dead ? ": the stack went all the way round" : ""}.`;
    }
    if (e.type === "pickUp") return `${who} picked up ${plural(e.count, "card")}.`;
    if (e.type === "skip") return `${who} ran out of time.`;
    if (e.type === "deal" || e.type === "newMatch") return null;
  }
  return null;
}

/** One engine event → move-log entries (see GameChat's LogLine), or null. */
function logEntry(e, game) {
  const name = (seat) => short(game.players[seat]?.name);
  const at = (fields) => ({ playerIndex: e.seat, name: name(e.seat), ...fields });
  switch (e.type) {
    case "drawStart":
      return { text: `${name(e.seat)} draws first for the deal.` };
    case "dealDraw":
      return at({ kind: "pass", verb: `drew the ${nth(e.depth)} card: ${cardText(e.card)}` });
    case "drawTie":
      return { text: "A tie for the highest card: they draw again." };
    case "firstDealer":
      return { text: `${name(e.seat)} drew the highest card: ${cardText(e.card)}.` };
    case "deal":
      return [{ kind: "round", label: `MATCH ${game.matchNumber}` }, { text: `${name(e.dealer)} deals.${e.trumpCard ? ` Trump: ${cardText(e.trumpCard)}.` : ""}` }];
    case "lead":
      return at({ kind: "action", action: "lead", cards: e.cards });
    case "beat":
      return at({ kind: "action", action: "beat", cards: e.cards });
    case "pickUp":
      return at({ kind: "pass", verb: `picked up ${plural(e.count, "card")}` });
    case "dead":
      return { kind: "trick", name: "STACK BEATEN", verb: "· INTO THE DEAD PILE" };
    case "draw":
      return at({ kind: "pass", verb: `drew ${plural(e.count, "card")}${e.tookTrump ? ", the trump card too" : ""}` });
    case "swapSeven":
      return at({ kind: "pass", verb: "swapped the trump 7 for the trump card" });
    case "skip":
      return at({ kind: "pass", verb: "ran out of time" });
    case "out":
      return at({ kind: "roundEnd", verb: `IS OUT · ${ordinal(e.place)}` });
    case "concede":
      return at({ kind: "roundEnd", verb: "SURRENDERS" });
    case "matchOver":
      return { kind: "round", label: "MATCH OVER" };
    default:
      return null;
  }
}

/**
 * The move log: each new engine event of `game` goes into the chat's LOG tab
 * once. Joining mid-match starts from the last deal.
 */
function useMoveLog(game, setMessages) {
  const logged = useRef({ match: null, count: 0, caughtUp: false });
  useEffect(() => {
    if (!game?.events || !setMessages) return;
    const log = logged.current;
    if (log.match !== game.matchNumber) {
      log.match = game.matchNumber;
      log.count = 0;
    }
    if (!log.caughtUp) {
      log.caughtUp = true;
      log.count = Math.max(0, game.events.findLastIndex((e) => e.type === "deal"));
    }
    if (game.events.length < log.count) log.count = 0; // a fresh state
    const fresh = game.events.slice(log.count);
    log.count = game.events.length;
    if (!fresh.length) return;
    const entries = fresh
      .flatMap((e) => [logEntry(e, game)].flat().filter(Boolean))
      .map((fields) => ({ id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: "SYSTEM", timestamp: now(), ...fields }));
    if (entries.length) setMessages((m) => [...m, ...entries]);
  }, [game, setMessages]);
}

function DepthPicker({ depth, max, onChange }) {
  const step = { backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" };
  return (
    <div className="flex items-stretch gap-1 p-1" role="group" aria-label="How deep to draw" style={{ backgroundColor: "#0a0712", border: "3px solid #1f1a3d" }}>
      <span className="font-pixel-display text-[10px] text-bone/60 self-center px-2 max-md:hidden">DEPTH</span>
      <button type="button" onClick={() => onChange(Math.max(1, depth - 1))} disabled={depth <= 1} className="pixel-btn font-pixel-display text-[12px] px-3 py-2" style={step} aria-label="Shallower">
        −
      </button>
      <span className="font-pixel-display text-sm text-glow-gold self-center text-center" style={{ minWidth: 36 }} aria-live="polite">
        {depth}
      </span>
      <button type="button" onClick={() => onChange(Math.min(max, depth + 1))} disabled={depth >= max} className="pixel-btn font-pixel-display text-[12px] px-3 py-2" style={step} aria-label="Deeper">
        +
      </button>
    </div>
  );
}

/** A small badge on the felt: dark, with a thin rim. */
function FeltBadge({ children, testId, tone = "#ead8b1" }) {
  return (
    <span data-testid={testId} className="font-pixel-display text-[9px] leading-none px-2 py-1.5 whitespace-nowrap flex items-center gap-1.5" style={{ backgroundColor: "#0a0712", color: tone, boxShadow: "0 0 0 2px #0a3a2c" }}>
      {children}
    </span>
  );
}

export default function GameKhuzur() {
  const { lobbyId, playerName } = useLocation().state || {};
  const solo = !lobbyId || lobbyId.startsWith("SOLO-");
  return solo ? <SoloKhuzur /> : <OnlineKhuzur lobbyId={lobbyId} playerName={playerName} />;
}

/** Practice: you in seat 0 against CPUs, all in the browser. */
function SoloKhuzur() {
  const navigate = useNavigate();
  const location = useLocation();
  const { identity } = useAuth();
  const table = validTable(location.state?.table) ?? DEFAULT_TABLE;
  const myName = short(location.state?.playerName ?? identity?.name ?? "YOU");
  const level = ["EASY", "MEDIUM", "HARD"].includes(location.state?.aiDifficulty) ? location.state.aiDifficulty : "MEDIUM";
  const players = useMemo(
    () => Array.from({ length: seatCount(table) }, (_, seat) => (seat === 0 ? { name: myName, type: "HUMAN" } : { name: BOT_NAMES[seat - 1], type: "AI", level })),
    [table, myName, level],
  );
  const [game, setGame] = useState(() => createMatch({ players, table }));
  const [revealed, setRevealed] = useState(null); // the match whose draw-for-deal reveal has shown
  const waitingForReveal = drewForDeal(game) && game.phase !== PHASES.DRAW && revealed !== game.matchNumber;
  const [dealt, setDealt] = useState(null); // the match whose deal has played out
  const over = game.phase === PHASES.MATCH_OVER;
  const waitingForDeal = hasDeal(game) && !over && dealt !== game.matchNumber;

  // CPU moves: one at a time, a beat apart, worked out outside React's updater.
  useEffect(() => {
    if (over || game.turn === 0 || game.turn == null || waitingForReveal || waitingForDeal) return;
    // After a beaten stack, the CPU waits for it to be held, swept away and the hands refilled.
    const delay = (game.players[0].out ? CPU_DELAY_OUT : reducedMotion() ? CPU_DELAY_REDUCED : CPU_DELAY) + (justCleared(game) && !reducedMotion() ? CLEAR_PAUSE : 0);
    const timer = setTimeout(() => {
      const next = cpuMove(game);
      setGame((current) => (current === game ? next : current));
    }, delay);
    return () => clearTimeout(timer);
  }, [game, over, waitingForReveal, waitingForDeal]);

  useSoloMatchReport({
    prefix: "KZ",
    matchNumber: game.matchNumber,
    finished: over,
    build: (times) => khuzurSoloReport(game, { ...times, me: 0 }),
  });

  /** Your move; returns the engine's reason if it's refused. */
  const onMove = (move) => {
    try {
      setGame(practiceMove(game, 0, move));
      return null;
    } catch (err) {
      return err.message;
    }
  };

  const [messages, setMessages] = useState([]);
  const sendChat = (text) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { id: `msg-${Date.now()}-${Math.random()}`, type: "CHAT", sender: myName, text: text.trim(), timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), isMe: true }]);
  };

  return (
    <KhuzurPlay
      game={game}
      mySeat={0}
      table={table}
      badge={
        <span
          className="font-pixel-display text-[10px] leading-none px-1.5 py-1 whitespace-nowrap"
          style={{ backgroundColor: LEVEL_COLOR[level], color: INK, boxShadow: "0 0 0 2px #0a0712" }}
          title="Practice against CPU players"
        >
          PRACTICE · {level}
        </span>
      }
      messages={messages}
      setMessages={setMessages}
      onSendChat={sendChat}
      onMove={onMove}
      onStage={null}
      revealed={!waitingForReveal}
      onRevealed={setRevealed}
      dealt={!waitingForDeal}
      onDealt={setDealt}
      playAgain={{ label: "PLAY AGAIN", onClick: () => setGame(startNextMatch(game)) }}
      onLeave={() => navigate("/lobby-khuzur")}
      faceFor={(seat) => (seat === 0 ? { variant: identity?.avatar ?? 1, customAvatarData: identity?.customAvatar } : { variant: CPU_VARIANTS[(seat - 1) % CPU_VARIANTS.length], customAvatarData: null })}
    />
  );
}

/**
 * Online: joins the table, shows the waiting table until the deal, then the
 * server's states. Moves go out as khuzur_move; refusals come back as
 * move_rejected.
 */
function OnlineKhuzur({ lobbyId, playerName }) {
  const navigate = useNavigate();
  const { identity } = useAuth();
  const [waiting, setWaiting] = useState(null);
  const [game, setGame] = useState(null);
  const [revealed, setRevealed] = useState(null);
  const [dealt, setDealt] = useState(null);
  // When the winning draw card finished showing here: the deal plays from then, however late.
  const [revealedAt, setRevealedAt] = useState({ match: null, at: 0 });
  const [messages, setMessages] = useState([]);
  const [rejection, setRejection] = useState(null);
  const [fatal, setFatal] = useState("");
  const chatLimit = useChatLimit();
  const joinedLate = useRef(null); // the match already under way when you arrived: no draw reveal
  const latest = useRef(null); // the last state received, which a refusal belongs to
  const dealEnds = useRef({}); // match -> when its deal ends on every screen (performance.now() time), as first heard

  useEffect(() => {
    const join = () => {
      socket.emit("join_lobby", { lobbyId, playerName });
      socket.emit("check_game_status", { lobbyId });
    };
    const onState = (v) => {
      // The deal's end is kept as first heard: a later state (a seat changing hands) mustn't restart it.
      if (v.dealMsLeft > 0 && dealEnds.current[v.matchNumber] == null) dealEnds.current[v.matchNumber] = performance.now() + v.dealMsLeft;
      const sent = { ...v, turnDeadline: v.turnMsLeft != null ? Date.now() + v.turnMsLeft : null, dealEndsAt: dealEnds.current[v.matchNumber] ?? null };
      latest.current = sent;
      setGame((prev) => {
        if (!prev && sent.phase !== PHASES.DRAW) joinedLate.current = sent.matchNumber;
        return sent;
      });
    };
    const onTable = (t) => {
      setWaiting(t);
      // A credit match is over and you staked for the next: back to the waiting
      // table. The next match is a new game (its match number starts at 1 again),
      // so nothing kept about the last one carries over.
      if (t.mySeat != null) {
        setGame(null);
        joinedLate.current = null;
        dealEnds.current = {};
        setRevealed(null);
        setDealt(null);
      }
    };
    const onLeft = () => navigate("/lobby-khuzur", { state: { tab: "credits" } });
    const onChat = (msg) => setMessages((m) => [...m, { ...msg, isMe: msg.sender === playerName }]);
    const onRejected = ({ reason } = {}) => setRejection({ id: Date.now() + Math.random(), text: reason || "Move rejected", game: latest.current });
    const onError = (msg) => setFatal((f) => f || String(msg || "Lobby not found"));
    socket.on("connect", join);
    socket.on("khuzur_state", onState);
    socket.on("table_update", onTable);
    socket.on("table_left", onLeft);
    socket.on("receive_chat", onChat);
    socket.on("move_rejected", onRejected);
    socket.on("error_message", onError);
    connectSocket(identity).then(() => {
      if (socket.connected) join();
    });
    return () => {
      socket.off("connect", join);
      socket.off("khuzur_state", onState);
      socket.off("table_update", onTable);
      socket.off("table_left", onLeft);
      socket.off("receive_chat", onChat);
      socket.off("move_rejected", onRejected);
      socket.off("error_message", onError);
      socket.emit("leave_page", { lobbyId });
    };
    // One join per table; identity and name are fixed for the visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId]);

  const credit = !!(game?.credit ?? waiting?.credit);
  const exit = () => {
    socket.emit("leave_lobby", { lobbyId });
    navigate("/lobby-khuzur", credit ? { state: { tab: "credits" } } : undefined);
  };
  const sendChat = (text) => text.trim() && socket.emit("send_chat", { lobbyId, message: text.trim() });
  const restake = () => socket.emit("credit_restake", { lobbyId });
  const myFace = { variant: identity?.avatar ?? 1, customAvatarData: identity?.customAvatar };

  if (game) {
    const shape = validTable(game.table) ?? DEFAULT_TABLE;
    const late = joinedLate.current === game.matchNumber;
    // You saw the draw, so you see the deal: if the server's end for it has already
    // passed (a slow reveal here), it plays quickly rather than not at all.
    const dealFloor = revealedAt.match === game.matchNumber ? revealedAt.at + MIN_DEAL_MS : 0;
    const dealEndsAt = game.dealEndsAt != null ? Math.max(game.dealEndsAt, dealFloor) : null;
    const reveal = late || !drewForDeal(game) || game.phase === PHASES.DRAW ? true : revealed === game.matchNumber;
    return (
      <KhuzurPlay
        game={game}
        mySeat={game.mySeat}
        table={shape}
        badge={
          <span
            className="font-pixel-display text-[10px] leading-none px-1.5 py-1 whitespace-nowrap"
            style={{ backgroundColor: game.credit ? "#f4c430" : "#5fd4d6", color: game.credit ? INK : "#0a2a2c", boxShadow: "0 0 0 2px #0a0712" }}
            title={game.credit ? "A credit match" : "An online table"}
          >
            {game.credit ? "CREDITS" : "ONLINE"} · #{lobbyId.replace(/^PUB-/, "")}
            {game.credit && <span className="ml-1.5" style={{ color: "#7a4a00" }}>· POT {game.credit.pot || game.credit.result?.pot || 0}</span>}
          </span>
        }
        messages={messages}
        setMessages={setMessages}
        onSendChat={sendChat}
        onMove={(move) => {
          socket.emit("khuzur_move", { lobbyId, move });
          return null;
        }}
        onStage={(cols) => socket.emit("khuzur_move", { lobbyId, move: { type: "stage", cols } })}
        rejection={rejection}
        revealed={reveal || game.phase === PHASES.DRAW}
        skipDraw={late}
        dealEndsAt={dealEndsAt}
        onRevealed={(match) => {
          setRevealed(match);
          setRevealedAt({ match, at: performance.now() });
        }}
        dealt={late || !hasDeal(game) || game.phase === PHASES.MATCH_OVER || dealt === game.matchNumber}
        onDealt={setDealt}
        playAgain={
          game.credit
            ? { label: "PLAY AGAIN", onClick: restake }
            : game.amHost
              ? { label: "PLAY AGAIN", onClick: () => socket.emit("request_rematch", { lobbyId }) }
              : { label: "HOST DEALS AGAIN", disabled: true }
        }
        onLeave={exit}
        online={{ chatLimit, reward: game.reward, credit: game.credit }}
        faceFor={(seat) => (seat === game.mySeat ? myFace : { variant: game.players[seat]?.avatar?.variant ?? CPU_VARIANTS[seat % CPU_VARIANTS.length], customAvatarData: game.players[seat]?.avatar?.custom ?? null })}
      />
    );
  }
  if (waiting) {
    const shape = validTable(waiting.table) ?? DEFAULT_TABLE;
    return (
      <WaitingTable
        table={waiting}
        title="KHUZUR"
        titleClass=""
        titleColor="#f08a4b"
        messages={messages}
        onSendMessage={sendChat}
        onExit={exit}
        onAddCpu={(seat, level) => socket.emit("add_cpu", { lobbyId, seat, level })}
        onRemoveCpu={(seat) => socket.emit("remove_cpu", { lobbyId, seat })}
        onSetCpuLevel={(seat, level) => socket.emit("set_cpu_level", { lobbyId, seat, level })}
        fillsEmptySeats
        chatLimit={chatLimit}
        onStart={() => socket.emit("start_game", { lobbyId })}
        onRestake={restake}
        errorMessage={rejection?.text}
        myFace={myFace}
        shape={shapeOf(shape)}
        seatTeam={shape.perTeam > 1 ? (seat) => ({ color: TEAM_COLORS[seat % shape.teams], label: teammates(shape, waiting.mySeat ?? -1, seat) || seat === waiting.mySeat ? "YOUR TEAM" : "TEAM" }) : undefined}
        onTakeSeat={(seat) => socket.emit("take_seat", { lobbyId, seat })}
        setup={
          <TableBuilder
            compact
            value={buildOf(shape)}
            onChange={(b) => socket.emit("set_table", { lobbyId, table: { perTeam: b.perTeam, teams: b.teams, handSize: b.handSize } })}
          />
        }
      />
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-5 h-full starfield font-pixel-body text-parchment text-center px-4" style={{ position: "fixed", inset: 0 }}>
      {fatal ? (
        <>
          <div className="font-pixel-display text-[14px]" style={{ color: "#e85a7a" }}>
            CAN'T OPEN THIS TABLE
          </div>
          <div className="font-pixel-body text-[22px] text-bone/80">{fatal}</div>
          <button onClick={() => navigate("/lobby-khuzur")} className="pixel-btn font-pixel-display text-[10px] px-4 py-3" style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}>
            GO TO KHUZUR LOBBY
          </button>
        </>
      ) : (
        <div className="font-pixel-display text-[14px] text-glow-gold blink">JOINING TABLE...</div>
      )}
    </div>
  );
}

/**
 * What just happened at each seat, called out over it (see Callout): PICK UP,
 * BEATEN! for the beat that finished a stack, SWAP 7!, TIME UP, SURRENDER, and
 * OUT with the place won; and over the others, LEAD and BEAT as they play. { seat: { id, label, bg, fg } }; each id plays once.
 */
function useSeatCallouts(game, active, mySeat) {
  const [callouts, setCallouts] = useState({});
  const before = useRef(null);
  const nextId = useRef(0);
  useEffect(() => {
    const prev = before.current;
    before.current = game;
    if (!prev || !active || prev.matchNumber !== game.matchNumber) return;
    const fresh = game.events.length > prev.events.length ? game.events.slice(prev.events.length) : [];
    const said = {};
    fresh.forEach((e, k) => {
      // What another player just played, named over their seat (a finishing beat says BEATEN! below).
      if (e.type === "lead" && e.seat !== mySeat) said[e.seat] = { label: e.cards.length > 1 ? `LEAD ${e.cards.length}` : "LEAD", bg: "#f4c430" };
      else if (e.type === "beat" && e.seat !== mySeat) said[e.seat] = { label: "BEAT", bg: "#5fd4d6", fg: "#0a2a2c" };
      else if (e.type === "pickUp") said[e.seat] = { label: "PICK UP", bg: "#e85a7a" };
      else if (e.type === "dead") {
        const finisher = fresh.slice(0, k).reverse().find((x) => x.type === "beat");
        if (finisher) said[finisher.seat] = { label: "BEATEN!", bg: "#9bd14f", fg: "#1a3a0e" };
      } else if (e.type === "swapSeven") said[e.seat] = { label: "SWAP 7!", bg: "#5fd4d6", fg: "#0a2a2c" };
      else if (e.type === "skip") said[e.seat] = { label: "TIME UP", bg: "#7a1530", fg: "#ead8b1" };
      else if (e.type === "concede") said[e.seat] = { label: "SURRENDER", bg: "#7a1530", fg: "#ead8b1" };
      else if (e.type === "out") said[e.seat] = { label: `OUT · ${ordinal(e.place)}`, bg: e.place === 1 ? "#f4c430" : "#ead8b1" };
    });
    const seats = Object.keys(said);
    if (!seats.length) return;
    setCallouts((c) => ({ ...c, ...Object.fromEntries(seats.map((seat) => [seat, { ...said[seat], id: `co-${nextId.current++}` }])) }));
  }, [game, active, mySeat]);
  return callouts;
}

/** A box on screen as a flight's end: its centre and width, px. */
const boxOf = (el) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
};

/**
 * Where a stack card lies, from its layout box, not its painted one: a card
 * that just landed is still sliding in (kz-land), and a flight from it should
 * start where it comes to rest.
 */
function restingBox(el) {
  const parent = el.parentElement?.getBoundingClientRect();
  if (!parent) return boxOf(el);
  return { x: parent.left + el.offsetLeft + el.offsetWidth / 2, y: parent.top + el.offsetTop + el.offsetHeight / 2, w: el.offsetWidth };
}

/**
 * Cards on the move (see CardFlights). Each new state's events say what went
 * where: a stack picked up flies into that hand, a beaten stack to the dead
 * pile, cards drawn from the pile to each seat in turn. A stack beaten whole
 * is first `held` on the table with the finishing beat on top (HOLD_MS), then
 * swept away, and only then do the hands refill. Where they fly from is where they lay on screen before the
 * state changed (measured after every render), where to is where they lie
 * now. Cards coming into your hand keep their slot hidden until they land.
 * `active`: only during play (the deal has its own animation).
 */
function useCardFlights({ game, mySeat, posOf, turnOf, active, rootRef }) {
  const [flights, setFlights] = useState([]);
  const [incoming, setIncoming] = useState(() => new Set());
  // A beaten stack, held on the table with the beat that finished it before it's swept away.
  const [held, setHeld] = useState(null);
  // Your own cards on the stack, still flying in from your hand.
  const [stackHidden, setStackHidden] = useState(() => new Set());
  const ownPending = useRef(null); // your finishing beat: flown once the held stack is on the table
  const sweep = useRef(null); // { timer, run }: the sweep waiting on a held stack
  const before = useRef(null);
  const seen = useRef({ stack: new Map(), hand: new Map(), draw: null, dead: null });
  const nextId = useRef(0);

  useLayoutEffect(() => {
    // The table moved on while a stack was held: sweep it now.
    if (sweep.current) {
      const { timer, run } = sweep.current;
      sweep.current = null;
      clearTimeout(timer);
      run();
    }
    const prev = before.current;
    before.current = game;
    const root = rootRef.current;
    if (!prev || !root || !active || reducedMotion() || prev.matchNumber !== game.matchNumber) return;
    const fresh = game.events.length > prev.events.length ? game.events.slice(prev.events.length) : [];
    if (!fresh.length) return;
    const was = seen.current;
    const seatBox = (seat) => {
      const pos = posOf(seat);
      const el = root.querySelector(`[data-deal-seat="${pos}"]`) ?? root.querySelector(`[data-plate="${pos}"]`);
      const b = boxOf(el);
      return b && { ...b, w: Number(el.dataset.cardW) || 24 };
    };
    const handBox = (id) => boxOf(root.querySelector(`[data-hand-card="${id}"]`));
    const target = (seat, id) => (seat === mySeat ? handBox(id) : seatBox(seat));
    const turn = (seat) => (seat === mySeat ? 0 : turnOf(seat));

    const prevHand = new Set((prev.players[mySeat]?.hand ?? []).map((c) => c.id));
    const stackBefore = prev.stack?.layers.flat() ?? [];
    const picked = new Set(fresh.some((e) => e.type === "pickUp" && e.seat === mySeat) ? stackBefore.map((c) => c.id) : []);
    // Cards new in your hand that weren't picked up: drawn, in the order they came.
    const drawn = (game.players[mySeat]?.hand ?? []).filter((c) => !c.hidden && !prevHand.has(c.id) && !picked.has(c.id)).map((c) => c.id);

    /** Flights for `events`, the stack's cards lying at `stackAt` (id -> box). */
    const plan = (events, stackAt, finisher) => {
      const out = [];
      const arriving = [];
      const stackArriving = [];
      let at = 0;
      const add = (f) => out.push({ ...f, id: `kf-${nextId.current++}` });
      events.forEach((e) => {
        if ((e.type === "lead" || e.type === "beat") && e.seat === mySeat) {
          // Your cards leave your hand for their place on the stack.
          e.cards.forEach((card, i) => {
            const from = was.hand.get(card.id);
            const el = root.querySelector(`[data-stack-card="${card.id}"]`);
            if (!from || !el) return;
            stackArriving.push(card.id);
            add({ from, to: restingBox(el), card, delay: at + i * 0.05, arriveStack: card.id });
          });
          at += 0.1;
        } else if (e.type === "swapSeven") {
          // The 7 goes under the pile, the old trump card into the swapper's hand.
          const spot = boxOf(root.querySelector('[data-kz-pile="trump"]'));
          const pileW = boxOf(root.querySelector('[data-kz-pile="draw"]'))?.w;
          const old = prev.trumpCard;
          const from = e.seat === mySeat ? was.hand.get(e.card.id) : seatBox(e.seat);
          if (from && spot && pileW) add({ from: { ...from, w: from.w > 4 ? from.w : pileW }, to: { ...spot, w: pileW }, card: e.card, delay: at, turn: 90 });
          const to = old && target(e.seat, old.id);
          if (old && was.trump && to && pileW) {
            if (e.seat === mySeat) arriving.push(old.id);
            add({ from: { ...was.trump, w: pileW }, to, card: old, delay: at + 0.1, spin: 90, turn: turn(e.seat), arrive: e.seat === mySeat ? old.id : null });
          }
          at += 0.5;
        } else if (e.type === "pickUp") {
          stackBefore.forEach((card, i) => {
            const from = stackAt.get(card.id);
            const to = target(e.seat, card.id);
            if (!from || !to) return;
            if (e.seat === mySeat) arriving.push(card.id);
            add({ from, to, card, delay: at + i * 0.035, turn: turn(e.seat), arrive: e.seat === mySeat ? card.id : null });
          });
          at += 0.25 + stackBefore.length * 0.035;
        } else if (e.type === "dead") {
          const dead = boxOf(root.querySelector('[data-kz-pile="dead"]')) ?? was.dead;
          const cards = [...stackBefore, ...(finisher?.cards ?? []).filter((c) => !stackBefore.some((b) => b.id === c.id))];
          cards.forEach((card, i) => {
            const from = stackAt.get(card.id) ?? was.hand.get(card.id) ?? (finisher ? seatBox(finisher.seat) : null);
            if (!from || !dead) return;
            add({ from: { ...from, w: from.w > 4 ? from.w : dead.w }, to: dead, card, delay: at + i * 0.025, spin: 0, turn: (i % 2 ? 1 : -1) * 6 });
          });
          at += 0.3 + cards.length * 0.025;
        } else if (e.type === "draw") {
          const pile = boxOf(root.querySelector('[data-kz-pile="draw"]')) ?? was.draw;
          for (let i = 0; i < e.count; i++) {
            const id = e.seat === mySeat ? drawn.shift() : null;
            const to = id ? handBox(id) : e.seat === mySeat ? null : seatBox(e.seat);
            if (!pile || !to) continue;
            if (id) arriving.push(id);
            add({ from: pile, to, card: null, delay: at + i * 0.09, turn: turn(e.seat), arrive: id });
          }
          at += 0.12 + e.count * 0.09;
        }
      });
      return { out, arriving, stackArriving };
    };
    const launch = ({ out, arriving, stackArriving = [] }) => {
      if (!out.length) return;
      if (stackArriving.length) setStackHidden((set) => new Set([...set, ...stackArriving]));
      try {
        soundManager.playDeal?.();
      } catch {
        /* audio not ready */
      }
      setFlights((list) => [...list, ...out]);
      if (arriving.length) setIncoming((set) => new Set([...set, ...arriving]));
    };

    // A beat that finished the stack: it lands on top, the stack stays a moment, then everything
    // from there on (the sweep to the dead pile, the cards drawn after) plays out.
    const deadAt = fresh.findIndex((e) => e.type === "dead");
    const finisher = deadAt > 0 ? fresh.slice(0, deadAt).reverse().find((e) => e.type === "beat") : null;
    if (finisher && prev.stack) {
      launch(plan(fresh.slice(0, deadAt).filter((e) => e !== finisher), was.stack, null));
      setHeld({ layers: [...prev.stack.layers, finisher.cards], owners: [...prev.stack.owners, finisher.seat] });
      // Your own finishing beat flies from your hand once the held stack is on the table.
      if (finisher.seat === mySeat) {
        ownPending.current = finisher.cards.map((card) => ({ card, from: was.hand.get(card.id) })).filter((x) => x.from);
        setStackHidden((set) => new Set([...set, ...ownPending.current.map((x) => x.card.id)]));
      }
      // Your drawn cards wait out of sight until they fly in.
      if (drawn.length) setIncoming((set) => new Set([...set, ...drawn]));
      const run = () => {
        const lying = new Map();
        root.querySelectorAll("[data-stack-card]").forEach((el) => lying.set(el.dataset.stackCard, restingBox(el)));
        setHeld(null);
        launch(plan(fresh.slice(deadAt), lying, finisher));
      };
      sweep.current = { run, timer: setTimeout(() => {
        sweep.current = null;
        run();
      }, HOLD_MS) };
      return;
    }
    launch(plan(fresh, was.stack, fresh.slice(0, Math.max(0, deadAt)).reverse().find((e) => e.type === "beat") ?? null));
    // posOf / turnOf follow the seat and the table, which `game` already does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, active, mySeat]);

  useEffect(() => () => clearTimeout(sweep.current?.timer), []);

  // The held stack is on the table: your finishing beat flies onto it from your hand.
  useLayoutEffect(() => {
    const own = ownPending.current;
    const root = rootRef.current;
    if (!held || !own?.length || !root) return;
    ownPending.current = null;
    const out = own
      .map(({ card, from }, i) => {
        const el = root.querySelector(`[data-stack-card="${card.id}"]`);
        return el && { id: `kf-${nextId.current++}`, from, to: restingBox(el), card, delay: i * 0.05, arriveStack: card.id };
      })
      .filter(Boolean);
    setFlights((list) => [...list, ...out]);
    // rootRef is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held]);

  // Where everything lies now, for the next state's flights to start from.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const stack = new Map();
    root.querySelectorAll("[data-stack-card]").forEach((el) => stack.set(el.dataset.stackCard, restingBox(el)));
    const hand = new Map();
    root.querySelectorAll("[data-hand-card]").forEach((el) => hand.set(el.dataset.handCard, boxOf(el)));
    // Cards placed on the stack for a beat fly on from there.
    root.querySelectorAll("[data-staged-card]").forEach((el) => hand.set(el.dataset.stagedCard, boxOf(el)));
    seen.current = {
      stack,
      hand,
      draw: boxOf(root.querySelector('[data-kz-pile="draw"]')),
      dead: boxOf(root.querySelector('[data-kz-pile="dead"]')),
      trump: boxOf(root.querySelector('[data-kz-pile="trump"]')),
    };
  });

  const land = useCallback((id) => {
    setFlights((list) => {
      const f = list.find((x) => x.id === id);
      if (f?.arriveStack) {
        setStackHidden((set) => {
          const next = new Set(set);
          next.delete(f.arriveStack);
          return next;
        });
      }
      if (f?.arrive) {
        setIncoming((set) => {
          const next = new Set(set);
          next.delete(f.arrive);
          return next;
        });
      }
      return list.filter((x) => x.id !== id);
    });
  }, []);

  // A new match, or flights cut short: nothing stays hidden.
  useEffect(() => {
    setFlights([]);
    setIncoming(new Set());
    setStackHidden(new Set());
    setHeld(null);
  }, [game.matchNumber]);

  return { flights, incoming, land, held, stackHidden };
}

/**
 * The table, practice or online, built like Muushig's: the header, the
 * stadium table with everyone round it, your hand under it and the controls
 * bar under that; the sidebar holds the scoreboard and the chat and move log.
 *
 * game: the state shown (online, a redacted view); mySeat: your seat (-1
 * watching); onMove(move) sends your move and returns a reason if it was
 * refused at once; revealed / onRevealed: whether the draw for the deal's
 * winning card has shown; dealt / onDealt: whether this match's deal has
 * played out (the shuffle, then every card to its seat); dealEndsAt: online,
 * when the deal ends on every screen (performance.now() time); playAgain: { label, onClick, disabled }; badge: the
 * header's tag (PRACTICE · MEDIUM, ONLINE · #CODE); messages / setMessages:
 * the chat and move log; onSendChat: sends a chat line; online: chat limit,
 * reward and credit result; onStage(cols): online, tells the table which top
 * cards you've placed a card on.
 */
function KhuzurPlay({ game, mySeat, table, badge, onMove, onStage = null, rejection = null, revealed, skipDraw = false, onRevealed, dealt = true, onDealt, dealEndsAt = null, playAgain, onLeave, messages, setMessages, onSendChat, online = null, faceFor }) {
  const { handW, compact, narrow } = useTableMetrics();
  const { vh } = useViewport();
  const layout = narrow ? "compact" : "full";
  const { connected, ping } = useServerStats({ enabled: !!online });
  // Your picked cards belong to this turn, and an error to the state it
  // happened on: both go once the table moves on.
  const turnKey = `${game.matchNumber}:${game.turn}`;
  const [pick, setPick] = useState({ key: null, ids: [] });
  const selected = pick.key === turnKey ? pick.ids : [];
  const setSelected = (update) => setPick((p) => ({ key: turnKey, ids: typeof update === "function" ? update(p.key === turnKey ? p.ids : []) : update }));
  const [failed, setFailed] = useState(null); // { game, text }
  const error = failed?.game === game ? failed.text : rejection?.game === game ? rejection.text : null;
  const [depth, setDepth] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const unread = useUnread(messages, panelOpen);
  const bubbles = useChatBubbles(messages);
  const handOrder = useHandOrder(`${game.matchNumber}`);
  useMoveLog(game, setMessages);

  // The deal's animation has played (then the trump is turned up and the first leader named).
  const [dealShown, setDealShown] = useState(null);
  const stage = !skipDraw && drewForDeal(game) && !(revealed && game.phase !== PHASES.DRAW) ? "draw" : !dealt ? (dealShown === game.matchNumber ? "trump" : "deal") : "play";
  const me = game.players[mySeat] ?? { hand: [], out: true, team: -1 };
  const myTurn = stage === "play" && game.phase === PHASES.PLAY && game.turn === mySeat;
  const myDraw = game.phase === PHASES.DRAW && game.turn === mySeat;
  const over = game.phase === PHASES.MATCH_OVER;
  const handleRevealed = useCallback(() => onRevealed?.(game.matchNumber), [onRevealed, game.matchNumber]);
  const handleDealt = useCallback(() => onDealt?.(game.matchNumber), [onDealt, game.matchNumber]);
  const handleDealShown = useCallback(() => setDealShown(game.matchNumber), [game.matchNumber]);
  // The deal: how many cards each seat has been dealt so far, for this match.
  const [dealing, setDealing] = useState({ match: null, counts: [] });
  const dealtSoFar = (seat) => (dealing.match === game.matchNumber ? (dealing.counts[seat] ?? 0) : 0);
  const onDealProgress = useCallback((counts) => setDealing({ match: game.matchNumber, counts }), [game.matchNumber]);
  const rootRef = useRef(null);
  useTurnTitle(myTurn || myDraw);

  const play = (sound) => {
    try {
      soundManager[sound]?.();
    } catch {
      /* audio not ready */
    }
  };
  const send = (move) => {
    const refused = onMove(move);
    if (refused) {
      setFailed({ game, text: refused });
      play("playError");
    } else setSelected([]);
  };

  useEffect(() => {
    if (myTurn || myDraw) play("playTurnAlert");
  }, [myTurn, myDraw, game.turn]);

  const sorted = useMemo(() => sortedHand(me.hand.filter((c) => !c.hidden), game.trumpSuit, handOrder.mode), [me.hand, game.trumpSuit, handOrder.mode]);

  // Your beat being placed: per top card, the id of the card you've put on it (or null).
  // It belongs to this stack on this turn, and goes once the table moves on.
  const top = topLayer(game);
  const beating = myTurn && !!game.stack;
  const placeKey = `${turnKey}:${game.stack?.layers.length ?? 0}:${game.events?.length ?? 0}`;
  const [placing, setPlacing] = useState({ key: null, cols: [] });
  const byId = new Map(sorted.map((c) => [c.id, c]));
  const placedIds = beating ? top.map((_, col) => (placing.key === placeKey && byId.has(placing.cols[col]) ? placing.cols[col] : null)) : [];
  const placedCards = placedIds.map((id) => (id ? byId.get(id) : null));
  const setPlaced = (cols) => setPlacing({ key: placeKey, cols });
  const [dropCol, setDropCol] = useState(null);
  const placedSig = placedIds.map((id) => (id ? 1 : 0)).join("");
  // Online, the table sees a face-down card on each top card you've covered: sent on each
  // change, but not for a turn where nothing has been placed yet.
  const lastStaged = useRef("");
  useEffect(() => {
    if (!onStage || !beating) return;
    const sig = `${placeKey}|${placedSig}`;
    const sent = lastStaged.current;
    if (sent === sig) return;
    lastStaged.current = sig;
    if (!sent.startsWith(`${placeKey}|`) && !placedSig.includes("1")) return;
    onStage([...placedSig].flatMap((on, col) => (on === "1" ? [col] : [])));
  }, [onStage, beating, placeKey, placedSig]);

  // Nothing in your hand until it's dealt; while the deal plays, your cards arrive one by one in
  // the order dealt; then they sort. Cards you've placed on the stack leave it.
  const hand = stage === "draw" ? [] : stage === "deal" ? me.hand.slice(0, dealtSoFar(mySeat)) : sorted.filter((c) => !placedIds.includes(c.id));
  /** How many cards a seat shows holding: none before the deal, then as they're dealt. */
  const shownCount = (seat) => {
    const count = game.players[seat]?.hand.length ?? 0;
    return stage === "draw" ? 0 : stage === "deal" ? Math.min(count, dealtSoFar(seat)) : count;
  };
  const picked = hand.filter((card) => selected.includes(card.id));
  const refuse = (text) => {
    setFailed({ game, text });
    play("playError");
  };
  /** Put a card from your hand on top card `col` (any card already there goes back). */
  const placeOn = (id, col) => {
    const card = byId.get(id);
    if (!card || !top[col]) return;
    if (!beats(card, top[col], game.trumpSuit)) return refuse(cantBeat(card, top[col], game.trumpSuit));
    setPlaced(top.map((_, i) => (i === col ? id : placedIds[i] === id ? null : placedIds[i])));
    setFailed(null);
    play("playClick");
  };
  /** A click while beating: the card goes where it fits best (see autoColumn). */
  const autoPlace = (id) => {
    const card = byId.get(id);
    const rest = hand.filter((c) => c.id !== id);
    const col = autoColumn(card, top, placedIds, rest, game.trumpSuit);
    if (col === null) {
      const open = top.filter((_, i) => !placedIds[i]);
      return refuse(open.length === 1 ? cantBeat(card, open[0], game.trumpSuit) : `${cardText(card)} can't beat any card left to cover`);
    }
    placeOn(id, col);
  };
  const unplace = (col) => {
    setPlaced(placedIds.map((id, i) => (i === col ? null : id)));
    play("playClick");
  };
  /**
   * A placed card dragged from column `from` and let go at x, y: on another top card it moves
   * there (the card it finds there swaps over if it beats this column's card, else goes back
   * to your hand); off the stack it goes back to your hand; on its own column, nothing.
   */
  const movePlaced = (from, x, y) => {
    const id = placedIds[from];
    const col = columnAt(x, y);
    if (!id || col === from) return;
    if (col === null) return unplace(from);
    const card = byId.get(id);
    if (!beats(card, top[col], game.trumpSuit)) return refuse(cantBeat(card, top[col], game.trumpSuit));
    const other = placedIds[col] ? byId.get(placedIds[col]) : null;
    const next = [...placedIds];
    next[col] = id;
    next[from] = other && beats(other, top[from], game.trumpSuit) ? other.id : null;
    setPlaced(next);
    setFailed(null);
    play("playClick");
  };
  /** Lights the top card a carried card (from your hand, or one already placed) would beat. */
  const showDrop = (card, x, y) => {
    const col = card ? columnAt(x, y) : null;
    setDropCol(col !== null && beats(card, top[col], game.trumpSuit) ? col : null);
  };
  /** The top card under a point on screen, as a column, or null. */
  const columnAt = (x, y) => {
    const el = document.elementsFromPoint?.(x, y).find((node) => node.dataset?.beatCol != null);
    return el ? Number(el.dataset.beatCol) : null;
  };
  const toggle = (id) => {
    if (beating) return autoPlace(id);
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
    play("playClick");
  };

  const mode = myTurn ? (game.stack ? "beat" : "lead") : "wait";
  const limit = game.phase === PHASES.PLAY ? leadLimit(game) : 0;
  const reason = mode === "lead" ? leadReason(picked, limit) : mode === "beat" ? beatReason(placedCards) : null;
  // Someone else's beat being placed (online): a face-down card on each top card covered.
  const othersStaged =
    !beating && game.stack && game.staged && game.staged.seat === game.turn && game.staged.seat !== mySeat && stage === "play"
      ? top.map((_, col) => (game.staged.cols.includes(col) ? { hidden: true } : null))
      : null;
  const staged = beating ? (placedCards.some(Boolean) ? placedCards.map((card) => (card ? { card } : null)) : null) : othersStaged;

  const n = game.players.length;
  const viewer = mySeat >= 0 ? mySeat : 0;
  const posOf = (seat) => positionOf(seat, viewer, n);
  const colorOf = (seat) => seatColor(table, seat);
  const nameOf = (seat) => short(game.players[seat]?.name ?? "");
  const placeOf = (seat) => (game.players[seat]?.out ? game.places[game.players[seat].team] : null);
  const teamGame = table.perTeam > 1;
  // How each seat's face-down cards turn on the felt: dealt and drawn cards land turned so.
  // The table picks its own shape for the room it has (see KhuzurTable).
  const [shape, setShape] = useState(layout);
  const geo = KHUZUR_GEOMETRY[layout === "compact" ? "compact" : shape] ?? KHUZUR_GEOMETRY[layout];
  const seatTurns = Object.fromEntries(KHUZUR_SEAT_NAMES.filter((s) => s !== "bottom").map((s) => [s, geo.seats[s].fan ? turnAt(geo, geo.seats[s].t) : 0]));
  const callouts = useSeatCallouts(game, stage === "play", mySeat);
  const [calloutDone, setCalloutDone] = useState(null); // the last of yours that has played
  const { flights, incoming, land, held, stackHidden } = useCardFlights({ game, mySeat, posOf, turnOf: (seat) => seatTurns[posOf(seat)] ?? 0, active: stage === "play", rootRef });

  // Whose move the table waits on: their side of the rim glows (yours: your hand's mark).
  const waitingOn = stage === "draw" ? (game.phase === PHASES.DRAW ? game.turn : null) : stage === "play" && game.phase === PHASES.PLAY ? game.turn : null;
  const turnSeat = waitingOn != null && waitingOn !== mySeat ? posOf(waitingOn) : null;

  const seats = {};
  game.players.forEach((p) => {
    if (p.id === mySeat) return;
    const place = placeOf(p.id);
    const active = waitingOn === p.id && !place;
    const mate = teammates(table, mySeat, p.id);
    const held = shownCount(p.id);
    seats[posOf(p.id)] = {
      cards: held,
      out: !!place,
      plate: (
        <KhuzurSeat
          layout={layout}
          seat={posOf(p.id)}
          player={p}
          face={faceFor(p.id)}
          color={colorOf(p.id)}
          count={held}
          place={place}
          isActive={active}
          dimmed={turnSeat !== null && !active}
          bubble={bubbles.bubbleFor(p.name)}
          bubbleAt={BUBBLE_AT[posOf(p.id)]}
          tag={mate ? { label: "MATE", bg: colorOf(p.id) } : teamGame ? { label: TEAM_NAMES[p.team], bg: colorOf(p.id) } : null}
          chip={
            place
              ? { label: ordinal(place), bg: place === 1 ? "#f4c430" : "#ead8b1" }
              : active
                ? stage === "draw"
                  ? { label: "DRAW", bg: "#f4c430", blink: true }
                  : game.stack
                    ? { label: `BEAT ${top.length}`, bg: "#e85a7a", blink: true }
                    : { label: "LEAD", bg: "#f4c430", blink: true }
                : null
          }
          callout={callouts[p.id] ?? null}
        />
      ),
    };
  });

  // The draw for the deal, over the felt.
  const draws = game.dealDraws ?? [];
  const latestBySeat = new Map();
  draws.forEach((d, i) => latestBySeat.set(d.seat, { key: `${game.matchNumber}-${i}`, seat: posOf(d.seat), card: d.card, depth: d.depth }));
  const drawMax = game.phase === PHASES.DRAW ? maxDrawDepth(game) : 1;
  const pickDepth = Math.min(depth, drawMax);
  const overlay =
    stage === "draw"
      ? ({ cardWidth, drawCw, ...place }) => (
          <DealDraw
            key={game.matchNumber}
            cw={drawCw ?? cardWidth}
            {...place}
            count={game.dealDeck?.length ?? 0}
            draws={[...latestBySeat.values()]}
            latest={draws.length ? `${game.matchNumber}-${draws.length - 1}` : null}
            preview={myDraw ? pickDepth : 0}
            label={game.phase === PHASES.DRAW ? "DRAW FOR THE DEAL" : "HIGHEST CARD DEALS"}
            winner={game.phase === PHASES.DRAW ? null : posOf(game.dealer)}
            onDone={handleRevealed}
          />
        )
      : stage === "deal"
        ? ({ cardWidth }) => (
            <DealAnimation
              key={`deal-${game.matchNumber}`}
              dealerIndex={game.dealer}
              viewIndex={viewer}
              deckWidth={cardWidth}
              seats={seatPositions(n)}
              seatRotation={seatTurns}
              cardsPerSeat={table.handSize}
              leftover={game.drawPile.length + (game.trumpCard ? 1 : 0)}
              endsAt={dealEndsAt != null ? dealEndsAt - TRUMP_REVEAL_MS : null}
              onDealProgress={onDealProgress}
              onComplete={handleDealShown}
            />
          )
        : stage === "trump" && game.trumpCard
          ? ({ cardWidth, pileW, drawSpot }) => (
              <TrumpReveal
                key={`trump-${game.matchNumber}`}
                trump={game.trumpCard}
                cw={cardWidth}
                pileW={pileW}
                drawSpot={drawSpot}
                pileCount={game.drawPile.length}
                leader={game.turn === mySeat ? "YOU" : nameOf(game.turn)}
                onDone={handleDealt}
              />
            )
          : null;

  // A surrender vote open on your team (online).
  const vote = online && me.team >= 0 ? game.votes?.[me.team] : null;
  const voters = (vote ?? []).filter((seat) => seat !== mySeat).map(nameOf);
  const iVoted = !!vote?.includes(mySeat);
  const humanMates = game.players.filter((p) => p.id !== mySeat && p.team === me.team && p.type === "HUMAN" && !p.out).length;

  // The controls bar: what's happening, and the buttons for it.
  let message;
  let hint = null;
  let buttons = [];
  if (game.phase === PHASES.DRAW) {
    message = myDraw ? `Your draw: take a card 1 to ${drawMax} down. Highest card deals.` : `${nameOf(game.turn)} is drawing for the deal...`;
    if (myDraw) buttons = [{ label: "TAKE", tone: "gold", primary: true, onClick: () => send({ type: "drawForDeal", depth: pickDepth }) }];
  } else if (stage === "draw") message = `${nameOf(game.dealer)} drew the highest card and deals.`;
  else if (stage === "deal") message = game.dealer === mySeat ? "You shuffle and deal..." : `${nameOf(game.dealer)} shuffles and deals...`;
  else if (stage === "trump") message = game.turn === mySeat ? "The trump is turned up. You lead first." : `The trump is turned up. ${nameOf(game.turn)} leads first.`;
  else if (over) message = "The match is over.";
  else if (mySeat < 0) message = "Watching";
  else if (me.out) message = `You're out in ${ordinal(placeOf(mySeat))} place. The rest play on.`;
  else if (myTurn) {
    const just = lastMoveText(game, mySeat);
    message = game.stack
      ? `${just ? `${just} ` : ""}Beat ${top.length === 1 ? "it" : `all ${top.length}`}, or pick the stack up.`
      : `${just ? `${just} ` : ""}Your lead: up to ${plural(limit, "card")}.`;
    hint = reason;
    buttons = game.stack
      ? [
          // BEAT is the move you're making: big and bright, counting the cards covered. PICK UP is the way out, quieter.
          {
            label: "BEAT",
            tone: "gold",
            primary: true,
            disabled: reason !== null,
            progress: reason !== null ? `${placedIds.filter(Boolean).length}/${top.length}` : null,
            onClick: () => send({ type: "beat", cardIds: placedIds }),
          },
          { label: "PICK UP", tone: "roseSoft", onClick: () => send({ type: "pickUp" }) },
        ]
      : [{ label: "LEAD", tone: "gold", primary: true, disabled: reason !== null, onClick: () => send({ type: "lead", cardIds: picked.map((c) => c.id) }) }];
  } else {
    message = game.stack ? `${nameOf(game.turn)} must beat ${top.length === 1 ? "the top card" : `the top ${top.length} cards`}...` : `${nameOf(game.turn)} leads...`;
    hint = lastMoveText(game, mySeat);
  }
  const playing = game.phase === PHASES.PLAY && stage === "play" && mySeat >= 0 && !me.out;
  if (playing && canSwapSeven(game, mySeat)) buttons.push({ label: "SWAP 7", tone: "cyan", onClick: () => send({ type: "swapSeven" }) });
  if (playing && !iVoted) buttons.push({ label: "SURRENDER", tone: "blood", small: true, onClick: () => setConfirming(true) });
  // The turn clock runs for a person on turn, in the draw for the deal too.
  const clockOn = online && game.turnDeadline && !over && (stage === "play" || game.phase === PHASES.DRAW);

  // The line on the felt: the trump, the deal, and what the stack waits for.
  const feltLabel = ({ roomy }) => (
    <div className="flex items-center gap-2">
      {game.trumpSuit && (
        <FeltBadge tone="#f4c430">
          {roomy && "TRUMP"} <Suit suit={game.trumpSuit} size={17} />
        </FeltBadge>
      )}
      {roomy && <FeltBadge testId="decks">{`${table.handSize} CARDS · ${decksOf(table)}`}</FeltBadge>}
      {game.phase === PHASES.PLAY && (
        <FeltBadge tone={game.stack ? "#e85a7a" : "#9bd14f"}>{game.stack ? `BEAT ${top.length}` : roomy ? `LEAD UP TO ${limit}` : `LEAD ${limit}`}</FeltBadge>
      )}
    </div>
  );

  const rows = over
    ? standings(game).map(({ place, seats: s, team }) => ({
        place,
        names: s.map(nameOf),
        faces: s.map(faceFor),
        color: table.perTeam === 1 ? FFA_COLOR : TEAM_COLORS[team],
        mine: s.includes(mySeat),
      }))
    : [];
  const myPayout = online?.credit?.result?.payouts?.find((p) => p.seat === mySeat);
  const myTag =
    mySeat >= 0 ? (
      <span className="font-pixel-display text-[10px] leading-none px-2 py-1.5 shrink-0 whitespace-nowrap" style={{ backgroundColor: colorOf(mySeat), color: INK, boxShadow: "0 0 0 2px #0a0712" }}>
        {`YOU${teamGame ? ` · ${TEAM_NAMES[me.team] ?? ""}` : ""}${game.dealer === mySeat && stage === "play" ? " · DEALER" : ""}`}
      </span>
    ) : null;
  const avatarFor = (msg) => (msg.isMe ? faceFor(mySeat) : faceFor(Math.max(0, game.players.findIndex((p) => p.name === msg.sender))));

  return (
    <div ref={rootRef} className="relative w-full h-full font-pixel-body text-parchment overflow-hidden flex flex-col" style={{ position: "fixed", inset: 0 }}>
      {/* TABLE BACKDROP */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, #2e1c12 0%, #14102a 60%, #0a0712 100%)" }} />
      <div className="absolute inset-0 dither-shadow opacity-40 pointer-events-none" />

      <TableHeader
        compact={compact}
        narrow={narrow}
        onExit={onLeave}
        badge={badge}
        title="KHUZUR"
        titleClass=""
        titleColor="#f08a4b"
        match={game.matchNumber}
        signal={<ConnectionSignal local={!online} connected={connected} ping={ping} />}
        rulesTone={{ bg: "#f08a4b", deep: "#a8552a", ink: INK }}
        onRules={() => setShowRules(true)}
        onSettings={() => setShowSettings(true)}
        onPanel={() => setPanelOpen(true)}
        unread={unread}
        extra={clockOn ? <TurnClock deadline={game.turnDeadline} who={nameOf(game.turn)} mine={game.turn === mySeat} compact={compact} /> : null}
      />

      <div className="relative flex-1 grid min-h-0" style={{ gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1fr) 300px" }}>
        {/* TABLE */}
        <div className={`relative flex flex-col min-h-0 ${narrow ? "px-2 pt-2 pb-2" : "px-4 pt-3 pb-2"}`}>
          <div className="relative flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden">
            <div className="relative flex-1">
              <KhuzurTable
                layout={layout}
                game={held ? { ...game, stack: held, deadPile: game.deadPile.slice(held.layers.flat().length) } : game}
                seats={seats}
                colorOf={colorOf}
                positionOfSeat={posOf}
                label={stage === "play" ? feltLabel : null}
                drawing={stage === "draw"}
                dealing={stage === "deal" || stage === "trump"}
                stackHidden={stackHidden}
                onShape={setShape}
                staged={held ? null : staged}
                onUnstage={unplace}
                onStagedMove={(from, x, y) => showDrop(from === null ? null : byId.get(placedIds[from]), x, y)}
                onStagedDrop={movePlaced}
                targets={beating}
                dropCol={beating ? dropCol : null}
                overlay={overlay}
                dealerSeat={stage !== "draw" && game.dealer != null ? posOf(game.dealer) : null}
                turnSeat={turnSeat}
                banner={<TurnBanner active={myTurn || myDraw} />}
              />
            </div>

            {/* Your hand, under the table. */}
            <div className="relative shrink-0 mt-3" data-your-turn={myTurn || myDraw ? "true" : undefined}>
              {(myTurn || myDraw) && <YourTurnMark />}
              {callouts[mySeat] && callouts[mySeat].id !== calloutDone && (
                <Callout key={callouts[mySeat].id} {...callouts[mySeat]} onDone={() => setCalloutDone(callouts[mySeat].id)} />
              )}
              <KhuzurHand
                cards={hand}
                selected={selected}
                onToggle={toggle}
                cardW={Math.round(handW * 0.8)}
                enabled={myTurn}
                emptyMessage={stage === "draw" ? "DRAW FOR THE DEAL: THE HIGHEST CARD DEALS" : stage === "deal" || stage === "trump" ? null : mySeat < 0 ? "WATCHING" : me.out ? `YOU'RE OUT — ${ordinal(placeOf(mySeat) ?? 0)} PLACE` : null}
                hidden={incoming}
                draggable={beating}
                onDragOver={(id, x, y) => showDrop(id ? byId.get(id) : null, x, y)}
                onDrop={(id, x, y) => {
                  const col = columnAt(x, y);
                  if (col !== null) placeOn(id, col);
                }}
              />
            </div>
          </div>

          {/* The bar keeps its place: a surrender vote floats over the hand rather than pushing the table up. */}
          <div className="relative shrink-0">
            {vote && !me.out && (
              <div role="status" className="absolute bottom-full left-2 right-2 mb-2 z-40 flex flex-wrap items-center justify-center gap-2 px-3 py-2" style={{ backgroundColor: "#2a0e18", boxShadow: "0 0 0 3px #7a1530" }}>
                <span className="font-pixel-body text-[20px] text-parchment">
                  {iVoted ? "Waiting for your teammates to agree to surrender" : `${voters.join(" and ")} ${voters.length === 1 ? "wants" : "want"} to surrender`}
                </span>
                {!iVoted && (
                  <button type="button" onClick={() => send({ type: "surrender" })} className="pixel-btn font-pixel-display text-[10px] px-3 py-2" style={{ backgroundColor: "#e85a7a", borderColor: "#a83a5a", color: INK }}>
                    SURRENDER
                  </button>
                )}
                <button type="button" onClick={() => send({ type: "keepPlaying" })} className="pixel-btn font-pixel-display text-[10px] px-3 py-2" style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}>
                  KEEP PLAYING
                </button>
              </div>
            )}

            <KhuzurControls
              tag={myTag}
              highlight={myTurn || myDraw}
              message={message}
              hint={hint}
              warning={error}
              buttons={buttons}
              sortMode={handOrder.mode === "suit" ? "suit" : "rank"}
              onSortModeChange={(m) => {
                handOrder.pick(m);
                play("playClick");
              }}
              dense={vh < DENSE_H}
            >
              {myDraw && stage === "draw" && <DepthPicker depth={pickDepth} max={drawMax} onChange={setDepth} />}
            </KhuzurControls>
          </div>
        </div>

        {/* SIDEBAR */}
        <TableSidebar compact={compact} open={panelOpen} onClose={closePanel}>
          <KhuzurScoreBoard game={game} table={table} countOf={shownCount} turn={waitingOn ?? -1} dealer={stage === "play" ? (game.dealer ?? -1) : -1} myIndex={mySeat} faceFor={faceFor} />
          <GameChat messages={messages} onSendMessage={onSendChat} avatarFor={avatarFor} colorFor={colorOf} {...online?.chatLimit} />
        </TableSidebar>
      </div>

      {confirming && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(10,7,18,0.8)", backdropFilter: "blur(3px)" }}>
          <div role="dialog" aria-label="SURRENDER?" className="flex flex-col gap-4 p-5 w-[440px] max-w-full" style={{ backgroundColor: "#1f1a3d", border: "4px solid #0a0712", boxShadow: "0 0 0 4px #7a1530, 8px 8px 0 #0a0712" }}>
            <div className="font-pixel-display text-[14px] text-center" style={{ color: "#e85a7a" }}>
              SURRENDER?
            </div>
            <p className="font-pixel-body text-[22px] text-parchment leading-tight text-center">
              Give up this match? {teamGame ? "Your team takes" : "You take"} the lowest place left
              {online && humanMates > 0 ? ", once every teammate agrees." : "."}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" autoFocus onClick={() => setConfirming(false)} className="pixel-btn font-pixel-display text-[11px] py-3" style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}>
                KEEP PLAYING
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  send({ type: "surrender" });
                }}
                className="pixel-btn font-pixel-display text-[11px] py-3"
                style={{ backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" }}
              >
                YES, SURRENDER
              </button>
            </div>
          </div>
        </div>
      )}

      {over && (
        <Standings rows={rows} playAgain={playAgain} onLeave={onLeave}>
          {online?.credit?.result && (
            <p className="font-pixel-display text-[10px] text-center text-glow-gold">
              {myPayout ? `YOU WIN ${myPayout.amount}` : `POT ${online.credit.result.pot}${online.credit.result.payouts.length ? " TO 1ST" : " LOST: NO PLAYER IN 1ST"}`}
            </p>
          )}
          {online && mySeat >= 0 && <RewardPanel reward={online.reward} />}
        </Standings>
      )}
      <CardFlights flights={flights} onLand={land} />
      {showRules && <KhuzurRules onClose={() => setShowRules(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
