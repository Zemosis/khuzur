import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { TEST_DATABASE_URL, loadDb, truncateAll, makeUser } from "./setup.js";

const painting = (color = "#f4c430") => ({ v: 3, pixels: Array(17 * 17).fill(color) });

describe.skipIf(!TEST_DATABASE_URL)("shop (Postgres)", () => {
  let m;
  let app;
  let shop;
  beforeAll(async () => {
    m = await loadDb();
    shop = await import("../../shop.js");
    app = express().use("/api/auth", m.authRouter).use("/api/shop", shop.shopRouter());
  });
  beforeEach(() => truncateAll(m.pool));
  afterAll(() => m?.pool.end());

  const player = async (profile = {}) => {
    const p = await makeUser(m.pool, `p${Math.random()}@test.dev`, { username: "BUYER", tag: "0001", ...profile });
    return { id: p.id, auth: { Authorization: `Bearer ${m.signToken({ id: p.id, email: "x" })}` } };
  };
  const buy = (who, itemId) => request(app).post("/api/shop/buy").set(who.auth).send({ itemId });
  const patch = (who, body) => request(app).patch("/api/auth/profile").set(who.auth).send(body);
  const purchases = async (id) =>
    (await m.pool.query("select item_id, price, gold_after from shop_purchases where user_id = $1 order by id", [id])).rows;

  describe("buying", () => {
    it("takes the gold, adds the slot and records the purchase", async () => {
      const who = await player({ coins: 2000 });
      const res = await buy(who, "avatar_slot_2");
      expect(res.status).toBe(200);
      expect(res.body.profile).toMatchObject({ coins: 500, avatar_slots: 2 });
      expect(await purchases(who.id)).toEqual([{ item_id: "avatar_slot_2", price: 1500, gold_after: 500 }]);
    });

    it("refuses without enough gold, and changes nothing", async () => {
      const who = await player({ coins: 1499 });
      const res = await buy(who, "avatar_slot_2");
      expect(res.status).toBe(402);
      expect(res.body.error).toBe("Not enough gold");
      const { rows } = await m.pool.query("select coins, avatar_slots from profiles where id = $1", [who.id]);
      expect(rows[0]).toEqual({ coins: 1499, avatar_slots: 1 });
      expect(await purchases(who.id)).toEqual([]);
    });

    it("sells slot 3 only after slot 2", async () => {
      const who = await player({ coins: 10_000 });
      const early = await buy(who, "avatar_slot_3");
      expect(early.status).toBe(409);
      expect(early.body.error).toBe("Buy Avatar slot 2 first");
      await buy(who, "avatar_slot_2");
      const res = await buy(who, "avatar_slot_3");
      expect(res.body.profile).toMatchObject({ coins: 5500, avatar_slots: 3 });
    });

    it("won't sell the same item twice", async () => {
      const who = await player({ coins: 10_000 });
      await buy(who, "avatar_slot_2");
      const res = await buy(who, "avatar_slot_2");
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("You already own that");
    });

    it("two purchases at once can't spend the same gold", async () => {
      const who = await player({ coins: 1500 });
      const results = await Promise.all([shop.buyItem(who.id, "avatar_slot_2"), shop.buyItem(who.id, "avatar_slot_2")]);
      expect(results.filter((r) => r.profile)).toHaveLength(1);
      const { rows } = await m.pool.query("select coins from profiles where id = $1", [who.id]);
      expect(rows[0].coins).toBe(0);
    });

    it("404s for unknown items and items that aren't on sale yet", async () => {
      const who = await player({ coins: 10_000 });
      expect((await buy(who, "golden_border")).status).toBe(404);
      expect((await buy(who, "")).status).toBe(404);
    });

    it("needs a signed-in player", async () => {
      const res = await request(app).post("/api/shop/buy").send({ itemId: "avatar_slot_2" });
      expect(res.status).toBe(401);
    });
  });

  describe("avatar slots on the profile", () => {
    it("paints and wears a bought slot", async () => {
      const who = await player({ coins: 1500 });
      await buy(who, "avatar_slot_2");
      const res = await patch(who, { extra_avatars: [painting("#ff0000")], avatar: "custom", custom_slot: 2 });
      expect(res.status).toBe(200);
      expect(res.body.profile).toMatchObject({ avatar: "custom", custom_slot: 2 });
      expect(res.body.profile.extra_avatars[0].pixels[0]).toBe("#ff0000");
    });

    it("refuses a painting in a slot the player doesn't own", async () => {
      const who = await player();
      const res = await patch(who, { extra_avatars: [painting()] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("You don't have that many avatar slots");
    });

    it("refuses to wear a slot that isn't owned, or isn't painted", async () => {
      const who = await player({ coins: 1500 });
      expect((await patch(who, { avatar: "custom", custom_slot: 2 })).body.error).toBe("You don't have that avatar slot");
      await buy(who, "avatar_slot_2");
      expect((await patch(who, { avatar: "custom", custom_slot: 2 })).body.error).toBe("Paint that avatar slot first");
    });

    it("refuses a malformed painting", async () => {
      const who = await player({ coins: 1500 });
      await buy(who, "avatar_slot_2");
      const res = await patch(who, { extra_avatars: [{ v: 3, pixels: [] }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid avatar");
    });

    it("seats a player with the slot they wear", async () => {
      const who = await player({
        coins: 1500,
        avatar: "custom",
        custom_avatar: JSON.stringify(painting("#000000")),
      });
      await buy(who, "avatar_slot_2");
      const token = m.signToken({ id: who.id, email: "x" });
      expect((await m.socketIdentity({ token })).avatar.custom.pixels[0]).toBe("#000000");
      await patch(who, { extra_avatars: [painting("#ffffff")], custom_slot: 2 });
      expect((await m.socketIdentity({ token })).avatar).toMatchObject({ variant: "custom", custom: { pixels: expect.arrayContaining(["#ffffff"]) } });
    });
  });
});
