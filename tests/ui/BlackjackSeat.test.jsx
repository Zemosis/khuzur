// A seat's split hands stay on the table: at the table's edges (first base at
// screen right, the last seat at screen left) they grow inward from the seat
// instead of spreading both ways, so a phone doesn't cut the outer hands off.

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

  it("split hands at first base (screen right) grow to the left of the seat", () => {
    const el = seatCards({ player: player(SPLIT), edge: "right" });
    expect(el.style.right).toBe("0px");
    expect(el.style.left).toBe("");
    expect(el.style.transform).toBe("");
  });

  it("split hands at the last seat (screen left) grow to the right of the seat", () => {
    const el = seatCards({ seat: 4, player: player(SPLIT), edge: "left" });
    expect(el.style.left).toBe("0px");
    expect(el.style.transform).toBe("");
  });

  it("split hands at a middle seat stay centred", () => {
    const el = seatCards({ seat: 2, player: player(SPLIT), edge: null });
    expect(el.style.left).toBe("50%");
    expect(el.style.transform).toBe("translateX(-50%)");
  });
});
