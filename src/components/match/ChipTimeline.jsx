// CHIP TIMELINE — a poker player's chips won or lost over their hands at one
// table, from 0 at the start: above the line is up, below is down. Hover or
// arrow-key focus on a hand shows what it did and the running total.

import React, { useEffect, useRef, useState } from "react";

const H = 220;
const PAD = { top: 16, right: 72, bottom: 30, left: 52 };
const GRID = "#1f1a3d";
const AXIS_TEXT = "#c8b890";
const UP = "#9bd14f";
const DOWN = "#e85a7a";
const signed = (n) => (n > 0 ? `+${n}` : String(n));

function ticks(min, max) {
  const span = Math.max(1, max - min);
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find((s) => span / s <= 5) ?? 20000;
  const out = [];
  for (let v = Math.floor(min / step) * step; v < max + step; v += step) out.push(v);
  return out;
}

/** hands: [{ n, net }] in order. */
export default function ChipTimeline({ hands }) {
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

  const totals = [0];
  for (const h of hands) totals.push(totals.at(-1) + h.net);
  const yTicks = ticks(Math.min(0, ...totals), Math.max(0, ...totals));
  const [yMin, yMax] = [yTicks[0], yTicks.at(-1)];
  const n = hands.length;
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (i / Math.max(1, n)) * innerW;
  const y = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;
  const end = totals.at(-1);
  const tone = end >= 0 ? UP : DOWN;

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - PAD.left) / innerW) * n);
    setHover(Math.max(1, Math.min(n, i)));
  };
  const onKey = (e) => {
    if (e.key === "ArrowRight") setHover((h) => Math.min(n, (h ?? 0) + 1));
    else if (e.key === "ArrowLeft") setHover((h) => Math.max(1, (h ?? n + 1) - 1));
    else return;
    e.preventDefault();
  };
  const hand = hover != null ? hands[hover - 1] : null;
  const tipLeft = hover == null ? 0 : Math.min(width - 200, Math.max(0, x(hover) + 12));
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 48))));

  return (
    <div ref={wrapRef} className="relative p-3">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`Chips won or lost over ${n} hands: ${signed(end)} at the end.`}
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
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#463a78" : GRID} strokeWidth={t === 0 ? 2 : 1} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fill={AXIS_TEXT} fontSize={14} className="font-pixel-body">
              {signed(t)}
            </text>
          </g>
        ))}
        {Array.from({ length: n + 1 }, (_, i) =>
          i > 0 && i % labelEvery === 0 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fill={AXIS_TEXT} fontSize={14} className="font-pixel-body">
              {i}
            </text>
          ) : null,
        )}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="#8a7fb0" strokeWidth={1} strokeDasharray="3 3" />}
        <polyline points={totals.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={tone} strokeWidth={3} strokeLinejoin="round" />
        {n <= 60 && totals.slice(1).map((v, i) => <rect key={i} x={x(i + 1) - 3} y={y(v) - 3} width={6} height={6} fill={hands[i].net >= 0 ? UP : DOWN} stroke="#14102a" strokeWidth={1.5} />)}
        {hover != null && <rect x={x(hover) - 5} y={y(totals[hover]) - 5} width={10} height={10} fill="#ead8b1" stroke="#14102a" strokeWidth={2} />}
        <text x={x(n) + 10} y={y(end)} dominantBaseline="middle" fill={tone} fontSize={16} className="font-pixel-body">
          {signed(end)}
        </text>
      </svg>
      {hand && (
        <div
          role="status"
          className="absolute pointer-events-none flex flex-col gap-1 px-2.5 py-2 font-pixel-body text-[18px] leading-none"
          style={{ left: tipLeft + 12, top: 12, backgroundColor: "#0a0712", border: "2px solid #463a78", color: "#ead8b1" }}
        >
          <span className="font-pixel-display text-[9px] text-bone/70">HAND {hand.n}</span>
          <span style={{ color: hand.net > 0 ? UP : hand.net < 0 ? DOWN : "#ead8b1" }}>{signed(hand.net)} this hand</span>
          <span>{signed(totals[hover])} so far</span>
        </div>
      )}
    </div>
  );
}
