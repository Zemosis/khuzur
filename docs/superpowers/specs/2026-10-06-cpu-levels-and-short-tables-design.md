# CPU levels on the waiting table, and 2–3 player Thirteen — design

**Date:** 2026-10-06
**Status:** approved in chat, awaiting spec review

## Problem

On an online table the host can add or remove CPUs seat by seat, but:

- Every online CPU plays at MEDIUM. The host can't choose how hard the bots are,
  in either game.
- START fills every empty Thirteen seat with a CPU, so a Thirteen match always
  has 4 players. Two or three friends can't play just among themselves.

## Goal

- **Thirteen:** the host decides whether to add CPUs at all. A table starts with
  2, 3 or 4 players (humans plus any CPUs added). Each CPU's difficulty is the
  host's choice.
- **Muushig:** always 5 players, so empty seats are still filled with CPUs at
  START. The host chooses each added CPU's difficulty.

## Decisions

- **Per-CPU levels.** An empty seat offers **+ EASY / + MEDIUM / + HARD** to the
  host. A seated CPU shows its level as a chip the host taps to cycle
  EASY → MEDIUM → HARD, next to REMOVE. Other players see the levels but can't
  change them.
- **Thirteen plays with the filled seats only.** At START the empty seats are
  dropped and the game is built for 2–4 players. (Rejected: keeping 4 seats with
  "absent" players treated as eliminated. The fake seats would leak into the
  scoreboard, placements, records and the CPU's danger checks.)
- **Deal:** 13 cards each whatever the player count; the rest of the deck isn't
  dealt. The first round's lead goes to the 3♦ holder, or to whoever holds the
  lowest card dealt when nobody has the 3♦. Later rounds: the round winner
  leads, as today.
- **Layout:** with 2 players the opponent sits across (top); with 3, left and
  right; with 4, as today. Play stays clockwise.
- **Muushig START** fills empty seats with MEDIUM CPUs. To choose a bot's level,
  the host adds it before starting.
- **Unchanged:** a CPU taking over a disconnected player plays at MEDIUM; a
  newcomer can take over a CPU mid-match; practice games keep the single level
  picked in the lobby; scoring, elimination at 25, rewards and rating.
- **Out of scope:** changing levels after the match starts, showing CPU levels
  in-game, 2–3 player Muushig.

## Design

### Server: lobby (`server/index.js`)

- A CPU seat becomes `{ kind: "cpu", name, level }`, `level` one of
  `EASY | MEDIUM | HARD`.
- `add_cpu { lobbyId, seat, level }`: `level` is validated; anything else is
  rejected (`move_rejected`). A missing `level` means MEDIUM, so older clients
  keep working.
- New `set_cpu_level { lobbyId, seat, level }`: host only, waiting tables only,
  the seat must hold a CPU.
- `tableViewFor` sends each CPU seat's `level`.
- `startGame`:
  - **Thirteen:** refuses with fewer than 2 filled seats ("Add a player or a CPU
    to start"). Drops empty seats, keeping order, and renumbers each seated
    member's `seatIndex` to its new position, so lobby seat *i* is still engine
    player *i*. `roster` entries are written after renumbering.
  - **Muushig:** as today, empty seats become CPUs, at MEDIUM.
  - Each CPU seat passes its level to the engine.
- Disconnect takeovers keep creating MEDIUM CPUs.

### Engine and rules (Thirteen, client and server copies kept identical)

- `gameLogic.js`: anything counting seats uses `players.length` instead of
  `GAME_SETTINGS.NUM_PLAYERS` (dealer rotation in `createGameState` and
  `startNextRound`). `matchWins` defaults to one zero per player.
- Each player carries an optional `level`. `makeAIDecision` plays at
  `player.level`, falling back to `gameState.aiDifficulty`, which keeps practice
  games as they are.
- `ThirteenGame` (`server/game/engine.js`): takes 2–4 seats, deals the first *n*
  of the 4 dealt hands, picks the opening lead as above, and starts `matchWins`
  at one zero per seat. A rematch keeps the same seats.
- `MuushigGame` already reads a per-seat `level`; the lobby now sends the
  host's choice instead of always MEDIUM.

### Browser

- `WaitingTable.jsx`: the three add buttons and the level chip as above. The
  hint under the seats depends on the game: Thirteen — "Start with 2 to 4
  players. Empty seats stay empty."; Muushig — "Empty seats are filled with
  MEDIUM CPUs when you start." For Thirteen, START is disabled until 2 seats are
  filled.
- `GameThirteen.jsx`: seat positions come from the player count (2: bottom/top;
  3: bottom/left/right; 4: bottom/left/top/right). The 4-player guard, the seat
  rotation, `dealCounts`, the play pile's seat names and the `DealAnimation`
  seats all follow it.
- `GameMuushig.jsx`: passes the new levels through; no layout change.

### Records

Unchanged. `rankSeats` (`server/persistence.js`) already places any number of
players, so a 2-player match records places 1 and 2 and gets the usual
placement rewards and rating.

## Testing

- **Rules and engine (both copies):** 2- and 3-player states (deal size, opening
  lead with and without the 3♦ dealt, turn order, dealer rotation, match end);
  CPU-only 2- and 3-player matches played to game over; a CPU playing at its own
  level when the table's differs.
- **Server (`socket.test.js`):** `add_cpu` with each level and with a bad one;
  `set_cpu_level` (host only, CPU seats only); Thirteen START refused below 2
  seats; a 2-player start where seat indexes are renumbered and moves reach the
  right player; Muushig START filling with MEDIUM and keeping chosen levels.
- **UI:** the add buttons, the level chip and START disabled below 2 seats in
  `WaitingTable`; a 2- and a 3-player Thirteen table rendering their seats.
- **End to end:** two browsers at a 2-player Thirteen table, dealt and played.
