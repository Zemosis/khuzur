// A credit Blackjack table running for real (short pauses, long turn clocks
// the tests act inside) against Postgres: sitting, bets moving at the deal,
// refused bets, doubles funded once, leaving in and out of a round, releasing,
// and a table whose saves keep disagreeing with the database.

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { TEST_DATABASE_URL, loadDb, truncateAll, makePlayer } from "./setup.js";

process.env.CREDIT_RETRY_MS = "20"; // read when rules.js loads (in beforeAll)

// The betting window and turn clocks are long: the tests press READY and act themselves.
const DELAYS = { betting: 5000, insurance: 5000, turn: 5000, deal: 1, dealerStep: 1, results: 5, saveRetry: 20, slowSave: 30 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!TEST_DATABASE_URL)("credit blackjack tables (Postgres)", () => {
  let m;
  let A;
  let C;
  let CreditBlackjack;
  let makeCard;
  let PHASES;
  let CreditMismatch;
  const open = [];
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
    A = await import("../../credits/accounts.js");
    C = await import("../../credits/check.js");
    ({ CreditBlackjack } = await import("../../credits/blackjackTables.js"));
    ({ makeCard } = await import("../../game/blackjack/rules.js"));
    ({ PHASES } = await import("../../game/blackjack/engine.js"));
    ({ CreditMismatch } = await import("../../credits/rules.js"));
  });
  beforeEach(() => truncateAll(m.pool));
  afterEach(() => {
    while (open.length) open.pop().destroy();
  });
  afterAll(() => m?.pool.end());

  /** "10♠ 9♥" → that deal order, padded with 2♣ so the cut card is never reached. */
  const shoe = (ids) => {
    const cards = ids.split(/\s+/).map((id) => makeCard(id.slice(0, -1), id.slice(-1)));
    while (cards.length < 312) cards.push(makeCard("2", "♣"));
    return cards;
  };
  const table = (cards, opts = {}) => {
    const cb = new CreditBlackjack({ name: "Shoe", delays: DELAYS, shoe: shoe(cards), ...opts });
    open.push(cb);
    return cb;
  };
  const balance = async (id) => {
    const { rows } = await m.pool.query("select balance from credit_accounts where user_id = $1", [id]);
    return rows[0] ? Number(rows[0].balance) : 1000;
  };
  const seatRow = async (id) => (await m.pool.query("select table_id, stack::int from credit_seats where user_id = $1", [id])).rows[0] ?? null;
  const bets = async (id) => (await m.pool.query("select amount::int from credit_ledger where user_id = $1 and kind = 'bet' order by id", [id])).rows.map((r) => r.amount);
  const roundsSaved = async () => (await m.pool.query("select count(*)::int as n from credit_hands")).rows[0].n;
  const balanced = async () => expect(await C.economyCheck()).toMatchObject({ ok: true });
  /** Takes credits off a player as an admin would (the economy stays balanced). */
  const spend = async (id, amount, adminId) => A.reverse({ adminId, fromId: id, toId: null, amount, note: "test" });

  async function until(done, what = "the table never got there") {
    for (let i = 0; i < 1500; i++) {
      if (await done()) return;
      await sleep(4);
    }
    throw new Error(what);
  }
  const phase = (cb) => cb.table.state.phase;
  const seated = async (cb, names) => {
    const ids = [];
    for (const [i, n] of names.entries()) {
      const id = await makePlayer(m.pool, n);
      expect(await cb.sit({ userId: id, name: `${n} #0001` })).toEqual({ ok: true, seat: i });
      ids.push(id);
    }
    await cb.queue; // the window's bankroll resync is done
    return ids;
  };
  /** Each [userId, amount] bets and presses READY; resolves once the cards are out. */
  const betAll = async (cb, list) => {
    for (const [id, amount] of list) {
      expect(cb.table.bet(cb.seatOf(id), amount)).toEqual({ ok: true });
      expect(cb.table.ready(cb.seatOf(id))).toEqual({ ok: true });
    }
    await until(() => ![PHASES.BETTING, PHASES.DEALING].includes(phase(cb)) || cb.table.state.roundNumber > 0, "never dealt");
  };
  /** After the round: the next betting window is open (so the save is done). */
  const nextWindow = (cb, round) => until(() => phase(cb) === PHASES.BETTING && cb.table.state.roundNumber >= round && !cb.table.save, "no next window");

  it("sits two players and plays a round; balances and the economy check agree", async () => {
    // ANN 10 9 = 19, BOB 10 6 = 16, dealer 10 8 = 18.
    const cb = table("10♠ 10♥ 10♦ 9♥ 6♦ 8♣");
    const [ann, bob] = await seated(cb, ["ANN", "BOB"]);
    expect(await seatRow(ann)).toEqual({ table_id: cb.id, stack: 0 });
    expect(cb.table.state.seats[0].bankroll).toBe(1000);
    let summary;
    cb.table.onRoundEnd = (s) => (summary = s);
    await betAll(cb, [
      [ann, 100],
      [bob, 100],
    ]);
    expect(phase(cb)).toBe(PHASES.TURNS);
    expect([await balance(ann), await balance(bob)]).toEqual([900, 900]);
    expect((await seatRow(ann)).stack).toBe(100);
    expect(await cb.move(ann, "STAND")).toEqual({ ok: true });
    expect(await cb.move(bob, "STAND")).toEqual({ ok: true });
    await nextWindow(cb, 1);
    expect(summary.houseNet).toBe(0);
    expect([await balance(ann), await balance(bob)]).toEqual([1100, 900]);
    expect([(await seatRow(ann)).stack, (await seatRow(bob)).stack]).toEqual([0, 0]);
    expect([cb.table.state.seats[0].bankroll, cb.table.state.seats[1].bankroll]).toEqual([1100, 900]);
    expect(await roundsSaved()).toBe(1);
    await balanced();
  });

  it("a bet larger than the balance is refused at the deal and that seat sits out", async () => {
    // Only ANN is dealt: ANN 10 9, dealer 10 8.
    const refused = [];
    const cb = table("10♠ 10♦ 9♥ 8♣", { onRefused: (key, error) => refused.push([key, error]) });
    const [ann, bob] = await seated(cb, ["ANN", "BOB"]);
    await spend(bob, 950, ann); // spent elsewhere: the table still thinks BOB has 1000
    await betAll(cb, [
      [ann, 100],
      [bob, 500],
    ]);
    expect(refused).toEqual([[bob, "Your balance is 50"]]);
    expect(cb.table.state.seats[1]).toMatchObject({ inRound: false, hands: [] });
    expect(cb.table.state.seats[0].inRound).toBe(true);
    expect(await bets(bob)).toEqual([]);
    expect((await seatRow(bob)).stack).toBe(0);
    expect(await cb.move(ann, "STAND")).toEqual({ ok: true });
    await nextWindow(cb, 1);
    expect([await balance(ann), await balance(bob)]).toEqual([1100, 50]);
    expect(cb.table.state.seats[1].bankroll).toBe(50);
    await balanced();
  });

  it("every bet refused: betting reopens with the bankroll the database holds", async () => {
    const refused = [];
    const cb = table("10♠ 10♦ 9♥ 8♣", { onRefused: (key, error) => refused.push([key, error]) });
    const admin = await makePlayer(m.pool, "ADMIN");
    const [ann] = await seated(cb, ["ANN"]);
    await spend(ann, 960, admin);
    expect(cb.table.bet(0, 500)).toEqual({ ok: true });
    expect(cb.table.ready(0)).toEqual({ ok: true });
    await until(() => refused.length === 1 && phase(cb) === PHASES.BETTING && cb.table.state.seats[0].bankroll === 40);
    expect(refused).toEqual([[ann, "Your balance is 40"]]);
    expect(cb.table.state.roundNumber).toBe(0);
    await balanced();
  });

  it("a second DOUBLE while the first is funding is refused; funded once", async () => {
    // ANN 6 5 = 11, dealer 10 7; the double draws 9 = 20.
    const cb = table("6♠ 10♦ 5♥ 7♣ 9♠");
    const [ann] = await seated(cb, ["ANN"]);
    await betAll(cb, [[ann, 100]]);
    expect(cb.onTable(ann)).toBe(100);
    const first = cb.move(ann, "DOUBLE");
    const second = cb.move(ann, "DOUBLE");
    expect(await second).toEqual({ ok: false, error: "Not your turn" });
    expect(await first).toEqual({ ok: true });
    expect(await bets(ann)).toEqual([-100, -100]);
    await nextWindow(cb, 1);
    expect(await balance(ann)).toBe(1200);
    await balanced();
  });

  it("leaving mid-round: the hand stands, settles, and the credits arrive after the save", async () => {
    // ANN 10 9 = 19, BOB 10 7 = 17, dealer 10 8 = 18.
    const cb = table("10♠ 10♥ 10♦ 9♥ 7♦ 8♣");
    const [ann, bob] = await seated(cb, ["ANN", "BOB"]);
    await betAll(cb, [
      [ann, 100],
      [bob, 100],
    ]);
    expect(cb.table.state.turn).toEqual({ seat: 0, hand: 0 });
    let paid = false;
    const left = cb.leave(ann).then(() => (paid = true));
    await until(() => cb.table.state.seats[0]?.leaving);
    expect(cb.table.state.turn.seat).toBe(1); // ANN's 19 stands, BOB plays
    await sleep(20);
    expect(paid).toBe(false);
    expect(await balance(ann)).toBe(900);
    expect((await seatRow(ann)).stack).toBe(100);
    expect(await cb.move(bob, "STAND")).toEqual({ ok: true });
    await left;
    expect(await balance(ann)).toBe(1100);
    expect(await seatRow(ann)).toBeNull();
    const { rows } = await m.pool.query("select hand_id from credit_ledger where user_id = $1 and kind = 'payout'", [ann]);
    expect(rows).toHaveLength(1);
    expect(rows[0].hand_id).not.toBeNull();
    await nextWindow(cb, 1);
    expect(cb.table.state.seats[0]).toBeNull();
    expect(cb.seatOf(ann)).toBe(-1);
    expect(await balance(bob)).toBe(900);
    await balanced();
  });

  it("leaving between rounds deletes the seat row at once", async () => {
    const cb = table("10♠ 10♦ 9♥ 8♣");
    const [ann, bob] = await seated(cb, ["ANN", "BOB"]);
    expect(cb.table.bet(1, 200)).toEqual({ ok: true }); // a bet placed, not yet moved
    await cb.leave(bob);
    expect(await seatRow(bob)).toBeNull();
    expect(cb.table.state.seats[1]).toBeNull();
    expect(await balance(bob)).toBe(1000);
    await cb.leave(ann);
    expect(await seatRow(ann)).toBeNull();
    expect(cb.table.state.seats.every((s) => s === null)).toBe(true);
    await cb.leave(ann); // twice is harmless
    await balanced();
  });

  it("release() mid-round returns every stake; the round never happened", async () => {
    const cb = table("10♠ 10♥ 10♦ 9♥ 7♦ 8♣");
    const [ann, bob] = await seated(cb, ["ANN", "BOB"]);
    await betAll(cb, [
      [ann, 300],
      [bob, 100],
    ]);
    expect([await balance(ann), await balance(bob)]).toEqual([700, 900]);
    await cb.release();
    expect([await balance(ann), await balance(bob)]).toEqual([1000, 1000]);
    expect([await seatRow(ann), await seatRow(bob)]).toEqual([null, null]);
    expect(await cb.move(ann, "STAND")).toEqual({ ok: true });
    expect(await cb.move(bob, "STAND")).toEqual({ ok: true });
    await sleep(40); // the round ends in memory; nothing is saved
    expect(await roundsSaved()).toBe(0);
    expect(await cb.sit({ userId: await makePlayer(m.pool, "CAROL"), name: "CAROL" })).toEqual({ ok: false, error: "This table is closing" });
    await balanced();
  });

  it("onTable counts the stake in play, 0 between rounds", async () => {
    // ANN 6 5 = 11, dealer 10 7; the double draws 9 = 20.
    const cb = table("6♠ 10♦ 5♥ 7♣ 9♠");
    const [ann] = await seated(cb, ["ANN"]);
    expect(cb.onTable(ann)).toBe(0);
    expect(cb.onTable("00000000-0000-4000-8000-000000000009")).toBeNull();
    expect(cb.table.bet(0, 100)).toEqual({ ok: true });
    expect(cb.onTable(ann)).toBe(0); // placed, not moved
    expect(cb.table.ready(0)).toEqual({ ok: true });
    await until(() => phase(cb) === PHASES.TURNS);
    expect(cb.onTable(ann)).toBe(100);
    expect(await cb.move(ann, "DOUBLE")).toEqual({ ok: true });
    expect(cb.onTable(ann)).toBe(200);
    // CLAIM counts what's in play: 800 in the balance and 200 bet is 1000.
    await m.pool.query("update credit_accounts set last_claim_at = now() - interval '25 hours'");
    await expect(A.claim(ann, cb.onTable(ann))).rejects.toThrow("nothing to claim");
    await nextWindow(cb, 1);
    expect(cb.onTable(ann)).toBe(0);
    await balanced();
  });

  it("sitting again while seated keeps the seat; an unlinked account is refused", async () => {
    const cb = table("10♠ 10♦ 9♥ 8♣");
    const [ann] = await seated(cb, ["ANN"]);
    expect(await cb.sit({ userId: ann, name: "ANN #0001" })).toEqual({ ok: true, seat: 0 });
    const emma = await makePlayer(m.pool, "EMMA", { linked: false });
    expect(await cb.sit({ userId: emma, name: "EMMA" })).toEqual({ ok: false, error: "Link Google or Discord on your profile to play for credits" });
    expect(cb.table.state.seats[1]).toBeNull();
  });

  it("a refused seat that left during the deal is stood up and its row deleted", async () => {
    const real = await import("../../credits/accounts.js");
    let open_;
    const gate = new Promise((r) => (open_ = r));
    let waiting = false;
    let bob;
    const store = {
      ...real,
      stakeBlackjack: async (id, args) => {
        if (id === bob) {
          waiting = true;
          await gate;
        }
        return real.stakeBlackjack(id, args);
      },
    };
    const refused = [];
    const cb = table("10♠ 10♦ 9♥ 8♣", { store, onRefused: (key) => refused.push(key) });
    let ann;
    [ann, bob] = await seated(cb, ["ANN", "BOB"]);
    await spend(bob, 990, ann);
    expect(cb.table.bet(0, 100)).toEqual({ ok: true });
    expect(cb.table.bet(1, 100)).toEqual({ ok: true });
    cb.table.ready(0);
    cb.table.ready(1);
    await until(() => waiting);
    cb.table.standUp(1); // the server's disconnect path can stand a seat up mid-deal
    const left = cb.leave(bob);
    open_();
    await left;
    expect(refused).toEqual([bob]);
    await until(() => cb.table.state.seats[1] === null);
    expect(await seatRow(bob)).toBeNull();
    expect(await balance(bob)).toBe(10);
    expect(await cb.move(ann, "STAND")).toEqual({ ok: true });
    await nextWindow(cb, 1);
    expect(await balance(ann)).toBe(1100);
    await balanced();
  });

  it("a seat that left before its bet moved is refused, and its seat empties before the round ends", async () => {
    const refused = [];
    const cb = table("10♠ 10♦ 9♥ 8♣", { onRefused: (key, error) => refused.push([key, error]) });
    const [ann, bob] = await seated(cb, ["ANN", "BOB"]);
    let open_;
    const busy = new Promise((r) => (open_ = r));
    cb.enqueue(() => busy); // the queue is busy
    const left = cb.leave(bob); // waits behind it
    cb.table.bet(0, 100);
    cb.table.bet(1, 100);
    cb.table.ready(0);
    cb.table.ready(1); // betting closes; the bets wait behind the leave
    open_();
    await left;
    await until(() => cb.table.state.seats[1] === null);
    expect(phase(cb)).toBe(PHASES.TURNS); // ANN is still playing
    expect(refused).toEqual([[bob, "You're not at this table"]]);
    expect(await seatRow(bob)).toBeNull();
    expect(await balance(bob)).toBe(1000);
    expect(await cb.move(ann, "STAND")).toEqual({ ok: true });
    await nextWindow(cb, 1);
    expect(await balance(ann)).toBe(1100);
    await balanced();
  });

  it("a stake the database briefly can't take is tried again, never refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const real = await import("../../credits/accounts.js");
    let failures = 2;
    const store = { ...real, stakeBlackjack: (id, args) => (failures-- > 0 ? Promise.reject(new Error("db down")) : real.stakeBlackjack(id, args)) };
    const refused = [];
    const cb = table("10♠ 10♦ 9♥ 8♣", { store, onRefused: (key) => refused.push(key) });
    const [ann] = await seated(cb, ["ANN"]);
    await betAll(cb, [[ann, 100]]);
    expect(phase(cb)).toBe(PHASES.TURNS);
    expect(refused).toEqual([]);
    expect(await bets(ann)).toEqual([-100]);
    await balanced();
  });

  it("a funded DOUBLE the table can no longer take is given back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const real = await import("../../credits/accounts.js");
    let open_;
    const gate = new Promise((r) => (open_ = r));
    let doubling = false;
    const store = {
      ...real,
      stakeBlackjack: async (id, args) => {
        const res = await real.stakeBlackjack(id, args);
        if (doubling) await gate; // moved; the reply is slow
        return res;
      },
    };
    const cb = table("6♠ 10♦ 5♥ 7♣ 9♠", { store });
    const [ann] = await seated(cb, ["ANN"]);
    await betAll(cb, [[ann, 100]]);
    doubling = true;
    const move = cb.move(ann, "DOUBLE");
    await until(async () => (await bets(ann)).length === 2);
    cb.table.destroy(); // the table goes away while the double is funding
    open_();
    expect(await move).toEqual({ ok: false, error: "The table closed" });
    expect(await balance(ann)).toBe(900);
    expect((await seatRow(ann)).stack).toBe(100);
    expect(cb.onTable(ann)).toBe(100);
    await balanced();
  });

  it("a table whose rounds keep disagreeing with the database closes, every stake home", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const real = await import("../../credits/accounts.js");
    const store = { ...real, settleBlackjackRound: async () => Promise.reject(new CreditMismatch("bets don't match")) };
    const onClosed = vi.fn();
    const cb = table("10♠ 10♦ 9♥ 8♣", { store, onClosed });
    const [ann] = await seated(cb, ["ANN"]);
    await betAll(cb, [[ann, 100]]);
    let paid = false;
    cb.leave(ann).then(() => (paid = true));
    await until(() => onClosed.mock.calls.length > 0);
    await until(() => paid);
    expect(await balance(ann)).toBe(1000);
    expect(await seatRow(ann)).toBeNull();
    expect(await roundsSaved()).toBe(0);
    await balanced();
  });
});
