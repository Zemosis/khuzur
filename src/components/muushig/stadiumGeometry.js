// STADIUM GEOMETRY — where everything lies on the Muushig table (see
// StadiumTable), in the table's own units, built on Poker's stadium (see
// poker/tableShape.js).

import { stadiumPoint } from "../poker/tableShape";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (f) => `${f * 100}%`;

export const SEAT_NAMES = ["bottom", "bottomLeft", "topLeft", "topRight", "bottomRight"];

// Each table in its own units (px on a table this wide; sizes scale with it,
// plates don't: their words are a fixed size). By seat: how far round the rim
// it sits (t, see tableShape), how far in its cards lie (fan; null for none),
// how far past its t the dealer button sits, and where its card lies in the
// draw for the deal (draw: inset). You have no plate: your hand, under the
// table, is your seat. The rest are fractions of the felt: [x, y].
export const GEOMETRY = {
  full: {
    width: 1100,
    height: 430,
    felt: { x0: 190, y0: 70, x1: 910, y1: 416 },
    minHeight: 300,
    outside: true,
    plateW: 156,
    track: 30,
    seats: {
      bottom: { t: 0, fan: null, button: 0.03, draw: 76 },
      bottomLeft: { t: 0.185, fan: 66, button: 0.045, draw: 92 },
      topLeft: { t: 0.36, fan: 66, button: 0.045, draw: 92 },
      topRight: { t: 0.64, fan: 66, button: -0.045, draw: 92 },
      bottomRight: { t: 0.815, fan: 66, button: -0.045, draw: 92 },
    },
    trumpAt: [0.5, 0.2],
    trickAt: [0.5, 0.555],
    drawAt: [0.28, 0.555],
    deadAt: [0.72, 0.555],
    labelAt: [0.5, 0.875],
    sizes: { trick: 84, pile: 64, trump: 72, fan: 36, button: 26, glow: 130 },
  },
  compact: {
    width: 380,
    height: 562,
    felt: { x0: 34, y0: 52, x1: 346, y1: 548 },
    minHeight: 440,
    outside: false,
    plateW: 70,
    track: 34,
    seats: {
      bottom: { t: 0, fan: null, button: 0.04, draw: 60 },
      bottomLeft: { t: 0.205, fan: null, button: 0.04, draw: 70 },
      topLeft: { t: 0.36, fan: null, button: 0.045, draw: 64 },
      topRight: { t: 0.64, fan: null, button: -0.045, draw: 64 },
      bottomRight: { t: 0.795, fan: null, button: -0.04, draw: 70 },
    },
    trumpAt: [0.5, 0.2],
    trickAt: [0.5, 0.465],
    drawAt: [0.34, 0.77],
    deadAt: [0.66, 0.77],
    labelAt: [0.5, 0.625],
    sizes: { trick: 56, pile: 42, trump: 48, fan: 18, button: 20, glow: 110 },
  },
};

/** A point of the felt ([x, y], fractions of it) as a fraction of the table's width and height. */
export const onFelt = (geo, [x, y]) => {
  const { x0, y0, x1, y1 } = geo.felt;
  return { left: pct((x0 + x * (x1 - x0)) / geo.width), top: pct((y0 + y * (y1 - y0)) / geo.height) };
};

/** A point of the table as a fraction of its width and height. */
export const fractionOf = (geo, { x, y }) => ({ left: pct(x / geo.width), top: pct(y / geo.height) });

/** How far a seat's cards turn to open toward the middle: the fan's top faces in, away from the rim. */
export const turnAt = (geo, t) => {
  const { nx, ny } = stadiumPoint(geo.felt, t);
  return Math.round((Math.atan2(-nx, ny) * 180) / Math.PI);
};

/** Each seat's card turn on a table: { seat: degrees }, for the deal and card flights. */
export function seatTurns(layout) {
  const geo = GEOMETRY[layout] ?? GEOMETRY.full;
  return Object.fromEntries(SEAT_NAMES.slice(1).map((s) => [s, turnAt(geo, geo.seats[s].t)]));
}

/**
 * Where a seat's plate goes: just off the rim (`outside`), else on it, and
 * never past the table's sides however narrow it gets. tableW: its width, px.
 */
export function plateAt(geo, t, tableW) {
  const p = stadiumPoint(geo.felt, t, geo.outside ? -6 : 0);
  const most = Math.max(Math.abs(p.nx), Math.abs(p.ny));
  const [pullX, pullY] = geo.outside ? [p.nx / most, p.ny / most] : [0, 0];
  const shift = (k) => `calc(-50% + ${(k * 50).toFixed(1)}%)`;
  const base = fractionOf(geo, p);
  if (!tableW) return { ...base, transform: `translate(${shift(pullX)}, ${shift(pullY)})` };
  const half = geo.plateW / 2;
  const x = (p.x / geo.width) * tableW + pullX * half;
  return { ...base, left: clamp(x, half + 2, tableW - half - 2), transform: `translate(-50%, ${shift(pullY)})` };
}
