// Khuzur's joker faces on PixelCard, and the card → PixelCard props mapping.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PixelCard } from "../../src/components/PixelCard";
import { toPixelCardProps } from "../../src/components/khuzur/cardProps";
import { makeCard, makeJoker } from "../../src/utils/khuzur/cards";

describe("joker faces", () => {
  it("the gray joker", () => {
    const { container } = render(<PixelCard joker="gray" />);
    const card = container.querySelector(".pixel-card");
    expect(card).toHaveClass("joker-gray");
    expect(card.textContent).toContain("JOKER");
    expect(card.querySelector("svg")).not.toBeNull();
  });

  it("the colored joker", () => {
    const { container } = render(<PixelCard joker="color" />);
    expect(container.querySelector(".pixel-card")).toHaveClass("joker-color");
  });

  it("face down, a joker looks like any other card", () => {
    const { container } = render(<PixelCard joker="gray" faceDown />);
    expect(container.querySelector(".pixel-card-back")).not.toBeNull();
    expect(container.textContent).not.toContain("JOKER");
  });
});

describe("toPixelCardProps", () => {
  it("passes rank and suit for a plain card", () => {
    expect(toPixelCardProps(makeCard("J", "♠", 2))).toEqual({ rank: "J", suit: "♠" });
  });

  it("passes the joker kind for a joker", () => {
    expect(toPixelCardProps(makeJoker("color"))).toEqual({ joker: "color" });
  });
});
