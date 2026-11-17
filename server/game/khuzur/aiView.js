// KHUZUR CPU — WHAT A SEAT CAN KNOW
//
// readTable(state, seat) is the only place the CPU reads the match. It takes
// what a player sitting there sees, or could remember from the table: its
// own hand, the face-up trump, every card led or beaten, who picked up which
// stack, who drew the face-up trump, how many cards everyone holds, how many
// are left to draw and how many lie in the dead pile. Other hands are read
// for their length and nothing else.
//
// From the match's history it remembers:
//  - Known cards. A stack is face up, so whoever picks it up is known to hold
//    those cards until they play them. The same goes for the face-up trump,
//    for whoever draws it last or swaps their 7 for it.
//  - Gone cards. A stack that went all the way round is out for good. A
//    surrendered hand goes to the dead pile unseen: those cards are gone too,
//    but nobody knows which, so they stay among the unseen.
//  - Pick-ups. Someone who picks up probably couldn't beat, but it isn't
//    certain (you may pick up by choice), so it's evidence to weigh, not a
//    rule: aiSearch.js weighs it with Bayes' rule.
//  - Returned jokers. A joker turned up at the deal goes back into the
//    middle half of the pile, and the pile is drawn in order, so whoever drew
//    that stretch of the pile has it, or it's still there.
//
// Nothing here is random and nothing reads a hidden card: the same table
// seen from the same seat always gives the same view.

import { createDeck } from "./cards.js";
import { isFreeForAll, leadLimit } from "./engine.js";

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The seat's view of the table:
 *   me, team, trumpSuit, handSize, freeForAll, hand, faceUp, stack,
 *   pileCount, dry (nothing left to draw), limit (the biggest lead allowed),
 *   players [{ id, team, out, count, known: Card[], unknown }],
 *   gone (cards seen going dead), hidden (dead cards nobody saw),
 *   unseen (every card this seat can't place, by id),
 *   evidence [{ seat, layer, before, fresh, dry }] (pick-ups; see aiSearch),
 *   jokers { base, returned [{ card, unseen }], drawers } (see placeJokers in aiSearch).
 */
export function readTable(state, me) {
  const trumpSuit = state.trumpSuit;
  const n = state.players.length;
  const known = state.players.map(() => new Map()); // seat -> id -> card
  const evidence = [];
  const gone = [];
  const returned = [];
  const drawers = []; // drawers[k]: the seat that drew the k-th card of the pile
  const drewAfter = state.players.map(() => []); // per seat: unknown cards drawn after each of its pick-ups
  let stack = [];
  let top = null;
  let faceUp = null;

  // This match's events start at its deal; returned jokers come just before it.
  let start = 0;
  for (let i = state.events.length - 1; i >= 0; i--) {
    if (state.events[i].type === "deal") {
      start = i;
      break;
    }
  }
  for (let i = start - 1; i >= 0 && state.events[i].type === "jokerReturned"; i--) returned.unshift(state.events[i].card);

  for (let i = start; i < state.events.length; i++) {
    const e = state.events[i];
    switch (e.type) {
      case "deal":
        faceUp = e.trumpCard;
        break;
      case "lead":
        stack = [...e.cards];
        top = e.cards;
        for (const c of e.cards) known[e.seat].delete(c.id);
        break;
      case "beat":
        stack.push(...e.cards);
        top = e.cards;
        for (const c of e.cards) known[e.seat].delete(c.id);
        break;
      case "pickUp": {
        evidence.push({ seat: e.seat, layer: top, before: [...known[e.seat].values()], at: drewAfter[e.seat].length, dry: false });
        drewAfter[e.seat].push(0);
        for (const c of stack) known[e.seat].set(c.id, c);
        stack = [];
        top = null;
        break;
      }
      case "dead":
        gone.push(...stack);
        stack = [];
        top = null;
        break;
      case "draw": {
        const fromPile = e.count - (e.tookTrump ? 1 : 0);
        for (let k = 0; k < fromPile; k++) drawers.push(e.seat);
        if (e.tookTrump && faceUp) {
          known[e.seat].set(faceUp.id, faceUp);
          faceUp = null;
        }
        // Cards drawn after a pick-up weren't in the hand that picked up.
        const after = drewAfter[e.seat];
        for (let k = 0; k < after.length; k++) after[k] += fromPile;
        break;
      }
      case "swapSeven":
        known[e.seat].set(e.card.id, e.card);
        if (e.seven) known[e.seat].delete(e.seven.id);
        faceUp = e.seven ?? state.trumpCard;
        break;
      case "concede":
        for (const p of state.players) if (p.team === e.team) known[p.id].clear();
        break;
      default:
        break;
    }
  }

  // How many cards the pile held when the deal ended, and so whether it was dry at each pick-up.
  const pileAtDeal = state.drawPile.length + drawers.length;
  const base = pileAtDeal - returned.length;
  {
    let drawn = 0;
    let face = true;
    let ev = 0;
    for (let i = start; i < state.events.length; i++) {
      const e = state.events[i];
      if (e.type === "draw") {
        drawn += e.count - (e.tookTrump ? 1 : 0);
        if (e.tookTrump) face = false;
      } else if (e.type === "pickUp") {
        evidence[ev++].dry = drawn >= pileAtDeal && !face;
      }
    }
  }

  const hand = [...state.players[me].hand];
  const mine = new Set(hand.map((c) => c.id));
  const players = state.players.map((p) => {
    const held = p.id === me ? [] : [...known[p.id].values()].filter((c) => !mine.has(c.id));
    return { id: p.id, team: p.team, out: p.out, count: p.hand.length, known: p.id === me ? hand : held };
  });

  const stackCards = state.stack ? state.stack.layers.flat() : [];
  const placed = new Set([...mine, ...gone.map((c) => c.id), ...stackCards.map((c) => c.id)]);
  if (state.trumpCard) placed.add(state.trumpCard.id);
  for (const p of players) if (p.id !== me) for (const c of p.known) placed.add(c.id);
  const unseen = createDeck(state.table.handSize)
    .filter((c) => !placed.has(c.id))
    .sort(byId);
  const hidden = Math.max(0, state.deadPile.length - gone.length);

  for (const p of players) p.unknown = p.id === me ? 0 : Math.max(0, p.count - p.known.length);
  const slots = players.reduce((sum, p) => sum + p.unknown, 0) + state.drawPile.length + hidden;
  // The history always adds up; if it ever doesn't (an edited state in a
  // test), forget what it remembered rather than deal impossible hands.
  const consistent = slots === unseen.length;
  if (!consistent) {
    for (const p of players) {
      if (p.id === me) continue;
      p.known = [];
      p.unknown = p.count;
    }
  }
  // Forgetting the known cards puts them back among the unseen.
  const unseenAll = consistent ? unseen : createDeck(state.table.handSize).filter((c) => !mine.has(c.id) && !gone.some((g) => g.id === c.id) && !stackCards.some((s) => s.id === c.id) && c.id !== state.trumpCard?.id).sort(byId);

  const pickups = consistent
    ? evidence
        .filter((ev) => ev.seat !== me && ev.layer && !state.players[ev.seat].out)
        .map((ev) => {
          // Cards it still holds from the hand that picked up: at least its
          // unknown cards now, less the unknown ones it has drawn since.
          const fresh = drewAfter[ev.seat][ev.at];
          return { seat: ev.seat, layer: ev.layer, before: ev.before, fresh, dry: ev.dry };
        })
    : [];

  const unseenIds = new Set(unseenAll.map((c) => c.id));
  return {
    me,
    team: state.players[me].team,
    trumpSuit,
    handSize: state.table.handSize,
    freeForAll: isFreeForAll(state),
    teams: state.table.teams,
    seats: n,
    hand,
    faceUp: state.trumpCard,
    stack: state.stack,
    pileCount: state.drawPile.length,
    dry: state.drawPile.length === 0 && !state.trumpCard,
    limit: leadLimit(state),
    players,
    gone,
    hidden: consistent ? hidden : Math.max(0, unseenAll.length - players.reduce((sum, p) => sum + (p.id === me ? 0 : p.unknown), 0) - state.drawPile.length),
    unseen: unseenAll,
    evidence: pickups,
    jokers: {
      base,
      returned: consistent ? returned.map((card) => ({ card, unseen: unseenIds.has(card.id) })) : [],
      drawers,
    },
  };
}

/** Cards no one can place: unseen, plus whatever the other players are known to hold. */
export function outsideCards(view) {
  const out = [...view.unseen];
  for (const p of view.players) if (p.id !== view.me) out.push(...p.known);
  if (view.faceUp) out.push(view.faceUp);
  return out;
}
