# What's new

Every version of Khuzur Card Hall, newest first. The site reads this file:
the newest version here is the one the main menu shows, and the PATCH NOTES
page lists them all. Write for players.

## 1.3.1 — 21 October 2026

- **Profile stats open at once.** Your stats show straight away with the figures from your last visit, and a small **UPDATING** box in the corner refreshes them behind the scenes.
- **Match pages use the whole screen** on wide displays: standings and the summary on the left, the timeline and rounds on the right.
- **Timeline:** the scores for the round you hover now show under the chart, so they never cover the lines.
- New loading animations on the **CLAIM** buttons.

## 1.3.0 — 21 October 2026

### Muushig and Thirteen for credits
- Thirteen's and Muushig's lobbies have a **CREDITS** tab. Both are played for a stake: everyone at the table puts in the same amount, and **the match winner takes the pot**.
- Three stakes: **LOW 100**, **MID 500** and **HIGH 2,000**. The host picks one. Your stake leaves your balance when you sit, and comes back if you get up before the deal.
- Start with 2 or more players.
  - **Thirteen** is for people only: 2 to 4 players, and empty seats stay empty.
  - **Muushig** always seats 5, so **Hard bots** fill the empty seats. Bots put nothing in, and **if a bot wins, the pot is lost**.
- Leave mid-match and a Hard bot plays your seat. Come back within **2 rounds** (use the table code, or **RETURN** on the CREDITS tab) and the seat is yours again. Stay away longer and the seat is the bot's.
- When the match ends, **PLAY AGAIN** stakes you for the next one.
- Thirteen and Muushig wins and losses show on the leaderboard's breakdown, and a credit match's page shows what it was played for.
- Both rulebooks have a new **Playing for credits** section.

### Profiles and match pages
- Your Thirteen, Muushig and Overall stats have an **All · Free · Credits** switch. Credits shows your credit matches: credits won or lost, pots won and your biggest pot. Credit matches in **Recent matches** show what you won or lost.
- **No more rating.** Credits are the ranked play, so the hidden rating is gone and match pages no longer show a rating number next to each player. A credit match's page shows each player's credits won or lost there instead.

## 1.2.2 — 20 October 2026

- **Rulebooks:** Muushig and Poker now have a **CPU levels** section, like Thirteen: who picks the levels, how Easy, Medium and Hard each play, and what a CPU can and can't see.
- Behind the scenes: Thirteen's table runs on a simpler game loop. Nothing changes at the table.

## 1.2.1 — 20 October 2026

- **Patch notes.** This page: see what changed in every version. Open it from **Patch notes** at the bottom of the main menu.
- Behind the scenes: tidier code across the site. Nothing changes at the table.

## 1.2.0 — 20 October 2026

### Match pages
- Open any online Thirteen or Muushig match from **Recent matches** on a profile: the final standings, one player's summary against the table, the score over the rounds, and each round's results and key plays.
- Pick a player in the standings to see the match from their side. Public matches can be shared with a link.

### Smarter CPUs in every game
- **Thirteen.** Medium plans its whole hand, keeps its aces and 2s while its hand is big, and stops a player about to go out. Hard also counts every card played, reads who passed, and plays each move out in its head before choosing.
- **Muushig.** Every level judges its hand far better: a dealer whose face-up trump is the ace always goes in and takes it, a pile in the bag. Medium counts the cards played and fights for its first pile. Hard plays each choice out against hundreds of deals of the cards it can't see, and plays to win the match, not just the round.
- **Poker.** Medium respects the size of a raise and the bets it faces. Hard reads hands from how each player bets, remembers how everyone at the table plays (a raise from someone who raises everything says little), bluffs where a bluff works, and plays all-in or fold when its stack is short.
- Easy is still the friendly table in every game, just a little less clumsy.

### Main menu and profiles
- A **RANKS** button opens the leaderboard, and your rank shows next to your credits.
- The daily **CLAIM** now sits on the main menu, with a countdown to the next one.
- The leaderboard shows where each player's credits came from: claims and each game's wins and losses.
- Poker profiles show how often you've shown each hand at a showdown, and how often it won.

### At the table
- Poker tables have a real deck and muck on the felt: the deck shuffles, deals and slides back, and folded hands land on the muck.
- Chat: turn speech bubbles off in Settings, or mute a player just for yourself.
- Thirteen's menu tile now says what it plays: 2 to 4 players.

## 1.1.0 — 15 October 2026

- **Thirteen:** a new hand, **Poker**: four of a kind plus one card, between a full house and a straight flush.
- **Thirteen:** the winning play stays on the table for a moment before the round's scores cover it.
- **Main menu:** signing in and out moved into the player menu and Settings, and the games scroll sideways with pixel arrows.

## 1.0.0 — 15 October 2026

- The hall opens: **Thirteen** for 2 to 4 players, **Muushig** for 5, and **Poker** for up to 6, online with friends or in practice against CPUs at three levels.
- **Credits:** a balance that stays with your account, a daily claim, credit poker tables and an all-time leaderboard.
- Profiles with stats and match history, an avatar picker and an avatar painter, and table chat.
