import { describe, it, expect } from "vitest";
import { chipColumns, CHIP_COLORS } from "../../src/components/poker/chips";

describe("chip stacks", () => {
  it("breaks an amount into the fewest chips, biggest value first", () => {
    expect(chipColumns(90)).toEqual([
      { value: 25, count: 3 },
      { value: 5, count: 3 },
    ]);
    expect(chipColumns(1260)).toEqual([
      { value: 1000, count: 1 },
      { value: 100, count: 2 },
      { value: 25, count: 2 },
      { value: 5, count: 2 },
    ]);
    expect(chipColumns(7)).toEqual([
      { value: 5, count: 1 },
      { value: 1, count: 2 },
    ]);
  });

  it("nothing to stack for 0", () => {
    expect(chipColumns(0)).toEqual([]);
  });

  it("keeps a pile readable: at most 4 columns and 6 chips a column", () => {
    const cols = chipColumns(4999);
    expect(cols.length).toBeLessThanOrEqual(4);
    expect(Math.max(...cols.map((c) => c.count))).toBeLessThanOrEqual(6);
  });

  it("every value has its own color", () => {
    expect(new Set(Object.values(CHIP_COLORS).map((c) => c.face)).size).toBe(Object.keys(CHIP_COLORS).length);
  });
});
