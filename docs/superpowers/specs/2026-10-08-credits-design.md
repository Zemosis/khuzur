# Credits — design

**Goal:** Poker for something that lasts. Signed-in players get a credit
balance (1000 to start, topped back up to 1000 once a day by CLAIM), sit at
human-only credit tables in three stake tiers, and climb an all-time
leaderboard. Every credit movement is in a ledger, suspicious pairs of
accounts are flagged for an admin to review, and nothing — leaving, kicks,
disconnects, a host closing, a server restart — can create or lose a credit.
Free-chip poker stays exactly as it is.

## Decisions

| | |
|---|---|
| Currency | Credits, separate from `coins` |
| Who has credits | Signed-in players. Guests keep the free-chip tables |
| Who can play for credits | Accounts with a linked Google or Discord login, not frozen. Email-only accounts are told to link one |
| Starting balance | 1000, created the first time the account touches credits; counts as its first claim |
| CLAIM | Once every 24h from the last claim, when balance + stack + chips in the current pot < 1000: back up to exactly 1000, never above. By button |
| Tiers | LOW 5/10 (buy-in 200–1000), MID 25/50 (1000–5000), HIGH 100/200 (4000–20000) |
| Table | 6 seats, humans only, public or private, the host picks the tier |
| Joining | Buy in with an amount in range; dealt in when the big blind reaches you |
| Rathole rule | For 1 hour after leaving a table at a tier, your minimum buy-in at that tier is the stack you left with (capped at the tier max) |
| Adding chips | ADD CHIPS between hands or while folded, up to the tier max; REBUY at 0 |
| Leaving mid-hand | All-in: the hand plays out and winnings go to your balance. Otherwise: fold |
| Tables at once | One credit table per player |
| Rake | None |
| Restart | Every seat's stack returns to its balance; a hand in progress counts as never dealt |
| Leaderboard | All-time, by balance + on-table stack. Top 100 for everyone; others see their rank ±5 |
| Abuse | Ledger of every movement, pair flags, admin page with RETURN / REMOVE / FREEZE |

## Money model

Every credit is in exactly one place: an account's **balance** or a credit
table **seat**. The **ledger** records every movement between them, every
hand result and every admin action. The invariant, checked at boot, in the
tests and on the admin page:

```
sum(balances) + sum(seat stacks) = granted + claimed − removed by admin
```

**Tables are saved after every hand.** Buying in moves credits from the
balance to a saved seat row before the player appears at the table. When a
hand ends, every seat's new stack and the hand itself are written in one
transaction, and the next hand doesn't deal until that write succeeds.
Leaving moves the stack back to the balance. A crash therefore loses at most
the hand in progress, and that hand is void: each seat goes back to the stack
it had when the hand started.

(Rejected: saving only buy-ins and cash-outs, which can't know stacks after a
crash and would refund losers; saving every bet, which costs a round trip per
click to save half a hand.)

### Rules settled here

- The starting 1000 is the account's first claim, so a new account can't
  bust and claim again within its first 24 hours.
- "Below 1000" for CLAIM counts balance + seat stack + chips added but not
  yet on the stack + whatever the player has put in the current pot.
- The rathole rule reads the ledger: the most recent `cash_out` at that tier
  within the last hour sets the minimum, so it holds across tables and
  restarts. Restart returns and admin actions don't count.
- A balance never goes negative. An admin reversal first stands the receiver
  up (their stack returns), then takes at most their balance; the ledger
  records what was actually recovered.
- A frozen account can't sit at credit tables or claim, and is off the
  leaderboard. A seated player who is frozen is stood up after the hand.
- If the database fails while saving a hand, that table holds on "Saving…"
  and retries every few seconds; it never deals on unsaved chips.

## Database — `009_credits.sql`

Every new table enables RLS with no policies, as `003_lock_down.sql`
(`server/tests/db/lockdown.test.js` covers them). Amounts are `bigint`,
parsed to numbers on read.

- **`credit_accounts`** — `user_id` PK → `users(id)` on delete cascade,
  `balance bigint not null check (balance >= 0)`, `last_claim_at timestamptz
  not null`, `frozen_at timestamptz`, `frozen_note text`, `created_at`.
- **`credit_seats`** — the chips at tables right now. `user_id` PK (one table
  at a time), `table_id text` (the lobby id), `table_name`, `tier`, `stack
  bigint check (stack >= 0)`, `pending bigint` (added chips not yet on the
  stack), `hand_start_stack bigint` (what a void hand restores),
  `seated_at`.
- **`credit_hands`** — one row per finished credit hand: `id`, `session_id`
  → `game_sessions`, `table_id`, `tier`, `hand_number`, `is_private`,
  `seats jsonb` (per seat: `user_id`, `stack_before`, `stack_after`, `net`,
  `won`, `folded_street`, `committed`), `events jsonb` (the hand's full event
  log, hole cards included — read only by the server and the admin page),
  `played_at`.
- **`credit_ledger`** — append-only. `id bigserial`, `user_id`, `kind`
  (enum: `grant`, `claim`, `buy_in`, `top_up`, `cash_out`, `restart_return`,
  `admin_return_out`, `admin_return_in`, `admin_remove`), `amount bigint`
  (signed, as seen by the balance), `balance_after`, `tier`, `table_id`,
  `hand_id`, `note`, `actor_id` (the admin, for admin kinds), `created_at`.
  Indexed on `(user_id, created_at)` and `(kind, created_at)`. Hand results
  move chips between seats, not balances, so they live in `credit_hands`.
- **`credit_flag_reviews`** — `(loser_id, winner_id)` PK, `reviewed_at`,
  `reviewed_by`, `note`: a dismissed flag stays hidden until new flow
  between the pair arrives after `reviewed_at`.
- **`game_sessions.poker_tier`** — `text null` (`LOW` | `MID` | `HIGH`;
  null = free chips).
- **`player_poker_stats`** is rebuilt with a `stakes` column (`free` |
  `credits`) in its grouping, so the profile can split them.

## Server — `server/credits/`

`server/index.js` only gains thin hooks; the credit logic lives here.

- **`accounts.js`** — `getAccount(userId)` (creates it with the starting
  grant on first touch), `claimState`, `claim`, `buyIn`, `topUp`,
  `cashOut`, `canPlayCredits(userId)` (linked provider, not frozen). Every
  change is one transaction that locks the account row
  (`select … for update`) and writes the ledger row with `balance_after`, so
  concurrent requests can't spend the same credits twice.
- **`tables.js`** — the bridge between a credit `PokerTable` and the
  database: `seatWithBuyIn`, `saveHand` (the between-hands save step),
  `addChips`, `leave` (cash out now, or after the hand for an all-in or
  disconnected player), `closeTable`, and `returnAllSeats()` run at boot
  after `migrate()` (writes `restart_return` rows, restores void hands from
  `hand_start_stack`, remembers a one-time notice per player).
- **`leaderboard.js`** — balance + seat stack per non-frozen account with at
  least one credit hand, `rank()` (ties share a rank, names order within a
  tie), top 100 plus the asking player's ±5; computed at most every 30s.
- **`flags.js`** — pair flows and flag rules (thresholds as constants).
- **`admin.js`** — `/api/admin/*`, allowed only for user ids in the
  `ADMIN_USER_IDS` setting; anyone else gets 404.
- **`check.js`** — the money invariant, returning the totals and OK or
  MISMATCH. Run at boot (logged loudly on mismatch) and by the admin page.

### HTTP

- `GET /api/credits/me` — balance, claim state (amount, or `nextAt`, or
  over 1000), whether the account can play (and why not), current seat
  (table and stack), rathole minimums by tier, and any restart notice
  (cleared once read).
- `POST /api/credits/claim`
- `GET /api/credits/leaderboard` — open to guests; with a session, includes
  the caller's ±5 block.
- `GET /api/admin/check`, `GET /api/admin/flags`,
  `GET /api/admin/pairs/:loser/:winner`, `GET /api/admin/accounts?q=NAME%23TAG`,
  `POST /api/admin/reverse { from, to?, amount, note }` (no `to` = REMOVE),
  `POST /api/admin/freeze { userId, frozen, note }`,
  `POST /api/admin/dismiss { loserId, winnerId, note }`.

### Sockets

- `create_lobby { gameType: "poker", tier, buyIn, isPrivate, lobbyName }` —
  a `tier` makes it a credit table; the host is seated only after the buy-in
  succeeds.
- `join_lobby { lobbyId, buyIn }` — a credit table needs `buyIn`; the browser
  asks for it first (it knows the tier from the table list or, for an invite
  link, from a `credit_table_info` reply). The server re-checks every limit.
- `poker_add_chips { lobbyId, amount }` — top-up or rebuy.
- `poker_rebuy` and `add_cpu` are refused at credit tables.
- Errors come back as `error_message` / `move_rejected` with a reason the
  browser shows as is ("Your balance is 340; this table's minimum is 1,000").
- Credit tables carry `tier` in `public_lobbies_update` and in the poker view
  (with `saving`, `closingAfterHand`, and per-seat `waitingForBigBlind` and
  `leftAllIn`).

## Rules engine (`src/utils/poker/`, copied to `server/game/poker/`)

Two table settings, both off by default so free tables are unchanged:

- **`waitForBigBlind`** — a newly seated player, or one back from sitting
  out, gets `waitingForBigBlind: true` and isn't dealt in until the hand
  where they'd post the big blind (worked out by the button's next move
  over the seats that would be dealt in, the waiting seat included). Then
  they post it like anyone else. A table that can't start a hand without
  them (fewer than 2 ready players) deals waiting players in at once.
- **`allInPlaysOut`** — `standUp` on an all-in seat in a running hand marks
  it `leaving` but leaves it in the hand; the board runs out and the seat
  empties when the hand ends. Seats with decisions left fold as today.

New move **`addChips(state, seat, amount, max)`** — legal between hands or
while the seat is folded; adds to `pending`, which lands on the stack (and on
`bought`) when the next hand is dealt; the stack plus pending may not exceed
`max`.

**`PokerTable`** gains:

- `beforeNextHand(summary) → Promise` — called after a hand ends; the next
  deal waits for it to resolve, retrying on failure; `saving` is true in the
  view after 1 second of waiting.
- `closeAfterHand()` — no new hand deals; `onClosed` fires when the current
  one ends (at once if none is running).
- No automatic CPU rebuys when there are no CPUs (credit tables can't seat
  them).

## Table behaviour

**Hosting and joining.** CREATE on the CREDITS tab asks for the tier, public
or private, and a buy-in. A joiner picks a buy-in. The buy-in panel has a
slider and an exact-amount box between **min** (the tier min, raised by the
rathole rule, with the reason and when it ends) and **max** (the tier max or
the balance, whichever is lower). If the balance can't cover the minimum,
SIT is disabled with the reason, and CLAIM shows if eligible. Joining a
second credit table is refused: "You're already at table HIGH ROLLERS".

**Dealt in.** Newcomers and players back from sitting out show WAITING FOR
BIG BLIND until their big blind (see the engine).

**During play.** The 20s turn clock, sitting out after two timeouts and
standing up after five minutes out all stay. ADD CHIPS (REBUY at 0) opens the
buy-in panel; the credits leave the balance at once and land on the stack
before the next deal.

**Between hands** the table saves (`credit_hands`, every `credit_seats`
stack, `hand_start_stack` for the next hand) before it deals.

**Leaving.** LEAVE asks "Your 2,340 credits go back to your balance."

- Not in a hand, or folded: the stack is cashed out at once.
- In a hand with decisions left: the hand folds, the rest is cashed out.
- All-in: the seat shows LEFT, the board runs out, and the final stack is
  cashed out when the hand ends.

Sit-out kicks and the 60-second disconnect grace end the same way. A player
stood up for sitting out also leaves the table's chat room (a leftover from
the poker launch).

**Closing.** The host's CLOSE TABLE shows "Table closing after this hand" and
takes effect when it ends; every stack is cashed out. If the host leaves, the
next player becomes host. The last player out ends the table.

**Restart.** At boot every `credit_seats` row returns to its balance
(`restart_return`): `hand_start_stack` (the stack before the voided hand,
or the saved stack if none was running) plus `pending`.
The player's next `GET /api/credits/me` carries "The server restarted. Your
2,340 credits from table HIGH ROLLERS are back in your balance."

**The public list** updates a table's seat count when someone sits or stands,
not only after the next hand (a leftover from the poker launch).

**Recording.** A credit table is a poker session as today, with
`poker_tier` set; `credit_hands` is the per-hand record for credits. The
profile's Poker stats get a Free / Credits filter.

## CLAIM, balance and leaderboard

**CLAIM** sits under the balance on the CREDITS tab:

- **CLAIM +340** — eligible: tops up to exactly 1000.
- **NEXT CLAIM IN 14h 20m** — the 24 hours haven't passed.
- **OVER 1,000: NOTHING TO CLAIM**.
- Email-only: "Link Google or Discord to play for credits". Frozen: "Credit
  play is suspended on this account". Guests: "Sign in to play for credits".

The main menu's profile corner shows the credit balance for signed-in
players.

**Leaderboard** (`/leaderboard`, from the CREDITS tab and the profile): rank,
avatar, NAME#TAG, total, and an AT TABLE tag when part of the total is live
chips. Everyone sees the top 100; your row is highlighted, and if you're
outside it a YOUR RANK block shows the 5 above you, you, and the 5 below. The
profile shows "Credits 12,340 · rank #57".

## Anti-abuse and the admin page

**Pair flows.** For each credit hand in the last 30 days, each losing seat's
loss is shared among that hand's winners in proportion to what they won.
Summing gives a flow from every loser A to every winner B.

**A pair is flagged** when all hold:

- A → B is at least **1,000** credits;
- that's at least **60%** of everything A lost in the window;
- B → A is at most **20%** of A → B;
- it isn't dismissed (or new flow arrived since).

**Clues shown with each flag** (not flags on their own): A's account age,
A's claim count, the share of the pair's hands at private tables, and **big
folds** — hands where A put half their stack or more in, then folded to B.

**`/admin`** (admins only; anyone else sees the not-found page):

1. **Economy check** — balances, at tables, granted, claimed, removed; OK or
   MISMATCH.
2. **Flagged pairs** — newest flow first, with the clues.
3. **Pair detail** — every shared hand replayed from its event log with both
   players' hole cards. Actions, each needing a note and each written to the
   ledger: **RETURN** (B → A) or **REMOVE** (B → nobody), the amount
   pre-filled with the net flow; **FREEZE / UNFREEZE** either account;
   **DISMISS**.
4. **Account lookup** by NAME#TAG — balance, seat, frozen state, full ledger.

`ADMIN_USER_IDS` (comma-separated user ids) is a new server setting:
`sync: false` in `render.yaml`, set in the Render dashboard before pushing.

## Browser

- `LobbyPoker` → FREE | CREDITS tabs. CREDITS: balance, CLAIM, LEADERBOARD,
  the credit table list with tier tags, CREATE with a tier picker, and the
  buy-in panel (`src/components/credits/`: `BalancePanel`, `ClaimButton`,
  `BuyInPanel`).
- `GamePoker`: WAITING FOR BIG BLIND and LEFT seat tags, ADD CHIPS / REBUY
  into the buy-in panel, the LEAVE confirm with the amount, "Saving…", and
  "Table closing after this hand". No +CPU at credit tables.
- New pages `/leaderboard` and `/admin` (`src/pages/Leaderboard.jsx`,
  `src/pages/Admin.jsx`).
- Main menu balance; profile credits line and Free / Credits poker filter.
- All in the hall's pixel style (`docs/STYLEGUIDE.md`).
- `docs/poker-rulebook.md` and `PokerRules.jsx` get a "Credit tables"
  section; `docs/ARCHITECTURE.md` gets a credits section.

## Errors and edge cases

- Two buy-ins, claims or top-ups at the same instant: the account row lock
  serializes them; the second sees the new balance.
- A buy-in that fails after the database step (e.g. the seat was taken a
  moment earlier): the credits are cashed back out in the same request.
- A socket for a guest or a non-playing account sending credit events gets
  the same reasons the UI shows.
- A player who signs in on a second device while seated reaches the same
  seat (the player key is the user id), as today.
- An all-in player who left and whose hand is then voided by a restart gets
  their `hand_start_stack` back.
- A mismatch from `check.js` at boot is logged loudly; play continues (the
  admin page shows it in red).

## Testing

- **Unit** (`tests/unit/poker-*.test.js`): waiting for the big blind
  (heads-up, empty seats, the button moving past a waiting seat, back from
  sitting out, a table that can't start without them); `addChips` limits and
  timing; all-in leavers playing out; the seeded simulation with top-ups and
  leavers still conserving chips; the copy check.
- **Table** (fake timers): the save step holding the next deal, `saving`
  after 1s, retry after a failure; `closeAfterHand`.
- **Database** (`TEST_DATABASE_URL`): every CLAIM rule; buy-in min/max and
  the rathole rule; concurrent buy-ins can't overdraw; hand saving;
  `returnAllSeats` including voided hands; reversals never negative; frozen
  accounts; flags on crafted dumping hands and not on fair play; leaderboard
  ties and the ±5 block; lockdown on the new tables; a randomized run of
  thousands of operations ending with `check.js` OK.
- **Real sockets**: two signed-in players create and join a credit table,
  play hands, top up, leave, and the balances come out right; a reconnect
  mid-hand; recording end to end through the server; a server killed
  mid-hand and restarted returns every stack.
- **UI** (jsdom): `BuyInPanel` limits and the rathole message; `ClaimButton`
  states; the YOUR RANK block; `/admin` refusing non-admins.
- **Browser**: the lobby tabs, a buy-in, a credit table, the leaderboard and
  the admin page shown to the user before calling it done.

## Build order

Each step is a commit; nothing is pushed until the user says so, and the site
works after every step.

1. Engine settings and `addChips` (+ copies).
2. Migration 009, `accounts.js`, `check.js`, credits HTTP routes.
3. Credit tables on the server (`tables.js`, sockets, restart return), plus
   the two poker leftovers.
4. Lobby and table UI.
5. Leaderboard and profile.
6. Flags and the admin page.
7. Docs; one independent review at the end.

## Out of scope

Spending credits on anything, buying credits, rake, tournaments, credit play
for other games, automatic freezing, notifications to admins, email
confirmation (email-only accounts stay out of credit play until it exists).
