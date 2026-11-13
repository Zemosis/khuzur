// STACK COLUMNS — the Khuzur stack on the felt, piled like Thirteen's plays.
// Each lead card starts a column, and every beat lays one card right on top
// of the card it beat, at an alternating tilt, so you see which card beat
// which. The cards underneath peek out above (STACK_PEEK of a card's height
// per layer down) and dim the deeper they lie. The pile's box is fixed: a new
// layer lands on top and nothing else moves or resizes, the layer under it
// just swings to its tilt. A lead of 5 or 7 lies in two rows (stackRows):
// 3 over 2, 4 over 3.
//
// A card that just landed slides in from its owner's side of the table (CSS
// kz-land; still under reduced motion), unless it flew there (your own, see
// CardFlights), and the top layer glows a moment as
// it lands (kz-fresh), so a quick move is still seen.
//
// While a beat is being placed, its cards lie on top of the columns they
// cover, ringed in gold: face up for the player placing them, face down for
// everyone else. Yours fly here from your hand (hidden till they land). Yours can be clicked to take one back, or dragged: onto
// another top card to move it there, or off the stack to take it back. The top layer's cards are drop
// targets for a card dragged from your hand (data-beat-col), and the one
// under the drag lights up.

import React, { useState } from "react";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { toPixelCardProps } from "./cardProps";
import { useCardDrag } from "./useCardDrag";
import { STACK_PEEK, stackPeeks, stackRows } from "./khuzurGeometry";

// Stable pseudo-random numbers per card, so the pile never reshuffles on a re-render.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** How a card `depth` layers down (0 = the top) of layer k lies: tilt, nudge, peek up (at most `peeks` layers), dim. */
function lie(key, k, depth, cardH, peeks) {
  const r = hash(key);
  const r2 = hash(`${key}*`);
  const sign = k % 2 ? 1 : -1;
  const rotation = depth <= 0 ? sign * (1 + r * 2.5) : sign * (6 + r * 6);
  const peek = Math.min(Math.max(depth, 0), peeks) * STACK_PEEK * cardH;
  return {
    transform: `translate(${Math.round((r2 - 0.5) * 8)}px, ${Math.round((r - 0.5) * 4 - peek)}px) rotate(${rotation.toFixed(1)}deg)`,
    filter: depth > 0 ? `brightness(${Math.max(0.55, 0.88 - (depth - 1) * 0.11)})` : "none",
  };
}

/**
 * layers / owners: the stack. cardW: each card's width. colorOf(seat): a
 * seat's colour. fromOf(seat): where a card of theirs slides in from, px.
 * hidden: ids of cards still flying in. staged: per column of the top layer,
 * null, { card } (yours, face up) or { hidden: true } (someone else's, face
 * down); stagedColor: the beater's colour. onUnstage(col): take yours back.
 * targets: the top cards take drops; dropCol: the one a drag is over.
 * onStagedMove(col, x, y) / onStagedDrop(col, x, y): a placed card of yours
 * carried from column `col` (col null once let go), and where it's let go.
 */
export default function StackColumns({ layers, owners, cardW, colorOf, fromOf, hidden = null, staged = null, stagedColor = null, onUnstage, targets = false, dropCol = null, onStagedMove, onStagedDrop }) {
  const { bind, onClick, dragging, ghost } = useCardDrag({ enabled: !!onStagedDrop, onMove: onStagedMove, onDrop: onStagedDrop });
  // Cards that came in by a flight (hidden till it landed) don't slide in again once shown.
  const [flown, setFlown] = useState(() => new Set());
  if (hidden && [...hidden].some((id) => !flown.has(id))) setFlown(new Set([...flown, ...hidden]));
  if (!layers?.length) return null;
  const cardH = Math.round(cardW * CARD_RATIO);
  const columns = layers[0].length;
  const peeks = stackPeeks(columns);
  const headroom = Math.round(peeks * STACK_PEEK * cardH);
  const gap = Math.max(6, Math.round(cardW * 0.16));
  const top = layers.length - 1;
  return (
    <div className="flex flex-col items-center" style={{ rowGap: 6 }} aria-label={`The stack: ${layers.length} layer${layers.length === 1 ? "" : "s"}`}>
      {stackRows(columns).map((row, r) => (
        <div key={r} className="flex items-end" style={{ gap, paddingTop: headroom }}>
          {row.map((col) => {
            const place = staged?.[col];
            // A card placed on this column sits on top, and the layers under it lie one deeper.
            const lift = place && dragging !== col ? 1 : 0; // and while it's carried off, the card under it shows uncovered
            return (
              <div key={col} className="relative" style={{ width: cardW, height: cardH }}>
                {layers.map((layer, k) => {
                  const [fx, fy] = fromOf(owners[k]);
                  const card = layer[col];
                  const isTop = k === top;
                  const depth = top - k + lift;
                  const target = isTop && dropCol === col;
                  const how = lie(`${k}-${card.id}`, k, depth, cardH, peeks);
                  return (
                    <div
                      key={`${k}-${card.id}`}
                      data-testid="stack-card"
                      data-stack-card={card.id}
                      data-beat-col={isTop && targets ? col : undefined}
                      className={flown.has(card.id) || hidden?.has(card.id) ? "absolute inset-0" : "absolute inset-0 kz-land"}
                      style={{
                        zIndex: k,
                        "--from-x": `${fx}px`,
                        "--from-y": `${fy}px`,
                        // Your own card is still flying in from your hand (see CardFlights).
                        visibility: hidden?.has(card.id) ? "hidden" : undefined,
                      }}
                    >
                      <div
                        className={target ? "kz-target" : undefined}
                        style={{
                          transform: how.transform,
                          filter: how.filter,
                          transition: "transform 280ms ease-out, filter 280ms ease-out",
                          boxShadow: target ? undefined : `0 -3px 0 0 ${colorOf(owners[k])}, 2px 4px 0 rgba(10,7,18,0.35)`,
                        }}
                      >
                        <div className={isTop ? "kz-fresh" : undefined}>
                          <PixelCard {...toPixelCardProps(card)} width={cardW} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {place && (
                  <button
                    type="button"
                    data-testid="staged-card"
                    data-staged-col={col}
                    data-staged-card={place.card?.id}
                    disabled={!place.card}
                    onClick={onClick(() => place.card && onUnstage?.(col))}
                    {...(place.card ? bind(col, place.card, cardW) : {})}
                    aria-label={place.card ? `Take back ${place.card.rank === "JOKER" ? "the joker" : `${place.card.rank}${place.card.suit}`}` : "A card placed, not played yet"}
                    // Yours flies here from your hand; someone else's (face down) rises into place.
                    className={place.card ? "absolute inset-0 p-0 bg-transparent border-0" : "absolute inset-0 p-0 bg-transparent border-0 kz-rise"}
                    style={{
                      zIndex: layers.length + 1,
                      cursor: place.card ? "grab" : "default",
                      touchAction: place.card ? "none" : undefined,
                      // While it's carried, only the carried copy shows: no faded afterimage left behind.
                      opacity: dragging === col ? 0 : undefined,
                      // Yours is still flying here from your hand (or another column).
                      visibility: place.card && hidden?.has(place.card.id) ? "hidden" : undefined,
                      // Gold all round: placed, not played yet; the bar on top is the beater's colour, as on every layer.
                      boxShadow: `0 -3px 0 0 ${stagedColor ?? "#f4c430"}, 0 0 0 3px #f4c430, 4px 6px 0 rgba(10,7,18,0.45)`,
                      transform: lie(`staged-${col}`, layers.length, 0, cardH, peeks).transform,
                    }}
                  >
                    {place.card ? <PixelCard {...toPixelCardProps(place.card)} width={cardW} /> : <PixelCard faceDown width={cardW} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {ghost}
    </div>
  );
}
