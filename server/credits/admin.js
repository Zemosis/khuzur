// ADMIN — /api/admin: the economy check, flagged pairs, a pair's hands, an
// account's ledger, and RETURN / REMOVE / FREEZE / DISMISS. Only user ids in
// ADMIN_USER_IDS get in; to anyone else it doesn't exist.

import express from "express";
import { requireDb, verifyToken } from "../auth.js";
import * as accounts from "./accounts.js";
import { economyCheck } from "./check.js";
import { accountLookup, flaggedPairs, pairDetail } from "./flags.js";
import { CreditError } from "./rules.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const admins = () => new Set((process.env.ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean));

function requireAdmin(req, res, next) {
  const user = verifyToken((req.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  if (!user || !admins().has(user.id)) return res.status(404).json({ error: "Not found" });
  req.user = user;
  next();
}

const noteOf = (body) => {
  const note = String(body?.note ?? "").trim().slice(0, 300);
  if (!note) throw new CreditError("Write a note");
  return note;
};
const idOf = (v) => {
  if (typeof v !== "string" || !UUID.test(v)) throw new CreditError("Pick a player");
  return v;
};

/** standUp(userId, reason) → resolves once that player is off any credit table with their credits home. */
export function adminRouter({ standUp = async () => {} } = {}) {
  const router = express.Router();
  router.use(requireAdmin, express.json({ limit: "8kb" }), requireDb);
  const handle = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      if (err instanceof CreditError) return res.status(400).json({ error: err.message });
      console.error("[admin]", err);
      res.status(500).json({ error: "Something went wrong" });
    }
  };

  router.get("/check", handle(() => economyCheck()));
  router.get("/flags", handle(() => flaggedPairs()));
  router.get("/pairs/:loser/:winner", handle((req) => pairDetail(idOf(req.params.loser), idOf(req.params.winner))));
  router.get("/accounts", handle((req) => accountLookup(String(req.query.q ?? ""))));
  router.post(
    "/reverse",
    handle(async (req) => {
      const note = noteOf(req.body);
      const fromId = idOf(req.body.from);
      const toId = req.body.to == null ? null : idOf(req.body.to);
      if (!Number.isInteger(req.body.amount) || req.body.amount < 1) throw new CreditError("Pick an amount");
      await standUp(fromId, "admin"); // their stack comes home first, so it can be taken back
      return accounts.reverse({ adminId: req.user.id, fromId, toId, amount: req.body.amount, note });
    }),
  );
  router.post(
    "/freeze",
    handle(async (req) => {
      const note = noteOf(req.body);
      const userId = idOf(req.body.userId);
      const result = await accounts.setFrozen({ adminId: req.user.id, userId, frozen: !!req.body.frozen, note });
      if (result.frozen) await standUp(userId, "frozen");
      return result;
    }),
  );
  router.post(
    "/dismiss",
    handle((req) => accounts.dismissFlag({ adminId: req.user.id, loserId: idOf(req.body.loserId), winnerId: idOf(req.body.winnerId), note: noteOf(req.body) })),
  );
  return router;
}
