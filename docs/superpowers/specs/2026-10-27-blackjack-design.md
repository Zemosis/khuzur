# Blackjack — design

**Date:** 2026-10-27
**Status:** draft, awaiting the user's approval
**Ships as:** 2.0.0 (a new game is a major release, per `CLAUDE.md`)

## Intent

Blackjack is the hall's fourth game, played like at a real casino table.
Players play against the dealer (the house), not against each other. A table
can be shared with friends or played alone. As with poker, there are **free
tables** (play chips, anyone) and **credit tables** (real credits, ranked).

The user's guiding line: *"just like real life"*. If you are good or lucky,
you can win as many credits as the cards give you. No stake tiers, no table
maximum, no daily win limit.

## Goals, non-goals, anti-goals

**Goals**
- Standard casino Blackjack rules, a casino half-moon table, and a hooded
  dealer that fits the dungeon card hall.
- Free and credit tables, public or private, 1–5 players, played alone or
  together.
- Credit play is as safe as poker's: no credit is ever created or lost by a
  bug, a crash, a disconnect or a race. Every movement is in the ledger, and
  the economy check still balances.
- Records, profile stats, XP and gold, the match page, and a rulebook page,
  like the other games.

**Non-goals**
- CPU players. Empty seats stay empty, and the dealer is the only non-human.
- Side bets, surrender, several betting spots per player, or even-money as a
  separate offer (taking insurance on a blackjack is the same thing).
- Changes to poker, Muushig or Thirteen.

**Anti-goals** (would be a failure even if it works)
- The dealer's face-down card or the shoe's order reaching any browser before
  it is revealed.
- A bet cap, stake tiers or a win limit on credit tables. The user rejected
  these explicitly, after seeing the leaderboard trade-off (see "Settled
  trade-off" below).
- Showing any rating or Elo. Credits are the ranking.
- Emoji or symbol glyphs in UI text (`docs/STYLEGUIDE.md` §3). Card suits on
  cards are fine.

## Settled trade-off: unlimited bets vs. the leaderboard

Blackjack has a house edge (about 0.5% with perfect play, around 2% for
typical players), so every credit won from the dealer is luck. CLAIM refills
a balance to 1,000 once a day, which makes going all-in a free daily lottery
ticket. The odds of turning 1,000 into 20,000 in a day are about 4–5% with no
cap, and a cap barely changes that unless it's tiny. The user saw these
numbers and chose real-casino freedom anyway: no cap and no win limit. **Do
not add guards against this.** If it becomes a problem, that's a later product
decision.

## Rules (my calls, approved as "standard casino rules")

| | |
|---|---|
| Shoe | 6 decks (312 cards), shuffled with a cryptographic RNG on the server. When the cut card (about 75%, card 234) is reached, the shoe is reshuffled before the next round. The count is never shown |
| Dealer | Peeks for blackjack when showing an Ace or a 10-value card. **Stands on all 17s**, soft 17 included |
| Payouts | Win 1:1, blackjack 3:2, insurance 2:1, push returns the bet |
| Blackjack | Ace + 10-value as the first two cards of an unsplit hand. A 21 made after a split is 21, not blackjack. Player blackjack vs. dealer blackjack is a push |
| Double | On any first two cards, including after a split (not on split Aces). One more card, then the hand stands. Costs the original bet again |
| Split | Any two cards of equal value (K+10 counts as a pair), up to 4 hands. Split Aces get one card each and can't be resplit or hit. Each split costs the original bet again |
| Insurance | Offered when the dealer's up card is an Ace, before the peek. Costs half the bet (rounded down to a whole credit; not offered if that's 0) |
| Dealer blackjack | Found by the peek, so the round ends before any player acts. Only the original bets are lost |
| Bets | Minimum 10. Maximum: your whole balance (credits) or all your chips (free). Doubles, splits and insurance need the extra amount available, or the button is disabled |

## The table

**Layout (user picked: casino half-moon).** The felt is a half-moon: a flat
edge at the top and a curve at the bottom, in the hall's felt and oak colors.
- **Dealer:** sits above the flat edge. The dealer's cards lie just below it,
  with the hand total beside them.
- **Shoe and discard tray:** on the flat edge, the shoe at screen right (the
  dealer's left, as in a casino) and the discard tray at screen left.
- **Rules print** across the felt under the dealer's cards: "BLACKJACK PAYS 3
  TO 2 / DEALER STANDS ON ALL 17s · INSURANCE PAYS 2 TO 1".
- **Five seats** along the curve. Each has a betting circle (chips plus the
  bet amount), the player's cards above the circle with a total tag
  (`7 / 17` for soft hands, BUST, BLACKJACK), and the player's plate (avatar,
  name, balance or chips) outside the felt.
- **Seat 1 ("first base")** is at screen right, the dealer's left, and play
  goes right to left on screen.
- **Your controls** sit in a bar under the table.
- **Split hands** sit side by side above the seat's circle, each with its own
  total and bet. The hand being played is highlighted.

**Dealer (user picked: "The Hooded House").** A faceless figure in a purple
hooded cloak (`mist`/`dusk`) with a void-black face and two gold (`gold`)
eyes, with a gold clasp down the front. It sits in a gold-framed portrait
above the flat edge.
- The 16×16 sketch below is the brief, not the final art. The builder may
  redraw it at higher detail in the same spirit.
- The dealer speaks through a speech bubble beside the portrait (reuse
  `ChatBubble` if it fits): "PLACE YOUR BETS", "INSURANCE?", "DEALER HAS
  BLACKJACK", "DEALER BUSTS", "DEALER HAS 19".

```
......pppp......   p = #463a78 (cloak)
.....pppppp.....   P = #2a234d (cloak shadow)
....pppppppp....   V = #0a0712 (face void)
...ppPPPPPPpp...   Y = #f4c430 (eyes)
...pPVVVVVVPp...   G = #c89820 (clasp)
..pppVVVVVVppp..
..ppVYYVVYYVpp..
..ppVVVVVVVVpp..
..pPVVVVVVVVPp..
..pppPVVVVPppp..
.pppppPVVPppppp.
.ppppppGGpppppp.
pppppppGGppppppp
pppppPPGGPPppppp
ppppPPPGGPPPpppp
pppPPPPGGPPPPppp
```

The approved mockups (layout, dealer, round flow) are in
`.superpowers/brainstorm/21562-1793119236/content/` on the user's machine
(`table-layout.html` option A, `dealer-look.html` option C,
`round-flow.html`). That folder is git-ignored, so this section is the record.

**Phones.** The same half-moon scales down. The chip rack and action buttons
wrap onto two rows. *(my call)* Follow `docs/STYLEGUIDE.md` §9.

## A round

Timers are my calls. Put them in a `DELAYS` object like poker's, so tests can
shrink them.

1. **Betting (15 s).** The window opens when a round can start: at least one
   seated player.
   - Bar: chip buttons 10 / 50 / 100 / 500 / 1K / 5K add to your bet, and an
     exact-amount box. CLEAR, REBET (last round's bet), x2 (doubles the
     current bet) and DEAL (ready).
   - Each seat shows READY, BETTING or SITTING OUT.
   - The window closes early when every seated player with a bet has pressed
     DEAL **and** every seated player has either bet or can't (busted with no
     rebuy). A player who hasn't bet when it closes sits the round out and
     keeps the seat.
   - If nobody bet, the window just reopens.
2. **Deal.** At a credit table the bets are moved first (see Money), then
   cards come out casino-style: one card to each betting seat from first
   base, then the dealer's up card, then the second card to each seat, then
   the dealer's hole card face down.
3. **Insurance (8 s)**, only when the dealer shows an Ace. Everyone with a
   bet answers at once with YES or NO. No answer counts as NO.
4. **Peek.**
   - If the dealer shows an Ace or a 10-value card and has blackjack: the hole
     card flips, insurance pays, and every hand settles (player blackjacks
     push, the rest lose the original bet). Go to Results.
   - Otherwise: insurance bets are lost, and turns begin. Player blackjacks
     are paid and settled at the end with everyone else.
5. **Turns (15 s each)**, from first base. Each hand of the seat (after splits)
   takes its turn.
   - Buttons: HIT, STAND, DOUBLE, SPLIT, each enabled only when legal and
     affordable.
   - A timeout stands. A disconnected player's turn is not skipped early: the
     timer runs out and the hand stands.
   - A blackjack or a 21 ends the hand's turn automatically.
6. **Dealer plays** if any hand isn't already settled (busted or blackjack):
   it flips the hole card and draws to 17, standing on soft 17.
7. **Results (5 s).** Every hand shows its result at once: `+amount` in
   `poison`, `-amount` in `rose`, PUSH in `mist`, BLACKJACK in `gold`. The bar
   shows "YOU WON 1,125" or "YOU LOST 500", plus the round's XP and gold.
   Cards sweep to the discard tray, then betting reopens.

## Seats, joining, leaving

- **Joining** a table seats you in the first free seat from first base, the
  same as poker. Between rounds (betting phase, before you bet), an empty
  seat shows **SIT**, and clicking it moves you there. *(my call: no watchers,
  the table is full at 5)*
- **Sitting out.** Skipping the betting window 5 rounds in a row stands you up
  and returns you to the lobby, like poker's sit-out kick.
- **Leaving or disconnecting mid-round.** Your hands stand where they are
  (and insurance counts as NO), then settle with the round. At a credit table
  the payout goes to your balance even though you've gone. Free chips just go
  away when you leave.
- **Disconnects.** The seat is held about 60 s (match poker's reconnect
  handling), and a reconnecting tab sees the round as it is.
- **The table** closes when the last player leaves. The host can end it
  between rounds, like poker. *(my call, matching poker)*
- **Credit tables** allow one credit table at a time, across all games (the
  existing rule). Seated at a credit Blackjack table counts, even with no bet
  on the table. That rule is enforced only by a `credit_seats` row existing
  (`refuseSecondTable` in `accounts.js`), so a Blackjack player's seat row is
  created **when they sit**, with stack 0, and deleted when they leave. A
  frozen account is stood up after the current round.

## Money

### Free tables
You sit down with **1,000 play chips**. When your chips are below the minimum
bet between rounds, **REBUY** brings them back to 1,000. Chips live only in
the table's memory. *(my call, matching free poker)*

### Credit tables
- **Who:** signed-in accounts with a linked Google or Discord login that
  aren't frozen. Guests and email-only accounts see the existing explanation
  and link prompt. There's no public `canPlayCredits`: the check is the private
  `whyCantPlay()` in `accounts.js`, used inside `buyIn` and `placeStake`.
  Blackjack's sit and bet steps must call it too.
- **No buy-in and no tiers.** Bets come straight from the balance.
- **Bet placed:** when the betting window closes, each credit bet moves from
  the balance to the player's `credit_seats` row, in one transaction per
  player that locks the account (the existing `lockAccount` pattern), and
  writes a ledger row.
  - A bet that the balance can no longer cover (for example, spent at
    another tab) is refused, and that player sits the round out.
  - Doubles, splits and insurance move their extra amount the same way at the
    moment of the click. The table waits for the move to succeed before
    dealing the card.
- **Round settled:** one transaction for the whole table.
  - Each betting seat's payout goes from its seat row to its balance, with a
    ledger row.
  - The seat row's stack returns to 0. The row stays (see "one credit table at
    a time" above), and it's deleted only when the player leaves.
  - The round is written to `credit_hands` with each seat's result and the
    round's **house net**.
  - The next betting window waits for this save, retrying like poker's
    `beforeNextHand`. While it waits, the table shows "Saving…".
- **House net** = everything bet (bets, doubles, splits, insurance) minus
  everything paid out (stakes returned included). Positive means the house
  won, negative means it paid.
- **Economy check** (`server/credits/check.js`) becomes:
  `balances + at tables = granted + claimed − removed − won by bots − house net`.
  The admin page shows the house net as its own line.
- **Crash or restart mid-round:** the existing `returnAllSeats()` at boot
  returns every seat's stack to its balance (`restart_return`), so the round
  never happened. It already covers every seat row whatever its game.
  - Seat rows at 0 must not leave a "0 credits returned" notice.
  - Graceful shutdown (`shutDown` in `server/index.js`) calls
    `l.credits.release("restart_return")` on every credit lobby, so the
    Blackjack credit wrapper must provide `release()` too.
- **CLAIM and the leaderboard** count credits on the table, as they already
  do for seats. A Blackjack credit round counts as the account's first credit
  hand for the leaderboard (`first_hand_at`).
- **Pair flags** don't apply: credits never move between players here. Today
  `flaggedPairs()` / `pairFlows` (`server/credits/flags.js`) read every
  `credit_hands` row with no game filter, and would flag two players who won
  and lost against the dealer at the same table. Add a
  `game_type <> 'blackjack'` filter there.

## Progression

These are my proposals, which the user didn't object to.
- **XP and gold:** each round a signed-in player had a bet in pays like a
  poker hand. That's 4 XP + 3 gold, or 6 XP + 8 gold if the round's net
  result for that player is above 0.
- **Spacing:** a round pays only if it ends at least 30 s after that player's
  last paid round at the table. Reuse `pokerHandReward` and the spacing
  constant, or add a `blackjackRoundReward` with the same numbers.
- **Who gets paid:** free and credit tables alike, alone or with others. A
  round alone isn't against CPUs, so it pays.
- Guests get nothing.

## Lobby and navigation

- **Main menu:** a **BLACKJACK** tile next to the others (with its live
  table count), opening `/lobby-blackjack`. The table page is
  `/game-blackjack`, added to `GAME_ROUTES` in `src/lib/games.js` so codes and
  invite links open it.
- **Lobby:** the shared `GameLobby`, with FREE and CREDITS tabs.
  - A new credit kind (`credits: { kind: "house" }`) shows no buy-in or stake
    picker.
  - HOST: a name plus public or private.
  - JOIN: the public list shows seats taken out of 5, or a code or invite
    link.
- **PLAY ALONE** replaces the "Practice vs CPU" panel for this game. One click
  makes a private table on the current tab (free or credit) and seats you.
  Friends can still join with its code.

## Records and stats

- **Database:** a migration adds the `blackjack` game type. An enum value
  can't be used in the transaction that adds it, so views that need it go in
  a second migration, as 007/008 did.
- **One session per table** (`game_sessions`), with one `game_players` row per
  player per table, exactly like poker. `unique (session_id, player_key)`
  holds, and a rejoin merges into the same row via `rosterEnter`. The
  `stats` hold the following:
  - rounds played and won
  - blackjacks
  - doubles and splits
  - biggest win
  - net result
- **Rounds:** every round (free and credit) is kept for the match page, in
  `game_rounds` rows with per-seat hands, bets and results plus the dealer's
  hand. Credit rounds also get their `credit_hands` row for the money.
- **Profile:** a Blackjack section, split into free and credits like the
  others. It shows rounds, win rate, blackjacks, biggest win and net, from a
  `player_blackjack_stats` view grouped by stakes.
- **Match history:** each table you played at is one entry. The match page
  (`/match/:id`) shows your rounds in order: your hands, the dealer's hand and
  the result of each. Copy poker's path: `server/matches.js` sends poker to
  `pokerTable()`, which only a signed-in player who sat there can open, drawn
  by `src/components/match/PokerTablePage.jsx`. Blackjack gets the same
  treatment.
- **Overall stats** *(my call: follow poker)*. A dealer table has no places
  or winners, so Blackjack stays out of Overall's games, wins, losses, places
  and streaks, the same way poker does.
  - Exclude `blackjack` from `player_match_history` (migration 013 excludes
    only poker), and from `creditMatchOf()` in `matches.js`. Both take
    `limit 1` from `credit_hands` per session, which would pick an arbitrary
    round.
  - Add Blackjack back only to recent play, time played and credits, the way
    `withPoker` does in `server/stats.js`.
- **Leaderboard ranking:** unchanged (balance plus credits on the table).
  - **The source breakdown gains a Blackjack column** *(my call)*. The
    leaderboard splits each player's total by game, and the list is
    hard-coded in three places:
    - `server/credits/leaderboard.js` (`filter (where game_type = …)`)
    - `src/pages/Leaderboard.jsx` (`GAMES`; the grid is `repeat(3,104px)`
      today)
    - `src/components/credits/SourceBreakdown.jsx` (`SOURCES`)
  - Without it, a player's sources would stop adding up to their total.
- **Game log** lines, for example:
  - "ANN bets 200"
  - "ANN doubles on 11"
  - "BOB splits 8s"
  - "Dealer has blackjack"
  - "Dealer busts with 25"
  - "CAT wins 400"
  - "NOVSH sits out"
  - "NOVSH left"
- **Rulebook:** a Blackjack page in `RulebookPicker`, written from the Rules
  table above (also `docs/blackjack-rulebook.md` beside the others).
- **Patch notes:** a `## 2.0.0` section at the top of `CHANGELOG.md`, with
  player-facing notes.

## Architecture

Follow the poker split. The builder chooses the exact file names.

- **Rules** in `src/utils/blackjack/` (card values, soft and hard totals,
  blackjack, legal actions, dealer play, settlement and payouts), with a
  byte-identical copy in `server/game/blackjack/`. Add the pairs to
  `tests/unit/rules-copies.test.js`.
- **Table** (`server/game/blackjack/table.js`): the phases, timers and seat
  handling. It takes an injected `rng`, `delays` and callbacks
  (`onState`, `onRoundEnd`, `beforeNextRound`), so it's testable with fake
  timers and a fixed shoe.
- **Credit bridge** (`server/credits/`): a class wrapping the table, like
  `CreditTable`, with one queue per table for every money move, plus
  `accounts.js` functions for placing a bet or extra (balance to seat) and
  settling a round (seats to balances, plus the `credit_hands` row).
  - New `credit_kind` values (for example `bet` and `payout`).
  - **Credit marker:** a new `credit_tier` value, `HOUSE`, marks a Blackjack
    credit table (on the lobby, `game_sessions.credit_tier`, seats and hands).
    The code treats "has a tier" as "is a credit table" everywhere:
    - `GameLobby.jsx`'s `!!l.tier === credit` tab filter
    - lobby creation's `tier: credit ? tier : null`
    - stats.js and `player_poker_stats` filtering on
      `credit_tier is not null`

    A null tier would file Blackjack credit play as free. `HOUSE` is never
    shown to players as a tier.
    - `creditRefusal` and `isTier` (LOW/MID/HIGH only) must accept `HOUSE`
      for Blackjack, and only for Blackjack.
    - The poker and stake tier pickers must not offer it.
  - `credit_hands` gains `house_net bigint not null default 0`.
  - `game_type = 'blackjack'` on seats, hands and ledger rows.
- **Server wiring:** `server/index.js` only gains thin hooks (a game config
  entry, lobby create/join, socket handlers). It's already 1,400+ lines, so
  put Blackjack's socket handlers in their own module.
- **Socket events:** prefixed `bj_`, for example:
  - `bj_sit { seat }`
  - `bj_bet { amount }`
  - `bj_ready`
  - `bj_insurance { take }`
  - `bj_action { type: HIT | STAND | DOUBLE | SPLIT }`
  - `bj_rebuy`

  The server validates everything (phase, turn, amounts, balance).
- **Views:** each socket gets its own view. The dealer's hole card is
  `null` until it's revealed, and the shoe only appears as a count of cards
  left before the cut card (or not at all).
- **Client:** `src/pages/blackjack/` (lobby, game) and
  `src/components/blackjack/` (half-moon table, seat, betting circle, dealer
  portrait, controls bar). Reuse `PixelCard`, `ChipStack` and `cardMotion`
  where they fit, and `PixelUI`/`pixelTokens` for everything else.

## Testing

- **Rules:**
  - totals (soft and hard, multiple Aces)
  - blackjack vs. 21
  - split rules (equal value, up to 4 hands, Aces)
  - double rules
  - insurance
  - dealer draws and S17
  - every payout, including push and blackjack vs. blackjack
- **Table** (fake timers, fixed shoe):
  - the betting window and early close
  - sitting out, and the 5-round stand-up
  - deal order
  - insurance and peek
  - turn order across splits, and timeouts
  - leaving or disconnecting mid-turn
  - the cut-card reshuffle
  - the hole card is never in a view before the reveal
- **Money (server DB tests):**
  - the economy check balances after wins, losses, pushes, blackjacks,
    doubles, splits and insurance
  - a refused bet
  - leaving mid-round still pays
  - a crash mid-round is returned at boot
  - one credit table at a time across games
- **UI:** the lobby tabs and PLAY ALONE, the controls enabling and disabling
  by phase, and the result tags.
- **Before shipping:** a real-browser walkthrough of a free table alone, a
  credit table with two accounts, and a phone-width check.

## Left to the builder

- Exact file, component and event names, as long as they follow the
  patterns above.
- The final dealer art (in the brief above).
- The chip denominations' colors.
- Animation timing.
- How the game log reuses the existing log component.
