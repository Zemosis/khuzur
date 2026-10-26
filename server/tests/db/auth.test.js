import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { TEST_DATABASE_URL, loadDb, truncateAll } from "./setup.js";

describe.skipIf(!TEST_DATABASE_URL)("accounts API (Postgres)", () => {
  let m;
  let app;
  beforeAll(async () => {
    m = await loadDb();
    app = express().use("/api/auth", m.authRouter);
  });
  beforeEach(() => truncateAll(m.pool));
  afterAll(() => m?.pool.end());

  const signup = (email = "player@test.dev", password = "secret1") =>
    request(app).post("/api/auth/signup").send({ email, password });
  const bearer = (token) => ({ Authorization: `Bearer ${token}` });

  describe("signup", () => {
    it("creates a user with a default profile and a working token", async () => {
      const res = await signup();
      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe("player@test.dev");
      expect(res.body.profile).toMatchObject({ coins: 0, level: 1, avatar: "1" });
      expect(m.verifyToken(res.body.token)).toEqual({ id: res.body.user.id, email: "player@test.dev" });
    });

    it.each([
      ["a bad email", "not-an-email", "secret1", 400, "Enter a valid email"],
      ["a short password", "a@b.co", "12345", 400, "Password must be at least 6 characters"],
      ["a missing body", undefined, undefined, 400, "Enter a valid email"],
    ])("rejects %s", async (_label, email, password, status, error) => {
      const res = await request(app).post("/api/auth/signup").send(email ? { email, password } : undefined);
      expect(res.status).toBe(status);
      expect(res.body.error).toBe(error);
    });

    it("rejects a duplicate email, case-insensitively", async () => {
      await signup("Dup@Test.dev");
      const res = await signup("dup@test.dev");
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("Email already registered");
    });
  });

  describe("login", () => {
    beforeEach(() => signup("login@test.dev", "hunter22"));

    it("returns a token and the profile", async () => {
      const res = await request(app).post("/api/auth/login").send({ email: "LOGIN@test.dev", password: "hunter22" });
      expect(res.status).toBe(200);
      expect(m.verifyToken(res.body.token)?.email).toBe("login@test.dev");
      expect(res.body.profile).not.toHaveProperty("rating");
    });

    it.each([
      ["a wrong password", "login@test.dev", "nope123"],
      ["an unknown email", "ghost@test.dev", "hunter22"],
    ])("401 for %s", async (_label, email, password) => {
      const res = await request(app).post("/api/auth/login").send({ email, password });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid email or password");
    });
  });

  describe("signed-in routes", () => {
    let token;
    beforeEach(async () => {
      token = (await signup()).body.token;
    });

    it.each(["/api/auth/me", "/api/auth/stats"])("%s needs a valid token", async (route) => {
      expect((await request(app).get(route)).status).toBe(401);
      expect((await request(app).get(route).set(bearer("garbage"))).status).toBe(401);
    });

    it("/me returns the profile, and 401 once the account is gone", async () => {
      const res = await request(app).get("/api/auth/me").set(bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe("player@test.dev");
      await truncateAll(m.pool);
      const gone = await request(app).get("/api/auth/me").set(bearer(token));
      expect(gone.status).toBe(401);
      expect(gone.body.error).toBe("Account no longer exists");
    });

    it("/stats answers with every game filter at zero for a new player", async () => {
      const res = await request(app).get("/api/auth/stats").set(bearer(token));
      expect(res.status).toBe(200);
      for (const view of ["overall", "thirteen", "muushig"]) {
        expect(res.body[view]).toMatchObject({ games: 0, placements: [], recent: [] });
      }
    });

    it("PATCH /profile saves editable fields and ignores the rest", async () => {
      const res = await request(app)
        .patch("/api/auth/profile")
        .set(bearer(token))
        .send({ username: "ZEMO", tag: "AB12", avatar: "3", coins: 999999 });
      expect(res.status).toBe(200);
      expect(res.body.profile).toMatchObject({ username: "ZEMO", tag: "AB12", avatar: "3", coins: 0 });
    });

    it("PATCH /profile with nothing editable returns the profile unchanged", async () => {
      const res = await request(app).patch("/api/auth/profile").set(bearer(token)).send({ wins: 50 });
      expect(res.status).toBe(200);
      expect(res.body.profile.wins).toBe(0);
    });

    it.each([
      ["a long name", { username: "TOOLONGNAME" }, "Name must be 1–6 characters"],
      ["a bad tag", { tag: "ab!" }, "Tag must be 4 letters or digits"],
      ["9 saved colors", { custom_colors: Array(9).fill("#fff") }, "Too many saved colors"],
      ["a malformed avatar", { custom_avatar: { v: "1" } }, "Invalid profile data"],
      ["an old 16×16 avatar", { custom_avatar: { v: 2, pixels: Array(256).fill(null) } }, "Invalid profile data"],
      ["a v3 avatar of the wrong size", { custom_avatar: { v: 3, pixels: Array(256).fill(null) } }, "Invalid profile data"],
    ])("PATCH /profile rejects %s", async (_, body, error) => {
      const res = await request(app).patch("/api/auth/profile").set(bearer(token)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(error);
    });

    it("PATCH /profile saves a 17×17 painted avatar", async () => {
      const custom_avatar = { v: 3, pixels: Array.from({ length: 289 }, (_, i) => (i === 8 ? "#ff0000" : null)) };
      const res = await request(app).patch("/api/auth/profile").set(bearer(token)).send({ avatar: "custom", custom_avatar });
      expect(res.status).toBe(200);
      expect(res.body.profile.custom_avatar).toEqual(custom_avatar);
    });

    it("migration 006 turns saved 16×16 avatars into 17×17, blank-padded right and bottom", async () => {
      const fs = await import("node:fs/promises");
      const sql = await fs.readFile(new URL("../../db/migrations/006_avatar_17x17.sql", import.meta.url), "utf8");
      const me = (await request(app).get("/api/auth/me").set(bearer(token))).body.user.id;
      // A row as it was saved before: let it in under the old rule, then migrate.
      await m.pool.query("alter table profiles drop constraint profiles_custom_avatar_shape");
      const old = Array.from({ length: 256 }, (_, i) => (i % 16 === 15 ? "#00ff00" : "#0000ff"));
      await m.pool.query("update profiles set custom_avatar = $1 where id = $2", [JSON.stringify({ v: 2, pixels: old }), me]);
      await m.pool.query(sql);
      const {
        rows: [{ custom_avatar }],
      } = await m.pool.query("select custom_avatar from profiles where id = $1", [me]);
      expect(custom_avatar.v).toBe(3);
      expect(custom_avatar.pixels).toHaveLength(289);
      expect(custom_avatar.pixels.slice(0, 17)).toEqual([...Array(15).fill("#0000ff"), "#00ff00", null]);
      expect(custom_avatar.pixels.slice(16 * 17)).toEqual(Array(17).fill(null));
    });

    it("name#tag must be unique", async () => {
      await request(app).patch("/api/auth/profile").set(bearer(token)).send({ username: "ZEMO", tag: "AB12" });
      const other = (await signup("other@test.dev")).body.token;
      const res = await request(app).patch("/api/auth/profile").set(bearer(other)).send({ username: "zemo", tag: "AB12" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("That name#tag is already taken");
    });
  });

  describe("socket identity", () => {
    it("a signed-in player is named by their profile, not by what the browser sends", async () => {
      // The browser may connect before the profile loads, still holding its
      // stand-in guest name: the table must still show the real one.
      const { body } = await signup();
      await request(app).patch("/api/auth/profile").set(bearer(body.token)).send({ username: "ZEHTA", tag: "Z123", avatar: "4" });
      const who = await m.socketIdentity({ token: body.token, name: "FLINT", tag: "AB12", avatar: "2" });
      expect(who).toEqual({ userId: body.user.id, name: "ZEHTA", tag: "Z123", avatar: { variant: "4", custom: null }, level: 1 });
    });

    it("before profile setup, a signed-in player keeps the name they sent", async () => {
      const { body } = await signup();
      const who = await m.socketIdentity({ token: body.token, name: "FLINT", tag: "AB12" });
      expect(who).toMatchObject({ userId: body.user.id, name: "FLINT", tag: "AB12" });
    });

    it("a guest is named by what they send, trimmed to size", async () => {
      expect(await m.socketIdentity({ name: "WAYTOOLONGNAME", tag: "123456", avatar: "3" })).toEqual({
        userId: null,
        name: "WAYTOOLONGNA",
        tag: "1234",
        avatar: { variant: "3", custom: null },
        level: null, // guests have no level
      });
      expect(await m.socketIdentity({ token: "garbage" })).toMatchObject({ userId: null, name: "PLAYER", tag: "0000" });
    });
  });

  it("verifyToken rejects missing, garbage and foreign-signed tokens", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    expect(m.verifyToken(undefined)).toBeNull();
    expect(m.verifyToken("x.y.z")).toBeNull();
    expect(m.verifyToken(jwt.sign({ sub: "u", email: "e" }, "someone-else"))).toBeNull();
  });
});
