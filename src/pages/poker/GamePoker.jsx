// POKER TABLE PAGE — practice against six CPUs in the browser, or an online
// table driven by the server's poker_state. Both draw the same PokerScreen:
// the table with the hooded dealer at its head, you at its foot and the other
// six round the rim, and the bet controls under it; the sidebar holds the
// scoreboard, chat and the hand log.
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
import ChatBubble from "../../components/ChatBubble";
import GameChat from "../../components/thirteen/GameChat";
import { TableHeader, TableSidebar, ConnectionSignal } from "../../components/TableChrome";
import OvalTable from "../../components/poker/OvalTable";
import PokerSeat, { SeatCards } from "../../components/poker/PokerSeat";
import { LEVEL_COLOR, actingOrder, dealerLine, moveCallouts, ordinal, seatTags } from "../../components/poker/seatInfo";
import { useSeatCallouts } from "../../components/blackjack/seatCallouts";
import BetControls from "../../components/poker/BetControls";
import PokerScoreBoard from "../../components/poker/PokerScoreBoard";
import PokerRules from "../../components/poker/PokerRules";
import Countdown from "../../components/poker/Countdown";
import { PokerTable } from "../../utils/poker/table";
import { MAX_SEATS, PHASES, potSize, viewFor } from "../../utils/poker/engine";
import { buildPots } from "../../utils/poker/pots";
import { evaluate } from "../../utils/poker/hands";
import { eventEntry } from "../../utils/poker/log";
import BuyInPanel from "../../components/credits/BuyInPanel";
import Modal from "../../components/credits/Modal";
import { HandReward } from "../../components/RewardPanel";
import { useCredits } from "../../hooks/useCredits";
import { TIERS, buyInRange, fmt, topUpRange } from "../../utils/poker/tiers";

const CPUS = [
  { name: "Bot Saturn", variant: 2 },
  { name: "Bot Venus", variant: 3 },
  { name: "Bot Mars", variant: 4 },
  { name: "Bot Jupiter", variant: 5 },
  { name: "Bot Mercury", variant: 1 },
  { name: "Bot Neptune", variant: 2 },
];
const AVATAR_COLOR = { 1: "#f4c430", 2: "#5fd4d6", 3: "#e85a7a", 4: "#9bd14f", 5: "#c5a8ff", custom: "#ead8b1" };
const short = (name = "") => name.split(" #")[0];
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const running = (phase) => phase === PHASES.BETTING || phase === PHASES.RUNOUT;
const EXTRA_BTN = "pixel-btn font-pixel-display text-[10px] px-3 py-2.5 whitespace-nowrap";
// Where each seat's chat bubble opens (by seat relative to you, see OvalTable),
// over the felt, into space no other seat uses. On a phone the plates sit on
// the rim, so they open inward too.
const BUBBLE_AT = {
  0: { side: "right", align: "center" },
  1: { side: "above", align: "start" },
  2: { side: "right", align: "center" },
  3: { side: "right", align: "start" },
  4: { side: "left", align: "start" },
  5: { side: "left", align: "center" },
  6: { side: "above", align: "end" },
};
const COMPACT_BUBBLE_AT = {
  0: { side: "above", align: "center" },
  1: { side: "right", align: "start" },
  2: { side: "right", align: "start" },
  3: { side: "right", align: "start" },
  4: { side: "left", align: "start" },
  5: { side: "left", align: "start" },
  6: { side: "left", align: "start" },
};
const LOWER_SEATS = new Set([0, 1, 6]); // the + CPU menu opens over these plates

export default function GamePoker() {
  const { lobbyId, playerName, aiDifficulty = "MEDIUM" } = useLocation().state || {};
  const isSolo = !lobbyId || lobbyId.startsWith("SOLO-");
  return isSolo ? <PracticePoker playerName={playerName} level={aiDifficulty} /> : <OnlinePoker lobbyId={lobbyId} playerName={playerName} />;
}

/** Practice: you in seat 0 against six CPUs, the table running in the browser, no turn clock. */
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
  // What the last hand paid you (progress_reward), while it shows.
  const [handReward, setHandReward] = useState(null);
  const clearHandReward = useCallback(() => setHandReward(null), []);
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
    const onReward = (reward) => setHandReward(reward);
    socket.on("connect", join);
    socket.on("poker_state", onState);
    socket.on("receive_chat", onChat);
    socket.on("move_rejected", onRejected);
    socket.on("error_message", onError);
    socket.on("table_left", onLeft);
    socket.on("credit_table_info", onTableInfo);
    socket.on("progress_reward", onReward);
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
      socket.off("progress_reward", onReward);
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
        {handReward && (
          <div className="fixed left-1/2 -translate-x-1/2 z-40" style={{ bottom: "32%" }}>
            <HandReward key={`${handReward.expAfter}`} reward={handReward} onDone={clearHandReward} />
          </div>
        )}
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
  const { compact, narrow, seats } = useTableMetrics();
  const layout = narrow ? "compact" : "full";
  const { connected, ping } = useServerStats({ enabled: !!online });
  const [panelOpen, setPanelOpen] = useState(false);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const [showRules, setShowRules] = useState(false);
  const closeRules = useCallback(() => setShowRules(false), []);
  const unread = useUnread(messages, panelOpen);
  const bubbles = useChatBubbles(messages);
  usePokerLog(view, setMessages);
  const [calloutFor, calloutDone] = useSeatCallouts(view, moveCallouts);

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

  const seatOfRel = (rel) => (me + rel) % MAX_SEATS;
  const platesAt = layout === "compact" ? COMPACT_BUBBLE_AT : BUBBLE_AT;
  const plateNode = (rel) => {
    const seat = seatOfRel(rel);
    const p = view.seats[seat];
    const yours = seat === view.mySeat;
    const bubble = yours ? bubbles.mine : p ? bubbles.bubbleFor(p.name) : null;
    return (
      <div className="relative">
        {bubble && <ChatBubble name={yours ? "You" : short(p.name)} lines={bubble} {...platesAt[rel]} />}
        <PokerSeat
          player={p}
          face={p ? faceFor(seat) : null}
          isMe={yours}
          tags={p ? tagsFor(seat) : []}
          isTurn={!dealing && view.turn === seat}
          place={placeOf[seat] ?? null}
          clockMs={!dealing && view.turn === seat ? (view.turnMsLeft ?? null) : null}
          clockKey={`${view.received}-${view.turn}`}
          winner={winners.has(seat)}
          xpLevel={online ? view.levels?.[seat] : null}
          layout={layout}
          isHost={isHost}
          opensUp={LOWER_SEATS.has(rel)}
          onAddCpu={isHost && !tier ? (level) => actions.addCpu(seat, level) : undefined}
          onRemoveCpu={isHost ? () => actions.removeCpu(seat) : undefined}
          callout={p ? calloutFor(seat) : null}
          onCalloutDone={(id) => calloutDone(seat, id)}
          below={yours && mine?.pending > 0 ? `+${fmt(mine.pending)} next hand` : null}
        />
      </div>
    );
  };
  const cardsNode = (rel, cardW) => {
    const seat = seatOfRel(rel);
    const p = view.seats[seat];
    if (seat === view.mySeat) return <YourCards mine={mine} cardW={cardW} myTurn={myTurn} best={best} hand={myHand} narrow={layout === "compact"} />;
    return <SeatCards player={p} rel={rel} cardW={cardW} best={best} label={p ? `${short(p.name)}'s cards` : undefined} />;
  };
  const relOf = (seat) => (seat - me + MAX_SEATS) % MAX_SEATS;
  // This street's bets; before the flop the blinds' chips say SB / BB.
  const bets = Object.fromEntries(
    view.seats.map((p, seat) => [relOf(seat), { amount: inPlay && p ? p.bet : 0, label: view.street === "PREFLOP" ? (blindOf[seat] ?? null) : null }]),
  );
  const dealer = (inPlay || over) && view.button != null ? { rel: relOf(view.button), seat: view.button } : null;
  // Dealt from the button's left.
  const deal = dealKey != null && dealer ? { key: dealKey, order: Array.from({ length: MAX_SEATS }, (_, k) => (dealer.rel + k + 1) % MAX_SEATS) } : null;
  const line = dealerLine(view, { dealing, result, firstHandSoon: firstHandAt != null });
  const myHand = !dealing && mine?.inHand && !mine.folded && mine.hole.every((c) => c.id) ? evaluate([...mine.hole, ...view.board]).name : null;

  return (
    <div className="relative w-full h-full font-pixel-body text-parchment overflow-hidden flex flex-col" style={{ position: "fixed", inset: 0 }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, #1f1a3d 0%, #14102a 60%, #0a0712 100%)" }} />
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
        <div className="relative flex flex-col min-h-0">
          <div className={`relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${narrow ? "px-2 pt-2 pb-1" : "px-4 pt-4 pb-3"}`}>
            <OvalTable
              layout={layout}
              plate={plateNode}
              cards={cardsNode}
              bets={bets}
              turnRel={!dealing && view.turn != null ? relOf(view.turn) : null}
              winners={[...winners].map(relOf)}
              hand={view.handNumber}
              dealer={dealer}
              line={line}
              board={view.board}
              best={best}
              pots={potsOf(view)}
              deal={deal}
              onDealt={setDealtKey}
              muck={view.seats.filter((p) => p?.inHand && p.folded).length * 2}
              countdown={firstHandAt}
              banner={banner}
              print={["NO-LIMIT HOLD'EM", `BLINDS ${fmt(view.smallBlind)}/${fmt(view.bigBlind)}`]}
              result={result}
            >
              <TurnBanner active={myTurn} />
            </OvalTable>
          </div>

          <div className="relative px-4 py-2" style={{ backgroundColor: "#14102a", borderTop: "4px solid #0a0712" }}>
          <BetControls legal={legal} pot={potSize(view)} currentBet={view.currentBet} bigBlind={view.bigBlind} onMove={actions.move} message={message} warning={warning} compact={narrow} short={seats === "row"}>
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
 * Your two cards at the foot of the felt (a folded hand flies to the muck),
 * with what you hold beside them (on a phone, in a narrow tag). Outlined in gold on
 * your turn, like the hand being played at the Blackjack table.
 */
function YourCards({ mine, cardW, myTurn, best, hand, narrow = false }) {
  return (
    <div className="relative" data-your-turn={myTurn ? "true" : undefined}>
      <div className="relative" style={{ padding: 3, boxShadow: myTurn ? "0 0 0 3px #f4c430, 0 0 12px rgba(244,196,48,0.5)" : "none" }}>
        <SeatCards player={mine} rel={0} cardW={cardW} best={best} label="Your cards" spread={0.3} />
      </div>
      {hand && (
        <span
          className={`absolute left-full top-1/2 font-pixel-display px-1.5 py-1 ${narrow ? "ml-2 text-[8px] leading-tight w-[68px]" : "ml-3 text-[9px] leading-none whitespace-nowrap"}`}
          style={{ transform: "translateY(-50%)", backgroundColor: "#0a0712", color: "#ead8b1", boxShadow: "0 0 0 2px #0a0712" }}
        >
          {hand}
        </span>
      )}
    </div>
  );
}
