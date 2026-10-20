// SCORE TIMELINE — every seat's score after each round, from the start. The
// picked player's line is bright and labelled at its end; the rest stay dim.
// Thirteen counts points up (lower is better); Muushig counts down from 15 to
// 0. Hover or arrow-key focus on a round shows everyone's score there.

import React, { useEffect, useRef, useState } from "react";
import { scoreLines, seatName } from "../../utils/matchSummary";
import { seatColor } from "./seatColors";

const H = 240;
const PAD = { top: 16, right: 96, bottom: 30, left: 44 };
const GRID = "#1f1a3d";
const AXIS_TEXT = "#c8b890";

function ticks(min, max) {
  const span = Math.max(1, max - min);
  const step = [1, 2, 5, 10, 20, 50].find((s) => span / s <= 5) ?? 100;
  const out = [];
  // Rounded outward both ways, so the highest score stays inside the plot.
  for (let v = Math.floor(min / step) * step; v < max + step; v += step) out.push(v);
  return out;
}

/** seats: [{ seat, name }] one per seat (the finisher); picked: the bright one. */
export default function ScoreTimeline({ gameType, rounds, seats, picked }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(300, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!rounds.length) {
    return <p className="font-pixel-body text-[20px] text-bone/70 p-3">No rounds were recorded for this match.</p>;
  }

  const lines = scoreLines(gameType, rounds, seats.map((s) => s.seat));
  const values = Object.values(lines).flat();
  const yTicks = ticks(Math.min(0, ...values), Math.max(...values));
  const [yMin, yMax] = [yTicks[0], yTicks.at(-1)];
  const n = rounds.length;
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (i / n) * innerW;
  const y = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;
  // Dim seats first, the picked one on top.
  const order = [...seats].sort((a, b) => (a.seat === picked) - (b.seat === picked));

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - PAD.left) / innerW) * n);
    setHover(Math.max(0, Math.min(n, i)));
  };
  const onKey = (e) => {
    if (e.key === "ArrowRight") setHover((h) => Math.min(n, (h ?? -1) + 1));
    else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n + 1) - 1));
    else return;
    e.preventDefault();
  };
  const tipLeft = hover == null ? 0 : Math.min(width - 190, Math.max(0, x(hover) + 12));

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Legend: color is never the only way to tell the seats apart. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 font-pixel-body text-[18px]" aria-label="Seats">
        {seats.map((s) => (
          <li key={s.seat} className="flex items-center gap-1.5" style={{ color: s.seat === picked ? "#ead8b1" : "#8a7fb0" }}>
            <span aria-hidden style={{ width: 14, height: 3, backgroundColor: seatColor(s.seat), opacity: s.seat === picked ? 1 : 0.5 }} />
            {seatName(s)}
          </li>
        ))}
      </ul>
      <div ref={wrapRef} className="relative">
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`Score after each round. ${gameType === "muushig" ? "Counts down to 0." : "Lower is better."}`}
          tabIndex={0}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover((h) => h ?? n)}
          onBlur={() => setHover(null)}
          onKeyDown={onKey}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-[#f4c430]"
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fill={AXIS_TEXT} fontSize={14} className="font-pixel-body">
                {t}
              </text>
            </g>
          ))}
          {Array.from({ length: n + 1 }, (_, i) =>
            // About one label per 44px; "start" counts as one.
            i === 0 ? (
              <text key={i} x={x(i)} y={H - 8} textAnchor="start" fill={AXIS_TEXT} fontSize={14} className="font-pixel-body">
                start
              </text>
            ) : i % Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 44)))) === 0 && x(i) - x(0) > 40 ? (
              <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fill={AXIS_TEXT} fontSize={14} className="font-pixel-body">
                {i}
              </text>
            ) : null,
          )}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="#8a7fb0" strokeWidth={1} strokeDasharray="3 3" />}
          {order.map((s) => {
            const on = s.seat === picked;
            const pts = lines[s.seat];
            return (
              <g key={s.seat} opacity={on ? 1 : 0.35}>
                <polyline
                  points={pts.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                  fill="none"
                  stroke={seatColor(s.seat)}
                  strokeWidth={on ? 3 : 2}
                  strokeLinejoin="round"
                />
                {pts.map((v, i) => (
                  <rect key={i} x={x(i) - 4} y={y(v) - 4} width={8} height={8} fill={seatColor(s.seat)} stroke="#14102a" strokeWidth={2} />
                ))}
                {on && (
                  <text x={x(n) + 10} y={y(pts[n])} dominantBaseline="middle" fill="#ead8b1" fontSize={16} className="font-pixel-body">
                    {seatName(s)} {pts[n]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <div
            role="status"
            className="absolute pointer-events-none flex flex-col gap-1 px-2.5 py-2 font-pixel-body text-[18px] leading-none"
            style={{ left: tipLeft, top: 8, width: 178, backgroundColor: "#0a0712", boxShadow: "0 0 0 2px #463a78" }}
          >
            <span className="font-pixel-display text-[9px] text-bone/70">{hover === 0 ? "START" : `AFTER ROUND ${hover}`}</span>
            {[...seats]
              .sort((a, b) => lines[a.seat][hover] - lines[b.seat][hover])
              .map((s) => (
                <span key={s.seat} className="flex items-center gap-1.5 text-parchment">
                  <span aria-hidden style={{ width: 8, height: 8, backgroundColor: seatColor(s.seat) }} />
                  <span className="truncate flex-1">{seatName(s)}</span>
                  <span className="tabular-nums">{lines[s.seat][hover]}</span>
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
