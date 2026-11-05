import { describe, it, expect } from "vitest";
import { positionOf, seatPositions } from "../../src/utils/seatPosition.js";

describe("six seats", () => {
  it("go clockwise from the bottom", () => {
    expect(seatPositions(6)).toEqual(["bottom", "bottomLeft", "topLeft", "top", "topRight", "bottomRight"]);
  });

  it("put the seat across the table at the top", () => {
    expect(positionOf(3, 0, 6)).toBe("top");
    expect(positionOf(0, 3, 6)).toBe("top");
    expect(positionOf(4, 3, 6)).toBe("bottomLeft");
  });
});
