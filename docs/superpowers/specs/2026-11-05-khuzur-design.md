# Khuzur — design

**Date:** 2026-11-05
**Status:** draft, awaiting the user's approval
**Rules:** `docs/khuzur-rulebook.md` is the single source of truth for the rules. This document doesn't repeat them; it records why, what's in scope, and how it gets built.
**Ships as:** 0.7.0. A new game is one of the rare middle-number bumps (`CLAUDE.md`).

## Intent

Khuzur is Mongolia's most classic card game, and the hall's fifth. It plays like a
cousin of Durak: you lead cards at the next player, who must beat every card or
pick the whole stack up, hands refill from a pile, and once the pile runs dry it's
a race to empty your hand. Its special features are multi-card leads (pairs plus
one lonely card), stacks that travel all the way round the table instead of being
fought between two players, and team play with alternating seats.

The user explained the rules from how it's played in Mongolia. Where they couldn't
remember, or a rule needed to fit an app (deck size for big tables, how a match
ends), we settled it together. See "Decisions" below.

**This first version is small:** practice against CPUs, in the browser. Online
tables, credits and more CPU levels come later, so the engine is built to move to
the server the way Muushig's did.

## Goals, non-goals, anti-goals

**Goals**
- Every rule in `docs/khuzur-rulebook.md`, as a pure engine with thorough tests.
- Every table the rules allow: free for all with 2–6 players, 2v2, 2v2v2, 3v3,
  each with the 5-card (one deck) or 7-card (two decks) game.
- A host picks the table with the **builder** (option B from the brainstorm): three
  switches and one big live table preview.
- One solid CPU that plays well enough to be a real opponent and a useful teammate.
- A Khuzur tile on the main menu, the rulebook in the RULES picker and in the
  table header, like the other games.

**Non-goals (later, not now)**
- Online tables, invites, chat, the server engine (`server/game/khuzur/`).
- Credit stakes, XP and gold. Practice pays nothing in any game today.
- Easy and Hard CPU levels. The one CPU is the future "Medium".
- Reporting practice matches to profile stats (`useSoloMatchReport`). That needs a
  server change, so it waits for the online version.
- Changing Muushig. The user asked in passing whether real Muushig runs
  counter-clockwise; the hall's Muushig runs clockwise and stays as it is unless
  they raise it again.

**Anti-goals** (would be a failure even if it works)
- The CPU peeking: it must decide only from what its seat could know (rulebook §11).
- Rules that drift from the rulebook. The engine, the in-game rules and the
  rulebook change together.
- Showing any rating or Elo. Credits are the ranking (memory: no Elo).
- Emoji or symbol glyphs in UI text (`docs/STYLEGUIDE.md` §3). Suits on cards are
  fine.

## Decisions

### The user's

| Topic | Decision |
| --- | --- |
| Deck | 7–A in four suits plus a gray and a colored joker |
| Card order | Plain cards by rank then suit (♦ < ♣ < ♥ < ♠); any trump beats any plain card; the gray joker beats every trump; the colored joker beats everything |
| Beating | Any strictly higher card in that order, whatever its suit. Twins can't beat each other |
| Leads | 1, 3, 5 or 7 cards; every card has a same-rank partner except at most one "lonely" card, which can be anything. (The user remembered J J J Q Q Q + 1 as valid; this rule keeps that and the "pairs plus one" sequence) |
| Jokers in leads | Only as the lonely card |
| Lead limit | No more cards than the smallest hand at the table, teammates included, and never more than the deal size: 5 in the 5-card game, 7 in the 7-card game |
| Stack | Each player beats the top layer; the beating cards become the new top. Teammates must beat too. After a full circle the last beater's cards end it, the stack goes dead, and the last beater leads. A pick-up passes the lead to the taker's left |
| Pick up | Allowed even when you could beat |
| Drawing | After every lead or beat, back up to hand size, automatically, the moment the cards are down; only then can the next player act. The face-up trump is drawn last |
| Trump 7 | Swap it for the face-up trump on any of your own turns (leading or beating), while the trump card is on the table |
| Joker turned as trump | Goes back into the middle of the pile at random; turn the next card |
| Deal sizes | 5 cards with one deck (34). 7 cards with two decks (66): every 7–A twice, still one gray and one colored joker |
| Tables | Free for all 2–6; 2v2, 2v2v2, 3v3; teams alternate seats; cap 6 |
| Direction | Play and the deal go clockwise (to the left), like Muushig in this hall |
| First dealer | The Muushig-style draw for the deal |
| Later dealers | Teams: the last-place team; a random member the first time, then clockwise within that team. Free for all: the deal passes clockwise |
| Going out | The moment your hand is empty, even mid-stack |
| Standings | Free for all: 1st, 2nd, … last. 2v2 and 3v3: first and last. 2v2v2: three places |
| Match | One round is the whole match (the user dropped best-of-three) |
| Surrender | Allowed; you (your team) take last place |
| Time limit | Online: 45 seconds a turn. A leader who runs out is skipped (the next player leads); a beater who runs out picks up |
| Scope | Practice vs CPUs first; one solid CPU, more levels later |
| Picker | The builder: players per team, teams, deal, and a live table |

### Mine (the user can overrule any of these)

- **Pick up only on your turn.** The user said "any player can just take the
  cards". I read it as the player whose turn it is to beat; the user's reply (each
  action completes, draw included, before the next player can act) fits this.
- **Draw for the deal ranks by the Khuzur card order with no trump** (rank, then
  ♦ < ♣ < ♥ < ♠, jokers on top). Twins tie, and tied players draw again, as in
  Muushig. In a team game, the drawer of the highest card deals.
- **Edge cases when someone goes out mid-stack** (rulebook §9): the stack carries
  on; it dies once every other player still playing has beaten it; the lead skips
  to the next player still playing; the lead limit ignores players who are out.
  A free-for-all round ends when one player is left; a team round ends when one
  team is left.
- **The second trump 7** (7-card game) can't swap for its twin, and nothing swaps
  for a face-up 7.
- **Surrender at a practice table ends the match** at once with you (and your team)
  last. The CPUs' places come from the cards they hold, fewest first.
- **No timer at practice tables.** The user set 45 seconds "in real matches", which
  I read as online tables; that ships with online play.

## The host's builder

The lobby page for Khuzur (practice only for now) is the builder the user chose:

- **Players per team**: SOLO · PAIRS · TRIOS.
- **Teams / players**:
  - SOLO: a player count, 2–6.
  - PAIRS: 2 or 3 teams.
  - TRIOS: 2 teams only.
- **Deal**: 5 CARDS · 1 DECK, or 7 CARDS · 2 DECKS.
- **A live table preview** beside the switches. It redraws on every change, with:
  - seats in team colors, you at the bottom, your teammates labeled;
  - an arrow for the direction of play (clockwise, to your left);
  - the face-up trump, the draw pile and the dead pile;
  - a line counting the deal: "4 players × 7 = 28 dealt · trump + 37 left to draw".
- **START** opens the table with CPUs in every other seat.

The brainstorm mockup is `.superpowers/brainstorm/13271-1793902081/content/mode-picker.html`
(option B). Its arrow points the old way (counter-clockwise); the build points it
clockwise. The look follows the hall's pixel style, not the mockup's wireframe.

## The table

- **Seats** for 2–6 players around the table, you at the bottom, the rest clockwise
  (`src/utils/seatPosition.js` gains a 6-seat layout). Team colors on each seat,
  every player's card count visible, and a mark on the dealer and the player to move.
- **The middle**: the face-up trump (tucked under the draw pile, as at a real table),
  the draw pile with its count, the dead pile with its count, and the stack.
- **The stack is drawn as columns.** Each lead card starts a column, and every beat
  lays one card on each column, offset so every layer shows, so you can see which
  card beat which. Up to 7 columns, up to 5 layers deep at a 6-player table.
- **Beating**: you pick the cards to beat with, and the game works out which card
  covers which. If any assignment works, it's valid. Bad picks are refused with a
  short reason. Buttons: BEAT, PICK UP.
- **Leading**: pick cards; LEAD lights up only for a valid lead within the limit.
- **SWAP 7** appears on your turn while you hold a swappable trump 7.
- **Out and standings**: a player who goes out gets their place badge on their seat.
  The match ends with a standings panel, plus PLAY AGAIN (same table, next deal by
  the rules above) and LEAVE.
- **Jokers need card faces.** Cards are pure CSS (`src/components/PixelCard.jsx`),
  so the gray and colored jokers get two new faces in the pixel style.
- Rules button in the header opens `KhuzurRules`. A dealt-card and stack motion in
  the style of the other tables, stopped under reduced motion.

## How it's built

Same shape as Muushig, so it can move to the server later:

- `src/utils/khuzur/engine.js`: pure functions, state in → new state out, throws on
  an illegal move, randomness through an `rng` argument. Phases: DRAW (for the
  deal), PLAY, MATCH_OVER. Moves: `drawForDeal`, `lead`, `beat`, `pickUp`,
  `swapTrumpSeven`, `surrender`, `startNextMatch`. Helpers the UI and CPU share:
  `beats(a, b, trumpSuit)`, `isValidLead(cards)`, `leadLimit(state)`,
  `canCover(layer, cards, trumpSuit)` (a bipartite match; layers are at most 7).
  It emits events for the table to animate, as Muushig's does.
- `src/utils/khuzur/ai.js`: the CPU (below).
- `src/pages/khuzur/LobbyKhuzur.jsx` (the builder) and `GameKhuzur.jsx`, routes
  `/lobby-khuzur` and `/game-khuzur`, and `khuzur` in `src/lib/games.js`.
- `src/components/khuzur/`: table pieces and `KhuzurRules.jsx`. `RulebookPicker`
  gets Khuzur. The main menu gets a KHUZUR tile.
- Tests in `tests/`, with vitest like the rest: card order, lead validation, the
  cover matching, the lead limit, full circles and pick-ups at every table size,
  going out mid-stack in each mode, standings, the trump 7, joker-as-trump redeal,
  dealer rotation, and whole matches played CPU-against-CPU to the end with no
  stuck states.
- `CHANGELOG.md` gets `0.7.0` with player-facing notes when it's pushed.

## The CPU (one level, my design)

It sees only what its seat could know: its hand, the trump, every card played,
picked up or sent dead, and the hand counts.

- **Leading**: lead the cheapest valid combo. A multi-card lead sheds cards faster,
  so it prefers one when its cards are low plain ones. It saves trumps and jokers,
  and leads big when an opponent is close to going out.
- **Beating**: cover with the cheapest cards that hold. Pick up instead when beating
  would spend trumps or jokers early and the stack is small. Late, when the pile is
  empty, it beats whenever it can, because cards in hand are the enemy.
- **Teams**: it plays for the team. It won't burn high cards beating a teammate's
  lead when a teammate is close to going out, and it leads hard at an opponent who
  is close.
- **Trump 7**: swap on its first turn holding it.
- It counts cards to know which of its cards nobody can beat.

Hard (simulating unseen hands, as Muushig's Hard does) is a later level.

## Follow-ups (not in this version)

1. Online tables: server engine copy, redacted views, bots filling seats, and the
   45-second turn timer (skip a leader, make a beater pick up).
2. Credits: stakes and a pot paid by place.
3. XP and gold by place (`progression.js` already pays by place).
4. Easy and Hard CPUs.
5. Practice match reports to profile stats.
