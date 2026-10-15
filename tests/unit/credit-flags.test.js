import { describe, it, expect } from "vitest";
import { pairFlows, flagPairs } from "../../server/credits/flagRules.js";

/** seats: [user, net, stackBefore?, committed?, foldedStreet?] */
const hand = (id, seats, { at = id, isPrivate = false } = {}) => ({
  id,
  playedAt: new Date(at * 60_000),
  isPrivate,
  seats: seats.map(([user_id, net, stack_before = 1000, committed = 0, folded_street = null]) => ({ user_id, net, stack_before, committed, folded_street })),
});

describe("pair flows", () => {
  it("shares each loss among that hand's winners by what they won", () => {
    const { pairs, lost } = pairFlows([hand(1, [["A", -300], ["B", 200], ["C", 100]])]);
    expect(pairs.get("A>B")).toMatchObject({ flow: 200, hands: 1 });
    expect(pairs.get("A>C")).toMatchObject({ flow: 100 });
    expect(lost.get("A")).toBe(300);
  });
});

describe("flagging", () => {
  const dump = (n, extra = []) =>
    Array.from({ length: n }, (_, i) => hand(i + 1, [["A", -250, 1000, 600, i === 0 ? "RIVER" : null], ["B", 250], ...extra], { isPrivate: i < 2 }));

  it("flags A when they lost 1,000+ to B, 60%+ of their losses, and B gave little back", () => {
    const [flag] = flagPairs(pairFlows(dump(5)));
    expect(flag).toMatchObject({ loser: "A", winner: "B", flow: 1250, back: 0, share: 1, hands: 5, privateHands: 2, bigFolds: 1 });
  });

  it("leaves ordinary swings both ways alone", () => {
    const back = Array.from({ length: 3 }, (_, i) => hand(10 + i, [["B", -200], ["A", 200]]));
    expect(flagPairs(pairFlows([...dump(5), ...back]))).toEqual([]);
  });

  it("leaves losses spread over many players alone", () => {
    const toC = Array.from({ length: 5 }, (_, i) => hand(20 + i, [["A", -250], ["C", 250]]));
    expect(flagPairs(pairFlows([...dump(5), ...toC]))).toEqual([]);
  });

  it("stays quiet under 1,000", () => {
    expect(flagPairs(pairFlows(dump(3)))).toEqual([]);
  });

  it("a dismissed pair stays hidden until new flow arrives", () => {
    const flows = pairFlows(dump(5));
    expect(flagPairs(flows, new Map([["A>B", new Date(10 * 60_000)]]))).toEqual([]);
    expect(flagPairs(flows, new Map([["A>B", new Date(3 * 60_000)]]))).toHaveLength(1);
  });
});
