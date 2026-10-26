// SHOP — /api/shop: spending gold. The catalog and its prices are in
// game/shop.js; docs/gold-economy.md explains them.

import express from "express";
import { withTransaction } from "./db/index.js";
import { requireDb, requireUser } from "./auth.js";
import { cantBuy, shopItem, SHOP_CATEGORIES } from "./game/shop.js";

const REFUSALS = {
  owned: () => "You already own that",
  requires: (item) => `Buy ${shopItem(item.requires).name} first`,
  gold: () => "Not enough gold",
};

/**
 * Buys one item with the player's gold, in one transaction: the profile row is
 * locked, so two purchases at once can't both spend the same gold. Returns
 * { profile } after the purchase, or { error, status } if it can't be bought.
 */
export async function buyItem(userId, itemId) {
  const item = shopItem(itemId);
  if (!item || !SHOP_CATEGORIES.find((c) => c.id === item.category)?.live) {
    return { status: 404, error: "That isn't for sale" };
  }
  return withTransaction(async (client) => {
    const {
      rows: [profile],
    } = await client.query("select coins, avatar_slots from profiles where id = $1 for update", [userId]);
    if (!profile) return { status: 404, error: "No profile" };
    const refusal = cantBuy(profile, item);
    if (refusal) return { status: refusal === "gold" ? 402 : 409, error: REFUSALS[refusal](item) };

    const {
      rows: [after],
    } = await client.query(
      `update profiles
          set coins = coins - $2,
              avatar_slots = greatest(avatar_slots, $3)
        where id = $1
        returning *`,
      [userId, item.price, item.avatarSlot ?? 1],
    );
    await client.query("insert into shop_purchases (user_id, item_id, price, gold_after) values ($1, $2, $3, $4)", [
      userId,
      item.id,
      item.price,
      after.coins,
    ]);
    return { profile: after };
  });
}

export function shopRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "1kb" }), requireDb);

  router.post("/buy", requireUser, async (req, res) => {
    try {
      const result = await buyItem(req.user.id, String(req.body?.itemId ?? ""));
      if (result.error) return res.status(result.status).json({ error: result.error });
      res.json(result);
    } catch (err) {
      console.error("[shop] purchase failed:", err);
      res.status(500).json({ error: "The shop is unavailable right now" });
    }
  });

  return router;
}
