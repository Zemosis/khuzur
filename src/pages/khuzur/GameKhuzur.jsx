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
// at a time, a beat apart, so you can follow the stack.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, connectSocket } from "../../utils/socket";
import { useChatLimit } from "../../hooks/useChatLimit";
import { useSoloMatchReport } from "../../hooks/useSoloMatchReport";
import { khuzurSoloReport } from "../../utils/soloReport";
import WaitingTable from "../../components/thirteen/WaitingTable";
import GameChat from "../../components/thirteen/GameChat";
import RewardPanel from "../../components/RewardPanel";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useTableMetrics } from "../../hooks/useTableMetrics";
import { useElementWidth } from "../../hooks/useElementWidth";
import { ConnectionSignal, TableHeader, TableSidebar } from "../../components/TableChrome";
import SettingsModal from "../../components/SettingsModal";
import { PixelCard } from "../../components/PixelCard";
import DealDraw from "../../components/muushig/DealDraw";
import KhuzurTable from "../../components/khuzur/KhuzurTable";
import KhuzurControls from "../../components/khuzur/KhuzurControls";
import Standings from "../../components/khuzur/Standings";
import KhuzurRules from "../../components/khuzur/KhuzurRules";
import { toPixelCardProps } from "../../components/khuzur/cardProps";
import { FFA_COLOR, TEAM_COLORS, ordinal, seatColor, teammates } from "../../components/khuzur/teams";
import { INK } from "../../components/pixelTokens";
import { BOT_NAMES } from "../../utils/constants";
import { positionOf } from "../../utils/seatPosition";
import { reducedMotion } from "../../utils/motion";
import { soundManager } from "../../utils/SoundManager";
import { LEAD_SIZES, cardPower, coverAssignment, isValidLead } from "../../utils/khuzur/cards";
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
const CPU_DELAY = 900;
const CPU_DELAY_REDUCED = 300;
const CPU_DELAY_OUT = 250; // once you're out, the CPUs play the rest out quickly
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const short = (name = "") => name.split(" #")[0];
const shapeOf = (t) => (t.perTeam === 1 ? `FFA ${t.teams}` : Array(t.teams).fill(t.perTeam).join(" V ")) + ` · ${t.handSize} CARDS`;
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

/** This match opened with the draw for the deal (the first at a table does). */
const drewForDeal = (game) => game.phase === PHASES.DRAW || (game.events ?? []).some((e) => e.type === "firstDealer");

/** Seconds left on a turn clock, as m:ss, ticking. */
function TurnClock({ deadline }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span data-testid="turn-clock" className="font-pixel-display text-[10px] px-2 py-1" style={{ backgroundColor: left <= 10 ? "#7a1530" : "#0a0712", color: "#ead8b1" }}>
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </span>
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

/** Why the picked cards don't beat the top layer, or null. */
function beatReason(cards, top, trumpSuit) {
  if (cards.length !== top.length) return `Pick ${plural(top.length, "card")} to beat with`;
  if (!coverAssignment(top, cards, trumpSuit)) return "Those don't beat every card";
  return null;
}

/** A card's label for screen readers and tests: "J♠", "Gray joker". */
const cardLabel = (card) => (card.joker ? (card.joker === "gray" ? "Gray joker" : "Colored joker") : `${card.rank}${card.suit}${card.copy === 2 ? " (2)" : ""}`);

function DepthPicker({ depth, max, onChange }) {
  const step = { backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" };
  return (
    <div className="flex items-stretch gap-1 p-1" role="group" aria-label="How deep to draw" style={{ backgroundColor: "#0a0712", border: "3px solid #1f1a3d" }}>
      <span className="font-pixel-display text-[10px] text-bone/60 self-center px-2">DEPTH</span>
      <button onClick={() => onChange(Math.max(1, depth - 1))} disabled={depth <= 1} className="pixel-btn font-pixel-display text-[12px] px-3 py-2" style={step} aria-label="Shallower">
        −
      </button>
      <span className="font-pixel-display text-sm text-glow-gold self-center text-center" style={{ minWidth: 36 }} aria-live="polite">
        {depth}
      </span>
      <button onClick={() => onChange(Math.min(max, depth + 1))} disabled={depth >= max} className="pixel-btn font-pixel-display text-[12px] px-3 py-2" style={step} aria-label="Deeper">
        +
      </button>
    </div>
  );
}

// A big hand (after pick-ups) shrinks its cards so each still shows its rank.
const MIN_SHOWN = 0.42; // of a card's width, the least of each card left showing

function Hand({ cards, selected, onToggle, cardW: fullW, enabled }) {
  const ref = useRef(null);
  const width = useElementWidth(ref) - 16;
  const n = cards.length;
  const cardW = n > 1 && width > 0 ? Math.max(32, Math.min(fullW, Math.floor(width / (1 + MIN_SHOWN * (n - 1))))) : fullW;
  const step = n > 1 ? Math.min(cardW + 6, Math.max(cardW * MIN_SHOWN * 0.8, (width - cardW) / (n - 1))) : 0;
  const total = cards.length ? cardW + step * (cards.length - 1) : 0;
  return (
    <div ref={ref} className="w-full flex justify-center" style={{ height: Math.round(fullW * 1.4375) + 26 }}>
      <div className="relative" style={{ width: total }}>
        {cards.map((card, i) => {
          const on = selected.includes(card.id);
          return (
            <button
              key={card.id}
              type="button"
              aria-label={cardLabel(card)}
              aria-pressed={on}
              disabled={!enabled}
              onClick={() => onToggle(card.id)}
              className="absolute bottom-0 p-0 bg-transparent border-0"
              style={{ left: i * step, zIndex: i, cursor: enabled ? "pointer" : "default" }}
            >
              <PixelCard {...toPixelCardProps(card)} width={cardW} selected={on} selectable={enabled} />
            </button>
          );
        })}
      </div>
    </div>
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
  const over = game.phase === PHASES.MATCH_OVER;

  // CPU moves: one at a time, a beat apart, worked out outside React's updater.
  useEffect(() => {
    if (over || game.turn === 0 || game.turn == null || waitingForReveal) return;
    const delay = game.players[0].out ? CPU_DELAY_OUT : reducedMotion() ? CPU_DELAY_REDUCED : CPU_DELAY;
    const timer = setTimeout(() => {
      const next = cpuMove(game);
      setGame((current) => (current === game ? next : current));
    }, delay);
    return () => clearTimeout(timer);
  }, [game, over, waitingForReveal]);

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

  return (
    <KhuzurPlay
      game={game}
      mySeat={0}
      table={table}
      kicker="PRACTICE"
      onMove={onMove}
      revealed={!waitingForReveal}
      onRevealed={setRevealed}
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
  const [messages, setMessages] = useState([]);
  const [rejection, setRejection] = useState(null);
  const [fatal, setFatal] = useState("");
  const chatLimit = useChatLimit();
  const joinedLate = useRef(null); // the match already under way when you arrived: no draw reveal
  const latest = useRef(null); // the last state received, which a refusal belongs to

  useEffect(() => {
    const join = () => {
      socket.emit("join_lobby", { lobbyId, playerName });
      socket.emit("check_game_status", { lobbyId });
    };
    const onState = (v) => {
      const sent = { ...v, turnDeadline: v.turnMsLeft != null ? Date.now() + v.turnMsLeft : null };
      latest.current = sent;
      setGame((prev) => {
        if (!prev && sent.phase !== PHASES.DRAW) joinedLate.current = sent.matchNumber;
        return sent;
      });
    };
    const onTable = (t) => {
      setWaiting(t);
      // A credit match is over and you staked for the next: back to the waiting table.
      if (t.mySeat != null) setGame(null);
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
    const reveal = late || !drewForDeal(game) || game.phase === PHASES.DRAW ? true : revealed === game.matchNumber;
    return (
      <KhuzurPlay
        game={game}
        mySeat={game.mySeat}
        table={shape}
        kicker={game.credit ? "CREDITS" : "ONLINE"}
        onMove={(move) => {
          socket.emit("khuzur_move", { lobbyId, move });
          return null;
        }}
        rejection={rejection}
        revealed={reveal || game.phase === PHASES.DRAW}
        skipDraw={late}
        onRevealed={setRevealed}
        playAgain={
          game.credit
            ? { label: "PLAY AGAIN", onClick: restake }
            : game.amHost
              ? { label: "PLAY AGAIN", onClick: () => socket.emit("request_rematch", { lobbyId }) }
              : { label: "HOST DEALS AGAIN", disabled: true }
        }
        onLeave={exit}
        online={{ messages, onSendChat: sendChat, chatLimit, reward: game.reward, credit: game.credit }}
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
 * The table, practice or online. game: the state shown (online, a redacted
 * view); mySeat: your seat (-1 watching); onMove(move) sends your move and
 * returns a reason if it was refused at once; revealed / onRevealed: whether
 * the draw for the deal's winning card has shown; playAgain: { label,
 * onClick, disabled }; online: chat, reward and credit result.
 */
function KhuzurPlay({ game, mySeat, table, kicker, onMove, rejection = null, revealed, skipDraw = false, onRevealed, playAgain, onLeave, online = null, faceFor }) {
  const { handW, compact, narrow } = useTableMetrics();
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

  const stage = !skipDraw && drewForDeal(game) && !(revealed && game.phase !== PHASES.DRAW) ? "draw" : "play";
  const me = game.players[mySeat] ?? { hand: [], out: true, team: -1 };
  const myTurn = stage === "play" && game.phase === PHASES.PLAY && game.turn === mySeat;
  const myDraw = game.phase === PHASES.DRAW && game.turn === mySeat;
  const over = game.phase === PHASES.MATCH_OVER;
  const handleRevealed = useCallback(() => onRevealed?.(game.matchNumber), [onRevealed, game.matchNumber]);

  const send = (move) => {
    const refused = onMove(move);
    if (refused) {
      setFailed({ game, text: refused });
      try {
        soundManager.playError?.();
      } catch {
        /* audio not ready */
      }
    } else setSelected([]);
  };

  useEffect(() => {
    if (!myTurn && !myDraw) return;
    try {
      soundManager.playTurnAlert?.();
    } catch {
      /* audio not ready */
    }
  }, [myTurn, myDraw, game.turn]);

  const hand = useMemo(() => [...me.hand].filter((c) => !c.hidden).sort((a, b) => cardPower(a, game.trumpSuit) - cardPower(b, game.trumpSuit)), [me.hand, game.trumpSuit]);
  const picked = hand.filter((card) => selected.includes(card.id));
  const toggle = (id) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const top = topLayer(game);
  const mode = myTurn ? (game.stack ? "beat" : "lead") : "wait";
  const limit = game.phase === PHASES.PLAY ? leadLimit(game) : 0;
  const reason = mode === "lead" ? leadReason(picked, limit) : mode === "beat" ? beatReason(picked, top, game.trumpSuit) : null;

  const n = game.players.length;
  const viewer = mySeat >= 0 ? mySeat : 0;
  const positionOfSeat = (seat) => positionOf(seat, viewer, n);
  const colorOf = (seat) => seatColor(table, seat);
  const nameOf = (seat) => game.players[seat]?.name ?? "";
  const placeOf = (seat) => game.places[game.players[seat].team];

  const seats = game.players
    .filter((p) => p.id !== mySeat)
    .map((p) => {
      const chips = [];
      const place = placeOf(p.id);
      if (place) chips.push({ label: ordinal(place), bg: place === 1 ? "#f4c430" : "#ead8b1" });
      else if (stage === "play" && game.turn === p.id) chips.push({ label: "TURN", bg: "#f4c430", blink: true });
      if (game.dealer === p.id && stage === "play") chips.push({ label: "DEALER", bg: "#5fd4d6" });
      if (teammates(table, mySeat, p.id)) chips.push({ label: "MATE", bg: colorOf(p.id) });
      return {
        seat: p.id,
        position: positionOfSeat(p.id),
        name: short(p.name),
        face: faceFor(p.id),
        color: colorOf(p.id),
        count: p.hand.length,
        chips,
        active: stage === "play" && game.turn === p.id,
        out: p.out,
      };
    });

  // The draw for the deal, over the felt.
  const draws = game.dealDraws ?? [];
  const latestBySeat = new Map();
  draws.forEach((d, i) => latestBySeat.set(d.seat, { key: `${game.matchNumber}-${i}`, seat: positionOfSeat(d.seat), card: d.card, depth: d.depth }));
  const drawOverlay =
    stage === "draw"
      ? ({ feltW, feltH, cardW }) => {
          const spots = {};
          for (let seat = 0; seat < n; seat++) {
            const pos = positionOfSeat(seat);
            const [x, y] = { bottom: [0, 0.32], bottomLeft: [-0.3, 0.2], left: [-0.34, 0], topLeft: [-0.24, -0.28], top: [0, -0.32], topRight: [0.24, -0.28], right: [0.34, 0], bottomRight: [0.3, 0.2] }[pos];
            spots[pos] = [Math.round(x * feltW), Math.round(y * feltH * 1.4)];
          }
          return (
            <DealDraw
              key={game.matchNumber}
              cw={cardW * 1.2}
              spots={spots}
              labelY={-Math.round(cardW * 1.4)}
              count={game.dealDeck?.length ?? 0}
              draws={[...latestBySeat.values()]}
              latest={draws.length ? `${game.matchNumber}-${draws.length - 1}` : null}
              preview={myDraw ? Math.min(depth, maxDrawDepth(game)) : 0}
              label={game.phase === PHASES.DRAW ? "DRAW FOR THE DEAL" : "HIGHEST CARD DEALS"}
              winner={game.phase === PHASES.DRAW ? null : positionOfSeat(game.dealer)}
              onDone={handleRevealed}
            />
          );
        }
      : null;

  // A surrender vote open on your team (online).
  const vote = online && me.team >= 0 ? game.votes?.[me.team] : null;
  const voters = (vote ?? []).filter((seat) => seat !== mySeat).map((seat) => short(nameOf(seat)));
  const iVoted = !!vote?.includes(mySeat);
  const humanMates = game.players.filter((p) => p.id !== mySeat && p.team === me.team && p.type === "HUMAN" && !p.out).length;

  // The status line over your hand.
  let status;
  if (game.phase === PHASES.DRAW) status = myDraw ? "Draw for the deal: pick how deep, then TAKE" : `${short(nameOf(game.turn))} is drawing for the deal`;
  else if (stage === "draw") status = `${short(nameOf(game.dealer))} deals`;
  else if (over) status = "The match is over";
  else if (mySeat < 0) status = "Watching";
  else if (me.out) status = `You're out in ${ordinal(placeOf(mySeat))} place. The rest play on.`;
  else if (myTurn) status = game.stack ? "Beat every top card, or pick the stack up" : "Your lead";
  else status = game.stack ? `${short(nameOf(game.turn))} must beat` : `${short(nameOf(game.turn))} leads`;
  const clockOn = online && game.turnDeadline && game.phase !== PHASES.MATCH_OVER && stage === "play";

  const rows = over
    ? standings(game).map(({ place, seats: s, team }) => ({
        place,
        names: s.map((seat) => short(nameOf(seat))),
        color: table.perTeam === 1 ? FFA_COLOR : TEAM_COLORS[team],
        mine: s.includes(mySeat),
      }))
    : [];
  const myPayout = online?.credit?.result?.payouts?.find((p) => p.seat === mySeat);

  const tableArea = (
    <main className="relative flex-1 min-h-0 flex flex-col items-center justify-between gap-2 px-3 pb-3 pt-2">
      <div className="font-pixel-display text-[10px] text-bone/70 self-start flex flex-wrap gap-x-3 gap-y-1 [&>span]:whitespace-nowrap">
        <span>MATCH {game.matchNumber}</span>
        <span>{table.perTeam === 1 ? `FREE FOR ALL · ${n} PLAYERS` : Array(table.teams).fill(table.perTeam).join(" V ")}</span>
        <span>{table.handSize}-CARD GAME</span>
        {online?.credit && <span className="text-glow-gold">POT {online.credit.pot}</span>}
      </div>
      <div className="flex-1 min-h-0 w-full max-w-[1200px] flex items-center justify-center">
        <KhuzurTable game={game} seats={seats} colorOf={colorOf} positionOfSeat={positionOfSeat} compact={narrow} overlay={drawOverlay} drawing={stage === "draw"} />
      </div>

      <div className="flex flex-col items-center gap-2 w-full max-w-[1100px]">
        {vote && !me.out && (
          <div role="status" className="flex flex-wrap items-center justify-center gap-2 px-3 py-2" style={{ backgroundColor: "#2a0e18", boxShadow: "0 0 0 3px #7a1530" }}>
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
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {mySeat >= 0 && (
            <span className="font-pixel-display text-[10px] px-2 py-1" style={{ backgroundColor: colorOf(mySeat), color: INK }}>
              YOU{table.perTeam > 1 ? " · TEAM" : ""}
              {game.dealer === mySeat && stage === "play" ? " · DEALER" : ""}
            </span>
          )}
          <span className="font-pixel-body text-[22px] text-parchment leading-none" aria-live="polite">
            {status}
          </span>
          {clockOn && <TurnClock deadline={game.turnDeadline} />}
        </div>
        {error && (
          <div role="alert" className="font-pixel-body text-[20px] px-3 py-1" style={{ backgroundColor: "#7a1530", color: "#ead8b1" }}>
            {error}
          </div>
        )}
        <Hand cards={hand} selected={selected} onToggle={toggle} cardW={handW} enabled={myTurn} />
        {myDraw && stage === "draw" ? (
          <div className="flex items-center gap-2">
            <DepthPicker depth={Math.min(depth, maxDrawDepth(game))} max={maxDrawDepth(game)} onChange={setDepth} />
            <button
              type="button"
              onClick={() => send({ type: "drawForDeal", depth: Math.min(depth, maxDrawDepth(game)) })}
              className="pixel-btn font-pixel-display text-[11px] px-4 py-2.5"
              style={{ backgroundColor: "#f4c430", borderColor: "#c89820", color: INK }}
            >
              TAKE
            </button>
          </div>
        ) : (
          <KhuzurControls
            mode={mode}
            canLead={mode === "lead" && reason === null}
            canBeat={mode === "beat" && reason === null}
            reason={reason}
            canSwap={mySeat >= 0 && canSwapSeven(game, mySeat) && stage === "play"}
            playing={game.phase === PHASES.PLAY && stage === "play" && mySeat >= 0 && !me.out && !iVoted}
            onLead={() => send({ type: "lead", cardIds: picked.map((c) => c.id) })}
            onBeat={() => send({ type: "beat", cardIds: picked.map((c) => c.id) })}
            onPickUp={() => send({ type: "pickUp" })}
            onSwap={() => send({ type: "swapSeven" })}
            onSurrender={() => setConfirming(true)}
          />
        )}
      </div>
    </main>
  );

  return (
    <div className="relative w-full h-screen starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TableHeader
        compact={compact}
        narrow={narrow}
        onExit={onLeave}
        title="KHUZUR"
        kicker={kicker}
        titleClass=""
        titleColor="#f08a4b"
        match={game.matchNumber}
        signal={<ConnectionSignal local={!online} connected={connected} ping={ping} />}
        rulesTone={{ bg: "#f08a4b", deep: "#a8552a", ink: INK }}
        onRules={() => setShowRules(true)}
        onSettings={() => setShowSettings(true)}
        onPanel={online ? () => setPanelOpen(true) : undefined}
      />

      {online ? (
        <div className="relative flex-1 grid min-h-0" style={{ gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1fr) 300px" }}>
          {tableArea}
          <TableSidebar compact={compact} open={panelOpen} onClose={() => setPanelOpen(false)}>
            <GameChat messages={online.messages} onSendMessage={online.onSendChat} {...online.chatLimit} />
          </TableSidebar>
        </div>
      ) : (
        tableArea
      )}

      {confirming && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(10,7,18,0.7)" }}>
          <div role="dialog" aria-label="SURRENDER?" className="flex flex-col gap-3 p-5 max-w-[92vw]" style={{ backgroundColor: "#14102a", border: "4px solid #7a1530", boxShadow: `0 0 0 4px ${INK}` }}>
            <p className="font-pixel-body text-[22px] text-parchment">
              Give up this match? {table.perTeam > 1 ? "Your team takes" : "You take"} the lowest place left
              {online && humanMates > 0 ? ", once every teammate agrees." : "."}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  send({ type: "surrender" });
                }}
                className="pixel-btn font-pixel-display text-[11px] px-4 py-2.5"
                style={{ backgroundColor: "#e85a7a", borderColor: "#a83a5a", color: INK }}
              >
                YES, SURRENDER
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="pixel-btn font-pixel-display text-[11px] px-4 py-2.5" style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}>
                KEEP PLAYING
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
      {showRules && <KhuzurRules onClose={() => setShowRules(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
