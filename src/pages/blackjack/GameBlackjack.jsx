// BLACKJACK TABLE PAGE — an online table driven by the server's
// blackjack_state: the half-moon with the hooded dealer and the five seats,
// your controls in a bar under it (the bet bar while betting, the action bar
// once the cards are out), and the sidebar's chat and round log.
//
// Every state is drawn as it arrives: the server paces the deal and the
// dealer. A credit table is told by `view.credit`; leaving one lands on the
// lobby's CREDITS tab.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useServerStats } from "../../hooks/useServerStats";
import { useChatLimit } from "../../hooks/useChatLimit";
import { useTableMetrics } from "../../hooks/useTableMetrics";
import { useUnread } from "../../hooks/useUnread";
import { socket, connectSocket } from "../../utils/socket";
import { seatAvatar } from "../../utils/avatarConstants";
import GameChat from "../../components/thirteen/GameChat";
import { TableHeader, TableSidebar, ConnectionSignal } from "../../components/TableChrome";
import { HandReward } from "../../components/RewardPanel";
import Modal from "../../components/credits/Modal";
import HalfMoonTable from "../../components/blackjack/HalfMoonTable";
import BetBar from "../../components/blackjack/BetBar";
import ActionBar from "../../components/blackjack/ActionBar";
import { PHASES } from "../../utils/blackjack/engine";
import { eventEntry, withContext } from "../../utils/blackjack/log";

const AVATAR_COLOR = { 1: "#f4c430", 2: "#5fd4d6", 3: "#e85a7a", 4: "#9bd14f", 5: "#c5a8ff", custom: "#ead8b1" };
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const lobbyRoute = (credit) => ["/lobby-blackjack", credit ? { state: { tab: "credits" } } : undefined];
const EXTRA_BTN = "pixel-btn font-pixel-display text-[10px] px-3 py-2.5 whitespace-nowrap";

export default function GameBlackjack() {
  const { lobbyId, playerName } = useLocation().state || {};
  if (!lobbyId) return <Joining fatal="No table to join" />;
  return <OnlineBlackjack lobbyId={lobbyId} playerName={playerName} />;
}

/** Joins the table and draws each blackjack_state the server sends. */
function OnlineBlackjack({ lobbyId, playerName }) {
  const navigate = useNavigate();
  const { identity } = useAuth();
  const [view, setView] = useState(null);
  const [messages, setMessages] = useState([]);
  const [rejection, setRejection] = useState(null);
  const [fatal, setFatal] = useState("");
  const chatLimit = useChatLimit();
  const seenRef = useRef(0);
  const creditRef = useRef(false); // leaving a credit table lands on the lobby's CREDITS tab
  // What the last round paid you (progress_reward): floats up, and stays in the bar until betting reopens.
  const [handReward, setHandReward] = useState(null);
  const [roundReward, setRoundReward] = useState(null);
  const clearHandReward = useCallback(() => setHandReward(null), []);

  useEffect(() => {
    const join = () => {
      socket.emit("join_lobby", { lobbyId, playerName });
      socket.emit("check_game_status", { lobbyId });
    };
    const onState = (v) => {
      seenRef.current += 1;
      setView({ ...v, phaseEndsAt: v.phaseMsLeft == null ? null : Date.now() + v.phaseMsLeft });
      creditRef.current = !!v.credit;
      setRejection(null);
      if (v.phase === PHASES.BETTING) setRoundReward(null);
    };
    const onChat = (msg) => setMessages((m) => [...m, { ...msg, isMe: msg.sender === playerName }]);
    const onRejected = ({ reason } = {}) => setRejection(reason || "Move rejected");
    const onError = (msg) => {
      if (!seenRef.current) setFatal(String(msg || "Lobby not found"));
      else setRejection(String(msg));
    };
    // Sat out too long, or the host closed the table.
    const onLeft = () => navigate(...lobbyRoute(creditRef.current));
    const onReward = (reward) => {
      setHandReward(reward);
      setRoundReward(reward);
    };
    socket.on("connect", join);
    socket.on("blackjack_state", onState);
    socket.on("receive_chat", onChat);
    socket.on("move_rejected", onRejected);
    socket.on("error_message", onError);
    socket.on("table_left", onLeft);
    socket.on("progress_reward", onReward);
    connectSocket(identity).then(() => {
      if (socket.connected) join();
    });
    return () => {
      socket.off("connect", join);
      socket.off("blackjack_state", onState);
      socket.off("receive_chat", onChat);
      socket.off("move_rejected", onRejected);
      socket.off("error_message", onError);
      socket.off("table_left", onLeft);
      socket.off("progress_reward", onReward);
      // Left without EXIT (browser Back): the seat is held for the grace period.
      socket.emit("leave_page", { lobbyId });
    };
    // One join per table; identity and name are fixed for the visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId]);

  const emit = (event, extra = {}) => socket.emit(event, { lobbyId, ...extra });
  const actions = {
    sit: (seat) => emit("bj_sit", { seat }),
    bet: (amount) => emit("bj_bet", { amount }),
    deal: (amount) => {
      emit("bj_bet", { amount });
      emit("bj_ready");
    },
    insurance: (take) => emit("bj_insurance", { take }),
    act: (type) => emit("bj_action", { type }),
    rebuy: () => emit("bj_rebuy"),
    close: () => emit("close_table"),
    exit: () => {
      emit("leave_lobby");
      navigate(...lobbyRoute(view?.credit));
    },
    sendChat: (text) => text.trim() && emit("send_chat", { message: text.trim() }),
  };

  if (!view) return <Joining fatal={fatal} />;
  return (
    <>
      <BlackjackScreen view={view} lobbyId={lobbyId} chatLimit={chatLimit} actions={actions} messages={messages} setMessages={setMessages} warning={rejection} reward={roundReward} />
      {handReward && (
        <div className="fixed left-1/2 -translate-x-1/2 z-40" style={{ bottom: "32%" }}>
          <HandReward key={`${handReward.expAfter}`} reward={handReward} onDone={clearHandReward} />
        </div>
      )}
    </>
  );
}

function Joining({ fatal }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center gap-5 h-full starfield font-pixel-body text-parchment text-center px-4" style={{ position: "fixed", inset: 0 }}>
      {fatal ? (
        <>
          <div className="font-pixel-display text-[14px]" style={{ color: "#e85a7a" }}>
            CAN'T OPEN THIS TABLE
          </div>
          <div className="font-pixel-body text-[22px] text-bone/80">{fatal}</div>
          <button onClick={() => navigate("/lobby-blackjack")} className={EXTRA_BTN} style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}>
            GO TO BLACKJACK LOBBY
          </button>
        </>
      ) : (
        <div className="font-pixel-display text-[14px] text-glow-gold blink">JOINING TABLE...</div>
      )}
    </div>
  );
}

/**
 * Each new event of the round becomes a line in the LOG tab. Bets are
 * logged once, as the round is dealt (not each chip as it goes down), and a
 * player who left is still named from the views before.
 */
function useBlackjackLog(view, setMessages) {
  const seen = useRef({ events: [], round: view.roundNumber, names: [], n: 0 });
  useEffect(() => {
    const prev = seen.current;
    const names = view.seats.map((p, i) => p?.name ?? prev.names[i] ?? null);
    const fresh = [];
    const dealt = view.roundNumber !== prev.round;
    if (dealt) view.seats.forEach((p, seat) => p?.inRound && fresh.push({ type: "bet", seat, amount: p.lastBet }));
    // The same list grown, or a new one (each betting window and deal starts afresh).
    const grown = !dealt && prev.events.length <= view.events.length && JSON.stringify(view.events.slice(0, prev.events.length)) === JSON.stringify(prev.events);
    for (const e of grown ? view.events.slice(prev.events.length) : view.events) if (e.type !== "bet") fresh.push(withContext(e, view.seats));
    const lines = fresh.map((e) => eventEntry(e, names)).filter(Boolean);
    seen.current = { events: view.events, round: view.roundNumber, names, n: prev.n + lines.length };
    if (!lines.length) return;
    setMessages((m) => [...m, ...lines.map((text, i) => ({ id: `log-${view.roundNumber}-${prev.n + i}`, type: "SYSTEM", text, timestamp: now() }))]);
  }, [view, setMessages]);
}

function BlackjackScreen({ view, lobbyId, chatLimit, actions, messages, setMessages, warning, reward }) {
  const { identity } = useAuth();
  const { compact, narrow } = useTableMetrics();
  const { connected, ping } = useServerStats({ enabled: true });
  const [panelOpen, setPanelOpen] = useState(false);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const unread = useUnread(messages, panelOpen);
  useBlackjackLog(view, setMessages);

  const mySeat = view.mySeat;
  const mine = view.seats[mySeat] ?? null;
  const credit = !!view.credit;
  const faceFor = (seat) =>
    seat === mySeat ? { variant: identity?.avatar ?? 1, customAvatarData: identity?.customAvatar } : seatAvatar(view.seats[seat], seat);
  const colorFor = (seat) => (view.seats[seat] ? AVATAR_COLOR[faceFor(seat).variant] : null) || "#ead8b1";
  const avatarFor = (msg) => (msg.isMe ? faceFor(mySeat) : faceFor(Math.max(0, view.seats.findIndex((p) => p?.name === msg.sender))));

  const status = view.saving ? "Saving…" : view.closingAfterRound ? "Table closing after this round" : null;
  const endTable = view.amHost && (
    <button className={EXTRA_BTN} style={{ backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" }} onClick={actions.close}>
      END TABLE
    </button>
  );
  const code = lobbyId.replace(/^PUB-/, "");

  return (
    <div className="relative w-full h-full font-pixel-body text-parchment overflow-hidden flex flex-col" style={{ position: "fixed", inset: 0 }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, #1f1a3d 0%, #14102a 60%, #0a0712 100%)" }} />
      <TableHeader
        compact={compact}
        narrow={narrow}
        onExit={credit && mine?.inRound ? () => setConfirmLeave(true) : actions.exit}
        badge={
          <span className="font-pixel-display text-[10px] leading-none px-1.5 py-1 whitespace-nowrap" style={{ backgroundColor: "#5fd4d6", color: "#0a0712", boxShadow: "0 0 0 2px #0a0712" }}>
            {`${credit ? "CREDITS" : "FREE"} · #${code}`}
          </span>
        }
        title="BLACKJACK"
        titleColor="#5fd4d6"
        round={view.roundNumber || "–"}
        signal={<ConnectionSignal local={false} connected={connected} ping={ping} />}
        onPanel={() => setPanelOpen(true)}
        unread={unread}
      />

      <div className="relative flex-1 grid min-h-0" style={{ gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1fr) 300px" }}>
        <div className="relative flex flex-col min-h-0">
          <div className={`relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${narrow ? "px-4 pt-3 pb-2" : "px-4 pt-4 pb-3"}`}>
            <HalfMoonTable view={view} mySeat={mySeat} onSit={actions.sit} layout={narrow ? "compact" : "full"} faceFor={faceFor} />
          </div>
          <div className="relative flex flex-col gap-2 px-4 py-3" style={{ backgroundColor: "#14102a", borderTop: "4px solid #0a0712" }}>
            {warning && (
              <div role="status" className="font-pixel-body text-[20px] leading-none" style={{ color: "#e85a7a" }}>
                {warning}
              </div>
            )}
            {view.phase === PHASES.BETTING && mine ? (
              <BetBar
                key={`bet-${view.roundNumber}`}
                seat={mine}
                credit={credit}
                endsAt={view.phaseEndsAt}
                onBet={actions.bet}
                onDeal={actions.deal}
                onRebuy={actions.rebuy}
                compact={narrow}
              >
                {endTable}
              </BetBar>
            ) : (
              <ActionBar view={view} endsAt={view.phaseEndsAt} reward={reward} onAction={actions.act} onInsurance={actions.insurance} status={status}>
                {endTable}
              </ActionBar>
            )}
          </div>
        </div>

        <TableSidebar compact={compact} open={panelOpen} onClose={closePanel}>
          <GameChat messages={messages} onSendMessage={actions.sendChat} avatarFor={avatarFor} colorFor={colorFor} {...chatLimit} />
        </TableSidebar>
      </div>

      {confirmLeave && (
        <Modal title="Leave the table?" icon="back" deep="#7a1530" onClose={() => setConfirmLeave(false)}>
          <p className="font-pixel-body text-[22px] text-bone leading-tight">Your hands stand where they are, and whatever they win goes to your balance after the round.</p>
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
