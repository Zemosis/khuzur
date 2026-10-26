# Muushig — Rulebook

A Mongolian trick-taking card game for 5 players. Everyone starts on **15 points**. Each trick you win takes a point off, and the **first player to reach 0 wins the match**.

In Muushig, winning a trick is called **eating** it: you eat the pile.

## At a glance

| | |
| --- | --- |
| **Players** | 5 |
| **Deck** | 32 cards: 7, 8, 9, 10, J, Q, K, A in all four suits |
| **Hand** | 5 cards |
| **Starting score** | 15 |
| **Tricks per round** | 5 |
| **Goal** | Be the first to reach 0 points |

**A round, in order:** deal → go in or fold → swap cards → the dealer takes the trump → 5 tricks → scoring.

## Contents

1. [Cards](#1-cards)
2. [The dealer](#2-the-dealer)
3. [Dealing and trump](#3-dealing-and-trump)
4. [Go in or fold](#4-go-in-or-fold)
5. [Swapping cards](#5-swapping-cards)
6. [Playing tricks](#6-playing-tricks)
7. [Scoring](#7-scoring)
8. [Winning the match](#8-winning-the-match)
9. [CPU levels](#9-cpu-levels)
10. [Playing for credits](#10-playing-for-credits)
11. [XP, levels and gold](#11-xp-levels-and-gold)

---

## 1. Cards

- **Ranks**, lowest to highest: 7 · 8 · 9 · 10 · J · Q · K · A.
- **Suits have no order.** A card only beats another card of the **same suit**, unless it's a trump.
- **Any trump beats any non-trump card.** Between trumps, the higher rank wins.

---

## 2. The dealer

**First round: draw for the deal.**

1. A shuffled deck is set face down in the middle. A **random player** draws first, then play goes clockwise.
2. On your draw you choose how deep to go, **1 to 10 cards down** (never deeper than the pile), and take **only that card**. The cards above it stay on the pile.
3. Every drawn card is turned face up. The **highest rank deals**.
4. Suits have no order, so **tied players draw again** from what's left, in the same order, until one is highest. If the pile can't cover another draw, the tie is settled at random.

Every match, rematches included, starts with a new draw. **In later rounds** the deal passes **clockwise** to the next player.

> "Left of the dealer" means the next player clockwise.

---

## 3. Dealing and trump

1. The dealer deals **5 cards** to each player (25 cards in all).
2. The dealer turns the next card **face up** and sets it beside the pile. Its suit is **trump** for the whole round.
3. The remaining **6 cards** are the **draw pile**.

The table also has a **dead pile**. Every discarded card and every folded hand goes there face down, and cards in the dead pile never come back this round.

---

## 4. Go in or fold

Starting **left of the dealer** and going clockwise, with the dealer deciding last, each player says whether they **go in** this round or **fold**.

- **Folding** puts your hand on the dead pile, and you sit the round out. Your **score doesn't change**.
- **At least 2 players must go in.** When the players still to decide are needed to make 2, they can't fold.
- **No 3 folds in a row.** After folding 2 rounds in a row, you **must go in** on the next round, whatever your hand. Going in starts the count over, and a new match starts everyone at 0.

---

## 5. Swapping cards

Starting **left of the dealer** and going clockwise (skipping folded players, dealer last), each player may:

- **discard** any number of cards (0 to 5) onto the dead pile, and
- **draw** the same number from the draw pile.

You can't discard more cards than the draw pile holds. Once the draw pile is empty, the players after that can't swap.

### The dealer takes the trump

After everyone has swapped, a dealer who is playing may **discard one card and take the face-up trump card** into their hand. Unless every card they hold is better than it, they should. Once it's taken, the trump card is gone from the table. Only its suit stays trump.

---

## 6. Playing tricks

- The **first trick** is led by the first playing player **left of the dealer**.
- Each later trick is led by **whoever ate the previous one**.
- Play goes **clockwise**, and everyone who is playing puts down **one card**.

### What you must play

Whoever leads may play **any card**. Everyone after them follows these rules, in order:

| You hold… | You must… |
| --- | --- |
| **The led suit** | Play it. If you hold one **higher** than every card of that suit on the table, play a higher one. You can't trump in while you hold the led suit, even if someone else already has. |
| **No led suit, but a trump** | Play a trump. If you hold one **higher** than every trump on the table, play a higher one. |
| **Neither** | Play **any card**. |

When trump is led, the first rule covers it: play a higher trump if you can, else any trump.

> The game only lets you pick cards you're allowed to play. The rest of your hand is dimmed.

### Who eats the pile

- The **highest trump** on the table eats the pile.
- If no trump was played, the **highest card of the led suit** does.
- A card of any other suit can never win.

On the table the trick is a **stack**: a card that beats the top card goes on top, and anything weaker is tucked underneath. When everyone has played, **whoever's card is on top eats the pile**.

---

## 7. Scoring

A round has exactly **5 tricks**. When they're done:

| Piles eaten this round | Score change |
| --- | --- |
| 0 (and you went in) | **+5** |
| 1 to 5 | **−1 per pile** |
| You folded | No change |

> **A sweep wins the round.** Eating **all 5 piles** drops your score by 5, and everyone else who went in ate nothing, so they each take +5.

---

## 8. Winning the match

The match ends after the first round in which someone reaches **0 or less**. The **lowest score** wins. If that's a tie, the player who ate more piles in that last round wins.

---

## 9. CPU levels

CPU players come in three levels. Pick one for a practice table. Online, the host picks each CPU seat's level, and any empty seats fill with **Medium** CPUs when the game starts (**Hard** at a credit table). Every level goes in with a trump nobody can beat, the face-up one included when it deals.

| Level | Plays like | How it plays |
| --- | --- | --- |
| 🟢 **Easy** | A beginner | Reads its hand roughly, and often goes in or folds when it shouldn't. Swaps away a random few of its dead cards. Doesn't count the cards played, and about one card in three it throws without thinking. |
| 🟡 **Medium** | A club player | Weighs each card's chance to eat a pile and goes in when that beats the risk of the +5. Dealing, it counts the face-up trump: an ace there is a pile in the bag. Swaps the cards a fresh draw would likely beat. Counts every card played: leads the trumps nobody can beat, and eats with the cheapest card that holds. Fights hardest for its first pile: that one is worth 6 points. |
| 🔴 **Hard** | A strong player | Plays each choice out in its head against hundreds of deals of the cards it can't see, dealt to fit what the table has shown: who couldn't follow suit, who couldn't go higher, who swapped few cards and so kept good ones. Plays to win the match, not the round: a point counts most near the finish, and it goes after whoever is about to win. |

> **No peeking.** CPUs never see anyone's cards. They know only what you could know in their seat: their own hand and the cards they swapped away, the face-up trump, how many cards each player swapped, and what's been played.

---

## 10. Playing for credits

On the lobby's **CREDITS** tab, signed-in players with a linked Google or Discord login play for credits. Muushig is played for a stake: everyone at the table puts in **the same amount**, and **the match winner takes the pot**.

| | |
| --- | --- |
| **Stakes** | LOW 100 · MID 500 · HIGH 2,000. The host picks one |
| **Sitting** | Your stake leaves your balance when you sit. Get up before the deal and it comes back |
| **Starting** | At least 2 players with stakes in. Hard bots fill the empty seats, and the host can't change them |
| **The pot** | Every player's stake. Bots put nothing in |
| **A tie** | Level on score and on piles eaten in the last round: the pot is split evenly |

> **A bot wins, the pot is lost.** If a bot wins the match, nobody gets the pot: those credits are gone.

**Leaving mid-match.** A Hard bot plays your seat and your stake stays in the pot. Come back to the table (its code, or **RETURN** on the CREDITS tab) and the seat is yours again. Once the bot has finished **2 rounds** for you, the seat is the bot's: if it wins, the pot is lost. Until the match ends you can't sit at another credit table.

**After the match** everyone stays at the table without a seat. **PLAY AGAIN** stakes you for the next match. Anyone who hasn't staked when it starts goes back to the lobby.

If the server restarts mid-match, the match doesn't count and every stake goes back.

---

## 11. XP, levels and gold

Signed in, every online match pays **XP** and **gold**, at free and credit tables alike. Practice games against CPUs don't.

| | |
| --- | --- |
| **The winner** | 70 XP and 80 gold |
| **Last place** | 30 XP and 20 gold. The places between are spread evenly |
| **Leaving** | Leave before the end and don't come back, and the match pays you nothing |

**Levels.** Level 2 takes **100 XP**, and each level after takes 50 more, up to 1,500 a level. Every new level pays **25 gold × the level**, and every 5th pays double: level 5 pays 250, level 10 pays 500.

> **Gold isn't credits.** Gold is for the shop, coming soon. Credits are what you stake, and what the leaderboard ranks.

The end of a match shows what it paid you: the XP and gold, your XP bar filling, and **LEVEL UP!** with the level's gold when you reach one.

---

<sub>**For contributors:** the engine in `src/utils/muushig/` implements exactly these rules, and the server runs a copy in `server/game/muushig/`. The CPU players are `src/utils/muushig/ai.js` and the credit stakes `src/utils/stakes.js` (both copied to the server too), and the in-game rulebook is `src/components/muushig/MuushigRules.jsx`. XP, levels and gold are `src/utils/progression.js`, copied to `server/game/progression.js`. Change all of them together.</sub>
