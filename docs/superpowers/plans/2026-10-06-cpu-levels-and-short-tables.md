# CPU Levels and 2–3 Player Thirteen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the host choose each CPU's difficulty on the waiting table (both games) and start a Thirteen table with 2, 3 or 4 players.

**Architecture:** CPU seats carry a `level` from the lobby into the engines. At Thirteen START the server drops empty seats and renumbers seated members, so lobby seat *i* stays engine player *i*; the rules count `players.length` instead of a fixed 4. The browser lays out 2–4 seats from one position table shared by the waiting table and the game table.

**Tech Stack:** React 19 + Vite, Socket.IO 4, Node/Express server, Vitest (projects `unit`, `server`, `ui`), GSAP.

**Spec:** `docs/superpowers/specs/2026-10-06-cpu-levels-and-short-tables-design.md`

## Global Constraints

- CPU levels are exactly `EASY`, `MEDIUM`, `HARD`. A missing level means `MEDIUM`.
- A CPU taking over a disconnected player plays at `MEDIUM`.
- Thirteen deals 13 cards to each player whatever the count; the rest of the deck isn't dealt.
- First round lead: the lowest card dealt (the 3♦ whenever someone holds it). Later rounds: the round winner leads.
- Thirteen START needs at least 2 filled seats; the rejection reason is exactly `Add a player or a CPU to start`.
- Muushig START fills empty seats with `MEDIUM` CPUs.
- Rule files exist twice and must stay byte-identical: `src/utils/gameLogic.js` ↔ `server/game/gameLogic.js`, `src/utils/aiPlayer.js` ↔ `server/game/aiPlayer.js`. Edit the `src/utils` copy, then `cp` it over.
- Commit messages: conventional, one line, **no `Co-Authored-By` or any attribution trailer**. Don't push.
- Waiting-table hints, verbatim: Thirteen `Start with 2 to 4 players. Empty seats stay empty.`; Muushig `Empty seats are filled with MEDIUM CPUs when you start.`
- Run tests with `npx vitest run <path>`; the 5 Postgres suites in `server/tests/db/` fail locally without a database and are not part of this work.

## Review Focus

1. **A human who took over a HARD CPU's seat, then disconnects** — the CPU that takes over plays at MEDIUM, not HARD. Pinned in Task 2.
2. **Rematch of a 2-player match** — still 2 players, CPUs keep their levels, `matchWins` keeps 2 entries. Pinned in Task 2.
3. **A 3-player match where the next dealer would be past the last seat** — the deal wraps among 3, skipping the eliminated. Pinned in Task 1.
4. **An older browser sending `add_cpu` without a level** — seats a MEDIUM CPU instead of being rejected. Pinned in Task 3.
5. **Someone joins a running 2-player table with no CPU to take over** — they watch as a spectator and the table renders. Pinned in Task 5.

---

### Task 1: Rules count the players there are, and CPUs play at their own level

**Files:**
- Modify: `src/utils/gameLogic.js` (`createGameState`, `endRound`, `startNextRound`), then copy to `server/game/gameLogic.js`
- Modify: `src/utils/aiPlayer.js` (`makeAIDecision`), then copy to `server/game/aiPlayer.js`
- Test: `tests/unit/gameLogic.test.js`, `tests/unit/aiPlayer.test.js`

**Interfaces:**
- Produces: `createGameState(hands, startingPlayer, aiDifficulty, matchMeta)` works for `hands.length` of 2–4 (dealer and `matchWins` sized to it). `startNextRound(state, hands)` rotates the dealer among `state.players.length`. Players may carry `level: "EASY"|"MEDIUM"|"HARD"|null`; `makeAIDecision(player, currentPlay, gameState)` uses `player.level`, else `gameState.aiDifficulty`, else `"MEDIUM"`.

- [ ] **Step 1: Write the failing rules tests**

In `tests/unit/gameLogic.test.js`, inside the `describe.each(COPIES)` block, add after the `describe("playCards", …)` block:

```js
  describe("tables of 2 and 3", () => {
    it("moves the turn and sizes the dealer and match wins to 2 players", () => {
      const s = L.createGameState([cards("3♦ 9♠"), cards("4♦ 5♦")], 0);
      expect(s.players).toHaveLength(2);
      expect(s.dealerIndex).toBe(1);
      expect(s.matchWins).toEqual([0, 0]);
      expect(play(s, "3♦").currentPlayerIndex).toBe(1);
    });

    it("a 2-player match ends with one match win recorded for 2 seats", () => {
      const s = stateWith(L, { hands: ["3♦", "4♦"], scores: [0, 24], current: 0 });
      const over = play(s, "3♦");
      expect(over.gameState).toBe(S.GAME_OVER);
      expect(over.matchWins).toEqual([1, 0]);
    });

    it("a 3-player round passes the deal on past the last seat, skipping the eliminated", () => {
      const s = stateWith(L, { hands: ["3♦", "", "6♦"], current: 0, eliminated: [false, true, false], dealerIndex: 2 });
      const ended = play(s, "3♦");
      expect(ended.gameState).toBe(S.ROUND_END);
      const next = L.startNextRound(ended, [cards("7♦"), [], cards("8♦")]);
      expect(next.dealerIndex).toBe(0);
      expect(next.currentPlayerIndex).toBe(0);
      expect(next.players.map((p) => p.hand.length)).toEqual([1, 0, 1]);
    });
  });
```

In `tests/unit/aiPlayer.test.js`, inside `describe.each(COPIES)`, before `describe.each(DIFFICULTIES)`:

```js
  it("a CPU plays at its own level, not the table's", () => {
    // EASY always leads its lowest single; MEDIUM leads its lowest pair first.
    const s = stateWith(L, { hands: ["5♦ 5♣ 9♠ K♥", "3♠", "3♥", "3♣"], current: 0, aiDifficulty: "EASY" });
    expect(A.makeAIDecision(s.players[0], null, s).cards).toEqual(cards("5♦"));
    expect(A.makeAIDecision({ ...s.players[0], level: "MEDIUM" }, null, s).cards).toEqual(cards("5♦ 5♣"));
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/gameLogic.test.js tests/unit/aiPlayer.test.js -t "tables of 2 and 3|own level"`
Expected: FAIL — dealer `3` instead of `1`, `matchWins` of length 4, a `TypeError` reading `isEliminated` of `undefined` in `startNextRound`, and the MEDIUM CPU leading `5♦`.

- [ ] **Step 3: Implement in `src/utils/gameLogic.js`**

In `createGameState`, replace the dealer and match wins lines:

```js
    dealerIndex: (startingPlayer - 1 + hands.length) % hands.length,
```
```js
    matchWins: matchMeta.matchWins || hands.map(() => 0),
```

In `endRound`, replace `[...(gameState.matchWins || [0, 0, 0, 0])]` with:

```js
  const updatedMatchWins = [...(gameState.matchWins || gameState.players.map(() => 0))];
```

In `startNextRound`, replace `const numPlayers = GAME_SETTINGS.NUM_PLAYERS;` with:

```js
  const numPlayers = gameState.players.length;
```

- [ ] **Step 4: Implement in `src/utils/aiPlayer.js`**

Replace the first line of `makeAIDecision`:

```js
  // Each CPU seat can have its own level; practice tables set one for all.
  const difficulty = player.level || gameState.aiDifficulty || "MEDIUM";
```

- [ ] **Step 5: Copy to the server and run the unit suite**

```bash
cp src/utils/gameLogic.js server/game/gameLogic.js
cp src/utils/aiPlayer.js server/game/aiPlayer.js
npx vitest run --project unit
```
Expected: all pass (the new tests in both the client and server copies).

- [ ] **Step 6: Commit**

```bash
git add src/utils/gameLogic.js server/game/gameLogic.js src/utils/aiPlayer.js server/game/aiPlayer.js tests/unit/gameLogic.test.js tests/unit/aiPlayer.test.js
git commit -m "feat(thirteen): let the rules run 2 to 4 players and each CPU play at its own level"
```

---

### Task 2: ThirteenGame deals to 2–4 seats with per-CPU levels

**Files:**
- Modify: `server/game/engine.js` (imports, `constructor`, `startMatch`, `rematch`, `replaceSeat`, `beginNextRound`)
- Test: `server/tests/engine.test.js`

**Interfaces:**
- Consumes: Task 1's `createGameState` / `startNextRound` for any player count, and `player.level`.
- Produces: `new ThirteenGame({ seats })` accepts 2–4 seats of `{ type: "HUMAN"|"AI", name, socketId?, avatar?, level? }`. Each engine player has `level` (`"MEDIUM"` default for AI, `null` for humans). `replaceSeat(seat, { type, name, socketId, avatar })` sets `level` to `"MEDIUM"` for AI, `null` for humans.

- [ ] **Step 1: Write the failing engine tests**

Add to `server/tests/engine.test.js`, after `describe("the deal", …)`:

```js
describe("tables of 2 and 3", () => {
  const seatsOf = (n) => Array.from({ length: n }, (_, i) => ({ type: "HUMAN", name: `P${i}`, socketId: `s${i}` }));
  const cpus = (levels) => levels.map((level, i) => ({ type: "AI", name: `C${i}`, level }));

  it.each([2, 3])("deals 13 cards to each of %i players", (n) => {
    const { game } = newGame({ seats: seatsOf(n), rng: seededRandom(n) });
    expect(game.state.players.map((p) => p.hand.length)).toEqual(Array(n).fill(13));
    expect(game.state.matchWins).toEqual(Array(n).fill(0));
    game.destroy();
  });

  it("the lowest card dealt leads the first round, the 3♦ when someone has it", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { game } = newGame({ seats: seatsOf(2), rng: seededRandom(seed) });
      const dealt = game.state.players.flatMap((p, seat) => p.hand.map((c) => ({ seat, v: c.rankValue * 4 + c.suitValue })));
      const lowest = dealt.reduce((a, b) => (b.v < a.v ? b : a));
      expect(game.state.currentPlayerIndex).toBe(lowest.seat);
      game.destroy();
    }
  });

  it.each([2, 3])("a table of %i CPUs plays a whole match on its own", (n) => {
    const { game, calls } = newGame({ seats: cpus(["EASY", "HARD", "MEDIUM"].slice(0, n)), delays: { aiTurn: 1, deal: 1, roundEnd: 1 }, rng: seededRandom(n * 7) });
    for (let i = 0; i < 50000 && game.state.gameState !== GAME_STATES.GAME_OVER; i++) vi.advanceTimersByTime(1);
    expect(game.state.gameState).toBe(GAME_STATES.GAME_OVER);
    expect(game.state.players).toHaveLength(n);
    expect(calls.gameOver).toBe(1);
  });

  it("CPUs keep their seat's level; a rematch keeps the seats and levels", () => {
    const { game } = newGame({ seats: [seatsOf(1)[0], ...cpus([undefined, "HARD"])] });
    expect(game.state.players.map((p) => p.level)).toEqual([null, "MEDIUM", "HARD"]);
    game.state = { ...game.state, gameState: GAME_STATES.GAME_OVER };
    expect(game.rematch()).toEqual({ ok: true });
    expect(game.state.players.map((p) => p.level)).toEqual([null, "MEDIUM", "HARD"]);
    expect(game.state.matchWins).toHaveLength(3);
    expect(game.state.matchNumber).toBe(2);
    game.destroy();
  });

  it("a CPU taking over a seat plays at MEDIUM, whatever sat there before", () => {
    const { game } = newGame({ seats: [seatsOf(1)[0], ...cpus(["HARD"])] });
    game.replaceSeat(1, { type: "HUMAN", name: "LATE", socketId: "s9" });
    expect(game.state.players[1].level).toBeNull();
    game.replaceSeat(1, { type: "AI", name: "LATE (CPU)", socketId: null });
    expect(game.state.players[1].level).toBe("MEDIUM");
    game.destroy();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run server/tests/engine.test.js -t "tables of 2 and 3"`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'name')` (the engine still builds 4 players), and `level` undefined.

- [ ] **Step 3: Implement in `server/game/engine.js`**

Replace the deckUtils import:

```js
import { initializeGame, compareCards, secureRandom } from "./deckUtils.js";
```

Add above `export class ThirteenGame`:

```js
/** One 13-card hand per seat, whatever the table size; the rest of the deck sits out. */
const dealTo = (count, rng) => initializeGame(rng).hands.slice(0, count);

/** The first round's lead: the lowest card dealt (the 3♦ whenever someone holds it). */
const openingLead = (hands) =>
  hands
    .flatMap((hand, seat) => hand.map((card) => ({ seat, card })))
    .reduce((low, next) => (compareCards(next.card, low.card) < 0 ? next : low)).seat;
```

In the constructor, replace `{ matchNumber: 1, matchWins: [0, 0, 0, 0] }` with `{ matchNumber: 1, matchWins: seats.map(() => 0) }`.

Replace the top of `startMatch` through the `state.players = …` mapping with:

```js
  startMatch(seats, matchMeta, aiDifficulty) {
    const hands = dealTo(seats.length, this.rng);
    const state = createGameState(
      hands,
      openingLead(hands),
      aiDifficulty || this.state?.aiDifficulty,
      matchMeta,
    );
    state.players = state.players.map((p, i) => ({
      ...p,
      name: seats[i].name,
      type: seats[i].type,
      socketId: seats[i].socketId || null,
      avatar: seats[i].avatar || null,
      level: seats[i].type === "AI" ? seats[i].level || "MEDIUM" : null,
    }));
```

In `rematch`, add `level: p.level,` to each mapped seat and replace `this.state.matchWins || [0, 0, 0, 0]` with `this.state.matchWins || seats.map(() => 0)`.

In `replaceSeat`, replace the mapped player with:

```js
      i === seatIndex
        ? { ...p, type, name, socketId: socketId || null, avatar: avatar || null, level: type === "AI" ? "MEDIUM" : null }
        : p,
```

In `beginNextRound`, replace `const { hands } = initializeGame(this.rng);` with:

```js
    const hands = dealTo(this.state.players.length, this.rng);
```

Update the `@param {Array} opts.seats` JSDoc to: `2–4 entries of { type: "HUMAN"|"AI", name, socketId?, avatar?, level? }`.

- [ ] **Step 4: Run the engine tests**

Run: `npx vitest run server/tests/engine.test.js server/tests/engine-fallback.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/game/engine.js server/tests/engine.test.js
git commit -m "feat(thirteen): deal 2 to 4 seats with the lowest card leading and per-CPU levels"
```

---

### Task 3: Lobby — CPU levels, and Thirteen starting with the filled seats

**Files:**
- Modify: `server/index.js` (`tableViewFor`, `startGame`, `start_game`, `add_cpu`, new `set_cpu_level`, the malformed-payload list in the test)
- Modify: `docs/ARCHITECTURE.md` (Waiting tables paragraph, socket protocol list)
- Test: `server/tests/socket.test.js`

**Interfaces:**
- Consumes: Task 2's `ThirteenGame` seats with `level`; `MuushigGame` already reads `seat.level`.
- Produces: socket events `add_cpu { lobbyId, seat, level? }`, `set_cpu_level { lobbyId, seat, level }`. `table_update` CPU seats are `{ kind: "cpu", name, level }`. `start_game` on a Thirteen table with < 2 seats → `move_rejected { reason: "Add a player or a CPU to start" }`.

- [ ] **Step 1: Add the test helper and write the failing socket tests**

In `server/tests/socket.test.js`, after the `startMatch` helper add:

```js
/** Thirteen's START leaves empty seats empty: seat a CPU in each first, then start. */
const startFull = async (host, lobbyId, others = []) => {
  const t = await tableWhere(host, (t) => t.lobbyId === lobbyId && t.seats.filter(Boolean).length === 1 + others.length);
  t.seats.forEach((s, seat) => s || host.emit("add_cpu", { lobbyId, seat }));
  return startMatch(host, lobbyId, others);
};
```

Add a new block before `describe("who is host, as each player's game state says", …)`:

```js
describe("CPU levels and short Thirteen tables", () => {
  it("the host seats CPUs at a level and changes it; everyone sees it", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);
    host.emit("add_cpu", { lobbyId, seat: 2, level: "HARD" });
    host.emit("add_cpu", { lobbyId, seat: 3 }); // an older browser: no level
    const t = await tableWhere(b, (t) => t.seats[3]?.kind === "cpu");
    expect(t.seats[2]).toMatchObject({ kind: "cpu", level: "HARD" });
    expect(t.seats[3]).toMatchObject({ kind: "cpu", level: "MEDIUM" });
    host.emit("set_cpu_level", { lobbyId, seat: 2, level: "EASY" });
    const changed = await tableWhere(b, (t) => t.seats[2]?.level === "EASY");
    expect(changed.seats[2].name).toBe(t.seats[2].name);
  });

  it("rejects a bad level, a non-host, and a seat without a CPU", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    const b = await guest();
    await joinLobby(b, lobbyId);
    const reason = async (sock, event, payload) => {
      const r = next(sock, "move_rejected");
      sock.emit(event, { lobbyId, ...payload });
      return (await r).reason;
    };
    expect(await reason(host, "add_cpu", { seat: 2, level: "GODLIKE" })).toBe("Pick EASY, MEDIUM or HARD");
    host.emit("add_cpu", { lobbyId, seat: 2, level: "EASY" });
    await tableWhere(host, (t) => t.seats[2]?.kind === "cpu");
    expect(await reason(host, "set_cpu_level", { seat: 2, level: "NOPE" })).toBe("Pick EASY, MEDIUM or HARD");
    expect(await reason(b, "set_cpu_level", { seat: 2, level: "HARD" })).toBe("Only the host can do that");
    expect(await reason(host, "set_cpu_level", { seat: 1, level: "HARD" })).toBe("There's no CPU in that seat");
  });

  it("a Thirteen table won't start with the host alone", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    await tableWhere(host);
    const r = next(host, "move_rejected");
    host.emit("start_game", { lobbyId });
    expect((await r).reason).toBe("Add a player or a CPU to start");
    expect(host.states).toEqual([]);
  });

  it("two seated players start a 2-player game; seats close up and moves reach the right player", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    for (const seat of [1, 2]) host.emit("add_cpu", { lobbyId, seat });
    await tableWhere(host, (t) => t.seats[2]);
    const b = await guest();
    await joinLobby(b, lobbyId); // takes seat 3, the first empty one
    for (const seat of [1, 2]) host.emit("remove_cpu", { lobbyId, seat });
    await tableWhere(b, (t) => t.mySeat === 3 && !t.seats[1] && !t.seats[2]);

    const [hs, bs] = await startMatch(host, lobbyId, [b]);
    expect(hs.players.map((p) => p.type)).toEqual(["HUMAN", "HUMAN"]);
    expect(mySeat(hs)).toBe(0);
    expect(mySeat(bs)).toBe(1);
    expect(hs.players.map((p) => p.hand.length)).toEqual([13, 13]);

    await new Promise((r) => setTimeout(r, hs.dealMsLeft));
    const turn = hs.currentPlayerIndex;
    const actor = turn === 0 ? host : b;
    const card = lowest((turn === 0 ? hs : bs).players[turn].hand);
    const seen = [host, b].map((s) => next(s, "game_state_update", (st) => st.currentPlay));
    actor.emit("request_move", { lobbyId, action: "play", data: { cards: [card.id] } });
    (await Promise.all(seen)).forEach((st) => expect(st.currentPlay.cards[0].id).toBe(card.id));
  });

  it("CPUs start at the level the host gave them", async () => {
    const host = await guest();
    const lobbyId = await createLobby(host);
    host.emit("add_cpu", { lobbyId, seat: 1, level: "HARD" });
    const [state] = await startMatch(host, lobbyId);
    expect(state.players.map((p) => p.level)).toEqual([null, "HARD"]);
  });
});
```

In `describe("muushig tables", …)`, add:

```js
  it("START fills empty seats with MEDIUM CPUs and keeps the levels the host chose", async () => {
    const host = await guest();
    const lobbyId = await createMuushig(host);
    host.emit("add_cpu", { lobbyId, seat: 1, level: "HARD" });
    await tableWhere(host, (t) => t.seats[1]?.level === "HARD");
    const first = next(host, "muushig_state");
    host.emit("start_game", { lobbyId });
    expect((await first).players.map((p) => p.level)).toEqual([null, "HARD", "MEDIUM", "MEDIUM", "MEDIUM"]);
  });
```

Add `"set_cpu_level"` to the event list in `describe("malformed payloads", …)`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run server/tests/socket.test.js -t "CPU levels|keeps the levels"`
Expected: FAIL — seats without `level`, no `move_rejected` for `GODLIKE`/`set_cpu_level` (timeouts), the lone host's START dealing a game, and a 4-player state where 2 were expected.

- [ ] **Step 3: Implement in `server/index.js`**

Above `nextCpuName`, add:

```js
const CPU_LEVELS = ["EASY", "MEDIUM", "HARD"];
```

In `tableViewFor`, replace the CPU branch:

```js
      if (s.kind === "cpu") return { kind: "cpu", name: s.name, level: s.level };
```

Replace the first two statements of `startGame` (the empty-seat fill and naming loop) and the `seats` mapping with:

```js
function startGame(lobby) {
  if (lobby.gameType === "thirteen") {
    // Thirteen plays with the filled seats only. Close the gaps so lobby seat
    // i is still engine player i, and tell each member their new seat.
    lobby.seats = lobby.seats.filter(Boolean);
    lobby.seats.forEach((s, i) => {
      if (s.kind === "human") lobby.members.get(s.key).seatIndex = i;
    });
  }
  // Muushig always seats 5: empty seats become MEDIUM CPUs.
  lobby.seats = lobby.seats.map((s) => s ?? { kind: "cpu", name: null, level: "MEDIUM" });
  for (const s of lobby.seats) if (s.kind === "cpu" && !s.name) s.name = nextCpuName(lobby.seats);
  const seats = lobby.seats.map((s) => {
    if (s.kind === "cpu") return { type: "AI", name: s.name, socketId: null, level: s.level };
    const m = lobby.members.get(s.key);
    return { type: "HUMAN", name: m.displayName, socketId: m.socketId, avatar: m.avatar };
  });
```

(Keep the rest of `startGame` — `lobby.game = …`, `beginSession`, logging — unchanged.)

Replace the `start_game` handler:

```js
  socket.on("start_game", ({ lobbyId } = {}) => {
    const lobby = hostCommand(lobbyId);
    if (!lobby) return;
    if (lobby.gameType === "thirteen" && lobby.seats.filter(Boolean).length < 2) {
      socket.emit("move_rejected", { reason: "Add a player or a CPU to start" });
      return;
    }
    startGame(lobby);
  });
```

Replace the `add_cpu` handler and add `set_cpu_level` after `remove_cpu`:

```js
  socket.on("add_cpu", ({ lobbyId, seat, level = "MEDIUM" } = {}) => {
    const lobby = hostCommand(lobbyId);
    if (!lobby) return;
    if (!isSeat(lobby, seat) || lobby.seats[seat] !== null) {
      socket.emit("move_rejected", { reason: "That seat isn't empty" });
      return;
    }
    if (!CPU_LEVELS.includes(level)) {
      socket.emit("move_rejected", { reason: "Pick EASY, MEDIUM or HARD" });
      return;
    }
    lobby.seats[seat] = { kind: "cpu", name: nextCpuName(lobby.seats), level };
    broadcastTable(lobby);
  });
```

```js
  socket.on("set_cpu_level", ({ lobbyId, seat, level } = {}) => {
    const lobby = hostCommand(lobbyId);
    if (!lobby) return;
    if (!isSeat(lobby, seat) || lobby.seats[seat]?.kind !== "cpu") {
      socket.emit("move_rejected", { reason: "There's no CPU in that seat" });
      return;
    }
    if (!CPU_LEVELS.includes(level)) {
      socket.emit("move_rejected", { reason: "Pick EASY, MEDIUM or HARD" });
      return;
    }
    lobby.seats[seat] = { ...lobby.seats[seat], level };
    broadcastTable(lobby);
  });
```

Update the lobby JSDoc seat shape to `{ kind: "cpu", name, level }`.

- [ ] **Step 4: Bring the existing Thirteen socket tests up to the new START**

These tests start a Thirteen table with empty seats, which no longer fills them. Change each as follows:

- `"only the host can start; start fills empty seats with CPUs and deals"` → rename to `"only the host can start; START deals to the seated players"`; replace its last two `expect`s with `expect(hs.players.map((p) => p.type)).toEqual(["HUMAN", "HUMAN"]);`.
- `"start_game twice is rejected and does not re-deal"`, `"check_game_status on a playing table sends the game state"`, `"CPU commands are rejected once the game has started"`, `"each player sees only their own hand; CPUs fill empty seats"` (rename to `"…; CPUs the host seated play too"`), `"a new player joining mid-match takes over a CPU seat"`, `"one human against three CPUs plays to game over, then rematches"`, `"a player promoted at the waiting table is host in the game (can rematch)"`: replace `startMatch(` with `startFull(` (same arguments).

Then run the whole server project:

Run: `npx vitest run server/tests/socket.test.js server/tests/engine.test.js server/tests/muushig-game.test.js`
Expected: all pass. If another Thirteen test fails with `Add a player or a CPU to start` or a 2-player count, switch it to `startFull` the same way.

- [ ] **Step 5: Update `docs/ARCHITECTURE.md`**

In the **Waiting tables** paragraph, replace "The host adds/removes CPUs and presses START (`start_game`), which fills empty seats with CPUs and builds the `ThirteenGame` in seat order." with:

```markdown
The host adds CPUs at a level (`add_cpu { seat, level }`, EASY | MEDIUM | HARD,
MEDIUM if missing), changes it (`set_cpu_level`) or removes them, and presses
START (`start_game`). Thirteen starts with the filled seats only — 2 to 4
players, at least 2 required — closing the gaps so seat *i* is engine player
*i*; Muushig fills empty seats with MEDIUM CPUs. A CPU taking over a dropped
player plays at MEDIUM.
```

In the socket protocol list, add `set_cpu_level` after `remove_cpu`.

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/tests/socket.test.js docs/ARCHITECTURE.md
git commit -m "feat(lobby): choose each CPU's level and start Thirteen with 2 to 4 seated players"
```

---

### Task 4: Waiting table — level buttons, level chip, START rule

**Files:**
- Modify: `src/components/thirteen/WaitingTable.jsx` (`SeatSlot`, `InvitePanel`, `WaitingTable` props)
- Modify: `src/pages/thirteen/GameThirteen.jsx` (`handleAddCpu`, new `handleSetCpuLevel`, `WaitingTable` props)
- Modify: `src/pages/muushig/GameMuushig.jsx` (`WaitingTable` props in `OnlineMuushig`)
- Test: `tests/ui/WaitingTable.test.jsx`, `tests/ui/GameThirteenWaiting.test.jsx`

**Interfaces:**
- Consumes: Task 3's `add_cpu { seat, level }`, `set_cpu_level { seat, level }`, CPU seats with `level`.
- Produces: `WaitingTable` props `onAddCpu(seat, level)`, `onSetCpuLevel(seat, level)`, `fillsEmptySeats` (boolean, default `false`). Buttons labelled `Add EASY CPU to seat N` (and MEDIUM, HARD); the level chip is a button labelled `<CPU name>: <LEVEL>. Change level`.

- [ ] **Step 1: Write the failing UI tests**

In `tests/ui/WaitingTable.test.jsx`:

- In `table()`, give the CPU a level: `{ kind: "cpu", name: "Bot Saturn", level: "MEDIUM" }`.
- In `props()`, add `onSetCpuLevel: vi.fn(),`.
- In `"gives the host add, remove and start controls"`, replace the add click and its expectation with:

```js
    await user.click(screen.getByRole("button", { name: "Add HARD CPU to seat 3" }));
    expect(p.onAddCpu).toHaveBeenCalledWith(2, "HARD");
```

- Replace every `{ name: /add cpu/i }` query with `{ name: /add \w+ cpu/i }`.
- Add these tests inside `describe("WaitingTable", …)`:

```js
  it("the host taps a CPU's level to cycle it", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<WaitingTable {...p} />);
    await user.click(screen.getByRole("button", { name: "Bot Saturn: MEDIUM. Change level" }));
    expect(p.onSetCpuLevel).toHaveBeenCalledWith(1, "HARD");
  });

  it("others see a CPU's level but can't change it", () => {
    render(<WaitingTable {...props({ table: table({ isHost: false, mySeat: 3 }) })} />);
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change level/i })).not.toBeInTheDocument();
  });

  it("Thirteen can't start until 2 seats are filled; empty seats stay empty", () => {
    render(<WaitingTable {...props({ table: table({ seats: [human("HOSTY #0001", { isHost: true }), null, null, null] }) })} />);
    expect(screen.getByRole("button", { name: /start game/i })).toBeDisabled();
    expect(screen.getByText("Start with 2 to 4 players. Empty seats stay empty.")).toBeInTheDocument();
  });
```

- In `describe("a five-seat (Muushig) table", …)`, add:

```js
  it("can start alone: START fills the empty seats with MEDIUM CPUs", () => {
    render(<WaitingTable {...props({ table: five({ seats: [null, null, human("ME #0003", { isHost: true }), null, null] }) })} title="MUUSHIG" fillsEmptySeats />);
    expect(screen.getByRole("button", { name: /start game/i })).toBeEnabled();
    expect(screen.getByText("Empty seats are filled with MEDIUM CPUs when you start.")).toBeInTheDocument();
  });
```

In `tests/ui/GameThirteenWaiting.test.jsx`, in `"asks for the table, shows it, and sends the host's commands"`, replace the add click and its expectation with:

```js
    await user.click(screen.getByRole("button", { name: "Add MEDIUM CPU to seat 2" }));
    expect(fakeSocket.emit).toHaveBeenCalledWith("add_cpu", { lobbyId: "PUB-ABC123", seat: 1, level: "MEDIUM" });
```

and give the later CPU seat a level: `{ kind: "cpu", name: "Bot Saturn", level: "MEDIUM" }`. After the remove click, before START, add:

```js
    serverSends("table_update", { ...table, seats: [table.seats[0], { kind: "cpu", name: "Bot Saturn", level: "MEDIUM" }, null, null] });
    await user.click(screen.getByRole("button", { name: "Bot Saturn: MEDIUM. Change level" }));
    expect(fakeSocket.emit).toHaveBeenCalledWith("set_cpu_level", { lobbyId: "PUB-ABC123", seat: 1, level: "HARD" });
```

(START is pressed with 2 seats filled, so it stays enabled.)

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/ui/WaitingTable.test.jsx tests/ui/GameThirteenWaiting.test.jsx`
Expected: FAIL — no `Add HARD CPU to seat 3` button, no level chip, START enabled with the host alone.

- [ ] **Step 3: Implement in `WaitingTable.jsx`**

Below `SIDE_SEAT_W`, add:

```js
const LEVELS = ["EASY", "MEDIUM", "HARD"];
const LEVEL_COLOR = { EASY: "#9bd14f", MEDIUM: "#f4c430", HARD: "#e85a7a" };
const nextLevel = (level) => LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length];
```

Change `SeatSlot`'s signature to `function SeatSlot({ seat, index, isHost, onAddCpu, onRemoveCpu, onSetCpuLevel, face, small = false })`. Replace the empty seat's `{isHost && (<button …>+ ADD CPU</button>)}` with:

```jsx
        {isHost && (
          <div className="flex flex-wrap justify-center gap-1">
            {LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => onAddCpu(index, level)}
                aria-label={`Add ${level} CPU to seat ${index + 1}`}
                className="pixel-btn font-pixel-display text-[8px] px-1.5 py-1.5"
                style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: LEVEL_COLOR[level] }}
              >
                + {level}
              </button>
            ))}
          </div>
        )}
```

In the seated branch, after the name `<div>`, add:

```jsx
      {isCpu &&
        (isHost ? (
          <button
            onClick={() => onSetCpuLevel(index, nextLevel(seat.level || "MEDIUM"))}
            aria-label={`${seat.name}: ${seat.level || "MEDIUM"}. Change level`}
            className="pixel-btn font-pixel-display text-[8px] px-2 py-1"
            style={{ backgroundColor: "#0a0712", borderColor: "#2a234d", color: LEVEL_COLOR[seat.level || "MEDIUM"] }}
          >
            {seat.level || "MEDIUM"} ▸
          </button>
        ) : (
          <span className="font-pixel-display text-[8px]" style={{ color: LEVEL_COLOR[seat.level || "MEDIUM"] }}>
            {seat.level || "MEDIUM"}
          </span>
        ))}
```

Change `InvitePanel`'s signature to `function InvitePanel({ table, seatedCount, hostName, onStart, errorMessage, fillsEmptySeats })`. Before its `return`, add:

```js
  // Muushig fills empty seats at START; Thirteen plays with whoever is seated.
  const canStart = fillsEmptySeats || seatedCount >= 2;
```

Give the START button `disabled={starting || !canStart}`, and replace the hint line with:

```jsx
          <div className="font-pixel-body text-[18px] text-bone/60">
            {fillsEmptySeats
              ? "Empty seats are filled with MEDIUM CPUs when you start."
              : "Start with 2 to 4 players. Empty seats stay empty."}
          </div>
```

In `WaitingTable`, add `onSetCpuLevel` and `fillsEmptySeats = false` to the props, pass `onSetCpuLevel={onSetCpuLevel}` to `SeatSlot` in `slot()`, and `fillsEmptySeats={fillsEmptySeats}` to `InvitePanel`. Update the file's header comment: "empty ones are shadow spots the host can fill with CPUs at a chosen level".

- [ ] **Step 4: Wire the pages**

In `GameThirteen.jsx`, replace `handleAddCpu` and add `handleSetCpuLevel`:

```js
  const handleAddCpu = (seat, level) => socket.emit("add_cpu", { lobbyId, seat, level });
  const handleSetCpuLevel = (seat, level) => socket.emit("set_cpu_level", { lobbyId, seat, level });
```

and pass `onSetCpuLevel={handleSetCpuLevel}` to `<WaitingTable>`.

In `GameMuushig.jsx` (`OnlineMuushig`), replace the CPU props on `<WaitingTable>` with:

```jsx
        onAddCpu={(seat, level) => socket.emit("add_cpu", { lobbyId, seat, level })}
        onRemoveCpu={(seat) => socket.emit("remove_cpu", { lobbyId, seat })}
        onSetCpuLevel={(seat, level) => socket.emit("set_cpu_level", { lobbyId, seat, level })}
        fillsEmptySeats
```

- [ ] **Step 5: Run the UI project**

Run: `npx vitest run --project ui`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/thirteen/WaitingTable.jsx src/pages/thirteen/GameThirteen.jsx src/pages/muushig/GameMuushig.jsx tests/ui/WaitingTable.test.jsx tests/ui/GameThirteenWaiting.test.jsx
git commit -m "feat(lobby): pick and change CPU levels on the waiting table"
```

---

### Task 5: The Thirteen table seats 2 and 3 players

**Files:**
- Modify: `src/utils/seatPosition.js`
- Modify: `src/pages/thirteen/GameThirteen.jsx` (player-count guard, seat assignment, `opponent()`, pile seat names, `DealAnimation` seats)
- Test: `tests/ui/GameThirteenOnline.test.jsx`, `tests/ui/WaitingTable.test.jsx` (`positionOf`)

**Interfaces:**
- Consumes: Task 2's 2–4 player states.
- Produces: `seatPositions(count)` → `["bottom","top"]` (2), `["bottom","left","right"]` (3), the existing 4 and 5; `positionOf(seat, mySeat, count)` for counts 2–5.

- [ ] **Step 1: Write the failing tests**

In `tests/ui/WaitingTable.test.jsx`, inside `describe("positionOf", …)`, add:

```js
  it("seats 2 across from each other and 3 left and right", () => {
    expect([0, 1].map((s) => positionOf(s, 1, 2))).toEqual(["top", "bottom"]);
    expect([0, 1, 2].map((s) => positionOf(s, 0, 3))).toEqual(["bottom", "left", "right"]);
    expect([0, 1, 2].map((s) => positionOf(s, 2, 3))).toEqual(["left", "right", "bottom"]);
  });
```

In `tests/ui/GameThirteenOnline.test.jsx`, add inside `describe("GameThirteen online", …)`:

```js
  const seatsShown = () => ["left", "top", "right"].filter((pos) => document.querySelector(`[data-deal-seat="${pos}"]`));

  it("a two-player table seats your opponent across from you", async () => {
    const s = stateWith(logic, { hands: ["3♦ 7♥", "4♣ 6♣"], current: 0 });
    open();
    await act(async () => {});
    serverSends("game_state_update", view(s));
    await yourTurn();
    expect(seatsShown()).toEqual(["top"]);
    expect(screen.getAllByText("Bot Saturn").length).toBeGreaterThan(0);
  }, 20000);

  it("a three-player table seats the others left and right", async () => {
    const s = stateWith(logic, { hands: ["3♦ 7♥", "4♣ 6♣", "8♦ 10♦"], current: 0 });
    open();
    await act(async () => {});
    serverSends("game_state_update", view(s));
    await yourTurn();
    expect(seatsShown()).toEqual(["left", "right"]);
  }, 20000);

  it("someone who joins a full two-player table watches it", async () => {
    const s = stateWith(logic, { hands: ["3♦ 7♥", "4♣ 6♣"], current: 0 });
    const watched = { ...view(s), players: view(s).players.map((p, i) => ({ ...p, name: ["ANN #0005", "BOB #0006"][i], socketId: null })) };
    open();
    await act(async () => {});
    serverSends("game_state_update", watched);
    expect(await screen.findByText(/Waiting for ANN/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(seatsShown()).toEqual(["top"]);
  }, 20000);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/ui/GameThirteenOnline.test.jsx tests/ui/WaitingTable.test.jsx`
Expected: FAIL — `positionOf` throws reading `undefined` for counts 2 and 3; the game page shows `Error: Invalid Player Count`.

- [ ] **Step 3: Implement `src/utils/seatPosition.js`**

Replace the file body with:

```js
// Where a seat sits on screen for a given viewer: you at the bottom, the rest
// clockwise — the same rotation the live tables use. Thirteen seats 2 to 4
// (2: across; 3: left and right; 4: left, top, right); Muushig seats 5 (two
// on each side).

const POSITIONS = {
  2: ["bottom", "top"],
  3: ["bottom", "left", "right"],
  4: ["bottom", "left", "top", "right"],
  5: ["bottom", "bottomLeft", "topLeft", "topRight", "bottomRight"],
};

/** The positions around a table of `count`, clockwise from the bottom. */
export const seatPositions = (count) => POSITIONS[count];

export const positionOf = (seat, mySeat, count = 4) => POSITIONS[count][(seat - (mySeat ?? 0) + count) % count];
```

- [ ] **Step 4: Implement in `GameThirteen.jsx`**

Import: `import { positionOf, seatPositions } from "../../utils/seatPosition";`

Replace the guard `if (playersList.length < 4)` with `if (playersList.length < 2)`.

Replace the `rotatedPlayers` block and the four `…Player` constants with:

```js
  // Each player at their spot around the table: you at the bottom, the rest
  // clockwise (2 players: across; 3: left and right).
  const at = {};
  visiblePlayers.forEach((p, i) => {
    at[positionOf(i, viewIndex, playersList.length)] = p;
  });
  const bottomPlayer = at.bottom;
  const leftPlayer = at.left;
  const topPlayer = at.top;
  const rightPlayer = at.right;
```

In the pile builder, replace `seat: ["bottom", "left", "top", "right"][(move.playerIndex - viewIndex + 4) % 4],` with:

```js
          seat: positionOf(move.playerIndex, viewIndex, playersList.length),
```

At the top of `opponent`, make an empty spot keep its place in the layout:

```js
  const opponent = (player, position) =>
    !player ? (
      <div aria-hidden="true" />
    ) : (
      <OpponentSection
```

(close the new conditional after `/>` with `)`), and pass the seats to the deal: add `seats={seatPositions(playersList.length)}` to `<DealAnimation>`.

Run `grep -n "rotatedPlayers" src/pages/thirteen/GameThirteen.jsx` — expect no matches.

- [ ] **Step 5: Run the UI project**

Run: `npx vitest run --project ui`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/utils/seatPosition.js src/pages/thirteen/GameThirteen.jsx tests/ui/GameThirteenOnline.test.jsx tests/ui/WaitingTable.test.jsx
git commit -m "feat(thirteen): seat 2 players across and 3 left and right"
```

---

### Task 6: Rulebook, full suite and a real two-browser check

**Files:**
- Modify: `docs/thirteen-rulebook.md`, `src/components/thirteen/RulesModal.jsx` (only if they state a fixed 4 players)

- [ ] **Step 1: Find player-count statements**

Run: `grep -n -i "4 players\|four players\|3♦ leads\|holds the 3♦\|3♦" docs/thirteen-rulebook.md src/components/thirteen/RulesModal.jsx`

Where the text says Thirteen is for 4 players, change it to "2 to 4 players". Where it says the 3♦ holder leads the first round, add: "With fewer than 4 players the 3♦ may not be dealt; then the lowest card dealt leads." Leave the rules screen's practice-game wording alone if it's about practice (always 4).

- [ ] **Step 2: Run everything**

Run: `npx vitest run` and `npx eslint src tests`
Expected: everything passes except the 5 Postgres suites in `server/tests/db/` (no local database). Lint shows no problems in the files this plan touched beyond those already on `main`.

- [ ] **Step 3: Two browsers at a 2-player table**

Start the servers:

```bash
cd server && DATABASE_URL= JWT_SECRET=dev-local PORT=3001 node index.js   # background
npx vite --port 5173                                                    # background
```

With Playwright (see the session's `scratchpad/e2e/deal.mjs` for a working launcher using the cached `chromium_headless_shell-1243`): player A creates a PUBLIC Thirteen table, player B joins by code, A presses START with no CPUs. Check both pages show the opponent in the top seat, 13 cards each, and that whoever holds the turn can play their lowest card and both pages see it. Then A creates a second table, adds a HARD CPU, changes it to EASY, and checks B sees `EASY` on that seat. Take a screenshot of each table.

- [ ] **Step 4: Commit**

```bash
git add docs/thirteen-rulebook.md src/components/thirteen/RulesModal.jsx
git commit -m "docs(thirteen): rules for 2 to 4 players"
```

(Skip the commit if Step 1 changed nothing.)
