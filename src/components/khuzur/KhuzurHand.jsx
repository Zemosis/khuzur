// KHUZUR HAND — your cards under the table, fanned and moving like the other
// games' hands (see thirteen/PlayerHand): a gentle arc, each card tilted a
// little, a picked card lifted. Each card is a button named for the card
// ("J♠", "Gray joker"), so picking works from the keyboard too.
//
// A big hand (after pick-ups) closes up so it always fits the width, each
// card still showing its corner.
//
// Every card's place is GSAP's, in layers so no two animations fight over one
// transform:
//   slot — x / y / rotation / scale / zIndex: where the card lies in the fan
//   flip — scaleX, for the face-down → face-up turn as a card lands
//   card — PixelCard; hover and picking lift it with CSS
// While the deal plays, the hand is laid out as `dealSlots` fixed slots and
// each card dealt flies in face down from the deck (`dealFrom`), then turns
// over. When the hand's order changes (sorted as play starts, RANK / SUIT)
// every card arcs to its new place, a little after the one before, passing
// over the others at the top of its arc; a card you dragged into place just
// slides. Otherwise (a card in or out, a resize) the cards slide to their new
// places. A card flying in from the table (see CardFlights) lies in its slot
// unseen (`hidden`) and shows as it lands, turning over if it came face down
// (`faceDown`: drawn from the pile).
//
// Dragging a card (mouse or finger): along the hand it reorders it — the card
// follows the pointer, the others make room, and letting go calls onReorder
// with the new left-to-right ids. While you beat (`draggable`), carrying it up
// onto the table instead lifts it out of the hand, and letting go there calls
// onDrop with the point, for the page to place it on a card of the stack. A
// press that barely moves is still a click.

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO, DEAL_FLY } from "../../hooks/useTableMetrics";
import { useElementWidth } from "../../hooks/useElementWidth";
import { reducedMotion } from "../../utils/motion";
import { toPixelCardProps } from "./cardProps";

const MIN_SHOWN = 0.36; // of a card's width, the least of each card left showing
const SORT_STAGGER = 0.035; // seconds between one card setting off for its sorted place and the next
const SORT_SLIDE = 0.42;
const REFLOW = 0.32;
const DRAG_START = 6; // px a press must move before it's a drag, not a click
const MAKE_ROOM = 0.15;

/** A card's label for screen readers and tests: "J♠", "Gray joker". */
const cardLabel = (card) => (card.joker ? (card.joker === "gray" ? "Gray joker" : "Colored joker") : `${card.rank}${card.suit}${card.copy === 2 ? " (2)" : ""}`);

/** Where card i of n sits: its centre's x from the middle, how far it dips, its tilt. */
function slot(i, n, cardW, width) {
  const mid = (n - 1) / 2;
  const d = i - mid;
  const room = Math.max(0, width - cardW - 24);
  const spacing = n > 1 ? Math.min(cardW * 0.78, room / (n - 1)) : 0;
  const dip = cardW * 0.1;
  return { x: d * spacing, y: mid ? (d * d * dip) / (mid * mid) : 0, rotation: d * Math.min(2.4, 24 / Math.max(n - 1, 1)) };
}

/** Turn a card face up: its back shows, it narrows to an edge, and opens again face up. */
function turnOver(els, tl = gsap.timeline()) {
  gsap.set(els.back, { autoAlpha: 1 });
  return tl
    .to(els.flip, { scaleX: 0, duration: 0.07, ease: "power1.in" })
    .set(els.back, { autoAlpha: 0 })
    .to(els.flip, { scaleX: 1, duration: 0.09, ease: "power1.out" });
}

/**
 * cards: in the order shown. selected: picked card ids. onToggle(id).
 * cardW: the full card width (a big hand shrinks to fit, never below
 * MIN_SHOWN of a card each). enabled: your turn, cards can be picked.
 * emptyMessage: shown when you hold nothing.
 * dealing: the deal is playing; dealSlots: how many cards it deals you;
 * dealFrom(): the element the deck sits on (its data-card-w the deck's card
 * width), for dealt cards to fly from.
 * hidden: ids of cards still in the air on their way here (see CardFlights):
 * their slot is kept, the card shows once it lands. faceDown: ids that fly in
 * face down (they turn over as they land).
 * onReorder(ids): a card dragged to a new place in the hand.
 * draggable: cards can be carried onto the table (beating). onDragOver(id, x,
 * y) as one is carried there (null id once it's let go or back in the hand);
 * onDrop(id, x, y) where it's let go, client px.
 */
export default function KhuzurHand({
  cards,
  selected,
  onToggle,
  cardW: fullW,
  enabled,
  emptyMessage = null,
  dealing = false,
  dealSlots = 0,
  dealFrom = null,
  hidden = null,
  faceDown = null,
  onReorder = null,
  draggable = false,
  onDragOver,
  onDrop,
}) {
  const ref = useRef(null);
  const els = useRef(new Map()); // card id -> { slot, flip, back }
  const placed = useRef(new Set()); // cards laid out at least once (and still here)
  const shown = useRef([]); // the order last laid out
  const laidOut = useRef(false);
  const sortTl = useRef(null);
  const layout = useRef({ ids: [], slots: [] }); // the hand as laid out last, for dragging
  const dragged = useRef(false); // the next order change is a card dragged into place
  const press = useRef(null); // { id, from, to, x0, y0, moving, carried }
  const swallow = useRef(false); // the click that ends a drag isn't a pick
  const wasHidden = useRef(new Set());
  const [carry, setCarry] = useState(null); // { card, x, y }: a card carried over the table
  const width = useElementWidth(ref);
  const n = cards.length;
  const laid = dealing ? Math.max(dealSlots, n) : n; // slots in the fan
  // Shrink the cards only when even the closest fan wouldn't fit.
  const cardW = laid > 1 && width > 0 ? Math.max(34, Math.min(fullW, Math.floor((width - 24) / (1 + MIN_SHOWN * (laid - 1))))) : fullW;
  const cardH = Math.round(cardW * CARD_RATIO);
  const fullH = Math.round(fullW * CARD_RATIO);
  const base = Math.round(cardW * 0.1 + (cardW / 2) * Math.sin((14 * Math.PI) / 180)) + 6;
  const liftVars = { "--lift": `${Math.round(cardH * 0.16)}px`, "--hover-lift": `${Math.round(cardH * 0.07)}px` };
  const order = cards.map((c) => c.id).join(",");

  useLayoutEffect(() => {
    if (!width) return; // laid out once the hand's width is known (still before it's painted)
    const ids = cards.map((c) => c.id);
    const here = new Set(ids);
    placed.current.forEach((id) => !here.has(id) && placed.current.delete(id));
    // The cards that stay, in their old order and their new: a change is a re-sort.
    const before = shown.current.filter((id) => placed.current.has(id)).join(",");
    const after = ids.filter((id) => placed.current.has(id)).join(",");
    shown.current = ids;
    const reduce = reducedMotion();
    const first = !laidOut.current;
    laidOut.current = true;
    const byDrag = dragged.current;
    dragged.current = false;
    const slots = ids.map((_, i) => slot(i, laid, cardW, width));
    layout.current = { ids, slots };
    if (!dealing) {
      sortTl.current?.kill();
      sortTl.current = null;
    }
    const resort = !reduce && !dealing && !byDrag && before !== after && placed.current.size > 1;
    const tl = resort ? gsap.timeline({ onComplete: () => (sortTl.current = null) }) : null;
    if (tl) sortTl.current = tl;
    const arc = cardH * 0.28;
    const origin = dealing && !first && !reduce ? dealFrom?.() : null;

    let k = 0; // the cards that move in the sort, in order, for its stagger
    ids.forEach((id, i) => {
      const e = els.current.get(id);
      if (!e?.slot) return;
      const s = slots[i];
      const z = i + 1;

      if (!placed.current.has(id)) {
        placed.current.add(id);
        gsap.killTweensOf(e.slot);
        if (!origin) {
          gsap.set(e.slot, { ...s, scale: 1, zIndex: z });
          gsap.set(e.back, { autoAlpha: 0 });
          return;
        }
        // Dealt: flies face down from the deck, then turns face up as it lands.
        const o = origin.getBoundingClientRect();
        const c = ref.current.getBoundingClientRect();
        const scale = (Number(origin.dataset.cardW) || cardW) / cardW;
        const ox = o.left + o.width / 2 - (c.left + c.width / 2);
        const oy = o.top + o.height / 2 - (c.bottom - base);
        gsap.set(e.back, { autoAlpha: 1 });
        const flight = gsap.timeline().fromTo(
          e.slot,
          // Slots turn about their bottom centre, which sits half a card below the deck's middle.
          { x: ox, y: oy + (cardH * scale) / 2, rotation: gsap.utils.random(-20, 20), scale, zIndex: z },
          { ...s, scale: 1, duration: DEAL_FLY, ease: "power2.out" },
        );
        turnOver(e, flight);
        return;
      }

      // Dealt cards keep their slot until the deal is over.
      if (dealing) return;

      if (reduce) {
        gsap.killTweensOf(e.slot);
        gsap.set(e.slot, { ...s, scale: 1, zIndex: z });
        return;
      }

      if (tl) {
        // Up and over the others to its new place, then into its stacking order.
        const at = k++ * SORT_STAGGER;
        tl.to(e.slot, { x: s.x, rotation: s.rotation, scale: 1, duration: SORT_SLIDE, ease: "power2.inOut", overwrite: "auto" }, at);
        tl.to(
          e.slot,
          {
            keyframes: [
              { y: s.y - arc, duration: SORT_SLIDE * 0.45, ease: "power2.out" },
              { y: s.y, duration: SORT_SLIDE * 0.55, ease: "power2.in" },
            ],
          },
          at,
        );
        tl.set(e.slot, { zIndex: 100 + i }, at + SORT_SLIDE * 0.4);
        tl.set(e.slot, { zIndex: z }, at + SORT_SLIDE);
        return;
      }

      gsap.to(e.slot, { ...s, scale: 1, duration: REFLOW, ease: "power3.out", overwrite: "auto" });
      gsap.set(e.slot, { zIndex: z });
    });
    // `cards` and the rest are read as they are when the order (or the room) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, laid, cardW, width, cardH, dealing]);

  // A card that flew in face down turns over as it shows.
  useLayoutEffect(() => {
    const before = wasHidden.current;
    wasHidden.current = new Set(hidden ?? []);
    if (reducedMotion()) return;
    before.forEach((id) => {
      const e = els.current.get(id);
      if (!hidden?.has(id) && faceDown?.has(id) && e?.flip) turnOver(e);
    });
  }, [hidden, faceDown]);

  useEffect(() => () => sortTl.current?.kill(), []);

  // --- Dragging a card: along the hand to reorder it, or (beating) up onto the table ---
  const canCarry = draggable && enabled;
  const startDrag = (id, e) => {
    swallow.current = false;
    if (dealing || e.button !== 0 || (!onReorder && !canCarry)) return;
    const from = layout.current.ids.indexOf(id);
    if (from === -1) return;
    press.current = { id, from, to: from, x0: e.clientX, y0: e.clientY, moving: false, carried: false };
  };

  useEffect(() => {
    const slotOf = (id) => els.current.get(id)?.slot;
    // Every card back to its slot in the current layout (`gap`: one left open at that index).
    const settle = (skip = null, gap = null) => {
      const { ids, slots } = layout.current;
      ids
        .filter((id) => id !== skip)
        .forEach((id, k) => {
          const i = gap !== null && k >= gap ? k + 1 : skip !== null ? ids.indexOf(id) : k;
          const el = slotOf(id);
          if (!el) return;
          gsap.to(el, { ...slots[i], scale: 1, duration: skip ? MAKE_ROOM : REFLOW, ease: skip ? "power2.out" : "power3.out", overwrite: "auto" });
          gsap.set(el, { zIndex: i + 1 });
        });
    };
    const move = (e) => {
      const d = press.current;
      if (!d) return;
      const dx = e.clientX - d.x0;
      if (!d.moving) {
        if (Math.abs(dx) < DRAG_START && Math.abs(e.clientY - d.y0) < DRAG_START) return;
        d.moving = true;
        sortTl.current?.kill();
      }
      const el = slotOf(d.id);
      const card = cards.find((c) => c.id === d.id);
      const top = ref.current?.getBoundingClientRect().top ?? 0;
      if (canCarry && e.clientY < top) {
        // Over the table: the card leaves the hand (its slot kept open) and goes with the pointer.
        if (!d.carried) {
          d.carried = true;
          d.to = d.from;
          gsap.set(el, { autoAlpha: 0 });
          settle(d.id);
        }
        setCarry({ card, x: e.clientX, y: e.clientY });
        onDragOver?.(d.id, e.clientX, e.clientY);
        return;
      }
      if (d.carried) {
        d.carried = false;
        setCarry(null);
        onDragOver?.(null);
        gsap.set(el, { autoAlpha: 1 });
      }
      if (!onReorder) return;
      const { slots } = layout.current;
      const x = slots[d.from].x + dx;
      d.to = slots.reduce((best, s, i) => (Math.abs(s.x - x) < Math.abs(slots[best].x - x) ? i : best), 0);
      // The card follows the pointer, lifted; the others make room for it.
      gsap.set(el, { x, y: slots[d.to].y - cardH * 0.12, rotation: 0, scale: 1.04, zIndex: 300 });
      settle(d.id, d.to);
    };
    const end = (e) => {
      const d = press.current;
      press.current = null;
      if (!d?.moving) return;
      swallow.current = true;
      setTimeout(() => (swallow.current = false));
      if (d.carried) {
        setCarry(null);
        onDragOver?.(null);
        gsap.set(slotOf(d.id), { autoAlpha: 1 });
        onDrop?.(d.id, e.clientX, e.clientY);
        settle();
        return;
      }
      if (d.to === d.from) return settle();
      const ids = layout.current.ids.filter((id) => id !== d.id);
      ids.splice(d.to, 0, d.id);
      dragged.current = true;
      onReorder(ids);
    };
    const cancel = () => {
      const d = press.current;
      press.current = null;
      if (!d?.moving) return;
      setCarry(null);
      onDragOver?.(null);
      gsap.set(slotOf(d.id), { autoAlpha: 1 });
      settle();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [cards, canCarry, onReorder, onDragOver, onDrop, cardH]);

  const setEl = (id, part) => (el) => {
    const map = els.current;
    if (!el) {
      if (part === "slot") map.delete(id);
      return;
    }
    map.set(id, { ...map.get(id), [part]: el });
  };

  const grab = !dealing && (canCarry || onReorder);

  return (
    // Headroom over the cards for a picked one to lift into, clear of the YOUR TURN mark above.
    <div ref={ref} className="relative w-full select-none" style={{ height: fullH + base + Math.round(fullH * 0.16) + 14 }} aria-label="Your hand">
      {n === 0 && emptyMessage ? (
        <div className="absolute inset-0 flex items-center justify-center font-pixel-display text-[12px] text-glow-gold text-center px-4">{emptyMessage}</div>
      ) : (
        // Rendered in a fixed order (by id), each card placed by GSAP from its slot in `cards`: a
        // re-sort then moves no element, and every card can travel to its new place.
        [...cards]
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .map((card) => {
            const on = selected.includes(card.id);
            return (
              <div
                key={card.id}
                ref={setEl(card.id, "slot")}
                data-hand-card={card.id}
                className="absolute"
                onPointerDown={(e) => startDrag(card.id, e)}
                style={{
                  left: "50%",
                  bottom: base,
                  width: cardW,
                  height: cardH,
                  marginLeft: -cardW / 2,
                  transformOrigin: "50% 100%",
                  visibility: hidden?.has(card.id) ? "hidden" : undefined,
                  cursor: grab ? "grab" : undefined,
                  // Carrying a card up onto the table needs every direction; reordering, only sideways (a vertical swipe still scrolls).
                  touchAction: !grab ? undefined : canCarry ? "none" : "pan-y",
                }}
              >
                <div ref={setEl(card.id, "flip")} className="relative w-full h-full">
                  <button
                    type="button"
                    aria-label={cardLabel(card)}
                    aria-pressed={on}
                    disabled={!enabled}
                    onClick={() => {
                      if (swallow.current) return void (swallow.current = false);
                      onToggle(card.id);
                    }}
                    className="block w-full h-full p-0 bg-transparent border-0"
                    // Off your turn the card can't be picked, but still dragged: the press goes to its slot.
                    style={{ cursor: enabled ? (grab ? "grab" : "pointer") : undefined, pointerEvents: enabled ? undefined : "none" }}
                  >
                    <PixelCard {...toPixelCardProps(card)} width={cardW} selected={on} selectable={enabled} style={liftVars} />
                  </button>
                  <div ref={setEl(card.id, "back")} className="absolute inset-0 pointer-events-none invisible">
                    <PixelCard faceDown width={cardW} />
                  </div>
                </div>
              </div>
            );
          })
      )}
      {carry &&
        createPortal(
          <div className="fixed z-[80] pointer-events-none" style={{ left: carry.x, top: carry.y, transform: "translate(-50%, -60%) rotate(-4deg)", filter: "drop-shadow(4px 8px 0 rgba(10,7,18,0.45))" }}>
            <PixelCard {...toPixelCardProps(carry.card)} width={cardW} />
          </div>,
          document.body,
        )}
    </div>
  );
}
