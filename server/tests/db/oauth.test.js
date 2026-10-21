import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { TEST_DATABASE_URL, loadDb, truncateAll } from "./setup.js";

const SITE = "https://site.test";
const SERVER = "https://server.test";

describe.skipIf(!TEST_DATABASE_URL)("Google / Discord sign in (Postgres)", () => {
  let m;
  let app;
  beforeAll(async () => {
    Object.assign(process.env, {
      SITE_URL: SITE,
      PUBLIC_URL: SERVER,
      GOOGLE_CLIENT_ID: "g-id",
      GOOGLE_CLIENT_SECRET: "g-secret",
      DISCORD_CLIENT_ID: "d-id",
      DISCORD_CLIENT_SECRET: "d-secret",
    });
    m = await loadDb();
    app = express().use("/api/auth/oauth", m.oauthRouter).use("/api/auth", m.authRouter);
  });
  beforeEach(() => truncateAll(m.pool));
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => m?.pool.end());

  /** Fakes the provider: its token endpoint and who the player is. */
  function provider(identity, { tokenStatus = 200 } = {}) {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        calls.push({ url: String(url), init });
        if (/token$/.test(url)) {
          return new Response(JSON.stringify({ access_token: "at-1" }), { status: tokenStatus });
        }
        return new Response(JSON.stringify(identity), { status: 200 });
      }),
    );
    return calls;
  }

  /** Step 1: returns the provider URL and the cookie the browser keeps. */
  async function start(name, returnTo) {
    const res = await request(app).get(`/api/auth/oauth/${name}`).query(returnTo ? { returnTo } : {});
    expect(res.status).toBe(302);
    return { to: new URL(res.headers.location), cookie: res.headers["set-cookie"][0].split(";")[0] };
  }

  /** Steps 2–3: the provider sends the player back. Returns the site fragment. */
  async function finish(name, { cookie, state, query = {} }) {
    const res = await request(app)
      .get(`/api/auth/oauth/${name}/callback`)
      .query({ code: "c-1", state, ...query })
      .set("Cookie", cookie ?? "");
    expect(res.status).toBe(302);
    const to = new URL(res.headers.location);
    expect(`${to.origin}${to.pathname}`).toBe(`${SITE}/auth/callback`);
    return Object.fromEntries(new URLSearchParams(to.hash.slice(1)));
  }

  async function signIn(name, identity, returnTo) {
    const calls = provider(identity);
    const { to, cookie } = await start(name, returnTo);
    return { ...(await finish(name, { cookie, state: to.searchParams.get("state") })), calls };
  }

  const google = (over = {}) => ({ sub: "g-123", email: "ann@gmail.test", email_verified: true, ...over });
  const discord = (over = {}) => ({ id: "d-456", email: "ann@gmail.test", verified: true, ...over });
  const count = async (table) => Number((await m.pool.query(`select count(*) from ${table}`)).rows[0].count);

  it("lists only providers with credentials", async () => {
    const saved = process.env.DISCORD_CLIENT_SECRET;
    delete process.env.DISCORD_CLIENT_SECRET;
    const res = await request(app).get("/api/auth/oauth/providers");
    process.env.DISCORD_CLIENT_SECRET = saved;
    expect(res.body.providers).toEqual(["google"]);
  });

  it("sends the player to Google with a state and a PKCE challenge, remembered in a cookie", async () => {
    const res = await request(app).get("/api/auth/oauth/google");
    const to = new URL(res.headers.location);
    expect(`${to.origin}${to.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(to.searchParams.get("client_id")).toBe("g-id");
    expect(to.searchParams.get("redirect_uri")).toBe(`${SERVER}/api/auth/oauth/google/callback`);
    expect(to.searchParams.get("code_challenge_method")).toBe("S256");
    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/^khuzur_oauth=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(decodeURIComponent(cookie.split(";")[0].split("=")[1]).split(".")[0]).toBe(to.searchParams.get("state"));
  });

  it("makes an account with a profile, and signs into the same one next time", async () => {
    const first = await signIn("google", google());
    expect(first.error).toBeUndefined();
    const user = m.verifyToken(first.token);
    expect(user.email).toBe("ann@gmail.test");
    const { rows } = await m.pool.query("select username, level from profiles where id = $1", [user.id]);
    expect(rows[0]).toEqual({ username: null, level: 1 }); // name set up on the site next

    // The code is traded with the secret and the PKCE verifier.
    const body = new URLSearchParams(first.calls[0].init.body);
    expect(body.get("client_secret")).toBe("g-secret");
    expect(body.get("code_verifier")).toBeTruthy();

    const again = await signIn("google", google({ email: "renamed@gmail.test" }));
    expect(m.verifyToken(again.token).id).toBe(user.id);
    expect(await count("users")).toBe(1);
  });

  it("joins the account with the same verified email, across providers", async () => {
    const g = m.verifyToken((await signIn("google", google())).token);
    const d = m.verifyToken((await signIn("discord", discord({ email: "ANN@gmail.test" }))).token);
    expect(d.id).toBe(g.id);
    expect(await count("oauth_identities")).toBe(2);
  });

  it("joining an email sign-up drops its unproven password", async () => {
    const signup = await request(app).post("/api/auth/signup").send({ email: "ann@gmail.test", password: "hunter22" });
    const linked = m.verifyToken((await signIn("google", google())).token);
    expect(linked.id).toBe(signup.body.user.id);
    const login = await request(app).post("/api/auth/login").send({ email: "ann@gmail.test", password: "hunter22" });
    expect(login.status).toBe(401);
  });

  it("a password-less account answers a password login with 401, not a crash", async () => {
    await signIn("discord", discord());
    const res = await request(app).post("/api/auth/login").send({ email: "ann@gmail.test", password: "anything" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("returns the player to where they started, only ever on the site", async () => {
    expect((await signIn("google", google(), "/join/ABC123")).returnTo).toBe("/join/ABC123");
    await truncateAll(m.pool);
    expect((await signIn("google", google(), "//evil.test/x")).returnTo).toBe("/");
  });

  it("refuses an account without a verified email", async () => {
    const res = await signIn("discord", discord({ verified: false }));
    expect(res).toMatchObject({ error: "no_email" });
    expect(res.token).toBeUndefined();
    expect(await count("users")).toBe(0);
  });

  it("rejects a callback whose state doesn't match the cookie, before asking the provider", async () => {
    const calls = provider(google());
    const { cookie } = await start("google");
    expect(await finish("google", { cookie, state: "someone-elses-state" })).toEqual({ error: "failed" });
    expect(await finish("google", { cookie: "", state: "x" })).toEqual({ error: "failed" });
    expect(calls).toHaveLength(0);
  });

  it("reports a cancel on the provider's screen and a failed code exchange", async () => {
    provider(google());
    const { to, cookie } = await start("google");
    const state = to.searchParams.get("state");
    expect(await finish("google", { cookie, state, query: { error: "access_denied" } })).toEqual({ error: "cancelled" });

    provider(google(), { tokenStatus: 400 });
    const s2 = await start("google");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await finish("google", { cookie: s2.cookie, state: s2.to.searchParams.get("state") })).toEqual({ error: "failed" });
  });

  it("an unknown or unconfigured provider goes back to the site", async () => {
    const res = await request(app).get("/api/auth/oauth/myspace");
    expect(res.headers.location).toBe(`${SITE}/auth/callback#error=unavailable`);
  });
});
