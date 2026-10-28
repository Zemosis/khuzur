# Blackjack — Rulebook

Standard casino Blackjack against the dealer, as Khuzur plays it. Get closer to 21 than the dealer without going over.

## At a glance

| | |
| --- | --- |
| **Players** | Up to 5 per table, each against the dealer |
| **Shoe** | 6 decks, reshuffled once about 75% of it has been dealt |
| **Payouts** | Win 1:1, blackjack 3:2, insurance 2:1, push returns the bet |
| **Dealer** | Stands on all 17s, soft 17 included |
| **Free tables** | Everyone sits down with 1000 chips that count for nothing outside the table |
| **Credit tables** | Played for credits that stay with your account (see [§8](#8-credit-tables)) |

## Contents

1. [The goal](#1-the-goal)
2. [A round](#2-a-round)
3. [Payouts](#3-payouts)
4. [Hit, stand, double and split](#4-hit-stand-double-and-split)
5. [Insurance](#5-insurance)
6. [The dealer](#6-the-dealer)
7. [Bets and chips](#7-bets-and-chips)
8. [Credit tables](#8-credit-tables)
9. [XP, levels and gold](#9-xp-levels-and-gold)

---

## 1. The goal

Beat the dealer: get closer to **21** than the dealer without going over. Go over 21 and you **bust**: the hand loses at once, even if the dealer busts after you.

Number cards count their number, J, Q and K count **10**, and an Ace counts **11** unless that would bust you, then **1**. You play against the dealer, not each other.

**Blackjack** is an Ace and a 10-value card as your first two cards.

---

## 2. A round

1. Place your bet (at least 10) and press DEAL. The round starts when everyone with a bet has pressed DEAL, or the betting time runs out. Skip betting and you sit the round out and keep your seat.
2. Everyone with a bet gets two cards. The dealer gets one card face up and one face down.
3. If the dealer shows an Ace, you may take insurance first. If the dealer shows an Ace or a 10-value card, the dealer then peeks at the face-down card.
4. Each hand takes its turn from the first seat on: HIT, STAND, DOUBLE or SPLIT. Run out of time and the hand stands.
5. The dealer turns the face-down card over and draws. Every hand is then settled at once.

The shoe is **6 decks**, shuffled by the server. Once about 75% of it has been dealt, it is shuffled again before the next round. The count is never shown.

---

## 3. Payouts

| | |
| --- | --- |
| **Win** | Pays 1:1: you win your bet, and get it back |
| **Blackjack** | Pays 3:2. A 21 made after a split is just 21, not a blackjack |
| **Push** | A tie. Your bet comes back. Your blackjack against the dealer's blackjack is a push |
| **Lose** | You lose your bet |

---

## 4. Hit, stand, double and split

- **HIT** takes another card. **STAND** keeps your hand. A 21 stands on its own.
- **DOUBLE**: on any first two cards, including after a split (not on split Aces). You take one more card, then the hand stands. It costs your bet again.
- **SPLIT**: two cards of equal value (a K and a 10 count as a pair) become two hands, up to 4 hands. Each split costs your bet again.
- Split Aces get one card each. They can't be hit or split again.
- You need the extra amount to double or split. Without it the button is greyed out.

---

## 5. Insurance

When the dealer shows an Ace, you are asked YES or NO, before the dealer peeks. Insurance costs **half your bet**, rounded down to a whole credit (and it isn't offered if that's 0). Insurance pays 2:1 if the dealer has blackjack, and is lost otherwise. No answer counts as NO.

> **Dealer blackjack.** The peek finds it, so the round ends before anyone plays. Only your original bet is lost, unless you have a blackjack too: that pushes.

---

## 6. The dealer

The dealer has no choices. They draw while they have less than 17 and **stand on all 17s**, soft 17 included. If every hand has already busted or is a blackjack, the dealer doesn't draw.

---

## 7. Bets and chips

The smallest bet is **10**. The most is your whole stack. At a free table you sit down with **1000 chips** that count for nothing outside it, and REBUY brings you back to 1000 when you can't cover the minimum.

---

## 8. Credit tables

Signed in, you can also play for **credits**, which stay with your account. Your bets, doubles, splits and insurance come out of your balance when you make them, and winnings go back in as soon as the round is settled.

- You can sit at one credit table at a time, of any game.
- Leave mid-round and your hands stand where they are (insurance counts as NO); they settle with the round and the payout still reaches your balance.
- Five rounds in a row without a bet stands you up.
- The leaderboard ranks credits, and shows your Blackjack net beside Poker's.

---

## 9. XP, levels and gold

Signed in, online blackjack against other people pays **XP** and **gold**, at free and credit tables alike. Playing alone doesn't.

| | |
| --- | --- |
| **A round** | 4 XP and 3 gold for each round you bet in |
| **A won round** | 6 XP and 8 gold |
| **How often** | At most one round every 30 seconds pays, so a quick run of small rounds earns little |
| **Alone** | A round pays only if another person is dealt in too |

**Levels.** Level 2 takes **100 XP**, and each level after takes 50 more, up to 1,500 a level. Every new level pays **25 gold × the level**, and every 5th pays double: level 5 pays 250, level 10 pays 500.

> **Gold isn't credits.** Spend gold in the shop on the main menu. Credits are what you stake, and what the leaderboard ranks.

---

<sub>**For contributors:** the engine (`src/utils/blackjack/`) and the in-game rulebook (`src/components/blackjack/BlackjackRules.jsx`) follow this document section by section; the server runs a copy of the engine in `server/game/blackjack/`. XP, levels and gold are `src/utils/progression.js`, copied to `server/game/progression.js`. Change all of them together.</sub>
