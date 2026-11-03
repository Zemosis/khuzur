// CARD MOTION — how cards and chips move on the poker table, the way the
// dealer would move them. Every card comes out of the deck and goes back by
// way of the muck: the two piles on the felt by the dealer (TablePiles, marked
// data-deck and data-muck). The house deals, so no player holds the deck; the
// dealer button only says who acts last.
//
// - useDeal: a new hand. Whatever is left of the last one (the board, every
//   hand still out) is swept onto the muck, the muck goes back into the deck,
//   and the deck is riffled twice and squared up where it lies. Then it deals,
//   one card at a time, clockwise from the button's left, two rounds, each
//   card flying to its seat face down; your own turn over as they land.
// - useMuck: a folded hand flies face down onto the muck.
// - useBoardReveal: the flop, turn and river fly off the deck face down and
//   turn over as they land.
// - useChipMotion: a bet's chips fly from the player's plate into their
//   circle; at the end of a street the circles' chips slide into the pot; when
//   the hand is won the pot flies to the winners' plates.
//
// The reduced-animation setting shortens every move. Without animation frames
// (a hidden or covered tab) the moves end on a timer, so no card is left
// hanging invisible.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { reducedMotion } from "../../utils/motion";
import { soundManager } from "../../utils/SoundManager";
import { backOver, turnOver } from "../blackjack/cardMotion";

// Seconds. A riffle: the deck splits into two halves, then they drop back
// together a card at a time, alternating sides.
const SPLIT = 0.15;
const DROP = 0.1;
const DROP_STAGGER = 0.025;
const FLY = 0.32; // a dealt card's time in the air
const STAGGER = 0.07; // seconds between two dealt cards
const MUCK = 0.45;
const SWEEP = 0.42; // the last hand's cards onto the muck
const COLLECT = 0.35; // the muck back into the deck
const TURN = 0.16; // a card turning over
const CHIPS = 0.4;
// What a move leaves on a card, cleared when it's done (the card's own
// inline styles, its width and overlap, stay).
const MOVED = "transform,opacity,visibility";

const safeSound = (method) => {
  try {
    soundManager[method]?.();
  } catch {
    /* audio not ready yet */
  }
};

const middle = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
const pileOf = (el, pile) => el?.closest("[data-poker-table]")?.querySelector(`[data-${pile}]`) ?? null;

/** A layer over the whole page for things on their way across (or off) the table. */
function flightLayer() {
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { position: "fixed", inset: "0", zIndex: "40", pointerEvents: "none" });
  document.body.appendChild(layer);
  return layer;
}

/** `el` (no longer on the table) laid in `layer` where it last lay. */
function liftInto(layer, el, rect) {
  Object.assign(el.style, { position: "absolute", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: "0" });
  layer.appendChild(el);
  return el;
}

/** Runs `tl` to its end if animation frames stop (it would stall), and when it's over anyway. */
export function finishOnTime(tl) {
  if (typeof document !== "undefined" && document.hidden) tl.progress(1);
  const timer = setTimeout(() => tl.progress(1), (tl.duration() + 0.5) * 1000);
  return () => clearTimeout(timer);
}

/**
 * Two riffles of the deck's layers (data-deck-layer) on `tl` from time `t`,
 * then a tap to square it up. Returns when the deck is ready to deal.
 */
export function riffle(tl, deck, t) {
  const layers = [...deck.querySelectorAll("[data-deck-layer]")];
  if (layers.length < 2) return t;
  const half = Math.ceil(layers.length / 2);
  const spread = deck.offsetWidth * 0.75;
  for (let pass = 0; pass < 2; pass++) {
    const left = layers.slice(0, half);
    const right = layers.slice(half);
    tl.call(() => safeSound("playShuffle"), null, t);
    tl.to(left, { x: -spread, rotation: -9, duration: SPLIT, ease: "power2.out" }, t);
    tl.to(right, { x: spread, rotation: 9, duration: SPLIT, ease: "power2.out" }, t);
    t += SPLIT + 0.04;
    const merged = left.flatMap((el, i) => (right[i] ? [el, right[i]] : [el]));
    merged.forEach((el, k) => tl.to(el, { x: 0, rotation: 0, duration: DROP, ease: "power2.in" }, t + k * DROP_STAGGER));
    t += (merged.length - 1) * DROP_STAGGER + DROP + 0.05;
  }
  tl.to(layers, { y: -6, duration: 0.08, ease: "power2.out" }, t);
  tl.to(layers, { y: 0, duration: 0.12, ease: "power2.in" }, t + 0.08);
  return t + 0.25;
}

// What a table's cards were at the last render: the board's and every hand's.
const TABLE_CARDS = "[data-deal-rel], [data-board-card]";

/**
 * A new hand under `rootRef`: the last one's cards swept away, the deck
 * riffled, then every element marked data-deal-rel (its seat relative to you)
 * and data-deal-card (0 or 1, which of the two) dealt to it from the deck.
 * deal: { key, order } — a new key deals again; order is the seats (relative
 * to you) in the order they're dealt to. null: nothing to deal (a hand joined
 * after it started).
 * onDealt(key): the cards have all landed — at once with reduced animations,
 * whose players don't wait on the deal.
 */
export function useDeal(rootRef, deal, onDealt) {
  const key = deal?.key ?? null;
  const orderKey = (deal?.order ?? []).join(",");
  const doneRef = useRef(onDealt);
  const lastCards = useRef([]); // the table's cards after the last render, and where they lay
  useEffect(() => {
    doneRef.current = onDealt;
  });

  useLayoutEffect(() => {
    if (key == null) return;
    const done = () => doneRef.current?.(key);
    const root = rootRef.current;
    const deck = root?.querySelector("[data-deck]");
    const muck = root?.querySelector("[data-muck]");
    const order = orderKey.split(",").map(Number);
    const place = (el) => Number(el.dataset.dealCard) * 10 + Math.max(0, order.indexOf(Number(el.dataset.dealRel)));
    const cards = root ? [...root.querySelectorAll("[data-deal-rel]")].sort((a, b) => place(a) - place(b)) : [];
    const reduce = reducedMotion();
    if (reduce || !deck || !cards.length) done();
    if (!deck || !cards.length) return;

    const fly = reduce ? 0.12 : FLY;
    const stagger = reduce ? 0.02 : STAGGER;
    const from = middle(deck);
    const moved = [...cards, deck, ...deck.querySelectorAll("[data-deck-layer]")];
    const backs = [];
    let layer = null;
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(moved, { clearProps: MOVED });
        backs.forEach((b) => b.remove());
        layer?.remove();
        if (!reduce) done();
      },
    });
    // Every card waits, hidden, in the deck while the table is cleared and the deck shuffled.
    cards.forEach((el) => {
      const to = middle(el);
      gsap.set(el, { x: from.x - to.x, y: from.y - to.y, rotation: gsap.utils.random(-12, 12), scale: 0.7, autoAlpha: 0 });
    });
    let start = 0;
    if (!reduce) {
      // The last hand's cards, gone from the table, are swept onto the muck and gathered into the deck.
      const gone = lastCards.current.filter(({ el }) => !el.isConnected && el.querySelector(".pixel-card"));
      if (gone.length && muck) {
        layer = flightLayer();
        const pile = middle(muck);
        gone.forEach(({ el, rect }, k) => {
          liftInto(layer, el, rect);
          const at = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          tl.to(el, { x: pile.x - at.x, y: pile.y - at.y, rotation: gsap.utils.random(-40, 40), scale: 0.6, duration: SWEEP, ease: "power2.inOut" }, k * 0.025);
          tl.to(el, { x: from.x - at.x, y: from.y - at.y, rotation: 0, autoAlpha: 0, duration: COLLECT, ease: "power2.in" }, SWEEP + gone.length * 0.025 + 0.05);
        });
        tl.call(() => safeSound("playDeal"), null, 0);
        start = SWEEP + gone.length * 0.025 + COLLECT + 0.1;
      }
      // The deck lifts, is riffled where it lies, and settles to deal.
      tl.to(deck, { y: -6, scale: 1.15, duration: 0.2, ease: "power2.out" }, start);
      start = riffle(tl, deck, start + 0.2);
      tl.to(deck, { y: 0, scale: 1, duration: 0.15, ease: "power2.in" }, start);
      start += 0.15;
    }
    cards.forEach((el, k) => {
      const at = start + k * stagger;
      // Your own cards come face down and turn over as they land.
      const back = reduce ? null : backOver(el);
      if (back) backs.push(back);
      tl.set(el, { autoAlpha: 1 }, at);
      tl.to(el, { x: 0, y: 0, rotation: 0, scale: 1, duration: fly, ease: "power2.out" }, at);
      if (back) turnOver(tl, el, back, at + fly + 0.05, TURN);
      if (k % 2 === 0) tl.call(() => safeSound("playDeal"), null, at);
    });
    const stop = finishOnTime(tl);
    return () => {
      stop();
      tl.kill();
      gsap.set(moved, { clearProps: MOVED });
      backs.forEach((b) => b.remove());
      layer?.remove();
    };
  }, [rootRef, key, orderKey]);

  // Remembered after every render, the deal's above included: the next hand sweeps what's left.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root) lastCards.current = [...root.querySelectorAll(TABLE_CARDS)].map((el) => ({ el, rect: el.getBoundingClientRect() }));
  });
}

/**
 * A seat's cards while it holds them, and once folded for as long as they
 * take to slide into the muck. Returns [show, ref]: draw the cards while
 * `show`, in the element given `ref`.
 */
export function useMuck(holding, folded) {
  const ref = useRef(null);
  const [held, setHeld] = useState(holding);
  const [mucking, setMucking] = useState(false);
  // A hand that folds goes to the muck (state from the change, not an effect).
  if (holding !== held) {
    setHeld(holding);
    setMucking(!holding && folded);
  }

  useLayoutEffect(() => {
    const el = ref.current;
    const pile = pileOf(el, "muck");
    if (!mucking) return;
    if (!el || !pile) {
      const call = gsap.delayedCall(0, () => setMucking(false));
      return () => call.kill();
    }
    const from = middle(el);
    const to = middle(pile);
    const muck = reducedMotion() ? 0.12 : MUCK;
    const tl = gsap.timeline({ onComplete: () => setMucking(false) });
    // Onto the pile: a hand you could see (your own) darkens as it goes.
    const faces = [...el.querySelectorAll(".pixel-card:not(.pixel-card-back)")];
    tl.to(el, { x: to.x - from.x, y: to.y - from.y, rotation: gsap.utils.random(-30, 30), scale: 0.6, duration: muck, ease: "power2.inOut" });
    if (faces.length) tl.to(faces, { filter: "brightness(0.3)", duration: muck * 0.5 }, 0);
    tl.to(el, { autoAlpha: 0, duration: muck * 0.2, ease: "none" }, muck * 0.8);
    const stop = finishOnTime(tl);
    return () => {
      stop();
      tl.kill();
    };
  }, [mucking]);

  return [holding || mucking, ref];
}

/** The board's new cards (the flop, turn or river) fly in from the deck, one after another. */
export function useBoardReveal(boardRef, count) {
  const shown = useRef(count);
  useLayoutEffect(() => {
    const from = shown.current;
    const el = boardRef.current;
    if (!el || count <= from) return void (shown.current = count);
    const fresh = [...el.children].slice(from, count);
    const deck = pileOf(el, "deck");
    const start = deck ? middle(deck) : null;
    const reduce = reducedMotion();
    // Counted as shown once they land, so a re-run (StrictMode) drops them again.
    const tl = gsap.timeline({
      onComplete: () => {
        shown.current = count;
        gsap.set(fresh, { clearProps: MOVED });
        el.querySelectorAll(".bj-flip-back").forEach((b) => b.remove());
      },
    });
    const backs = [];
    fresh.forEach((card, k) => {
      const to = middle(card);
      const off = start ? { x: start.x - to.x, y: start.y - to.y } : { x: 0, y: -28 };
      const at = k * (reduce ? 0.02 : 0.14);
      const fly = reduce ? 0.12 : FLY + 0.08;
      // Off the deck face down, turned over where it lands.
      const back = reduce ? null : backOver(card);
      if (back) backs.push(back);
      tl.fromTo(card, { ...off, scale: 0.6, rotation: gsap.utils.random(-20, 20), autoAlpha: 0 }, { x: 0, y: 0, scale: 1, rotation: 0, autoAlpha: 1, duration: fly, ease: "power2.out" }, at);
      if (back) turnOver(tl, card, back, at + fly + 0.04, TURN);
    });
    if (!reduce) tl.call(() => safeSound("playDeal"), null, 0);
    const stop = finishOnTime(tl);
    return () => {
      stop();
      tl.kill();
      gsap.set(fresh, { clearProps: MOVED });
      el.querySelectorAll(".bj-flip-back").forEach((b) => b.remove());
    };
  }, [boardRef, count]);
}

/**
 * Chips on the move under `rootRef`, read off the table after each render:
 * each betting circle (data-bet-rel, data-amount) and the pot (data-pot). A
 * circle's bet that grew flies in from its plate (data-plate-rel); a bet gone
 * within the hand slides into the pot; and once there are `winners` (seats,
 * rel), the pot flies to their plates. hand: the hand's number.
 */
export function useChipMotion(rootRef, { hand, winners }) {
  const last = useRef(null);
  const live = useRef(new Set()); // flights and their layers, stopped only when the table goes
  const winnersKey = winners.join(",");
  useEffect(() => {
    const running = live.current;
    return () => {
      running.forEach((x) => (x.kill ? x.progress(1).kill() : x.remove()));
      running.clear();
    };
  }, []);
  // After every render, but nothing it starts is stopped by the next one: the table re-renders
  // all the time (clocks, other players' moves), and a chip mid-flight must still land.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const stackIn = (el) => el.querySelector('[data-testid="bet"], [data-testid="pot"]');
    const look = (el) => {
      const stack = el && stackIn(el);
      return stack ? { node: stack.cloneNode(true), rect: stack.getBoundingClientRect() } : null;
    };
    const circles = [...root.querySelectorAll("[data-bet-rel]")];
    const now = {
      hand,
      winners: winnersKey,
      bets: new Map(circles.map((el) => [el.dataset.betRel, { amount: Number(el.dataset.amount) || 0, el }])),
      looks: new Map(circles.map((el) => [el.dataset.betRel, look(el)])),
      pot: look(root.querySelector("[data-pot]")),
    };
    const prev = last.current;
    last.current = now;
    if (!prev) return;

    const reduce = reducedMotion();
    const dur = reduce ? 0.1 : CHIPS;
    const potEl = root.querySelector("[data-pot]");
    const plateOf = (rel) => root.querySelector(`[data-plate-rel="${rel}"]`);
    let layer = null;
    const flights = [];
    /** A copy of a stack as it was, flying from where it lay to `to`, gone as it lands. */
    const fly = ({ node, rect }, to, delay) => {
      layer ??= flightLayer();
      const el = liftInto(layer, node.cloneNode(true), rect);
      const at = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      flights.push(
        gsap.to(el, { x: to.x - at.x, y: to.y - at.y, scale: 0.75, duration: dur, delay, ease: "power2.inOut" }),
        gsap.to(el, { autoAlpha: 0, duration: 0.12, delay: delay + dur - 0.08 }),
      );
      flights.forEach((f) => live.current.add(f));
      return dur + delay;
    };

    let ends = 0;
    const gathered = [];
    for (const [rel, bet] of now.bets) {
      const before = prev.bets.get(rel)?.amount ?? 0;
      if (bet.amount > before) {
        // More chips go down: they come from the player's plate.
        const stack = stackIn(bet.el);
        const plate = plateOf(rel);
        if (stack && plate) {
          const from = middle(plate);
          const to = middle(stack);
          gsap.fromTo(stack, { x: from.x - to.x, y: from.y - to.y, scale: 0.6, autoAlpha: 0 }, { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: dur, ease: "power2.out", clearProps: MOVED });
          safeSound("playCoin");
        }
      } else if (bet.amount === 0 && before > 0 && prev.hand === hand && prev.looks.get(rel) && potEl) {
        // The street is over: the circle's chips slide into the pot.
        gathered.push(prev.looks.get(rel));
      }
    }
    gathered.forEach((l, k) => (ends = Math.max(ends, fly(l, middle(potEl), k * 0.04))));
    if (gathered.length) safeSound("playCoin");

    // The hand is won: the pot (as it stood, or the chips just gathered) goes to the winners.
    if (now.winners && now.winners !== prev.winners && prev.hand === hand) {
      const pot = prev.pot ?? gathered[0];
      const start = ends ? ends + 0.15 : 0.2;
      if (pot) {
        for (const rel of now.winners.split(",")) {
          const plate = plateOf(rel);
          if (plate) fly(pot, middle(plate), start);
        }
        gsap.delayedCall(start, () => safeSound("playCoin"));
      }
    }
    if (!layer) return;
    const done = layer;
    live.current.add(done);
    const total = Math.max(...flights.map((f) => f.delay() + f.duration()));
    const cleanup = gsap.delayedCall(total + 0.05, () => {
      done.remove();
      live.current.delete(done);
      flights.forEach((f) => live.current.delete(f));
    });
    live.current.add(cleanup);
  });
}
