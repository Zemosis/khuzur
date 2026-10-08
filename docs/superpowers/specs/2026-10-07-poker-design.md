# Poker — design

**Goal:** No-limit Texas Hold'em in the hall: a 6-seat oval table you can host,
join by code or invite link, and drop in and out of between hands; CPUs at
three levels; a solo practice mode in the browser. Server-authoritative like
Thirteen and Muushig. Played with free chips — the credit economy is a
separate, later project (see **Out of scope**).

## Decisions

| | |
|---|---|
| Game | No-limit Texas Hold'em |
| Table | A new oval felt, 6 seats, 2 players to start |
| Who can play | Anyone, guests included (free chips) |
| Chips | 1000 free chips on sitting down, blinds 5/10, free rebuy to 1000 when broke |
| CPUs | At online tables (host adds them) and in practice; EASY / MEDIUM / HARD |
| Joining mid-game | Take an empty seat, dealt in from the next hand |
| Leaving mid-hand | Your hand folds; the seat empties (no CPU takes it over) |
| Turn clock | 20 seconds, then check if free, else fold |

## Rules

**A hand.** The button moves one occupied seat left each hand; the next two
seats post the small and big blind (5 and 10). Each player is dealt 2 hole
cards. Betting rounds: preflop (first to act is left of the big blind), flop
(3 board cards), turn (1), river (1); post-flop the first active seat left of
the button acts first. The best 5-card hand from 2 hole + 5 board wins.

**Heads-up** (2 players dealt in): the button posts the small blind and acts
first preflop, last after. A table dropping from 3 to 2 switches to this on
the next hand.

**Actions.** Fold; check (nothing to call); call; bet or raise (a raise is at
least the last full bet or raise, and the first bet at least the big blind);
all-in for any stack. An all-in short of a full raise does not reopen betting
to players who have already acted. A player who can't cover a blind posts what
they have, all-in.

**Pots.** Side pots are built from all-in amounts; each is won by the best
hand among the players in it. Ties split; an odd chip goes to the first winner
left of the button. A hand where everyone else folds is won without a
showdown, cards unshown.

**Showdown.** The last player to bet or raise on the river shows first (the
first active seat left of the button if the river was checked through); the
others show in turn order, and a hand that can't win may be mucked unshown.
If all but one active player are all-in, the rest of the board is dealt out
with a pause before each card and no more betting.

**Hand ranking.** High card, pair, two pair, three of a kind, straight
(A-2-3-4-5 is the lowest), flush, full house, four of a kind, straight flush.
Ties break on kickers; suits never break ties.

**Seats and sitting out.** A newcomer sits in the first empty seat and is
dealt in from the next hand. Two turn timeouts in a row sit a player out:
they keep the seat and stack, aren't dealt in, and press **I'M BACK** to be
dealt in again next hand. Five minutes sitting out stands them up. An empty
stack at the end of a hand shows **REBUY** (back to 1000).

**Continuous play.** The host presses START once; after that hands follow
each other (4 seconds after the last one's pot is awarded) while 2 or more
seated players have chips and aren't sitting out. Below that the table shows
"Waiting for players…" and resumes on its own. There is no match end.

## Engine (`src/utils/poker/`)

Pure functions, no React or sockets, as Muushig's engine:

- `engine.js` — the hand state and its steps: `newTable`, `seatPlayer`,
  `standUp`, `startHand(state, rng)`, `act(state, seat, move)` →
  new state or a thrown rule error, `advance` (next street, showdown, award),
  `legalActions(state, seat)` (what the controls offer, with min/max raise).
  Every change appends to an event log (`blind`, `deal`, `act`, `street`,
  `show`, `award`) — the LOG tab and the stats read it.
- `hands.js` — `evaluate(cards)`: best 5 of up to 7, as a comparable score
  plus a name ("Two pair, kings and fives").
- `pots.js` — `buildPots(contributions, folded)` and `awardPots(pots, scores,
  buttonSeat)`.
- `ai.js` — `chooseAction(view, seat, level, rng)`, seeing only what that seat
  sees:
  - **EASY** — plays most starting hands, calls too often, rarely raises.
  - **MEDIUM** — starting-hand charts by position; after the flop bets and
    calls by made-hand strength and the price of calling (pot odds).
  - **HARD** — MEDIUM plus an equity estimate from a few hundred random
    run-outs against the players still in, bet sizes from that, and an
    occasional bluff or semi-bluff.

Online tables run byte-identical copies in `server/game/poker/`;
`tests/unit/muushig-copies.test.js` becomes a copy check for both games.

## Server

**`PokerGame`** (`server/game/pokerGame.js`), shaped like `MuushigGame`: owns
the full state and the deck, takes moves from a seat, plays CPU seats after a
short "thinking" delay (1–2.5s), runs the 20s turn clock, and reports through
`onState` / `onHandEnd`. Unlike the other games it also owns its seating:
`sit(key, name)`, `standUp(key)`, `rebuy(key)`, `sitIn(key)`, `addCpu(seat,
level)`, `removeCpu(seat)` — applied at once if no hand is running, otherwise
queued for the hand's end (a leaver's hand folds immediately).

**Moves** arrive as `poker_move { type: fold | check | call | raise | allin,
amount? }`; the seat is the socket's. Payloads are type-checked, the engine
judges them, and its errors come back as `move_rejected`. Table actions
(`poker_rebuy`, `poker_sit_in`) are their own events.

**Redaction** (`pokerView(state, seat)`): other players' hole cards become
`{ hidden: true }` until shown at a showdown; the deck never leaves the server.
Your own cards are always visible. The view carries `mySeat`, the clock's end
time (`turnEndsAt`, server-decided like the deal clock), and `legalActions`
for your seat.

**Lobbies.** `GAMES.poker` in `server/index.js`: 6 seats, `PokerGame`,
`pokerView`, state event `poker_state`. Poker skips the waiting-table step and
the rematch loop — the lobby is created with its `PokerGame` and START just
begins dealing — so `join_lobby`, `leave_lobby`, disconnect expiry and
`add_cpu` / `remove_cpu` call the game's seating methods for a poker lobby
instead of the shared seat logic. A table is full at 6 seated; a joiner never
replaces a CPU. The host's only powers after START are adding and removing
CPUs (between hands) and closing the table (`close_table`: hands in progress
fold back, everyone returns to the lobby). Host passes to the next seated
human; a table with no humans closes.

**Disconnects.** The usual 60s grace keeps the seat; the turn clock acts for
an absent player meanwhile. When the grace runs out the player is stood up.

## Browser

- `src/lib/games.js` — `poker: "/game-poker"`; the main menu's rack gets a
  Poker card.
- `src/pages/poker/LobbyPoker.jsx` — the shared `GameLobby` with Poker's
  title and accent, and practice levels.
- `src/pages/poker/GamePoker.jsx` — practice (the engine and CPUs in the
  browser, 5 CPUs at the chosen level) or online (plays `poker_state` through
  a queue, as Muushig does, so each street and chip movement animates).
- `src/components/poker/`:
  - `OvalTable` — the felt: a wide stepped-pixel oval, green with a wooden
    rim; the board's 5 card spots in the middle, the pot (and side-pot tags)
    above; 5 seat spots around the rim plus yours at the bottom. Holds the
    centered `TurnBanner`.
  - `PokerSeat` — avatar, name, stack; DEALER / SB / BB / ALL-IN / FOLDED /
    SITTING OUT tags; two card backs (faces at showdown); the current bet as a
    chip pile in front of the seat; the gold TURN tag, arrow and a draining
    clock bar on the seat whose turn it is. Empty seats show SIT, or +CPU for
    the host.
  - `BetControls` — FOLD, CHECK / CALL n, and a raise row: ½ POT, POT, ALL-IN,
    a slider and the exact amount, RAISE disabled below the minimum. Keys: F,
    C, R, Enter. On a phone the raise row is a drawer above FOLD and CALL.
  - `Showdown` — cards flip, the winning 5 light up, the hand's name pops over
    the winner, the pot slides to them.
- Your hand: your 2 cards large at the bottom with the `YourTurnMark`, and
  your best hand named under them as the board comes out.
- Sidebar (`TableChrome`): a scoreboard of stacks and each player's net since
  sitting down; CHAT; LOG from the event log ("ANN raises to 60", "MARS wins
  240 with two pair").
- Phone layout: the other seats in a strip above a smaller oval, as Thirteen.
- A seat joined mid-hand shows "Dealt in next hand".
- `docs/poker-rulebook.md` and the in-game RULES picker get Poker.

## Recording

Each online table is one `game_sessions` row (`game_type = 'poker'`) from
START until it closes; each hand is a `game_rounds` row (`seat_results`: seat,
stack before and after, net, folded street, shown hand name; `winner_seat` the
biggest winner). Each player is a `game_players` row with `final_score` = net
chips and `stats` = `hands_played`, `hands_won`, `biggest_pot`,
`vpip_hands` (voluntarily put chips in preflop), `showdowns`,
`showdowns_won`. `final_position`, `is_winner`, coins, exp and rating are
left empty for poker: chip results aren't placements, and rewards come with
the credits project.

Database (two files, because a new enum value can't be used in the
transaction that adds it):

- `007_poker_game_type.sql` — `alter type game_type add value 'poker'`.
- `008_poker_stats.sql` — `player_match_history` excludes `poker`, so wins,
  win rate, placements and streaks stay about placement games; a new
  `player_poker_stats` view sums the poker `stats` per player. The profile's
  Stats panel gets a Poker filter that reads it.

Practice games aren't recorded.

## Errors and edge cases

- A move out of turn, an illegal amount, or a move from a seat not in the
  hand: `move_rejected` with the reason; state unchanged.
- The turn clock and CPU timers are cleared when a hand ends, a seat stands
  up, or the table closes; a reconnect gets the current state including its
  own cards and `turnEndsAt`.
- Seating changes during a hand are queued and applied between hands, in
  arrival order.
- The button skips empty seats and seats not dealt in.
- A server restart ends every table (as for the other games); with free chips
  nothing is lost.

## Testing

- **Unit** (`tests/unit/poker-*.test.js`): hand ranking and tie-breaks
  (including the wheel and board-plays splits); side pots and odd chips;
  betting rules (min raise, short all-in not reopening, heads-up order, short
  blinds); `legalActions`; each CPU level choosing only legal actions; seeded
  simulations of thousands of hands asserting chips are conserved and every
  hand terminates; the copy check.
- **Server**: `PokerGame` with fake timers — turn clock, sit-out after two
  timeouts, stand-up after 5 minutes, seating queued mid-hand, rebuy, pause
  below 2 players; `pokerView` hides what it must; real-socket games joining
  mid-hand, leaving, reconnecting; recording (on Postgres when
  `TEST_DATABASE_URL` is set), including that poker stays out of
  `player_match_history`.
- **UI**: `BetControls` amounts and limits; seat tags and the turn clock;
  showdown reveal; joining mid-hand; phone layout.

## Out of scope

**Credits project (next):** credit balances (1000 to start; once every 24 hours from the last
claim, a player whose balance plus on-table stack is below 1000 can CLAIM back
up to 1000 — never above, so everything over 1000 is winnings),
signed-in-only credit tables with LOW 5/10 (200–1000), MID 25/50 (1000–5000)
and HIGH 100/200 (4000–20000) tiers and no CPUs, an all-time leaderboard
(top 100 for everyone; others see their rank ±5) counting balance plus
on-table stacks, a credit ledger, anti-dumping checks, and returning table
stacks to balances if the server restarts.

**Not planned:** tournaments, other variants (Omaha …), spectating, hand
history sharing.
