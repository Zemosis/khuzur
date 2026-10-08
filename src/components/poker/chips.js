// CHIPS — how an amount is drawn as stacks of chips: the fewest chips,
// biggest value first, one column (stack) per value. A pile stays readable:
// at most MAX_COLUMNS stacks of MAX_HIGH chips; the number under it is exact.

export const CHIP_COLORS = {
  1000: { face: "#f08a24", edge: "#a85a10" },
  500: { face: "#8a5ad6", edge: "#5a3696" },
  100: { face: "#2a234d", edge: "#0a0712" },
  25: { face: "#4fa83a", edge: "#2c6a20" },
  5: { face: "#e85a7a", edge: "#a83a5a" },
  1: { face: "#ead8b1", edge: "#a89870" },
};
const VALUES = [1000, 500, 100, 25, 5, 1];
const MAX_COLUMNS = 4;
const MAX_HIGH = 6;

/** [{ value, count }] for `amount`, biggest value first. */
export function chipColumns(amount) {
  const columns = [];
  let left = Math.max(0, Math.floor(amount));
  for (const value of VALUES) {
    const count = Math.floor(left / value);
    if (count > 0) columns.push({ value, count: Math.min(count, MAX_HIGH) });
    left -= count * value;
  }
  return columns.slice(0, MAX_COLUMNS);
}
