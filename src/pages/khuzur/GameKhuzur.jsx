// GAME KHUZUR — a Khuzur practice table, run entirely in the browser.
//
// The rules live in utils/khuzur/engine.js and the CPU in utils/khuzur/ai.js.
// You sit in seat 0, at the bottom; the other seats are CPUs, clockwise from
// your left. The first match opens with the draw for the deal; PLAY AGAIN
// deals the next match at the same table with no draw.
//
// Every move goes through the engine inside try/catch: a refused move shows
// the engine's reason and nothing changes. CPU moves come one at a time, a
// beat apart, so you can follow the stack.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useTableMetrics } from "../../hooks/useTableMetrics";
import { useElementWidth } from "../../hooks/useElementWidth";
import { ConnectionSignal, TableHeader } from "../../components/TableChrome";
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
  beat,
  canSwapSeven,
  createMatch,
  drawForDeal,
  isValidTable,
  lead,
  leadLimit,
  maxDrawDepth,
  pickUp,
  seatCount,
  standings,
  startNextMatch,
  surrender,
  swapTrumpSeven,
  topLayer,
} from "../../utils/khuzur/engine";
import { aiAction, applyAction } from "../../utils/khuzur/ai";

const ME = 0;
const DEFAULT_TABLE = { perTeam: 2, teams: 2, handSize: 5 };
const CPU_VARIANTS = [2, 3, 4, 5, 6];
const CPU_DELAY = 900;
const CPU_DELAY_REDUCED = 300;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const short = (name = "") => name.split(" #")[0];

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
  const navigate = useNavigate();
  const location = useLocation();
  const { identity } = useAuth();
  const { handW, compact, narrow } = useTableMetrics();

  const asked = location.state?.table;
  const table = asked && isValidTable(asked) && [5, 7].includes(asked.handSize) ? asked : DEFAULT_TABLE;
  const myName = short(location.state?.playerName ?? identity?.name ?? "YOU");
  const players = useMemo(
    () =>
      Array.from({ length: seatCount(table) }, (_, seat) =>
        seat === ME ? { name: myName, type: "HUMAN" } : { name: BOT_NAMES[seat - 1], type: "AI" },
      ),
    [table, myName],
  );

  const [game, setGame] = useState(() => createMatch({ players, table }));
  const [drawnKey, setDrawnKey] = useState(() => (game.phase === PHASES.DRAW ? null : game.matchNumber));
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState(null);
  const [depth, setDepth] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const stage = game.phase === PHASES.DRAW || drawnKey !== game.matchNumber ? "draw" : "play";
  const me = game.players[ME];
  const myTurn = stage === "play" && game.phase === PHASES.PLAY && game.turn === ME;
  const myDraw = game.phase === PHASES.DRAW && game.turn === ME;
  const over = game.phase === PHASES.MATCH_OVER;

  const apply = useCallback(
    (fn) => {
      try {
        setGame(fn(game));
        setSelected([]);
        setError(null);
      } catch (e) {
        setError(e.message);
        try {
          soundManager.playError?.();
        } catch {
          /* audio not ready */
        }
      }
    },
    [game],
  );

  // CPU moves: one at a time, a beat apart. After the draw, play waits for the
  // winning card to show (DealDraw's onDone).
  useEffect(() => {
    if (over || game.turn === ME || game.turn == null) return;
    if (stage === "draw" && game.phase !== PHASES.DRAW) return;
    const timer = setTimeout(
      () =>
        setGame((g) => {
          if (g !== game) return g;
          try {
            return applyAction(g, aiAction(g));
          } catch (e) {
            setError(e.message);
            return g;
          }
        }),
      reducedMotion() ? CPU_DELAY_REDUCED : CPU_DELAY,
    );
    return () => clearTimeout(timer);
  }, [game, stage, over]);

  useEffect(() => {
    if (!myTurn && !myDraw) return;
    try {
      soundManager.playTurnAlert?.();
    } catch {
      /* audio not ready */
    }
  }, [myTurn, myDraw, game.turn]);

  const hand = useMemo(() => [...me.hand].sort((a, b) => cardPower(a, game.trumpSuit) - cardPower(b, game.trumpSuit)), [me.hand, game.trumpSuit]);
  const picked = hand.filter((card) => selected.includes(card.id));
  const toggle = (id) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const top = topLayer(game);
  const mode = myTurn ? (game.stack ? "beat" : "lead") : "wait";
  const limit = game.phase === PHASES.PLAY ? leadLimit(game) : 0;
  const reason = mode === "lead" ? leadReason(picked, limit) : mode === "beat" ? beatReason(picked, top, game.trumpSuit) : null;

  const n = game.players.length;
  const positionOfSeat = (seat) => positionOf(seat, ME, n);
  const colorOf = (seat) => seatColor(table, seat);
  const nameOf = (seat) => game.players[seat]?.name ?? "";
  const faceFor = (seat) => (seat === ME ? { variant: identity?.avatar ?? 1, customAvatarData: identity?.customAvatar } : { variant: CPU_VARIANTS[(seat - 1) % CPU_VARIANTS.length], customAvatarData: null });
  const placeOf = (seat) => game.places[game.players[seat].team];

  const seats = game.players
    .filter((p) => p.id !== ME)
    .map((p) => {
      const chips = [];
      const place = placeOf(p.id);
      if (place) chips.push({ label: ordinal(place), bg: place === 1 ? "#f4c430" : "#ead8b1" });
      else if (stage === "play" && game.turn === p.id) chips.push({ label: "TURN", bg: "#f4c430", blink: true });
      if (game.dealer === p.id && stage === "play") chips.push({ label: "DEALER", bg: "#5fd4d6" });
      if (teammates(table, ME, p.id)) chips.push({ label: "MATE", bg: colorOf(p.id) });
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
              onDone={() => setDrawnKey(game.matchNumber)}
            />
          );
        }
      : null;

  // The status line over your hand.
  let status;
  if (game.phase === PHASES.DRAW) status = myDraw ? "Draw for the deal: pick how deep, then TAKE" : `${short(nameOf(game.turn))} is drawing for the deal`;
  else if (stage === "draw") status = `${short(nameOf(game.dealer))} deals`;
  else if (over) status = "The match is over";
  else if (me.out) status = `You're out in ${ordinal(placeOf(ME))} place. The rest play on.`;
  else if (myTurn) status = game.stack ? "Beat every top card, or pick the stack up" : "Your lead";
  else status = game.stack ? `${short(nameOf(game.turn))} must beat` : `${short(nameOf(game.turn))} leads`;

  const rows = over
    ? standings(game).map(({ place, seats: s, team }) => ({
        place,
        names: s.map((seat) => short(nameOf(seat))),
        color: table.perTeam === 1 ? FFA_COLOR : TEAM_COLORS[team],
        mine: s.includes(ME),
      }))
    : [];

  const playAgain = () =>
    apply((g) => {
      const next = startNextMatch(g);
      setDrawnKey(next.matchNumber);
      return next;
    });

  return (
    <div className="relative w-full h-screen starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TableHeader
        compact={compact}
        narrow={narrow}
        onExit={() => navigate("/lobby-khuzur")}
        title="KHUZUR"
        kicker="PRACTICE"
        titleClass=""
        titleColor="#f08a4b"
        match={game.matchNumber}
        signal={<ConnectionSignal local />}
        rulesTone={{ bg: "#f08a4b", deep: "#a8552a", ink: INK }}
        onRules={() => setShowRules(true)}
        onSettings={() => setShowSettings(true)}
      />

      <main className="flex-1 min-h-0 flex flex-col items-center justify-between gap-2 px-3 pb-3 pt-2">
        <div className="font-pixel-display text-[10px] text-bone/70 self-start flex flex-wrap gap-x-3 gap-y-1 [&>span]:whitespace-nowrap">
          <span>MATCH {game.matchNumber}</span>
          <span>{table.perTeam === 1 ? `FREE FOR ALL · ${n} PLAYERS` : Array(table.teams).fill(table.perTeam).join(" V ")}</span>
          <span>{table.handSize}-CARD GAME</span>
        </div>
        <div className="flex-1 min-h-0 w-full max-w-[1200px] flex items-center justify-center">
          <KhuzurTable game={game} seats={seats} colorOf={colorOf} positionOfSeat={positionOfSeat} compact={narrow} overlay={drawOverlay} drawing={stage === "draw"} />
        </div>

        <div className="flex flex-col items-center gap-2 w-full max-w-[1100px]">
          <div className="flex items-center gap-3">
            <span className="font-pixel-display text-[10px] px-2 py-1" style={{ backgroundColor: colorOf(ME), color: INK }}>
              YOU{table.perTeam > 1 ? " · TEAM" : ""}
            </span>
            <span className="font-pixel-body text-[22px] text-parchment leading-none" aria-live="polite">
              {status}
            </span>
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
                onClick={() => apply((g) => drawForDeal(g, ME, Math.min(depth, maxDrawDepth(g))))}
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
              canSwap={canSwapSeven(game, ME) && stage === "play"}
              playing={game.phase === PHASES.PLAY && stage === "play"}
              onLead={() => apply((g) => lead(g, ME, picked.map((c) => c.id)))}
              onBeat={() => apply((g) => beat(g, ME, picked.map((c) => c.id)))}
              onPickUp={() => apply((g) => pickUp(g, ME))}
              onSwap={() => apply((g) => swapTrumpSeven(g, ME))}
              onSurrender={() => setConfirming(true)}
            />
          )}
        </div>
      </main>

      {confirming && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(10,7,18,0.7)" }}>
          <div role="dialog" aria-label="SURRENDER?" className="flex flex-col gap-3 p-5 max-w-[92vw]" style={{ backgroundColor: "#14102a", border: "4px solid #7a1530", boxShadow: `0 0 0 4px ${INK}` }}>
            <p className="font-pixel-body text-[22px] text-parchment">
              Give up this match? {table.perTeam > 1 ? "Your team takes" : "You take"} last place.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  apply((g) => surrender(g, ME));
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

      {over && <Standings rows={rows} onPlayAgain={playAgain} onLeave={() => navigate("/lobby-khuzur")} />}
      {showRules && <KhuzurRules onClose={() => setShowRules(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
