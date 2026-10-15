import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { TEST_DATABASE_URL, loadDb, truncateAll, makePlayer } from "./setup.js";

const T1 = "00000000-0000-4000-8000-000000000001";

describe.skipIf(!TEST_DATABASE_URL)("admin (Postgres)", () => {
  let m;
  let A;
  let app;
  let admin;
  let ann;
  let bob;
  const standUp = vi.fn(async () => {});
  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    m = await loadDb();
    A = await import("../../credits/accounts.js");
    const { adminRouter } = await import("../../credits/admin.js");
    app = express().use("/api/admin", adminRouter({ standUp }));
  });
  beforeEach(async () => {
    await truncateAll(m.pool);
    standUp.mockClear();
    admin = await makePlayer(m.pool, "BOSS");
    ann = await makePlayer(m.pool, "ANN");
    bob = await makePlayer(m.pool, "BOB");
    process.env.ADMIN_USER_IDS = `${admin}, someone-else`;
  });
  afterAll(() => m?.pool.end());

  const as = (id) => ({ Authorization: `Bearer ${m.signToken({ id, email: "x@test.dev" })}` });
  const balance = async (id) => Number((await m.pool.query("select balance from credit_accounts where user_id = $1", [id])).rows[0].balance);
  const kinds = async (id) => (await m.pool.query("select kind, amount::int, note from credit_ledger where user_id = $1 order by id", [id])).rows;
  /** ANN loses `n` hands of 300 to BOB, an hour ago. */
  async function dumping(n, at = "now() - interval '1 hour'") {
    for (let i = 1; i <= n; i++) {
      const seats = [
        { seat: 0, user_id: ann, net: -300, stack_before: 1000, committed: 600, folded_street: "TURN", hole: ["7♣", "2♦"] },
        { seat: 1, user_id: bob, net: 300, stack_before: 1000, committed: 300, folded_street: null, hole: ["A♠", "A♦"] },
      ];
      await m.pool.query(
        `insert into credit_hands (table_id, tier, hand_number, is_private, seats, events, played_at) values ($1, 'LOW', $2, true, $3, '[]', ${at})`,
        [T1, Math.floor(Math.random() * 1e9), JSON.stringify(seats)],
      );
    }
  }

  it("is a 404 for guests and players who aren't admins", async () => {
    expect((await request(app).get("/api/admin/check")).status).toBe(404);
    expect((await request(app).get("/api/admin/check").set(as(ann))).status).toBe(404);
    const ok = await request(app).get("/api/admin/check").set(as(admin));
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
  });

  it("lists a flagged pair with names and clues, and shows their hands with hole cards", async () => {
    await A.me(ann);
    await dumping(4);
    const flags = (await request(app).get("/api/admin/flags").set(as(admin))).body;
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ loser: ann, winner: bob, loserName: "ANN #0001", winnerName: "BOB #0001", flow: 1200, hands: 4, privateHands: 4, bigFolds: 4, loserClaims: 0 });
    const pair = (await request(app).get(`/api/admin/pairs/${ann}/${bob}`).set(as(admin))).body;
    expect(pair.hands).toHaveLength(4);
    expect(pair.hands[0].seats.map((s) => [s.name, s.hole.join(" ")])).toEqual([["ANN #0001", "7♣ 2♦"], ["BOB #0001", "A♠ A♦"]]);
    expect(pair.accounts.map((a) => a.name)).toEqual(["ANN #0001", "BOB #0001"]);
  });

  it("RETURN moves credits back after standing the receiver up, never below zero", async () => {
    await A.me(ann);
    await A.me(bob);
    const res = await request(app).post("/api/admin/reverse").set(as(admin)).send({ from: bob, to: ann, amount: 1500, note: "dumped from an alt" });
    expect(res.body).toEqual({ recovered: 1000, requested: 1500 });
    expect(standUp).toHaveBeenCalledWith(bob, "admin");
    expect([await balance(bob), await balance(ann)]).toEqual([0, 2000]);
    expect((await kinds(bob)).at(-1)).toEqual({ kind: "admin_return_out", amount: -1000, note: "dumped from an alt" });
    expect((await kinds(ann)).at(-1)).toEqual({ kind: "admin_return_in", amount: 1000, note: "dumped from an alt" });
    expect((await request(app).get("/api/admin/check").set(as(admin))).body.ok).toBe(true);
  });

  it("REMOVE takes credits out of the economy, and the check still balances", async () => {
    await A.me(bob);
    await request(app).post("/api/admin/reverse").set(as(admin)).send({ from: bob, amount: 400, note: "alt farm" });
    expect(await balance(bob)).toBe(600);
    const check = (await request(app).get("/api/admin/check").set(as(admin))).body;
    expect(check).toMatchObject({ removed: 400, ok: true });
  });

  it("every action needs a note and real players", async () => {
    const noNote = await request(app).post("/api/admin/reverse").set(as(admin)).send({ from: bob, to: ann, amount: 10 });
    expect(noNote.status).toBe(400);
    expect(noNote.body.error).toBe("Write a note");
    const badId = await request(app).post("/api/admin/freeze").set(as(admin)).send({ userId: "nope", frozen: true, note: "x" });
    expect(badId.body.error).toBe("Pick a player");
    const badAmount = await request(app).post("/api/admin/reverse").set(as(admin)).send({ from: bob, amount: "10", note: "x" });
    expect(badAmount.body.error).toBe("Pick an amount");
  });

  it("FREEZE stands the player up and stops claims; UNFREEZE lifts it", async () => {
    await request(app).post("/api/admin/freeze").set(as(admin)).send({ userId: bob, frozen: true, note: "review" });
    expect(standUp).toHaveBeenCalledWith(bob, "frozen");
    expect((await A.me(bob)).claim).toEqual({ state: "frozen" });
    await request(app).post("/api/admin/freeze").set(as(admin)).send({ userId: bob, frozen: false, note: "cleared" });
    expect((await A.me(bob)).canPlay).toBe(true);
    expect((await kinds(bob)).map((r) => r.kind)).toEqual(["grant", "freeze", "unfreeze"]);
  });

  it("DISMISS hides a flag until new credits flow between the pair", async () => {
    await A.me(ann);
    await dumping(4);
    await request(app).post("/api/admin/dismiss").set(as(admin)).send({ loserId: ann, winnerId: bob, note: "brothers, checked" });
    expect((await request(app).get("/api/admin/flags").set(as(admin))).body).toEqual([]);
    await dumping(1, "now() + interval '1 minute'");
    expect((await request(app).get("/api/admin/flags").set(as(admin))).body).toHaveLength(1);
  });

  it("looks an account up by NAME#TAG with its ledger", async () => {
    await A.buyIn(ann, { tableId: T1, tableName: "Felt", tier: "LOW", amount: 300 });
    const res = await request(app).get("/api/admin/accounts").query({ q: "ann#0001" }).set(as(admin));
    expect(res.body).toMatchObject({ name: "ANN #0001", balance: 700, frozen: false, seat: { tableName: "Felt", tier: "LOW", onTable: 300 } });
    expect(res.body.ledger.map((r) => r.kind)).toEqual(["buy_in", "grant"]);
    expect((await request(app).get("/api/admin/accounts").query({ q: "nobody" }).set(as(admin))).body.error).toBe("Search as NAME#TAG");
  });
});
