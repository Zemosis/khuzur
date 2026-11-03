// A win paid onto a bet: the circle shows one amount at a time. The old bet
// stands in while the winnings fly, and the new total shows only as they land.

import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import gsap from "gsap";
import HalfMoonTable from "../../src/components/blackjack/HalfMoonTable";
import { PHASES } from "../../src/utils/blackjack/engine.js";
import { cards } from "../helpers/blackjack.js";

const seat = (hand) => ({ name: "ME #0003", bankroll: 500, bet: 500, inRound: true, ready: true, lastBet: 500, skipped: 0, net: 0, hands: [{ cards: cards("A♠ K♠"), bet: 500, done: true, payout: 0, result: null, fromSplit: false, ...hand }] });
const view = (phase, hand) => ({
  phase,
  roundNumber: 8,
  dealt: 30,
  events: [],
  mySeat: 0,
  turn: null,
  dealer: { cards: cards("9♦ 8♦"), revealed: true },
  seats: [seat(hand), null, null, null, null],
});
const table = (v) => <HalfMoonTable view={v} mySeat={0} />;

describe("a win paid onto the bet", () => {
  it("keeps the new total hidden while the old bet stands in for it, then shows it", async () => {
    const { rerender, container } = render(table(view(PHASES.DEALER)));
    rerender(table(view(PHASES.ROUND_OVER, { result: "blackjack", payout: 1250 })));

    const total = container.querySelector('[data-bj-chips="0"]');
    expect(total).toHaveTextContent("1250");
    expect(total.style.visibility).toBe("hidden");
    const standIn = [...document.body.querySelectorAll('[data-testid="bet"]')].filter((el) => !container.contains(el));
    expect(standIn.map((el) => el.textContent)).toEqual(["500"]);

    await waitFor(() => expect(total.style.visibility).not.toBe("hidden"), { timeout: 2000 });
    expect(document.body.querySelectorAll('[data-testid="bet"]')).toHaveLength(1);
  });

  it("the flying winnings lose their number before it can land on the bet's", () => {
    const { rerender, container } = render(table(view(PHASES.DEALER)));
    rerender(table(view(PHASES.ROUND_OVER, { result: "blackjack", payout: 1250 })));

    const win = container.querySelector('[data-bj-win="0"]');
    const number = win.querySelector("[data-chip-amount]");
    expect(number).toHaveTextContent("750");
    const ends = (tween) => tween.startTime() + tween.duration();
    const [fade] = gsap.getTweensOf(number);
    const flight = gsap.getTweensOf(win).find((tween) => tween.duration() > 0);
    expect(fade.vars.autoAlpha).toBe(0);
    expect(ends(fade)).toBeLessThan(ends(flight));
  });
});
