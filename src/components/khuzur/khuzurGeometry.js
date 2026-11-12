// KHUZUR GEOMETRY — where everything lies on the Khuzur table (see
// KhuzurTable), in the table's own units, on the same stadium as Muushig's
// and Poker's (see poker/tableShape.js and muushig/stadiumGeometry.js, whose
// helpers place things here too).
//
// Khuzur seats 2 to 6 (utils/seatPosition), so every position round the rim
// has a place: you at the foot, two on each side, one across. By seat: how far
// round the rim it sits (t), how far in its face-down cards lie (fan; null for
// none), how far past its t the dealer button sits, and where its card lies in
// the draw for the deal (draw: inset). The rest are fractions of the felt.
//
// The stack is the widest thing on the felt (up to 7 columns, a layer per
// beat), so it gets the middle and a box it must fit in (stackBox, fractions
// of the felt); the draw pile, with the trump tucked under it, and the dead
// pile sit at either end.
//
// Two shapes for a big screen: `full`, and `wide`, a longer table for a wide
// space (KhuzurTable picks whichever gives the bigger felt). Their drawSpots
// say where each seat's card lies in the draw for the deal, in table units
// from the felt's centre, clear of the pile in the middle and its caption
// under it.

export const KHUZUR_GEOMETRY = {
  full: {
    width: 1100,
    height: 466,
    felt: { x0: 180, y0: 88, x1: 920, y1: 452 },
    minHeight: 320,
    outside: true,
    plateW: 178,
    track: 30,
    seats: {
      bottom: { t: 0, fan: null, button: 0.03, draw: 78 },
      bottomLeft: { t: 0.185, fan: 52, button: 0.045, draw: 96 },
      left: { t: 0.25, fan: 52, button: 0.045, draw: 104 },
      topLeft: { t: 0.36, fan: 52, button: 0.045, draw: 92 },
      top: { t: 0.5, fan: 50, button: 0.04, draw: 96 },
      topRight: { t: 0.64, fan: 52, button: -0.045, draw: 92 },
      right: { t: 0.75, fan: 52, button: -0.045, draw: 104 },
      bottomRight: { t: 0.815, fan: 52, button: -0.045, draw: 96 },
    },
    drawAt: [0.205, 0.47],
    deadAt: [0.795, 0.47],
    stackAt: [0.5, 0.48],
    stackBox: [0.36, 0.55], // clear of the draw pile (and its trump) and the dead pile
    labelAt: [0.5, 0.835],
    sizes: { stack: 80, pile: 60, fan: 30, button: 26, glow: 130 },
    drawSpots: {
      bottom: [0, 124],
      bottomLeft: [-264, 80],
      left: [-292, 0],
      topLeft: [-232, -104],
      top: [0, -128],
      topRight: [232, -104],
      right: [292, 0],
      bottomRight: [264, 80],
    },
  },
  wide: {
    width: 1400,
    height: 466,
    felt: { x0: 180, y0: 88, x1: 1220, y1: 452 },
    minHeight: 320,
    outside: true,
    plateW: 178,
    track: 30,
    seats: {
      bottom: { t: 0, fan: null, button: 0.025, draw: 78 },
      bottomLeft: { t: 0.2, fan: 52, button: 0.04, draw: 96 },
      left: { t: 0.25, fan: 52, button: 0.04, draw: 104 },
      topLeft: { t: 0.372, fan: 52, button: 0.04, draw: 92 },
      top: { t: 0.5, fan: 50, button: 0.035, draw: 96 },
      topRight: { t: 0.628, fan: 52, button: -0.04, draw: 92 },
      right: { t: 0.75, fan: 52, button: -0.04, draw: 104 },
      bottomRight: { t: 0.8, fan: 52, button: -0.04, draw: 96 },
    },
    drawAt: [0.17, 0.47],
    deadAt: [0.83, 0.47],
    stackAt: [0.5, 0.48],
    stackBox: [0.48, 0.55],
    labelAt: [0.5, 0.835],
    sizes: { stack: 84, pile: 62, fan: 30, button: 26, glow: 140 },
    drawSpots: {
      bottom: [0, 124],
      bottomLeft: [-410, 80],
      left: [-440, 0],
      topLeft: [-320, -104],
      top: [0, -128],
      topRight: [320, -104],
      right: [440, 0],
      bottomRight: [410, 80],
    },
  },
  compact: {
    width: 380,
    height: 562,
    felt: { x0: 34, y0: 52, x1: 346, y1: 548 },
    minHeight: 440,
    outside: false,
    plateW: 74,
    track: 34,
    seats: {
      bottom: { t: 0, fan: null, button: 0.04, draw: 60 },
      bottomLeft: { t: 0.205, fan: null, button: 0.04, draw: 70 },
      left: { t: 0.25, fan: null, button: 0.04, draw: 70 },
      topLeft: { t: 0.36, fan: null, button: 0.045, draw: 64 },
      top: { t: 0.5, fan: null, button: 0.05, draw: 70 },
      topRight: { t: 0.64, fan: null, button: -0.045, draw: 64 },
      right: { t: 0.75, fan: null, button: -0.04, draw: 70 },
      bottomRight: { t: 0.795, fan: null, button: -0.04, draw: 70 },
    },
    drawAt: [0.3, 0.765],
    deadAt: [0.7, 0.765],
    stackAt: [0.5, 0.44],
    stackBox: [0.62, 0.38],
    labelAt: [0.5, 0.635],
    sizes: { stack: 56, pile: 40, fan: 18, button: 20, glow: 110 },
  },
};

export const KHUZUR_SEAT_NAMES = Object.keys(KHUZUR_GEOMETRY.full.seats);

// The stack is a pile, Thirteen style: each beat lies right on the cards it
// beat, at an alternating tilt, and the cards under it peek out above by
// STACK_PEEK of a card's height for each layer down, up to STACK_PEEKS layers.
// Its box never changes size as layers land.
export const STACK_PEEK = 0.13;
export const STACK_PEEKS = 3;

// A lead of 5 or 7 cards is too wide for one row between the piles: its
// columns go in two rows, the longer on top (7 → 4 over 3, 5 → 3 over 2),
// and only the card right under each beat peeks out (STACK_ROW_PEEKS), so
// the two rows keep a good size.
export const STACK_ROW_PEEKS = 1;

/** The stack's rows for `columns` lead cards: [[column, …], …], top row first. */
export function stackRows(columns) {
  const all = Array.from({ length: columns }, (_, i) => i);
  if (columns < 5) return [all];
  const top = Math.ceil(columns / 2);
  return [all.slice(0, top), all.slice(top)];
}

/** How many layers down the cards under a beat peek out, for `columns` lead cards. */
export const stackPeeks = (columns) => (stackRows(columns).length > 1 ? STACK_ROW_PEEKS : STACK_PEEKS);
