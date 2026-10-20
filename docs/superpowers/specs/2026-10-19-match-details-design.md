# Match details — design

**Date:** 2026-10-19
**Status:** approved (parts 1–2 reviewed; parts 3–4 approved without review at the user's request)

## Goal

Clicking a match in a profile's **Recent matches** opens a page for that match,
in the spirit of MetaTFT's post-game screen: the final **standings** for every
seat, a **personal summary** of one player against the table, a **timeline** of
the scores over the rounds, and **round details** with each round's results and
key plays.

Scope: finished **online** Thirteen and Muushig matches. Solo matches (vs CPU)
and poker tables are out of scope and their rows stay unclickable.

## 1. What is recorded

Migration `010_match_details.sql` adds two columns:

- `game_sessions.seats jsonb` — every seat as the match started:
  `[{ seat, name, kind: "human" | "cpu", level? }]`. CPU names and levels were
  never recorded before.
- `game_rounds.highlights jsonb` — the round's key moments, in order, built by
  the engine as the round ends:
  - **Thirteen**: `{ type: "win", seat, cards, combo }` for the play that ended
    the round; `{ type: "big", seat, cards, combo }` for a four of a kind,
    Poker, straight flush or royal flush; `{ type: "two", seat, cards }` for a 2
    played as a single.
  - **Muushig**: `{ type: "in" | "fold", seat }` per decision;
    `{ type: "takeTrump" | "keepTrump", seat, card? }` for the dealer;
    `{ type: "eat", seat, trick, card }` for each trick (the winning card).

Matches recorded before this have neither: their page shows standings, the
timeline and per-round results, CPUs appear as `CPU · seat N`, and there are no
highlights.

## 2. API

`GET /api/matches/:id` (`server/matches.js`, `optionalUser`).

- Public-table matches open for anyone with the link. Private-table matches
  open only for a signed-in player who sat in them. Anything else — unknown id,
  private and not yours, abandoned, solo, poker — is a 404.
- Response:
  ```
  { id, gameType, startedAt, finishedAt, durationSeconds, roundCount, isPrivate,
    you: seat | null,
    standings: [{ seat, name, kind, level, place, score, roundsWon,
                  leftEarly, cpuTookOver, ratingDelta, stats }],
    rounds: [{ number, winnerSeat, results, highlights }] }
  ```
  Display names only; user ids, player keys and emails never leave the server.
  A seat with no player row (a CPU) is filled in from the round results, placed
  by the game's own ranking (`muushigPlaces` / `rankSeats`) on its final score.

## 3. The page (`/match/:id`, `src/pages/MatchDetail.jsx`)

Same pixel styling as the profile, one column on phones.

- **Header**: back, game name, date, duration, rounds, public/private.
- **Standings**: one row per seat — place, name (CPU level chip), final score,
  rounds won, and chips for LEFT / CPU TOOK OVER / rating change. Clicking a
  row picks the player the summary is about (default: you, else the winner).
  Your row is marked.
- **Personal summary**: the picked player's figures beside the table average,
  all computed from the round results so CPUs have them too. Thirteen: rounds
  won, average cards left when caught, best round, points taken. Muushig:
  piles eaten, rounds gone in / folded, sweeps, rounds won. Thirteen adds the
  player's hand tally (from their stats) when there is one.
- **Timeline**: a line per seat of the score after each round (SVG, in the
  RatingChart style); the picked player's line is bright, the others dim.
  Thirteen: lower is better. Muushig: counts down to 0.
- **Round details**: one collapsible block per round — winner, each seat's
  points, cards left (Thirteen) or piles eaten / folded (Muushig), score after,
  and the highlights as a short list with card chips.

## 4. Profile

Recent matches rows for online matches become links to `/match/:id`; solo rows
stay plain. Route added in `App.jsx`.

## Testing

- Unit: the highlight builders for both games.
- DB (`server/tests/db`): recording writes `seats` and `highlights`; the
  endpoint's access rules (public, private for a player, private for anyone
  else, missing, solo, abandoned) and the CPU fill-in for old matches.
- UI: the page renders standings, switches the summary on a row click, and
  shows highlights; a profile row navigates to its match.
