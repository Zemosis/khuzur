// ACCOUNTS — email/password sign-up, JWT sessions, and profile reads/writes.
// Replaces Supabase Auth. Tokens are HS256 JWTs signed with JWT_SECRET; the
// same token authenticates both these HTTP routes and the socket handshake.
// Google and Discord sign-in (oauth.js) end in the same kind of token.

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool, withTransaction } from "./db/index.js";
import { playerStats } from "./stats.js";
import { parseSoloReport } from "./solo.js";
import { recordSoloMatch } from "./persistence.js";

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = "30d";

if (pool && !JWT_SECRET) {
  throw new Error("JWT_SECRET must be set when DATABASE_URL is configured");
}

// The only profile columns a client may write. Coins, exp, level, wins and
// games_played are awarded by the game server alone.
const EDITABLE_PROFILE_FIELDS = ["username", "tag", "avatar", "custom_avatar", "custom_colors"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PRESET_AVATARS = new Set(["1", "2", "3", "4", "5"]);

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Returns { id, email } for a valid token, or null for guests/invalid tokens. */
export function verifyToken(token) {
  if (!JWT_SECRET || !token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function requireUser(req, res, next) {
  const header = req.get("authorization") || "";
  const user = verifyToken(header.replace(/^Bearer\s+/i, ""));
  if (!user) return res.status(401).json({ error: "Not signed in" });
  req.user = user;
  next();
}

/** Like requireUser, but a guest (no token, or a bad one) passes through with req.user unset. */
export function optionalUser(req, _res, next) {
  const user = verifyToken((req.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  if (user) req.user = user;
  next();
}

export function requireDb(_req, res, next) {
  if (!pool) return res.status(503).json({ error: "Accounts are not available on this server" });
  next();
}

async function getProfile(userId) {
  const { rows } = await pool.query("select * from profiles where id = $1", [userId]);
  return rows[0] || null;
}

/** Maps Postgres constraint violations to messages a player can act on. */
function profileError(err) {
  if (err.code === "23505") return "That name#tag is already taken";
  if (err.code === "23514") {
    if (err.constraint === "profiles_username_length") return "Name must be 1–6 characters";
    if (err.constraint === "profiles_tag_format") return "Tag must be 4 letters or digits";
    if (err.constraint === "profiles_custom_colors_limit") return "Too many saved colors";
    return "Invalid profile data";
  }
  return null;
}

/**
 * Who a socket is, from its handshake { token, name, tag, avatar }: returns
 * { userId, name, tag, avatar } with avatar as { variant, custom }.
 * A signed-in player is named and drawn from their profile: the browser may
 * connect before its profile has loaded, still sending its stand-in guest
 * name. The handshake's name only counts for guests, and for signed-in players
 * who haven't picked a name yet.
 */
export async function socketIdentity({ token, name, tag, avatar } = {}) {
  const user = verifyToken(token);
  let row = null;
  if (user && pool) {
    try {
      ({
        rows: [row],
      } = await pool.query("select username, tag, avatar, custom_avatar from profiles where id = $1", [user.id]));
    } catch (err) {
      console.error("[auth] profile lookup failed:", err.message);
    }
  }
  const custom = row?.avatar === "custom" ? row.custom_avatar : null;
  const preset = String(avatar ?? "");
  return {
    userId: user?.id || null,
    name: String(row?.username || name || "PLAYER").slice(0, 12),
    tag: String((row?.username && row.tag) || tag || "0000").slice(0, 4),
    avatar: row
      ? { variant: custom ? "custom" : row.avatar, custom }
      : { variant: PRESET_AVATARS.has(preset) ? preset : "1", custom: null },
  };
}

export const authRouter = express.Router();
authRouter.use(express.json({ limit: "32kb" }), requireDb);

authRouter.post("/signup", async (req, res) => {
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email" });
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const { user, profile } = await withTransaction(async (client) => {
      const {
        rows: [user],
      } = await client.query(
        "insert into users (email, password_hash) values ($1, $2) returning id, email",
        [email, passwordHash],
      );
      const {
        rows: [profile],
      } = await client.query("insert into profiles (id) values ($1) returning *", [user.id]);
      return { user, profile };
    });
    res.status(201).json({ token: signToken(user), user, profile });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email already registered" });
    console.error("[auth] signup failed:", err);
    res.status(500).json({ error: "Sign up failed" });
  }
});

authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");

  const {
    rows: [row],
  } = await pool.query(
    "select id, email, password_hash from users where lower(email) = lower($1)",
    [email],
  );
  // Accounts made with Google or Discord have no password.
  if (!row?.password_hash || !(await bcrypt.compare(password, row.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const user = { id: row.id, email: row.email };
  res.json({ token: signToken(user), user, profile: await getProfile(user.id) });
});

authRouter.get("/me", requireUser, async (req, res) => {
  const profile = await getProfile(req.user.id);
  if (!profile) return res.status(401).json({ error: "Account no longer exists" });
  res.json({ user: req.user, profile });
});

// Everything the profile's Stats panel shows, per game filter, in one round
// trip, for ?stakes=all|free|credits (see stats.js).
authRouter.get("/stats", requireUser, async (req, res) => {
  res.json(await playerStats(req.user.id, String(req.query.stakes ?? "all")));
});

// A game played alone against CPUs, reported by the browser when it ends.
// Stats only: see solo.js. A few reports a minute is plenty for real play.
const SOLO_REPORTS_PER_MINUTE = 10;
const soloReports = new Map(); // user id -> recent report times

function tooManySoloReports(userId) {
  const now = Date.now();
  const recent = (soloReports.get(userId) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  soloReports.set(userId, recent);
  return recent.length > SOLO_REPORTS_PER_MINUTE;
}

authRouter.post("/matches", requireUser, async (req, res) => {
  if (tooManySoloReports(req.user.id)) return res.status(429).json({ error: "Too many match reports, slow down" });
  const report = parseSoloReport(req.body);
  if (!report.ok) return res.status(400).json({ error: report.error });
  const result = await recordSoloMatch(req.user.id, report.value);
  res.status(result.recorded ? 201 : 200).json(result);
});

authRouter.patch("/profile", requireUser, async (req, res) => {
  const updates = Object.entries(req.body || {}).filter(([key]) =>
    EDITABLE_PROFILE_FIELDS.includes(key),
  );
  if (!updates.length) return res.json({ profile: await getProfile(req.user.id) });

  const sets = updates.map(([key], i) => `${key} = $${i + 2}`).join(", ");
  const values = updates.map(([key, value]) =>
    key === "custom_avatar" && value != null ? JSON.stringify(value) : value,
  );

  try {
    const { rows } = await pool.query(
      `update profiles set ${sets} where id = $1 returning *`,
      [req.user.id, ...values],
    );
    res.json({ profile: rows[0] });
  } catch (err) {
    const message = profileError(err);
    if (message) return res.status(400).json({ error: message });
    console.error("[auth] profile update failed:", err);
    res.status(500).json({ error: "Profile update failed" });
  }
});
