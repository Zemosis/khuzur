// GAME THIRTEEN - Multiplayer Version with Pixel Retro UI

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { socket, connectSocket } from "../../utils/socket";
import { useAuth } from "../../hooks/useAuth";
import { useServerStats } from "../../hooks/useServerStats";
import { useChatLimit } from "../../hooks/useChatLimit";
import { useHandOrder } from "../../hooks/useHandOrder";
import { useChatBubbles } from "../../hooks/useChatBubbles";
import { useTurnTitle } from "../../hooks/useTurnTitle";
import ChatBubble from "../../components/ChatBubble";
import TurnBanner from "../../components/TurnBanner";
import PlayerHand from "../../components/thirteen/PlayerHand";
import OpponentSection from "../../components/thirteen/OpponentSection";
import PlayArea from "../../components/thirteen/PlayArea";
import GameControls from "../../components/thirteen/GameControls";
import ScoreBoard from "../../components/thirteen/ScoreBoard";
import GameChat from "../../components/thirteen/GameChat";
import {
  initializeGame,
  findPlayerWithCard,
} from "../../utils/deckUtils";
import DealAnimation from "../../components/thirteen/DealAnimation";
import RulesModal from "../../components/thirteen/RulesModal";
import WaitingTable from "../../components/thirteen/WaitingTable";
import { useSoloMatchReport } from "../../hooks/useSoloMatchReport";
import { thirteenSoloReport } from "../../utils/soloReport";

import {
  createGameState,
  playCards,
  passAction,
  startNextRound,
} from "../../utils/gameLogic";
import { validatePlay, identifyCombination } from "../../utils/handEvaluator";
import { useTableMetrics } from "../../hooks/useTableMetrics";
import { seatAvatar } from "../../utils/avatarConstants";
import { COMBO_NAMES, GAME_STATES, GAME_SETTINGS } from "../../utils/constants";
import { makeAIDecision } from "../../utils/aiPlayer";

import { soundManager } from "../../utils/SoundManager";
import PixelIcon from "../../components/PixelIcon";
import { MotionToggle } from "../../components/SettingsModal";
import { TableHeader, TableSidebar, ConnectionSignal } from "../../components/TableChrome";
import { useUnread } from "../../hooks/useUnread";
import { positionOf, seatPositions } from "../../utils/seatPosition";

const AVATAR_COLOR = { 1: "#f4c430", 2: "#5fd4d6", 3: "#e85a7a", 4: "#9bd14f", 5: "#c5a8ff", custom: "#ead8b1" };

// Side seat = tall name plate (124) + gap (12) + sideways card fan (88).
const SIDE_SEAT_W = 224;
const ROW_SEAT_W = 150; // slim seats on a short screen

const GameThirteen = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    lobbyId,
    isHost,
    playerName,
    aiDifficulty = "MEDIUM",
  } = location.state || {};

  const { identity } = useAuth();

  const [gameState, setGameState] = useState(null);
  // The waiting table before the deal (server `table_update`); null once dealt.
  const [table, setTable] = useState(null);
  // Selection and errors belong to one turn: any move, a new round or a new
  // match starts clean. A selection kept past a PASS used to ride into the
  // next deal holding cards no longer in your hand, so a good pick read
  // "Invalid" until CLEAR.
  const turnKey = gameState
    ? `${gameState.matchNumber || 1}-${gameState.roundNumber}-${gameState.moveHistory.length}`
    : "waiting";
  const turnKeyRef = useRef(turnKey);
  const [selection, setSelection] = useState({ key: null, cards: [] });
  const selectedCards = selection.key === turnKey ? selection.cards : [];
  const [error, setError] = useState({ key: null, text: "" });
  const errorMessage = error.key === turnKey ? error.text : "";
  const setErrorMessage = (text) => setError({ key: turnKeyRef.current, text });
  // A new pick replaces the last error, so its combo name shows again.
  const setSelectedCards = (cards) => {
    setSelection({ key: turnKey, cards });
    setError({ key: null, text: "" });
  };
  const [messages, setMessages] = useState([]);
  const [showRoundEnd, setShowRoundEnd] = useState(false);
  const [roundEndData, setRoundEndData] = useState(null);
  const [isDealing, setIsDealing] = useState(true);
  const [dealCounts, setDealCounts] = useState([0, 0, 0, 0]);
  // Online: when the deal ends, at every seat (see DealAnimation's endsAt).
  const [dealEndsAt, setDealEndsAt] = useState(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const closeRules = useCallback(() => setShowRules(false), []);
  const [isMuted, setIsMuted] = useState(false);
  // RANK / SUIT, or your own order (dragged) for the round.
  const handOrder = useHandOrder(gameState ? `${gameState.matchNumber || 1}-${gameState.roundNumber}` : null);
  const changeSortMode = (mode) => {
    handOrder.pick(mode);
    safePlay("playClick");
  };

  const [volumes, setVolumes] = useState({ master: 50, sfx: 50 });

  const { handW, deckW, compact, narrow, seats } = useTableMetrics();
  const [panelOpen, setPanelOpen] = useState(false);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const unread = useUnread(messages, panelOpen);
  const tableCenterRef = useRef(null);
  const lastHistoryLengthRef = useRef(0);
  // Whether this page has taken in the state it opened on (see LOGS & SFX).
  const caughtUpRef = useRef(false);
  const gameStateRef = useRef(gameState);
  const dealOrderRef = useRef(null);

  const handleDealProgress = useCallback((counts) => setDealCounts(counts), []);
  const handleDealComplete = useCallback(() => {
    setDealCounts([13, 13, 13, 13]);
    dealOrderRef.current = null;
    setIsDealing(false);
  }, []);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  useEffect(() => {
    turnKeyRef.current = turnKey;
  }, [turnKey]);

  // A rejected waiting-table command shows for 4s, then clears.
  useEffect(() => {
    if (!errorMessage || gameState) return;
    const t = setTimeout(() => setErrorMessage(""), 4000);
    return () => clearTimeout(t);
  }, [errorMessage, gameState]);

  const safePlay = (method) => {
    try {
      if (soundManager.context && soundManager.context.state === "suspended") {
        soundManager.context.resume();
      }
      if (soundManager && typeof soundManager[method] === "function") {
        soundManager[method]();
      }
    } catch {
      /* audio not ready yet — safe to ignore */
    }
  };

  const isSoloGame = lobbyId?.startsWith("SOLO-");
  // The server says who hosts (it moves when a host leaves); router state is
  // only what was true when this page was opened.
  const amHost = gameState?.amHost ?? table?.isHost ?? !!isHost;
  const { connected, ping } = useServerStats({ enabled: !isSoloGame });
  const chatLimit = useChatLimit();

  // --- HELPER: FIND MY INDEX ---
  const getMyPlayerIndex = useCallback(
    (state) => {
      if (isSoloGame) return 0;
      if (!state) return -1;
      let idx = state.players.findIndex(
        (p) => p.socketId && p.socketId === socket.id,
      );
      if (idx === -1 && playerName) {
        idx = state.players.findIndex((p) => p.name === playerName);
      }
      return idx;
    },
    [isSoloGame, playerName],
  );

  // Your turn, made hard to miss (also from another tab), and chat bubbles
  // over the seats.
  const bubbles = useChatBubbles(messages);
  const myTurnNow =
    !!gameState &&
    !isDealing &&
    gameState.gameState === GAME_STATES.PLAYING &&
    gameState.currentPlayerIndex === getMyPlayerIndex(gameState) &&
    !gameState.players[gameState.currentPlayerIndex]?.isEliminated;
  useTurnTitle(myTurnNow);

  // --- GAME SETUP ---
  // Solo runs entirely locally. Multiplayer is server-authoritative: the
  // server deals, validates moves, and runs CPU seats — we render its state.
  useEffect(() => {
    if (!lobbyId) {
      navigate("/");
      return;
    }

    if (soundManager && soundManager.init) soundManager.init();

    if (isSoloGame) {
      if (!gameStateRef.current) {
        const { hands } = initializeGame();
        const startingPlayer = findPlayerWithCard(hands, "3", "♦");
        const initialState = createGameState(
          hands,
          startingPlayer >= 0 ? startingPlayer : 0,
          aiDifficulty,
        );
        if (initialState.players[0]) {
          initialState.players[0].name = playerName || "You";
          initialState.players[0].type = "HUMAN";
        }
        setGameState(initialState);
      }
      return;
    }

    const joinGame = () => {
      socket.emit("join_lobby", { lobbyId, playerName });
      socket.emit("check_game_status", { lobbyId });
    };

    connectSocket(identity).then(() => {
      if (socket.connected) joinGame();
    });

    const handleStateUpdate = (newState) => {
      const prev = gameStateRef.current;
      const isNewRoundOrMatch =
        newState.gameState === GAME_STATES.PLAYING &&
        (!prev ||
          prev.roundNumber !== newState.roundNumber ||
          prev.matchNumber !== newState.matchNumber);
      setGameState(newState);
      if (newState.gameState === GAME_STATES.PLAYING) {
        setShowRoundEnd(false);
        setRoundEndData(null);
        if (isNewRoundOrMatch) {
          dealOrderRef.current = null;
          setDealCounts([0, 0, 0, 0]);
          setDealEndsAt(newState.dealMsLeft == null ? null : performance.now() + newState.dealMsLeft);
          setIsDealing(true);
        }
      }
      const myIdx = getMyPlayerIndex(newState);
      if (newState.currentPlayerIndex === myIdx) {
        safePlay("playTurnAlert");
      }
    };

    const handleReceiveChat = (msg) => {
      const isMe = msg.sender === (playerName || "Host");
      const formattedMsg = { ...msg, isMe };
      setMessages((prev) => [...prev, formattedMsg]);
      if (!isMe) safePlay("playClick");
    };

    const handleMoveRejected = ({ reason }) => {
      setErrorMessage(reason || "Move rejected");
      safePlay("playError");
    };

    socket.on("connect", joinGame);
    socket.on("game_state_update", handleStateUpdate);
    socket.on("receive_chat", handleReceiveChat);
    socket.on("move_rejected", handleMoveRejected);
    socket.on("table_update", setTable);

    return () => {
      socket.off("connect", joinGame);
      socket.off("game_state_update", handleStateUpdate);
      socket.off("receive_chat", handleReceiveChat);
      socket.off("move_rejected", handleMoveRejected);
      socket.off("table_update", setTable);
      // Left without EXIT (browser Back): the server holds the seat for the
      // grace period; coming back re-joins and reclaims it.
      socket.emit("leave_page", { lobbyId });
    };
  }, [lobbyId]);

  // --- AI LOGIC (SOLO ONLY — multiplayer CPUs run on the server) ---
  useEffect(() => {
    if (
      !isSoloGame ||
      !gameState ||
      isDealing ||
      gameState.gameState === GAME_STATES.GAME_OVER ||
      gameState.gameState === GAME_STATES.ROUND_END
    )
      return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    if (currentPlayer.type === "AI" && !currentPlayer.isEliminated) {
      const timer = setTimeout(() => {
        const decision = makeAIDecision(
          currentPlayer,
          gameState.currentPlay,
          gameState,
        );
        let result = null;

        if (decision.action === "play") {
          const playResult = playCards(gameState, decision.cards);
          if (playResult.success) result = playResult.newState;
          else result = passAction(gameState);
        } else {
          result = passAction(gameState);
        }

        if (result) setGameState(result);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState, isSoloGame, isDealing]);

  // --- AUTO-CONTINUE: ROUND_END → next round ---
  useEffect(() => {
    if (!gameState) return;

    if (
      gameState.gameState === GAME_STATES.ROUND_END ||
      gameState.gameState === GAME_STATES.GAME_OVER
    ) {
      const roundWinner =
        gameState.winnerIndex !== undefined
          ? gameState.players[gameState.winnerIndex]
          : null;

      setRoundEndData({
        roundNumber: gameState.roundNumber,
        players: gameState.players.map((p, idx) => ({
          name: p.name,
          score: p.score,
          isEliminated: p.isEliminated,
          matchWins: (gameState.matchWins || [0, 0, 0, 0])[idx],
        })),
        roundWinnerName: roundWinner?.name,
        isGameOver: gameState.gameState === GAME_STATES.GAME_OVER,
      });
      setShowRoundEnd(true);
    }

    // Multiplayer: the server starts the next round itself.
    if (!isSoloGame) return;
    if (gameState.gameState !== GAME_STATES.ROUND_END) return;

    const timer = setTimeout(() => {
      const { hands } = initializeGame();
      const nextState = startNextRound(gameState, hands);

      setShowRoundEnd(false);
      setRoundEndData(null);
      dealOrderRef.current = null;
      setDealCounts([0, 0, 0, 0]);
      setIsDealing(true);
      setGameState(nextState);
    }, 4000);

    return () => clearTimeout(timer);
  }, [gameState?.gameState]);

  // --- STATS: a finished practice match is recorded for your profile (online
  // matches are recorded by the server) ---
  useSoloMatchReport({
    prefix: "SOLO",
    matchNumber: gameState?.matchNumber || 1,
    finished: gameState?.gameState === GAME_STATES.GAME_OVER,
    build: (times) => thirteenSoloReport(gameState, times),
    enabled: isSoloGame,
  });

  // --- ACTIONS ---
  const handlePlay = () => {
    if (soundManager.context && soundManager.context.state === "suspended") {
      soundManager.context.resume();
    }

    const myIndex = getMyPlayerIndex(gameState);
    if (myIndex === -1) {
      setErrorMessage("You are spectating");
      return;
    }

    const validation = validatePlay(selectedCards, gameState.currentPlay);
    if (!validation.valid) {
      setErrorMessage(validation.reason);
      safePlay("playError");
      return;
    }

    if (isSoloGame) {
      const result = playCards(gameState, selectedCards);
      if (result.success) {
        setSelectedCards([]);
        setGameState(result.newState);
      }
    } else {
      socket.emit("request_move", {
        lobbyId,
        action: "play",
        data: { cards: selectedCards.map((c) => c.id) },
      });
      setSelectedCards([]);
    }
  };

  const handlePass = () => {
    const myIndex = getMyPlayerIndex(gameState);
    if (myIndex === -1) return;

    if (isSoloGame) {
      setGameState(passAction(gameState));
    } else {
      socket.emit("request_move", { lobbyId, action: "pass", data: {} });
    }
  };

  // --- WAITING TABLE (host) ---
  const handleAddCpu = (seat, level) => socket.emit("add_cpu", { lobbyId, seat, level });
  const handleSetCpuLevel = (seat, level) => socket.emit("set_cpu_level", { lobbyId, seat, level });
  const handleRemoveCpu = (seat) => socket.emit("remove_cpu", { lobbyId, seat });
  const handleStart = () => socket.emit("start_game", { lobbyId });

  const handleSendMessage = (text) => {
    if (!text.trim()) return;

    // Solo games have no server — chat is local
    if (isSoloGame) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-${Math.random()}`,
          type: "CHAT",
          sender: playerName || "You",
          text: text.trim(),
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isMe: true,
        },
      ]);
      return;
    }

    socket.emit("send_chat", {
      lobbyId,
      message: text,
      playerName: playerName || (isHost ? "Host" : "Guest"),
    });
  };

  // --- SETTINGS HANDLERS ---
  const handleToggleMute = () => {
    if (soundManager) {
      const muted = soundManager.toggleMute();
      setIsMuted(muted);
    }
  };

  const handleVolumeChange = (type, value) => {
    if (!soundManager) return;
    const newVal = parseInt(value);
    setVolumes((prev) => ({ ...prev, [type]: newVal }));
    if (type === "master") soundManager.setMasterVolume(newVal / 100);
    if (type === "sfx") soundManager.setSFXVolume(newVal / 100);
    if (!isMuted) soundManager.playClick();
  };

  // --- EXIT ---
  const handleExit = () => {
    if (!isSoloGame) socket.emit("leave_lobby", { lobbyId });
    navigate("/");
  };

  // --- REMATCH ---
  const handleRematch = () => {
    if (!isSoloGame) {
      if (amHost) socket.emit("request_rematch", { lobbyId });
      return;
    }

    const { hands } = initializeGame();
    const startingPlayer = findPlayerWithCard(hands, "3", "♦");
    const matchMeta = {
      matchNumber: (gameState.matchNumber || 1) + 1,
      matchWins: gameState.matchWins || [0, 0, 0, 0],
    };
    const freshState = createGameState(
      hands,
      startingPlayer >= 0 ? startingPlayer : 0,
      gameState.aiDifficulty,
      matchMeta,
    );

    freshState.players = freshState.players.map((p, idx) => ({
      ...p,
      name: gameState.players[idx].name,
      type: gameState.players[idx].type,
    }));

    setShowRoundEnd(false);
    setRoundEndData(null);
    dealOrderRef.current = null;
    setDealCounts([0, 0, 0, 0]);
    setIsDealing(true);
    setSelectedCards([]);
    lastHistoryLengthRef.current = 0;
    setMessages([]);
    setGameState(freshState);
  };

  // --- LOGS & SFX ---
  // The log stores structured entries (who, what, which cards); GameChat
  // renders them as rows with card chips.
  // The first state a page gets (a reload, or joining mid-match) holds the
  // whole match so far. That catches up at once and silently, logging only
  // the current round; replaying it used to rattle off every past move's
  // sound in quick succession.
  useEffect(() => {
    if (!gameState) return;
    const history = gameState.moveHistory;
    const catchingUp = !caughtUpRef.current;
    caughtUpRef.current = true;
    if (catchingUp) {
      const roundStart = history.findLastIndex((m) => m.type === "NEW_ROUND");
      lastHistoryLengthRef.current = Math.max(0, roundStart);
    }
    if (history.length <= lastHistoryLengthRef.current) return;
    const firstBatch = catchingUp || lastHistoryLengthRef.current === 0;
    const newMoves = history.slice(lastHistoryLengthRef.current);
    lastHistoryLengthRef.current = history.length;
    const nameOf = (i) => (gameState.players[i]?.name || "").split(" #")[0];
    const entry = (fields) => ({
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "SYSTEM",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      ...fields,
    });

    if (firstBatch) {
      setMessages((prev) => [...prev, entry({ kind: "round", round: gameState.roundNumber })]);
    }

    newMoves.forEach((move, index) => {
      setTimeout(() => {
        if (!catchingUp && move.type === "PLAY") safePlay("playSnap");
        if (!catchingUp && move.type === "NEW_ROUND") safePlay("playDeal");

        let fields = null;
        if (move.type === "PLAY") {
          fields = {
            kind: "play",
            playerIndex: move.playerIndex,
            name: nameOf(move.playerIndex),
            cards: move.cards,
            combo: COMBO_NAMES[move.combination?.type] || "Cards",
          };
        } else if (move.type === "PASS") {
          fields = { kind: "pass", playerIndex: move.playerIndex, name: nameOf(move.playerIndex) };
        } else if (move.type === "ROUND_RESET") {
          fields = { kind: "trick", playerIndex: move.leadPlayer, name: nameOf(move.leadPlayer) };
        } else if (move.type === "ROUND_END") {
          fields = { kind: "roundEnd", playerIndex: move.winnerIndex, name: nameOf(move.winnerIndex) };
        } else if (move.type === "NEW_ROUND") {
          fields = { kind: "round", round: move.roundNumber };
        }
        if (fields) setMessages((prev) => [...prev, entry(fields)]);
      }, catchingUp ? 0 : index * 100);
    });
  }, [gameState?.moveHistory]);

  // --- RENDER ---
  if (!gameState && table)
    return (
      <WaitingTable
        table={table}
        messages={messages}
        onSendMessage={handleSendMessage}
        onExit={handleExit}
        onAddCpu={handleAddCpu}
        onRemoveCpu={handleRemoveCpu}
        onSetCpuLevel={handleSetCpuLevel}
        onStart={handleStart}
        chatLimit={chatLimit}
        errorMessage={errorMessage}
        myFace={{ variant: identity.avatar, customAvatarData: identity.customAvatar }}
      />
    );

  if (!gameState)
    return (
      <div className="flex items-center justify-center h-full starfield">
        <div className="font-pixel-display text-[14px] text-glow-gold blink">
          LOADING GAME...
        </div>
      </div>
    );

  const myIndex = getMyPlayerIndex(gameState);
  const iAmSpectator = myIndex === -1;
  const viewIndex = iAmSpectator ? 0 : myIndex;

  const playersList = gameState.players || [];
  if (playersList.length < 2)
    return (
      <div className="flex items-center justify-center h-full starfield font-pixel-display text-rose">
        Error: Invalid Player Count
      </div>
    );

  if (isDealing && !dealOrderRef.current && playersList[0]?.hand.length > 0) {
    dealOrderRef.current = playersList.map((p) => {
      const indices = p.hand.map((_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      return indices;
    });
  }

  const visiblePlayers = isDealing
    ? playersList.map((p, idx) => {
        const count = dealCounts[idx] || 0;
        const order = dealOrderRef.current?.[idx];
        if (!order) return { ...p, hand: [] };
        const shown = order.slice(0, count).map((i) => p.hand[i]);
        return { ...p, hand: shown };
      })
    : playersList;

  // Each player at their spot around the table: you at the bottom, the rest
  // clockwise (2 players: across; 3: left and right).
  const at = {};
  visiblePlayers.forEach((p, i) => {
    at[positionOf(i, viewIndex, playersList.length)] = p;
  });
  const bottomPlayer = at.bottom;
  const leftPlayer = at.left;
  const topPlayer = at.top;
  const rightPlayer = at.right;

  const isMyTurn = !isDealing && gameState.currentPlayerIndex === myIndex;
  const canPlay = selectedCards.length > 0 && isMyTurn;
  const canPass = isMyTurn && gameState.currentPlay !== null;
  // Every play this round, oldest first. Won tricks stay on the felt (the
  // pile only clears when a new round is dealt).
  const pile = [];
  if (!isDealing) {
    const history = gameState.moveHistory || [];
    for (let i = history.length - 1; i >= 0; i--) {
      const move = history[i];
      if (move.type === "NEW_ROUND" || move.type === "ROUND_END") break;
      if (move.type === "PLAY") {
        pile.unshift({
          key: `${gameState.matchNumber || 1}-${gameState.roundNumber}-${i}`,
          index: i,
          cards: move.cards,
          type: move.combination?.type,
          seat: positionOf(move.playerIndex, viewIndex, playersList.length),
        });
      }
    }
  }

  // PixelAvatar props for a seat: your own avatar comes straight from your
  // profile (always current); everyone else's from the server's game state.
  const faceFor = (index) =>
    index === myIndex && !iAmSpectator
      ? { variant: identity.avatar, customAvatarData: identity.customAvatar }
      : seatAvatar(playersList[index], index);
  const avatarFor = (msg) => {
    if (msg.isMe) return faceFor(myIndex);
    const idx = playersList.findIndex((p) => p.name.split(" #")[0] === msg.sender?.split(" #")[0]);
    return idx >= 0 ? faceFor(idx) : { variant: 2 };
  };

  // Log names use the colour of the avatar shown for that seat.
  const colorFor = (playerIndex) => {
    const p = playersList[playerIndex];
    if (!p) return "#ead8b1";
    return AVATAR_COLOR[faceFor(playerIndex).variant] || "#ead8b1";
  };

  const comboInfo = (() => {
    if (!selectedCards.length) return null;
    const combo = identifyCombination(selectedCards);
    return combo
      ? { text: COMBO_NAMES[combo.type] || "Valid", isValid: true }
      : { text: "Invalid", isValid: false };
  })();
  const canSelect = isMyTurn && !bottomPlayer.isEliminated;
  const currentPlayerName =
    gameState.lastPlayedBy !== null
      ? playersList[gameState.lastPlayedBy].name
      : null;

  // A spot nobody sits at (2 or 3 players) keeps its place in the layout.
  const playing = !isDealing && gameState.gameState === GAME_STATES.PLAYING;
  const opponent = (player, position) =>
    !player ? (
      <div aria-hidden="true" />
    ) : (
      <OpponentSection
        player={player}
        // While it's someone's turn, everyone else's seat dims a little.
        dimmed={playing && gameState.currentPlayerIndex !== player.id}
        bubble={bubbles.bubbleFor(player.name)}
        isActive={!isDealing && gameState.currentPlayerIndex === player.id}
        hasPassed={player.hasPassed}
        position={position}
        face={faceFor(player.id)}
        layout={seats}
      />
    );

  // The felt: the round's plays, and the deck while dealing.
  const felt = (className) => (
    <div ref={tableCenterRef} className={`${className} min-w-0 flex items-center justify-center relative`}>
      <PlayArea
        pile={pile}
        trickOpen={!isDealing && gameState.currentPlay != null}
        leaderName={playersList[gameState.currentPlayerIndex]?.name.split(" #")[0]}
        lastPlayerName={isDealing ? null : currentPlayerName?.split(" #")[0]}
        roundNumber={gameState.roundNumber}
        isDealing={isDealing}
        cardWidth={deckW}
        showRound={!compact}
        turnSide={playing ? positionOf(gameState.currentPlayerIndex, viewIndex, playersList.length) : null}
      />
      {isDealing && gameState && (
        <DealAnimation
          dealerIndex={gameState.dealerIndex}
          viewIndex={viewIndex}
          deckWidth={deckW}
          seats={seatPositions(playersList.length)}
          seatsIn={playersList.map((p) => !p.isEliminated)}
          endsAt={isSoloGame ? null : dealEndsAt}
          onDealProgress={handleDealProgress}
          onComplete={handleDealComplete}
        />
      )}
    </div>
  );

  return (
    <div
      className="relative w-full h-full font-pixel-body text-parchment overflow-hidden flex flex-col"
      style={{ position: "fixed", inset: 0 }}
    >
      <TurnBanner active={myTurnNow} />
      {/* TABLE BACKDROP */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, #2e0f1d 0%, #14102a 60%, #0a0712 100%)",
        }}
      />
      <div className="absolute inset-0 dither-shadow opacity-40 pointer-events-none" />

      <TableHeader
        compact={compact}
        narrow={narrow}
        onExit={handleExit}
        badge={
          <div className="font-pixel-display text-[10px] text-bone/60">
            LOBBY <span className="text-glow-cyan">#{lobbyId}</span>
          </div>
        }
        title="THIRTEEN"
        match={gameState.matchNumber || 1}
        round={gameState.roundNumber}
        signal={<ConnectionSignal local={isSoloGame} connected={connected} ping={ping} />}
        rulesTone={{ bg: "#f4c430", deep: "#c89820", ink: "#1a1024" }}
        onRules={() => setShowRules(true)}
        onSettings={() => setShowSettings(!showSettings)}
        onPanel={() => setPanelOpen(true)}
        unread={unread}
      />

      {showRules && <RulesModal onClose={closeRules} />}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div
          className="absolute top-16 right-4 z-50 p-4"
          style={{
            backgroundColor: "#1f1a3d",
            border: "4px solid #0a0712",
            boxShadow: "0 0 0 4px #463a78, 4px 4px 0 #0a0712",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-pixel-display text-[10px] text-glow-gold">
              SETTINGS
            </span>
            <button
              onClick={() => setShowSettings(false)}
              className="font-pixel-display text-[10px] text-rose"
            >
              <PixelIcon name="close" size={12} title="Close" />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleToggleMute}
              className="pixel-btn font-pixel-display text-[9px] px-3 py-2"
              style={{
                backgroundColor: isMuted ? "#7a1530" : "#463a78",
                borderColor: isMuted ? "#3a0a18" : "#2a234d",
                color: "#ead8b1",
              }}
            >
              <span className="flex items-center justify-center gap-2"><PixelIcon name={isMuted ? "mute" : "speaker"} size={12} />{isMuted ? "SOUND OFF" : "SOUND ON"}</span>
            </button>
            <MotionToggle className="text-[9px] px-3 py-2" />
            <div>
              <label className="font-pixel-display text-[9px] text-bone/60">
                MASTER: {volumes.master}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={volumes.master}
                onChange={(e) => handleVolumeChange("master", e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="font-pixel-display text-[9px] text-bone/60">
                SFX: {volumes.sfx}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={volumes.sfx}
                onChange={(e) => handleVolumeChange("sfx", e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* GAME REGION */}
      <div
        className="relative flex-1 grid min-h-0"
        style={{ gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1fr) 300px" }}
      >
        {/* TABLE */}
        <div className={`relative flex flex-col min-h-0 ${narrow ? "px-2 pt-4 pb-2" : seats === "row" ? "px-3 py-1" : "px-4 py-2"}`}>
          {seats === "row" ? (
            // Short screen: slim plates beside the felt. The top seat sits
            // above the left one, so the table still reads clockwise.
            <div className="flex-1 min-h-0 flex items-center gap-3 my-1">
              <div className="flex flex-col justify-center gap-3 shrink-0" style={{ width: ROW_SEAT_W }}>
                {opponent(topPlayer, "top")}
                {opponent(leftPlayer, "left")}
              </div>
              {felt("self-stretch flex-1")}
              <div className="flex flex-col justify-center shrink-0" style={{ width: ROW_SEAT_W }}>
                {opponent(rightPlayer, "right")}
              </div>
            </div>
          ) : seats === "strip" ? (
            <>
              {/* Phone: the three opponents share a strip above the felt,
                  clockwise from your left. */}
              <div className="flex justify-center gap-2 relative z-10">
                {opponent(leftPlayer, "left")}
                {opponent(topPlayer, "top")}
                {opponent(rightPlayer, "right")}
              </div>
              {felt("flex-1 min-h-0 mt-4 mb-1")}
            </>
          ) : (
            <>
              {/* Top opponent */}
              <div className="flex justify-center relative z-10">{opponent(topPlayer, "top")}</div>

              {/* Middle row: left seat + felt + right seat. Equal side columns
                  keep the felt centered under the top seat; the row is capped so
                  seats stay close to the felt on wide screens. */}
              <div
                className="flex-1 grid items-center gap-4 my-2 min-h-0 w-full mx-auto"
                style={{ gridTemplateColumns: `${SIDE_SEAT_W}px minmax(0,1fr) ${SIDE_SEAT_W}px`, maxWidth: SIDE_SEAT_W * 2 + 820 + 32 }}
              >
                {opponent(leftPlayer, "left")}
                {felt("h-full")}
                {opponent(rightPlayer, "right")}
              </div>
            </>
          )}

          {/* My hand area: a gold frame while it's your turn, and your own
              chat bubble above it. */}
          <div
            className="relative"
            data-your-turn={myTurnNow ? "true" : undefined}
            style={myTurnNow ? { animation: "pulse-glow 1.6s ease-in-out infinite", backgroundColor: "rgba(244,196,48,0.06)" } : undefined}
          >
          {bubbles.bubbleFor(null, true) && (
            <ChatBubble name={(identity?.name || playerName || "You").split(" #")[0]} lines={bubbles.bubbleFor(null, true)} />
          )}
          <PlayerHand
            hand={bottomPlayer.hand}
            selectedCards={selectedCards}
            onSelectionChange={(cards) => {
              setSelectedCards(cards);
              safePlay("playClick");
            }}
            isActive={canSelect}
            isDealing={isDealing}
            cardWidth={handW}
            deckWidth={deckW}
            dealOriginRef={tableCenterRef}
            sortMode={handOrder.mode}
            order={handOrder.order}
            onReorder={handOrder.reorder}
            isEliminated={bottomPlayer.isEliminated}
          />
          </div>
          <GameControls
            onPlay={handlePlay}
            onPass={handlePass}
            canPlay={canPlay}
            canPass={canPass}
            isPlayerTurn={isMyTurn && !bottomPlayer.isEliminated}
            message={
              isDealing
                ? "Dealing..."
                : isMyTurn
                ? "Your turn!"
                : `Waiting for ${playersList[gameState.currentPlayerIndex].name.split(" #")[0]}...`
            }
            errorMessage={errorMessage}
            selectedCount={selectedCards.length}
            comboInfo={comboInfo}
            canSelect={canSelect}
            onClear={() => setSelectedCards([])}
            onSelectAll={() => setSelectedCards([...bottomPlayer.hand])}
            sortMode={handOrder.mode}
            onSortModeChange={changeSortMode}
            dense={seats === "row"}
          />
        </div>

        {/* SIDEBAR */}
        <TableSidebar compact={compact} open={panelOpen} onClose={closePanel}>
          <ScoreBoard
            players={gameState.players}
            currentPlayerIndex={isDealing ? -1 : gameState.currentPlayerIndex}
            roundNumber={gameState.roundNumber}
            matchWins={gameState.matchWins || [0, 0, 0, 0]}
            myIndex={myIndex}
            faceFor={faceFor}
          />
          <GameChat
            messages={messages}
            onSendMessage={handleSendMessage}
            avatarFor={avatarFor}
            colorFor={colorFor}
            {...chatLimit}
          />
        </TableSidebar>
      </div>

      {/* ROUND END / GAME OVER OVERLAY */}
      {showRoundEnd && roundEndData && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{
            backgroundColor: "rgba(10, 7, 18, 0.85)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            className="flex flex-col items-center gap-4 p-5 sm:p-8 max-h-full overflow-y-auto"
            style={{
              backgroundColor: "#1f1a3d",
              border: "4px solid #0a0712",
              boxShadow: "0 0 0 4px #463a78, 8px 8px 0 #0a0712",
              width: "min(400px, 100%)",
            }}
          >
            {roundEndData.isGameOver ? (
              <>
                <div className="font-pixel-display text-lg text-glow-gold shimmer-text">
                  MATCH OVER
                </div>
                <div className="font-pixel-display text-[10px] text-parchment">
                  {(() => {
                    const winner = roundEndData.players.find(
                      (p) => !p.isEliminated,
                    );
                    return winner
                      ? `${winner.name.toUpperCase()} WINS!`
                      : "GAME FINISHED";
                  })()}
                </div>
              </>
            ) : (
              <>
                <div className="font-pixel-display text-base text-glow-gold">
                  ROUND {roundEndData.roundNumber} COMPLETE
                </div>
                {roundEndData.roundWinnerName && (
                  <div className="font-pixel-display text-[10px] text-glow-cyan">
                    {roundEndData.roundWinnerName} won the round!
                  </div>
                )}
              </>
            )}

            {/* Score summary table */}
            <div className="w-full flex flex-col gap-1 mt-2">
              {roundEndData.players
                .slice()
                .sort((a, b) => a.score - b.score)
                .map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-1.5"
                    style={{
                      backgroundColor: p.isEliminated ? "#2a0e18" : "#14102a",
                      border: "2px solid #1f1a3d",
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="font-pixel-display text-[10px] shrink-0"
                        style={{
                          color: i === 0 ? "#f4c430" : "#ead8b1",
                          width: 20,
                        }}
                      >
                        #{i + 1}
                      </span>
                      <span className="font-pixel-display text-[9px] text-parchment truncate">
                        {p.name}
                      </span>
                      {p.isEliminated && (
                        <span
                          className="font-pixel-display text-[7px] px-1"
                          style={{
                            backgroundColor: "#7a1530",
                            color: "#ead8b1",
                          }}
                        >
                          ELIMINATED
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-pixel-display text-[10px] text-glow-gold whitespace-nowrap">
                        {p.score} pts
                      </span>
                      {p.matchWins > 0 && (
                        <span
                          className="font-pixel-display text-[7px] px-1"
                          style={{
                            backgroundColor: "#f4c430",
                            color: "#1a1024",
                          }}
                        >
                          {p.matchWins}W
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            {roundEndData.isGameOver ? (
              <div className="flex flex-col items-center gap-3 mt-4">
                {amHost || isSoloGame ? (
                  <>
                    <button
                      onClick={handleRematch}
                      className="pixel-btn font-pixel-display text-[10px] px-6 py-3"
                      style={{
                        backgroundColor: "#f4c430",
                        borderColor: "#c89820",
                        color: "#1a1024",
                      }}
                    >
                      REMATCH
                    </button>
                    <button
                      onClick={handleExit}
                      className="pixel-btn font-pixel-display text-[10px] px-6 py-3"
                      style={{
                        backgroundColor: "#7a1530",
                        borderColor: "#3a0a18",
                        color: "#ead8b1",
                      }}
                    >
                      ABANDON LOBBY
                    </button>
                  </>
                ) : (
                  <>
                    <div className="font-pixel-display text-[9px] text-bone/60 blink">
                      WAITING FOR HOST...
                    </div>
                    <button
                      onClick={handleExit}
                      className="pixel-btn font-pixel-display text-[10px] px-6 py-3"
                      style={{
                        backgroundColor: "#7a1530",
                        borderColor: "#3a0a18",
                        color: "#ead8b1",
                      }}
                    >
                      ABANDON LOBBY
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="font-pixel-display text-[8px] text-bone/60 mt-2 blink">
                NEXT ROUND STARTING...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GameThirteen;
