// Credit match stakes against Postgres: staking, standing up before the deal,
// settling a match (a human or a CPU winning, a split, a retry), restarts,
// and the economy staying balanced throughout.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { TEST_DATABASE_URL, loadDb, truncateAll, makePlayer } from "./setup.js";

const T1 = "00000000-0000-4000-8000-000000000001";
const T2 = "00000000-0000-4000-8000-000000000002";

describe.skipIf(!TEST_DATABASE_URL)("credit match stakes (Postgres)", () => {
  let m;
  let A;
  let C;
  let CreditMismatch;
  let settlement;
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
    A = await import("../../credits/accounts.js");
    C = await import("../../credits/check.js");
    ({ CreditMismatch } = await import("../../credits/rules.js"));
    ({ settlement } = await import("../../game/stakes.js"));
  });
  beforeEach(() => truncateAll(m.pool));
  afterAll(() => m?.pool.end());

  const player = (name, opts) => makePlayer(m.pool, name, opts);
  const balance = async (id) => Number((await m.pool.query("select balance from credit_accounts where user_id = $1", [id])).rows[0].balance);
  const seatOf = async (id) => (await m.pool.query("select table_id, tier, stack::int, game_type from credit_seats where user_id = $1", [id])).rows[0] ?? null;
  const ledger = async (id) => (await m.pool.query("select kind, amount::int, balance_after::int, game_type from credit_ledger where user_id = $1 order by id", [id])).rows;
  const stake = (id, tableId = T1, tier = "LOW", amount = 100) => A.placeStake(id, { tableId, tableName: "Ger", tier, stake: 100 * { LOW: 1, MID: 5, HIGH: 20 }[tier], amount });
  const balanced = async () => expect((await C.economyCheck()).ok).toBe(true);

  /** Settles T1 with `ids` in seats 0.. (CPUs after them) and `winners` winning. */
  const settle = (ids, winners, { forfeited = [], matchNumber = 1, tableId = T1, amount = 100 } = {}) => {
    const seats = [0, 1, 2, 3, 4].map((i) => ({ userId: ids[i] ?? null, forfeited: forfeited.includes(i), score: winners.includes(i) ? 0 : 8, eaten: 1 }));
    const { payouts, cpuTake } = settlement({ stake: amount, seats, winners });
    return A.settleMatch({ tableId, tier: "LOW", isPrivate: false, sessionId: null, matchNumber, stake: amount, seats, payouts, cpuTake });
  };

  describe("placeStake", () => {
    it("moves exactly the stake to a muushig seat", async () => {
      const ann = await player("ANN");
      expect(await stake(ann, T1, "MID", 500)).toEqual({ balance: 500 });
      expect(await seatOf(ann)).toEqual({ table_id: T1, tier: "MID", stack: 500, game_type: "muushig" });
      expect((await ledger(ann)).at(-1)).toEqual({ kind: "stake", amount: -500, balance_after: 500, game_type: "muushig" });
      await balanced();
    });

    it("refuses an amount that isn't the stake, and a balance under it", async () => {
      const ann = await player("ANN");
      await expect(stake(ann, T1, "MID", 100)).rejects.toThrow("This table's stake is 500");
      await expect(stake(ann, T1, "HIGH", 2000)).rejects.toThrow("Your balance is 1,000; this table's stake is 2,000");
      expect(await seatOf(ann)).toBeNull();
    });

    it("refuses an unlinked account", async () => {
      const bob = await player("BOB", { linked: false });
      await expect(stake(bob)).rejects.toThrow("Link Google or Discord to play for credits");
    });

    it("is one credit table at a time, across games", async () => {
      const ann = await player("ANN");
      await stake(ann);
      await expect(stake(ann, T2)).rejects.toThrow("Your stake is in the match at Ger until it ends");
      await expect(A.buyIn(ann, { tableId: T2, tableName: "Felt", tier: "LOW", amount: 200 })).rejects.toThrow("Your stake is in the match at Ger until it ends");
      await A.returnStake(ann, T1);
      await A.buyIn(ann, { tableId: T2, tableName: "Felt", tier: "LOW", amount: 200 });
      await expect(stake(ann)).rejects.toThrow("You're already at table Felt");
    });

    it("counts toward CLAIM's total like a stack", async () => {
      const ann = await player("ANN");
      await stake(ann);
      expect((await A.me(ann)).onTable).toBe(100);
      expect((await A.me(ann)).claim).toEqual({ state: "over" });
    });
  });

  it("returnStake gives the stake back once", async () => {
    const ann = await player("ANN");
    await stake(ann);
    expect(await A.returnStake(ann, T1)).toEqual({ paid: 100 });
    expect(await A.returnStake(ann, T1)).toEqual({ paid: 0 });
    expect(await balance(ann)).toBe(1000);
    expect((await ledger(ann)).at(-1)).toEqual({ kind: "stake_back", amount: 100, balance_after: 1000, game_type: "muushig" });
    await balanced();
  });

  describe("settleMatch", () => {
    it("pays a human winner the pot, records the match and puts everyone on the leaderboard", async () => {
      const [ann, bob, cat] = [await player("ANN"), await player("BOB"), await player("CAT")];
      for (const id of [ann, bob, cat]) await stake(id);
      const id = await settle([ann, bob, cat], [1]);
      expect(id).toEqual(expect.any(String));
      expect([await balance(ann), await balance(bob), await balance(cat)]).toEqual([900, 1200, 900]);
      expect((await ledger(bob)).at(-1)).toEqual({ kind: "pot", amount: 300, balance_after: 1200, game_type: "muushig" });
      expect(await seatOf(ann)).toBeNull();
      const {
        rows: [rec],
      } = await m.pool.query("select game_type, cpu_take::int, seats from credit_hands where id = $1", [id]);
      expect(rec.game_type).toBe("muushig");
      expect(rec.cpu_take).toBe(0);
      expect(rec.seats[1]).toMatchObject({ user_id: bob, stack_before: 100, net: 200, won: 300 });
      expect(rec.seats[0]).toMatchObject({ user_id: ann, net: -100 });
      expect(rec.seats[4]).toMatchObject({ user_id: null, cpu: true });
      const { rows } = await m.pool.query("select count(*)::int as n from credit_accounts where first_hand_at is not null");
      expect(rows[0].n).toBe(3);
      await balanced();
    });

    it("loses the pot to a CPU, and the economy counts it", async () => {
      const [ann, bob] = [await player("ANN"), await player("BOB")];
      await stake(ann);
      await stake(bob);
      await settle([ann, bob], [3]);
      expect([await balance(ann), await balance(bob)]).toEqual([900, 900]);
      expect(await C.economyCheck()).toMatchObject({ balances: 1800, atTables: 0, wonByBots: 200, ok: true });
    });

    it("loses a forfeited seat's win", async () => {
      const [ann, bob] = [await player("ANN"), await player("BOB")];
      await stake(ann);
      await stake(bob);
      await settle([ann, bob], [0], { forfeited: [0] });
      expect(await balance(ann)).toBe(900);
      await balanced();
    });

    it("splits a tie", async () => {
      const [ann, bob, cat] = [await player("ANN"), await player("BOB"), await player("CAT")];
      for (const id of [ann, bob, cat]) await stake(id);
      await settle([ann, bob, cat], [0, 2]);
      expect([await balance(ann), await balance(bob), await balance(cat)]).toEqual([1050, 900, 1050]);
      await balanced();
    });

    it("a retry after a lost reply changes nothing", async () => {
      const [ann, bob] = [await player("ANN"), await player("BOB")];
      await stake(ann);
      await stake(bob);
      await settle([ann, bob], [0]);
      expect(await settle([ann, bob], [0])).toBeNull();
      expect(await balance(ann)).toBe(1100);
      await balanced();
    });

    it("refuses when the table and the database disagree, writing nothing", async () => {
      const [ann, bob] = [await player("ANN"), await player("BOB")];
      await stake(ann);
      await expect(settle([ann, bob], [0])).rejects.toBeInstanceOf(CreditMismatch);
      expect(await seatOf(ann)).toMatchObject({ stack: 100 });
      const { rows } = await m.pool.query("select count(*)::int as n from credit_hands");
      expect(rows[0].n).toBe(0);
    });
  });

  it("a restart sends every stake home as a restart_return, poker seats too", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    await stake(ann);
    await A.buyIn(bob, { tableId: T2, tableName: "Felt", tier: "LOW", amount: 300 });
    expect(await A.returnAllSeats()).toBe(2);
    expect([await balance(ann), await balance(bob)]).toEqual([1000, 1000]);
    expect((await ledger(ann)).at(-1)).toMatchObject({ kind: "restart_return", amount: 100, game_type: "muushig" });
    expect((await ledger(bob)).at(-1)).toMatchObject({ kind: "restart_return", amount: 300, game_type: "poker" });
    expect((await A.me(ann)).notice).toEqual({ amount: 100, tableName: "Ger" });
    await balanced();
  });

  it("releasing a waiting table returns each stake as stake_back", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    await stake(ann);
    await stake(bob);
    await A.releaseTable(T1, "stake_back");
    expect([await balance(ann), await balance(bob)]).toEqual([1000, 1000]);
    expect((await ledger(bob)).at(-1)).toMatchObject({ kind: "stake_back", game_type: "muushig" });
  });
});
