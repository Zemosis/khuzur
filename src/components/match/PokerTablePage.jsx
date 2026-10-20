// POKER TABLE PAGE — a poker table's match page, which is your own time at
// the table (server/matches.js): your figures, everyone's chips won or lost,
// your chips over the hands, the hand ranks you showed down, and every hand
// you played — your cards, the board, and who won it with what. Tables played
// before hands were logged have no hand detail: the page says so.

import React, { useState } from "react";
import { Panel } from "../PixelUI";
import CardChip from "../CardChip";
import ChipTimeline from "./ChipTimeline";
import ShowdownHands from "../profile/ShowdownHands";

const TIER_TONE = { LOW: "#9bd14f", MID: "#f4c430", HIGH: "#e85a7a" };
const UP = "#9bd14f";
const DOWN = "#e85a7a";
const STREET = { PREFLOP: "preflop", FLOP: "on the flop", TURN: "on the turn", RIVER: "on the river" };
const FILTERS = [
  ["all", "All"],
  ["won", "Won"],
  ["showdown", "Showdowns"],
];

const short = (name = "") => name.split(" #")[0];
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const toneOf = (n) => (n > 0 ? UP : n < 0 ? DOWN : "#ead8b1");
const card = (id) => ({ id, rank: id.slice(0, -1), suit: id.slice(-1) });
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
      {ids.map((id) => (
        <CardChip key={id} card={card(id)} />
      ))}
    </span>
  );
}

/** Who took the pot, in words, from your side of it. */
function outcome(hand, you) {
  const mine = hand.won > 0;
  const others = hand.winners.filter((w) => w.name !== you);
  if (mine && !others.length) return hand.shown ? `You won with ${lower(hand.shown)}` : "You won: everyone folded";
  if (mine) return `You split with ${others.map((w) => short(w.name)).join(", ")}`;
  const names = others.map((w) => short(w.name)).join(" and ");
  const how = others.find((w) => w.hand)?.hand;
  const lead = hand.folded ? `You folded ${STREET[hand.folded]} · ` : hand.showdown ? "You lost the showdown · " : "";
  return `${lead}${names || "Nobody"} won${how ? ` with ${lower(how)}` : ""}`;
}
const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1);

function HandList({ hands, you }) {
  const [filter, setFilter] = useState("all");
  const shown = hands.filter((h) => (filter === "won" ? h.won > 0 : filter === "showdown" ? h.showdown : true));
  return (
    <div className="flex flex-col gap-3 p-3">
      <div role="group" aria-label="Show hands" className="flex gap-2">
        {FILTERS.map(([id, text]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className="pixel-hbtn font-pixel-display text-[10px] uppercase px-3 py-2 leading-none"
            style={{ backgroundColor: filter === id ? "#f4c430" : "#14102a", color: filter === id ? "#14102a" : "#ead8b1", boxShadow: "0 0 0 2px #2a234d" }}
          >
            {text}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="font-pixel-body text-[20px] text-bone/70">No hands here.</p>
      ) : (
        <ol className="flex flex-col" aria-label="Your hands">
          {shown.map((h, i) => (
            // On a phone the board and what happened drop under the hand's number, cards and result.
            <li
              key={h.n}
              className="grid grid-cols-[44px_minmax(0,1fr)_64px] sm:grid-cols-[56px_92px_minmax(0,1fr)_72px] items-center gap-x-3 gap-y-1.5 px-2 py-2"
              style={{
                backgroundColor: i % 2 ? "#181432" : "transparent",
                boxShadow: h.won > 0 ? `inset 3px 0 0 ${UP}` : undefined,
              }}
            >
              <span className="font-pixel-display text-[10px] text-bone/70">#{h.n}</span>
              <span className="flex items-center gap-2" style={{ opacity: h.folded ? 0.55 : 1 }} aria-label="Your cards">
                <Chips ids={h.hole} />
              </span>
              <span className="flex flex-col gap-1 min-w-0 col-span-3 sm:col-span-1 order-last sm:order-none">
                {h.board.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-2" aria-label="Board">
                    <Chips ids={h.board} />
                    {h.rank && <span className="font-pixel-display text-[8px] px-1.5 py-1 whitespace-nowrap" style={{ backgroundColor: h.won > 0 ? "#f4c430" : "#463a78", color: h.won > 0 ? "#1a1024" : "#ead8b1" }}>{h.rank}</span>}
                  </span>
                ) : (
                  <span className="font-pixel-body text-[18px] text-bone/50 leading-none">no flop</span>
                )}
                <span className="font-pixel-body text-[18px] text-bone/80 leading-tight">{outcome(h, you)}</span>
              </span>
              <span className="font-pixel-body text-[22px] text-right tabular-nums" style={{ color: toneOf(h.net) }}>
                {signed(h.net)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Players({ players }) {
  return (
    <ol className="flex flex-col" aria-label="Players">
      {players.map((p, i) => (
        <li
          key={`${p.kind}-${p.name}`}
          className="grid grid-cols-[20px_minmax(0,1fr)_36px_56px] sm:grid-cols-[28px_minmax(0,1fr)_90px_72px] items-center gap-3 px-3 font-pixel-body text-[20px]"
          style={{ minHeight: 40, backgroundColor: p.you ? "#2a2410" : i % 2 ? "#181432" : "transparent" }}
        >
          <span className="font-pixel-display text-[10px] text-bone/60">{i + 1}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate text-parchment">{p.name ? short(p.name) : "Someone"}</span>
            {p.kind === "cpu" && <span className="font-pixel-display text-[8px] px-1 py-0.5" style={{ backgroundColor: "#2a234d", color: "#ead8b1" }}>CPU</span>}
            {p.you && <span className="font-pixel-display text-[8px] px-1 py-0.5" style={{ backgroundColor: "#f4c430", color: "#1a1024" }}>YOU</span>}
          </span>
          <span className="text-bone/80 text-right tabular-nums" title={`${p.hands} hands`}>
            {p.hands}
            <span className="hidden sm:inline"> hands</span>
          </span>
          <span className="text-right tabular-nums" style={{ color: toneOf(p.net) }}>
            {signed(p.net)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function PokerTablePage({ table }) {
  const you = table.you;
  const hands = you.hands;
  return (
    <>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-pixel-display text-[18px]" style={{ color: "#9bd14f" }}>
          POKER
        </h1>
        <span
          className="self-center font-pixel-display text-[10px] px-1.5 py-1"
          style={{ backgroundColor: table.tier ? TIER_TONE[table.tier] : "#14102a", color: table.tier ? "#14102a" : "#ead8b1", boxShadow: "0 0 0 2px #2a234d" }}
        >
          {table.tier ?? "FREE"}
        </span>
        <span className="font-pixel-body text-[20px] text-bone">
          {table.table || "Poker table"} · {new Date(table.finishedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {table.handCount ?? 0} hands dealt ·{" "}
          {table.isPrivate ? "Private table" : "Public table"}
        </span>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile label="Chips" value={signed(you.net)} color={toneOf(you.net)} note={table.tier ? "credits won or lost" : "won or lost here"} />
        <Tile label="Hands" value={you.handsPlayed} note={`${you.handsWon} won (${pct(you.handsWon, you.handsPlayed)})`} />
        <Tile label="Biggest pot" value={you.biggestPot} note="won in one hand" />
        <Tile label="Played the hand" value={pct(you.vpipHands, you.handsPlayed)} note="put chips in by choice" />
        <Tile label="Showdowns" value={`${you.showdownsWon}/${you.showdowns}`} note={`won · ${formatDuration(you.seconds)} at the table`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
        <Panel title="Players" icon="crown" deep="#6a9a30">
          <Players players={table.players} />
        </Panel>
        <Panel title="Showdown hands" icon="cards" deep="#463a78">
          <div className="p-3">
            {hands ? <ShowdownHands ranks={you.showdownRanks} /> : <NoHands />}
          </div>
        </Panel>
      </div>

      <Panel title="Your chips" icon="star" deep="#463a78">
        {hands?.length ? <ChipTimeline hands={hands} /> : <div className="p-3"><NoHands /></div>}
      </Panel>

      <Panel title="Your hands" icon="cards" deep="#463a78">
        {hands ? <HandList hands={hands} you={you.name} /> : <div className="p-3"><NoHands /></div>}
      </Panel>
    </>
  );
}

function NoHands() {
  return <p className="font-pixel-body text-[20px] text-bone/70">This table was played before hands were kept hand by hand, so only the totals are here.</p>;
}
