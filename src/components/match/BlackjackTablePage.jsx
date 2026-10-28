// BLACKJACK TABLE PAGE — a Blackjack table's match page, which is your own
// time at the table (server/matches.js): your figures, everyone's net, and the
// round log — each round's hands with their totals and results, the dealer's
// cards and total, and what the round came to.

import React from "react";
import { Panel } from "../PixelUI";
import CardChip from "../CardChip";
import LevelTag from "../LevelTag";
import { handTotal } from "../../utils/blackjack/rules";

const ACCENT = "#5fd4d6";
const UP = "#9bd14f";
const DOWN = "#e85a7a";
const RESULT = { blackjack: "Blackjack", win: "Win", lose: "Lose", push: "Push" };
const RESULT_TONE = { blackjack: "#f4c430", win: UP, lose: DOWN, push: "#ead8b1" };

const short = (name = "") => name.split(" #")[0];
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const toneOf = (n) => (n > 0 ? UP : n < 0 ? DOWN : "#ead8b1");
// A card id is the engine's: rank, suit, then the deck it came from ("10♦.3").
const card = (id) => {
  const face = id.split(".")[0];
  return { id, rank: face.slice(0, -1), suit: face.slice(-1) };
};
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : "-");

function formatDuration(seconds) {
  const m = Math.round((seconds || 0) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function Tile({ label, value, note, color = "#ead8b1" }) {
  return (
    <div className="flex flex-col gap-2 p-3" style={{ backgroundColor: "#14102a", boxShadow: "0 0 0 2px #2a234d" }}>
      <span className="font-pixel-body text-[20px] text-bone leading-none">{label}</span>
      <span className="font-pixel-display text-[18px] leading-none" style={{ color }}>
        {value}
      </span>
      <span className="font-pixel-body text-[18px] text-bone/70 leading-none">{note}</span>
    </div>
  );
}

function Chips({ ids }) {
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id, i) => (
        <CardChip key={`${id}-${i}`} card={card(id)} />
      ))}
    </span>
  );
}

const totalOf = (ids) => handTotal(ids.map(card)).total;

function RoundList({ rounds }) {
  if (!rounds?.length) return <p className="font-pixel-body text-[20px] text-bone/70 p-3">No rounds were kept for this table.</p>;
  return (
    <ol className="flex flex-col" aria-label="Your rounds">
      {rounds.map((r, i) => {
        const dealer = r.dealer?.cards ?? [];
        const dealerTotal = r.dealer?.total ?? (dealer.length ? totalOf(dealer) : null);
        return (
          <li
            key={r.n}
            className="grid grid-cols-[44px_minmax(0,1fr)_72px] items-start gap-x-3 gap-y-2 px-3 py-2"
            style={{ backgroundColor: i % 2 ? "#181432" : "transparent", boxShadow: r.net > 0 ? `inset 3px 0 0 ${UP}` : undefined }}
          >
            <span className="font-pixel-display text-[10px] text-bone/70 pt-1">#{r.n}</span>
            <div className="flex flex-col gap-2 min-w-0">
              {r.hands.map((h, j) => {
                const total = totalOf(h.cards);
                return (
                  <div key={j} className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Your hand">
                    <Chips ids={h.cards} />
                    <span className="font-pixel-body text-[20px] text-bone tabular-nums">{total > 21 ? `${total} (bust)` : total}</span>
                    <span className="font-pixel-display text-[8px] px-1.5 py-1" style={{ backgroundColor: "#463a78", color: RESULT_TONE[h.result] }}>
                      {RESULT[h.result] ?? h.result}
                    </span>
                    <span className="font-pixel-body text-[18px] text-bone/60 tabular-nums">bet {h.bet}</span>
                  </div>
                );
              })}
              {dealer.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Dealer">
                  <Chips ids={dealer} />
                  <span className="font-pixel-body text-[20px] text-bone/80 tabular-nums">
                    Dealer {dealerTotal}
                    {dealerTotal > 21 ? " (bust)" : ""}
                  </span>
                </div>
              )}
            </div>
            <span className="font-pixel-body text-[22px] text-right tabular-nums" style={{ color: toneOf(r.net) }}>
              {signed(r.net)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Players({ players }) {
  return (
    <ol className="flex flex-col" aria-label="Players">
      {players.map((p, i) => (
        <li
          key={`${p.name}-${i}`}
          className="grid grid-cols-[20px_minmax(0,1fr)_36px_56px] sm:grid-cols-[28px_minmax(0,1fr)_90px_72px] items-center gap-3 px-3 font-pixel-body text-[20px]"
          style={{ minHeight: 40, backgroundColor: p.you ? "#2a2410" : i % 2 ? "#181432" : "transparent" }}
        >
          <span className="font-pixel-display text-[10px] text-bone/60">{i + 1}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate text-parchment">{p.name ? short(p.name) : "Someone"}</span>
            <LevelTag level={p.xpLevel} />
            {p.you && <span className="font-pixel-display text-[8px] px-1 py-0.5" style={{ backgroundColor: "#f4c430", color: "#1a1024" }}>YOU</span>}
          </span>
          <span className="text-bone/80 text-right tabular-nums" title={`${p.rounds} rounds`}>
            {p.rounds}
            <span className="hidden sm:inline"> rounds</span>
          </span>
          <span className="text-right tabular-nums" style={{ color: toneOf(p.net) }}>
            {signed(p.net)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function BlackjackTablePage({ table }) {
  const you = table.you;
  return (
    <>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-pixel-display text-[18px]" style={{ color: ACCENT }}>
          BLACKJACK
        </h1>
        <span
          className="self-center font-pixel-display text-[10px] px-1.5 py-1"
          style={{ backgroundColor: table.credit ? "#f4c430" : "#14102a", color: table.credit ? "#14102a" : "#ead8b1", boxShadow: "0 0 0 2px #2a234d" }}
        >
          {table.credit ? "CREDITS" : "FREE"}
        </span>
        <span className="font-pixel-body text-[20px] text-bone">
          {table.table || "Blackjack table"} · {new Date(table.finishedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {table.roundCount ?? 0} rounds dealt ·{" "}
          {table.isPrivate ? "Private table" : "Public table"}
        </span>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Tile label="Net" value={signed(you.net)} color={toneOf(you.net)} note={table.credit ? "credits won or lost" : "chips won or lost"} />
        <Tile label="Rounds" value={you.roundsPlayed} note="you bet in" />
        <Tile label="Won" value={you.roundsWon} note={`${pct(you.roundsWon, you.roundsPlayed)} of rounds`} />
        <Tile label="Blackjacks" value={you.blackjacks} note="dealt to you" />
        <Tile label="Biggest win" value={you.biggestWin} note="in one round" />
        <Tile label="Time" value={formatDuration(you.seconds)} note="at the table" />
      </div>

      <Panel title="Players" icon="crown" deep="#2f8f92">
        <Players players={table.players} />
      </Panel>

      <Panel title="Your rounds" icon="cards" deep="#463a78">
        <RoundList rounds={you.rounds} />
      </Panel>
    </>
  );
}
