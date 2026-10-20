// HIGHLIGHTS — a round's key moments, recorded with the round (game_rounds)
// for the match page. Built as the round ends, from what the engines already
// keep: Thirteen's move history and Muushig's event log, both of which run
// across the whole match, so each builder first cuts out the round just ended.
// Cards are kept as { rank, suit }: ids mean nothing once the match is over.

const BIG = new Set(["FOUR_OF_A_KIND", "POKER", "STRAIGHT_FLUSH", "ROYAL_FLUSH"]);

const bare = ({ rank, suit }) => ({ rank, suit });

/**
 * Thirteen, from the move history as it stands at ROUND_END: every big play
 * (four of a kind, Poker, straight or royal flush) and every 2 played as a
 * single, in order, then the play that won the round. A winning play that is
 * also big is only recorded as the win.
 */
export function thirteenHighlights(moveHistory = []) {
  const end = moveHistory.findLastIndex((m) => m.type === "ROUND_END");
  const stop = end === -1 ? moveHistory.length : end;
  const start = moveHistory.slice(0, stop).findLastIndex((m) => m.type === "NEW_ROUND" || m.type === "ROUND_END") + 1;
  const plays = moveHistory.slice(start, stop).filter((m) => m.type === "PLAY");
  if (!plays.length) return [];

  const won = plays.at(-1);
  const out = [];
  for (const m of plays.slice(0, -1)) {
    const combo = m.combination?.type;
    if (BIG.has(combo)) out.push({ type: "big", seat: m.playerIndex, combo, cards: m.cards.map(bare) });
    else if (combo === "SINGLE" && m.cards[0]?.rank === "2") {
      out.push({ type: "two", seat: m.playerIndex, combo, cards: m.cards.map(bare) });
    }
  }
  out.push({ type: "win", seat: won.playerIndex, combo: won.combination?.type ?? null, cards: won.cards.map(bare) });
  return out;
}

/**
 * Muushig, from the event log as it stands at roundEnd: each seat going in or
 * folding, the dealer taking or keeping the trump, and who ate each trick with
 * which card.
 */
export function muushigHighlights(events = []) {
  const end = events.findLastIndex((e) => e.type === "roundEnd");
  const stop = end === -1 ? events.length : end;
  const start = events.slice(0, stop).findLastIndex((e) => e.type === "roundEnd") + 1;
  const round = events.slice(start, stop);

  const out = [];
  for (const e of round) {
    if (e.type === "playIn") out.push({ type: "in", seat: e.seat });
    else if (e.type === "fold") out.push({ type: "fold", seat: e.seat });
    else if (e.type === "takeTrump") out.push({ type: "takeTrump", seat: e.seat, card: bare(e.card) });
    else if (e.type === "keepTrump") out.push({ type: "keepTrump", seat: e.seat });
    else if (e.type === "eat") {
      const winning = round.find((p) => p.type === "play" && p.trick === e.trick && p.seat === e.seat);
      out.push({ type: "eat", seat: e.seat, trick: e.trick, card: winning ? bare(winning.card) : null });
    }
  }
  return out;
}
