// FLAG RULES — which pairs of accounts look like one feeding the other
// credits. Pure: flags.js reads the hands, this decides.

export const FLAG_WINDOW_DAYS = 30;
export const FLAG_MIN_FLOW = 1000; // A lost at least this much to B...
export const FLAG_MIN_SHARE = 0.6; // ...which is at least this share of everything A lost...
export const FLAG_MAX_BACKFLOW = 0.2; // ...and B lost back at most this share of it.
export const BIG_FOLD_SHARE = 0.5; // a clue: folding after putting in half your stack or more

/**
 * hands: [{ id, playedAt, isPrivate, seats: [{ user_id, net, stack_before, committed, folded_street }] }].
 * Each hand's losses are shared among its winners in proportion to what they won.
 * → { pairs: Map("loser>winner" → { loser, winner, flow, hands, privateHands, bigFolds, lastAt }),
 *     lost: Map(loser → everything they lost) }
 */
export function pairFlows(hands) {
  const pairs = new Map();
  const lost = new Map();
  for (const h of hands) {
    const winners = h.seats.filter((s) => s.user_id && s.net > 0);
    const won = winners.reduce((t, s) => t + s.net, 0);
    for (const l of h.seats.filter((s) => s.user_id && s.net < 0)) {
      lost.set(l.user_id, (lost.get(l.user_id) ?? 0) - l.net);
      const bigFold = l.folded_street != null && l.committed >= l.stack_before * BIG_FOLD_SHARE;
      for (const w of winners) {
        const key = `${l.user_id}>${w.user_id}`;
        const p = pairs.get(key) ?? { loser: l.user_id, winner: w.user_id, flow: 0, hands: 0, privateHands: 0, bigFolds: 0, lastAt: null };
        p.flow += (-l.net * w.net) / won;
        p.hands += 1;
        if (h.isPrivate) p.privateHands += 1;
        if (bigFold) p.bigFolds += 1;
        if (!p.lastAt || h.playedAt > p.lastAt) p.lastAt = h.playedAt;
        pairs.set(key, p);
      }
    }
  }
  return { pairs, lost };
}

/** The pairs to flag, newest flow first. reviews: Map("loser>winner" → when an admin dismissed it). */
export function flagPairs({ pairs, lost }, reviews = new Map()) {
  const flags = [];
  for (const [key, p] of pairs) {
    const back = pairs.get(`${p.winner}>${p.loser}`)?.flow ?? 0;
    const share = p.flow / lost.get(p.loser);
    const reviewed = reviews.get(key);
    if (p.flow < FLAG_MIN_FLOW || share < FLAG_MIN_SHARE || back > p.flow * FLAG_MAX_BACKFLOW) continue;
    if (reviewed && reviewed >= p.lastAt) continue;
    flags.push({ ...p, flow: Math.round(p.flow), back: Math.round(back), share: Math.round(share * 100) / 100 });
  }
  return flags.sort((a, b) => b.lastAt - a.lastAt);
}
