// Blackjack credit seats against Postgres: sitting with an empty seat, bets
// moving from the balance to the seat, a round settled against the house in
// one transaction, refunds, standing up, restarts, and the economy staying
// balanced with the house's net counted.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { TEST_DATABASE_URL, loadDb, truncateAll, makePlayer } from "./setup.js";

const T1 = "00000000-0000-4000-8000-000000000001";
const T2 = "00000000-0000-4000-8000-000000000002";

describe.skipIf(!TEST_DATABASE_URL)("blackjack credits (Postgres)", () => {
  let m;
  let A;
  let C;
  let F;
  let L;
  let CreditError;
  let CreditMismatch;
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
    A = await import("../../credits/accounts.js");
    C = await import("../../credits/check.js");
    F = await import("../../credits/flags.js");
    L = await import("../../credits/leaderboard.js");
    ({ CreditError, CreditMismatch } = await import("../../credits/rules.js"));
  });
  beforeEach(async () => {
    await truncateAll(m.pool);
    L.clearLeaderboardCache();
  });
  afterAll(() => m?.pool.end());

  const player = (name, opts) => makePlayer(m.pool, name, opts);
  const balance = async (id) => Number((await m.pool.query("select balance from credit_accounts where user_id = $1", [id])).rows[0].balance);
  const seatOf = async (id) =>
    (await m.pool.query("select table_id, table_name, tier, stack::int, pending::int, game_type from credit_seats where user_id = $1", [id])).rows[0] ?? null;
  const ledger = async (id) =>
    (await m.pool.query("select kind, amount::int, balance_after::int, tier, table_id, game_type, note, hand_id from credit_ledger where user_id = $1 order by id", [id])).rows;
  const count = async (sql, params = []) => (await m.pool.query(`select count(*)::int as n from ${sql}`, params)).rows[0].n;
  const balanced = async () => expect(await C.economyCheck()).toMatchObject({ ok: true });

  const sit = (id, tableId = T1, tableName = "Shoe") => A.sitBlackjack(id, { tableId, tableName });
  const bet = (id, amount, tableId = T1) => A.stakeBlackjack(id, { tableId, amount });

  /** A round summary as the engine makes it. results: [[userId, staked, returned], ...]. */
  const summary = (roundNumber, results) => {
    const seatResults = results.map(([id, staked, returned], i) => ({
      seat_index: i,
      player_key: id,
      name: `P${i}`,
      hands: [{ cards: [], bet: staked, result: returned > staked ? "win" : returned === staked ? "push" : "lose", payout: returned }],
      insurance: 0,
      insurancePayout: 0,
      staked,
      returned,
      net: returned - staked,
      blackjack: returned === staked * 2.5,
      doubled: false,
      split: false,
    }));
    const houseNet = seatResults.reduce((t, s) => t + s.staked - s.returned, 0);
    return { roundNumber, dealer: { cards: [], total: 20 }, houseNet, seatResults };
  };
  const settle = (results, { roundNumber = 1, leavers = [], tableId = T1 } = {}) =>
    A.settleBlackjackRound({ tableId, isPrivate: false, sessionId: null, summary: summary(roundNumber, results), leavers });

  it("sitBlackjack seats with stack 0 and no ledger row", async () => {
    const ann = await player("ANN");
    expect(await sit(ann)).toEqual({ balance: 1000 });
    expect(await seatOf(ann)).toEqual({ table_id: T1, table_name: "Shoe", tier: "HOUSE", stack: 0, pending: 0, game_type: "blackjack" });
    expect((await ledger(ann)).map((r) => r.kind)).toEqual(["grant"]);
    await balanced();
  });

  it("sitBlackjack refuses an unlinked or frozen account", async () => {
    const bob = await player("BOB", { linked: false });
    await expect(sit(bob)).rejects.toThrow("Link Google or Discord on your profile to play for credits");
    await expect(sit(bob)).rejects.toBeInstanceOf(CreditError);
    expect(await seatOf(bob)).toBeNull();
    const cat = await player("CAT");
    await A.me(cat);
    await m.pool.query("update credit_accounts set frozen_at = now() where user_id = $1", [cat]);
    await expect(sit(cat)).rejects.toThrow("Credit play is suspended on this account");
    expect(await seatOf(cat)).toBeNull();
  });

  it("sitBlackjack is one credit table at a time", async () => {
    const ann = await player("ANN");
    await sit(ann);
    await expect(sit(ann, T2, "Other")).rejects.toThrow("You're already at table Shoe");
  });

  it("a seated player with no bet can't buy in at poker", async () => {
    const ann = await player("ANN");
    await sit(ann);
    await expect(A.buyIn(ann, { tableId: T2, tableName: "Felt", tier: "LOW", amount: 200 })).rejects.toThrow("You're already at table Shoe");
    expect(await balance(ann)).toBe(1000);
  });

  it("stakeBlackjack moves the bet to the seat and writes a 'bet' row", async () => {
    const ann = await player("ANN");
    await sit(ann);
    expect(await bet(ann, 150)).toEqual({ balance: 850 });
    expect(await bet(ann, 50)).toEqual({ balance: 800 }); // a double: more on the same seat
    expect(await seatOf(ann)).toMatchObject({ stack: 200 });
    expect((await ledger(ann)).at(-1)).toMatchObject({ kind: "bet", amount: -50, balance_after: 800, tier: "HOUSE", table_id: T1, game_type: "blackjack" });
    expect((await A.me(ann)).onTable).toBe(200);
    await balanced();
  });

  it("stakeBlackjack refuses more than the balance, 0, 10.5", async () => {
    const ann = await player("ANN");
    await sit(ann);
    await expect(bet(ann, 1001)).rejects.toThrow("Your balance is 1,000");
    await expect(bet(ann, 0)).rejects.toThrow("Pick an amount");
    await expect(bet(ann, 10.5)).rejects.toThrow("Pick an amount");
    await expect(bet(ann, -5)).rejects.toThrow("Pick an amount");
    expect(await seatOf(ann)).toMatchObject({ stack: 0 });
    expect(await balance(ann)).toBe(1000);
  });

  it("stakeBlackjack refuses without a seat, and a frozen account", async () => {
    const ann = await player("ANN");
    await expect(bet(ann, 100)).rejects.toThrow("You're not at this table");
    await sit(ann);
    await expect(bet(ann, 100, T2)).rejects.toThrow("You're not at this table");
    await m.pool.query("update credit_accounts set frozen_at = now() where user_id = $1", [ann]);
    await expect(bet(ann, 100)).rejects.toThrow("Credit play is suspended on this account");
    expect(await balance(ann)).toBe(1000);
    await balanced();
  });

  it("settleBlackjackRound pays winners, zeroes stacks, records house_net, and the economy check is OK", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    for (const id of [ann, bob]) {
      await sit(id);
      await bet(id, 100);
    }
    const { handId, balances } = await settle([
      [ann, 100, 250],
      [bob, 100, 0],
    ]);
    expect(handId).toEqual(expect.any(String));
    expect(balances).toEqual(
      new Map([
        [ann, 1150],
        [bob, 900],
      ]),
    );
    expect([await balance(ann), await balance(bob)]).toEqual([1150, 900]);
    expect(await seatOf(ann)).toMatchObject({ stack: 0, game_type: "blackjack" }); // the seat stays
    expect(await seatOf(bob)).toMatchObject({ stack: 0 });
    expect((await ledger(ann)).at(-1)).toEqual({
      kind: "payout",
      amount: 250,
      balance_after: 1150,
      tier: "HOUSE",
      table_id: T1,
      game_type: "blackjack",
      note: null,
      hand_id: handId,
    });
    expect((await ledger(bob)).at(-1)).toMatchObject({ kind: "bet" }); // nothing came back
    const {
      rows: [rec],
    } = await m.pool.query("select tier, hand_number, game_type, house_net::int, cpu_take::int, events, seats from credit_hands where id = $1", [handId]);
    expect(rec).toMatchObject({ tier: "HOUSE", hand_number: 1, game_type: "blackjack", house_net: -50, cpu_take: 0, events: [] });
    expect(rec.seats).toEqual([
      { seat: 0, user_id: ann, staked: 100, returned: 250, net: 150, hands: [{ cards: [], bet: 100, result: "win", payout: 250 }] },
      { seat: 1, user_id: bob, staked: 100, returned: 0, net: -100, hands: [{ cards: [], bet: 100, result: "lose", payout: 0 }] },
    ]);
    expect(await count("credit_accounts where first_hand_at is not null")).toBe(2);
    expect(await C.economyCheck()).toMatchObject({ balances: 2050, atTables: 0, houseNet: -50, ok: true });
  });

  it("a seat sitting the round out holds 0 and is left alone", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    await sit(ann);
    await sit(bob);
    await bet(ann, 100);
    await settle([[ann, 100, 200]]);
    expect(await seatOf(bob)).toMatchObject({ stack: 0 });
    expect(await count("credit_accounts where first_hand_at is not null")).toBe(1);
    await balanced();
  });

  it("settleBlackjackRound twice for the same round pays once", async () => {
    const ann = await player("ANN");
    await sit(ann);
    await bet(ann, 100);
    const first = await settle([[ann, 100, 200]]);
    expect(first.handId).toEqual(expect.any(String));
    expect(await settle([[ann, 100, 200]])).toEqual({ handId: null, balances: new Map() });
    expect(await balance(ann)).toBe(1100);
    expect(await count("credit_hands")).toBe(1);
    expect((await ledger(ann)).filter((r) => r.kind === "payout")).toHaveLength(1);
    await balanced();
  });

  it("settleBlackjackRound refuses a summary that doesn't match the seats (CreditMismatch), writing nothing", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    await sit(ann);
    await sit(bob);
    await bet(ann, 100);
    await bet(bob, 50);
    // ann's stake is wrong
    await expect(settle([[ann, 200, 400], [bob, 50, 0]])).rejects.toBeInstanceOf(CreditMismatch);
    // bob holds 50 but isn't in the summary
    await expect(settle([[ann, 100, 200]])).rejects.toBeInstanceOf(CreditMismatch);
    // a seat that isn't at the table
    const cat = await player("CAT");
    await expect(settle([[ann, 100, 200], [bob, 50, 0], [cat, 0, 0]])).rejects.toBeInstanceOf(CreditMismatch);
    expect(await count("credit_hands")).toBe(0);
    expect(await seatOf(ann)).toMatchObject({ stack: 100 });
    expect(await seatOf(bob)).toMatchObject({ stack: 50 });
    expect([await balance(ann), await balance(bob)]).toEqual([900, 950]);
    await balanced();
  });

  it("settleBlackjackRound refuses a house net that isn't staked less returned", async () => {
    const ann = await player("ANN");
    await sit(ann);
    await bet(ann, 100);
    const s = summary(1, [[ann, 100, 200]]);
    await expect(A.settleBlackjackRound({ tableId: T1, isPrivate: false, sessionId: null, summary: { ...s, houseNet: 0 } })).rejects.toBeInstanceOf(CreditMismatch);
    expect(await count("credit_hands")).toBe(0);
    await balanced();
  });

  it("a leaver's row is deleted after their payout", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    for (const id of [ann, bob]) {
      await sit(id);
      await bet(id, 100);
    }
    await settle(
      [
        [ann, 100, 200],
        [bob, 100, 100],
      ],
      { leavers: [ann] },
    );
    expect(await seatOf(ann)).toBeNull();
    expect(await balance(ann)).toBe(1100);
    expect((await ledger(ann)).at(-1)).toMatchObject({ kind: "payout", amount: 200 });
    expect(await seatOf(bob)).toMatchObject({ stack: 0 });
    expect(await balance(bob)).toBe(1000);
    // the leaver can sit anywhere now
    await A.buyIn(ann, { tableId: T2, tableName: "Felt", tier: "LOW", amount: 200 });
    await balanced();
  });

  it("standUpBlackjack pays out a stack, deletes the row, and is safe to repeat", async () => {
    const ann = await player("ANN");
    await sit(ann);
    await bet(ann, 120);
    expect(await A.standUpBlackjack(ann, T1)).toEqual({ paid: 120 });
    expect(await seatOf(ann)).toBeNull();
    expect(await balance(ann)).toBe(1000);
    expect((await ledger(ann)).at(-1)).toMatchObject({ kind: "cash_out", amount: 120, balance_after: 1000, tier: "HOUSE", game_type: "blackjack" });
    expect(await A.standUpBlackjack(ann, T1)).toEqual({ paid: 0 });
    const bob = await player("BOB");
    await sit(bob);
    expect(await A.standUpBlackjack(bob, T1)).toEqual({ paid: 0 });
    expect(await seatOf(bob)).toBeNull();
    expect((await ledger(bob)).map((r) => r.kind)).toEqual(["grant"]);
    await balanced();
  });

  it("refundBlackjack puts part of a stack back on the balance", async () => {
    const ann = await player("ANN");
    await sit(ann);
    await bet(ann, 100);
    await bet(ann, 100); // a double the table couldn't apply
    expect(await A.refundBlackjack(ann, { tableId: T1, amount: 100 })).toEqual({ balance: 900 });
    expect(await seatOf(ann)).toMatchObject({ stack: 100 });
    expect((await ledger(ann)).at(-1)).toMatchObject({ kind: "payout", amount: 100, balance_after: 900, tier: "HOUSE", table_id: T1, game_type: "blackjack", note: "refund" });
    await balanced();
  });

  it("refundBlackjack refuses beyond the stack, and without a seat", async () => {
    const ann = await player("ANN");
    await expect(A.refundBlackjack(ann, { tableId: T1, amount: 10 })).rejects.toThrow("You're not at this table");
    await sit(ann);
    await bet(ann, 100);
    await expect(A.refundBlackjack(ann, { tableId: T1, amount: 101 })).rejects.toBeInstanceOf(CreditMismatch);
    expect(await seatOf(ann)).toMatchObject({ stack: 100 });
    expect(await balance(ann)).toBe(900);
    await balanced();
  });

  it("balancesOf reads several balances", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    await sit(ann);
    await sit(bob, T2);
    await bet(ann, 300);
    expect(await A.balancesOf([ann, bob])).toEqual(
      new Map([
        [ann, 700],
        [bob, 1000],
      ]),
    );
  });

  it("returnAllSeats returns a mid-round stake with a notice, and deletes a 0 seat without one", async () => {
    const [ann, bob, cat] = [await player("ANN"), await player("BOB"), await player("CAT")];
    await sit(ann);
    await sit(bob);
    await bet(ann, 100);
    await A.buyIn(cat, { tableId: T2, tableName: "Felt", tier: "LOW", amount: 300 });
    expect(await A.returnAllSeats()).toBe(2);
    expect([await balance(ann), await balance(bob), await balance(cat)]).toEqual([1000, 1000, 1000]);
    expect((await ledger(ann)).at(-1)).toMatchObject({ kind: "restart_return", amount: 100, tier: "HOUSE", game_type: "blackjack" });
    expect((await A.me(ann)).notice).toEqual({ amount: 100, tableName: "Shoe" });
    expect((await ledger(bob)).map((r) => r.kind)).toEqual(["grant"]);
    expect((await A.me(bob)).notice).toBeNull();
    expect((await ledger(cat)).at(-1)).toMatchObject({ kind: "restart_return", amount: 300, game_type: "poker" });
    expect(await count("credit_seats")).toBe(0);
    await balanced();
  });

  it("releaseTable deletes a 0 blackjack seat without a ledger row or notice", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    await sit(ann);
    await sit(bob);
    await bet(ann, 100);
    expect(await A.releaseTable(T1, "restart_return")).toEqual([{ userId: ann, amount: 100 }]);
    expect(await count("credit_seats")).toBe(0);
    expect((await ledger(bob)).map((r) => r.kind)).toEqual(["grant"]);
    expect((await A.me(bob)).notice).toBeNull();
    expect((await A.me(ann)).notice).toEqual({ amount: 100, tableName: "Shoe" });
    await balanced();
  });

  it("pair flags ignore blackjack rounds", async () => {
    const [ann, bob] = [await player("ANN"), await player("BOB")];
    for (const id of [ann, bob]) {
      await sit(id);
      await bet(id, 1000);
    }
    await settle([
      [ann, 1000, 0],
      [bob, 1000, 2000],
    ]);
    expect(await F.flaggedPairs()).toEqual([]);
    expect((await F.pairDetail(ann, bob)).hands).toEqual([]);
  });

  it("the leaderboard has a blackjack source and sources still add up to the total", async () => {
    const [ann, bob, cat] = [await player("ANN"), await player("BOB"), await player("CAT")];
    for (const id of [ann, bob, cat]) {
      await sit(id);
      await bet(id, 100);
    }
    await settle([
      [ann, 100, 250],
      [bob, 100, 0],
      [cat, 100, 100],
    ]);
    await bet(cat, 40); // on the table now
    const { top } = await L.leaderboard();
    const row = (name) => top.find((r) => r.name === name);
    expect(row("ANN")).toMatchObject({ total: 1150, sources: { start: 1000, blackjack: 150, poker: 0 } });
    expect(row("BOB")).toMatchObject({ total: 900, sources: { blackjack: -100 } });
    expect(row("CAT")).toMatchObject({ total: 1000, atTable: true, sources: { blackjack: 0 } });
    for (const r of top) {
      const { start, claimed, poker, muushig, thirteen, blackjack, admin } = r.sources;
      expect(start + claimed + poker + muushig + thirteen + blackjack + admin).toBe(r.total);
    }
  });
});
