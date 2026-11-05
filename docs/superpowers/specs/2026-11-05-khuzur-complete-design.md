# Khuzur, complete — design

**Date:** 2026-11-05
**Status:** approved in chat ("implement")
**Builds on:** `docs/superpowers/specs/2026-11-05-khuzur-design.md` (practice version, done) and `docs/khuzur-rulebook.md` (the rules).
**Ships as:** part of 0.7.0 (not pushed yet), so the 0.7.0 notes grow rather than a new version.

## Intent

Make Khuzur a full game in the hall, on a par with Muushig: online tables with friends, credit stakes, XP and gold, three CPU levels, match history and profile stats. Also fix the minors deferred in the first version.

## The user's decisions

| Topic | Decision |
| --- | --- |
| Scope | Everything Muushig has: online tables, bots filling seats, credits, XP and gold, Easy/Medium/Hard CPUs, match history and profile stats, plus the deferred fixes |
| Credits payout | **1st takes the pot.** No money back for 2nd or lower |
| Teams online | **Players pick their own seat** (and so their team) on the waiting table |
| Surrender online | Free for all: you take last place, your cards go dead, everyone else plays on. Team game: **every human teammate has to agree** |
| Turn timer | 45 seconds online. A leader who runs out is skipped (the next player leads); a beater who runs out picks up |

## My calls (proposed in chat, not objected to)

- **Pot split:** the 1st-place team's human players who are still in their seat at the end split the whole pot evenly; an uneven split's odd credits go to the lowest seats, as in Muushig. If 1st place is all bots (or players who left and didn't come back), the pot is lost.
- **Leaving a credit match:** a bot covers your seat and you can come back until the match ends. Not back by the end, and your seat counts as a bot's. Leaving before START gives the stake back; a server restart refunds every stake (as today).
- **Stakes:** LOW 100 · MID 500 · HIGH 2,000, as Muushig. At least 2 staked players to start. Bots fill empty seats: MEDIUM at free tables, HARD at credit tables.
- **Table shape:** the host picks it with the builder when creating the table. It's fixed for the table's life.
- **Seat moves:** at the waiting table you click an empty seat to move there. A CPU seat isn't empty; the host removes a CPU to free it. The host can still add and remove CPUs and set their levels.
- **Free-table rematch:** PLAY AGAIN deals the next match with no draw, last-place team deals (as practice). **Credit tables:** each match starts from the waiting table (players may change), so each opens with the draw for the deal.
- **Surrender everywhere is the same move ("concede"):** your team takes the lowest place not yet given, your team's cards go to the dead pile, and play goes on until one team is left. In a 2-team game that ends the match at once. Practice uses it too (one human: no vote); once you're out the CPUs finish fast. This replaces the practice version's "match ends at once, CPUs ranked by cards".
- **Surrender vote:** a team's vote opens when one human presses SURRENDER, shows on the teammates' tables, and goes through when every human on the team (in their seat) has pressed it. Any of them can press KEEP PLAYING to cancel it. A bot or an empty seat doesn't vote.
- **XP and gold:** an online match with at least 2 people pays by place, as the other games: `matchReward({ place, players })` where `players` is the number of **places** (teams). Teammates share their team's place. Leaving and not coming back pays nothing.
- **Stats:** each seat's Khuzur tallies are leads, beats, pick-ups, and cards picked up. Profile and match pages show Khuzur matches, wins (1st places) and average place, like the other place-based games. Practice matches report for stats as Muushig's do.
- **CPU levels:** Easy plays loosely: a random legal lead, beats about two times in three when it can, otherwise picks up. Medium is the current CPU. Hard picks among Medium's candidate moves by playing each out many times from guesses of the unseen cards, consistent with what its seat knows, and keeps the one that ends best for its team.
- **Database:** a migration adds `khuzur` to the `game_type` enum.

## Deferred fixes from the first version

1. The draw-for-deal reveal timer must not restart on re-render.
2. The CPU timer must not call setState inside an updater; a throwing CPU falls back to a legal move (a single lead or a pick-up) instead of freezing.
3. The error banner clears when the table moves on (the next state from anyone).
4. The DRAW count includes the face-up trump still to be drawn.
5. You get a DEALER mark when you deal.
6. Also new: the online turn clock on the table, and a prompt to teammates while a surrender vote is open.

## Non-goals

- Changing Muushig, Thirteen, Poker or Blackjack, apart from shared pieces (the waiting table, the lobby shell, stats lists) learning about Khuzur.
- Spectators beyond what the hall already does.
- Moving people between seats as the host.

## Anti-goals

- Any card a seat can't see reaching that browser: other hands, the draw pile, the dead pile and the draw-for-deal pile are redacted in every view.
- A credit ever created or lost by a bug: Khuzur settles through the same CreditMatch queue and ledger as Muushig.
- A CPU stalling a table: a failing CPU move falls back to a legal one.
- Rules drifting: `src/utils/khuzur/` and `server/game/khuzur/` stay byte-identical (the copies test).
