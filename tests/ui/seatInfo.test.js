import { describe, it, expect } from "vitest";
import { actingOrder, seatTags, dealerLine, moveCallouts } from "../../src/components/poker/seatInfo";
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

describe("seat tags", () => {
  it("tags a seat that left mid-hand LEFT, and one waiting for the big blind", () => {
    const base = { stack: 500, inHand: false, folded: false, allIn: false, sittingOut: false, type: "HUMAN" };
    expect(seatTags({ ...base, leaving: true, inHand: true, allIn: true }, { phase: "RUNOUT" }).map((t) => t.label)).toEqual(["ALL-IN", "LEFT"]);
    expect(seatTags({ ...base, waitingForBB: true }, { phase: "BETTING" }).map((t) => t.label)).toEqual(["WAITING FOR BB"]);
  });
});

describe("the poker dealer's calls", () => {
  const seats = [{ name: "ME #0003" }, { name: "ANN #0001" }];
  const betting = (street, turn = 1) => ({ phase: "BETTING", street, turn, seats });

  it("names who's to act, and the street once the board is out", () => {
    expect(dealerLine(betting("PREFLOP"))).toBe("ANN TO ACT");
    expect(dealerLine(betting("FLOP", 0))).toBe("FLOP · ME TO ACT");
    expect(dealerLine(betting("RIVER"))).toBe("RIVER · ANN TO ACT");
  });

  it("calls the shuffle, the wait and an all-in's run-out", () => {
    expect(dealerLine(betting("PREFLOP"), { dealing: true })).toBe("SHUFFLE UP AND DEAL");
    expect(dealerLine({ phase: "WAITING", seats })).toBe("TAKE YOUR SEATS");
    expect(dealerLine({ phase: "WAITING", seats }, { firstHandSoon: true })).toBe("CARDS IN THE AIR SOON");
    expect(dealerLine({ phase: "RUNOUT", seats })).toBe("ALL-IN: THE BOARD RUNS OUT");
  });

  it("calls the winner, or a split pot", () => {
    expect(dealerLine({ phase: "HAND_OVER", seats }, { result: [{ name: "ann", amount: 300 }] })).toBe("ANN WINS 300");
    expect(dealerLine({ phase: "HAND_OVER", seats }, { result: [{ name: "A", amount: 1 }, { name: "B", amount: 1 }] })).toBe("SPLIT POT");
  });
});

describe("poker move callouts", () => {
  const act = (seat, action, amount) => ({ type: "act", seat, action, amount });
  const view = (events, handNumber = 3) => ({ handNumber, events });
  const labels = (prev, next) => moveCallouts(prev, next).map((c) => [c.seat, c.label]);

  it("announce each new move once, with its amount", () => {
    const one = view([{ type: "blind", seat: 1, amount: 5 }, act(0, "call", 10)]);
    const two = view([...one.events, act(1, "raise", 40), act(2, "fold", 0)]);
    expect(labels(view([]), one)).toEqual([[0, "CALL 10"]]);
    expect(labels(one, two)).toEqual([[1, "RAISE 40"], [2, "FOLD"]]);
    expect(labels(two, two)).toEqual([]);
  });

  it("a check, a fold and an all-in carry no amount", () => {
    expect(labels(view([]), view([act(0, "check", 0), act(1, "allin", 900)]))).toEqual([[0, "CHECK"], [1, "ALL-IN"]]);
  });

  it("a new hand starts afresh, even with fewer events", () => {
    const old = view([act(0, "call", 10), act(1, "call", 10)], 3);
    expect(labels(old, view([act(1, "check", 0)], 4))).toEqual([[1, "CHECK"]]);
  });

  it("each callout has its own id", () => {
    const c = moveCallouts(view([]), view([act(0, "call", 10), act(1, "call", 10)]));
    expect(new Set(c.map((x) => x.id)).size).toBe(2);
  });
});
