// Avatars: a 17×17 grid (odd, so a drawing has a true centre column), how
// it's saved, how older 16×16 avatars load, and the pixel-exact sizing.

import { describe, it, expect } from "vitest";
import {
  GRID_SIZE,
  createEmptyGrid,
  deserializeAvatar,
  presetAvatar,
  serializeAvatar,
  snapAvatarSize,
  avatarPaths,
  avatarRuns,
} from "../../src/utils/avatarConstants.js";

const grid = (n, fill) => Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => fill(r, c)));

describe("avatar grid", () => {
  it("is 17×17", () => {
    expect(GRID_SIZE).toBe(17);
    const empty = createEmptyGrid();
    expect(empty).toHaveLength(17);
    expect(empty.every((row) => row.length === 17 && row.every((p) => p === null))).toBe(true);
  });

  it("saves as v3, 289 pixels row by row, and loads back the same", () => {
    const pixels = grid(17, (r, c) => (r === c ? "#ff0000" : null));
    const saved = serializeAvatar(pixels);
    expect(saved.v).toBe(3);
    expect(saved.pixels).toHaveLength(289);
    expect(saved.pixels[18]).toBe("#ff0000"); // row 1, column 1
    expect(deserializeAvatar(saved).pixels).toEqual(pixels);
  });

  it("loads an older 16×16 (v2) avatar with a blank column on the right and row at the bottom", () => {
    const old = grid(16, () => "#00ff00");
    const { pixels } = deserializeAvatar({ v: 2, pixels: old.flat() });
    expect(pixels).toHaveLength(17);
    expect(pixels.every((row) => row.length === 17)).toBe(true);
    expect(pixels[15][15]).toBe("#00ff00");
    expect(pixels[15][16]).toBeNull();
    expect(pixels[16].every((p) => p === null)).toBe(true);
  });

  it("loads a legacy v1 (palette string, 16×16) avatar the same way", () => {
    const { pixels } = deserializeAvatar({ palette: [null, "#123456"], pixels: "1".repeat(256) });
    expect(pixels[0][0]).toBe("#123456");
    expect(pixels[0][16]).toBeNull();
    expect(pixels[16][0]).toBeNull();
  });

  it("every built-in face is 17×17 and mirror-symmetric left to right", () => {
    for (const variant of [1, 2, 3, 4, 5, "me"]) {
      const { pixels } = presetAvatar(variant);
      expect(pixels).toHaveLength(17);
      for (const row of pixels) {
        expect(row).toHaveLength(17);
        expect(row).toEqual([...row].reverse());
      }
    }
  });

  it("draws at whole multiples of 17 device pixels", () => {
    expect(snapAvatarSize(68)).toEqual({ device: 68, css: 68 });
    expect(snapAvatarSize(51)).toEqual({ device: 51, css: 51 });
    expect(snapAvatarSize(34, 2)).toEqual({ device: 68, css: 34 });
    expect(snapAvatarSize(64).device % 17).toBe(0);
  });
});

describe("avatarPaths", () => {
  it("draws each colour as one path, a row's run of it as one rectangle", () => {
    const pixels = grid(17, (r, c) => (r === 0 && c < 3 ? "#111111" : r === 2 && c === 5 ? "#222222" : null));
    expect(avatarPaths({ pixels })).toEqual([
      { color: "#111111", d: "M0 0h3v1h-3z" },
      { color: "#222222", d: "M5 2h1v1h-1z" },
    ]);
  });

  it("covers every cell of a full avatar exactly once", () => {
    const cells = avatarPaths(presetAvatar(2))
      .flatMap(({ d }) => [...d.matchAll(/M(\d+) (\d+)h(\d+)/g)])
      .reduce((n, m) => n + Number(m[3]), 0);
    expect(cells).toBe(17 * 17);
  });
});

describe("avatarRuns", () => {
  it("is each row's run of one colour, as its own rectangle", () => {
    const pixels = grid(17, (r, c) => (r === 0 && c < 3 ? "#111111" : r === 0 && c === 3 ? "#222222" : r === 2 && c === 5 ? "#111111" : null));
    expect(avatarRuns({ pixels })).toEqual([
      { color: "#111111", x: 0, y: 0, w: 3 },
      { color: "#222222", x: 3, y: 0, w: 1 },
      { color: "#111111", x: 5, y: 2, w: 1 },
    ]);
  });

  it("covers every cell of a full avatar exactly once", () => {
    expect(avatarRuns(presetAvatar(2)).reduce((n, run) => n + run.w, 0)).toBe(17 * 17);
  });
});
