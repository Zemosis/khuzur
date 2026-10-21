// A credit match's money against Postgres: staking at the waiting table,
// standing up, starting, a covered seat's comeback clock and forfeit,
// settling (the database disagreeing too), and releasing.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { TEST_DATABASE_URL, loadDb, truncateAll, makePlayer } from "./setup.js";

describe.skipIf(!TEST_DATABASE_URL)("credit matches (Postgres)", () => {
  let m;
  let C;
  let CreditMatch;
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    m = await loadDb();
    C = await import("../../credits/check.js");
    ({ CreditMatch } = await import("../../credits/matchTables.js"));
  });
  beforeEach(() => truncateAll(m.pool));
  afterAll(() => m?.pool.end());

  const player = (name, opts) => makePlayer(m.pool, name, opts);
  const balance = async (id) => {
    const { rows } = await m.pool.query("select balance from credit_accounts where user_id = $1", [id]);
    return rows[0] ? Number(rows[0].balance) : 1000;
  };
  const balanced = async () => expect((await C.economyCheck()).ok).toBe(true);
  /** A final state: `winner` on 0, everyone else on 6, one pile each. */
  const final = (winner) => ({ players: [0, 1, 2, 3, 4].map((id) => ({ id, score: id === winner ? 0 : 6, eaten: 1 })) });
  const table = (tier = "LOW") => new CreditMatch({ name: "Ger", tier });

  it("stakes at the waiting table, and standing up gives it back", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    const t = table("MID");
    expect(await t.sit(ann)).toEqual({ ok: true });
    expect(await t.sit(bob)).toEqual({ ok: true });
    expect(t.view()).toMatchObject({ tier: "MID", stake: 500, pot: 1000, staked: 2, seats: null, result: null });
    expect(t.onTable(ann)).toBe(500);
    await t.standUp(bob);
    expect(await balance(bob)).toBe(1000);
    expect(t.onTable(bob)).toBeNull();
    expect(t.view().pot).toBe(500);
    await balanced();
  });

  it("refuses a stake the player can't cover, and a wrong amount", async () => {
    const ann = await player("ANN");
    const t = table("HIGH");
    expect(await t.sit(ann)).toEqual({ ok: false, error: "Your balance is 1,000; this table's stake is 2,000" });
    expect(await table("LOW").sit(ann, 500)).toEqual({ ok: false, error: "This table's stake is 100" });
  });

  it("starts only with every staked player seated, then refuses new stakes", async () => {
    const [ann, bob, cat] = [await player("ANN"), await player("BOB"), await player("CAT")];
    const t = table();
    await t.sit(ann);
    await t.sit(bob);
    expect(await t.begin([ann, null, null, null, null])).toMatchObject({ ok: false });
    expect(await t.begin([ann, null, bob, null, null])).toEqual({ ok: true });
    expect(await t.sit(cat)).toEqual({ ok: false, error: "The match has started" });
    expect(t.view().seats).toEqual([
      { staked: true, away: false, roundsLeft: 2, forfeited: false },
      null,
      { staked: true, away: false, roundsLeft: 2, forfeited: false },
      null,
      null,
    ]);
  });

  it("a stake stays in the pot when its player stands up mid-match", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    const t = table();
    await t.sit(ann);
    await t.sit(bob);
    await t.begin([ann, bob, null, null, null]);
    await t.standUp(bob);
    expect(await balance(bob)).toBe(900);
    expect(t.onTable(bob)).toBe(100);
  });

  it("a covered seat can come back until the CPU has finished 2 rounds for it", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    const t = table();
    await t.sit(ann);
    await t.sit(bob);
    await t.begin([ann, bob, null, null, null]);
    t.away(bob);
    expect(t.roundEnded()).toEqual([]);
    expect(t.view().seats[1]).toEqual({ staked: true, away: true, roundsLeft: 1, forfeited: false });
    expect(t.back(bob)).toBe(true); // the clock starts over
    t.away(bob);
    expect(t.roundEnded()).toEqual([]);
    expect(t.roundEnded()).toEqual([bob]);
    expect(t.canReturn(bob)).toBe(false);
    expect(t.back(bob)).toBe(false);
    expect(t.view().seats[1]).toMatchObject({ forfeited: true, roundsLeft: 0 });
  });

  it("settles: the winner takes the pot, and the table is ready for the next match", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    const t = table();
    await t.sit(ann);
    await t.sit(bob);
    await t.begin([ann, null, bob, null, null]);
    const result = await t.settle(final(2));
    expect(result).toEqual({ pot: 200, payouts: [{ seat: 2, userId: bob, amount: 200 }], cpuTake: 0, winners: [2], staked: [0, 2], forfeited: [], void: false });
    expect([await balance(ann), await balance(bob)]).toEqual([900, 1100]);
    expect(t.view()).toMatchObject({ pot: 0, staked: 0, seats: null, settling: false, result: { pot: 200, payouts: [{ seat: 2, amount: 200 }] } });
    expect(await t.sit(ann)).toEqual({ ok: true });
    expect(t.matchNumber).toBe(1);
    await t.begin([ann, null, null, null, null]);
    expect(t.matchNumber).toBe(2);
    await balanced();
  });

  it("a Thirteen match pays the last player standing, and records each one's points", async () => {
    const [ann, bob, cat] = [await player("ANN"), await player("BOB"), await player("CAT")];
    const t = new CreditMatch({ name: "Felt", tier: "LOW", gameType: "thirteen" });
    expect(t.view().botsFill).toBe(false);
    for (const id of [ann, bob, cat]) await t.sit(id);
    await t.begin([ann, bob, cat]);
    const state = { players: [{ score: 31, isEliminated: true }, { score: 12, isEliminated: false }, { score: 30, isEliminated: true }] };
    expect(await t.settle(state)).toMatchObject({ pot: 300, payouts: [{ seat: 1, userId: bob, amount: 300 }], winners: [1] });
    expect([await balance(ann), await balance(bob), await balance(cat)]).toEqual([900, 1200, 900]);
    const { rows } = await m.pool.query("select game_type, seats from credit_hands");
    expect(rows[0].game_type).toBe("thirteen");
    expect(rows[0].seats[0]).toMatchObject({ user_id: ann, score: 31, eaten: null, net: -100 });
    await balanced();
  });

  it("a forfeited seat that wins loses the pot", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    const t = table();
    await t.sit(ann);
    await t.sit(bob);
    await t.begin([ann, bob, null, null, null]);
    t.away(bob);
    t.roundEnded();
    t.roundEnded();
    expect(await t.settle(final(1))).toMatchObject({ payouts: [], cpuTake: 200 });
    expect([await balance(ann), await balance(bob)]).toEqual([900, 900]);
    await balanced();
  });

  it("a covered seat that wins before its forfeit is paid", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    const t = table();
    await t.sit(ann);
    await t.sit(bob);
    await t.begin([ann, bob, null, null, null]);
    t.away(bob);
    t.roundEnded();
    await t.settle(final(1));
    expect(await balance(bob)).toBe(1100);
  });

  it("voids a match the database disagrees with: every stake home", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    const t = table();
    await t.sit(ann);
    await t.sit(bob);
    await t.begin([ann, bob, null, null, null]);
    await m.pool.query("update credit_seats set stack = 99 where user_id = $1", [bob]);
    expect(await t.settle(final(0))).toMatchObject({ void: true, payouts: [] });
    expect([await balance(ann), await balance(bob)]).toEqual([1000, 999]);
    expect(t.view().seats).toBeNull();
  });

  it("releasing sends every stake home, mid-match too", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    const t = table();
    await t.sit(ann);
    await t.sit(bob);
    await t.begin([ann, bob, null, null, null]);
    await t.release("restart_return");
    expect([await balance(ann), await balance(bob)]).toEqual([1000, 1000]);
    expect(await t.sit(ann)).toEqual({ ok: false, error: "This table is closing" });
    await balanced();
  });
});
