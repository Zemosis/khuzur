// The stadium the poker table is built on: where a point `t` of the way round
// it (clockwise on screen from the bottom) lies, and the outline drawn.

import { describe, it, expect } from "vitest";
import { nextLap, stadiumPath, stadiumPoint } from "../../src/components/poker/tableShape.js";

const wide = { x0: 100, y0: 100, x1: 900, y1: 500 }; // r 200, straights of 400
const tall = { x0: 100, y0: 100, x1: 400, y1: 800 }; // r 150, straights of 400
const round = (p) => [Math.round(p.x), Math.round(p.y)];

describe("stadiumPoint", () => {
  it("t 0 is the bottom's middle, a quarter the left end, a half the top's middle, three quarters the right end", () => {
    expect(round(stadiumPoint(wide, 0))).toEqual([500, 500]);
    expect(round(stadiumPoint(wide, 0.25))).toEqual([100, 300]);
    expect(round(stadiumPoint(wide, 0.5))).toEqual([500, 100]);
    expect(round(stadiumPoint(wide, 0.75))).toEqual([900, 300]);
  });

  it("runs clockwise on screen: bottom, then left", () => {
    const p = stadiumPoint(wide, 0.05);
    expect(p.x).toBeLessThan(500);
    expect(p.y).toBeCloseTo(500);
  });

  it("wraps past a full lap, and backwards", () => {
    expect(round(stadiumPoint(wide, 1.25))).toEqual([100, 300]);
    expect(round(stadiumPoint(wide, -0.75))).toEqual([100, 300]);
  });

  it("an inset moves the point in from the rim", () => {
    expect(round(stadiumPoint(wide, 0, 30))).toEqual([500, 470]);
    expect(round(stadiumPoint(wide, 0.25, 30))).toEqual([130, 300]);
    expect(round(stadiumPoint(wide, 0.5, 30))).toEqual([500, 130]);
  });

  it("a negative inset is outside the rim", () => {
    expect(round(stadiumPoint(wide, 0, -10))).toEqual([500, 510]);
  });

  it("gives the direction straight out of the rim", () => {
    expect(stadiumPoint(wide, 0).ny).toBeCloseTo(1);
    expect(stadiumPoint(wide, 0.25).nx).toBeCloseTo(-1);
    expect(stadiumPoint(wide, 0.5).ny).toBeCloseTo(-1);
    expect(stadiumPoint(wide, 0.75).nx).toBeCloseTo(1);
  });

  it("every point of a lap lies on the outline", () => {
    for (let t = 0; t < 1; t += 0.013) {
      const { x, y } = stadiumPoint(wide, t);
      const nearest = { x: Math.max(300, Math.min(700, x)), y: 300 };
      const onCurve = x < 300 || x > 700;
      if (onCurve) expect(Math.hypot(x - nearest.x, y - nearest.y)).toBeCloseTo(200);
      else expect(Math.abs(y - 300)).toBeCloseTo(200);
    }
  });

  it("a tall stadium stands the same way: bottom first, then left, top, right", () => {
    expect(round(stadiumPoint(tall, 0))).toEqual([250, 800]);
    expect(round(stadiumPoint(tall, 0.25))).toEqual([100, 450]);
    expect(round(stadiumPoint(tall, 0.5))).toEqual([250, 100]);
    expect(round(stadiumPoint(tall, 0.75))).toEqual([400, 450]);
    expect(round(stadiumPoint(tall, 0.25, 20))).toEqual([120, 450]);
  });
});

describe("nextLap", () => {
  it("goes clockwise only, the short way or the long way round", () => {
    expect(nextLap(0.2, 0.4)).toBeCloseTo(0.4);
    expect(nextLap(0.4, 0.2)).toBeCloseTo(1.2);
    expect(nextLap(0.8, 0)).toBeCloseTo(1);
  });

  it("stays put when it's already there", () => {
    expect(nextLap(0.3, 0.3)).toBeCloseTo(0.3);
    expect(nextLap(1.3, 0.3)).toBeCloseTo(1.3);
  });
});

describe("stadiumPath", () => {
  it("draws a closed outline with both ends rounded", () => {
    const d = stadiumPath(wide);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/A/g)).toHaveLength(2);
  });

  it("cuts a notch into the top edge for the dealer", () => {
    const d = stadiumPath(wide, { half: 60, depth: 20 });
    expect(d).toContain("Q500 140 560 100"); // a curve dips half as far as its control point
  });

  it("an inset outline shrinks evenly", () => {
    expect(stadiumPath(wide, null, 10)).toContain("M300 110");
  });
});
