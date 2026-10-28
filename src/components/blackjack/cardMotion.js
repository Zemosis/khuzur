// CARD MOTION — how cards and chips move on the blackjack table. The server
// sends whole states (the deal arrives as one), so useTableMotion replays
// each change against the one before:
//
// - a new shoe (a "shuffle" event with the deal) comes out of the shoe to
//   the middle of the felt (data-bj-shuffle), is riffled twice, and goes back
// - every new card (data-bj-card, an id not on the table before) flies out
//   of the shoe face down and turns face up as it lands; at the deal, in
//   deal order (data-bj-deal: two rounds, first base first, the dealer last).
//   The dealer's hole card lands face down. A hand's total (data-bj-tag)
//   waits for its cards, and a new turn's marks (data-bj-wait) for them all.
// - the hole card turns over when the dealer reveals it; a round settled in
//   the deal (every hand a blackjack or bust) deals it face down and turns
//   it over once the deal is done. The dealer's total waits for it.
// - a card that moves on the felt (a split takes one across) slides there
// - cards gone from the table (the round cleared) are swept into the tray
// - a bet's chips (data-bj-chips) drop into the circle as it grows; at the
//   results a lost bet is taken to the dealer, and a win's chips
//   (data-bj-win) fly out from the dealer onto the bet, which then shows
//   both
//
// Each batch of moves waits for the one before, so a card is never dealt out
// of turn. `busyUntil` (performance.now ms) on the motion ref is when the
// last one lands. The reduced-animation setting shortens every move; without
// animation frames (a hidden or covered tab) the moves end on a timer.

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { reducedMotion } from "../../utils/motion";
import { soundManager } from "../../utils/SoundManager";
import { finishOnTime, riffle } from "../poker/cardMotion";
import { PHASES } from "../../utils/blackjack/engine";
import { roundNet } from "./tableInfo";

// Seconds.
const FLY = 0.34; // a card's time in the air
const STAGGER = 0.17; // between two dealt cards
const TURN = 0.16; // a card turning over
const SWEEP = 0.4;
const CHIPS = 0.45;
const MOVED = "transform,opacity,visibility";
const SHUFFLE = 2; // about how long a new shoe's shuffle takes

/** About how long a deal of `cards` cards takes to land, in ms (a new shoe shuffled first). */
export function dealMs(cards, shuffled) {
  if (reducedMotion()) return 0;
  return ((shuffled ? SHUFFLE : 0) + Math.max(0, cards - 1) * STAGGER + FLY + TURN) * 1000;
}
/** How long one card takes from the shoe to face up, in ms. */
export const CARD_MS = (FLY + TURN) * 1000;

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
const snap4 = (n) => Math.max(8, Math.round(n / 4) * 4);

/** A card back laid over a face-up card while it flies (class bj-flip-back), removed as it turns. */
function backOver(mover) {
  const card = mover.querySelector(".pixel-card");
  if (!card || card.classList.contains("pixel-card-back")) return null;
  const back = document.createElement("div");
  back.className = "bj-flip-back";
  back.style.fontSize = `${snap4(card.offsetWidth * 0.28)}px`;
  back.textContent = "♦";
  mover.appendChild(back);
  return back;
}

/** On `tl` at `t`: `mover` turns over, its back coming off at the halfway point. */
function turnOver(tl, mover, back, t, turn) {
  tl.to(mover, { scaleX: 0, duration: turn / 2, ease: "power1.in" }, t)
    .call(() => back.remove(), null, t + turn / 2)
    .to(mover, { scaleX: 1, duration: turn / 2, ease: "power1.out" }, t + turn / 2);
}

/** A layer over the whole page for things on their way off the table. */
function flightLayer() {
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { position: "fixed", inset: "0", zIndex: "40", pointerEvents: "none" });
  document.body.appendChild(layer);
  return layer;
}

/**
 * A win paid onto a bet: `win` (the winnings' chips, laid over the circle)
 * flies from the dealer (`house`) onto the bet, `look` (how the bet looked)
 * standing in for it meanwhile; as it lands the bet shows both.
 */
function payOnto(bet, win, look, house, reduce, running) {
  const at = middle(bet);
  const layer = flightLayer();
  running.add(layer);
  if (look) {
    layer.appendChild(look);
    Object.assign(look.style, { position: "absolute", left: "0", top: "0", width: `${bet.offsetWidth}px`, height: `${bet.offsetHeight}px` });
    gsap.set(look, { x: at.x - bet.offsetWidth / 2, y: at.y - bet.offsetHeight / 2 });
  }
  gsap.set(bet, { autoAlpha: 0 });
  const w = middle(win);
  const tl = gsap.timeline({
    delay: reduce ? 0 : 0.25,
    onComplete: () => {
      layer.remove();
      running.delete(layer);
    },
  });
  tl.fromTo(win, { x: house.x - w.x, y: house.y - w.y, scale: 0.6, autoAlpha: 0 }, { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: reduce ? 0.12 : CHIPS, ease: "power2.out" })
    .call(() => safeSound("playCoin"))
    .set(win, { autoAlpha: 0 })
    .call(() => look?.remove())
    .fromTo(bet, { scale: 1.2, autoAlpha: 1 }, { scale: 1, duration: reduce ? 0.05 : 0.2, ease: "back.out(2)", clearProps: MOVED });
  finishOnTime(tl);
}

const cardsOf = (root) => new Map([...root.querySelectorAll("[data-bj-card]")].map((el) => [el.dataset.bjCard, { el, rect: el.getBoundingClientRect() }]));
const nodesOf = (root, attr) => new Map([...root.querySelectorAll(`[${attr}]`)].map((el) => [el.getAttribute(attr), el]));

/**
 * rootRef: the table. view: the blackjack view being drawn. motionRef: where
 * to write `busyUntil`, when the moves under way end.
 */
export function useTableMotion(rootRef, view, motionRef) {
  const last = useRef(null); // what the table showed after the last view
  const live = useRef(new Set()); // timelines and layers to stop on unmount

  useEffect(() => {
    const running = live.current;
    return () => {
      running.forEach((x) => (x.kill ? x.kill() : x.remove()));
      running.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const now = cardsOf(root);
    const before = last.current;
    const remember = () => {
      last.current = {
        cards: cardsOf(root),
        chips: nodesOf(root, "data-bj-chips"),
        amounts: new Map([...root.querySelectorAll("[data-bj-chips]")].map((el) => [el.dataset.bjChips, Number(el.dataset.bjAmount)])),
        // How each bet looked, to stand in for it while a win is paid onto it.
        looks: new Map([...root.querySelectorAll("[data-bj-chips]")].map((el) => [el.dataset.bjChips, el.cloneNode(true)])),
        waiting: new Set(root.querySelectorAll("[data-bj-wait]")),
        hole: view.dealer.cards.length > 1 && view.dealer.cards[1] == null,
        phase: view.phase,
        round: view.roundNumber,
      };
    };
    // Whatever is on the table when it opens is already there.
    if (!before) return remember();

    const reduce = reducedMotion();
    const fly = reduce ? 0.12 : FLY;
    const stagger = reduce ? 0.03 : STAGGER;
    const turn = reduce ? 0.08 : TURN;
    const shoe = root.querySelector("[data-bj-shoe]");
    const tray = root.querySelector("[data-bj-tray]");
    const dealerSpot = root.querySelector("[data-bj-dealer]");
    // A batch starts once the moves already under way are over.
    const start = Math.max(0, motionRef.current.busyUntil - performance.now()) / 1000;
    const tl = gsap.timeline();
    const cleared = [];
    const backs = [];
    let t = start;

    // A new shoe is shuffled on the felt before it deals.
    const spot = root.querySelector("[data-bj-shuffle]");
    const dealt = view.roundNumber !== before.round;
    if (!reduce && dealt && shoe && spot && view.events?.some((e) => e.type === "shuffle")) {
      const deck = shoe.querySelector("[data-bj-deck]");
      const from = middle(deck);
      const to = middle(spot);
      tl.to(deck, { x: to.x - from.x, y: to.y - from.y, scale: 1.4, duration: 0.35, ease: "power2.inOut" }, t);
      t = riffle(tl, deck, t + 0.4);
      tl.to(deck, { x: 0, y: 0, scale: 1, duration: 0.3, ease: "power2.inOut" }, t);
      t += 0.3;
      cleared.push(deck, ...deck.querySelectorAll("[data-deck-layer]"));
    }

    const landed = new Map(); // a hand (data-bj-owner) → when its last card is up

    // The hole card turns over.
    const holeSlot = before.hole && view.dealer.cards[1] ? root.querySelector('[data-bj-dealer-card="1"]') : null;
    if (holeSlot) {
      const mover = holeSlot.querySelector("[data-bj-move]");
      const back = backOver(mover);
      if (back) {
        backs.push(back);
        turnOver(tl, mover, back, t, turn * 1.5);
        cleared.push(mover);
        t += turn * 1.5;
        landed.set("dealer", t);
      }
    }
    // Settled in the deal: the hole card comes face down and turns over last.
    const lateHole = dealt && view.dealer.revealed ? root.querySelector('[data-bj-dealer-card="1"]') : null;
    let lateBack = null;

    // New cards, out of the shoe in the order they're dealt.
    const fresh = [...now.entries()]
      .filter(([id, { el }]) => !before.cards.has(id) && el !== holeSlot)
      .map(([, { el }]) => el)
      .sort((a, b) => Number(a.dataset.bjDeal ?? 99) - Number(b.dataset.bjDeal ?? 99));
    const from = shoe ? middle(shoe) : null;
    fresh.forEach((slot, k) => {
      const mover = slot.querySelector("[data-bj-move]");
      if (!mover || !from) return;
      const to = middle(slot);
      gsap.set(mover, { x: from.x - to.x, y: from.y - to.y, rotation: -14, scale: 0.6, autoAlpha: 0 });
      const at = t + k * stagger;
      const back = backOver(mover);
      tl.set(mover, { autoAlpha: 1 }, at).to(mover, { x: 0, y: 0, rotation: 0, scale: 1, duration: fly, ease: "power2.out" }, at);
      tl.call(() => safeSound("playDeal"), null, at);
      if (back) backs.push(back);
      if (back && slot === lateHole) lateBack = back;
      else if (back) turnOver(tl, mover, back, at + fly, turn);
      landed.set(slot.dataset.bjOwner, at + fly + (back ? turn : 0));
      cleared.push(mover);
    });
    if (fresh.length) t += (fresh.length - 1) * stagger + fly + turn;
    if (lateBack) {
      turnOver(tl, lateHole.querySelector("[data-bj-move]"), lateBack, t + 0.25, turn * 1.5);
      t += 0.25 + turn * 1.5;
      landed.set("dealer", t);
    }
    // What marks whose turn it is (data-bj-wait) shows once the cards are down.
    const marks = [...root.querySelectorAll("[data-bj-wait]")].filter((el) => !before.waiting.has(el));
    if (fresh.length && marks.length) {
      gsap.set(marks, { autoAlpha: 0 });
      tl.to(marks, { autoAlpha: 1, duration: 0.15 }, t);
      cleared.push(...marks);
    }
    for (const [owner, at] of landed) {
      const tag = root.querySelector(`[data-bj-tag="${owner}"]`);
      if (!tag) continue;
      gsap.set(tag, { autoAlpha: 0 });
      tl.to(tag, { autoAlpha: 1, duration: 0.15 }, at);
      cleared.push(tag);
    }

    // Cards that moved on the felt slide to their new places.
    for (const [id, { el, rect }] of now) {
      const old = before.cards.get(id);
      const mover = el.querySelector("[data-bj-move]");
      if (!old || !mover || gsap.isTweening(mover)) continue;
      const dx = old.rect.left - rect.left;
      const dy = old.rect.top - rect.top;
      if (Math.abs(dx) + Math.abs(dy) < 2) continue;
      gsap.fromTo(mover, { x: dx, y: dy }, { x: 0, y: 0, duration: reduce ? 0.1 : 0.3, ease: "power2.out", clearProps: "transform" });
    }

    // Cards gone from the table are swept into the tray.
    const gone = [...before.cards.values()].filter(({ el }) => !el.isConnected);
    if (gone.length && tray) {
      const layer = flightLayer();
      live.current.add(layer);
      const sweep = gsap.timeline({
        onComplete: () => {
          layer.remove();
          live.current.delete(layer);
        },
      });
      const into = middle(tray);
      gone.forEach(({ el, rect }, k) => {
        Object.assign(el.style, { position: "absolute", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: "0" });
        layer.appendChild(el);
        const x = into.x - (rect.left + rect.width / 2);
        const y = into.y - (rect.top + rect.height / 2);
        sweep.to(el, { x, y, scale: 0.35, rotation: gsap.utils.random(-25, 25), duration: reduce ? 0.12 : SWEEP, ease: "power2.in" }, k * (reduce ? 0 : 0.03));
      });
      sweep.to(layer, { autoAlpha: 0, duration: 0.1 });
      finishOnTime(sweep);
    }

    // Chips: a bet grows, a lost bet goes to the dealer, a win comes from it.
    const chips = nodesOf(root, "data-bj-chips");
    const settling = view.phase === PHASES.ROUND_OVER && before.phase !== PHASES.ROUND_OVER;
    for (const [seat, el] of chips) {
      const amount = Number(el.dataset.bjAmount);
      if (settling) continue; // a win grows the stack as it's paid, below
      if (el !== before.chips.get(seat) || amount > (before.amounts.get(seat) ?? 0)) {
        gsap.fromTo(el, { y: -22, scale: 1.25, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: reduce ? 0.1 : 0.3, ease: "back.out(2)", clearProps: MOVED });
        safeSound("playCoin");
      }
    }
    if (settling && dealerSpot) {
      const house = middle(dealerSpot);
      view.seats.forEach((p, seat) => {
        const el = chips.get(String(seat));
        const net = p?.inRound && el ? roundNet(p, view.dealer) : 0;
        if (net < 0) {
          const at = middle(el);
          gsap.to(el, { x: house.x - at.x, y: house.y - at.y, scale: 0.6, autoAlpha: 0, duration: reduce ? 0.12 : CHIPS, delay: reduce ? 0 : 0.25, ease: "power2.in" });
        }
        const win = net > 0 ? root.querySelector(`[data-bj-win="${seat}"]`) : null;
        if (win) payOnto(el, win, before.looks.get(String(seat)), house, reduce, live.current);
      });
    }

    remember();
    if (!cleared.length) return void tl.kill();
    motionRef.current.busyUntil = performance.now() + tl.duration() * 1000;
    live.current.add(tl);
    tl.eventCallback("onComplete", () => {
      gsap.set(cleared, { clearProps: MOVED });
      backs.forEach((b) => b.remove());
      live.current.delete(tl);
    });
    finishOnTime(tl);
  }, [rootRef, view, motionRef]);
}
