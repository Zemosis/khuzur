// CREDITS ROUTES — /api/credits: your balance and CLAIM, and the leaderboard.

import express from "express";
import { optionalUser, requireDb, requireUser } from "../auth.js";
import * as accounts from "./accounts.js";
import { leaderboard, rankOf } from "./leaderboard.js";
import { CreditError } from "./rules.js";

/**
 * onTableFor(userId): what that player holds at a credit table right now
 * (stack, chips waiting, chips in the pot), or null. rejoinFor(userId): a
 * credit match they can go back to ({ gameType, code, tableName }), or null.
 */
export function creditsRouter({ onTableFor = () => null, rejoinFor = () => null } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: "4kb" }), requireDb);
  const handle = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      if (err instanceof CreditError) return res.status(400).json({ error: err.message });
      console.error("[credits]", err);
      res.status(500).json({ error: "Credits are unavailable right now" });
    }
  };
  const meFor = async (userId) => ({ ...(await accounts.me(userId, onTableFor(userId))), rank: await rankOf(userId), rejoin: rejoinFor(userId) });

  router.get("/me", requireUser, handle((req) => meFor(req.user.id)));
  router.post(
    "/claim",
    requireUser,
    handle(async (req) => {
      await accounts.claim(req.user.id, onTableFor(req.user.id) ?? 0);
      return meFor(req.user.id);
    }),
  );
  router.post(
    "/notice",
    requireUser,
    handle(async (req) => {
      await accounts.dismissNotice(req.user.id);
      return meFor(req.user.id);
    }),
  );
  router.get("/leaderboard", optionalUser, handle((req) => leaderboard(req.user?.id ?? null)));
  return router;
}
