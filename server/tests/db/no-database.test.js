// With no DATABASE_URL the server must still run: persistence is a no-op and
// the account routes answer 503 instead of crashing.

import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import request from "supertest";

let persistence;
let db;
let app;

beforeAll(async () => {
  process.env.DATABASE_URL = "";
  delete process.env.JWT_SECRET;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db = await import("../../db/index.js");
  persistence = await import("../../persistence.js");
  const { authRouter } = await import("../../auth.js");
  app = express().use("/api/auth", authRouter);
});

describe("without a database", () => {
  it("has no pool and migrate() does nothing", async () => {
    expect(db.pool).toBeNull();
    await expect(db.migrate()).resolves.toBeUndefined();
  });

  it("recording functions are safe no-ops", async () => {
    await expect(persistence.createSession({ lobbyId: "X" })).resolves.toBeNull();
    await expect(persistence.closeOrphanedSessions()).resolves.toBeUndefined();
    await expect(persistence.finishSession({ sessionId: "abc", roster: [] })).resolves.toEqual([]);
    await expect(persistence.grantProgress("u1", { xp: 4, gold: 3 })).resolves.toBeNull();
  });

  it("account routes answer 503", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.co", password: "secret1" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not available/);
  });
});

