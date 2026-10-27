# Architecture

How Khuzur Card Hall is built: a React site, a Node game server that owns every table, and a Postgres database for accounts and match history. For what the project is, see the [README](../README.md).

## Contents

1. [Goal](#1-goal)
2. [Current build state](#2-current-build-state)
3. [Tech stack](#3-tech-stack)
4. [Repository layout](#4-repository-layout)
5. [Runtime architecture](#5-runtime-architecture), including [CPU players](#cpu-players), [Credits](#credits) and the [socket protocol](#socket-protocol)
6. [Database](#6-database)
7. [Security model](#7-security-model)
8. [Local development](#8-local-development)
9. [Deployment](#9-deployment)
10. [What's next](#10-whats-next)

---

## 1. Goal

A browser card hall styled like a 16-bit console game — the Balatro reference
point: hard pixel borders, warm lamplight on a dark ground, chunky type, no
modern gradients or rounded corners. The visual rules live in
[STYLEGUIDE.md](STYLEGUIDE.md) and are not decoration; they are the product.

The shape of the thing:

* A **main menu** as the hub — profile in the top right, settings, live server
  stats, and a horizontally scrollable rack of game modes.
* **Multiple game modes**, currently Thirteen (Tiến lên, 2–4 players), Muushig
  (5 players) and Poker (no-limit Hold'em, up to 6). Rules in
  [thirteen-rulebook.md](thirteen-rulebook.md),
  [muushig-rulebook.md](muushig-rulebook.md) and
  [poker-rulebook.md](poker-rulebook.md).
* **Real multiplayer** with strict anti-cheat. Hidden hands stay hidden, and
  the server is the only authority on what is a legal move.
* **Persistent identity and progression** — profiles, coins, exp, levels, match
  history — with guests able to play without an account.

Two design commitments follow from that and explain most of what is below:

1. **The server is authoritative.** Card games break the moment a client can
   assert state. Nothing the client sends is trusted.
2. **Guests are first-class.** You can play without signing in, so every layer —
   socket identity, match records, the database schema — has to represent a
   player who has no account.

## 2. Current build state

Honest status, as of October 2026.

| Area | State |
|---|---|
| Main menu, settings, avatar painter | Built |
| Auth in the Node server | Built: email + password, and Google / Discord sign-in (each button shows once its credentials are set, §9). No password reset or email confirmation yet |
| Database schema, views | Built; applied automatically on server start |
| **Thirteen** | **Playable online and in practice.** 2–4 players, server-authoritative, reconnect handling, match recording; CPUs at three levels (see [CPU players](#cpu-players)) |
| **Muushig** | **Playable online and in practice.** Online: server-authoritative, up to 5 humans with CPUs in the empty seats, reconnect handling, match recording. Practice: 4 CPUs (Easy/Medium/Hard) in the browser |
| **Poker** | **Playable online and in practice.** Free chips, 2–6 players, CPUs at free tables, joining between hands, recorded with its own stats |
| **Credits** | **Built.** Balances with a daily CLAIM, credit poker tables (LOW / MID / HIGH, humans only), an all-time leaderboard, a ledger of every credit movement, pair flags and an admin page (§5 Credits) |
| Shop / economy | **Started.** The shop opens over the main menu at `/shop`. It sells extra painted-avatar slots for gold. Borders, titles and card variants show as SOON. Pricing and the economy rules: [`gold-economy.md`](gold-economy.md) |
| Deployment | **Live** at https://khuzur.onrender.com — Render (site + game server) and Supabase (Postgres). See §9 |

**Muushig runs in both places.** The rules are pure functions in
`src/utils/muushig/engine.js` (state in, new state out, no React or sockets) and
the CPU players are in `src/utils/muushig/ai.js`, at three levels. Practice
runs them in the browser. Online tables run byte-identical copies in
`server/game/muushig/` (the server deploys from `server/` alone;
`tests/unit/rules-copies.test.js` fails if they drift — edit the browser copy,
then copy it over) inside `MuushigGame` (`server/game/muushigGame.js`), which
plays the CPU seats (at MEDIUM) and the automatic steps on timers paced to the
browser's animations. `src/pages/muushig/GameMuushig.jsx` renders either: in
practice it owns the game; online it plays the server's states through a queue,
one at a time once the last has finished animating, so every move shows the
same way it does in practice (§5).

**Poker runs in both places too.** The rules are `src/utils/poker/`
(`hands`, `pots`, `engine`, `ai`) plus `table.js`, whose `PokerTable` runs a
table over time: CPU turns, the turn clock, all-in run-outs, sitting out and
the pause between hands. Practice runs `PokerTable` in the browser (no turn
clock); online tables run byte-identical copies in `server/game/poker/`
(`tests/unit/rules-copies.test.js` checks both games' copies). A poker lobby
owns its table from creation: there is no waiting table and no rematch, and
`src/pages/poker/GamePoker.jsx` applies each state as it arrives.

All three games are covered by a Vitest suite (`npm test`, config in `vitest.config.js`)
in three projects: `unit` (rules, CPU logic and seeded whole-match simulations,
run against both the client and server copies of the logic), `server` (engine
with fake timers, real-socket end-to-end against a spawned server, and
Postgres suites that run only when `TEST_DATABASE_URL` is set) and `ui`
(table components in jsdom). Muushig's engine and CPU players have their own
`unit` suites (`tests/unit/muushig-*.test.js`), including whole CPU matches at
each difficulty; its server table has `server/tests/muushig-game.test.js` and
real-socket games in `socket.test.js`. See the [README's Testing section](../README.md#testing).

## 3. Tech stack

**Client** — React 19 + Vite 7, Tailwind CSS v4, React Router v7, GSAP 3 (with
`@gsap/react`) for animation, `socket.io-client` v4.

**Server** (`server/`) — Node + Express 5, Socket.IO v4, `pg` for Postgres,
`bcryptjs` + `jsonwebtoken` for accounts. ES modules throughout.

**Postgres 17** — persistence. Locally it runs in a container; in production
it is Supabase's Postgres (§9), used as a plain database. Nothing in the schema
is vendor-specific, so any managed Postgres works.

> **One source of realtime truth.** All transient in-game communication —
> matchmaking, lobbies, moves, chat — goes through the Socket.IO server.
> Postgres is storage only.

The project previously used Supabase for Postgres *and* Auth, and moved off it
because a paused free-tier project took the whole site down with it. The old
migrations are in git history; `server/db/migrations/001_initial.sql` is their
consolidated plain-Postgres equivalent. Production is back on Supabase, but
only as a Postgres host: accounts live in our own `users` table, Supabase Auth
and its Data API are unused (and locked out, §7). The pause risk is back with
the free plan — see §9.

## 4. Repository layout

```
src/
  pages/          MainMenu, AvatarPaint, thirteen/, muushig/, poker/
  components/     PixelCard (design primitives), TableChrome (every table's
                  header and sidebar), auth/, thirteen/, muushig/, poker/
  hooks/          useAuth (session + profile), useServerStats,
                  useTableMetrics (card sizes and small-screen layouts)
  lib/            api (HTTP client + session token), guestIdentity,
                  games (each game's table route)
  utils/          socket, SoundManager, avatarConstants,
                  + the Thirteen rules and CPU players (aiPlayer, aiCombos, aiSearch)
                  + muushig/ (the Muushig engine and CPU players)
                  + poker/ (the Poker engine, CPU players, PokerTable and the credit tiers)
  components/credits/  the buy-in panel, CLAIM, the balance and credit-host panels
  pages/          … plus Leaderboard and Admin (credits)
server/
  index.js        Socket.IO entry, auth middleware, lobby management
  game/           engine.js (ThirteenGame, redactState) + Thirteen rules modules
                  muushigGame.js (MuushigGame, muushigView), muushigStats.js
                  muushig/ (copies of src/utils/muushig — see §2)
                  poker/ (copies of src/utils/poker — see §2)
  auth.js         sign-up/login, JWTs, profile routes (/api/auth/*)
  oauth.js        Google / Discord sign-in (/api/auth/oauth/*)
  persistence.js  match recording
  credits/        accounts (balances, CLAIM, buy-ins, saved hands), tables
                  (CreditTable), leaderboard, flagRules + flags, admin, routes,
                  check (the economy check) — see §5 Credits
  db/             pg pool, migration runner, migrations/ — the schema
docs/             this file, STYLEGUIDE.md, the three rulebooks
render.yaml       Render Blueprint: the site and the game server (§9)
```

> **Two copies of the rules.** `src/utils/gameLogic.js`, `handEvaluator.js`,
> the CPU files and the rest are mirrored in `server/game/`. Practice games run
> the browser copies; online, the **server copies are authoritative** and the
> browser's are only for instant hints. Every rule test runs against both, and
> `tests/unit/rules-copies.test.js` checks the files that must match byte for
> byte. Edit the browser copy, then copy it over.

## 5. Runtime architecture

```
Browser ──HTTP  /api/auth/*──────────> Node server ──pg──> Postgres
   │            signup, login, me,          │              profiles, matches
   │            PATCH profile               │
   └──Socket.IO (JWT in handshake)──────────┘
                lobbies, moves, chat
```

Account routes: `POST /signup`, `POST /login`, `GET /me`, `PATCH /profile`,
`GET /stats` (everything the profile's Stats panel shows, for each game filter
— overall, Thirteen, Muushig, Poker — in one round trip; see `server/stats.js`) and
`POST /matches`.

**Google / Discord sign-in** (`server/oauth.js`, under `/api/auth/oauth`) is
the OAuth authorization-code flow run by this server; no auth service is
involved. `GET /providers` lists the configured ones; the sign-in button
navigates to `GET /:provider?returnTo=/path`, which stores a random `state`
and a PKCE verifier in a 10-minute `HttpOnly` cookie and redirects to the
provider. The provider returns to `GET /:provider/callback`; the state must
match the cookie (no signing someone into your account with a link), the code
is traded for the player's provider id and verified email, and the server
redirects to the site's `/auth/callback#token=…&returnTo=…`
(`src/pages/AuthCallback.jsx`), or `#error=cancelled|no_email|unavailable|failed`.
The token is the same JWT email sign-in issues; the page wipes it from the
address bar. A new player goes to the main menu's name-and-tag setup first.

Which account a sign-in reaches: a provider identity always signs into the
account it first reached (`oauth_identities`). A new identity joins the
account with the same verified email, else a new account is made. A provider
without a verified email is refused.

**Linking a login** (the profile's *Linked logins*, `src/components/profile/LinkedLogins.jsx`):
a signed-in player adds Google or Discord to their account whatever its email.
The site gets a 10-minute link ticket (`POST /api/auth/link-ticket`, a JWT with
`purpose: "link"` that `verifyToken` refuses as a session) and starts at
`/oauth/:provider?link=<ticket>&returnTo=/profile#logins`. The ticket rides
in the state cookie, is checked again at the callback, and the identity is
attached to that account (`linkOAuthIdentity`) instead of signing in. The site
gets `#link=ok|taken|exists|expired|cancelled|failed&provider=…`, and
AuthCallback hands it to the profile. One account per provider identity, one
identity per provider per account. `GET /api/auth/logins` lists the ways in;
`DELETE /api/auth/logins/:provider` unlinks unless it's the last one. Credit
play needs a linked provider (`needsLink` on `/api/credits/me`).

**Solo matches** — practice games against CPUs run in the browser (Thirteen
and Muushig practice), so the browser reports each finished one to `POST /matches`
(`src/hooks/useSoloMatchReport.js`). `server/solo.js` checks the report and
places the player from the final scores itself; the match is saved with
`game_sessions.solo = true` and counts for stats only — no coins or exp. Reports are de-duplicated per player and match id, and limited to a
few a minute.

The browser never talks to Postgres. Every read and write goes through the
Node server, so authorization lives in its routes rather than in database
policies.

**Game state lives in RAM on the Node server**, in a `Map` of lobbies. Each
lobby has a `gameType` (`thirteen` | `muushig` | `poker`, set at creation), holds its
members keyed by a stable `playerKey` (the user id, or `name#tag` for a guest)
and a `ThirteenGame`, `MuushigGame` or `PokerTable` instance. `GAMES` in `server/index.js`
holds what differs per game: seats (4 | 5 | 6), the engine, the redaction and the
state event. Socket ids are rebound to
the player key on reconnect, which is what makes refresh-and-rejoin work.

**Waiting tables** — a new lobby does not deal. It holds `seats` (4 or 5 slots:
a human by player key, a CPU, or empty) and sends each member a `table_update`
shaped for them (their seat, whether they are host, no player keys). The host
adds CPUs at a level (`add_cpu { seat, level }`, EASY | MEDIUM | HARD, MEDIUM if
missing), changes it (`set_cpu_level`) or removes them, and presses START
(`start_game`). Thirteen starts with the filled seats only — 2 to 4 players, at
least 2 required — closing the gaps so seat *i* is engine player *i*; Muushig
fills empty seats with MEDIUM CPUs. A CPU taking over a dropped player plays at
MEDIUM. A joiner takes an empty seat,
else replaces a CPU; the table is full at 4 humans. If the host leaves, the next
seated human becomes host.

**Connection identity** (`server/index.js`) — the handshake carries either a
session JWT or a guest name/tag. `verifyToken` (`server/auth.js`) checks the
signature locally; failure means guest, not rejection.

**Move flow** — the client emits `request_move`; the server checks turn order,
card ownership and combination legality, then either updates state and
broadcasts or replies `move_rejected`. There is no path by which a client sets
state directly.

**Deal clock** — the server decides when a deal is over, not each browser.
Each engine records when the deal ends (Thirteen: `DEAL_DELAY_MS`, 7.5s;
Muushig: the round's opening — `roundStart`, plus `drawReveal` in a match's
first round), every state sent carries `dealMsLeft`, and human moves before
then get `move_rejected` "Still dealing". The browser fits its deal animation
into that time (`DealAnimation`'s `endsAt`): faster when it is short (behind,
or rejoined mid-deal), and holding the table when it finished early (reduced
animations, a hidden tab). Each browser used to time its own deal, so a player
with reduced animations or a backgrounded tab could start ~6s before the rest.

**Redaction** — `redactState(state, seatIndex)` replaces every other player's
hand with `{hidden: true}` placeholders, preserving length so card backs render
correctly. Each client receives a state shaped for its own seat.

**Broadcasting** — `broadcastState(lobby, game)` takes the game explicitly. The
first broadcast of a match happens *inside* the `ThirteenGame` constructor,
before `lobby.game` has been assigned, so reading `lobby.game` there silently
dropped the opening deal on every match. Clients only recovered when the first
AI move produced another broadcast, and when a human held the opening turn none
came — the board stayed blank indefinitely. Keep the game parameter.

**Disconnects** — a dropped player keeps their seat for 60 seconds
(`DISCONNECT_GRACE_MS`), whether the table is waiting or playing. After that a
waiting seat empties, and a playing seat goes to a CPU so the match can finish.
Leaving the game page without EXIT (browser Back) sends `leave_page`, which
starts the same grace; the socket itself stays up in the single-page app.

**Muushig online** — `muushigView(state, seat)` keeps the state's shape (so
the browser's rule helpers work on it) but turns every card the seat can't see
into `{ hidden: true }`, counts kept: other hands and discards, the deal pile,
the draw pile and the dead pile. The view carries `mySeat`; the page draws that
seat at the bottom. Moves arrive as `muushig_move { type, ...payload }`; the
seat is the socket's, the payload is type-checked, and the engine's own errors
come back as `move_rejected`. The page checks a move against its view first
(instant errors), except the draw for the deal, whose pile it can't see. The
server deals the next round itself after the results screen; only the host
can rematch.

**Poker online** — the view is `viewFor(state, seat)` plus `turnMsLeft` and
`started`: other hands are `{ hidden: true }` until shown, the deck is never
sent, and no seat carries its `key` (the player key). Moves arrive as
`poker_move { type, amount? }`. A newcomer sits in the first empty seat and is
dealt in from the next hand; leaving stands the seat up (a hand in play
folds) and no CPU takes it. The turn clock (`POKER_TURN_MS`) checks or folds
for an absent player; two timeouts sit them out, and five minutes out
(`POKER_KICK_MS`) sends `table_left { reason: "away" }` and removes them. The
host can add or remove CPUs at any time and `close_table`, which sends everyone
`table_left { reason: "closed" }`.

**Host** — each player's state update carries `amHost`, so a player
promoted when the host leaves gets the REMATCH button; the client trusts it over
the router state it was opened with.

### CPU players

Every game has CPUs at three levels, EASY, MEDIUM and HARD. The same code
plays practice tables in the browser and CPU seats online (the server copies).
**No CPU sees a hidden card**: each decides from what a player in its seat
could know.

| Game | Code | How the levels differ |
|---|---|---|
| Thirteen | `src/utils/aiPlayer.js` (levels), `aiCombos.js` (cards as numbers 0–51, every combination in a hand, the best split of a hand into plays), `aiSearch.js` (what a seat knows, the round simulator) | EASY plays its lowest winning card and slips now and then. MEDIUM plans its hand, keeps aces and 2s while its hand is big, and blocks a player on their last card. HARD also counts the round's cards, reads passes, and before every move plays the round out 40 times over random deals of the unseen cards, keeping the move that costs it the fewest points. |
| Muushig | `src/utils/muushig/ai.js` (cards as numbers 0–31, the levels, the round simulator) | EASY reads its hand roughly, often misjudges going in, counts no cards and throws a random card one time in three. MEDIUM prices each card by its measured chance to eat a pile, goes in when that beats the risk of the +5 (a dealer counts the face-up trump), swaps cards a fresh draw would beat, counts played cards and eats with the cheapest card that holds. HARD plays every choice out a few hundred times over deals of the unseen cards that fit what the table has shown (who couldn't follow suit, who swapped few cards), with MEDIUM's judgement for every seat, and keeps the move likeliest to win the match. |
| Poker | `src/utils/poker/ai.js` | EASY plays too many hands, calls with any pair or draw and never bluffs. MEDIUM uses starting-hand charts that respect the size of a raise, then its chance of winning against random hands, shaded down for every bet it faces, against the price of calling. HARD reads hands: each opponent's raises, calls and checks this hand, sized by how that player has played so far at the table (`updateReads`), decide which hands it deals them in a few hundred simulated run-outs. It sizes bets by strength, bluffs and semi-bluffs where a bluff works (fewer into players who never fold), and plays push-or-fold when short. |

How each stays honest:

* **Thirteen** CPUs read the table only through `readTable` (`aiSearch.js`),
  which takes the CPU's own hand, everyone's card count, the passes and this
  round's plays, and reads other hands for their length alone. A test swaps
  the hidden cards and checks the decisions don't change.
* **Poker** CPUs get `viewFor(state, seat)`, the same redacted view a player
  at that seat receives, and the table's reads on its players (how often each
  put chips in, raised, bet, called and folded), built from public moves
  alone.
* **Muushig** CPUs read their own hand and discards, the pile sizes, the
  cards played and how many cards each player swapped. HARD deals the other
  hands itself, from the cards it hasn't seen.

CPU randomness (EASY's slips, HARD's simulated deals) uses the table's random
source: secure in play, seeded in tests, so a seeded test replays the CPUs'
choices exactly. The levels were tuned by playing thousands of CPU-only rounds
against each other: in a 4-player Thirteen table, a HARD CPU against three
MEDIUMs goes out first about 37% of the time (an even share is 25%), and a
MEDIUM against three EASYs about 50%. In Muushig, a HARD CPU against four
MEDIUMs wins about 26% of matches (an even share is 20%), and a MEDIUM against
four EASYs about 62%. At a free poker table, a HARD CPU against MEDIUMs wins
about 19 big blinds per 100 hands, and against the previous HARD about 31.

### Credits

Signed-in players with a linked Google or Discord login play poker for
**credits** at credit tables (LOW 5/10, MID 25/50, HIGH 100/200; the tiers
and buy-in limits are `src/utils/poker/tiers.js`, copied to the server like
the rules). Every credit is either in a balance (`credit_accounts`) or at a
table seat (`credit_seats`), and every move between them is a `credit_ledger`
row; `server/credits/check.js` checks that the two add up to everything ever
granted or claimed, minus what an admin removed — at boot and on the admin page.

A credit lobby's `game` is a `PokerTable` with `waitForBigBlind` and
`allInPlaysOut` on, wrapped in a `CreditTable` (`lobby.credits`,
`server/credits/tables.js`). The CreditTable runs every change to who holds
what — buying in, adding chips, saving a finished hand, leaving, releasing the
table — through **one queue per table**, each a database transaction. The
PokerTable's `beforeNextHand` is the CreditTable's `saveHand`: the next hand
doesn't deal until the last one is saved, and a save that fails is retried
while the felt shows "Saving…". Before writing, the save checks that each
seated player holds what the database says plus what the hand won or lost
them; a mismatch is refused, so a bug stops the table instead of spreading.

Leaving between hands pays the saved stack (plus chips waiting to land) back
at once. A player who leaves in a hand — folding, or playing out an all-in —
is paid by that hand's save. The host's CLOSE TABLE and the last player out
both run `closeAfterHand`: the hand in play finishes and is saved, then every
seat is released and the lobby destroyed. A restart can't keep tables, so at
boot `returnSeatsAfterRestart` sends every seat home (a hand in play doesn't
count) and leaves each player a notice, shown until they dismiss it. A deploy
boots the new server before stopping the old one, so on SIGTERM the old one
refuses new buy-ins and releases every credit table before exiting.

Routes: `GET /api/credits/me` (balance, CLAIM state, whether you can play,
your seat, rathole minimums by tier, rank, the restart notice), `POST
/api/credits/claim` (counts the saved seat under the account lock, so a claim
racing a buy-in can't add credits), `POST /api/credits/notice` (dismisses it), `GET /api/credits/leaderboard` (top 100; outside it,
your rank ±5; cached 30s), and `/api/admin/*` (§7).

### Socket protocol

Client emits: `create_lobby { gameType, tier?, buyIn? }`, `join_lobby { lobbyId, buyIn? }`, `leave_lobby`,
`get_public_lobbies { gameType }`, `leave_public_lobbies`, `check_game_status`,
`add_cpu`, `remove_cpu`, `set_cpu_level`, `start_game`, `leave_page`, `request_move` (Thirteen),
`muushig_move` (Muushig), `poker_move`, `poker_rebuy`, `poker_add_chips` (credit tables), `poker_sit_in`,
`close_table` (Poker), `request_rematch`, `send_chat`, `ping_check`,
`get_stats`.

Server emits: `lobby_joined { gameType }`, `table_update`, `game_state_update`
(Thirteen), `muushig_state` (Muushig), `poker_state` (with `tier`, `saving`,
`closingAfterHand` at credit tables), `credit_table_info` (a credit table
asking for a buy-in) and `table_left { reason }` (Poker),
`move_rejected`, `public_lobbies_update`, `receive_chat`, `chat_rejected`,
`error_message`.

Chat is flood-guarded per player (`server/chatGuard.js`): 6 messages back to
back, then one a second, and the same text at most 3 times in a row within
10 seconds. A message turned away goes to nobody; only its sender gets
`chat_rejected { reason: "slow" | "repeat", retryInMs }`, which the chat box
shows (`src/hooks/useChatLimit.js`).

`gameType` defaults to `thirteen`. `public_lobbies_update` goes only to sockets
watching that game's table list: asking for it (`get_public_lobbies`)
subscribes, and `leave_public_lobbies` (sent when the lobby screen closes) or
taking a seat at a table unsubscribes.

Invite links are `/join/{code}`, handled by `src/pages/JoinTable.jsx`. A code
works in either lobby: `lobby_joined` says which game the table is, and the
page for it opens (`src/lib/games.js`).

## 6. Database

**Source of truth is `server/db/migrations/`.** The server applies any
unapplied file at startup, in filename order, and records it in
`schema_migrations`. Never edit an applied file — add the next numbered file
instead. `003_lock_down.sql` and `004_pin_function_search_path.sql` are the
security hardening described in §7; any new table must enable RLS the same way
(`server/tests/db/lockdown.test.js` fails otherwise).

### `users`

`id`, `email` (unique case-insensitively), `password_hash` (bcrypt; NULL for
accounts made with Google or Discord), `email_verified` (true once a provider
vouched for the address — email sign-up never does). Only `server/auth.js`
and `server/oauth.js` read it.

### `oauth_identities`

`(provider, provider_user_id)` → `user_id`. Keyed by the provider's id, not
the email, since an address can change at the provider. An account can have
one row per provider (checked when linking). Its email needn't match the account's.

### `profiles`

One row per `users` entry, inserted in the same transaction as the user at
sign-up. `username` is NULL until the player completes
setup, and the client treats that as its "needs setup" signal — which is how
a Google or Discord sign-in, which skips the signup form, reaches setup.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | → `users(id)`, `on delete cascade` |
| `username` | `text` | NULL until setup; 1–6 chars |
| `tag` | `text` | NULL until setup; `^[A-Z0-9]{4}$` |
| `avatar` | `text` | `'1'`–`'5'`, or `'custom'` (wears the painting in `custom_slot`) |
| `custom_avatar` | `jsonb` | Slot 1's painting, `{v:3, pixels:[…289]}` from `serializeAvatar()` |
| `avatar_slots` | `smallint` | Painted-avatar slots owned, 1–3. Bought in the shop |
| `extra_avatars` | `jsonb` | Slots 2 and 3's paintings, in order (null while a slot is empty) |
| `custom_slot` | `smallint` | Which slot `'custom'` wears |
| `custom_colors` | `text[]` | max 8 |
| `coins`, `exp`, `level`, `wins`, `games_played` | `integer` | **server-owned** |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` set by trigger |

Unique on `(lower(username), tag)` — the name#tag identity model.

### `game_sessions` / `game_players`

Written only by the Node server. `host_id` and `player_id` are nullable because
guests have no `auth.uid()`; guest seats carry `guest_name` / `guest_tag`.

**The session row is written when the match starts**, with
`status = 'in_progress'`, and updated when it ends. Recording only at game over
meant an abandoned match left no trace at all.

**Player rows come from `lobby.roster`, not `lobby.members`.** `members` is the
live connection map and drops a player the instant they quit; `roster` is a
ledger of every seat ever occupied during the match and is never pruned. Writing
from `members` is what previously erased quitters from history entirely — their
loss was recorded nowhere.

Uniqueness is `(session_id, player_key)`, not `(session_id, seat_index)`: a seat
can have more than one occupant, because `join_lobby` lets a newcomer take over
a vacated CPU seat mid-match. `player_key` is the socket layer's stable identity
(the user id, or `guest:NAME#TAG`).

A rematch is a separate match and opens its own session row.

Columns that exist so a result can be judged fairly later:
`left_early`, `cpu_took_over`, `disconnect_count`, `joined_at` / `left_at`, and
`ended_reason` (`completed` / `abandoned` / `all_left`). Without them, a loss
where someone rage-quit and a CPU finished the hand is indistinguishable from a
loss they played out.

Rewards (XP and **gold**; gold is kept in the `coins` columns) come from
`server/game/progression.js`, a copy of `src/utils/progression.js`:

* **A match** pays by place out of all its seats, CPUs included: the winner
  70 XP / 80 gold, last place 30 / 20, the places between spread evenly. A seat
  whose player left and didn't come back (`left_early`) is paid nothing, so a
  seat taken over mid-match pays only the player in it at the end.
* **Levels** cost `min(100 + 50·(L−1), 1500)` XP each; `profiles.exp` is the
  total and `level` follows from it. Every level reached pays `25 × level`
  gold, doubled on every 5th.
* `finishSession` returns what each signed-in player earned; `recordMatch` in
  `server/index.js` puts it on the lobby and every member's next state carries
  their own `reward` (absent while it's saved, `null` if it paid them nothing).
  The browser shows it with `RewardPanel`.
* **Levels at the table**: `xpLevels` in `server/index.js` keeps each
  signed-in player's level (read at connect, updated as rewards land); every
  game state carries `levels` ({ seat: level }) and a waiting table's seats
  `xpLevel`, drawn as `LevelTag`. Match pages show each player's level now.

Rewards apply **only** to matches that actually finished — an abandoned match
records what happened but yields no result.

### No rating

There is no Elo or other rating: **credits are the ranked play** (the credits
leaderboard). An Elo rating was kept until `013_remove_elo.sql` dropped
`profiles.rating`, `game_players.rating_before` / `rating_after` and the views'
rating columns.

### `game_rounds`

One row per round, with per-seat detail as `seat_results` jsonb
(`seat_index`, `cards_left`, `points_gained`, `score_after`, `eliminated`). The
round is the natural write unit — all four seats resolve together — and the
`round_seat_results` view unnests it back into relational form for querying.

The engine emits these through `onRoundEnd`. Two subtleties worth preserving:

* A round ends into `ROUND_END`, **or into `GAME_OVER` if it was the last one**.
  Hooking only `ROUND_END` silently drops every final round.
* Card counts are read from the *previous* state, because scoring empties every
  hand. The exception is the round winner, who emptied their hand on the play
  that ended the round — that play lands between the two states, so the previous
  state still shows the cards they just put down. The winner is hardcoded to 0.

`game_players.rounds_won` and `game_players.stats` (jsonb: `rounds_played`,
`cards_left_total`, `best_round_cards_left`, `eliminated_at_round`) are derived
from these by the server. jsonb because Thirteen and Muushig have genuinely
different concepts; promote a field to a real column once you query it.

An online Muushig match is recorded the same way with Muushig's own rules
(`server/game/muushigStats.js`): places by lowest score, ties to more piles
eaten in the last round (as `rankSolo`); `stats` holds the same tallies a solo
report sends (`rounds_played`, `rounds_won`, `eaten`, `gone_in`, `folded`,
`sweeps`), read from the event log; each round's `seat_results` carry `eaten`
and `folded`, `winner_seat` is the seat that swept all 5 piles (or null).
Rewards are paid the same way, by place out of 5.

**Poker** is recorded per table: one session from START until everyone leaves
(`ended_reason = 'completed'`), a `game_rounds` row per hand, and per player
`final_score` = net chips and `stats` = the hand tally (`hands_played`,
`hands_won`, `net`, `biggest_pot`, `vpip_hands`, `showdowns`,
`showdowns_won`), built up hand by hand in the roster (`recordHand`). There
are no places. Each hand pays its signed-in players at once
(`payPokerHand` → `grantProgress`, sent as `progress_reward`), at most one hand
per player every 30 s, and the table's `exp_earned` / `coins_earned` record the
sum. `008_poker_stats.sql` keeps poker out of
`player_match_history` and adds `player_poker_stats`.

### Deriving stats

Nothing about a player's record is stored as a counter. These views compute it
all from the match rows, so they can never disagree with history:

| View | What it answers |
|---|---|
| `player_match_history` | One row per match played — the base for everything else |
| `player_stats` | Games, wins, losses, win rate, avg/best/worst placement, best/worst score, abandons, public vs private, time played |
| `player_game_type_stats` | The same split by Thirteen vs Muushig |
| `player_placement_stats` | Placement distribution — how often 2nd vs 4th, with percentages |
| `player_streaks` | Longest win/loss streak, and current streak (negative = losing) |
| `round_seat_results` | Round-level detail, flattened |
| `leaderboards` | Ranking board; a thin projection of `player_stats` |
| `player_poker_stats` | Poker per player: tables, hands, chips won or lost, biggest pot, VPIP, showdowns |
| `head_to_head(a, b)` | Function, not a view — the full pair cross-product is not something to materialise |

Two deliberate choices: `avg_position` **excludes** matches the player walked
out of, so a rage-quit cannot flatter or punish their average; and `win_rate` is
NULL rather than 0 for someone who has never played, because "0%" and "no data"
are different facts.

Only the hot-path set the main menu reads (`coins`, `exp`, `level`, `wins`,
`games_played`) is denormalised onto `profiles`, and that is a cache.
Do not add a `losses` column: a counter that can drift from the rows it
summarises is worse than a join.

Note on score direction: in Thirteen a **lower** score is better (points are
penalties for cards left in hand), so `best_score` is a `MIN`.

### Credits tables

`009_credits.sql`. `credit_accounts` (one per player, opened with 1000 the
first time they touch credits; `last_claim_at`, `first_hand_at`, `frozen_at`,
`restart_notice`), `credit_seats` (who holds what at a table: `stack` as of the
last saved hand, `pending` chips added since), `credit_hands` (every credit
hand: each seat's result and hole cards, the board, the event log; unique per
table run and hand number), `credit_ledger` (append-only: grant, claim,
buy_in, top_up, cash_out, restart_return, the admin kinds) and
`credit_flag_reviews` (dismissed flags). `game_sessions.poker_tier` marks a
credit table's session, and `player_poker_stats` groups by `stakes`
(`free` | `credits`). The invariant:
`sum(balance) + sum(stack + pending) = granted + claimed − removed`.

### `shop_purchases`

`015_shop.sql`. One row per item a player owns: `item_id`, `price`, and
`gold_after`. It's unique per player and item. `POST /api/shop/buy`
(`server/shop.js`) locks the profile row, checks the item against the server's
catalog (`server/game/shop.js`), takes the gold and writes the row in one
transaction.

### `leaderboards`

A **view** aggregating `game_players` — not a table.
Nothing to keep in sync, and it cannot drift from the match records. Exposes
wins, losses, abandons, `cpu_finished`, average and best position, per-game-type
wins, and `last_played_at`.

## 7. Security model

**Only the Node server touches the database.** The browser has no connection
string and no key; every read and write goes through the server's routes and
sockets. Supabase, however, publishes the `public` schema through its Data API
to anyone holding the project's public keys — and `users` holds emails and
password hashes. So the schema shuts that door itself:

* **RLS is on for every table, with no policies** (`003_lock_down.sql`). The
  API roles see zero rows; the server's role (`postgres` on Supabase, the table
  owner locally) bypasses RLS and is unaffected. Supabase's advisor reports
  "RLS enabled, no policy" as INFO — that is the intent.
* **`anon` and `authenticated` hold no grants** on tables, views, sequences or
  functions, now or for objects created later (default privileges). On plain
  Postgres those roles don't exist and the step is skipped.
* **No function is executable by `PUBLIC`**, and each pins its `search_path`
  (`004_pin_function_search_path.sql`).

`server/tests/db/lockdown.test.js` checks all three against the test database.

**Randomness.** Every deal, in all three games, practice and online, shuffles
a fresh deck with Fisher–Yates driven by `crypto.getRandomValues` (a 32-bit
value per draw, so any bias is below one in 80 million). The server never exposes
`Math.random` output: table codes use `crypto.randomInt` and chat ids
`crypto.randomUUID`, because V8's `Math.random` state can be recovered from a
few outputs and would let a player predict the next shuffle. Tests pass a
seeded `rng` instead (`shuffleDeck(deck, rng)`, `new ThirteenGame({ rng })`).
`tests/unit/deckUtils.test.js` checks that every order of the deck comes from
exactly one sequence of draws, and that the shuffle uses the secure generator.

**Accounts.** Passwords are bcrypt-hashed (cost 10). Sessions are HS256 JWTs
signed with `JWT_SECRET`, valid 30 days, stored in `localStorage` and sent as
`Authorization: Bearer` on HTTP and as `auth.token` in the socket handshake.
Tokens are stateless, so signing out only forgets the token client-side;
rotating `JWT_SECRET` signs everyone out.

**Joining a provider to an email account.** Email sign-up doesn't prove the
address, so someone could register a victim's email first and wait for them
to arrive with Google. When a verified provider email joins an account whose
email was never verified, its password is therefore dropped: the address's
real owner gets the account, and whoever set that password loses it. The
cost: a player who signed up with email and later uses Google signs in with
Google from then on (until password reset exists).

**Column-level anti-tamper.** `PATCH /api/auth/profile` writes only the
whitelisted identity fields (`username`, `tag`, `avatar`, `custom_avatar`,
`custom_colors`). `coins`, `exp`, `level`, `wins` and `games_played`
are written only by `persistence.js` when a match finishes, inside one
transaction that locks the affected profile rows.

**Restart recovery.** Game state is in RAM, so on boot any session still
`in_progress` is marked `abandoned`, and every credit seat goes back to its
balance. This assumes one game server per database.

**Credits admin.** `/api/admin/*` and the `/admin` page are open only to the
user ids in `ADMIN_USER_IDS`; to anyone else the API answers 404. Hole cards
saved in `credit_hands` leave the server only through that API. Against alt
accounts feeding a main one: credit play needs a linked Google or Discord
login; leaving a table and re-sitting within the hour at the same stakes needs
at least the stack you left with; and `server/credits/flagRules.js` flags pairs
where one account lost 1,000+ to another, 60%+ of its losses, with little back
(30-day window). An admin can RETURN or REMOVE credits (never below zero),
FREEZE an account, or DISMISS a flag — each with a note, each in the ledger.

## 8. Local development

```bash
# Postgres 17 in a container (podman or docker — same flags)
podman run -d --name khuzur-db -p 5432:5432 \
  -e POSTGRES_USER=khuzur -e POSTGRES_PASSWORD=khuzur -e POSTGRES_DB=khuzur \
  -v khuzur-pgdata:/var/lib/postgresql/data docker.io/library/postgres:17
podman start khuzur-db                     # on later days

cd server && npm install && npm run dev    # server on :3001, applies migrations
npm install && npm run dev                 # client on :5173
```

```bash
# .env  (client)
VITE_WEBSOCKET_URL=http://localhost:3001

# server/.env
PORT=3001
DATABASE_URL=postgres://khuzur:khuzur@localhost:5432/khuzur
JWT_SECRET=<openssl rand -hex 32>
CORS_ORIGIN=http://localhost:5173
```

Both are gitignored; copy the `.env.example` next to each. Without
`DATABASE_URL` the server still runs guest-only and skips match recording —
intentional, but easy to mistake for a bug.

Inspect data with `podman exec -it khuzur-db psql -U khuzur`.

**Production database from your machine.** `server/.env.supabase` (gitignored,
not in the template) holds the production `DATABASE_URL`. Load it with Node's
`--env-file` — the `&` in the URL breaks shell `source`:

```bash
cd server
node --env-file=.env.supabase --input-type=module \
  -e 'const db = await import("./db/index.js"); await db.migrate(); await db.pool.end();'
```

Your normal `server/.env` keeps pointing at the local container, so local
development and `npm test` never touch production.

## 9. Deployment

```
           https://khuzur.onrender.com                 Supabase (us-east-2, Ohio)
Browser ──► Render static site "khuzur"               ┌──────────────────────────┐
   │        (global CDN, the built React app)          │ Postgres 17              │
   │                                                    │ via the session pooler   │
   └──HTTP + Socket.IO──► Render web service ──────────►│ aws-0-us-east-2.pooler.  │
        https://khuzur-server.onrender.com   TLS, IPv4  │ supabase.com:5432        │
        (Node 22, Ohio, one instance)                   └──────────────────────────┘
```

Everything is defined in **`render.yaml`** (a Render Blueprint named `khuzur`,
synced from `main`). Both services redeploy on every push to `main`, each only
when its own files change (`buildFilter`): `server/**` rebuilds the game
server; anything except `server/`, `docs/` and `tests/` rebuilds the site.

| | Site — `khuzur` | Game server — `khuzur-server` | Database |
|---|---|---|---|
| Host | Render static site | Render web service | Supabase project `kkypojddoqtfzpxiwvme` |
| Plan | Free | Free | Free |
| Region | Global CDN | Ohio | us-east-2 (Ohio) |
| Build | `npm ci && npm run build` → `dist/` | `npm ci` in `server/` | — |
| Start | — | `node index.js` (runs migrations first) | — |
| Health | — | `GET /` → `{"ok":true}` | — |

The site has one routing rule: every path rewrites to `/index.html`, so React
Router serves `/game-13`, `/profile` and invite links like `/join/CODE`.

### Environment variables

| Variable | Where | Value |
|---|---|---|
| `VITE_WEBSOCKET_URL` | site (`render.yaml`) | `https://khuzur-server.onrender.com`. Baked in **at build time** — changing it needs a site redeploy |
| `NODE_VERSION` | both (`render.yaml`) | `22` |
| `CORS_ORIGIN` | server (`render.yaml`) | `https://khuzur.onrender.com`. Comma-separate to allow more (e.g. a custom domain) |
| `JWT_SECRET` | server (Render generated it) | Random. Rotating it signs every player out |
| `DATABASE_URL` | server (secret, set in the Render dashboard) | Supabase **session pooler** URI ending in `?sslmode=require&uselibpqcompat=true` |
| `PORT` | server (Render sets it) | `10000` on Render; the server reads it |
| `GOOGLE_CLIENT_ID` / `_SECRET` | server (secret, Render dashboard) | From Google Cloud Console → Credentials. Redirect URI: `https://khuzur-server.onrender.com/api/auth/oauth/google/callback` |
| `DISCORD_CLIENT_ID` / `_SECRET` | server (secret, Render dashboard) | From the Discord Developer Portal → OAuth2. Redirect: `https://khuzur-server.onrender.com/api/auth/oauth/discord/callback` |
| `ADMIN_USER_IDS` | server (secret, Render dashboard) | Comma-separated user ids that may open `/admin` (credits review). Empty: nobody |
| `PUBLIC_URL`, `SITE_URL` | server (optional) | Where providers send players back, and the site they land on. Default to Render's `RENDER_EXTERNAL_URL` and the first `CORS_ORIGIN` |

Secrets are never in git: `DATABASE_URL` is `sync: false` in the Blueprint, and
`JWT_SECRET` is `generateValue: true`. Change them under **khuzur-server →
Environment** in the Render dashboard (the service restarts).

### Why the database URL looks like that

* **Session pooler, not the direct connection.** Supabase's direct host is
  IPv6-only and Render has no outbound IPv6. The session pooler is IPv4 and,
  unlike the transaction pooler, keeps a real session per connection — right
  for a long-running server with a `pg` pool.
* **`sslmode=require&uselibpqcompat=true`.** The pooler also accepts
  *unencrypted* connections, so the URL must demand TLS. Plain
  `sslmode=require` fails: `pg` 8 treats it as `verify-full`, and Supabase's
  certificate chain ends in its own CA. The libpq-compatible `require`
  encrypts without verifying the chain. To verify it as well, download the CA
  from Supabase (Database settings → SSL) and pass it as `ssl.ca`.
* **Password characters.** If the password contains `@ : / # ?`, percent-encode
  them in the URL.

### Free-tier behaviour

* **The game server sleeps** after 15 minutes without traffic; the next visitor
  waits about a minute while it boots. It only sleeps with nobody connected, so
  no game is lost. Render **Starter** (~$7/month) keeps it awake.
* **Every restart or deploy ends live tables** — game state is in RAM (§5).
  Finished matches are already saved; in-progress sessions are marked
  `abandoned` on boot.
* **Supabase pauses idle free projects** (about a week without activity). A
  paused database means sign-in and stats fail while guest play still works;
  unpause it from the Supabase dashboard. This is what drove the earlier move
  off Supabase — upgrade, or move `DATABASE_URL` to another host, before it
  matters.
* **One server instance.** Tables live in that process's memory, so the server
  cannot scale to a second instance without shared state (e.g. Redis and
  sticky sessions). One small instance should handle roughly a few thousand
  concurrent players (estimated, not load-tested); table-list updates already go only to players on the lobby screen.

### Checking production

```bash
curl https://khuzur-server.onrender.com/              # {"ok":true,...}  (may take ~1 min if asleep)
curl -X POST https://khuzur-server.onrender.com/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"x@y.z","password":"nope"}'
# 401 "Invalid email or password" = database reachable
# 503 "Accounts are not available"  = DATABASE_URL missing or wrong
```

Logs, deploys and metrics are in the Render dashboard (or the Render MCP
tools); database tables, SQL and the security advisor are in the Supabase
dashboard.

## 10. What's next

Roughly in dependency order:

1. **Keep production awake** — Render Starter for the game server, and a
   database plan that doesn't pause (§9), once real players arrive.
2. **Password reset and email confirmation** — needs an email-sending
   service; would also let a Google-linked account set a password again.
3. **More for the shop** — avatar borders, titles and card variants, priced
   by [`gold-economy.md`](gold-economy.md).
4. **A fourth game** — the main menu's fourth slot is a locked placeholder.
