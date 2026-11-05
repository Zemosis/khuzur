// JOKER FACE — the middle and corners of a joker card (Khuzur's gray and
// colored jokers). The jester is a pixel grid drawn as SVG squares, so it
// stays crisp at every card size.

import React from "react";

// A jester's head: two-pointed hat, face, collar. Letters pick a colour.
const JESTER = [
  "A.......B", //
  "AA.....BB",
  ".AAA.BBB.",
  "..AAABB..",
  "..FFFFF..",
  "..FEFEF..",
  "..FFFFF..",
  "..FMMMF..",
  "...FFF...",
  ".CCCCCCC.",
];

const PALETTES = {
  gray: { A: "#8a8a9a", B: "#5a5a6a", F: "#dcdce0", E: "#1a1024", M: "#5a5a6a", C: "#7a7a8a", ink: "#5a5a6a" },
  color: { A: "#e85a7a", B: "#5fd4d6", F: "#f6ecc9", E: "#1a1024", M: "#c0203a", C: "#f4c430", ink: "#c0203a" },
};

export function JokerFace({ kind }) {
  const palette = PALETTES[kind] ?? PALETTES.gray;
  const cells = [];
  JESTER.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={palette[ch]} />);
    }),
  );
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
        <svg className="joker-jester" viewBox={`0 0 ${JESTER[0].length} ${JESTER.length}`} shapeRendering="crispEdges" aria-hidden="true">
          {cells}
        </svg>
      </span>
      <span className="corner br">{corner}</span>
    </>
  );
}

export default JokerFace;
