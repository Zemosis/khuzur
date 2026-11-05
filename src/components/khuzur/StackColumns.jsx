// STACK COLUMNS — the Khuzur stack on the felt. Each lead card starts a
// column, and every beat lays one card on each column, a little lower, so
// every layer shows and you can see which card beat which. A card that just
// landed slides in from its owner's side of the table (CSS kz-land; still
// under reduced motion).

import React from "react";
import { PixelCard } from "../PixelCard";
import { CARD_RATIO } from "../../hooks/useTableMetrics";
import { toPixelCardProps } from "./cardProps";

export default function StackColumns({ layers, owners, cardW, colorOf, fromOf }) {
  if (!layers?.length) return null;
  const cardH = Math.round(cardW * CARD_RATIO);
  const offset = Math.round(cardH * 0.3);
  const gap = Math.max(4, Math.round(cardW * 0.12));
  const columns = layers[0].length;
  const height = cardH + (layers.length - 1) * offset;
  return (
    <div className="flex items-start" style={{ gap }} aria-label={`The stack: ${layers.length} layer${layers.length === 1 ? "" : "s"}`}>
      {Array.from({ length: columns }, (_, col) => (
        <div key={col} className="relative" style={{ width: cardW, height }}>
          {layers.map((layer, k) => {
            const [fx, fy] = fromOf(owners[k]);
            const card = layer[col];
            return (
              <div
                key={`${k}-${card.id}`}
                data-testid="stack-card"
                className="absolute left-0 kz-land"
                style={{
                  top: k * offset,
                  zIndex: k,
                  "--from-x": `${fx}px`,
                  "--from-y": `${fy}px`,
                  boxShadow: `0 -3px 0 0 ${colorOf(owners[k])}`,
                }}
              >
                <PixelCard {...toPixelCardProps(card)} width={cardW} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
