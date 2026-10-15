// Database test wiring. Suites run only when TEST_DATABASE_URL is set (in the
// environment or server/.env) and never touch the dev DATABASE_URL.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
const fromFile = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || fromFile.TEST_DATABASE_URL || "";

/** Points the db pool at the test database, then imports the server modules. */
export async function loadDb() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_SECRET = "db-test-secret";
  const db = await import("../../db/index.js");
  const persistence = await import("../../persistence.js");
  const auth = await import("../../auth.js");
  const oauth = await import("../../oauth.js");
  await db.migrate();
  return { ...db, ...persistence, ...auth, ...oauth };
}

export async function truncateAll(pool) {
  await pool.query("truncate users, game_sessions restart identity cascade");
}

/** A signed-in player: a users row plus its profile. Returns the profile. */
export async function makeUser(pool, email, profile = {}) {
  const {
    rows: [user],
  } = await pool.query("insert into users (email, password_hash) values ($1, 'x') returning id", [email]);
  const cols = ["id", ...Object.keys(profile)];
  const vals = [user.id, ...Object.values(profile)];
  const {
    rows: [row],
  } = await pool.query(
    `insert into profiles (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
    vals,
  );
  return row;
}

/**
 * A signed-in player with a name, and (unless linked: false) a Google login,
 * which credit play needs. Returns the user id.
 */
export async function makePlayer(pool, name, { linked = true } = {}) {
  const p = await makeUser(pool, `${name.toLowerCase()}@test.dev`, { username: name, tag: "0001" });
  if (linked) {
    await pool.query("insert into oauth_identities (provider, provider_user_id, user_id) values ('google', $1, $2)", [`g-${p.id}`, p.id]);
  }
  return p.id;
}
