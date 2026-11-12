// USE CARD DRAG — picking a card up and carrying it with the pointer, for
// Khuzur's beat: a card from your hand, or one you've already placed on the
// stack. A press that moves further than DRAG_PX is a drag: the card follows
// the pointer (a copy, drawn on <body> so no table transform skews it) and
// letting go reports where. A press that barely moves is still a click, and
// the click that ends a drag is swallowed.

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PixelCard } from "../PixelCard";
import { toPixelCardProps } from "./cardProps";

const DRAG_PX = 6;

/**
 * enabled: drags may start. onMove(key, x, y) as a card is carried (key null
 * once it's let go); onDrop(key, x, y) where it's let go, client px.
 * → { bind(key, card, w): pointer handlers for the card's element, wrapped
 *   onClick(handler) that ignores the click ending a drag, dragging: the key
 *   being carried, or null; ghost: the carried card, to render }.
 */
export function useCardDrag({ enabled, onMove, onDrop }) {
  const press = useRef(null); // { key, x, y, dragging } or { swallow: true }
  const [drag, setDrag] = useState(null); // { key, card, x, y, w }

  const end = (e, drop) => {
    const p = press.current;
    press.current = null;
    if (!p?.dragging) return;
    setDrag(null);
    onMove?.(null);
    if (drop) onDrop?.(p.key, e.clientX, e.clientY);
  };

  const bind = (key, card, w) => ({
    onPointerDown: (e) => {
      if (!enabled || e.button !== 0) return;
      press.current = { key, x: e.clientX, y: e.clientY, dragging: false };
    },
    onPointerMove: (e) => {
      const p = press.current;
      if (!p || p.key !== key) return;
      if (!p.dragging) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
        p.dragging = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      setDrag({ key, card, x: e.clientX, y: e.clientY, w });
      onMove?.(key, e.clientX, e.clientY);
    },
    onPointerUp: (e) => {
      if (!press.current?.dragging) {
        press.current = null;
        return;
      }
      end(e, true);
      // The click that follows a drag isn't a pick.
      press.current = { swallow: true };
      setTimeout(() => {
        if (press.current?.swallow) press.current = null;
      }, 0);
    },
    onPointerCancel: (e) => end(e, false),
  });

  const onClick = (handler) => () => {
    if (press.current?.swallow) {
      press.current = null;
      return;
    }
    handler();
  };

  const ghost = drag
    ? createPortal(
        <div className="fixed z-[80] pointer-events-none" style={{ left: drag.x, top: drag.y, transform: "translate(-50%, -60%) rotate(-4deg)", filter: "drop-shadow(4px 8px 0 rgba(10,7,18,0.45))" }}>
          <PixelCard {...toPixelCardProps(drag.card)} width={drag.w} />
        </div>,
        document.body,
      )
    : null;

  return { bind, onClick, dragging: drag?.key ?? null, ghost };
}
