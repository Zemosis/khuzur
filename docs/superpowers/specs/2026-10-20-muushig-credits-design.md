# Credit Muushig — design

> **Thirteen too (added 21 October 2026).** Thirteen uses the same stake
> layer (`CreditMatch` with `gameType: "thirteen"`) and the same rules, with
> one difference the user chose: **people only**. 2 to 4 players, empty seats
> stay empty, the host can't add CPUs (`botsFill: false`). The winner is the
> last player not eliminated. A Hard CPU still covers a player who leaves
> mid-match, under the same 2-round comeback rule. Shared rules live in
> `src/utils/stakes.js` (copied to `server/game/stakes.js`).

**Goal:** Muushig for credits, played the way it's played for money in
Mongolia: everyone at the table stakes the same amount and the match winner
takes the pot. It runs on the credits system Poker already uses (balances,
CLAIM, the ledger, the economy check, flags, the leaderboard, the admin
page). Free Muushig is unchanged. The stake layer (`server/credits/matchTables.js`)
is game-agnostic so Thirteen can use it next.

## Rules (agreed in conversation; my calls are marked)

| | |
|---|---|
| Who | Signed-in players with a linked Google/Discord login, not frozen (the same `canPlay` as Poker) |
| Stakes | Fixed tiers: **LOW 100 · MID 500 · HIGH 2,000**. Everyone at a table pays exactly that amount |
| Table | 5 seats, public or private. The host picks the tier. Needs **≥2 staked humans** to START. Empty seats are **Hard bots**, and the host can't add, remove or re-level CPUs |
| When credits move | The stake leaves your balance **when you sit**. Standing up before the deal returns it in full |
| Pot | Human stakes only. Bots put nothing in. No rake |
| Win | The match winner (the engine's `matchWinner`: lowest score, then most piles in the last round) takes the whole pot |
| A bot wins | **The pot is lost.** Those credits leave the economy |
| Tie on score *and* piles *(my call)* | Split evenly among the tied seats. A bot's share is lost, and an odd credit goes to the lowest seat. The engine still names one winner for the scoreboard |
| Leaving or dropping mid-match | A Hard bot plays your seat at once on EXIT, or after the existing 60s disconnect grace. **You can come back** (the same table code or RETURN) and take your seat back. Once the bot has finished **2 rounds** for you, your seat is **forfeited**: it counts as a bot from then on, and if it wins, the pot is lost |
| Seat wins while you're away, before forfeit | The pot is still yours and lands in your balance |
| Forfeited player *(my call)* | Their stake stays in the pot, and they can't sit at another credit table until this match ends ("Your stake is in the match at TABLE until it ends") |
| Mid-match join | Refused at credit tables. The only exception is a staked, non-forfeited player coming back to their own seat |
| One credit table at a time | Across Poker and Muushig together (`credit_seats.user_id` is already the PK) |
| Server restart / deploy mid-match | Match void: every stake goes back, forfeiters included (`restart_return` and the existing one-time notice) |
| Play again *(my call)* | Settling ends the match. Everyone stays at the table **unseated**, and the results screen offers **PLAY AGAIN · 500** (stakes and seats you) or LEAVE. The first player to re-stake becomes host if the old host hasn't. At START, members who didn't re-stake go back to the lobby |
| FREEZE (admin) | Waiting: stood up and stake refunded. Mid-match: treated as leaving, with no comeback |

## Money model

The invariant gains one term, for credits that bots win:

```
sum(balances) + sum(seat stacks) = granted + claimed − removed − won by bots
```

- A staked Muushig seat is an ordinary `credit_seats` row (`stack = stake`, `pending = 0`). So CLAIM's "below 1000" check, `returnAllSeats()` at boot, `releaseTable()` on shutdown, the admin seat view and the one-table rule all work unchanged.
- **Settling a match** is one transaction. Lock the table's seat rows and check each holds exactly the stake (otherwise it's a `CreditMismatch`, which follows the same "never pay on disagreement" path as Poker). Then delete the rows, credit the winner(s) with a `pot` ledger row, write one `credit_hands` row for the match (`game_type 'muushig'`, `cpu_take` = the part lost to bots, and per-seat `{user_id, stack_before: stake, committed: stake, net, won, final_score, eaten, forfeited}`), and set `first_hand_at` for every staker. Settling uses `retry()`, and the table shows "Saving…" until it succeeds.

## Database: `server/db/migrations/011_muushig_credits.sql`

- `alter type credit_kind add value 'stake'`, `'stake_back'` and `'pot'` (Muushig sit / stand up before the deal / winnings).
- `credit_ledger.game_type text not null default 'poker'`, `credit_seats.game_type text not null default 'poker'`, `credit_hands.game_type text not null default 'poker'`. Existing rows are all Poker, so the defaults backfill them.
- `credit_hands.cpu_take bigint not null default 0`.
- The rathole query reads `kind = 'cash_out'`, which Muushig never writes, so it needs no change.
- RLS is already on for these tables, and `lockdown.test.js` stays green.

## Server

**New: `server/game/stakes.js`**, a byte-identical copy of the new `src/utils/stakes.js`: `STAKES = { LOW: 100, MID: 500, HIGH: 2000 }`, `FORFEIT_ROUNDS = 2`, `MIN_HUMANS = 2`, and a pure `settlement({ stake, seats: [{userId|null, forfeited}], winners: [seat] })` that returns the payouts and `cpuTake`. Add it to the copy test next to the other Muushig copies (`tests/unit/muushig-copies.test.js`).

**`server/credits/accounts.js`**: add `placeStake(userId, {tableId, tableName, tier, stake, amount})` (as `buyIn`, but a fixed amount, `kind 'stake'`, `game_type 'muushig'`), `returnStake(userId, tableId)` (`kind 'stake_back'`), and `settleMatch({tableId, tier, isPrivate, sessionId, stake, seats, payouts, cpuTake, summary})`. Make `ledger()`, `payOut()`, `releaseTable()` and `returnAllSeats()` pass `game_type` through from the seat row. Reuse `lockAccount`, `ledger`, `setBalance`, `whyCantPlay`, `CreditError` and `failure` as they are.

**New: `server/credits/matchTables.js`, class `CreditMatch`**, the match-stake counterpart of `CreditTable` (same per-table promise queue, `released` flag and `retry` use; see `server/credits/tables.js`). It is game-agnostic so Thirteen can use it later:
- `sit(user)`, `standUp(userId)` (waiting only: refund), `onTable(userId)` (the stake).
- `begin(seatMap)` at START, `away(userId)` / `back(userId)` (comeback), and `roundEnded()` (each away seat's round count goes up by one, forfeiting at `FORFEIT_ROUNDS`).
- `settle(finalState)` → `{ payouts, cpuTake }`, `release(kind)`.
- A `view()` for the browser: `{ tier, stake, pot, settled, payouts, forfeited: [seat], away: {seat: roundsLeft} }`.

**`server/index.js`** (the lobby code is shared; branch on `lobby.credits` the way Poker does):
- `create_lobby` / `join_lobby`: `credit = tier != null && (type === "poker" || type === "muushig")`. For Muushig, `lobby.credits = new CreditMatch(...)` and `lobby.game` stays null until START. The client sends `buyIn` = the stake it showed, and the server refuses it if that doesn't equal `STAKES[tier]`. `credit_table_info` handles invite links as it does today. "Full" counts staked seats, not members. `creditRefusal` skips the poker-only `isTier` and uses a per-game tier check.
- Joining a running credit match is refused unless the player is a staked, non-forfeited player returning to their own seat. In that case re-add the member, `replaceSeat(HUMAN)`, and call `credits.back()`.
- `add_cpu` / `remove_cpu` / `set_cpu_level` → "Credit tables seat Hard bots".
- `startGame`: needs `MIN_HUMANS` staked. It removes unseated members, fills the empty seats with `HARD`, and creates `MuushigGame` with `level: "HARD"`, so takeovers are Hard too. Then call `credits.begin()`, and make `onRoundEnd` also call `credits.roundEnded()`.
- `onGameOver` → `credits.settle()`, then `closeSession`; the state broadcast carries the result. After that the lobby resets to waiting: game destroyed, seats cleared, members kept unseated, and the host is set by the first re-stake.
- `removeMember` mid-credit-match: the bot takes over (existing code) and `credits.away()` runs. In waiting it calls `credits.standUp()`, which refunds. The last member leaving a waiting table releases it. Mid-match, the match plays on with bots and still settles.
- `request_rematch` is refused at credit tables; a new `credit_restake { lobbyId }` takes its place.
- `muushigView` output gains `credit: lobby.credits.view()`. `publicLobbyList` gains `tier` + `stake` for Muushig and counts staked seats. `tableViewFor` gains `credit` (tier, stake, pot, `myStaked`, unseated "deciding" count).
- `onTableFor` (CLAIM's held amount) and `standUpCreditPlayer` (admin) also cover `CreditMatch`. `shutDown` releases `CreditMatch` tables too.
- `/api/credits/me` gains `rejoin: { gameType, code } | null` while you have a non-forfeited stake in a running match.

**`server/credits/check.js`**: add `wonByBots = sum(credit_hands.cpu_take)` to the totals and the formula.
**`server/credits/leaderboard.js`**: split the table source by `game_type` into `poker` and `muushig`, adding the current seat's stack to its own game.
**`server/credits/flags.js` / `flagRules.js`**: no rule changes, because Muushig rows carry `net`/`stack_before`/`committed`/`folded_street: null`, which `pairFlows` already reads. `pairDetail` selects `game_type`, `cpu_take`.
**`server/matches.js`**: the match page reads the `credit_hands` row for a Muushig session (`session_id`) to show its stake, pot and payouts.

## Browser: UI changes and additions

**Muushig lobby** (`src/pages/muushig/LobbyMuushig.jsx`, `src/components/lobby/GameLobby.jsx`)
- `MUUSHIG.credits = { kind: "stake" }` turns on the existing FREE / CREDITS tabs. GameLobby stops importing Poker tiers directly and reads them from the game config (Poker's is `{ kind: "buyIn" }`).
- `CreditHostPanel` takes its tier buttons as props: Muushig shows **LOW 100 / MID 500 / HIGH 2,000**, Poker keeps its blinds.
- The table list's tier badge reads `MID · 500` with a pot hint (`3 in · pot 1,500`). The seat pips count staked seats.
- `BalancePanel`: when `rejoin` is set, a **RETURN TO TABLE** button (→ `/join/CODE`) with "Your seat is played by a bot".

**New `src/components/credits/StakePanel.jsx`** (modal, styled like `BuyInPanel` and built on `Modal`). This is what you see before you sit:
- Title `Stake · MID 500`, the table name, and `Balance 1,240`.
- Three plain lines: "Winner takes the pot." "Empty seats are Hard bots. If a bot wins, the pot is lost." "Leave mid-match and a bot plays for you. Back within 2 rounds or your stake is lost."
- Buttons CANCEL and **STAKE 500**. If the balance is short: "Your balance is 340; this table's stake is 500", with `ClaimButton` under it when a claim is ready.

**Waiting table** (`src/components/thirteen/WaitingTable.jsx`, shared; new optional `credit` prop)
- A pot banner above the seats: `POT 1,000 · 2 × 500 · WINNER TAKES ALL` in gold.
- Empty seats read **HARD BOT** with no CPU controls.
- START is disabled until 2 have staked ("Needs 2 players with stakes in"), and the hint becomes "Empty seats are Hard bots".
- An unseated member (after a match) sees a **PLAY AGAIN · 500** button in place of a seat and "N deciding" under the seats. EXIT says "Your 500 comes back".

**In the match** (`src/pages/muushig/GameMuushig.jsx`, `MuushigScoreBoard.jsx`)
- A gold **POT 1,500** chip in the table header, from `state.credit`.
- On the scoreboard, a seat a bot is covering shows **AWAY · 2 rounds left** (then **FORFEITED**), so everyone can see the comeback clock.
- EXIT during a credit match first asks: "Leave? A bot plays your seat. Come back within 2 rounds or your 500 is lost."

**Match results** (`src/components/muushig/RoundResults.jsx`, new optional `credit` prop)
- Winner line: `NOVSH WINS 1,500 CREDITS`. Or `A HARD BOT WON. THE POT IS LOST`. Or a split line.
- Per seat, a signed net (`+1,000` / `−500`), using `signed.js`.
- "Saving…" until settled.
- Buttons **PLAY AGAIN · 500** (disabled with the reason if the balance is short, plus CLAIM) and LEAVE, in place of the host-only REMATCH.

**Elsewhere**
- `SourceBreakdown.jsx`: add `["muushig", "Muushig"]` to `SOURCES`.
- `Admin.jsx`: the economy panel gets a **Won by bots** row. The pair detail renders a Muushig row as `Muushig · MID 500 · pot 1,500 · won by X` with each seat's final score and net, in place of board and hole cards.
- `MatchDetail` (`src/components/match/Summary.jsx`): a `CREDITS · MID · POT 1,500` tag and each seat's payout.

## As built

- Stakes and the payout rule: `src/utils/stakes.js` (copied to `server/game/stakes.js`).
- Money: `placeStake`, `returnStake` and `settleMatch` in `server/credits/accounts.js`; the table's queue and comeback clock in `server/credits/matchTables.js` (`CreditMatch`).
- Database: `server/db/migrations/011_muushig_credits.sql`.
- Lobby wiring: `server/index.js` (`isCreditMatch`, `stakeAndSeat`, `joinCreditMatch`, `settleCreditMatch`, `startCreditMatch`, `credit_restake`).
- Tests: `tests/unit/stakes.test.js`, `server/tests/db/credit-stakes.test.js`, `server/tests/db/credit-matches.test.js`, `server/tests/db/credit-match-socket.test.js`, `tests/ui/CreditMatches.test.jsx`.
