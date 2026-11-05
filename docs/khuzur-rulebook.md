# Khuzur — Rulebook

Mongolia's classic card game, for 2 to 6 players, alone or in teams. Lead cards at the next player, who must beat every one of them or pick the whole stack up. Every play refills your hand from the pile, until the pile runs dry. Then it's a race: **empty your hand first.**

## At a glance

| | |
| --- | --- |
| **Players** | 2 to 6: free for all, or teams (2v2, 2v2v2, 3v3) |
| **Deal** | Chosen before the match: **5 cards** (one deck, 34 cards) or **7 cards** (two decks, 66 cards) |
| **Trump** | One card turned face up after the deal. Its suit beats every plain card |
| **Goal** | Be the first to have **no cards**. In teams, the first teammate out wins for the whole team |
| **A match** | One round. It ends with standings: 1st, 2nd, … last |

## Contents

1. [Cards](#1-cards)
2. [The table](#2-the-table)
3. [The dealer](#3-the-dealer)
4. [Dealing and trump](#4-dealing-and-trump)
5. [Leading](#5-leading)
6. [Beating and picking up](#6-beating-and-picking-up)
7. [Drawing back up](#7-drawing-back-up)
8. [The trump 7](#8-the-trump-7)
9. [Going out and standings](#9-going-out-and-standings)
10. [Time limit and surrender](#10-time-limit-and-surrender)
11. [The CPU](#11-the-cpu)

### Words used in this rulebook

| Word | Meaning |
| --- | --- |
| **Lead** | The cards that start a new stack: 1, 3, 5 or 7 of them. |
| **Layer** | One player's cards on the stack: the lead, or one beat. |
| **Beat** | Cover every card of the top layer, one card each, with a higher card. |
| **Stack** | The lead and every layer beaten on top of it. |
| **Pick up** | Take the whole stack into your hand instead of beating. |
| **Draw pile** | The face-down cards left after the deal. The face-up trump is its last card. |
| **Dead pile** | Stacks that went all the way round. They never come back. |

---

## 1. Cards

**The 5-card game** uses one deck of **34 cards**: 7, 8, 9, 10, J, Q, K, A in all four suits, plus a **gray joker** and a **colored joker**.

**The 7-card game** uses two decks: **66 cards**. Every card from 7 to A comes twice, and there is still only **one gray joker and one colored joker**.

### Card order

| | Lowest → highest |
| --- | --- |
| **Ranks** | 7 · 8 · 9 · 10 · J · Q · K · A |
| **Suits** | ♦ Diamonds · ♣ Clubs · ♥ Hearts · ♠ Spades |

From weakest to strongest, every card in the game falls in one line:

1. **Plain cards** (not trump), by rank first, then by suit when the ranks are equal.
2. **Trumps**, by rank. Any trump beats any plain card.
3. **The gray joker.** It beats every trump.
4. **The colored joker.** The strongest card in the game. Nothing beats it.

A card beats another only if it is **strictly higher** in this line. In the 7-card game, a card can't beat its twin.

> **Examples** (trump ♥): 8♦ beats 7♠, because a higher rank wins whatever the suit. 9♠ beats 9♣, because at the same rank the higher suit wins. 7♥ beats A♠, because a trump beats any plain card. The gray joker beats A♥. Only the colored joker beats the gray joker.

---

## 2. The table

Seats go round the table. In team games the teams **alternate**, so you never sit next to a teammate:

| Table | Seats, clockwise |
| --- | --- |
| Free for all | 2 to 6 players, everyone for themselves |
| 2v2 | A B A B |
| 2v2v2 | A B C A B C |
| 3v3 | A B A B A B |

**Play goes clockwise**: the next player is the one on your **left**.

In the middle of the table are:

- **the trump card**, face up,
- **the stack**, where cards are played,
- **the draw pile**, face down,
- **the dead pile**, face down.

---

## 3. The dealer

**The first match at a table: draw for the deal.** A shuffled deck is set face down. A random player draws first, then play goes clockwise. On your draw you choose how deep to go, **1 to 10 cards down**, and take only that card. The **highest card deals**, using the card order above. Players tied with twins draw again.

**After that:**

- **Teams:** the team that came **last** deals. The first time that team deals, a random player on it deals. Each later time, the deal moves clockwise to that team's next player.
- **Free for all:** the deal passes **clockwise** to the next player.

---

## 4. Dealing and trump

1. The dealer deals **one card at a time**, clockwise, starting with the player on their **left**, until everyone has **5** (or **7**) cards.
2. The dealer turns the next card **face up**. Its suit is **trump** for the whole round. It sits under the draw pile and will be the **last card drawn**.
3. **A joker can't be the trump card.** If one turns up, it goes back into the middle of the draw pile, somewhere nobody knows, and the next card is turned up instead.

| Players | 5-card game: left to draw | 7-card game: left to draw |
| --- | --- | --- |
| 2 | 24 (trump + 23) | 52 (trump + 51) |
| 3 | 19 | 45 |
| 4 | 14 | 38 |
| 5 | 9 | 31 |
| 6 | 4 | 24 |

The player on the **dealer's left** leads first.

---

## 5. Leading

A lead is **1, 3, 5 or 7 cards**, and every card in it needs a **partner of the same rank, except at most one**. The card without a partner is the **lonely card**, and it can be anything, even one more of a matched rank.

| Cards | Valid | Not valid |
| --- | --- | --- |
| 1 | any single card | |
| 3 | J J 9 · J J J | J Q 9 |
| 5 | J J Q Q 9 · J J J J 9 · J J J Q Q | J J J Q 9 (two lonely cards) |
| 7 | J J Q Q K K 9 · J J J Q Q Q 9 · J J J J Q Q 9 · J J J J Q Q Q | J J J Q Q 9 8 |

- **Jokers never have a partner**, so a joker can only be the lonely card, and a lead holds **at most one joker**.
- **The game sets a ceiling.** In the 5-card game a lead is at most **5 cards**, and in the 7-card game at most **7**, however many cards you hold.
- **The smallest hand sets the limit.** You can't lead more cards than the smallest hand at the table, teammates and opponents alike. If anyone holds 2 cards, every lead is a single card.
- You must lead something when it's your turn to lead.

---

## 6. Beating and picking up

After a lead, play goes clockwise. On your turn you either **beat** or **pick up**.

**Beat.** Cover **every card of the top layer**, one card each, with a card that beats it. Your cards don't need to make a valid lead; any cards that beat will do. They become the new top layer, and the next player must beat **your** cards. Teammates must beat each other's cards too.

**Pick up.** Take the **whole stack**, every layer, into your hand. You may pick up even when you could beat. The player on **your left** leads next.

**The stack goes all the way round** when every other player has beaten it. The last player to beat it ends the circle: the stack goes to the **dead pile**, and **that player leads next**.

> **Example, 4 players, trump ♥.** Ana leads 9♣ 9♦ K♠. Bat beats them with 10♣ 10♦ A♠. Chuluun beats Bat's cards with J♦ Q♣ 7♥. Dorj can't beat 7♥, so he picks up all 9 cards, and Ana, on his left, leads the next stack.

---

## 7. Drawing back up

Every time you **lead or beat**, you draw from the draw pile until you're back to **5** (or **7**) cards. The draw happens **automatically, the moment your cards are down**, and only then can the next player act.

- You don't draw after picking up.
- When the pile runs low, you take what's left. **The face-up trump is the last card drawn.**
- Once the pile is empty, nobody draws again. From then on, every card you play brings you closer to going out.

---

## 8. The trump 7

A player holding the **7 of the trump suit** may swap it for the face-up trump card **on any of their turns**, whether they're leading or beating, while the trump card is still on the table. The 7 then lies face up in its place and becomes the last card of the draw pile.

Wait too long, and someone may draw the trump card first.

If the face-up trump is itself a 7, there's nothing to swap. In the 7-card game there are two trump 7s, and only the first swap is possible, because the second 7 can't be swapped for its twin.

---

## 9. Going out and standings

The moment your hand is **empty**, you're **out**, even in the middle of a stack. That can happen only once the draw pile has run dry.

- **Free for all:** the first player out is **1st** and stops playing. The rest play on for **2nd**, **3rd** and so on, and the last player holding cards is **last**.
- **2v2 and 3v3:** the first player out wins for their **whole team**, and the match ends. The other team is last.
- **2v2v2:** the first player out puts their **whole team** in **1st**, and both of them stop playing. The other two teams play on, and the next player out puts their team in **2nd**. The team left is **3rd**.

When someone goes out partway through a stack:

- the stack carries on, and the next player still playing must beat it;
- the stack goes all the way round once every other player **still playing** has beaten it;
- if the player who should lead next is out, the next player still playing on their left leads;
- the smallest-hand limit only counts players still playing.

---

## 10. Time limit and surrender

**Online tables** give you **45 seconds** a turn. Run out of time while leading and your turn is skipped: the player on your left leads instead. Run out of time while beating and you **pick up** the stack. Practice tables have no timer.

### Surrender

You can **surrender** at any time. You take **last place**; in a team game, your **whole team** does.

---

## 11. The CPU

Practice tables seat you with CPU players. The CPU never sees anyone's cards: it knows only its own hand, the face-up trump, every card that's been played, picked up or sent to the dead pile, and how many cards each player holds.

It leads its weakest cards and saves its trumps and jokers. It beats with the cheapest cards that hold, and picks up when beating would cost too much. In a team game it plays for the team: it won't spend its best cards on a teammate's lead when picking up costs the team less.

---

<sub>**For contributors:** `src/utils/khuzur/cards.js` (card order, leads, covering) and `src/utils/khuzur/engine.js` (the match) implement exactly these rules, and the CPU is `src/utils/khuzur/ai.js`. The in-game rulebook is `src/components/khuzur/KhuzurRules.jsx`. Change them together.</sub>
