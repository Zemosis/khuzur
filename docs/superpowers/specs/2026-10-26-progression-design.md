# XP, levels and gold — design

Shipped as 1.4.0.

## Why

Profiles always had `coins`, `exp` and `level`, but they were placeholders:
- Online Thirteen and Muushig matches paid a flat amount by place: 100/50/25/10 coins and 60/35/20/10 XP.
- Every level cost 100 XP.
- Poker paid nothing, and neither did a level-up.
- Nothing told a player what they earned, and the XP bars only caught up on a reload.
- A player who left early was still paid for the place the CPU earned on their seat.

This makes the system real: gold, a level curve, payouts after every match and poker hand, and a reward screen.

## What the user chose

- **Gold** is the old coins, renamed. It's the shop currency and stays separate from credits, which are the ranked play.
- **What pays:** online Thirteen and Muushig (free and credit alike) and poker tables. Solo games against CPUs pay nothing.
- **The end of a match** shows +XP and +gold, the XP bar filling up, and a LEVEL UP moment with its bonus gold.
- **Pace:** quick at first, then slower.
- **Level-up gold** grows with the level, with a bigger bonus every 5th level.
- **Credit and free matches** pay the same.

## Rules

The rules are in `src/utils/progression.js`. The server runs a copy at `server/game/progression.js`, and `tests/unit/rules-copies.test.js` keeps the two identical.

| | |
|---|---|
| XP for level L → L+1 | `min(100 + 50·(L−1), 1500)`, with no cap on level. Level 10 is reached at 2,700 XP, about 55 matches |
| A Thirteen/Muushig match | `share = (n − place)/(n − 1)` over all n seats. XP = `30 + 40·share`, gold = `20 + 60·share` |
| A poker hand | 4 XP + 3 gold, or 6 XP + 8 gold if you win it. A hand only pays if it ends at least 30 s after your last paid hand at that table *(my call, against fold-farming)* |
| Level-up gold | `25 × level`, doubled on every 5th level, summed over every level reached at once |
| Paid nothing | Guests, abandoned matches, a seat whose player left and didn't come back, and solo games |

## How it works

**Thirteen and Muushig matches**
- `finishSession` (`server/persistence.js`) pays the match, adds any level-up gold to the same profile update, and returns each signed-in player's reward.
- `recordMatch` (`server/index.js`) stores the rewards on the lobby, and every member's state carries their own `reward`:
  - absent while the match is being saved;
  - `null` if it paid them nothing.
- A rematch, or the next session, clears it.
- At a credit match, the last state the table sends waits for the rewards.

**Poker**
- `payPokerHand` → `grantProgress` pays each hand as it ends and emits `progress_reward`.
- The table's `game_players` rows record what each seat earned.

**Client**
- `RewardPanel` (`src/components/RewardPanel.jsx`) shows the reward on Thirteen's game-over overlay and in Muushig's `RoundResults`, then refreshes the profile.
- `HandReward` floats a poker hand's pay and shows its level-up.

**Existing data and naming**
- Migration 014 moves each player's XP onto the new curve and keeps their level: `exp = levelStart(level) + exp % 100`.
- *(My call)* The DB keeps the `coins` and `coins_earned` column names. Renaming them would mean rebuilding three views for no player-visible gain.
