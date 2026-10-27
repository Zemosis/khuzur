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
// A link ticket lives as long as the trip to Google or Discord and back may take.
const LINK_TTL = "10m";

if (pool && !JWT_SECRET) {
  throw new Error("JWT_SECRET must be set when DATABASE_URL is configured");
}

// The only profile columns a client may write. Coins, exp, level, wins and
// games_played are awarded by the game server alone.
const EDITABLE_PROFILE_FIELDS = ["username", "tag", "avatar", "custom_avatar", "custom_colors", "extra_avatars", "custom_slot"];
// Columns sent as JSON.
const JSON_PROFILE_FIELDS = new Set(["custom_avatar", "extra_avatars"]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PRESET_AVATARS = new Set(["1", "2", "3", "4", "5"]);

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/**
 * A short-lived ticket naming this account, for linking a Google or Discord
 * login to it (oauth.js). The browser fetches it while signed in and carries
 * it through the provider's sign-in; it is not a session token.
 */
export function signLinkTicket(userId) {
  return jwt.sign({ sub: userId, purpose: "link" }, JWT_SECRET, { expiresIn: LINK_TTL });
}

/** The account a link ticket names, or null if it's bad or expired. */
export function verifyLinkTicket(ticket) {
  if (!JWT_SECRET || !ticket) return null;
  try {
    const payload = jwt.verify(ticket, JWT_SECRET);
    return payload.purpose === "link" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Returns { id, email } for a valid token, or null for guests/invalid tokens. */
export function verifyToken(token) {
  if (!JWT_SECRET || !token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.purpose) return null; // a link ticket doesn't sign anyone in
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

/** The painted avatar a profile row wears when its avatar is 'custom', or null. */
function wornPainting(row) {
  if (row?.avatar !== "custom") return null;
  return (row.custom_slot > 1 ? row.extra_avatars?.[row.custom_slot - 2] : row.custom_avatar) ?? null;
}

const isPainting = (a) => a != null && Number(a.v) === 3 && Array.isArray(a.pixels) && a.pixels.length === 17 * 17;

/**
 * Checks a profile update's painted-avatar slots (extra_avatars, custom_slot)
 * against the slots the player owns. Returns a message, or null if it's fine.
 */
async function avatarSlotsError(userId, body) {
  if (!("extra_avatars" in body) && !("custom_slot" in body)) return null;
  const current = await getProfile(userId);
  const extras = "extra_avatars" in body ? body.extra_avatars : current.extra_avatars;
  if (!Array.isArray(extras) || !extras.every((a) => a === null || isPainting(a))) return "Invalid avatar";
  if (extras.length > current.avatar_slots - 1) return "You don't have that many avatar slots";
  if ("custom_slot" in body) {
    const slot = body.custom_slot;
    if (!Number.isInteger(slot) || slot < 1 || slot > current.avatar_slots) return "You don't have that avatar slot";
    const painted = slot === 1 ? ("custom_avatar" in body ? body.custom_avatar : current.custom_avatar) : extras[slot - 2];
    if (!painted) return "Paint that avatar slot first";
  }
  return null;
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
    if (err.constraint === "profiles_extra_avatars_shape") return "You don't have that many avatar slots";
    if (err.constraint === "profiles_custom_slot_range") return "You don't have that avatar slot";
    return "Invalid profile data";
  }
  return null;
}

/**
 * Who a socket is, from its handshake { token, name, tag, avatar }: returns
 * { userId, name, tag, avatar, level } with avatar as { variant, custom } and
 * level the account's (null for guests).
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
      } = await pool.query(
        "select username, tag, avatar, custom_avatar, extra_avatars, custom_slot, level from profiles where id = $1",
        [user.id],
      ));
    } catch (err) {
      console.error("[auth] profile lookup failed:", err.message);
    }
  }
  const custom = wornPainting(row);
  const preset = String(avatar ?? "");
  return {
    userId: user?.id || null,
    name: String(row?.username || name || "PLAYER").slice(0, 12),
    tag: String((row?.username && row.tag) || tag || "0000").slice(0, 4),
    avatar: row
      ? { variant: custom ? "custom" : row.avatar, custom }
      : { variant: PRESET_AVATARS.has(preset) ? preset : "1", custom: null },
    level: row?.level ?? null,
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

// The ways this account signs in: { password, providers: ["google", ...] }.
async function loginsOf(db, userId) {
  const {
    rows: [row],
  } = await db.query(
    `select u.password_hash is not null as password,
            coalesce(array_agg(o.provider order by o.provider) filter (where o.provider is not null), '{}') as providers
       from users u left join oauth_identities o on o.user_id = u.id
      where u.id = $1
      group by u.id`,
    [userId],
  );
  return row ?? { password: false, providers: [] };
}

authRouter.get("/logins", requireUser, async (req, res) => {
  res.json(await loginsOf(pool, req.user.id));
});

// A ticket for linking Google or Discord to this account: the site sends the
// player to /oauth/:provider?link=<ticket> with it.
authRouter.post("/link-ticket", requireUser, (req, res) => {
  res.json({ ticket: signLinkTicket(req.user.id) });
});

// Unlinks a provider, as long as the account keeps another way to sign in.
authRouter.delete("/logins/:provider", requireUser, async (req, res) => {
  const provider = String(req.params.provider);
  const result = await withTransaction(async (client) => {
    await client.query("select 1 from users where id = $1 for update", [req.user.id]);
    const logins = await loginsOf(client, req.user.id);
    if (!logins.providers.includes(provider)) return { status: 404, error: "That login isn't linked" };
    if (!logins.password && logins.providers.length === 1) {
      return { status: 400, error: "It's your only way to sign in. Link another one first" };
    }
    await client.query("delete from oauth_identities where user_id = $1 and provider = $2", [req.user.id, provider]);
    return { logins: await loginsOf(client, req.user.id) };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.logins);
});

authRouter.patch("/profile", requireUser, async (req, res) => {
  const updates = Object.entries(req.body || {}).filter(([key]) =>
    EDITABLE_PROFILE_FIELDS.includes(key),
  );
  if (!updates.length) return res.json({ profile: await getProfile(req.user.id) });
  const slotsError = await avatarSlotsError(req.user.id, Object.fromEntries(updates));
  if (slotsError) return res.status(400).json({ error: slotsError });

  const sets = updates.map(([key], i) => `${key} = $${i + 2}`).join(", ");
  const values = updates.map(([key, value]) =>
    JSON_PROFILE_FIELDS.has(key) && value != null ? JSON.stringify(value) : value,
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
