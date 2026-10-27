# Blackjack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Blackjack as the hall's fourth game: a five-seat casino half-moon table against a hooded dealer, free and credit tables, bets straight from the balance with no cap, and the records, stats, rewards and pages the other games have.

**Architecture:** Pure rules and table-state functions in `src/utils/blackjack/` (copied byte for byte to `server/game/blackjack/`), driven over time by a `BlackjackTable` class with injected timers and money hooks. Credit tables wrap it in a `CreditBlackjack` bridge that moves every bet through `credit_seats` and settles each round in one transaction. `server/index.js` treats Blackjack like poker: a self-seating table made with its lobby.

**Tech Stack:** React 19 + Vite + Tailwind 4 (client), Node + Express + Socket.IO (server), Postgres (via `pg`), Vitest (unit / server / ui projects).

**Spec:** `docs/superpowers/specs/2026-10-27-blackjack-design.md` — read it before any task. Where this plan and the spec disagree, the spec wins; say so in the task's review.

## Global Constraints

- Work on branch `feat/blackjack` off `main`. Never push; the user pushes.
- Commit messages: conventional, one line (`feat: …`, `test: …`). **No `Co-Authored-By` or any attribution trailer** (the user's standing rule overrides any harness default).
- Rules values (verbatim from the spec): 6 decks (312 cards), cut card at card 234, dealer peeks on Ace or 10-value, dealer stands on all 17s, blackjack pays 3:2, insurance pays 2:1, insurance costs half the bet rounded down (not offered if that is 0), split equal values up to 4 hands, split Aces one card each and no resplit, double on any first two cards incl. after split (not split Aces), minimum bet 10, no maximum, 5 seats, free tables start at 1,000 chips with REBUY to 1,000.
- Timers: betting 15 s, insurance 8 s, turn 15 s, results 5 s, 5 skipped betting windows stand you up, disconnect hold = the existing `DISCONNECT_GRACE_MS` (60 s).
- XP and gold: `pokerHandReward({ won })` per round with a bet (won = round net > 0), spaced by `POKER_REWARD_SPACING_MS`, free and credit, alone or not. Guests get nothing.
- The credit marker is the `credit_tier` value `HOUSE`. **`HOUSE` is never shown to a player**: wherever a tier is labelled, Blackjack credit tables read "CREDITS".
- The dealer's hole card and the shoe never reach a browser before the reveal.
- UI follows `docs/STYLEGUIDE.md`: no `border-radius` except the felt and chips (as in the approved mockups), no emoji or symbol glyphs in UI text (card suits on cards are fine), Press Start 2P ≥ 10px (tags 8–9px), VT323 ≥ 18px, colors from the palette tokens.
- Rules files edited in `src/utils/blackjack/` must be copied to `server/game/blackjack/` in the same commit; `tests/unit/rules-copies.test.js` enforces it.
- No new npm dependencies.
- Release: `CHANGELOG.md` gets `## 2.0.0 — D Month YYYY` (date of the push) per `CLAUDE.md`.

## Review Focus

1. **Double-clicking DOUBLE / SPLIT / insurance at a credit table** — the extra must be funded once and the second click refused ("Not your turn" / "You can't double now"); the economy check must still balance. Test: Task 5, "a second DOUBLE while the first is funding is refused".
2. **`HOUSE` leaking into the UI or crashing a tier lookup** — the lobby list does `TIERS[lobby.tier].smallBlind`, the profile prints `${m.tier} credits`, and the poker table page tints by `TIER_TONE[tier]`. Blackjack must read "CREDITS" and never throw. Tests: Task 8 ("lists a Blackjack credit table as CREDITS"), Task 10 ("a Blackjack credit table reads Credits, never HOUSE").
3. **Sitting at a credit Blackjack table with no bet, then trying a second credit table** (poker in another tab) — must be refused with "You're already at table …". Test: Task 4, "a seated player with no bet can't buy in at poker".
4. **Reconnecting mid-round** — the returning tab must see its own hands, the dealer's up card only, and the turn clock, with no hole card in the payload. Test: Task 6, "a rejoin mid-round gets a view without the hole card".
5. **Bad socket payloads** (`amount: "500"`, `-10`, `10.5`, `null`, an `action` of `"WIN"`, a `seat` of `9`) — refused with a reason, state unchanged, server alive. Test: Task 6, "junk bj_ payloads are refused".

---

## File Structure

**Create**
- `src/utils/blackjack/rules.js` (+ copy `server/game/blackjack/rules.js`) — cards, shoe, totals, payouts. No state.
- `src/utils/blackjack/engine.js` (+ copy) — the table state and every transition, `roundSummary`, `viewFor`.
- `src/utils/blackjack/table.js` (+ copy) — `BlackjackTable`: phases over time, timers, money hooks.
- `src/utils/blackjack/log.js` — event → log line (browser only).
- `server/game/blackjackTally.js` — a player's record at one table (their `game_players.stats`).
- `server/credits/blackjackTables.js` — `CreditBlackjack`, the credit bridge.
- `server/blackjackRoom.js` — the Blackjack view, delays and `bj_*` socket handlers.
- `server/db/migrations/016_blackjack_types.sql`, `server/db/migrations/017_blackjack.sql`.
- `src/pages/blackjack/LobbyBlackjack.jsx`, `src/pages/blackjack/GameBlackjack.jsx`.
- `src/components/blackjack/HalfMoonTable.jsx`, `BlackjackSeat.jsx`, `DealerPortrait.jsx`, `BetBar.jsx`, `ActionBar.jsx`, `BlackjackRules.jsx`.
- `src/components/match/BlackjackTablePage.jsx`.
- `docs/blackjack-rulebook.md`.
- Tests: `tests/helpers/blackjack.js`, `tests/unit/blackjack-rules.test.js`, `tests/unit/blackjack-engine.test.js`, `tests/unit/blackjack-table.test.js`, `server/tests/blackjackTally.test.js`, `server/tests/blackjack-socket.test.js`, `server/tests/db/blackjack-credits.test.js`, `server/tests/db/blackjack-table.test.js`, `tests/ui/GameBlackjack.test.jsx`, `tests/ui/BlackjackLobby.test.jsx`.

**Modify**
- `tests/unit/rules-copies.test.js` — add `["blackjack", ["rules.js", "engine.js", "table.js"]]`.
- `server/credits/accounts.js`, `server/credits/check.js`, `server/credits/flags.js`, `server/credits/leaderboard.js`.
- `server/index.js`, `server/persistence.js`, `server/stats.js`, `server/matches.js`.
- `src/lib/games.js`, `src/App.jsx`, `src/pages/MainMenu.jsx`, `src/components/lobby/GameLobby.jsx`, `src/components/credits/CreditHostPanel.jsx`.
- `src/pages/Profile.jsx`, `src/pages/Leaderboard.jsx`, `src/components/credits/SourceBreakdown.jsx`, `src/pages/MatchDetail.jsx`, `src/components/RulebookPicker.jsx`.
- `CHANGELOG.md`.

---

### Task 1: Rules — cards, shoe, totals, payouts

**Files:**
- Create: `src/utils/blackjack/rules.js`, `server/game/blackjack/rules.js` (identical copy), `tests/helpers/blackjack.js`
- Modify: `tests/unit/rules-copies.test.js` (add the `blackjack` row with `rules.js` now; Tasks 2–3 add `engine.js`, `table.js`)
- Test: `tests/unit/blackjack-rules.test.js`

**Interfaces:**
- Produces (all from `rules.js`):
  - Constants `DECKS = 6`, `CUT_CARD = 234`, `MIN_BET = 10`, `MAX_HANDS = 4`, `MAX_SEATS = 5`, `FREE_CHIPS = 1000`, `RANKS` (`"2"…"10","J","Q","K","A"`), `SUITS` (`"♠","♥","♦","♣"`).
  - `secureRandom(): number` and `shuffle(cards, rng)`, same as `src/utils/poker/engine.js` (copy them; don't import across games).
  - `makeCard(rank, suit, deck = 0) → { id: \`${rank}${suit}.${deck}\`, rank, suit }`
  - `createShoe(rng = secureRandom) → Card[]` (312 cards, shuffled).
  - `cardPoints(card) → number` (2–10; J/Q/K 10; A 1).
  - `handTotal(cards) → { total, soft }`, where `soft` means an Ace is counted as 11.
  - `isBlackjack(hand) → boolean`, with `hand = { cards, fromSplit }`.
  - `dealerShouldHit(cards) → boolean` (total < 17; stands on soft 17).
  - `insuranceCost(bet) → Math.floor(bet / 2)`.
  - `settleHand(hand, dealerCards) → { result: "blackjack" | "win" | "push" | "lose", payout }`. `hand.bet` already includes a double. `payout` is everything returned, stake included.
- Test helper `tests/helpers/blackjack.js`:
  - `cards("A♠ K♥ 10♦") → Card[]` (deck 0).
  - `riggedShoe("…ids in deal order…") → Card[]`, padded to 312 with `2♣` so the cut card isn't reached.

- [ ] **Step 1: Write the failing tests** in `tests/unit/blackjack-rules.test.js`

```js
import { describe, it, expect } from "vitest";
import * as R from "../../src/utils/blackjack/rules.js";
import { cards } from "../helpers/blackjack.js";
const hand = (ids, extra = {}) => ({ cards: cards(ids), bet: 100, fromSplit: false, ...extra });

describe("blackjack rules", () => {
  it("builds a 6-deck shoe of 312 distinct ids", () => {
    const shoe = R.createShoe(() => 0.5);
    expect(shoe).toHaveLength(312);
    expect(new Set(shoe.map((c) => c.id)).size).toBe(312);
  });
  it("counts aces soft and hard", () => {
    expect(R.handTotal(cards("A♠ 6♣"))).toEqual({ total: 17, soft: true });
    expect(R.handTotal(cards("A♠ 6♣ 10♦"))).toEqual({ total: 17, soft: false });
    expect(R.handTotal(cards("A♠ A♥ 9♦"))).toEqual({ total: 21, soft: true });
    expect(R.handTotal(cards("K♠ Q♥ 5♦"))).toEqual({ total: 25, soft: false });
  });
  it("a split 21 is not blackjack", () => {
    expect(R.isBlackjack(hand("A♠ K♥"))).toBe(true);
    expect(R.isBlackjack(hand("A♠ K♥", { fromSplit: true }))).toBe(false);
    expect(R.isBlackjack(hand("7♠ 7♥ 7♦"))).toBe(false);
  });
  it("the dealer stands on soft 17", () => {
    expect(R.dealerShouldHit(cards("A♠ 6♣"))).toBe(false);
    expect(R.dealerShouldHit(cards("10♠ 6♣"))).toBe(true);
  });
  it("insurance costs half the bet, rounded down", () => {
    expect(R.insuranceCost(25)).toBe(12);
    expect(R.insuranceCost(1)).toBe(0);
  });
  it("pays 3:2, 1:1, push and loss", () => {
    expect(R.settleHand(hand("A♠ K♥"), cards("10♠ 9♣"))).toEqual({ result: "blackjack", payout: 250 });
    expect(R.settleHand(hand("A♠ K♥", { bet: 25 }), cards("10♠ 9♣"))).toEqual({ result: "blackjack", payout: 62 });
    expect(R.settleHand(hand("10♠ 9♥"), cards("10♣ 8♣"))).toEqual({ result: "win", payout: 200 });
    expect(R.settleHand(hand("10♠ 8♥"), cards("10♣ 8♣"))).toEqual({ result: "push", payout: 100 });
    expect(R.settleHand(hand("10♠ 6♥ 9♦"), cards("10♣ 6♣ 9♣"))).toEqual({ result: "lose", payout: 0 }); // player busts first
    expect(R.settleHand(hand("10♠ 7♥"), cards("10♣ 6♣ 9♣"))).toEqual({ result: "win", payout: 200 });
    expect(R.settleHand(hand("A♠ K♥"), cards("A♣ Q♣"))).toEqual({ result: "push", payout: 100 });
    expect(R.settleHand(hand("7♠ 7♥ 7♦"), cards("A♣ Q♣"))).toEqual({ result: "lose", payout: 0 });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run --project unit tests/unit/blackjack-rules.test.js` should FAIL (module not found).
- [ ] **Step 3: Write `src/utils/blackjack/rules.js`** to the interfaces above. A blackjack pays `bet + Math.floor(bet * 3 / 2)`. Give the file a header comment in the style of `src/utils/poker/engine.js`. Copy it to `server/game/blackjack/rules.js` and add the `blackjack` row to `tests/unit/rules-copies.test.js`.
- [ ] **Step 4: Run the tests.** `npx vitest run --project unit tests/unit/blackjack-rules.test.js tests/unit/rules-copies.test.js` should PASS.
- [ ] **Step 5: Commit.** `git add -A src/utils/blackjack server/game/blackjack tests && git commit -m "feat: blackjack rules - shoe, totals and payouts"`

---

### Task 2: Engine — the table state and every move

**Files:**
- Create: `src/utils/blackjack/engine.js` + identical `server/game/blackjack/engine.js`
- Modify: `tests/unit/rules-copies.test.js` (add `engine.js`)
- Test: `tests/unit/blackjack-engine.test.js`

**Interfaces:**
- Consumes: Task 1's `rules.js`.
- Produces: pure functions that return a new state. A refused move **throws** an `Error` whose message is shown to the player as is.
  - **State:**
    - `{ credit, seats: Array(5) of Seat | null, phase, dealer: { cards, revealed }, shoe, dealt, turn: { seat, hand } | null, roundNumber, events }`
    - `phase`: `"WAITING" | "BETTING" | "DEALING" | "INSURANCE" | "TURNS" | "DEALER" | "ROUND_OVER"` (exported as `PHASES`)
  - **Seat:** `{ key, name, avatar, bankroll, bet, ready, lastBet, hands, insurance, answered, skipped, inRound, leaving }`
    - `bankroll` is the seat's chips at a free table, or a mirror of the balance at a credit table.
    - `insurance`: `null` = not taken, otherwise the amount paid.
  - **Hand:** `{ cards, bet, doubled, fromSplit, splitAces, done, result, payout }`
  - **Seating and chips:**
    - `createTable({ credit = false, shoe }) → State`
    - `sit(state, seat, { key, name, avatar, bankroll })` throws "That seat is taken". A free seat's `bankroll` defaults to `FREE_CHIPS`.
    - `moveSeat(state, from, to)`: only in WAITING / BETTING with no bet placed; throws "Move seats between rounds".
    - `standUp(state, seat)`
      - Out of a round, the seat empties.
      - In a round: `leaving = true`, unfinished hands are marked done, and insurance not yet answered counts as declined. If the seat held the turn, the turn moves on.
    - `rebuy(state, seat)`: free tables only, out of a round, `bankroll < MIN_BET`; sets `bankroll = FREE_CHIPS`.
    - `setBankroll(state, seat, amount)`
  - **Betting:**
    - `openBetting(state)`: clears bets and ready flags; phase BETTING, or WAITING if nobody is seated.
    - `placeBet(state, seat, amount)`: only in BETTING. `amount` must be an integer: 0 clears the bet, otherwise `MIN_BET ≤ amount ≤ bankroll`. Errors: "The minimum bet is 10", "You have 340".
    - `setReady(state, seat)`: needs a bet.
    - `bettingDone(state) → boolean`: at least one bet, and every seated non-leaving player is either betting and ready or has `bankroll < MIN_BET`.
    - `closeBetting(state)`
      - Each betting seat: `inRound`, `bankroll -= bet`, one hand, `lastBet = bet`, `skipped = 0`.
      - Every other seated player: `skipped += 1`.
      - Phase becomes DEALING, or BETTING again (via `openBetting`) if nobody bet.
    - `refuseBet(state, seat)`: in DEALING; the seat leaves the round with its bet back in `bankroll`.
  - **The round:**
    - `deal(state, rng)`, from DEALING.
      - First, if `dealt >= CUT_CARD`, take a new shoe (`dealt = 0`, event `shuffle`).
      - Deal order: one card per in-round seat from seat 0 (first base), the dealer's up card, the second round of cards, then the hole card.
      - Then the phase becomes INSURANCE if the up card is an Ace (and some seat can afford a non-zero insurance), otherwise it runs the peek.
      - With nobody in the round, it calls `openBetting`.
    - `insure(state, seat, take)`: only in INSURANCE. Taking it costs `insuranceCost(bet)`, needs that ≤ bankroll, and moves it from bankroll to `insurance`.
    - `insuranceDone(state) → boolean`
    - `closeInsurance(state)`: unanswered seats decline, then the peek runs.
    - The peek (internal):
      - With the up card an Ace or 10-value and a dealer blackjack: reveal, settle every hand, phase ROUND_OVER.
      - Otherwise: player blackjacks and 21s are marked done, and the phase is TURNS at the first unfinished hand. If none is unfinished, the round goes to DEALER.
  - **Turns and the dealer:**
    - `legalActions(state, seat) → { hit, stand, double, split }`, all false unless it's this seat's turn.
      - `double`: 2 cards, not split Aces, `bankroll ≥ hand.bet`.
      - `split`: 2 cards of equal `cardPoints` (J/Q/K/10 are equal), fewer than `MAX_HANDS` hands, the hand isn't split Aces, `bankroll ≥ hand.bet`.
    - `act(state, seat, type)`, with `type` one of `"HIT" | "STAND" | "DOUBLE" | "SPLIT"`. Throws "Not your turn" or `You can't ${type.toLowerCase()} now`.
      - DOUBLE: takes one card, then the hand is done.
      - SPLIT: the second card goes to a new hand right after this one. This hand draws its second card now, and the new hand draws when its turn comes. Split Aces draw one card each and are both done.
      - Busting or reaching 21 ends the hand. The turn then moves to the next unfinished hand, then the next seat.
      - After the last hand: phase DEALER, or ROUND_OVER (with the hole card revealed and everything settled) if every hand busted or was a blackjack.
    - `dealerStep(state)`, in DEALER: reveals the hole card if hidden; otherwise draws while `dealerShouldHit`; otherwise settles every hand → ROUND_OVER.
  - **After the round:**
    - `roundSummary(state) → { roundNumber, dealer: { cards, total }, houseNet, seatResults }`
      - Each entry of `seatResults`: `{ seat_index, player_key, name, hands: [{ cards, bet, result, payout }], insurance, insurancePayout, staked, returned, net, blackjack, doubled, split }`.
      - `staked` = Σ hand bets + insurance. `returned` = Σ payouts + insurance payout (3 × insurance when the dealer has blackjack, else 0). `net = returned − staked`, and `houseNet = Σstaked − Σreturned`.
    - `clearRound(state)`: empties leaving seats, clears hands, dealer and turn, `inRound = false`, `insurance = null`, `events = []`, phase WAITING. At a free table, payouts already landed in `bankroll` at settlement.
    - `viewFor(state, seat) → View`
      - Leaves out `shoe` and every seat's `key`.
      - `dealer.cards[1]` is `null` while `!revealed`.
      - Adds `mySeat: seat`, `legal: legalActions(state, seat)` and `dealerTotal` (the up card only while hidden).
  - **Events** (`state.events`, this round only): `{ type, seat?, hand?, card?, total?, amount? }` with `type` one of:
    - `bet`, `shuffle`, `insure`, `hit`, `stand`, `double`, `split`, `bust`, `blackjack`
    - `dealer_reveal`, `dealer_hit`, `dealer_bust`, `dealer_stand`, `dealer_blackjack`
    - `result`, `leave`

  Card `id`s carry the deck number, so React keys stay unique.

- [ ] **Step 1: Write the failing tests** in `tests/unit/blackjack-engine.test.js`. Use `riggedShoe` from Task 1's helper and a `play(...)` helper that seats, bets, closes betting and deals. Each test is named below with the assertions it makes:

```js
it("deals first base first, the dealer up card, round two, then the hole card")
// seats 0 and 2 bet; shoe "2♠ 3♠ 4♠ 5♠ 6♠ 7♠": seat0 = [2♠,5♠], seat2 = [3♠,6♠], dealer = [4♠,7♠]
it("bets come out of the bankroll at closeBetting; non-bettors get a skip")
it("refuseBet puts the seat out of the round with its bet back")
it("offers insurance on an Ace and pays 2:1 when the dealer has blackjack")
// bet 100, insure 50 → bankroll -150; dealer A♣ K♣, player 10♠ 9♥ → staked 150, returned 150 (3 × 50), net 0, houseNet 0
it("loses insurance and goes to turns when the dealer has no blackjack")
it("ends the round at the peek on a dealer blackjack under a 10, original bets only")
it("a player blackjack is done at once and pays 3:2 at the end")
it("HIT to bust ends the hand and moves the turn to the next seat")
it("DOUBLE takes one card, doubles the bet and ends the hand")
it("SPLIT 8s plays two hands in order, each with its own bet")
it("split Aces take one card each, can't be hit or resplit, and 21 is not blackjack")
it("K and 10 can be split; a fifth hand can't")
it("can't double or split without the bankroll to cover it")
it("the dealer reveals, hits 16, stands on soft 17")
it("skips the dealer's draw when every hand busted")
it("roundSummary: staked, returned, net and houseNet add up")
// sum(seatResults.net) === -houseNet
it("reshuffles before the deal once the cut card is passed")
// state.dealt = 234 → after deal, events[0].type === "shuffle" and dealt === cards dealt this round
it("standUp mid-turn stands the hands and passes the turn")
it("viewFor hides the hole card, the shoe and player keys")
// JSON.stringify(viewFor(s, 0)) excludes the hole card id and every key; dealer.cards[1] === null
it("refuses bad amounts: 9, 10.5, '100', more than the bankroll")
it("rebuy only below the minimum, only at a free table")
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run --project unit tests/unit/blackjack-engine.test.js` should FAIL.
- [ ] **Step 3: Write `src/utils/blackjack/engine.js`** to the interfaces. Clone state the same way `src/utils/poker/engine.js` does (check how it copies before mutating, and match it). Copy the file to the server and add `engine.js` to the copies test.
- [ ] **Step 4: Run the tests.** `npx vitest run --project unit tests/unit/blackjack-engine.test.js tests/unit/rules-copies.test.js` should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: blackjack engine - betting, insurance, turns, dealer and settlement"`

---

### Task 3: `BlackjackTable` — phases over time and money hooks

**Files:**
- Create: `src/utils/blackjack/table.js` + identical `server/game/blackjack/table.js`
- Modify: `tests/unit/rules-copies.test.js` (add `table.js`)
- Test: `tests/unit/blackjack-table.test.js` (with `vi.useFakeTimers()`)

**Interfaces:**
- Consumes: Task 2's engine.
- Produces:
  - `DEFAULT_BLACKJACK_DELAYS = { betting: 15_000, insurance: 8_000, turn: 15_000, deal: 2_500, dealerStep: 800, results: 5_000, saveRetry: 3_000, slowSave: 1_000 }`
  - `SKIPS_BEFORE_KICK = 5`
  - `class BlackjackTable`
    - Constructor: `{ credit = false, delays, rng = secureRandom, shoe, onState, onRoundEnd, onKick, onClosed, beforeDeal, fund, beforeNextRound }`
    - Money hooks, used only by credit tables:
      - `beforeDeal(bets: [{ seat, key, amount }]) → Promise<number[]>`: resolves with the refused seats.
      - `fund({ seat, key, amount, kind: "double" | "split" | "insurance" }) → Promise<{ ok, error? }>`
      - `beforeNextRound(summary) → Promise`: retried after `delays.saveRetry` while it rejects, like `PokerTable.saveHand`.
    - Fields: `state`, `saving`, `closing`, `destroyed`.
    - Methods returning `{ ok, … } | { ok: false, error }`:
      - `firstFreeSeat()`
      - `sit(player, seat = firstFreeSeat())`. Sitting at a WAITING table opens betting.
      - `moveSeat(from, to)`, `standUp(seat)`, `rebuy(seat)`, `setBankroll(seat, n)`
      - `bet(seat, amount)`
      - `ready(seat)`: closes betting early when `bettingDone`.
    - Async methods (they await `fund` first at a credit table):
      - `insure(seat, take) → Promise`: closes insurance early when `insuranceDone`.
      - `move(seat, type) → Promise`: rejects a second move while one is funding, with "Not your turn".
    - Timer reads: `phaseMsLeft() → number | null` (the betting, insurance or turn clock), `dealMsLeft() → 0`.
    - Lifecycle: `closeAfterRound()`, `destroy()`.
  - **Flow:**
    1. Betting: `openBetting`, then `delays.betting` (or early close), then `closeBetting`.
    2. At a credit table, `await beforeDeal` and `refuseBet` each refused seat.
    3. `deal`. Any seat with `skipped >= 5` → `onKick(seat)`.
    4. After `delays.deal`, an insurance window (`delays.insurance`) or the first turn (`delays.turn`; a timeout plays STAND).
    5. DEALER: `dealerStep` every `delays.dealerStep`.
    6. ROUND_OVER: `onRoundEnd(roundSummary)` and, at a credit table, the `beforeNextRound` save (after `slowSave` the table shows `saving: true`).
    7. After `delays.results` and the save: `clearRound`, then `openBetting`, or `onClosed` if closing.
  - At a free table, double/split/insurance come straight from `bankroll` with no hook.

- [ ] **Step 1: Write the failing tests** (fake timers; a short `DELAYS` like `{ betting: 100, insurance: 50, turn: 50, deal: 10, dealerStep: 5, results: 20, saveRetry: 10, slowSave: 15 }`):

```js
it("opens betting when the first player sits, and deals when the clock runs out")
it("closes betting early once everyone with a bet is READY")
it("a player who never bets keeps the seat; five skipped windows call onKick")
it("a turn clock running out stands the hand")
it("plays the dealer step by step, then waits results before the next betting window")
it("credit: beforeDeal's refused seats sit the round out")
it("credit: a DOUBLE waits for fund, and a second DOUBLE while it funds is refused")
it("credit: a refused fund leaves the hand as it was, with the reason")
it("credit: the next betting window waits for beforeNextRound and shows saving after slowSave")
it("closeAfterRound finishes the round, then onClosed; no new betting window")
it("standUp in WAITING/BETTING empties the seat; mid-round it marks leaving and the round plays on")
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run --project unit tests/unit/blackjack-table.test.js` should FAIL.
- [ ] **Step 3: Write `table.js`.** Mirror `PokerTable`'s single pending timer (`later` / `clearTimer` / a `stepKey` so seating never restarts a clock) and its `saveHand` / `waitForSave` retry. Copy it to the server and add it to the copies test.
- [ ] **Step 4: Run the tests.** `npx vitest run --project unit tests/unit/blackjack-table.test.js tests/unit/rules-copies.test.js` should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: blackjack table - round timers and money hooks"`

---

### Task 4: Database and accounts — seats, bets, settlement, the house line

**Files:**
- Create: `server/db/migrations/016_blackjack_types.sql`, `server/db/migrations/017_blackjack.sql`
- Modify:
  - `server/credits/accounts.js` (new functions; `releaseTable` and `returnAllSeats`)
  - `server/credits/check.js`
  - `server/credits/flags.js` (lines 12 and 66: add `and game_type <> 'blackjack'`)
  - `server/credits/leaderboard.js`
- Test: `server/tests/db/blackjack-credits.test.js` (skips without `TEST_DATABASE_URL`, like the other `db/` suites)

**Interfaces:**
- **`016_blackjack_types.sql`:**
  - `alter type game_type add value if not exists 'blackjack'`
  - `alter type credit_tier add value if not exists 'HOUSE'`
  - `alter type credit_kind add value if not exists 'bet'`
  - `alter type credit_kind add value if not exists 'payout'`

  (New enum values can't be used in the transaction that adds them, so they get their own file, like `007`.)
- **`017_blackjack.sql`:**
  - `alter table credit_hands add column house_net bigint not null default 0`
  - `create or replace view player_match_history`: exactly `013_remove_elo.sql`'s definition, with `gs.game_type <> 'poker'` changed to `gs.game_type not in ('poker', 'blackjack')`. The columns are unchanged, so dependent views stay.
  - `create view player_blackjack_stats`, grouped by `player_id` and `stakes` (`case when gs.credit_tier is null then 'free' else 'credits' end`), over finished `blackjack` sessions:
    - `tables` (count)
    - `rounds_played`, `rounds_won`, `rounds_pushed`, `blackjacks` (sums of `gp.stats ->> …`)
    - `biggest_win` (max)
    - `net` (`sum(gp.final_score)`)
    - `total_seconds`, `last_played_at` (the same expressions as `player_poker_stats`)
- **`accounts.js`** gains:
  - `sitBlackjack(userId, { tableId, tableName }) → { balance }`
    - Order: `lockAccount`, `whyCantPlay` (throw `CreditError`), `refuseSecondTable`.
    - Then insert `credit_seats (user_id, table_id, table_name, tier 'HOUSE', stack 0, game_type 'blackjack')`. No ledger row, since nothing moves.
  - `stakeBlackjack(userId, { tableId, amount }) → { balance }`
    - Refusals: frozen → "Credit play is suspended on this account"; an `amount` that isn't an integer ≥ 1 → "Pick an amount"; `amount > balance` → `Your balance is ${fmt(balance)}`; no seat row → "You're not at this table".
    - Moves the amount: `stack += amount`, `balance -= amount`, and a ledger row `kind 'bet'`, `amount -amount`, `tier 'HOUSE'`, `table_id`, `game_type 'blackjack'`.
  - `settleBlackjackRound({ tableId, isPrivate, sessionId, summary, leavers = [] }) → { handId, balances: Map<userId, balance> }`, all in one transaction:
    - Insert `credit_hands` with `(tier 'HOUSE', hand_number summary.roundNumber, seats, events '[]', game_type 'blackjack', house_net summary.houseNet)` and `on conflict (table_id, hand_number) do nothing`. Nothing inserted means `{ handId: null, balances: new Map() }`.
    - `seats` json: per seat result, `{ seat, user_id, staked, returned, net, hands }`.
    - Lock the table's seat rows. Every summary seat's `staked` must equal its saved `stack`, and every other seat at the table must hold 0; otherwise throw `CreditMismatch`.
    - Lock accounts sorted by user id. For each seat: `returned > 0` → balance += returned and a ledger row `kind 'payout'`. Then `stack = 0`.
    - Delete the rows of `leavers` (user ids). Set `first_hand_at` for every staked seat.
  - `standUpBlackjack(userId, tableId) → { paid }`: deletes the row, paying any stack out (`kind 'cash_out'`, `gameType 'blackjack'`) first. It's safe to repeat.
  - `balancesOf(userIds) → Map<userId, balance>`
- **`releaseTable` / `returnAllSeats`:** a `blackjack` row holding 0 is deleted with no ledger row and no restart notice. Other rows are unchanged.
- **`check.js`:** select `coalesce(sum(house_net), 0) as house_net from credit_hands`, return `houseNet`, and check `balances + atTables === granted + claimed - removed - wonByBots - houseNet`.
- **`leaderboard.js`:** add a `blackjack` source like `poker` (in the ledger sum, the on-seat term, and `sources.blackjack`).

- [ ] **Step 1: Write the failing tests** in `server/tests/db/blackjack-credits.test.js`, using `makePlayer` / `truncateAll` from `setup.js` as `credit-stakes.test.js` does. A linked login is needed; copy that suite's helper.

```js
it("sitBlackjack seats with stack 0 and no ledger row")
it("sitBlackjack refuses an unlinked or frozen account")
it("a seated player with no bet can't buy in at poker")       // A.buyIn rejects with "You're already at table <name>"
it("stakeBlackjack moves the bet to the seat and writes a 'bet' row")
it("stakeBlackjack refuses more than the balance, 0, 10.5")
it("settleBlackjackRound pays winners, zeroes stacks, records house_net, and the economy check is OK")
// two players stake 100 each; summary: A returns 250 (blackjack), B returns 0 → houseNet = -50; check().ok === true and houseNet === -50
it("settleBlackjackRound twice for the same round pays once")
it("settleBlackjackRound refuses a summary that doesn't match the seats (CreditMismatch), writing nothing")
it("a leaver's row is deleted after their payout")
it("returnAllSeats returns a mid-round stake with a notice, and deletes a 0 seat without one")
it("pair flags ignore blackjack rounds")                       // flaggedPairs() returns no pair for two players at one blackjack table
it("the leaderboard has a blackjack source and sources still add up to the total")
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run --project server server/tests/db/blackjack-credits.test.js` should FAIL. (If `TEST_DATABASE_URL` isn't set, stop and ask the user for it; don't skip.)
- [ ] **Step 3: Write the migrations and the `accounts.js`, `check.js`, `flags.js` and `leaderboard.js` changes** to the interfaces.
- [ ] **Step 4: Run the suites.** `npx vitest run --project server server/tests/db/blackjack-credits.test.js server/tests/db/credits.test.js server/tests/db/credit-stakes.test.js server/tests/db/lockdown.test.js server/tests/db/stats.test.js` should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: blackjack credit seats, bets, settlement and the house line"`

---

### Task 5: `CreditBlackjack` — one queue between the table and its credits

**Files:**
- Create: `server/credits/blackjackTables.js`
- Test: `server/tests/db/blackjack-table.test.js`

**Interfaces:**
- Consumes:
  - Task 3: `BlackjackTable`
  - Task 4: `sitBlackjack`, `stakeBlackjack`, `settleBlackjackRound`, `standUpBlackjack`, `releaseTable`, `balancesOf`
  - From `server/credits/rules.js`: `failure`, `retry`, `CreditMismatch`
- Produces `class CreditBlackjack`:
  - Constructor: `{ name, isPrivate = false, sessionId = async () => null, store = accounts, ...tableOptions }`
  - Fields: `id` (`randomUUID()`), `name`, `table` (a `BlackjackTable` with `credit: true`).
  - `sit({ userId, name, avatar }, onSeat) → Promise<{ ok, seat } | { ok: false, error }>`: calls `store.sitBlackjack`, then `table.sit` with `bankroll = balance`, in the queue.
  - `leave(userId) → Promise`. It resolves once the player's credits are home.
    - With a stake in the running round: mark them a leaver, `table.standUp`, and settle pays them.
    - Otherwise: `table.standUp`, then `store.standUpBlackjack`.
  - `onTable(userId) → number | null`: the seat's staked total this round (0 between rounds), or `null` if not seated.
  - `release(kind = "cash_out") → Promise`
  - `seatOf(userId)`, `destroy()`
  - Hooks it hands the table:
    - `beforeDeal`: calls `stakeBlackjack` per bet, one at a time in the queue. A `CreditError` refuses that seat, and the reason goes to the player through an `onRefused(key, error)` option.
    - `fund`: calls `stakeBlackjack(amount)`.
    - `beforeNextRound`: calls `settleBlackjackRound` with the leavers, then `setBankroll` from `balances`. A `null` handId means `balancesOf` is read again.
  - On `CreditMismatch` 3 times in a row, it closes and releases, as `CreditTable.saveHand` does.

- [ ] **Step 1: Write the failing tests** with real Postgres and short delays, following `credit-tables.test.js`:

```js
it("sits two players and plays a round; balances and the economy check agree")
it("a bet larger than the balance is refused at the deal and that seat sits out")
it("a second DOUBLE while the first is funding is refused; funded once")
it("leaving mid-round: the hand stands, settles, and the credits arrive after the save")
it("leaving between rounds deletes the seat row at once")
it("release() mid-round returns every stake; the round never happened")
it("onTable counts the stake in play, 0 between rounds")
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run --project server server/tests/db/blackjack-table.test.js` should FAIL.
- [ ] **Step 3: Write `blackjackTables.js`**, modelled on `server/credits/tables.js` (its `enqueue`, `leavers`, `released` and `releaseNow`).
- [ ] **Step 4: Run it.** `npx vitest run --project server server/tests/db/blackjack-table.test.js` should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: credit blackjack tables"`

---

### Task 6: Blackjack on the server — lobbies, sockets, records, rewards

**Files:**
- Create: `server/game/blackjackTally.js`, `server/blackjackRoom.js`
- Modify: `server/index.js`, `server/persistence.js`
- Test: `server/tests/blackjackTally.test.js`, `server/tests/blackjack-socket.test.js` (spawns the server like `poker-socket.test.js`, with `BLACKJACK_DELAY_MS=5`, `BLACKJACK_TURN_MS=200`), plus a case in `server/tests/db/persistence.test.js`

**Interfaces:**
- **`blackjackTally.js`:**
  - `LOGGED_ROUNDS = 500`
  - `tallyRound(tally | null, summary, result) → tally`
    - Counts: `{ rounds_played, rounds_won (net > 0), rounds_pushed (net === 0), blackjacks, doubles, splits, biggest_win (max net), net }`
    - Log: `rounds: [{ n, net, hands, dealer }]`, keeping the latest `LOGGED_ROUNDS`.
- **`blackjackRoom.js`:**
  - `BLACKJACK_DELAYS`: `DEFAULT_BLACKJACK_DELAYS`, overridden by env `BLACKJACK_DELAY_MS` (every pause) and `BLACKJACK_TURN_MS` (the turn and insurance clocks), the way `POKER_DELAYS` reads its env vars.
  - `blackjackView(state, seat, table) → { ...viewFor(state, seat), phaseMsLeft, saving, closingAfterRound, credit }`
  - `registerBlackjackHandlers(socket, { lobbies })`: handles `bj_sit {lobbyId, seat}`, `bj_bet {lobbyId, amount}`, `bj_ready`, `bj_insurance {lobbyId, take}`, `bj_action {lobbyId, type}`, `bj_rebuy`.
    - The seat always comes from `lobby.members.get(socket.data.playerKey).seatIndex`.
    - A refusal emits `move_rejected { reason }`.
    - `bj_sit` also updates `member.seatIndex`.
- **`index.js`:**
  - `GAMES.blackjack = { seats: 5, stateEvent: "blackjack_state", view: blackjackView }`.
  - `const SELF_SEATING = new Set(["poker", "blackjack"])` replaces the poker checks that mean "a table that seats itself":
    - `publicLobbyList`: `current` counts non-leaving seats; for Blackjack, `inProgress` = phase isn't WAITING.
    - `removeMember`: the free-table `standUp` and the "left the table" log.
    - The `cpuTookOver` guard and `destroyLobby`'s `completed` flag.
    - `join_lobby`'s rejoin and CPU-takeover guards, and its full check (`firstFreeSeat() === -1`).
    - `hostCommand`'s started check and `leave_lobby`'s older-tab rule.
    - `close_table`: credit → `closeAfterRound`, free → destroy.
    - `request_rematch` (excluded).
  - Refusals:
    - `start_game` for Blackjack → "Blackjack deals on its own".
    - `add_cpu` / `remove_cpu` / `set_cpu_level` → "Blackjack has no CPU players".
  - `create_lobby`, for `type === "blackjack"`:
    - `credit = tier === "HOUSE"`. `creditRefusal` accepts only `"HOUSE"` for Blackjack, and `"HOUSE"` for no other game.
    - The lobby's game: `createCreditBlackjack(lobby)` (a `CreditBlackjack` whose `onClosed` is `endCreditTable`) or `createBlackjackTable(lobby)`.
    - Seat the host: credit through `credits.sit` (refusal → `error_message` and no lobby, like `sitWithCredits`), free through `table.sit` with `FREE_CHIPS`.
    - Then `beginSession(lobby)` at once: there's no START.
  - `join_lobby` at a Blackjack table: no `credit_table_info` or buy-in. Seat as in create, and `rosterEnter` once seated.
  - `kickFromPoker` becomes `kickFromTable` (the body is unchanged) and is used as `onKick` for both games.
  - `recordRound(lobby, summary)`:
    - Push `{ roundNumber, winnerSeat: null, seatResults }` (keys stripped) onto `lobby.rounds`.
    - For each result with a roster entry: `entry.blackjack = tallyRound(...)`, then `payTableRound(lobby, entry, r.net > 0)`.
  - `payPokerHand` is renamed `payTableRound` (same body). Poker keeps its ≥2-people rule at its call site; Blackjack has none.
  - The `connection` handler calls `registerBlackjackHandlers(socket, { lobbies })`.
- **`persistence.js` `finishSession`:**
  - `const tableGame = poker || rec.gameType === "blackjack"`, used wherever `poker` means "no places, tally-based".
  - Each row's tally is `seat.poker` or `seat.blackjack`; `rounds_won` comes from `hands_won` or `rounds_won`.
  - `final_score` is the tally's `net`. It returns early with no profile update, like poker.

- [ ] **Step 1: Write the failing tests.**

```js
// server/tests/blackjackTally.test.js
it("counts rounds, wins, pushes, blackjacks, doubles, splits, biggest win and net")
it("keeps only the latest 500 rounds in the log")

// server/tests/blackjack-socket.test.js
it("creating a free table seats the host with 1,000 chips and opens betting")
it("two players bet, READY deals at once, and the round settles into the next betting window")
it("a rejoin mid-round gets a view without the hole card")
it("junk bj_ payloads are refused")   // amount "500", -10, 10.5, null; type "WIN"; seat 9 → move_rejected each, state unchanged
it("bj_sit moves to an empty seat between rounds, refused mid-round")
it("leaving mid-turn stands the hand and the round finishes")
it("start_game and add_cpu are refused at a blackjack table")
it("the public list shows a blackjack table with current/max = 1/5")

// server/tests/db/persistence.test.js (new case)
it("finishSession records a blackjack table like poker: tally stats, net as final_score, no games_played")
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run --project server server/tests/blackjackTally.test.js server/tests/blackjack-socket.test.js` should FAIL.
- [ ] **Step 3: Implement** `blackjackTally.js`, `blackjackRoom.js` and the `index.js` and `persistence.js` changes. Keep `index.js` additions to thin hooks.
- [ ] **Step 4: Run the server project.** `npm run test:server` should PASS, with the existing poker, Muushig and Thirteen socket suites still green.
- [ ] **Step 5: Commit.** `git commit -m "feat: blackjack tables on the server"`

---

### Task 7: Stats, the table page and history on the server

**Files:**
- Modify: `server/stats.js`, `server/matches.js`
- Test: new cases in `server/tests/db/stats.test.js` and `server/tests/db/matches.test.js`

**Interfaces:**
- **`stats.js`:**
  - `blackjackStatsFor(playerId) → { free, credits }`. Each holds:
    - `{ tables, rounds, roundsWon, winRate, blackjacks, biggestWin, net, time: { totalSeconds, lastPlayedAt } }`, from `player_blackjack_stats`.
    - `recent: [{ id, tier, table, net, rounds, seconds, finishedAt }]`, the latest `RECENT` tables with `rounds_played > 0`.
  - `withBlackjack(playerId, stakes, overall)`, mirroring `withPoker`:
    - Folds Blackjack into `time`, `credits` (`games`, `net`; `potsWon` += rounds won; `biggestPot` = max with `biggest_win`) and `recent` (`game: "blackjack"`, `rounds`, `net`, `tier`).
    - Adds `overall.blackjack = { tables, rounds, net, seconds }`.
    - Wins, places and streaks are untouched.
  - `playerStats` returns `{ stakes, ...views, poker, blackjack }`, with `views.overall = await withBlackjack(…, await withPoker(…))`.
- **`matches.js`:**
  - `matchDetail` sends `game_type === "blackjack"` to `blackjackTable(s, viewerId)`.
  - `blackjackTable(s, viewerId)`: a signed-in player who sat there, else `null`. It returns:
    - `{ id, gameType: "blackjack", table, credit: s.credit_tier != null, isPrivate, startedAt, finishedAt, durationSeconds, roundCount }`
    - `you: { name, net, seconds, roundsPlayed, roundsWon, blackjacks, biggestWin, rounds: stats.rounds ?? [] }`
    - `table: [{ name, xpLevel, net, rounds, you }]`, sorted by net.

    It returns `credit` (boolean) instead of `tier`, so `HOUSE` never reaches the browser.
  - `creditMatchOf`'s query: `game_type <> 'poker'` becomes `game_type not in ('poker', 'blackjack')`.

- [ ] **Step 1: Write the failing tests.**

```js
// stats.test.js
it("a blackjack table shows in blackjack.free / .credits and in overall recent, time and credits, never in wins or places")
// matches.test.js
it("a blackjack table page opens for a player who sat there, 404 for anyone else, with no tier field")
it("player_match_history leaves blackjack out")
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run --project server server/tests/db/stats.test.js server/tests/db/matches.test.js` should FAIL.
- [ ] **Step 3: Implement** the changes to the interfaces.
- [ ] **Step 4: Run them.** The same command should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: blackjack stats and table pages"`

---

### Task 8: Lobby, routes and the main menu tile

**Files:**
- Create: `src/pages/blackjack/LobbyBlackjack.jsx`
- Modify:
  - `src/lib/games.js` (`blackjack: "/game-blackjack"`)
  - `src/App.jsx` (`/lobby-blackjack`, `/game-blackjack`; the game page is a stub `GameBlackjack` export until Task 9)
  - `src/pages/MainMenu.jsx`
  - `src/components/lobby/GameLobby.jsx`
  - `src/components/credits/CreditHostPanel.jsx`
- Test: `tests/ui/BlackjackLobby.test.jsx`, and `tests/ui/MainMenu.test.jsx` (a new case)

**Interfaces:**
- **`LobbyBlackjack`:** `GameLobby` with `{ id: "blackjack", title: "Blackjack", route: "/game-blackjack", defaultTableName: "The House", accent: <an unused palette accent>, credits: { kind: "house" }, playAlone: true, events: same as poker }`.
- **`GameLobby` with `kind === "house"`:**
  - `createCreditTable(name, _tier, isPrivate)` emits `create_lobby` with `tier: "HOUSE"` straight away (no buy-in panel).
  - `joinTable` for a `HOUSE` table emits `join_lobby` straight away.
  - The lobby list's tier tag shows `CREDITS` for `HOUSE` (no `TIERS` lookup).
  - `playAlone`:
    - Free tab: a `PlayAlonePanel` (title "Play alone", one button **PLAY ALONE**, a line "A private table just for you. Friends can join with its code.") replaces `PracticePanel`.
    - Credit tab: `CreditHostPanel` gets `tiers={null}`, which drops the stakes row and shows a full-width **PLAY ALONE** button in its place (my call).
    - PLAY ALONE emits `create_lobby` with `isPrivate: true`, the default name, and `tier: "HOUSE"` on the credit tab.
- **`MainMenu`:** a `GameTile` with `id="blackjack"`, `title="BLACKJACK"`, `tag="1-5 PLAYERS"`, `desc="Beat the dealer to 21 without going over. Play alone or with friends, for chips or credits."`, cards `A♠ K♥`, and `lobbies={stats.lobbies?.blackjack}`. It goes before the `???` tile.

- [ ] **Step 1: Write the failing tests.** Mock the socket as `tests/ui/GameLobby.test.jsx` does.

```js
it("hosting a credit blackjack table emits create_lobby with tier HOUSE and no buy-in panel")
it("joining a HOUSE table emits join_lobby with no buy-in panel")
it("lists a Blackjack credit table as CREDITS")            // no "HOUSE" text, no throw
it("PLAY ALONE on the free tab creates a private table")
it("PLAY ALONE on the credits tab creates a private HOUSE table")
// MainMenu.test.jsx
it("shows a BLACKJACK tile that opens /lobby-blackjack")
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run --project ui tests/ui/BlackjackLobby.test.jsx tests/ui/MainMenu.test.jsx` should FAIL.
- [ ] **Step 3: Implement** the changes to the interfaces.
- [ ] **Step 4: Run the UI project.** `npm run test:ui` should PASS, with the poker and Muushig lobby tests still green.
- [ ] **Step 5: Commit.** `git commit -m "feat: blackjack lobby and main menu tile"`

---

### Task 9: The table page — half-moon, hooded dealer, betting and actions

**Files:**
- Create:
  - `src/pages/blackjack/GameBlackjack.jsx`
  - `src/components/blackjack/HalfMoonTable.jsx`, `BlackjackSeat.jsx`, `DealerPortrait.jsx`, `BetBar.jsx`, `ActionBar.jsx`
  - `src/utils/blackjack/log.js`
- Test: `tests/ui/GameBlackjack.test.jsx`

**Interfaces:**
- Consumes: the `blackjack_state` view (Task 6), `move_rejected`, `table_left`, `progress_reward`, `receive_chat`; `handTotal`, `MIN_BET` and `PHASES` from the rules and engine.
- **`GameBlackjack`** wires sockets like `OnlinePoker`:
  - Joining: `join_lobby` plus `check_game_status`.
  - `leave_page` on unmount.
  - `table_left` → `/lobby-blackjack`, with `{ state: { tab: "credits" } }` at a credit table.
  - `HandReward` on `progress_reward`.
  - `TableHeader` / `TableSidebar` / `GameChat` for chat and the log.
- **`HalfMoonTable`** (props `{ view, mySeat, onSit, layout }`):
  - The felt and dealer:
    - The felt is `felt` with an `oak` rim and a flat top edge.
    - The dealer portrait sits above it, centred, with its speech bubble.
    - The shoe is at screen right and the discard tray at screen left.
    - Under the dealer's cards, the rules print: "BLACKJACK PAYS 3 TO 2" / "DEALER STANDS ON ALL 17s · INSURANCE PAYS 2 TO 1". Use `·`, which VT323 and Press Start 2P render; if the build shows a fallback glyph, use " - " instead.
  - The seats:
    - Five seats along the curve, with **seat 0 at screen right**.
    - An empty seat shows a **SIT** button, active only in WAITING / BETTING when you have no bet.
  - `layout`: `"full"`, or `"compact"` under 640 px wide.
- **`BlackjackSeat`:**
  - The betting circle holds a chip stack and the amount.
  - Hands sit above the circle, side by side after a split, each with a total tag (`7 / 17` when soft; BUST; BLACKJACK). The current hand is outlined in `gold`.
  - The plate shows avatar, name, bankroll, and READY / BETTING / SITTING OUT in BETTING.
  - Result tags: `+n` in `poison`, `-n` in `rose`, PUSH in `mist`, BLACKJACK in `gold`.
- **`DealerPortrait`:** the 16×16 sprite map from the spec, drawn as SVG `rect`s with `shape-rendering="crispEdges"` (the colors are in the spec) inside a `gold-deep` frame. Bubble text by phase and event:
  - BETTING: "PLACE YOUR BETS"
  - INSURANCE: "INSURANCE?"
  - `dealer_blackjack`: "DEALER HAS BLACKJACK"
  - `dealer_bust`: "DEALER BUSTS"
  - `dealer_stand`: "DEALER HAS {total}"
- **`BetBar`** (BETTING):
  - Chip buttons 10 / 50 / 100 / 500 / 1K / 5K add to the bet. An amount box takes any integer.
  - **CLEAR**, **REBET** (`lastBet`) and **x2**.
  - **DEAL** (ready) is disabled under `MIN_BET`.
  - A free table with `bankroll < 10` shows **REBUY**.
  - The countdown reads `phaseMsLeft`.
- **`ActionBar`:**
  - TURNS, on your turn: **HIT** / **STAND** / **DOUBLE** / **SPLIT**, enabled from `view.legal`, with "YOUR TURN 0:12".
  - INSURANCE: "INSURANCE FOR {cost}?" with **YES** / **NO** and "no answer = no".
  - ROUND_OVER: "YOU WON {n}" / "YOU LOST {n}" / "PUSH", plus the round's XP and gold.
- **`log.js`:** `eventEntry(event, names) → string | null`, producing the spec's lines:
  - `"ANN bets 200"`, `"ANN doubles on 11"`, `"BOB splits 8s"`
  - `"Dealer has blackjack"`, `"Dealer busts with 25"`, `"CAT wins 400"`
  - `"NOVSH left"`, `"New shoe"`
  - It returns `null` for events that get no line.

- [ ] **Step 1: Write the failing tests.** Mock the socket as `tests/ui/GamePoker.test.jsx` does, emitting crafted `blackjack_state` views.

```js
it("draws five seats with seat 0 at the right, and SIT on empty seats while betting")
it("chips add to the bet, CLEAR resets, REBET repeats, x2 doubles; DEAL emits bj_bet then bj_ready")
it("DEAL is disabled under 10")
it("on your turn only legal actions are enabled; clicking emits bj_action")
it("insurance shows YES/NO with the cost and emits bj_insurance")
it("shows the dealer's hole card face down until revealed")
it("result tags: +250 BLACKJACK in gold, -100 in rose, PUSH")
it("logs dealer and player events as plain lines")
it("REBUY appears at a free table below 10 chips and emits bj_rebuy")
it("no symbol glyphs other than card suits in the rendered UI text")  // scan textContent for /[✦⚔►●✕☠]/
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run --project ui tests/ui/GameBlackjack.test.jsx` should FAIL.
- [ ] **Step 3: Implement** the page and components. Reuse `PixelCard` (`rank`, `suit`, `faceDown`, `width`), `ChipStack`, `Countdown`, `ChatBubble` and `PixelUI`/`pixelTokens`, matching the approved mockups (the spec's table and round sections).
- [ ] **Step 4: Run the UI project.** `npm run test:ui` should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: blackjack table page with the hooded dealer"`

---

### Task 10: Profile, leaderboard, table page and rulebook

**Files:**
- Create: `src/components/match/BlackjackTablePage.jsx`, `src/components/blackjack/BlackjackRules.jsx`, `docs/blackjack-rulebook.md`
- Modify:
  - `src/pages/Profile.jsx`
  - `src/pages/Leaderboard.jsx` (`GAMES` += `{ key: "blackjack", name: "Blackjack", live: true }`; `repeat(3,104px)` becomes `repeat(4,104px)`)
  - `src/components/credits/SourceBreakdown.jsx` (`SOURCES` += `["blackjack", "Blackjack"]`)
  - `src/pages/MatchDetail.jsx` (`gameType === "blackjack"` → `BlackjackTablePage`, header "Table")
  - `src/components/RulebookPicker.jsx` (add `{ id: "blackjack", label: "Blackjack", color: <the lobby accent>, Rules: BlackjackRules }`)
- Test: new cases in `tests/ui/Profile.test.jsx`, `tests/ui/Leaderboard.test.jsx`, `tests/ui/MatchDetail.test.jsx`, `tests/ui/RulesModal.test.jsx`

**Interfaces:**
- Consumes: Task 7's `blackjack` stats and `blackjackTable` page payload.
- **`Profile`:**
  - `GAME_NAMES.blackjack = "Blackjack"`, and a Blackjack filter tab.
  - A `BlackjackSheet`, mirroring `PokerSheet` with FREE / CREDITS: rounds, win rate, blackjacks, biggest win, net, time, and recent tables (each opens `/match/:id`).
  - Blackjack recent rows render like poker rows: net instead of a place, `${m.rounds} rounds`, and **"Credits"** as the label when `m.tier === "HOUSE"`.
  - The Overall footnote becomes "Wins, places and streaks count Thirteen and Muushig: poker and blackjack tables have no places."
- **`BlackjackTablePage`:** your tiles (net, rounds, won, blackjacks, biggest win, time), FREE or CREDITS from `credit`, the players by net, and the round log (each round: your hands with totals and results, the dealer's cards and total, net).
- **`BlackjackRules`:** the spec's Rules table in player words, plus `XpRules` with the poker hand numbers (reuse `XpRules` with `poker` set, or add a `blackjack` flag that changes "hand" to "round"). `docs/blackjack-rulebook.md` carries the same content.

- [ ] **Step 1: Write the failing tests.**

```js
it("the profile has a Blackjack tab with free and credit figures")
it("a Blackjack credit table reads Credits, never HOUSE")      // in recent rows and on the table page
it("the leaderboard has a Blackjack column and the source breakdown lists Blackjack")
it("MatchDetail shows a blackjack table page with its round log")
it("the rulebook picker has Blackjack with 3:2, stands on all 17s, insurance 2:1")
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run --project ui tests/ui/Profile.test.jsx tests/ui/Leaderboard.test.jsx tests/ui/MatchDetail.test.jsx tests/ui/RulesModal.test.jsx` should FAIL.
- [ ] **Step 3: Implement** the changes to the interfaces.
- [ ] **Step 4: Run the UI project.** `npm run test:ui` should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: blackjack on profiles, leaderboard, table pages and the rulebook"`

---

### Task 11: Release notes, full suite, and the browser walkthrough

**Files:**
- Modify: `CHANGELOG.md`, and any test that pins the newest version (`tests/unit/changelog.test.js` / `tests/ui/PatchNotes.test.jsx`, if it does)

**Interfaces:**
- **`CHANGELOG.md`:** a new top section, `## 2.0.0 — <D Month YYYY>`, with a `### Blackjack is here` heading and player-facing bullets. Cover:
  - the half-moon table and the Hooded House
  - free and credit tables, PLAY ALONE, and up to 5 players
  - betting from your balance with no limit
  - the standard rules (3:2, stands on all 17s, insurance, splits to 4 hands, double after split)
  - XP and gold per round
  - the Blackjack stats, table pages and leaderboard column

  Follow 1.4.x's tone.

- [ ] **Step 1: Write the release notes.** Then run `npm test`. Expected: everything PASS (unit, server, ui). With a `TEST_DATABASE_URL`, no `db/` suite should be skipped.
- [ ] **Step 2: Run `npm run lint`.** Expected: no new errors beyond the 9 pre-existing ones in untouched files.
- [ ] **Step 3: Browser walkthrough** with the local dev server and DB. Use the test accounts ann/bob/cat.credits@test.dev, password `secret1`. If needed, drive the cached Chromium with `playwright-core` from the scratchpad. Check:
  1. A guest plays a free table alone through 3 rounds: a blackjack, a split, and a bust.
  2. ANN and BOB at one credit table: bets, a double, insurance on an Ace. ANN leaves mid-turn, and her credits arrive after the round.
  3. The admin page economy check reads OK, with the house line.
  4. ANN can't buy in at poker while seated at Blackjack.
  5. A 390 px-wide window: the table fits, the bars wrap, and the page doesn't scroll sideways.
  6. Profile, leaderboard and table page show Blackjack, and never "HOUSE".

  Note anything off and fix it before the commit.
- [ ] **Step 4: Commit.** `git commit -m "docs: v2.0.0 - blackjack"`

---

## Self-review

- **Spec coverage:**
  - Rules → Tasks 1–2
  - A round, timers, sitting out → Task 3
  - Money (seats, bets, settlement, house net, restart, pair flags, one table at a time) → Tasks 4–5
  - Seats, joining, leaving, disconnects, host END, no CPUs, the `HOUSE` marker → Task 6
  - Records and stats, the table page, Overall following poker, `creditMatchOf` → Tasks 6–7
  - Lobby, PLAY ALONE, menu tile → Task 8
  - Table UI, dealer, bubbles, phones, log → Task 9
  - Profile, leaderboard sources, rulebook → Task 10
  - 2.0.0 → Task 11
  - XP → Task 6 (`payTableRound`)
- **Names used across tasks:**
  - `BlackjackTable`, `CreditBlackjack`
  - `sitBlackjack` / `stakeBlackjack` / `settleBlackjackRound` / `standUpBlackjack` / `balancesOf`
  - `tallyRound`, `payTableRound`, `blackjackView`, `registerBlackjackHandlers`
  - `blackjackStatsFor` / `withBlackjack` / `blackjackTable`
  - `roundSummary` fields (`staked`, `returned`, `net`, `houseNet`)

  These are defined once and used with the same signatures.
