# Khuzur Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Khuzur from practice-only to a full hall game: online tables with seat choice, credits (1st takes the pot), XP and gold, Easy/Medium/Hard CPUs, stats, and the deferred fixes.

**Architecture:** The rules stay pure in `src/utils/khuzur/` and are copied byte for byte to `server/game/khuzur/`. A server wrapper `server/game/khuzurGame.js` owns each online match: timers, CPUs, the turn clock, surrender votes, redacted views. `server/index.js` routes the new game type through the existing lobby, waiting-table, credit-match and recording paths. The browser's `GameKhuzur` page gains an online mode driven by server states, and the shared lobby and waiting table learn about table shapes and seat picking.

**Tech Stack:** React 19, socket.io 4, Express 5, Postgres (pg), vitest (projects `unit`, `ui`, `server`).

**Spec:** `docs/superpowers/specs/2026-11-05-khuzur-complete-design.md` (builds on `docs/superpowers/specs/2026-11-05-khuzur-design.md`; rules in `docs/khuzur-rulebook.md`).

## Global Constraints

- `src/utils/khuzur/{cards,engine,ai}.js` and `server/game/khuzur/{cards,engine,ai}.js` are byte-identical (`tests/unit/rules-copies.test.js`).
- Every view sent to a browser hides other hands, `drawPile`, `deadPile` and `dealDeck` as `{ hidden: true }` placeholders. Stack layers, the trump card, dealt draws and events are public.
- Online turn clock: 45,000 ms for a human's turn. Expiring while leading calls `skipLead`; while beating, `pickUp`.
- Credits: LOW 100 · MID 500 · HIGH 2,000; `MIN_STAKED` 2. The pot goes to the 1st-place team's human, non-forfeited seats, split evenly, with the odd credits to the lowest seats. With none of those, the pot is lost.
- XP and gold: `matchReward({ place, players: table.teams })`.
- Commits: conventional, one line, no attribution trailer. No emoji glyphs in UI text. No rating or Elo.
- Every animation stops under reduced motion.

## Review Focus

1. **A hidden card leaking in an online view.** That includes a picked-up stack, which becomes part of a hidden hand, and the draw pile's count versus its contents. Expected: `khuzurView` hides them all. Tested in Task 3.
2. **The turn clock firing after the turn already moved.** For example, a human moves at 44.9 s. Expected: the clock is cleared on every state change and never applies a stale timeout. Tested in Task 3.
3. **A surrender vote left hanging when a teammate leaves or a bot takes over.** Expected: votes are recomputed on `replaceSeat`. A vote whose remaining humans have all voted goes through. Tested in Task 3.
4. **Settling a credit match whose 1st-place team is all bots, or players who left.** Expected: the pot is lost, nobody is paid, and the ledger still balances. Tested in Task 5.
5. **Someone joining mid-match or reconnecting.** Expected: they get their current view, with their own hand, and the page shows the table without replaying old animations. Tested in Task 7.

---

### Task 1: Engine: concede and skipLead

**Files:** Modify `src/utils/khuzur/engine.js`, `tests/unit/khuzur-engine.test.js`. The practice page's surrender button keeps working through `concede`.

**Interfaces:**
- Produces:
  - `concede(state, seat) → state`. The seat's team takes the lowest place not yet given, every member is marked `out`, their hands go to `deadPile`, and they're removed from `stack.pending`. If it was one of their turns, the turn moves on: to `pending[0]` mid-stack, or to `nextIn` when leading. Once one team is left, it takes the next place from the top and the phase becomes MATCH_OVER. It throws `"You're already out"` and `"You can only surrender during play"`.
  - `skipLead(state, seat) → state`. Allowed only when it's the seat's turn and `stack` is null; the turn moves to `nextIn(seat)`, with event `{ type: "skip", seat }`.
  - `surrender` is removed; practice calls `concede`.
- Tests (replace the old surrender tests):
  - FFA 4, where seat 3 already holds place 1 and seat 0 concedes: `places[0] === 4`, seat 0's cards are in `deadPile`, and play goes on.
  - 2v2 concede: places `[2, 1]` and MATCH_OVER.
  - 2v2v2 concede by team 0: team 0 gets 3, and the others play on.
  - A concede by the seat on turn mid-stack moves the turn to the next pending seat.
  - `skipLead` moves the turn to the left. It's refused while a stack is open, and out of turn.
- Run `npx vitest run --project unit tests/unit/khuzur-engine.test.js` and `--project ui tests/ui/GameKhuzur.test.jsx`.
- Commit: `feat: khuzur concede and skip moves`.

### Task 2: CPU levels: Easy and Hard

**Files:** Modify `src/utils/khuzur/ai.js`, `tests/unit/khuzur-ai.test.js`, `tests/integration/khuzur-matches.test.js`.

**Interfaces:**
- `aiAction(state, rng)` reads `state.players[seat].level` (`"EASY" | "MEDIUM" | "HARD"`, default MEDIUM).
  - **EASY:** swaps the trump 7. Leads a random valid lead within the limit, built from `cheapestLead` sizes on a shuffled hand. When it can cover, it beats with `cheapestCover` with probability 2/3, else picks up. It keeps the stall rule.
  - **HARD:** candidates are Medium's choice, plus pick-up (when beating), or each lead size's `cheapestLead` and the cheapest single (when leading). Each candidate is scored by `HARD_SAMPLES = 24` rollouts. A rollout deals the cards this seat can't see at random into the other hands (keeping each hand's count) and into the draw pile, then plays every seat with Medium to the end or to `ROLLOUT_CAP = 400` moves. The score is the team's place (lower is better), plus the hand-size difference when capped. It keeps the best, with ties going to Medium's choice.
  - `createMatch` players accept `level`, carried on `players[i].level`.
- Tests:
  - Every level, at every table shape, finishes 10 seeded matches with no stuck state. Hard runs 3 shapes × 3 seeds.
  - Medium places 1st against Easy in ≥ 60% of 200 seeded 1v1 matches.
  - Hard places 1st against Medium in ≥ 52% of 60 seeded 1v1 matches.
  - Hard never reads other hands: the same answer comes back when other hands are swapped for same-size ones, with the same rng.
- Commit: `feat: khuzur easy and hard cpus`.

### Task 3: Server game wrapper

**Files:** Create `server/game/khuzur/{cards,engine,ai}.js` (copies) and `server/game/khuzurGame.js`. Modify `tests/unit/rules-copies.test.js` (add `["khuzur", ["cards.js", "engine.js", "ai.js"]]`). Test `server/tests/khuzurGame.test.js`, following the layout of the existing non-DB server tests.

**Interfaces:**
- `DEFAULT_KHUZUR_DELAYS = { draw: 1300, lead: 1000, beat: 900, drawReveal: 2000, turn: 45000 }`.
- `new KhuzurGame({ seats, table, level = "MEDIUM", onState, onGameOver, delays, rng })`. `seats` is `[{ type, name, avatar?, level? }]`; it calls `createMatch`.
- `move(seat, move)` takes `move.type` as one of `drawForDeal{depth}`, `lead{cardIds}`, `beat{cardIds}`, `pickUp`, `swapSeven`, `surrender`, `keepPlaying`, and returns `{ ok } | { ok: false, error }`. Payloads are checked: card ids are strings ≤ 6 characters, at most 7 of them.
- `surrender` adds the seat to `votes[team]`. When every HUMAN seat of the team has voted, it calls `concede`. `keepPlaying` clears `votes[team]`. Votes for a team clear when its members change (`replaceSeat`), and are re-checked then.
- `replaceSeat(seat, { type, name, avatar, level })`, as MuushigGame's.
- `rematch()`: `startNextMatch` when MATCH_OVER.
- `turnMsLeft()`.
- `destroy()`.
- The turn clock is armed for a HUMAN on turn in PLAY. It's cleared on every state change and re-armed for the new turn.
- `startedAt`, `finishedAt` and `dealMsLeft()` (opening: `drawReveal` after the first dealer is drawn) mirror MuushigGame.
- `khuzurView(state, seat, game)` returns the redacted state plus `mySeat`, `turnMsLeft`, and `votes` (team → seats).
- Tests (with `delays` set to 0 and a fake turn of 50 ms):
  - CPU-only seats play a match to MATCH_OVER.
  - A human's illegal move returns the engine's error.
  - On turn-clock expiry, a human leader is skipped and a human beater picks up.
  - A clock armed for a turn that already moved never fires a move.
  - The view hides other hands, the draw pile, the dead pile and the deal deck.
  - The vote: in 2v2 with two humans on team 0, one surrender isn't enough. Two make the team concede. `keepPlaying` clears it. `replaceSeat` of the second human to AI makes one vote enough.
- Commit: `feat: khuzur server game`.

### Task 4: Lobby, seats, moves and rematch on the server

**Files:** Modify `server/index.js`. Test `server/tests/khuzurSockets.test.js`, socket-level, with no database, following an existing non-DB socket test.

**Interfaces:**
- `GAMES.khuzur = { seats: 6, stateEvent: "khuzur_state", view: khuzurView, create: (seats, hooks, lobby) => new KhuzurGame({ seats, table: lobby.table, delays: KHUZUR_DELAYS, ...hooks }) }`. `create` receives the lobby, and the other games ignore the extra argument. `KHUZUR_DELAYS` reads env overrides as Muushig's do.
- `create_lobby` accepts `table` for khuzur and validates it with `isValidTable` and the hand size. Then `lobby.table = table`, and `maxPlayers` and `seats` take `seatCount(table)`.
- `tableViewFor` adds `table` (khuzur only).
- `publicLobbyList` adds `table`.
- New `take_seat({ lobbyId, seat })`: a member at a waiting khuzur table moves to an empty seat. It's refused once the game has started, for a taken or CPU seat, and at a credit table for someone who hasn't staked.
- `khuzur_move({ lobbyId, move })` mirrors `muushig_move`.
- `startGame` fills empty seats with MEDIUM CPUs, or HARD at credit tables, for khuzur as for muushig.
- `request_rematch` works through `game.rematch()`.
- The leave and CPU-cover path (non-`SELF_SEATING`) works through `replaceSeat`.
- `STAKE_GAMES` gains khuzur, and the CreditMatch's `botsFill` is true for khuzur.
- Tests:
  - Creating a khuzur 2v2 table seats the host. A second socket joins and `take_seat` moves it to seat 2. START fills seats 1 and 3 with bots, and both humans get `khuzur_state` with their own hand only.
  - A bad `table` is refused.
  - `take_seat` onto a CPU seat is refused.
  - A move out of turn returns `move_rejected`.
- Commit: `feat: khuzur online tables on the server`.

### Task 5: Credits, recording, stats and solo reports on the server

**Files:**
- Create `server/db/migrations/018_khuzur.sql` (`alter type game_type add value if not exists 'khuzur';`) and `server/game/khuzurStats.js`.
- Modify:
  - `src/utils/stakes.js` and its server copy: `matchWinners.khuzur`, and `settlement({ ..., humansOnly })`
  - `server/credits/matchTables.js`: khuzur marks seats still `away` at settle as forfeited, and settles with `humansOnly: true`
  - `server/persistence.js`: khuzur places come from `khuzurPlaces(state)`, and the reward uses `players: state.table.teams`
  - `server/matches.js`, `server/stats.js` (VIEWS gains khuzur) and `server/credits/leaderboard.js` (a khuzur source column)
  - `server/solo.js`: a khuzur report with players `[{ place }]`, places checked as 1..n with ties allowed only for teammates, and `rankSolo` returning the places
- Tests:
  - `tests/unit/stakes.test.js`, settlement with `humansOnly`: a team of a human and a bot wins, and the human gets the whole pot. An all-bot winning team means `payouts` is empty and `cpuTake === pot`. An odd split sends the extra credit to the lowest seat.
  - `tests/unit/khuzur-stats.test.js`: `khuzurPlaces` maps each seat to its team's place, and `khuzurSeatStats(events, seat)` counts leads, beats, pick-ups and cards picked up.
  - A server solo-report unit test for a khuzur report.
  - The DB suites stay as they are; they skip without `TEST_DATABASE_URL`.
- Commit: `feat: khuzur credits, records and stats`.

### Task 6: The Khuzur lobby: host, join, tables, credits, practice

**Files:** Modify `src/components/lobby/GameLobby.jsx` (an optional `game.setup = { panel, values }`, where `values` is spread into every `create_lobby` emit and into practice's navigation state, and `panel` renders above the panels column). Rewrite `src/pages/khuzur/LobbyKhuzur.jsx` as `GameLobby` with `credits: { kind: "stake" }`, `route: "/game-khuzur"`, and the builder as the setup panel. Show the table shape on each open-tables row (`TablesPanel` shows `l.table` as "2 V 2 · 5 CARDS" when present). Test `tests/ui/LobbyKhuzur.test.jsx`, rewritten.

- Tests:
  - The builder is shown, with the deal count line.
  - HOST emits `create_lobby` with `gameType: "khuzur"` and `table`.
  - PRACTICE (EASY/MEDIUM/HARD) navigates to `/game-khuzur` with `table` and `aiDifficulty`.
  - The CREDITS tab exists.
  - An open table shows its shape.
- Commit: `feat: khuzur lobby with online tables and credits`.

### Task 7: The online table in the browser

**Files:**
- Modify:
  - `src/components/thirteen/WaitingTable.jsx`: 6 seats; an optional `seatColor(i)` badge; an optional `onTakeSeat(i)` that shows SIT HERE on an empty seat when you're seated elsewhere; `table.table` shown as the shape line
  - `src/pages/khuzur/GameKhuzur.jsx`: split into `SoloKhuzur` and `OnlineKhuzur`, as GameMuushig is, with the shared table body in `KhuzurTableView`
  - `src/components/khuzur/KhuzurControls.jsx` (KEEP PLAYING, the vote state, the turn clock)
- Online:
  - Join, `check_game_status`, `khuzur_state` → `setGame`, which replaces the state with no queue.
  - Moves emit `khuzur_move`. The waiting table shows until the first state arrives. Leaving emits `leave_lobby`.
  - Chat runs in the `TableSidebar` with `GameChat`, as Muushig's.
  - PLAY AGAIN emits `request_rematch` (host), or `credit_restake` at a credit table.
  - Standings show the reward panel (`RewardPanel`) and the credit result (pot and payouts) when present.
  - The turn clock counts down from `turnMsLeft`.
  - SURRENDER emits `surrender`. Your team's open vote shows "TEAMMATE WANTS TO SURRENDER" with SURRENDER and KEEP PLAYING.
  - The `practice: { aiDifficulty }` CPUs carry that level in practice.
  - Practice reports finished matches with `useSoloMatchReport` (prefix `KZ`) using `khuzurSoloReport` from `src/utils/soloReport.js`.
- Tests:
  - `tests/ui/GameKhuzurOnline.test.jsx`, with a fake socket as in `tests/ui/GameMuushigOnline.test.jsx`:
    - the waiting table shows team colours, and SIT HERE emits `take_seat`;
    - a `khuzur_state` renders the table with your hand;
    - LEAD emits `khuzur_move`;
    - `turnMsLeft` shows a clock;
    - a teammate's vote shows KEEP PLAYING, which emits `keepPlaying`;
    - a late state with the match in progress renders without the draw overlay.
  - `tests/ui/WaitingTable.test.jsx` gains a 6-seat case.
- Commit: `feat: khuzur online table`.

### Task 8: Stats in the browser

**Files:** Modify `src/pages/Profile.jsx` (GAME_NAMES, the filters, PLACES `khuzur: 6`), `src/pages/MatchDetail.jsx` (GAMES entry, colour `#a8552a`), `src/pages/Leaderboard.jsx` (a Khuzur column), `src/utils/matchSummary.js` (khuzur figures from stats: Leads, Beats, Pick-ups, Cards picked up) and `src/utils/soloReport.js` (`khuzurSoloReport`). Tests: the existing Profile, MatchDetail, Leaderboard and soloReport tests gain a khuzur case each.

- Commit: `feat: khuzur in profiles, match pages and the leaderboard`.

### Task 9: Deferred fixes, rules and notes

**Files:** `GameKhuzur.jsx`, `KhuzurTable.jsx`, `KhuzurRules.jsx`, `docs/khuzur-rulebook.md`, `CHANGELOG.md`.

- The five fixes in the spec, each with a UI test where it's observable:
  - the reveal timer uses a stable `onDone`;
  - CPU moves are computed outside the updater, with a fallback;
  - the error clears on the next state;
  - the DRAW count includes the trump;
  - you get a DEALER chip on your status tag when you deal.
- The rulebook and in-game rules gain:
  - online tables with seat picking;
  - the 45 s clock (already there);
  - surrender as concede, with the team vote;
  - CPU levels;
  - credits (1st takes the pot);
  - XP and gold.
- The 0.7.0 notes gain online, credits, levels and stats.
- Run `npm test` (the DB suites need Postgres: start `khuzur-db` and set `TEST_DATABASE_URL` if available, otherwise report them) and `npm run lint`.
- Commit: `feat: khuzur online rules and notes, deferred table fixes`.
