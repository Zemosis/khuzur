// CARD MOTION — how cards move on the poker table. Every card comes out of
// the deck and every folded hand goes to the muck: the two piles on the felt
// either side of the board (TablePiles, marked data-deck and data-muck). The
// house deals, so no player holds the deck; the dealer button only says who
// acts last.
//
// - useDeal: the deck slides to the middle of the felt (data-board, empty
//   at a new hand), is riffled twice and squared up, then deals a new hand
//   one card at a time, clockwise from the button's left, two rounds, each
//   card flying to its seat; then it slides back to its place.
// - useMuck: a folded hand flies face down onto the muck.
// - useBoardReveal: the flop, turn and river fly from the deck to the board.
//
// The reduced-animation setting shortens every move. Without animation frames
// (a hidden or covered tab) the moves end on a timer, so no card is left
// hanging invisible.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { reducedMotion } from "../../utils/motion";
import { soundManager } from "../../utils/SoundManager";

// Seconds. A riffle: the deck splits into two halves, then they drop back
// together a card at a time, alternating sides.
const SPLIT = 0.15;
const DROP = 0.1;
const DROP_STAGGER = 0.025;
const FLY = 0.32; // a dealt card's time in the air
const STAGGER = 0.07; // seconds between two dealt cards
const MUCK = 0.45;
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

/**
 * Shuffles, then deals a new hand round the table under `rootRef`: every element marked
 * data-deal-rel (its seat relative to you) and data-deal-card (0 or 1, which
 * of the two) flies in from the deck. deal: { key, order } — a new key deals
 * again; order is the seats (relative to you) in the order they're dealt to.
 * null: nothing to deal (a hand joined after it started).
 * onDealt(key): the cards have all landed — at once with reduced animations,
 * whose players don't wait on the deal.
 */
export function useDeal(rootRef, deal, onDealt) {
  const key = deal?.key ?? null;
  const orderKey = (deal?.order ?? []).join(",");
  const doneRef = useRef(onDealt);
  useEffect(() => {
    doneRef.current = onDealt;
  });

  useLayoutEffect(() => {
    if (key == null) return;
    const done = () => doneRef.current?.(key);
    const root = rootRef.current;
    const deck = root?.querySelector("[data-deck]");
    const order = orderKey.split(",").map(Number);
    const place = (el) => Number(el.dataset.dealCard) * 10 + Math.max(0, order.indexOf(Number(el.dataset.dealRel)));
    const cards = root ? [...root.querySelectorAll("[data-deal-rel]")].sort((a, b) => place(a) - place(b)) : [];
    const reduce = reducedMotion();
    if (reduce || !deck || !cards.length) done();
    if (!deck || !cards.length) return;

    const fly = reduce ? 0.12 : FLY;
    const stagger = reduce ? 0.02 : STAGGER;
    // The deck deals from the middle of the felt; reduced, from where it lies.
    const board = root.querySelector("[data-board]");
    const rest = middle(deck);
    const from = board && !reduce ? middle(board) : rest;
    const moved = [...cards, deck, ...deck.querySelectorAll("[data-deck-layer]")];
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(moved, { clearProps: MOVED });
        if (!reduce) done();
      },
    });
    // Every card waits, hidden, in the deck while it's shuffled.
    cards.forEach((el) => {
      const to = middle(el);
      gsap.set(el, { x: from.x - to.x, y: from.y - to.y, rotation: gsap.utils.random(-25, 25), scale: 0.7, autoAlpha: 0 });
    });
    let start = 0;
    if (!reduce) {
      tl.to(deck, { x: from.x - rest.x, y: from.y - rest.y, scale: 1.3, duration: 0.3, ease: "power2.inOut" }, 0);
      start = riffle(tl, deck, 0.35);
    }
    cards.forEach((el, k) => {
      const at = start + k * stagger;
      tl.set(el, { autoAlpha: 1 }, at);
      tl.to(el, { x: 0, y: 0, rotation: 0, scale: 1, duration: fly, ease: "power2.out" }, at);
      if (k % 2 === 0) tl.call(() => safeSound("playDeal"), null, at);
    });
    if (!reduce) tl.to(deck, { x: 0, y: 0, scale: 1, duration: 0.35, ease: "power2.inOut" }, start + (cards.length - 1) * stagger + fly);
    const stop = finishOnTime(tl);
    return () => {
      stop();
      tl.kill();
      gsap.set(moved, { clearProps: MOVED });
    };
  }, [rootRef, key, orderKey]);
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
      },
    });
    fresh.forEach((card, k) => {
      const to = middle(card);
      const off = start ? { x: start.x - to.x, y: start.y - to.y } : { x: 0, y: -28 };
      tl.fromTo(
        card,
        { ...off, scale: 0.6, rotation: gsap.utils.random(-20, 20), autoAlpha: 0 },
        { x: 0, y: 0, scale: 1, rotation: 0, autoAlpha: 1, duration: reduce ? 0.12 : FLY + 0.08, ease: "power2.out" },
        k * (reduce ? 0.02 : 0.14),
      );
    });
    if (!reduce) tl.call(() => safeSound("playDeal"), null, 0);
    const stop = finishOnTime(tl);
    return () => {
      stop();
      tl.kill();
      gsap.set(fresh, { clearProps: MOVED });
    };
  }, [boardRef, count]);
}
