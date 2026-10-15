# Poker rulebook

No-limit Texas Hold'em, as Khuzur plays it. The engine
(`src/utils/poker/engine.js`) and the in-game rulebook
(`src/components/poker/PokerRules.jsx`) follow this document section by
section: change all three together. Sections 1–7 are the game as every
table plays it; section 8 adds what changes at credit tables.

## 1. The goal

Win chips. Each hand you hold 2 cards of your own and share 5 cards on the
table. The best 5-card hand made from those 7 wins the pot, or you win it by
betting until everyone else folds.

A table seats up to 6. At a free table everyone sits down with 1000 chips
and the blinds are 5/10; the chips are free and count for nothing outside the
table. Credit tables (§8) are played for credits that stay with your account.

## 2. A hand

1. The dealer button moves one occupied seat left (it skips empty seats and
   players sitting out). The first hand's button is drawn at random.
2. The next player posts the small blind (5), the one after the big blind (10).
3. Everyone dealt in gets 2 cards.
4. Preflop betting starts left of the big blind.
5. The flop (3 shared cards), betting; the turn (1), betting; the river (1),
   betting. After the flop, betting starts at the first player left of the
   button.
6. The showdown (§5).

**Two players.** With two dealt in, the button posts the small blind and acts
first preflop, last after the flop.

**A short blind.** A player who can't cover a blind posts everything they
have and is all-in. The others still call the full big blind.

## 3. Betting

On your turn: **fold**, **check** (nothing to call), **call**, **bet** (when
nobody has) or **raise**, or go **all-in**.

* The first bet of a round is at least the big blind.
* A raise is at least the size of the last bet or raise in that round.
* An all-in can be any amount. One that is short of a full raise doesn't
  reopen the betting: players who already acted may only call the extra or
  fold.
* The big blind has the option: if everyone just calls, they may still raise.
* A round ends when everyone still in has acted and matched the bet (or is
  all-in).

## 4. Hand ranks

Best first: straight flush (ace-high is a royal flush), four of a kind, full
house, flush, straight, three of a kind, two pair, pair, high card. A-2-3-4-5
is the lowest straight. Ties break on the remaining cards (kickers) within
the best five; suits never break a tie.

## 5. Showdown and pots

* If everyone else folds, the last player wins without showing.
* At a river showdown the last player to bet or raise on the river shows
  first; if the river was checked through, the first player left of the
  button. A hand that wins nothing is mucked unshown.
* When betting can't continue (all but one player are all-in), every hand
  still in is shown and the rest of the board is dealt with no more betting.
* **Side pots.** A player all-in for less can only win, from each opponent,
  as much as they put in themselves. The rest forms side pots among the
  players who put in more.
* A tie splits the pot. Chips that don't divide go one each to the tied
  winners, starting left of the button.

## 6. Seats and chips

* Sit down at any empty seat at any time; you're dealt in from the next hand.
* Leave at any time; a hand you're in is folded. No CPU takes your seat.
* Online, each turn has 20 seconds. When it runs out you check if you can,
  otherwise you fold. Two in a row and you sit out: you keep your seat and
  chips but aren't dealt in until you press I'M BACK. Five minutes sitting
  out and you leave the table.
* Out of chips: REBUY for another 1000 (CPUs rebuy on their own).
* The host presses START once; hands then follow each other while two or
  more players have chips. The host can add or remove CPUs and close the
  table. Practice has no turn clock.

## 7. Controls

F folds, C checks or calls, R raises by the amount set. ½ POT and POT set a
raise of half or all of the pot after calling; ALL-IN sets everything. The
slider and the amount box fine-tune it; Enter in the box raises.

## 8. Credit tables

Signed-in players with a linked Google or Discord login can also play for
**credits**, which stay with your account.

* **Your balance.** You start with 1000 credits. Once every 24 hours, if your
  balance plus what you have at a table is under 1000, CLAIM tops you back up
  to exactly 1000. Everything above 1000 is winnings.
* **Stakes.** The host picks LOW (blinds 5/10, buy in 200–1000), MID
  (25/50, 1000–5000) or HIGH (100/200, 4000–20000). Credit tables are for
  people only: no CPUs.
* **Buying in.** Sitting down moves the credits you choose from your balance
  to the table. If you left a table at the same stakes in the last hour, you
  must bring at least what you left with. You can sit at one credit table at
  a time.
* **The big blind.** A newcomer, or a player back from sitting out, is dealt
  in when the big blind reaches them, and posts it like everyone else.
* **Adding chips.** Between hands, or after you fold, ADD CHIPS tops your
  stack up to the table's maximum; the chips land before the next deal. Out
  of chips, REBUY works the same way from the table's minimum.
* **Leaving.** Your stack goes back to your balance. In a hand, your cards
  fold, unless you're all-in: then the hand plays out and whatever it wins
  goes to your balance.
* **Closing.** When the host closes the table, the hand in play finishes
  first, then everyone's credits go home. If the server restarts, every stack
  goes back to its balance and a hand that was being played doesn't count.
* **The leaderboard** ranks everyone who has played for credits by balance
  plus what's at a table.
