# Thirteen — Rulebook

A shedding game for 2 to 4 players, in the style of Vietnam's *Tiến lên*. Beat the play on the table with a stronger one, and be the first to empty your hand.

## At a glance

| | |
| --- | --- |
| **Players** | 2 to 4 |
| **Deck** | 52 cards, no jokers |
| **Hand** | 13 cards each. With fewer than 4 players, the leftover cards aren't dealt. |
| **Round goal** | Be the first to play every card in your hand |
| **Match goal** | Avoid points. Cards left in your hand when someone goes out count against you. |
| **Out at** | 30 points |
| **Winner** | The last player still in the match |

## Contents

1. [Card order](#1-card-order)
2. [How a round is played](#2-how-a-round-is-played)
3. [Combinations](#3-combinations)
4. [Breaking ties](#4-breaking-ties)
5. [Scoring](#5-scoring)
6. [CPU levels](#6-cpu-levels)
7. [Controls](#7-controls)

### Words used in this rulebook

| Word | Meaning |
| --- | --- |
| **Combination** | The card or cards you put down in one go: a single, pair, triple, four of a kind, or a 5-card hand. |
| **Trick** | One run of plays on the table. It starts with a fresh lead and ends when everyone else passes in a row. |
| **Lead** | The first play of a trick. The leader can play any valid combination. |
| **Beat** | Play a stronger combination of the **same kind**, with the same number of cards. |
| **Pass** | Skip your turn without playing. |

---

## 1. Card order

Cards rank by **rank first**, then by **suit** when the ranks are equal.

| | Lowest → highest |
| --- | --- |
| **Ranks** | 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · J · Q · K · A · **2** |
| **Suits** | ♦ Diamonds · ♣ Clubs · ♥ Hearts · ♠ Spades |

- The **2 is the highest rank**, not the lowest.
- The **3♦** is the weakest card in the deck and the **2♠** the strongest.

> **Example:** 7♠ beats 7♥ (same rank, and spades is the higher suit). 8♦ beats 7♠ (the higher rank wins, whatever the suit).

---

## 2. How a round is played

1. **Deal.** Everyone gets 13 cards.
2. **First lead.**
   - In the first round, whoever holds the **3♦** leads. They don't have to play the 3♦ itself.
   - With fewer than 4 players the 3♦ may not be dealt. Then whoever holds the lowest card dealt leads.
   - In later rounds, **the previous round's winner** leads.
3. **Lead a trick.** The leader plays any combination. The leader **can't pass**.
4. **Go around clockwise.** On your turn, either **beat** the combination on the table (same kind, stronger), or **pass**.
5. **Passing only skips this turn.** If the table is beaten again and the turn comes back to you, you choose again: play or pass. You might pass to save a strong card for later, or because nothing you hold beats the table.
6. **Take the trick.** When every other player passes **in a row** after a play, whoever made that play takes the trick. The table clears and they lead a new trick with anything they like.
7. **Win the round.** The first player to empty their hand wins the round, and everyone else scores points (see [Scoring](#5-scoring)).

### Example trick

| Turn | Player | Action | Table |
| :---: | --- | --- | --- |
| 1 | You | lead 5♣ | 5♣ |
| 2 | CPU 1 | pass (saving their 2♠) | 5♣ |
| 3 | CPU 2 | play 9♦ | 9♦ |
| 4 | CPU 3 | play K♥ | K♥ |
| 5 | You | pass | K♥ |
| 6 | CPU 1 | **asked again**, plays 2♠ | 2♠ |
| 7–9 | CPU 2, CPU 3, You | pass, pass, pass | 2♠ |
| — | CPU 1 | takes the trick and leads next | *(empty)* |

CPU 1 passed on turn 2, but because CPU 2 and CPU 3 played after that, CPU 1 got another turn.

---

## 3. Combinations

You can play **1, 2, 3, 4 or 5 cards** at once, and no other number. A combination can only be beaten by the **same kind**.

| Play | Cards | Beaten by |
| --- | --- | --- |
| Single | 1 card | a higher single |
| Pair | 2 of the same rank | a higher pair |
| Triple | 3 of the same rank | a higher triple |
| Four of a kind | 4 of the same rank | a higher four of a kind only |
| 5-card hand | see below | a stronger 5-card hand |

> **There are no bombs.** Four of a kind can't be played on a 2, or on anything but another four of a kind. Add any fifth card and it becomes a **poker**, which is a 5-card hand.

### 5-card hands

From weakest to strongest. Any hand of a stronger **type** beats any hand of a weaker type: any flush beats any straight, for example.

| # | Hand | Cards |
| :---: | --- | --- |
| 1 | **Straight** | Five ranks in a row, any suits |
| 2 | **Flush** | Five cards of one suit |
| 3 | **Full house** | A triple plus a pair |
| 4 | **Poker** | Four of a kind plus any one card |
| 5 | **Straight flush** | A straight all in one suit |
| 6 | **Royal flush** | 10-J-Q-K-A all in one suit |

**Straights and the 2.** The 2 is the top rank, so J-Q-K-A-2 is the highest straight. Only the A and the 2 may wrap around to the bottom:

- **A-2-3-4-5** and **2-3-4-5-6** are straights. They count as topped by their 5 and 6, so they are the two lowest straights.
- K-A-2-3-4 and Q-K-A-2-3 are **not** straights.

---

## 4. Breaking ties

When two plays are the same kind, this decides which one is higher:

| Play | Compare |
| --- | --- |
| Singles, pairs, triples, fours | The rank. If equal, the highest suit in each. |
| Straights, straight flushes | The highest card's rank, then its suit. In A-2-3-4-5 and 2-3-4-5-6 the highest card is the 5 or the 6. |
| Flushes | The suit first, whatever the cards: a ♣ flush beats any ♦ flush. Same suit: the highest card. |
| Full houses | The rank of the triple (then of the pair) |
| Pokers | The rank of the four, whatever the extra card |

---

## 5. Scoring

When a player goes out, every other player scores **1 point per card** left in their hand.

> **10 or more cards count double.** Caught holding 11 cards? That's 22 points.

| Cards left | Points |
| :---: | :---: |
| 0 (you won) | 0 |
| 3 | 3 |
| 9 | 9 |
| 10 | 20 |
| 13 (never played) | 26 |

- Points add up across rounds.
- At **30 points or more** you're **eliminated** and sit out the rest of the match. A round with all 13 cards still in hand (26 points) puts you out if you already had 4.
- When only one player is left, **they win the match**. A match win is recorded, and the host can start a rematch.

---

## 6. CPU levels

CPU players come in three levels. Pick one for a practice table. Online, the host picks each CPU seat's level, and any empty seats fill with **Medium** CPUs when the game starts.

| Level | Plays like | How it plays |
| --- | --- | --- |
| 🟢 **Easy** | A beginner | Always plays when it can, with its lowest card that wins. Leads its lowest card, now and then with the cards that pair it. Sometimes grabs any winning play, 2s and all. Never notices who's about to go out. |
| 🟡 **Medium** | A decent club player | Plans its hand into pairs, straights and other sets, and sheds the low ones first. Keeps its aces and 2s while it holds more than 7 cards. Blocks: when someone has one card left, it answers singles with its highest card and leads sets instead of singles. Doesn't remember what's been played. |
| 🔴 **Hard** | A strong player | Counts the round's cards: once the 2s are gone, it knows its ace is the highest left. Reads passes: a player on their last card who passes on an 8 must hold something lower. Before every move it plays the rest of the round out in its head, many times over with the unseen cards dealt at random, and keeps the move that costs it the fewest points. |

> **No peeking.** CPUs never see anyone's cards. They know only what you could know in their seat: their own hand, how many cards each player holds, who passed, and what's been played.

---

## 7. Controls

| Action | How |
| --- | --- |
| Select a card | Click it |
| Select a range | **Shift**-click |
| Play the selection | **Space** |
| Pass | **P** |
| Sort your hand | **Sort**: by rank or by suit |
| Change the selection | **Clear** / **All** |

---

<sub>**For contributors:** the game enforces these rules in `src/utils/handEvaluator.js` and `src/utils/gameLogic.js`, and the CPU players live in `src/utils/aiPlayer.js`. The server runs copies of all of them in `server/game/`. The in-game rulebook is `src/components/thirteen/RulesModal.jsx`. Change all of them together.</sub>
