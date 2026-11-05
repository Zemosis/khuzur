// TABLE PREVIEW — the Khuzur builder's live picture of the table being built:
// seats round the felt in team colours, you at the bottom and the rest
// clockwise; an arrow for the direction of play (to your left); and in the
// middle the face-up trump under the draw pile, beside the stack and the dead
// pile.

import React from "react";
import { INK } from "../pixelTokens";
import { seatColor, teammates } from "./teams";

const W = 320;
const H = 240;
const CX = W / 2;
const CY = H / 2;
const RX = 118; // seat ring
const RY = 82;
const SEAT_R = 20;

// Seat i sits clockwise from the bottom: on screen (y down) a growing angle
// turns clockwise, and the bottom is 90°.
const seatXY = (i, n) => {
  const a = ((90 + (i * 360) / n) * Math.PI) / 180;
  return [CX + RX * Math.cos(a), CY + RY * Math.sin(a)];
};
const arcPoint = (deg, rx, ry) => {
  const a = (deg * Math.PI) / 180;
  return [CX + rx * Math.cos(a), CY + ry * Math.sin(a)];
};

function Card({ x, y, w = 18, h = 26, face, rotate = 0 }) {
  return (
    <rect
      x={x - w / 2}
      y={y - h / 2}
      width={w}
      height={h}
      fill={face ? "#f6ecc9" : "#3a2470"}
      stroke={INK}
      strokeWidth={2}
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
    />
  );
}

export default function TablePreview({ table }) {
  const n = table.perTeam * table.teams;
  // On the felt by your seat, turning toward your left.
  const [ax, ay] = arcPoint(72, RX - 30, RY - 22);
  const [bx, by] = arcPoint(128, RX - 30, RY - 22);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`A table of ${n}, play going clockwise`} shapeRendering="crispEdges">
      <defs>
        <marker id="kz-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#f4c430" />
        </marker>
      </defs>
      <ellipse cx={CX} cy={CY} rx={RX - 12} ry={RY - 10} fill="#2f6b43" stroke="#7a5a2b" strokeWidth={8} />
      {/* draw pile with the trump tucked under it, the stack, the dead pile */}
      <Card x={CX - 62} y={CY} w={26} h={18} face />
      <Card x={CX - 66} y={CY} />
      <Card x={CX - 63} y={CY - 3} />
      <Card x={CX} y={CY} face />
      <Card x={CX + 6} y={CY + 4} face />
      <Card x={CX + 62} y={CY} />
      <text x={CX - 64} y={CY + 30} fill="#ead8b1" fontSize="8" textAnchor="middle" fontFamily="'Press Start 2P', monospace">
        DRAW
      </text>
      <text x={CX + 62} y={CY + 30} fill="#ead8b1" fontSize="8" textAnchor="middle" fontFamily="'Press Start 2P', monospace">
        DEAD
      </text>
      <path d={`M ${ax} ${ay} A ${RX - 30} ${RY - 22} 0 0 1 ${bx} ${by}`} fill="none" stroke="#f4c430" strokeWidth={3} markerEnd="url(#kz-arrow)" />
      {Array.from({ length: n }, (_, seat) => {
        const [x, y] = seatXY(seat, n);
        const label = seat === 0 ? "YOU" : teammates(table, 0, seat) ? "MATE" : null;
        return (
          <g key={seat} data-testid="preview-seat">
            <rect x={x - SEAT_R} y={y - SEAT_R} width={SEAT_R * 2} height={SEAT_R * 2} fill={seatColor(table, seat)} stroke={INK} strokeWidth={3} />
            {label && (
              <text x={x} y={y + 3} fill={INK} fontSize="7" textAnchor="middle" fontFamily="'Press Start 2P', monospace">
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
