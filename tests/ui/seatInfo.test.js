import { describe, it, expect } from "vitest";
import { actingOrder } from "../../src/components/poker/seatInfo";
import { act, viewFor } from "../../src/utils/poker/engine.js";
import { tableWith, dealt } from "../helpers/poker.js";

// Six players, button on 0: blinds 1 and 2, seat 3 acts first.
const six = () => dealt(tableWith([1000, 1000, 1000, 1000, 1000, 1000]), { button: 0 });

describe("acting order", () => {
  it("lists who still has to act this round, starting with the player on turn", () => {
    expect(actingOrder(viewFor(six(), 0))).toEqual([3, 4, 5, 0, 1, 2]);
  });

  it("drops players who folded or have already matched the bet", () => {
    let s = six();
    s = act(s, 3, { type: "fold" });
    s = act(s, 4, { type: "call" });
    expect(actingOrder(viewFor(s, 0))).toEqual([5, 0, 1, 2]);
  });

  it("is empty when nobody is betting", () => {
    expect(actingOrder(viewFor(tableWith([1000, 1000, null, null, null, null]), 0))).toEqual([]);
  });
});
