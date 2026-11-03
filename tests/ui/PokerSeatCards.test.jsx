// A seat's cards at a showdown: the backs it held turn over to show the faces.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import gsap from "gsap";
import { SeatCards } from "../../src/components/poker/PokerSeat";
import { pc } from "../helpers/poker.js";

const player = (hole) => ({ name: "ANN #0001", inHand: true, folded: false, hole });
const backs = [{ hidden: true }, { hidden: true }];

describe("a seat's cards at a showdown", () => {
  it("cards shown after being held face down turn over", () => {
    const { rerender, container } = render(<SeatCards player={player(backs)} rel={2} cardW={40} label="ANN's cards" />);
    expect(container.querySelectorAll(".pixel-card-back")).toHaveLength(2);
    rerender(<SeatCards player={player(pc("A♠ K♦"))} rel={2} cardW={40} label="ANN's cards" />);
    const cards = [...container.querySelectorAll("[data-deal-rel]")];
    expect(container.querySelectorAll(".pixel-card-back")).toHaveLength(0);
    expect(cards.every((el) => gsap.getTweensOf(el).length > 0)).toBe(true);
  });

  it("cards that stay as they were don't move", () => {
    const { rerender, container } = render(<SeatCards player={player(pc("A♠ K♦"))} rel={0} cardW={40} label="Your cards" />);
    rerender(<SeatCards player={player(pc("A♠ K♦"))} rel={0} cardW={40} label="Your cards" />);
    expect([...container.querySelectorAll("[data-deal-rel]")].some((el) => gsap.getTweensOf(el).length > 0)).toBe(false);
  });
});
