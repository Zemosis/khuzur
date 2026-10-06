// Where a seat sits on screen for a given viewer: you at the bottom, the rest
// clockwise — the same rotation the live tables use. Thirteen seats 2 to 4
// (2: across; 3: left and right; 4: left, top, right); Muushig seats 5 (two
// on each side).

const POSITIONS = {
  2: ["bottom", "top"],
  3: ["bottom", "left", "right"],
  4: ["bottom", "left", "top", "right"],
  5: ["bottom", "bottomLeft", "topLeft", "topRight", "bottomRight"],
};

/** The positions around a table of `count`, clockwise from the bottom. */
export const seatPositions = (count) => POSITIONS[count];

export const positionOf = (seat, mySeat, count = 4) => POSITIONS[count][(seat - (mySeat ?? 0) + count) % count];
