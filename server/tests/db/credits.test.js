// Credit accounts against Postgres: balances, CLAIM, buying in and out,
// saving hands, restart returns, and the economy staying balanced throughout.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { TEST_DATABASE_URL, loadDb, truncateAll, makePlayer } from "./setup.js";

const T1 = "00000000-0000-4000-8000-000000000001";
const T2 = "00000000-0000-4000-8000-000000000002";
const DAY = 24 * 3600;

describe.skipIf(!TEST_DATABASE_URL)("credit accounts (Postgres)", () => {
  let m;
  let A; // server/credits/accounts.js
  let C; // server/credits/check.js
  let CreditError;
  let CreditMismatch;
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
    A = await import("../../credits/accounts.js");
    C = await import("../../credits/check.js");
    ({ CreditError, CreditMismatch } = await import("../../credits/rules.js"));
  });
  beforeEach(() => truncateAll(m.pool));
  afterAll(() => m?.pool.end());

  const player = (name, opts) => makePlayer(m.pool, name, opts);
  const balance = async (id) => Number((await m.pool.query("select balance from credit_accounts where user_id = $1", [id])).rows[0].balance);
  const seatOf = async (id) => (await m.pool.query("select table_id, tier, stack::int, pending::int from credit_seats where user_id = $1", [id])).rows[0] ?? null;
  const ledger = async (id) => (await m.pool.query("select kind, amount::int, balance_after::int, tier, hand_id from credit_ledger where user_id = $1 order by id", [id])).rows;
  const lastClaimAgo = (id, secs) => m.pool.query("update credit_accounts set last_claim_at = now() - make_interval(secs => $2) where user_id = $1", [id, secs]);
  const sit = (id, tableId, tier, amount) => A.buyIn(id, { tableId, tableName: "Felt", tier, amount });
  const hand = (n, results) => ({
    roundNumber: n,
    board: [],
    seatResults: results.map(([userId, before, after]) => ({ seat_index: 0, player_key: userId, stack_before: before, stack_after: after, net: after - before, won: 0, committed: 0, folded_street: null, shown_hand: null, hole: [] })),
  });

  it("a player's first touch opens their account with 1000, granted in the ledger", async () => {
    const ann = await player("ANN");
    expect(await A.me(ann)).toMatchObject({ balance: 1000, onTable: 0, canPlay: true, whyNot: null, seat: null, claim: { state: "over" }, notice: null, rathole: { LOW: null, MID: null, HIGH: null } });
    expect(await ledger(ann)).toEqual([{ kind: "grant", amount: 1000, balance_after: 1000, tier: null, hand_id: null }]);
  });

  describe("claim", () => {
    it("counts the table, waits a day from the starting grant, then tops up to exactly 1000", async () => {
      const ann = await player("ANN");
      await sit(ann, T1, "LOW", 800);
      expect((await A.me(ann, 800)).claim).toEqual({ state: "over" });
      // A hand loses her 500: the table and the database both hold 300 now.
      await A.saveHand({ tableId: T1, tier: "LOW", isPrivate: false, sessionId: null, events: [], summary: hand(1, [[ann, 800, 300]]), seats: [{ userId: ann, stack: 300, pending: 0, leaving: false }] });
      expect((await A.me(ann, 300)).claim.state).toBe("wait");
      await expect(A.claim(ann, 300)).rejects.toThrow(/Your next claim is in 2[34]h/);
      await lastClaimAgo(ann, DAY + 1);
      expect((await A.me(ann, 300)).claim).toEqual({ state: "ready", amount: 500 });
      expect(await A.claim(ann, 300)).toEqual({ balance: 700 });
      expect((await ledger(ann)).at(-1)).toMatchObject({ kind: "claim", amount: 500, balance_after: 700 });
      await expect(A.claim(ann, 300)).rejects.toThrow("You have 1,000 or more: nothing to claim");
    });

    it("counts a seat the caller didn't know about: a buy-in that landed while the claim waited", async () => {
      const ann = await player("ANN");
      await sit(ann, T1, "LOW", 1000);
      await lastClaimAgo(ann, DAY + 1);
      await expect(A.claim(ann, 0)).rejects.toThrow("nothing to claim");
      expect(await balance(ann)).toBe(0);
    });

    it("an email-only account can't play or claim; a frozen one neither", async () => {
      const bob = await player("BOB", { linked: false });
      expect(await A.me(bob)).toMatchObject({ canPlay: false, whyNot: "Link Google or Discord to play for credits" });
      await expect(sit(bob, T1, "LOW", 500)).rejects.toThrow("Link Google or Discord to play for credits");
      await lastClaimAgo(bob, DAY + 1);
      await expect(A.claim(bob)).rejects.toThrow("Link Google or Discord to play for credits");
      const cat = await player("CAT");
      await A.me(cat);
      await m.pool.query("update credit_accounts set frozen_at = now() where user_id = $1", [cat]);
      await expect(sit(cat, T1, "LOW", 500)).rejects.toThrow("Credit play is suspended on this account");
      expect((await A.me(cat)).claim).toEqual({ state: "frozen" });
    });
  });

  describe("buying in", () => {
    it("moves credits from the balance to a seat", async () => {
      const ann = await player("ANN");
      expect(await sit(ann, T1, "LOW", 600)).toEqual({ balance: 400 });
      expect(await seatOf(ann)).toEqual({ table_id: T1, tier: "LOW", stack: 600, pending: 0 });
      expect((await ledger(ann)).at(-1)).toMatchObject({ kind: "buy_in", amount: -600, balance_after: 400, tier: "LOW" });
      expect(await A.me(ann)).toMatchObject({ balance: 400, onTable: 600, seat: { tableName: "Felt", tier: "LOW" } });
    });

    it.each([
      ["500", "Pick an amount"],
      [500.5, "Pick an amount"],
      [null, "Pick an amount"],
      [Number.NaN, "Pick an amount"],
      [-10, "This table's minimum is 200"],
      [150, "This table's minimum is 200"],
      [1001, "This table's maximum is 1,000"],
      [1e9, "This table's maximum is 1,000"],
    ])("refuses %s and changes nothing", async (amount, error) => {
      const ann = await player("ANN");
      await A.me(ann); // open the account: a refused buy-in rolls back everything, opening included
      await expect(sit(ann, T1, "LOW", amount)).rejects.toThrow(error);
      expect(await balance(ann)).toBe(1000);
      expect(await seatOf(ann)).toBeNull();
    });

    it("refuses more than the balance", async () => {
      const ann = await player("ANN");
      await expect(sit(ann, T1, "HIGH", 4000)).rejects.toThrow("Your balance is 1,000");
    });

    it("one table at a time, even when two buy-ins arrive together", async () => {
      const ann = await player("ANN");
      const results = await Promise.allSettled([sit(ann, T1, "LOW", 800), sit(ann, T2, "LOW", 800)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected").reason.message).toMatch(/You're already at table Felt|Your balance is 200|This table's minimum/);
      expect(await balance(ann)).toBe(200);
    });

    it("after leaving with 600, the minimum at that tier is 600 for an hour", async () => {
      const ann = await player("ANN");
      await sit(ann, T1, "LOW", 600);
      await A.cashOut(ann, T1);
      expect((await A.me(ann)).rathole).toMatchObject({ LOW: { amount: 600 }, MID: null });
      await expect(sit(ann, T2, "LOW", 300)).rejects.toThrow("You left a LOW table with 600 within the hour: buy in with at least 600");
      await sit(ann, T2, "MID", 1000); // another tier is unaffected
      await A.cashOut(ann, T2);
      await m.pool.query("update credit_ledger set created_at = now() - interval '61 minutes' where user_id = $1", [ann]);
      expect(await sit(ann, T1, "LOW", 200)).toEqual({ balance: 800 });
    });
  });

  describe("adding chips and cashing out", () => {
    it("top-ups wait in pending, within the tier max", async () => {
      const ann = await player("ANN");
      await sit(ann, T1, "LOW", 600);
      expect(await A.topUp(ann, 300, { tier: "LOW", tableId: T1, onTable: 600 })).toEqual({ balance: 100 });
      expect(await seatOf(ann)).toMatchObject({ stack: 600, pending: 300 });
      await expect(A.topUp(ann, 101, { tier: "LOW", tableId: T1, onTable: 900 })).rejects.toThrow("You can have at most 1,000 on this table");
      await expect(A.topUp(ann, 50, { tier: "LOW", tableId: T1, onTable: 0 })).rejects.toThrow("Buy back in with at least 200");
      await expect(A.topUp(ann, 100, { tier: "LOW", tableId: T2, onTable: 600 })).rejects.toThrow("You're not at this table");
      await expect(A.topUp(ann, "50", { tier: "LOW", tableId: T1, onTable: 600 })).rejects.toThrow("Pick an amount");
      expect(await balance(ann)).toBe(100);
    });

    it("cashing out pays stack plus pending, once", async () => {
      const ann = await player("ANN");
      await sit(ann, T1, "LOW", 600);
      await A.topUp(ann, 300, { tier: "LOW", tableId: T1, onTable: 600 });
      expect(await A.cashOut(ann, T1)).toEqual({ paid: 900 });
      expect(await A.cashOut(ann, T1)).toEqual({ paid: 0 });
      expect(await balance(ann)).toBe(1000);
      expect(await seatOf(ann)).toBeNull();
      expect((await ledger(ann)).filter((r) => r.kind === "cash_out")).toEqual([{ kind: "cash_out", amount: 900, balance_after: 1000, tier: "LOW", hand_id: null }]);
    });
  });

  describe("saving hands", () => {
    it("writes the hand, the new stacks and pays out a leaver; a retry changes nothing", async () => {
      const ann = await player("ANN");
      const bob = await player("BOB");
      await sit(ann, T1, "LOW", 500);
      await sit(bob, T1, "LOW", 500);
      const save = () =>
        A.saveHand({
          tableId: T1, tier: "LOW", isPrivate: true, sessionId: null, events: [{ type: "hand", handNumber: 1 }],
          summary: hand(1, [[ann, 500, 600], [bob, 500, 400]]),
          seats: [{ userId: ann, stack: 600, pending: 0, leaving: false }, { userId: bob, stack: 400, pending: 0, leaving: true }],
        });
      const handId = await save();
      expect(handId).not.toBeNull();
      expect(await seatOf(ann)).toMatchObject({ stack: 600 });
      expect(await seatOf(bob)).toBeNull();
      expect(await balance(bob)).toBe(900);
      expect((await ledger(bob)).at(-1)).toMatchObject({ kind: "cash_out", amount: 400, hand_id: String(handId) });
      const { rows: [h] } = await m.pool.query("select tier, is_private, seats from credit_hands where id = $1", [handId]);
      expect(h).toMatchObject({ tier: "LOW", is_private: true });
      expect(h.seats.map((x) => [x.user_id, x.net])).toEqual([[ann, 100], [bob, -100]]);
      const { rows: firsts } = await m.pool.query("select count(*)::int as n from credit_accounts where first_hand_at is not null");
      expect(firsts[0].n).toBe(2);
      expect(await save()).toBeNull();
      expect(await balance(bob)).toBe(900);
    });

    it("refuses a hand when the table and the database disagree", async () => {
      const ann = await player("ANN");
      await sit(ann, T1, "LOW", 500);
      await expect(
        A.saveHand({ tableId: T1, tier: "LOW", isPrivate: false, sessionId: null, events: [], summary: hand(1, [[ann, 500, 600]]), seats: [{ userId: ann, stack: 700, pending: 0, leaving: false }] }),
      ).rejects.toThrow(CreditMismatch);
      expect((await m.pool.query("select count(*)::int as n from credit_hands")).rows[0].n).toBe(0);
    });
  });

  describe("returning seats", () => {
    it("a restart sends every seat home with stack plus pending, and tells each player until they dismiss it", async () => {
      const ann = await player("ANN");
      const bob = await player("BOB");
      await sit(ann, T1, "LOW", 500);
      await A.topUp(ann, 200, { tier: "LOW", tableId: T1, onTable: 500 });
      await sit(bob, T2, "MID", 1000);
      expect(await A.returnAllSeats()).toBe(2);
      expect([await balance(ann), await balance(bob)]).toEqual([1000, 1000]);
      expect((await ledger(ann)).at(-1)).toMatchObject({ kind: "restart_return", amount: 700 });
      expect((await A.me(ann)).notice).toEqual({ amount: 700, tableName: "Felt" });
      expect((await A.me(ann)).notice).toEqual({ amount: 700, tableName: "Felt" }); // reading doesn't use it up
      await A.dismissNotice(ann);
      expect((await A.me(ann)).notice).toBeNull();
    });

    it("releasing a table sends only its seats home", async () => {
      const ann = await player("ANN");
      const bob = await player("BOB");
      await sit(ann, T1, "LOW", 500);
      await sit(bob, T2, "LOW", 500);
      expect(await A.releaseTable(T1)).toEqual([{ userId: ann, amount: 500 }]);
      expect(await seatOf(ann)).toBeNull();
      expect(await seatOf(bob)).not.toBeNull();
    });
  });

  describe("the economy check", () => {
    it("is OK after real moves and catches a balance edited by hand", async () => {
      const ann = await player("ANN");
      await sit(ann, T1, "LOW", 500);
      expect(await C.economyCheck()).toEqual({ balances: 500, atTables: 500, granted: 1000, claimed: 0, removed: 0, ok: true });
      await m.pool.query("update credit_accounts set balance = balance + 1");
      expect((await C.economyCheck()).ok).toBe(false);
    });

    it("stays balanced through hundreds of random claims, buy-ins, top-ups, hands, leaves and restarts", async () => {
      let seed = 11;
      const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const pick = (a) => a[Math.floor(rng() * a.length)];
      const ids = [];
      for (const n of ["P1", "P2", "P3", "P4", "P5", "P6"]) ids.push(await player(n));
      const tables = [T1, T2];
      const seats = new Map(); // userId -> { table, stack, pending }: the table in memory
      for (let op = 0; op < 400; op++) {
        const r = rng();
        const id = pick(ids);
        const seat = seats.get(id);
        try {
          if (r < 0.15) {
            await lastClaimAgo(id, DAY + 1);
            await A.claim(id, seat ? seat.stack + seat.pending : 0);
          } else if (r < 0.4 && !seat) {
            const table = pick(tables);
            const amount = 200 + Math.floor(rng() * 800);
            await sit(id, table, "LOW", amount);
            seats.set(id, { table, stack: amount, pending: 0 });
          } else if (r < 0.5 && seat) {
            const amount = 1 + Math.floor(rng() * 200);
            await A.topUp(id, amount, { tier: "LOW", tableId: seat.table, onTable: seat.stack + seat.pending });
            seat.pending += amount;
          } else if (r < 0.8) {
            const table = pick(tables);
            const at = [...seats].filter(([, s]) => s.table === table);
            if (at.length < 2) continue;
            for (const [, s] of at) {
              s.stack += s.pending;
              s.pending = 0;
            }
            const before = new Map(at.map(([u, s]) => [u, s.stack]));
            const [loser, l] = pick(at);
            const [, w] = pick(at.filter(([u]) => u !== loser));
            const amount = Math.floor(rng() * l.stack);
            l.stack -= amount;
            w.stack += amount;
            const leaver = rng() < 0.2 ? loser : null;
            await A.saveHand({
              tableId: table, tier: "LOW", isPrivate: false, sessionId: null, events: [],
              summary: hand(op, at.map(([u, s]) => [u, before.get(u), s.stack])),
              seats: at.map(([u, s]) => ({ userId: u, stack: s.stack, pending: s.pending, leaving: u === leaver })),
            });
            if (leaver) seats.delete(leaver);
          } else if (r < 0.95 && seat) {
            await A.cashOut(id, seat.table);
            seats.delete(id);
          } else {
            await A.returnAllSeats();
            seats.clear();
          }
        } catch (err) {
          if (!(err instanceof CreditError)) throw err;
        }
        if (op % 50 === 0) expect((await C.economyCheck()).ok).toBe(true);
      }
      expect((await C.economyCheck()).ok).toBe(true);
    });
  });
});
