// JOKER FACE — the middle and corners of a joker card (Khuzur's gray and
// colored jokers). Each joker is its own character in a little framed scene,
// drawn as a pixel grid of SVG squares so it stays crisp at every card size:
//
//   gray  — a moonlit Pierrot: silver three-horned hat with silver bells, a
//           pale face with one blue tear and a frown, under a crescent moon
//           and stars, with a cool silver shine.
//   color — a grinning harlequin crowned in gold: rose, cyan and violet horns
//           with gold bells, rosy cheeks and a gold ruff, on crimson and indigo
//           diamonds in a gold frame, with a foil shine sweeping across now
//           and then (CSS .joker-art; still under reduced motion). The
//           strongest card in the game should look it.
//
// JOKER is spelled down each corner, so a joker reads at a glance in a fan.

import React from "react";

const W = 21; // the scene, in pixels: a framed panel
const H = 28;

// The jester, 17 × 18, bottom-aligned in the panel. Letters pick a colour:
// L M R the hat's three horns, b bells, k g the hat band, F face, E eyes,
// r cheeks, m mouth, T a tear, D c the ruff, B Q P the body and its pompom.
const HAT = [
  "b.......b.......b",
  "LL.....MMM.....RR",
  ".LL....MMM....RR.",
  ".LLL...MMM...RRR.",
  "..LLL..MMM..RRR..",
  "..LLLL.MMM.RRRR..",
  "...LLLLMMMRRRR...",
  "...kgkgkgkgkgk...",
];
const FACES = {
  // A sad Pierrot: small eyes, a frown (its corners turned down, evenly), and one blue tear
  // just under the left eye, clear of the mouth (a dark tear beside it read as a smirk).
  gray: [
    "....FFFFFFFFF....",
    "....FFEFFFEFF....",
    "....FFTFFFFFF....",
    "....FFFFFFFFF....",
    "....FFFmmmFFF....",
    ".....FmFFFmF.....",
  ],
  // A grinning harlequin: wide eyes, rosy cheeks, a big smile.
  color: [
    "....FFFFFFFFF....",
    "....FEEFFFEEF....",
    "....FrFFFFFrF....",
    "....FmFFFFFmF....",
    "....FFmmmmmFF....",
    ".....FFFFFFF.....",
  ],
};
const BODY = [
  "..DcDcDcDcDcDcD..",
  ".cDcDcDcDcDcDcDc.",
  "...BBBBBPQQQQQ...",
  "..BBBBBBPQQQQQQ..",
];

const PALETTES = {
  gray: {
    frame: "#9a9aaa",
    stud: "#e6e8f0",
    bg: () => "#23263a",
    L: "#b8bac8",
    M: "#8a8d9e",
    R: "#b8bac8",
    b: "#e6e8f0",
    k: "#3a3d52",
    g: "#cfd3e0",
    F: "#e6e8f0",
    E: "#1a1024",
    T: "#5b8fd6",
    m: "#4a4d62",
    r: "#e6e8f0",
    D: "#cfd3e0",
    c: "#6a6d82",
    B: "#4a4d62",
    Q: "#8a8d9e",
    P: "#e6e8f0",
    ink: "#4a4d62",
  },
  color: {
    frame: "#f4c430",
    stud: "#fff3d0",
    // Harlequin diamonds, crimson and indigo.
    bg: (x, y) => ((Math.floor((x + y) / 4) + Math.floor((x - y + 100) / 4)) % 2 ? "#4a0f28" : "#25165a"),
    L: "#e85a7a",
    M: "#5fd4d6",
    R: "#a07ad8",
    b: "#f4c430",
    k: "#7a1530",
    g: "#f4c430",
    F: "#f6ecc9",
    E: "#1a1024",
    T: "#1a1024",
    m: "#c0203a",
    r: "#e85a7a",
    D: "#f4c430",
    c: "#e85a7a",
    B: "#e85a7a",
    Q: "#5fd4d6",
    P: "#f4c430",
    ink: "#c0203a",
  },
};

// Over the Pierrot, a crescent moon and stars; over the harlequin, a crown.
// Each is drawn from (x, y) in the panel, letters picking a palette colour.
const SKY = {
  gray: [
    {
      at: [13, 1],
      rows: ["..ss.", ".ss..", "ss...", "ss...", "ss...", ".ss..", "..ss."],
    },
    { at: [3, 2], rows: ["g"] },
    { at: [7, 5], rows: ["g"] },
    { at: [10, 1], rows: ["g"] },
    { at: [4, 7], rows: ["g"] },
    { at: [17, 7], rows: ["g"] },
  ],
  color: [
    {
      at: [7, 2],
      rows: ["b..b..b", "bb.b.bb", "bbbbbbb", "bLbMbRb", "bbbbbbb"],
    },
    { at: [3, 3], rows: ["s"] },
    { at: [17, 2], rows: ["s"] },
    { at: [4, 7], rows: ["s"] },
    { at: [16, 6], rows: ["s"] },
  ],
};

/** The scene as a grid of colours (null: nothing drawn), then merged into runs of squares. */
function paint(kind) {
  const p = PALETTES[kind];
  const grid = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => p.bg(x, y)));
  // The frame, with a stud at each corner.
  for (let x = 0; x < W; x++) grid[0][x] = grid[H - 1][x] = p.frame;
  for (let y = 0; y < H; y++) grid[y][0] = grid[y][W - 1] = p.frame;
  for (const [x, y] of [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]]) grid[y][x] = p.stud;
  // The sky.
  for (const { at, rows } of SKY[kind]) {
    rows.forEach((row, j) =>
      [...row].forEach((ch, i) => {
        if (ch !== ".") grid[at[1] + j][at[0] + i] = ch === "s" ? p.stud : p[ch];
      }),
    );
  }
  // The jester, standing on the bottom of the frame.
  const art = [...HAT, ...FACES[kind], ...BODY];
  const top = H - 1 - art.length;
  art.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch !== "." && p[ch]) grid[top + j][2 + i] = p[ch];
    }),
  );
  // Neighbouring squares of one colour in a row become one rect.
  const rects = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < W) {
      const fill = row[x];
      let run = 1;
      while (x + run < W && row[x + run] === fill) run++;
      rects.push({ x, y, w: run, fill });
      x += run;
    }
  });
  return rects;
}

const SCENES = { gray: paint("gray"), color: paint("color") };

export function JokerFace({ kind }) {
  const palette = PALETTES[kind] ?? PALETTES.gray;
  const scene = SCENES[kind] ?? SCENES.gray;
  const corner = (
    <span className="joker-word" style={{ color: palette.ink }}>
      {[..."JOKER"].map((ch, i) => (
        <span key={i}>{ch}</span>
      ))}
    </span>
  );
  return (
    <>
      <span className="corner tl">{corner}</span>
      <span className="center-suit">
        <span className="joker-art">
          <svg viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" aria-hidden="true">
            {scene.map((r) => (
              <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
            ))}
          </svg>
        </span>
      </span>
      <span className="corner br">{corner}</span>
    </>
  );
}

export default JokerFace;
