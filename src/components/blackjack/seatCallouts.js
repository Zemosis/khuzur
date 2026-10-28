// SEAT CALLOUTS — what each player just did, popped over their plate: a
// bet, READY, insurance, HIT, STAND, DOUBLE, SPLIT, and what came of it
// (BUST, BLACKJACK!). A seat's callouts show one after another. A move shows
// at once; what came of it waits for the cards it's about to land.

import { useState } from "react";
import { actionCallout } from "./tableInfo";
import { PHASES } from "../../utils/blackjack/engine";
import { CARD_MS, dealMs } from "./cardMotion";

const OUTCOMES = new Set(["bust", "blackjack"]);

/** The callouts `view` brings since `prev`: [{ id, seat, type, label, bg, fg, delay }]. */
export function calloutsBetween(prev, view) {
  const before = prev.events ?? [];
  const events = view.events ?? [];
  const dealt = view.roundNumber !== prev.roundNumber;
  // The same list grown, or a new one (each betting window and deal starts afresh).
  const grown = !dealt && before.length <= events.length && JSON.stringify(events.slice(0, before.length)) === JSON.stringify(before);
  const fresh = (grown ? events.slice(before.length) : events).map((e, i) => ({ ...e, n: (grown ? before.length : 0) + i }));
  // READY has no event: a seat that turned ready while betting.
  if (view.phase === PHASES.BETTING) view.seats.forEach((p, seat) => p?.ready && !prev.seats[seat]?.ready && fresh.push({ type: "ready", seat, n: `r${seat}` }));

  const cards = view.seats.reduce((n, p) => n + (p?.inRound ? 2 : 0), 2);
  const landing = dealt ? dealMs(cards, events.some((e) => e.type === "shuffle")) : CARD_MS;
  return fresh.flatMap((e) => {
    const c = e.seat != null && actionCallout(e);
    if (!c) return [];
    return [{ ...c, id: `${view.roundNumber}-${view.phase}-${e.n}`, seat: e.seat, type: e.type, delay: OUTCOMES.has(e.type) ? landing : 0 }];
  });
}

/**
 * Each seat's callout to show now (or none) for the views drawn so far.
 * Returns [calloutFor(seat), done(seat, id)].
 */
export function useSeatCallouts(view) {
  const [seen, setSeen] = useState(view);
  const [queues, setQueues] = useState({});
  if (view !== seen) {
    setSeen(view);
    const fresh = calloutsBetween(seen, view);
    if (fresh.length)
      setQueues((q) => {
        const next = { ...q };
        for (const c of fresh) {
          let line = next[c.seat] ?? [];
          // A newer bet replaces one still waiting its turn.
          if (c.type === "bet" && line.length > 1 && line.at(-1).type === "bet") line = line.slice(0, -1);
          next[c.seat] = [...line, c];
        }
        return next;
      });
  }
  const calloutFor = (seat) => queues[seat]?.[0] ?? null;
  const done = (seat, id) => setQueues((q) => ({ ...q, [seat]: (q[seat] ?? []).filter((c) => c.id !== id) }));
  return [calloutFor, done];
}
