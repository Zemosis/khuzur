// AVATAR ART — draws any 17x17 avatar (built-in or painted) pixel-exact.
//
// The requested size is snapped so the art covers a whole multiple of 17
// DEVICE pixels. With 1 CSS px = 1.25 device px (a Windows laptop at 125%
// scaling), a 51px avatar would otherwise be 63.75 device px — 3.75 per avatar
// pixel — and the browser would draw some pixels 3 wide and some 4. Snapping
// trades a pixel or two of layout size for every avatar pixel being the same
// size. The border sits outside the art so it never crops the edge pixels.
//
// It's drawn as SVG squares with crisp edges, not as a canvas. A canvas is a
// bitmap the GPU stretches onto the screen as two triangles; an avatar sitting
// half a device pixel off the grid (the tables place their plates by
// percentages and centre them with translate(-50%)) came out split along that
// diagonal, one half of its eyes and mouth a pixel higher than the other.
// Nudging it back onto the grid can't reach inside a transformed plate, where
// the browser rounds layout away before the transform. Squares are drawn
// fresh wherever they land: at worst the whole face moves by a pixel, in one
// piece. Each run of squares is its own <rect>: Chrome anti-aliases a big
// combined path's edges even under crispEdges when it sits off the grid,
// blending them with the plate behind into dark lines across the face;
// rectangles it draws crisp.

import React, { useEffect, useMemo, useState } from "react";
import { GRID_SIZE, avatarRuns, snapAvatarSize } from "../utils/avatarConstants";

function useDevicePixelRatio() {
  const [dpr, setDpr] = useState(() => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  useEffect(() => {
    // Fires when the page moves to a screen with different scaling, or zooms.
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const update = () => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [dpr]);
  return dpr;
}

export default function CustomAvatarCanvas({ avatarData, size = 51, border = true }) {
  const dpr = useDevicePixelRatio();
  const { css } = snapAvatarSize(size, dpr);
  const runs = useMemo(() => avatarRuns(avatarData), [avatarData]);

  return (
    <svg
      viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
      width={css}
      height={css}
      shapeRendering="crispEdges"
      aria-hidden
      style={{
        display: "block",
        flexShrink: 0,
        boxShadow: border ? "0 0 0 2px #0a0712, 2px 2px 0 2px #0a0712" : "none",
      }}
    >
      {runs.map(({ color, x, y, w }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} fill={color} />
      ))}
    </svg>
  );
}
