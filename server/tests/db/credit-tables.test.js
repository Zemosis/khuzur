// A credit table running for real (short pauses, no turn clock) against
// Postgres: buy-ins, hands saved before the next deal, adding chips, leaving
// in and out of hands, closing, and voiding a hand.

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { TEST_DATABASE_URL, loadDb, truncateAll, makePlayer } from "./setup.js";

const DELAYS = { thinkMin: 1, thinkMax: 2, runout: 1, handGap: 5, firstHand: 5, turn: null, saveRetry: 20, slowSave: 30 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!TEST_DATABASE_URL)("credit tables (Postgres)", () => {
  let m;
  let A;
  let C;
  let CreditTable;
  let legalActions;
  const open = [];
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
    A = await import("../../credits/accounts.js");
    C = await import("../../credits/check.js");
    ({ CreditTable } = await import("../../credits/tables.js"));
    ({ legalActions } = await import("../../game/poker/engine.js"));
  });
  beforeEach(() => truncateAll(m.pool));
  afterEach(() => {
    while (open.length) open.pop().destroy();
  });
  afterAll(() => m?.pool.end());

  const table = (opts = {}) => {
    const ct = new CreditTable({ name: "Felt", tier: "LOW", delays: DELAYS, ...opts });
    open.push(ct);
    return ct;
  };
  /** The balance; an account never opened (every buy-in refused) holds the starting 1000. */
  const balance = async (id) => {
    const { rows } = await m.pool.query("select balance from credit_accounts where user_id = $1", [id]);
    return rows[0] ? Number(rows[0].balance) : 1000;
  };
  const saved = async (id) => (await m.pool.query("select stack::int, pending::int from credit_seats where user_id = $1", [id])).rows[0] ?? null;
  const handsSaved = async () => (await m.pool.query("select count(*)::int as n from credit_hands")).rows[0].n;
  const twoSeated = async (ct, amount = 500) => {
    const ann = await makePlayer(m.pool, "ANN");
    const bob = await makePlayer(m.pool, "BOB");
    expect(await ct.sit({ userId: ann, name: "ANN #0001" }, amount)).toEqual({ ok: true, seat: 0 });
    expect(await ct.sit({ userId: bob, name: "BOB #0001" }, amount)).toEqual({ ok: true, seat: 1 });
    return { ann, bob };
  };
  /** Checks or calls for whoever is on turn until done() — the table has no clock and no CPUs. */
  async function playUntil(ct, done, move = (s, seat) => ({ type: legalActions(s, seat).canCheck ? "check" : "call" })) {
    for (let i = 0; i < 3000; i++) {
      if (await done()) return;
      const s = ct.table.state;
      if (s.phase === "BETTING") ct.table.move(s.turn, move(s, s.turn));
      await sleep(2);
    }
    throw new Error("the table never got there");
  }

  it("buys in, then saves every hand with the stacks it ends on", async () => {
    const onClosed = vi.fn();
    const ct = table({ onClosed });
    const { ann, bob } = await twoSeated(ct);
    expect([await balance(ann), await balance(bob)]).toEqual([500, 500]);
    ct.table.start();
    await playUntil(ct, async () => (await handsSaved()) >= 3);
    ct.table.closeAfterHand(); // stop dealing so memory and database hold still
    await playUntil(ct, async () => onClosed.mock.calls.length > 0);
    expect((await saved(ann)).stack).toBe(ct.table.state.seats[0].stack);
    expect((await saved(bob)).stack).toBe(ct.table.state.seats[1].stack);
    expect((await C.economyCheck()).ok).toBe(true);
  });

  it("refuses a buy-in the account can't make, and a full table", async () => {
    const ct = table();
    const ann = await makePlayer(m.pool, "ANN");
    expect(await ct.sit({ userId: ann, name: "ANN" }, 50)).toEqual({ ok: false, error: "This table's minimum is 200" });
    const email = await makePlayer(m.pool, "EMMA", { linked: false });
    expect(await ct.sit({ userId: email, name: "EMMA" }, 500)).toEqual({ ok: false, error: "Link Google or Discord to play for credits" });
    for (const n of ["P1", "P2", "P3", "P4", "P5", "P6"]) await ct.sit({ userId: await makePlayer(m.pool, n), name: n }, 200);
    expect(await ct.sit({ userId: ann, name: "ANN" }, 200)).toEqual({ ok: false, error: "The table is full" });
    expect(await balance(ann)).toBe(1000);
  });

  it("adds chips between hands, lands them on the next deal, and refuses them mid-hand", async () => {
    const ct = table();
    const { ann } = await twoSeated(ct);
    expect(await ct.addChips(ann, 300)).toEqual({ ok: true });
    expect(await balance(ann)).toBe(200);
    expect(await ct.addChips(ann, 300)).toEqual({ ok: false, error: "You can have at most 1,000 on this table" });
    ct.table.start();
    await playUntil(ct, async () => ct.table.state.phase === "BETTING");
    expect(ct.table.state.seats[0].pending).toBe(0);
    expect(ct.onTable(ann)).toBe(800);
    expect(await ct.addChips(ann, 10)).toEqual({ ok: false, error: "Add chips between hands" });
  });

  it("leaving between hands pays out at once; leaving mid-hand pays out with the hand's save", async () => {
    const ct = table();
    const { ann, bob } = await twoSeated(ct);
    const carol = await makePlayer(m.pool, "CAROL");
    await ct.sit({ userId: carol, name: "CAROL" }, 300);
    await ct.leave(carol);
    expect(await balance(carol)).toBe(1000);
    expect(await saved(carol)).toBeNull();

    let summary;
    ct.table.onHandEnd = (h) => (summary = h);
    ct.table.start();
    await playUntil(ct, async () => ct.table.state.phase === "BETTING");
    let paid = false;
    const left = ct.leave(ann).then(() => (paid = true));
    await sleep(5);
    await playUntil(ct, async () => paid);
    await left;
    const annResult = summary.seatResults.find((r) => r.player_key === ann);
    expect(await balance(ann)).toBe(500 + annResult.stack_after);
    expect(await saved(ann)).toBeNull();
    expect(ct.table.state.seats[0]).toBeNull();
    const { rows } = await m.pool.query("select hand_id from credit_ledger where user_id = $1 and kind = 'cash_out'", [ann]);
    expect(rows[0].hand_id).not.toBeNull();
    expect(await saved(bob)).not.toBeNull();
    expect((await C.economyCheck()).ok).toBe(true);
  });

  it("an all-in player who leaves gets whatever the hand wins them", async () => {
    const ct = table();
    const { ann } = await twoSeated(ct);
    let summary;
    ct.table.onHandEnd = (h) => (summary = h);
    ct.table.start();
    await playUntil(ct, async () => ct.table.state.phase === "BETTING" && ct.table.state.turn === 0);
    ct.table.move(0, { type: "allin" });
    const left = ct.leave(ann);
    await playUntil(ct, async () => !!summary);
    await left;
    expect(await balance(ann)).toBe(500 + summary.seatResults.find((r) => r.player_key === ann).stack_after);
  });

  it("CLAIM counts chips in the pot: 100 in the balance and 900 all-in is 1000", async () => {
    const ct = table();
    const ann = await makePlayer(m.pool, "ANN");
    const bob = await makePlayer(m.pool, "BOB");
    await ct.sit({ userId: ann, name: "ANN" }, 900);
    await ct.sit({ userId: bob, name: "BOB" }, 900);
    await m.pool.query("update credit_accounts set last_claim_at = now() - interval '25 hours'");
    ct.table.start();
    await playUntil(ct, async () => ct.table.state.phase === "BETTING" && ct.table.state.turn === 0);
    ct.table.move(0, { type: "allin" }); // bob's turn now, and no clock: the hand waits
    expect(ct.onTable(ann)).toBe(900);
    await expect(A.claim(ann, ct.onTable(ann))).rejects.toThrow("nothing to claim");
  });

  it("closing with chips waiting to land sends stack and chips home", async () => {
    const onClosed = vi.fn();
    const ct = table({ onClosed });
    const { ann, bob } = await twoSeated(ct);
    ct.table.start();
    await playUntil(ct, async () => ct.table.state.phase === "BETTING" && ct.table.state.turn === 0);
    ct.table.closeAfterHand(); // no next hand: the chips below stay pending
    ct.table.move(0, { type: "fold" });
    await playUntil(ct, async () => ct.table.state.phase === "HAND_OVER");
    expect(await ct.addChips(ann, 300)).toEqual({ ok: true });
    expect((await saved(ann)).pending).toBe(300);
    await playUntil(ct, async () => onClosed.mock.calls.length > 0);
    await ct.release();
    expect(await balance(ann) + (await balance(bob))).toBe(2000);
    expect(await saved(ann)).toBeNull();
    expect((await C.economyCheck()).ok).toBe(true);
  });

  it("release voids a hand in play: everyone gets the stack it started with", async () => {
    const ct = table();
    const { ann, bob } = await twoSeated(ct);
    ct.table.start();
    await playUntil(ct, async () => ct.table.state.phase === "BETTING");
    await ct.release();
    expect([await balance(ann), await balance(bob)]).toEqual([1000, 1000]);
    expect(await ct.sit({ userId: ann, name: "ANN" }, 500)).toEqual({ ok: false, error: "This table is closing" });
  });

  it("a hand the database won't take holds the table on Saving…, then goes on", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const real = await import("../../credits/accounts.js");
    let failures = 3;
    const store = { ...real, saveHand: (args) => (failures-- > 0 ? Promise.reject(new Error("db down")) : real.saveHand(args)) };
    const ct = table({ store });
    await twoSeated(ct);
    ct.table.start();
    await playUntil(ct, async () => ct.table.saving);
    const hand = ct.table.state.handNumber;
    await playUntil(ct, async () => ct.table.state.handNumber > hand);
    expect(await handsSaved()).toBeGreaterThanOrEqual(1);
    expect((await C.economyCheck()).ok).toBe(true);
  });

  it("a player who leaves while an already-saved hand is retried still gets paid at once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const real = await import("../../credits/accounts.js");
    let lostReply = true;
    let failed = false;
    // The first save commits, then its reply is "lost": the table retries a save that's already written.
    const store = {
      ...real,
      saveHand: async (args) => {
        const id = await real.saveHand(args);
        if (lostReply) {
          lostReply = false;
          failed = true;
          throw new Error("reply lost");
        }
        return id;
      },
    };
    const ct = table({ store, delays: { ...DELAYS, saveRetry: 300 } });
    const { ann } = await twoSeated(ct);
    let summary;
    ct.table.onHandEnd = (h) => (summary = h);
    ct.table.start();
    await playUntil(ct, async () => ct.table.state.phase === "BETTING" && ct.table.state.turn === 0);
    ct.table.move(0, { type: "fold" }); // heads-up: the hand ends at once
    await playUntil(ct, async () => failed);
    await ct.leave(ann);
    expect(await saved(ann)).toBeNull();
    expect(await balance(ann)).toBe(500 + summary.seatResults.find((r) => r.player_key === ann).stack_after);
  });

  it("a table whose saves keep disagreeing with the database closes, sending everyone's saved credits home", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { CreditMismatch } = await import("../../credits/rules.js");
    const real = await import("../../credits/accounts.js");
    const store = { ...real, saveHand: async () => Promise.reject(new CreditMismatch("credits don't match")) };
    const onClosed = vi.fn();
    const ct = table({ store, onClosed });
    const { ann, bob } = await twoSeated(ct);
    ct.table.start();
    await playUntil(ct, async () => onClosed.mock.calls.length > 0);
    expect([await balance(ann), await balance(bob)]).toEqual([1000, 1000]);
    expect(await saved(ann)).toBeNull();
  });

  it("a table closing after its hand takes no new buy-ins", async () => {
    const ct = table();
    await twoSeated(ct);
    ct.table.start();
    await playUntil(ct, async () => ct.table.state.phase === "BETTING");
    ct.table.closeAfterHand();
    const carol = await makePlayer(m.pool, "CAROL");
    expect(await ct.sit({ userId: carol, name: "CAROL" }, 300)).toEqual({ ok: false, error: "This table is closing" });
    expect(await balance(carol)).toBe(1000);
  });
});
