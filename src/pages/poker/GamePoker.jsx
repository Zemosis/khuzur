// POKER TABLE PAGE — practice against five CPUs in the browser, or an online
// table driven by the server's poker_state. Both draw the same PokerScreen:
// the oval with the other five seats around it and yours at its bottom edge,
// and the bet controls under it; the sidebar holds the scoreboard, chat and the hand log.
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
import { CARD_RATIO, useTableMetrics } from "../../hooks/useTableMetrics";
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
import { LEVEL_COLOR, actingOrder, ordinal, seatTags } from "../../components/poker/seatInfo";
import BetControls from "../../components/poker/BetControls";
import PokerScoreBoard from "../../components/poker/PokerScoreBoard";
import PokerRules from "../../components/poker/PokerRules";
import { useMuck } from "../../components/poker/cardMotion";
import Countdown from "../../components/poker/Countdown";
import { PokerTable } from "../../utils/poker/table";
import { MAX_SEATS, PHASES, potSize, viewFor } from "../../utils/poker/engine";
import { buildPots } from "../../utils/poker/pots";
import { evaluate } from "../../utils/poker/hands";
import { eventEntry } from "../../utils/poker/log";
import BuyInPanel from "../../components/credits/BuyInPanel";
import Modal from "../../components/credits/Modal";
import { useCredits } from "../../hooks/useCredits";
import { TIERS, buyInRange, fmt, topUpRange } from "../../utils/poker/tiers";

const CPUS = [
  { name: "Bot Saturn", variant: 2 },
  { name: "Bot Venus", variant: 3 },
  { name: "Bot Mars", variant: 4 },
  { name: "Bot Jupiter", variant: 5 },
  { name: "Bot Mercury", variant: 1 },
];
const AVATAR_COLOR = { 1: "#f4c430", 2: "#5fd4d6", 3: "#e85a7a", 4: "#9bd14f", 5: "#c5a8ff", custom: "#ead8b1" };
const short = (name = "") => name.split(" #")[0];
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const running = (phase) => phase === PHASES.BETTING || phase === PHASES.RUNOUT;
const EXTRA_BTN = "pixel-btn font-pixel-display text-[11px] px-4 py-3 whitespace-nowrap";
// Where each seat's chat bubble opens (by seat relative to you, see
// OvalTable), into space no other seat uses, as in Muushig: the upper side
// seats' toward the middle, the lower side seats' below, the top seat's to
// its left (its cards are on its right). On a phone they open below the
// strip, the end seats' lined up with their outer edge.
const BUBBLE_AT = {
  1: { side: "below", align: "center" },
  2: { side: "right", align: "start" },
  3: { side: "left", align: "start" },
  4: { side: "left", align: "start" },
  5: { side: "below", align: "center" },
};
const STRIP_ALIGN = { 1: "start", 5: "end" };

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
    const table = new PokerTable({ delays: { turn: null }, onState: (t) => setView(withNextHand(viewFor(t.state, 0), t.nextHandMsLeft())) });
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
  const tierRef = useRef(null); // a credit table's tier, so leaving lands on the lobby's CREDITS tab
  const { credits, refresh: refreshCredits } = useCredits({ enabled: false });
  // The buy-in panel at a credit table: { mode: "sit" | "add" | "rebuy", tier, tableName?, busy, error }.
  const [buyIn, setBuyIn] = useState(null);
  const buyInRef = useRef(null); // the socket handlers read the panel without re-subscribing
  useEffect(() => {
    buyInRef.current = buyIn;
  }, [buyIn]);

  useEffect(() => {
    const join = () => {
      socket.emit("join_lobby", { lobbyId, playerName });
      socket.emit("check_game_status", { lobbyId });
    };
    const onState = (v) => {
      seenRef.current += 1;
      // `received` restarts the turn clock's bar at the time left on arrival.
      setView(withNextHand({ ...v, received: seenRef.current }, v.nextHandMsLeft));
      tierRef.current = v.tier ?? null;
      setRejection(null);
      if (v.mySeat >= 0 && v.seats[v.mySeat]) setBuyIn((b) => (b?.mode === "sit" ? null : b));
    };
    const onChat = (msg) => setMessages((m) => [...m, { ...msg, isMe: msg.sender === playerName }]);
    const onRejected = ({ reason } = {}) => setRejection(reason || "Move rejected");
    const onError = (msg) => {
      if (buyInRef.current) return setBuyIn((b) => b && { ...b, busy: false, error: String(msg) });
      if (!seenRef.current) setFatal(String(msg || "Lobby not found"));
    };
    // Back here without a seat (left, or stood up): sit down again with a buy-in.
    const onTableInfo = ({ name, tier }) => {
      refreshCredits();
      setBuyIn({ mode: "sit", tier, tableName: name, busy: false, error: "" });
    };
    // Sat out too long, or the host closed the table.
    const onLeft = () => navigate("/lobby-poker", tierRef.current ? { state: { tab: "credits" } } : undefined);
    socket.on("connect", join);
    socket.on("poker_state", onState);
    socket.on("receive_chat", onChat);
    socket.on("move_rejected", onRejected);
    socket.on("error_message", onError);
    socket.on("table_left", onLeft);
    socket.on("credit_table_info", onTableInfo);
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
      socket.off("credit_table_info", onTableInfo);
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
    addCpu: (seat, level) => emit("add_cpu", { seat, level }),
    removeCpu: (seat) => emit("remove_cpu", { seat }),
    close: () => emit("close_table"),
    // Leaving a credit table goes back to the poker lobby, where the CREDITS tab is.
    exit: () => {
      emit("leave_lobby");
      if (view?.tier) navigate("/lobby-poker", { state: { tab: "credits" } });
      else navigate("/");
    },
    sendChat: (text) => text.trim() && emit("send_chat", { message: text.trim() }),
    addChips: (amount) => emit("poker_add_chips", { amount }),
    openBuyIn: (mode) => {
      refreshCredits();
      setBuyIn({ mode, tier: view.tier, busy: false, error: "" });
    },
  };

  const mine = view?.seats[view.mySeat];
  const panel = buyIn && credits && (
    <BuyInPanel
      tier={buyIn.tier}
      tableName={buyIn.tableName}
      mode={buyIn.mode}
      balance={credits.balance}
      range={
        buyIn.mode === "sit"
          ? buyInRange(buyIn.tier, credits.balance, credits.rathole?.[buyIn.tier])
          : topUpRange(buyIn.tier, credits.balance, (mine?.stack ?? 0) + (mine?.pending ?? 0))
      }
      rathole={buyIn.mode === "sit" ? credits.rathole?.[buyIn.tier] : null}
      busy={buyIn.busy}
      error={buyIn.error}
      onConfirm={(amount) => {
        if (buyIn.mode === "sit") {
          setBuyIn((b) => ({ ...b, busy: true, error: "" }));
          socket.emit("join_lobby", { lobbyId, playerName, buyIn: amount });
        } else {
          setBuyIn(null); // a refusal shows in the status line
          actions.addChips(amount);
        }
      }}
      onCancel={() => setBuyIn(null)}
    />
  );

  if (view)
    return (
      <>
        <PokerScreen view={view} online={{ lobbyId, chatLimit }} actions={actions} messages={messages} setMessages={setMessages} warning={rejection} />
        {panel}
      </>
    );
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
      {panel}
    </div>
  );
}

/**
 * What a hand was made of, to read under its rank: "Two pair, queens and
 * fours" → "queens and fours", "Pair of fours" → "of fours", "High card,
 * king" → "king high".
 */
function handDetail(name) {
  if (name.startsWith("Pair of ")) return name.slice(5);
  if (name.startsWith("High card, ")) return `${name.slice(11)} high`;
  return name.includes(", ") ? name.slice(name.indexOf(", ") + 2) : null;
}

/** The view plus `nextHandAt`: when the next hand deals (a Date.now() time), or null. */
function withNextHand(view, msLeft) {
  return { ...view, nextHandAt: msLeft == null ? null : Date.now() + msLeft };
}

/** Each new event of the hand becomes an entry in the LOG tab. */
function usePokerLog(view, setMessages) {
  const logged = useRef({ hand: null, count: 0 });
  useEffect(() => {
    const from = logged.current.hand === view.handNumber ? logged.current.count : 0;
    logged.current = { hand: view.handNumber, count: view.events.length };
    const fresh = view.events
      .slice(from)
      .map((e, i) => ({ entry: eventEntry(e, view.seats), seat: e.seat, n: from + i }))
      .filter((l) => l.entry);
    if (!fresh.length) return;
    setMessages((m) => [
      ...m,
      ...fresh.map((l) => ({ id: `log-${view.handNumber}-${l.n}`, type: "SYSTEM", ...l.entry, playerIndex: l.seat, timestamp: now() })),
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
  const inPlay = running(view.phase);
  // A hand seen from its start is shuffled and dealt round the table (see
  // OvalTable). Until its cards land nobody's turn shows: no glow, no bet
  // buttons, no hand name.
  const fresh = inPlay && !view.events.some((e) => e.type === "act");
  const [seenHand, setSeenHand] = useState(view.handNumber);
  const [dealKey, setDealKey] = useState(null);
  const [dealtKey, setDealtKey] = useState(null);
  if (view.handNumber !== seenHand) {
    setSeenHand(view.handNumber);
    setDealKey(fresh ? view.handNumber : null);
  }
  const dealing = inPlay && dealKey != null && dealtKey !== dealKey;
  const legal = dealing ? null : view.legal;
  const myTurn = !!legal;
  useTurnTitle(myTurn);
  const isHost = !!online && !!view.amHost;
  const started = !online || view.started;
  const tier = online ? (view.tier ?? null) : null; // a credit table
  const limits = tier ? TIERS[tier] : null;
  const [confirmLeave, setConfirmLeave] = useState(false);
  const live = !!mine && inPlay && mine.inHand && !mine.folded; // you're in the hand being played
  const held = mine ? mine.stack + mine.pending : 0;

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
  const tagsFor = (seat) => seatTags(view.seats[seat], { phase: view.phase });
  // Everyone still to act this round after the player on turn: 2ND, 3RD…
  const placeOf = dealing ? {} : Object.fromEntries(actingOrder(view).map((seat, i) => [seat, i ? ordinal(i + 1) : null]));

  // Everyone's seated and the first hand is coming: it's counted down on the felt.
  const firstHandAt = view.phase === PHASES.WAITING ? view.nextHandAt : null;
  // Once a hand is over, each winner with what they won and with what (when shown).
  const result = over
    ? [...winners].map((seat) => {
        const shown = view.result.hands[seat];
        return { name: short(view.seats[seat]?.name), amount: view.result.won[seat], label: shown?.label ?? null, detail: shown ? handDetail(shown.name) : null };
      })
    : null;
  const banner = over
    ? null
    : view.phase === PHASES.WAITING
      ? firstHandAt != null
        ? null
        : started
        ? "Waiting for players…"
        : isHost
          ? "Add CPUs or wait for players, then START"
          : "Waiting for the host to start"
      : null;
  const message = dealing
    ? "Shuffling and dealing…"
    : myTurn
    ? legal.canCheck
      ? "Your turn: check or bet"
      : `Your turn: ${legal.toCall} to call`
    : view.saving
      ? "Saving…"
      : view.closingAfterHand
        ? "Table closing after this hand"
        : mine?.waitingForBB
          ? "Waiting for the big blind to reach you"
    : view.turn != null
      ? `Waiting for ${short(view.seats[view.turn]?.name)}…`
      : view.phase === PHASES.RUNOUT
        ? "All-in: the board runs out"
        : view.nextHandAt != null
          ? <Countdown endsAt={view.nextHandAt}>{(n) => (n > 0 ? `${over ? "Next" : "First"} hand in ${n}…` : "Shuffling…")}</Countdown>
          : over
            ? "Next hand soon…"
            : banner || "";

  const seatNode = (rel, position) => {
    const seat = (me + rel) % MAX_SEATS;
    const p = view.seats[seat];
    const bubble = p ? bubbles.bubbleFor(p.name) : null;
    const place = layout === "strip" ? { side: "below", align: STRIP_ALIGN[rel] ?? "center" } : BUBBLE_AT[rel];
    return (
      <div className="relative">
        {bubble && <ChatBubble name={short(p.name)} lines={bubble} {...place} />}
        <PokerSeat
          player={p}
          face={p ? faceFor(seat) : null}
          tags={p ? tagsFor(seat) : []}
          isTurn={!dealing && view.turn === seat}
          rel={rel}
          place={placeOf[seat] ?? null}
          clockMs={!dealing && view.turn === seat ? (view.turnMsLeft ?? null) : null}
          clockKey={`${view.received}-${view.turn}`}
          best={best}
          winner={winners.has(seat)}
          layout={layout}
          position={position}
          isHost={isHost}
          onAddCpu={isHost && !tier ? (level) => actions.addCpu(seat, level) : undefined}
          onRemoveCpu={isHost ? () => actions.removeCpu(seat) : undefined}
        />
      </div>
    );
  };
  const relOf = (seat) => (seat - me + MAX_SEATS) % MAX_SEATS;
  // This street's bets; before the flop the blinds' chips say SB / BB.
  const bets = Object.fromEntries(
    view.seats.map((p, seat) => [relOf(seat), { amount: inPlay && p ? p.bet : 0, label: view.street === "PREFLOP" ? (blindOf[seat] ?? null) : null }]),
  );
  const dealer = (inPlay || over) && view.button != null ? { rel: relOf(view.button), seat: view.button } : null;
  // Dealt from the button's left.
  const deal = dealKey != null && dealer ? { key: dealKey, order: [1, 2, 3, 4, 5, 6].map((k) => (dealer.rel + k) % MAX_SEATS) } : null;
  const myHand = !dealing && mine?.inHand && !mine.folded && mine.hole.every((c) => c.id) ? evaluate([...mine.hole, ...view.board]).name : null;

  return (
    <div className="relative w-full h-full font-pixel-body text-parchment overflow-hidden flex flex-col" style={{ position: "fixed", inset: 0 }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, #123526 0%, #14102a 60%, #0a0712 100%)" }} />
      <TableHeader
        compact={compact}
        narrow={narrow}
        onExit={tier ? () => setConfirmLeave(true) : actions.exit}
        badge={
          <span
            className="font-pixel-display text-[10px] leading-none px-1.5 py-1 whitespace-nowrap"
            style={{ backgroundColor: online ? "#5fd4d6" : LEVEL_COLOR[practice] || "#f4c430", color: "#1a1024", boxShadow: "0 0 0 2px #0a0712" }}
          >
            {online
              ? tier
                ? `${tier} ${limits.smallBlind}/${limits.bigBlind} · #${online.lobbyId.replace(/^PUB-/, "")}`
                : `ONLINE · #${online.lobbyId.replace(/^PUB-/, "")}`
              : `PRACTICE · ${practice}`}
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
        <div className={`relative flex flex-col gap-2 min-h-0 ${narrow ? "px-2 pt-4 pb-2" : layout === "row" ? "px-4 pt-3 pb-2" : "px-4 pt-6 pb-2"}`}>
          <OvalTable
            layout={layout}
            seat={seatNode}
            bets={bets}
            dealer={dealer}
            board={view.board}
            best={best}
            pots={potsOf(view)}
            deal={deal}
            onDealt={setDealtKey}
            muck={view.seats.filter((p) => p?.inHand && p.folded).length * 2}
            countdown={firstHandAt}
            banner={banner}
            result={result}
            cardWidth={Math.min(deckW, 40)}
            heroWidth={layout === "strip" ? Math.min(handW, 76) : layout === "row" ? 40 : Math.min(Math.round(handW * 0.85), 104)}
            hero={(cardW, cramped) => (
              <YourSeat
                mine={mine}
                cardW={cardW}
                myTurn={myTurn}
                place={placeOf[view.mySeat]}
                tags={mine ? tagsFor(view.mySeat) : []}
                best={best}
                winner={winners.has(view.mySeat)}
                hand={myHand}
                bubble={bubbles.mine}
                small={layout === "strip"}
                cramped={cramped}
              />
            )}
          >
            <TurnBanner active={myTurn} />
          </OvalTable>

          <BetControls legal={legal} pot={potSize(view)} currentBet={view.currentBet} onMove={actions.move} message={message} warning={warning} compact={narrow} short={layout === "row"}>
            {isHost && !view.started && (
              <button className={EXTRA_BTN} style={{ backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#1a3a0e" }} onClick={actions.start}>
                START
              </button>
            )}
            {mine && held === 0 && !live && (
              <button className={EXTRA_BTN} style={{ backgroundColor: "#f4c430", borderColor: "#c89820", color: "#1a1024" }} onClick={tier ? () => actions.openBuyIn("rebuy") : actions.rebuy}>
                REBUY
              </button>
            )}
            {tier && mine && mine.stack > 0 && !live && held < limits.maxBuyIn && (
              <button className={EXTRA_BTN} style={{ backgroundColor: "#9bd14f", borderColor: "#6a9a30", color: "#1a3a0e" }} onClick={() => actions.openBuyIn("add")}>
                ADD CHIPS
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
      {confirmLeave && (
        <Modal title="Leave the table?" icon="back" deep="#7a1530" onClose={() => setConfirmLeave(false)}>
          <p className="font-pixel-body text-[22px] text-bone leading-tight">
            {live && mine.allIn
              ? "You're all-in: the hand plays out, and whatever it wins goes to your balance."
              : `${live ? "Your hand folds. " : ""}Your ${fmt(held)} credits go back to your balance.`}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button className={`${EXTRA_BTN} uppercase`} style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }} onClick={() => setConfirmLeave(false)}>
              Stay
            </button>
            <button className={`${EXTRA_BTN} uppercase`} style={{ backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" }} onClick={actions.exit}>
              Leave
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Your hand under the felt: your two cards (a folded hand flies to the
 * muck), beside them your tags, stack and hand. Its box keeps its size,
 * empty between hands. Marked on your turn, as in the other games (not when
 * `cramped`: the bar's gold status line says it).
 */
function YourSeat({ mine, cardW, myTurn, place, tags, best, winner, hand, bubble, small, cramped = false }) {
  const cardH = Math.round(cardW * CARD_RATIO);
  const holding = !!mine?.inHand && !mine.folded && mine.hole.some((c) => c.id);
  const [showCards, cardsRef] = useMuck(holding, !!mine?.folded);
  const overlap = Math.round(cardW * 0.3);
  const info = mine && (
    <div className="flex flex-col items-start gap-1.5 w-max">
      {(place || winner || tags.length > 0) && (
        <div className="flex gap-1 flex-wrap">
          {winner && <YouTag label="WIN" bg="#9bd14f" fg="#1a3a0e" />}
          {place && <YouTag label={place} bg="#1f1a3d" fg="#f4c430" />}
          {tags.map((t) => (
            <YouTag key={t.label} {...t} />
          ))}
        </div>
      )}
      <div className={`font-pixel-display text-parchment ${small ? "text-[10px]" : "text-[12px]"}`}>
        YOU <span className="text-glow-gold tabular-nums">{mine.stack}</span>
      </div>
      {mine.pending > 0 && <div className="font-pixel-body text-[18px] leading-none" style={{ color: "#9bd14f" }}>+{fmt(mine.pending)} next hand</div>}
      {hand && <div className="font-pixel-body text-[18px] leading-none text-bone/80">{hand}</div>}
    </div>
  );
  const cards = (
    <div className="relative shrink-0" style={{ width: cardW * 2 - overlap, height: cardH }}>
      {showCards && mine && (
        <div ref={cardsRef} className="absolute inset-0 flex" aria-label="Your cards">
          {mine.hole.map((c, i) =>
            c.id ? (
              <div key={c.id} data-deal-rel={0} data-deal-card={i} style={{ marginLeft: i ? -overlap : 0 }}>
                <PixelCard rank={c.rank} suit={c.suit} width={cardW} style={{ boxShadow: best.includes(c.id) ? "0 0 0 3px #9bd14f" : undefined }} />
              </div>
            ) : null,
          )}
        </div>
      )}
      {bubble && <ChatBubble name="You" lines={bubble} side="left" align="end" />}
    </div>
  );
  return (
    <div className="relative w-full h-full" data-your-turn={myTurn ? "true" : undefined}>
      {myTurn && !cramped && <YourTurnMark />}
      {small ? (
        <div className="absolute inset-x-0 bottom-1 flex items-end justify-center gap-3">
          {cards}
          {info}
        </div>
      ) : (
        <>
          <div className="absolute left-1/2 bottom-1" style={{ transform: "translateX(-50%)" }}>
            {cards}
            <div className="absolute left-full bottom-0 ml-4">{info}</div>
          </div>
        </>
      )}
    </div>
  );
}

function YouTag({ label, bg, fg = "#1a1024" }) {
  return (
    <span className="font-pixel-display text-[9px] leading-none px-1.5 py-1 whitespace-nowrap" style={{ backgroundColor: bg, color: fg, boxShadow: "0 0 0 2px #0a0712" }}>
      {label}
    </span>
  );
}
