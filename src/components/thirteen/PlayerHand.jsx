// PLAYER HAND — big fanned hand; every card's position is owned by GSAP.
//
// Each card is a stack of layers so no two animations fight over one
// transform:
//   slot  — x / y / rotation / scale / zIndex, tweened by GSAP only
//   flip  — scaleX, for the face-down → face-up turn after a deal
//   card  — PixelCard; hover and selection lift it with CSS
// While dealing, the hand is laid out as 13 fixed slots and each new card
// flies in from the deck. When the deal ends the hand is shown unsorted for
// a beat, then every card arcs to its sorted slot. Switching the sort mode
// (rank / suit) replays the same arc.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { PixelCard } from "../PixelCard";
import { sortHand, sortHandBySuit } from "../../utils/deckUtils";
import { CARD_RATIO, DEAL_FLY } from "../../hooks/useTableMetrics";
import { reducedMotion } from "../../utils/motion";

const HAND_SIZE = 13;
const SORT_HOLD = 0.5;
const SORT_STAGGER = 0.035;
const SORT_SLIDE = 0.42;
const REFLOW = 0.32;

/** Bottom-center of card i of n, relative to the hand's anchor point. */
function handSlot(i, n, cardW, width, spread) {
  const mid = (n - 1) / 2;
  const d = i - mid;
  const room = Math.max(0, width - cardW - 48);
  const spacing = n > 1 ? Math.min(cardW * spread, room / (n - 1)) : 0;
  const dip = cardW * 0.1; // how far the outermost cards sit below the middle
  return {
    x: d * spacing,
    y: mid ? (d * d * dip) / (mid * mid) : 0,
    rotation: d * Math.min(2.2, 26 / Math.max(n - 1, 1)),
  };
}

const PlayerHand = ({
  hand = [],
  selectedCards = [],
  onSelectionChange,
  isActive = true,
  isDealing = false,
  cardWidth = 96,
  deckWidth = 68,
  dealOriginRef,
  sortMode = "rank",
  isEliminated = false,
  isPlayable, // optional (card) => bool; unplayable cards are dimmed and locked
  spread = 0.74, // card-to-card step as a share of card width (<1 overlaps)
  emptyMessage, // optional text shown when the hand is empty
  handSize = HAND_SIZE, // slots laid out while cards are being dealt
  // Optional cards drawn mid-round: { ids, originRef, delay, stagger,
  // sideways, faceUp }. Those cards fly from originRef (a pile, or a card
  // lying sideways), `delay` seconds from now; face down unless faceUp.
  arrival,
}) => {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);
  const elsRef = useRef(new Map());
  const placedRef = useRef(new Set());
  const prevDealingRef = useRef(isDealing);
  const prevSortModeRef = useRef(sortMode);
  const sortTlRef = useRef(null);
  const lastSelectedIndex = useRef(-1);

  const cardH = Math.round(cardWidth * CARD_RATIO);
  // Room below the anchor for the outer cards: their arc dip plus the corner
  // that drops as they tilt (up to ~14 degrees).
  const base = Math.round(cardWidth * 0.1 + (cardWidth / 2) * Math.sin((14 * Math.PI) / 180)) + 8;
  const displayHand = useMemo(
    () => (isDealing ? hand : sortMode === "suit" ? sortHandBySuit(hand) : sortHand(hand)),
    [hand, isDealing, sortMode],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const w = width || containerRef.current?.clientWidth;
    if (!w) return;
    const wasDealing = prevDealingRef.current;
    prevDealingRef.current = isDealing;
    const resorted = prevSortModeRef.current !== sortMode;
    prevSortModeRef.current = sortMode;
    if (resorted) lastSelectedIndex.current = -1; // shift-range anchor moved

    // Forget cards that left the hand (played, or a new round's deal).
    const ids = new Set(displayHand.map((c) => c.id));
    placedRef.current.forEach((id) => !ids.has(id) && placedRef.current.delete(id));

    const n = isDealing ? Math.max(handSize, displayHand.length) : displayHand.length;
    const slots = displayHand.map((_, i) => handSlot(i, n, cardWidth, w, spread));
    const reduce = reducedMotion();
    const dealEnded = wasDealing && !isDealing;
    const startSort = (dealEnded || (resorted && !isDealing)) && displayHand.length > 1 && !reduce;

    if (startSort || !isDealing) {
      sortTlRef.current?.kill();
      sortTlRef.current = null;
    }

    let sortTl = null;
    if (startSort) {
      sortTl = gsap.timeline({
        delay: dealEnded ? SORT_HOLD : 0,
        onComplete: () => {
          sortTlRef.current = null;
        },
      });
      sortTlRef.current = sortTl;
    }

    let arrived = 0;
    displayHand.forEach((card, i) => {
      const els = elsRef.current.get(card.id);
      if (!els) return;
      const s = slots[i];

      if (!placedRef.current.has(card.id)) {
        placedRef.current.add(card.id);
        const drawn = !isDealing && arrival?.ids.includes(card.id);
        const origin = (isDealing ? dealOriginRef : drawn ? arrival.originRef : null)?.current?.getBoundingClientRect();
        if (!origin || reduce) {
          gsap.set(els.slot, { ...s, scale: 1, zIndex: i });
          gsap.set(els.back, { autoAlpha: 0 });
          return;
        }
        // Fly face-down from the deck (or pile), then turn face-up on landing.
        const c = containerRef.current.getBoundingClientRect();
        const sideways = drawn && arrival.sideways;
        const faceUp = drawn && arrival.faceUp;
        const scale = (isDealing ? deckWidth : sideways ? origin.height : origin.width) / cardWidth;
        const delay = drawn ? (arrival.delay ?? 0) + arrived++ * (arrival.stagger ?? 0) : 0;
        const ox = origin.left + origin.width / 2 - (c.left + c.width / 2);
        const oy = origin.top + origin.height / 2 - (c.bottom - base);
        const half = (cardH * scale) / 2;
        // Slots turn about their bottom centre: a sideways card's pivot sits
        // half a card to the left of its middle, an upright one's below it.
        const from = sideways
          ? { x: ox - half, y: oy, rotation: 90, scale, zIndex: i }
          : { x: ox, y: oy + half, rotation: gsap.utils.random(-20, 20), scale, zIndex: i };
        gsap.set(els.back, { autoAlpha: faceUp ? 0 : 1 });
        const tl = gsap.timeline({ delay }).fromTo(els.slot, from, { ...s, scale: 1, duration: DEAL_FLY, ease: "power2.out" });
        if (!faceUp)
          tl.to(els.flip, { scaleX: 0, duration: 0.07, ease: "power1.in" })
            .set(els.back, { autoAlpha: 0 })
            .to(els.flip, { scaleX: 1, duration: 0.09, ease: "power1.out" });
        return;
      }

      // Dealt cards keep their slot until the deal is over.
      if (isDealing) return;

      if (sortTl) {
        const at = i * SORT_STAGGER;
        const lift = cardH * 0.28;
        sortTl.to(els.slot, { x: s.x, rotation: s.rotation, duration: SORT_SLIDE, ease: "power2.inOut" }, at);
        sortTl.to(
          els.slot,
          {
            keyframes: [
              { y: s.y - lift, duration: SORT_SLIDE * 0.45, ease: "power2.out" },
              { y: s.y, duration: SORT_SLIDE * 0.55, ease: "power2.in" },
            ],
          },
          at,
        );
        // Over the top of the arc the card passes above the others, then
        // settles into its final stacking order.
        sortTl.set(els.slot, { zIndex: 100 + i }, at + SORT_SLIDE * 0.4);
        sortTl.set(els.slot, { zIndex: i }, at + SORT_SLIDE);
        return;
      }

      gsap.to(els.slot, { ...s, scale: 1, duration: REFLOW, ease: "power3.out", overwrite: "auto" });
      gsap.set(els.slot, { zIndex: i });
    });
    // arrival is read only when new cards show up, alongside the new hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayHand, isDealing, sortMode, cardWidth, deckWidth, cardH, base, width, dealOriginRef, spread, handSize]);

  useEffect(() => () => sortTlRef.current?.kill(), []);

  const setEls = useCallback((id, part, el) => {
    const map = elsRef.current;
    if (!el) {
      if (part === "slot") map.delete(id);
      return;
    }
    const entry = map.get(id) || {};
    entry[part] = el;
    map.set(id, entry);
  }, []);

  const canSelect = isActive && !isDealing;

  const toggleCardSelection = (card, e) => {
    // Clicks count while the hand sorts itself too: the turn is already open,
    // and the card clicked is the one selected wherever it's headed.
    if (!canSelect || isPlayable?.(card) === false) return;
    const currentIndex = displayHand.findIndex((c) => c.id === card.id);

    if (e?.shiftKey && lastSelectedIndex.current !== -1) {
      const start = Math.min(lastSelectedIndex.current, currentIndex);
      const end = Math.max(lastSelectedIndex.current, currentIndex);
      const next = new Map(selectedCards.map((c) => [c.id, c]));
      displayHand
        .slice(start, end + 1)
        .filter((c) => isPlayable?.(c) !== false)
        .forEach((c) => next.set(c.id, c));
      onSelectionChange(Array.from(next.values()));
      return;
    }
    lastSelectedIndex.current = currentIndex;
    const isSelected = selectedCards.some((c) => c.id === card.id);
    onSelectionChange(isSelected ? selectedCards.filter((c) => c.id !== card.id) : [...selectedCards, card]);
  };

  const liftVars = {
    "--lift": `${Math.round(cardH * 0.18)}px`,
    "--hover-lift": `${Math.round(cardH * 0.08)}px`,
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ height: cardH + base + Math.round(cardH * 0.08), overflow: "visible" }}
      aria-label="Your hand"
    >
      {hand.length === 0 && !isDealing ? (
        <div className="absolute inset-0 flex items-center justify-center font-pixel-display text-[12px] text-glow-gold">
          {emptyMessage ?? (isEliminated ? "YOU'RE OUT — WATCHING THE REST OF THE MATCH" : "NO CARDS — YOU WIN!")}
        </div>
      ) : (
        displayHand.map((card) => (
          <div
            key={card.id}
            ref={(el) => setEls(card.id, "slot", el)}
            data-card-id={card.id}
            style={{
              position: "absolute",
              left: "50%",
              bottom: base,
              width: cardWidth,
              height: cardH,
              marginLeft: -cardWidth / 2,
              transformOrigin: "50% 100%",
            }}
          >
            <div ref={(el) => setEls(card.id, "flip", el)} className="relative w-full h-full">
              <PixelCard
                rank={card.rank}
                suit={card.suit}
                width={cardWidth}
                selected={selectedCards.some((c) => c.id === card.id)}
                selectable={canSelect && isPlayable?.(card) !== false}
                dim={!isDealing && isPlayable?.(card) === false}
                onClick={(e) => toggleCardSelection(card, e)}
                style={liftVars}
              />
              <div ref={(el) => setEls(card.id, "back", el)} className="absolute inset-0 pointer-events-none invisible">
                <PixelCard faceDown width={cardWidth} />
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default PlayerHand;
