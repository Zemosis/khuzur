// COIN — gold's mark: a pixel coin, lit top-left and shaded bottom-right.

import React from "react";

export default function Coin({ size = 8 }) {
  const edge = Math.max(2, Math.round(size / 4));
  return (
    <span
      aria-hidden
      className="inline-block shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: "#f4c430",
        boxShadow: `inset -${edge}px -${edge}px 0 #c89820, inset ${edge}px ${edge}px 0 #ffe066, 0 0 0 1px #0a0712`,
      }}
    />
  );
}
