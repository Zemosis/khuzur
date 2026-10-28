import { describe, it, expect } from "vitest";
import { tallyRound, LOGGED_ROUNDS } from "../game/blackjackTally.js";

const dealer = { cards: ["K♠0", "7♥0"], total: 17 };
const summary = (n, results) => ({ roundNumber: n, dealer, houseNet: 0, seatResults: results });
const result = (net, extra = {}) => ({
  seat_index: 0,
  player_key: "u1",
  name: "ANN #0001",
  hands: [{ cards: ["9♣0", "Q♦0"], bet: 100, result: net > 0 ? "win" : net < 0 ? "lose" : "push", payout: 100 + net }],
  insurance: null,
  insurancePayout: 0,
  staked: 100,
  returned: 100 + net,
  net,
  blackjack: false,
  doubled: false,
  split: false,
  ...extra,
});

describe("blackjack tally", () => {
  it("counts rounds, wins, pushes, blackjacks, doubles, splits, biggest win and net", () => {
    const rounds = [
      result(150, { blackjack: true }),
      result(0),
      result(-200, { doubled: true }),
      result(200, { split: true, doubled: true }),
      result(-100),
    ];
    let t = null;
    rounds.forEach((r, i) => {
      t = tallyRound(t, summary(i + 1, [r]), r);
    });
    expect(t).toMatchObject({
      rounds_played: 5,
      rounds_won: 2,
      rounds_pushed: 1,
      blackjacks: 1,
      doubles: 2,
      splits: 1,
      biggest_win: 200,
      net: 50,
    });
    expect(t.rounds).toHaveLength(5);
    expect(t.rounds[0]).toEqual({ n: 1, net: 150, hands: rounds[0].hands, dealer });
    expect(t.rounds[2]).toEqual({ n: 3, net: -200, hands: rounds[2].hands, dealer });
  });

  it("a losing table's biggest win is 0, never a loss", () => {
    const r = result(-100);
    expect(tallyRound(null, summary(1, [r]), r)).toMatchObject({ rounds_played: 1, rounds_won: 0, rounds_pushed: 0, biggest_win: 0, net: -100 });
  });

  it("keeps only the latest 500 rounds in the log", () => {
    expect(LOGGED_ROUNDS).toBe(500);
    let t = null;
    for (let n = 1; n <= LOGGED_ROUNDS + 20; n++) {
      const r = result(10);
      t = tallyRound(t, summary(n, [r]), r);
    }
    expect(t.rounds).toHaveLength(LOGGED_ROUNDS);
    expect(t.rounds[0].n).toBe(21);
    expect(t.rounds.at(-1).n).toBe(LOGGED_ROUNDS + 20);
    // The counts cover every round, not just the logged ones.
    expect(t.rounds_played).toBe(LOGGED_ROUNDS + 20);
    expect(t.net).toBe(10 * (LOGGED_ROUNDS + 20));
  });
});
