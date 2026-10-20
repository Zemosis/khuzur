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

<sub>**For contributors:** the engine in `src/utils/muushig/` implements exactly these rules, and the server runs a copy in `server/game/muushig/`. The in-game rulebook is `src/components/muushig/MuushigRules.jsx`. Change all of them together.</sub>
