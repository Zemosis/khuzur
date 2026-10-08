// POKER TABLE PAGE — practice against five CPUs in the browser, or an online
// table driven by the server's poker_state. Both draw the same PokerScreen:
// the oval with the other five seats, your cards and stack under it, and the
// bet controls; the sidebar holds the scoreboard, chat and the hand log.
//
// Practice runs a PokerTable (utils/poker/table.js) right here, with no turn
// clock. Online, every state is applied as it arrives: the server already
// paces CPU moves and all-in boards.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useServerStats } from "../../hooks/useServerStats";
import { useChatLimit } from "../../hooks/useChatLimit";
import { useChatBubbles } from "../../hooks/useChatBubbles";
import { useTurnTitle } from "../../hooks/useTurnTitle";
import { useTableMetrics } from "../../hooks/useTableMetrics";
import { useUnread } from "../../hooks/useUnread";
import { socket, connectSocket } from "../../utils/socket";
import { seatAvatar } from "../../utils/avatarConstants";
import TurnBanner from "../../components/TurnBanner";
import YourTurnMark from "../../components/YourTurnMark";
import ChatBubble from "../../components/ChatBubble";
import GameChat from "../../components/thirteen/GameChat";
import { TableHeader, TableSidebar, ConnectionSignal } from "../../components/TableChrome";
import { PixelCard } from "../../components/PixelCard";
import OvalTable from "../../components/poker/OvalTable";
import PokerSeat from "../../components/poker/PokerSeat";
import { seatTags } from "../../components/poker/seatInfo";
import BetControls from "../../components/poker/BetControls";
import PokerScoreBoard from "../../components/poker/PokerScoreBoard";
import PokerRules from "../../components/poker/PokerRules";
import { PokerTable } from "../../utils/poker/table";
import { MAX_SEATS, PHASES, potSize, viewFor } from "../../utils/poker/engine";
import { buildPots } from "../../utils/poker/pots";
import { evaluate } from "../../utils/poker/hands";
import { eventLine } from "../../utils/poker/log";

const CPUS = [
  { name: "Bot Saturn", variant: 2 },
  { name: "Bot Venus", variant: 3 },
  { name: "Bot Mars", variant: 4 },
  { name: "Bot Jupiter", variant: 5 },
  { name: "Bot Mercury", variant: 1 },
];
const AVATAR_COLOR = { 1: "#f4c430", 2: "#5fd4d6", 3: "#e85a7a", 4: "#9bd14f", 5: "#c5a8ff", custom: "#ead8b1" };
const LEVEL_COLOR = { EASY: "#9bd14f", MEDIUM: "#f4c430", HARD: "#e85a7a" };
const short = (name = "") => name.split(" #")[0];
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const running = (phase) => phase === PHASES.BETTING || phase === PHASES.RUNOUT;
const EXTRA_BTN = "pixel-btn font-pixel-display text-[11px] px-4 py-3 whitespace-nowrap";

export default function GamePoker() {
  const { lobbyId, playerName, aiDifficulty = "MEDIUM" } = useLocation().state || {};
  const isSolo = !lobbyId || lobbyId.startsWith("SOLO-");
  return isSolo ? <PracticePoker playerName={playerName} level={aiDifficulty} /> : <OnlinePoker lobbyId={lobbyId} playerName={playerName} />;
}

/** Practice: you in seat 0 against five CPUs, the table running in the browser, no turn clock. */
function PracticePoker({ playerName, level }) {
  const navigate = useNavigate();
  const { identity } = useAuth();
  const [view, setView] = useState(null);
  const [messages, setMessages] = useState([]);
  const [warning, setWarning] = useState(null);
  const tableRef = useRef(null);
  const myName = short(playerName || identity?.name || "You");

  useEffect(() => {
    const table = new PokerTable({ delays: { turn: null }, onState: (t) => setView(viewFor(t.state, 0)) });
    table.sit({ name: myName, type: "HUMAN" });
    for (const cpu of CPUS) table.sit({ name: cpu.name, type: "AI", level });
    table.start();
    tableRef.current = table;
    return () => table.destroy();
    // One table per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = (result) => setWarning(result.ok ? null : result.error);
  const actions = {
    move: (m) => answer(tableRef.current.move(0, m)),
    rebuy: () => answer(tableRef.current.rebuy(0)),
    sitIn: () => answer(tableRef.current.sitIn(0)),
    exit: () => navigate("/lobby-poker"),
    sendChat: (text) =>
      text.trim() && setMessages((m) => [...m, { id: `msg-${Date.now()}-${m.length}`, type: "CHAT", sender: myName, text: text.trim(), timestamp: now(), isMe: true }]),
  };
  if (!view) return null;
  return <PokerScreen view={view} practice={level} actions={actions} messages={messages} setMessages={setMessages} warning={warning} />;
}

/** Online: joins the table and draws each poker_state the server sends. */
function OnlinePoker({ lobbyId, playerName }) {
  const navigate = useNavigate();
  const { identity } = useAuth();
  const [view, setView] = useState(null);
  const [messages, setMessages] = useState([]);
  const [rejection, setRejection] = useState(null);
  const [fatal, setFatal] = useState("");
  const chatLimit = useChatLimit();
  const seenRef = useRef(0);

  useEffect(() => {
    const join = () => {
      socket.emit("join_lobby", { lobbyId, playerName });
      socket.emit("check_game_status", { lobbyId });
    };
    const onState = (v) => {
      seenRef.current += 1;
      // `received` restarts the turn clock's bar at the time left on arrival.
      setView({ ...v, received: seenRef.current });
      setRejection(null);
    };
    const onChat = (msg) => setMessages((m) => [...m, { ...msg, isMe: msg.sender === playerName }]);
    const onRejected = ({ reason } = {}) => setRejection(reason || "Move rejected");
    const onError = (msg) => {
      if (!seenRef.current) setFatal(String(msg || "Lobby not found"));
    };
    // Sat out too long, or the host closed the table.
    const onLeft = () => navigate("/lobby-poker");
    socket.on("connect", join);
    socket.on("poker_state", onState);
    socket.on("receive_chat", onChat);
    socket.on("move_rejected", onRejected);
    socket.on("error_message", onError);
    socket.on("table_left", onLeft);
    connectSocket(identity).then(() => {
      if (socket.connected) join();
    });
    return () => {
      socket.off("connect", join);
      socket.off("poker_state", onState);
      socket.off("receive_chat", onChat);
      socket.off("move_rejected", onRejected);
      socket.off("error_message", onError);
      socket.off("table_left", onLeft);
      // Left without EXIT (browser Back): the seat is held for the grace period.
      socket.emit("leave_page", { lobbyId });
    };
    // One join per table; identity and name are fixed for the visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId]);

  const emit = (event, extra = {}) => socket.emit(event, { lobbyId, ...extra });
  const actions = {
    move: (move) => emit("poker_move", { move }),
    rebuy: () => emit("poker_rebuy"),
    sitIn: () => emit("poker_sit_in"),
    start: () => emit("start_game"),
    addCpu: (seat) => emit("add_cpu", { seat, level: "MEDIUM" }),
    removeCpu: (seat) => emit("remove_cpu", { seat }),
    close: () => emit("close_table"),
    exit: () => {
      emit("leave_lobby");
      navigate("/");
    },
    sendChat: (text) => text.trim() && emit("send_chat", { message: text.trim() }),
  };

  if (view) return <PokerScreen view={view} online={{ lobbyId, chatLimit }} actions={actions} messages={messages} setMessages={setMessages} warning={rejection} />;
  return (
    <div className="flex flex-col items-center justify-center gap-5 h-full starfield font-pixel-body text-parchment text-center px-4" style={{ position: "fixed", inset: 0 }}>
      {fatal ? (
        <>
          <div className="font-pixel-display text-[14px]" style={{ color: "#e85a7a" }}>
            CAN'T OPEN THIS TABLE
          </div>
          <div className="font-pixel-body text-[22px] text-bone/80">{fatal}</div>
          <button
            onClick={() => navigate("/lobby-poker")}
            className="pixel-btn font-pixel-display text-[10px] px-4 py-3"
            style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}
          >
            GO TO POKER LOBBY
          </button>
        </>
      ) : (
        <div className="font-pixel-display text-[14px] text-glow-gold blink">JOINING TABLE...</div>
      )}
    </div>
  );
}

/** Each new event of the hand becomes a line in the LOG tab. */
function usePokerLog(view, setMessages) {
  const logged = useRef({ hand: null, count: 0 });
  useEffect(() => {
    const from = logged.current.hand === view.handNumber ? logged.current.count : 0;
    logged.current = { hand: view.handNumber, count: view.events.length };
    const fresh = view.events
      .slice(from)
      .map((e, i) => ({ text: eventLine(e, view.seats), seat: e.seat, n: from + i }))
      .filter((l) => l.text);
    if (!fresh.length) return;
    setMessages((m) => [
      ...m,
      ...fresh.map((l) => ({ id: `log-${view.handNumber}-${l.n}`, type: "SYSTEM", text: l.text, playerIndex: l.seat, timestamp: now() })),
    ]);
  }, [view, setMessages]);
}

/** The pots to show: the paid pots once the hand is over, else what's been collected so far. */
function potsOf(view) {
  if (view.phase === PHASES.HAND_OVER) return view.result.pots;
  if (!running(view.phase)) return [];
  return buildPots(
    view.seats.map((p) => (p ? p.committed - p.bet : 0)),
    view.seats.map((p) => !!p?.inHand && !p.folded),
  );
}

function PokerScreen({ view, practice = null, online = null, actions, messages, setMessages, warning }) {
  const { identity } = useAuth();
  const { handW, deckW, compact, narrow, seats: layout } = useTableMetrics();
  const { connected, ping } = useServerStats({ enabled: !!online });
  const [panelOpen, setPanelOpen] = useState(false);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const [showRules, setShowRules] = useState(false);
  const closeRules = useCallback(() => setShowRules(false), []);
  const unread = useUnread(messages, panelOpen);
  const bubbles = useChatBubbles(messages);
  usePokerLog(view, setMessages);

  const me = Math.max(0, view.mySeat);
  const mine = view.seats[view.mySeat] || null;
  const myTurn = !!view.legal;
  useTurnTitle(myTurn);
  const inPlay = running(view.phase);
  const isHost = !!online && !!view.amHost;
  const started = !online || view.started;

  const faceFor = (seat) =>
    seat === view.mySeat
      ? { variant: identity?.avatar ?? 1, customAvatarData: identity?.customAvatar }
      : practice
        ? { variant: CPUS[seat - 1]?.variant ?? 1, customAvatarData: null }
        : seatAvatar(view.seats[seat], seat);
  const colorFor = (seat) => (view.seats[seat] ? AVATAR_COLOR[faceFor(seat).variant] : null) || "#ead8b1";
  const avatarFor = (msg) => (msg.isMe ? faceFor(view.mySeat) : faceFor(Math.max(0, view.seats.findIndex((p) => p?.name === msg.sender))));

  const blindOf = Object.fromEntries(view.events.filter((e) => e.type === "blind").map((e) => [e.seat, e.kind === "small" ? "SB" : "BB"]));
  const over = view.phase === PHASES.HAND_OVER;
  const winners = new Set(over ? view.result.won.flatMap((w, seat) => (w > 0 ? [seat] : [])) : []);
  const best = over ? [...winners].flatMap((seat) => view.result.hands[seat]?.best ?? []) : [];
  const tagsFor = (seat) => seatTags(view.seats[seat], { isButton: view.button === seat && (inPlay || over), blind: inPlay ? blindOf[seat] : null, phase: view.phase });

  const banner = over
    ? [...winners].map((seat) => `${short(view.seats[seat]?.name)} wins ${view.result.won[seat]}${view.result.hands[seat] ? ` · ${view.result.hands[seat].label}` : ""}`).join("  ·  ")
    : view.phase === PHASES.WAITING
      ? started
        ? "Waiting for players…"
        : isHost
          ? "Add CPUs or wait for players, then START"
          : "Waiting for the host to start"
      : null;
  const message = myTurn
    ? view.legal.canCheck
      ? "Your turn: check or bet"
      : `Your turn: ${view.legal.toCall} to call`
    : view.turn != null
      ? `Waiting for ${short(view.seats[view.turn]?.name)}…`
      : view.phase === PHASES.RUNOUT
        ? "All-in: the board runs out"
        : over
          ? "Next hand soon…"
          : banner || "";

  const seatNode = (seat) => {
    const p = view.seats[seat];
    const bubble = p ? bubbles.bubbleFor(p.name) : null;
    return (
      <div className="relative">
        {bubble && <ChatBubble name={short(p.name)} lines={bubble} tail={layout === "strip" ? "up" : "down"} gap={layout === "strip" ? 14 : 40} />}
        <PokerSeat
          player={p}
          face={p ? faceFor(seat) : null}
          tags={p ? tagsFor(seat) : []}
          isTurn={view.turn === seat}
          clockMs={view.turn === seat ? (view.turnMsLeft ?? null) : null}
          clockKey={`${view.received}-${view.turn}`}
          best={best}
          winner={winners.has(seat)}
          cardWidth={layout === "full" ? 40 : 30}
          small={layout !== "full"}
          isHost={isHost}
          onAddCpu={isHost ? () => actions.addCpu(seat) : undefined}
          onRemoveCpu={isHost ? () => actions.removeCpu(seat) : undefined}
        />
      </div>
    );
  };
  const others = Object.fromEntries([1, 2, 3, 4, 5].map((rel) => [rel, seatNode((me + rel) % MAX_SEATS)]));
  const bets = Object.fromEntries(view.seats.map((p, seat) => [(seat - me + MAX_SEATS) % MAX_SEATS, inPlay && p ? p.bet : 0]));
  const myHand = mine?.inHand && !mine.folded && mine.hole.every((c) => c.id) ? evaluate([...mine.hole, ...view.board]).name : null;

  return (
    <div className="relative w-full h-full font-pixel-body text-parchment overflow-hidden flex flex-col" style={{ position: "fixed", inset: 0 }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, #123526 0%, #14102a 60%, #0a0712 100%)" }} />
      <TableHeader
        compact={compact}
        narrow={narrow}
        onExit={actions.exit}
        badge={
          <span
            className="font-pixel-display text-[10px] leading-none px-1.5 py-1 whitespace-nowrap"
            style={{ backgroundColor: online ? "#5fd4d6" : LEVEL_COLOR[practice] || "#f4c430", color: "#1a1024", boxShadow: "0 0 0 2px #0a0712" }}
          >
            {online ? `ONLINE · #${online.lobbyId.replace(/^PUB-/, "")}` : `PRACTICE · ${practice}`}
          </span>
        }
        title="POKER"
        titleColor="#9bd14f"
        round={view.handNumber || "–"}
        signal={<ConnectionSignal local={!online} connected={connected} ping={ping} />}
        rulesTone={{ bg: "#9bd14f", deep: "#6a9a30", ink: "#1a3a0e" }}
        onRules={() => setShowRules(true)}
        onPanel={() => setPanelOpen(true)}
        unread={unread}
      />
      {showRules && <PokerRules onClose={closeRules} />}

      <div className="relative flex-1 grid min-h-0" style={{ gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1fr) 300px" }}>
        <div className={`relative flex flex-col min-h-0 ${narrow ? "px-2 pt-4 pb-2" : "px-4 py-2"}`}>
          <OvalTable layout={layout} seats={others} bets={bets} board={view.board} pots={potsOf(view)} banner={banner} cardWidth={deckW}>
            <TurnBanner active={myTurn} />
          </OvalTable>

          {/* Your seat: your cards, stack and hand, marked on your turn. */}
          <div className="relative mt-2" data-your-turn={myTurn ? "true" : undefined}>
            {myTurn && <YourTurnMark />}
            {mine && (
              <div className="flex items-end justify-center gap-4 pt-4 pb-2">
                <div className="flex" aria-label="Your cards">
                  {mine.hole.map((c, i) =>
                    c.id ? (
                      <PixelCard key={c.id} rank={c.rank} suit={c.suit} width={handW} style={{ marginLeft: i ? -handW * 0.3 : 0, boxShadow: best.includes(c.id) ? "0 0 0 3px #9bd14f" : undefined }} />
                    ) : null,
                  )}
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex gap-1 flex-wrap">
                    {tagsFor(view.mySeat).map((t) => (
                      <span key={t.label} className="font-pixel-display text-[9px] leading-none px-1.5 py-1" style={{ backgroundColor: t.bg, color: t.fg || "#1a1024", boxShadow: "0 0 0 2px #0a0712" }}>
                        {t.label}
                      </span>
                    ))}
                  </div>
                  <div className="font-pixel-display text-[12px] text-parchment">
                    YOU <span className="text-glow-gold tabular-nums">{mine.stack}</span>
                  </div>
                  {myHand && <div className="font-pixel-body text-[20px] leading-none text-bone/80">{myHand}</div>}
                </div>
              </div>
            )}
          </div>

          <BetControls legal={view.legal} pot={potSize(view)} currentBet={view.currentBet} onMove={actions.move} message={message} warning={warning} compact={narrow}>
            {isHost && !view.started && (
              <button className={EXTRA_BTN} style={{ backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#1a3a0e" }} onClick={actions.start}>
                START
              </button>
            )}
            {mine && mine.stack === 0 && !(inPlay && mine.inHand && !mine.folded) && (
              <button className={EXTRA_BTN} style={{ backgroundColor: "#f4c430", borderColor: "#c89820", color: "#1a1024" }} onClick={actions.rebuy}>
                REBUY
              </button>
            )}
            {mine?.sittingOut && mine.stack > 0 && (
              <button className={EXTRA_BTN} style={{ backgroundColor: "#5fd4d6", borderColor: "#2a8a8c", color: "#0a3a3a" }} onClick={actions.sitIn}>
                I'M BACK
              </button>
            )}
            {isHost && (
              <button className={EXTRA_BTN} style={{ backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" }} onClick={actions.close}>
                CLOSE TABLE
              </button>
            )}
          </BetControls>
        </div>

        <TableSidebar compact={compact} open={panelOpen} onClose={closePanel}>
          <PokerScoreBoard seats={view.seats} running={inPlay} turn={view.turn} mySeat={view.mySeat} faceFor={faceFor} blinds={`${view.smallBlind}/${view.bigBlind}`} />
          <GameChat messages={messages} onSendMessage={actions.sendChat} avatarFor={avatarFor} colorFor={colorFor} {...online?.chatLimit} />
        </TableSidebar>
      </div>
    </div>
  );
}
