// A seat's hands keep to the room the table gives them (`room`, px either side
// of the circle's centre): centred over the circle while they fit, slid along
// to stay in it when they don't, and tightened up when they're too long for it.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BlackjackSeat from "../../src/components/blackjack/BlackjackSeat";
import { PHASES } from "../../src/utils/blackjack/engine.js";
import { cards } from "../helpers/blackjack.js";

const hand = (ids) => ({ cards: cards(ids), bet: 100, done: false });
const player = (hands) => ({ name: "ME #0003", bankroll: 900, bet: 100, inRound: true, ready: true, lastBet: 100, skipped: 0, hands });
const SPLIT = [hand("8♠ 3♣"), hand("8♦ K♠"), hand("8♥ 2♣"), hand("8♣ A♠")];

const seatCards = (props) => {
  render(<BlackjackSeat seat={0} isMe face={{ variant: 1 }} phase={PHASES.TURNS} turnHand={0} layout="compact" {...props} />);
  return screen.getByLabelText("Your cards");
};

describe("blackjack seat hands", () => {
  it("one hand sits centred over the betting circle", () => {
    const el = seatCards({ player: player([hand("9♠ 7♣")]), edge: "right" });
    expect(el.style.left).toBe("50%");
    expect(el.style.transform).toBe("translateX(-50%)");
  });

  it("hands too wide for the room on one side slide along to stay in it", () => {
    const el = seatCards({ player: player(SPLIT), room: { left: -140, right: 14 } });
    expect(el.style.transform).toBe("");
    expect(parseFloat(el.style.left)).toBeLessThan(0);
  });

  it("the room's other side slides them the other way", () => {
    const el = seatCards({ seat: 4, player: player(SPLIT), room: { left: -14, right: 140 } });
    expect(el.style.transform).toBe("");
    expect(parseFloat(el.style.left)).toBeGreaterThanOrEqual(20 - 14 - 1);
  });

  it("hands that can't fit at all keep clear of the shoe, overflowing toward the middle", () => {
    const el = seatCards({ player: player(SPLIT), room: { left: -30, right: 10 } });
    const width = SPLIT.length * (26 + 6) + 3 * 8; // the smallest cards, closed right up
    expect(parseFloat(el.style.left)).toBe(20 + 10 - width);
  });

  it("a hand that fits stays centred, even in a tight room", () => {
    const el = seatCards({ player: player([hand("9♠ 7♣")]), room: { left: -40, right: 40 } });
    expect(el.style.left).toBe("50%");
  });

  it("a long hand's cards close up as it runs out of room", () => {
    const el = seatCards({ player: player([hand("2♠ 2♦ 3♣ 2♥ A♠ 3♦")]), layout: "full", room: { left: -110, right: 110 } });
    const margins = [...el.querySelectorAll("[data-bj-card]")].map((c) => parseFloat(c.style.marginLeft) || 0);
    expect(margins[1]).toBeLessThan(-38); // a full-size card (76) overlaps by half with room to spare
  });

  it("a total wider than its hand doesn't push the next hand along", () => {
    const narrow = { cards: cards("A♠ 2♦"), bet: 100, done: false }; // "3 / 13"
    const el = seatCards({ player: player([narrow, narrow, narrow, narrow]), layout: "full", room: { left: -100, right: 100 } });
    const widths = [...el.children].map((h) => parseFloat(h.style.width));
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBeGreaterThan(0);
  });

  it("however long the hand, it rises no higher than a card's fifth", () => {
    const long = hand("2♠ 2♦ 3♣ 2♥ A♠ 3♦ 2♣ A♦ 3♥ A♣ A♥");
    const el = seatCards({ player: player([long]), layout: "full" });
    const rises = [...el.querySelectorAll("[data-bj-card]")].map((c) => parseFloat(c.style.marginBottom) || 0);
    expect(Math.max(...rises)).toBeLessThanOrEqual(76 * 0.2);
  });

  it("split hands at a middle seat stay centred", () => {
    const el = seatCards({ seat: 2, player: player(SPLIT), edge: null });
    expect(el.style.left).toBe("50%");
    expect(el.style.transform).toBe("translateX(-50%)");
  });
});
