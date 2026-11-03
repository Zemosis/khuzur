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
  gridNudge,
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

describe("gridNudge", () => {
  it("moves an avatar that lands between device pixels onto the nearest one", () => {
    // At 1 CSS px = 1 device px, 100.4 rounds down to 100: move back 0.4.
    expect(gridNudge(100.4, 1)).toBeCloseTo(-0.4);
    expect(gridNudge(100.6, 1)).toBeCloseTo(0.4);
  });

  it("works in device pixels, so a scaled screen lands on its own grid", () => {
    // At 125%, 10 CSS px is 12.5 device px: half a device pixel is 0.4 CSS px.
    expect(gridNudge(10, 1.25)).toBeCloseTo(0.4);
    expect(gridNudge(10.4, 1.25)).toBeCloseTo(0);
  });

  it("leaves an avatar already on the grid alone", () => {
    expect(gridNudge(37, 1)).toBe(0);
    expect(gridNudge(0, 0.75)).toBe(0);
  });
});
