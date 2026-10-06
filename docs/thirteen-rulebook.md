# Thirteen — Rulebook

> The rules the game enforces (`src/utils/handEvaluator.js`, `src/utils/gameLogic.js`;
> the server runs copies in `server/game/`). The in-game version is
> `src/components/thirteen/RulesModal.jsx`. Keep all of them in step.

## At a glance

- **4 players**, one 52-card deck (no jokers), **13 cards** each.
- **Goal of a round:** be the first to get rid of every card in your hand.
- **Goal of the match:** don't collect points. Cards left in your hand when someone
  else goes out are points against you. At **25 points** you are out of the match.
- **The last player still in wins the match.**

## Words used in this rulebook

| Word | Meaning |
| --- | --- |
| **Combination** | The card or cards you put down in one go: a single, pair, triple, four of a kind, or a 5-card hand. |
| **Trick** | One run of plays on the table. It starts with a fresh lead and ends when everyone else passes in a row. |
| **Lead** | The first play of a trick. The leader can play any valid combination. |
| **Beat** | Play a stronger combination of the **same kind**, with the same number of cards. |
| **Pass** | Skip your turn without playing. |

## 1. Card order

Cards are ranked by **rank first**, then by **suit** when the ranks are equal.

- **Ranks**, low to high: 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, **2**.
  The 2 is the highest rank, not the lowest.
- **Suits**, low to high: ♦ Diamonds < ♣ Clubs < ♥ Hearts < ♠ Spades.
- So the **3♦** is the weakest card in the deck and the **2♠** the strongest.

Example: 7♠ beats 7♥ (same rank, spades is the higher suit), and 8♦ beats 7♠ (higher rank wins, whatever the suit).

## 2. How a round is played

1. **Deal.** Everyone gets 13 cards.
2. **First lead.** In the first round, whoever holds the **3♦** leads. They don't have
   to play the 3♦ itself. In later rounds, **the previous round's winner** leads.
3. **Lead a trick.** The leader plays any combination. The leader **can't pass**.
4. **Go around clockwise.** On your turn, either
   - **beat** the combination on the table (same kind, stronger), or
   - **pass**.
5. **Passing only skips this turn.** If the table gets beaten again and the turn comes
   back to you, you choose again: play or pass. You might pass to save a strong card for
   later, or because you have nothing that beats the table.
6. **Take the trick.** When every other player passes **in a row** after a play, the
   player who made that play takes the trick. The table clears and they lead a new trick
   with anything they like.
7. **Win the round.** The first player to empty their hand wins the round, and everyone
   else scores points (see [Scoring](#5-scoring)).

### Example trick

| Turn | Player | Action | Table |
| --- | --- | --- | --- |
| 1 | You | lead 5♣ | 5♣ |
| 2 | CPU 1 | pass (saving their 2♠) | 5♣ |
| 3 | CPU 2 | play 9♦ | 9♦ |
| 4 | CPU 3 | play K♥ | K♥ |
| 5 | You | pass | K♥ |
| 6 | CPU 1 | **asked again**, plays 2♠ | 2♠ |
| 7–9 | CPU 2, CPU 3, You | pass, pass, pass | 2♠ |
| — | CPU 1 | takes the trick and leads next | (empty) |

CPU 1 passed on turn 2, but because CPU 2 and CPU 3 played after that, CPU 1 got another
turn.

## 3. Combinations

You can play **1, 2, 3, 4 or 5 cards** at once. No other number of cards is allowed.
A combination can only be beaten by the **same kind**.

| Play | Cards | Beaten by |
| --- | --- | --- |
| Single | 1 card | a higher single |
| Pair | 2 of the same rank | a higher pair |
| Triple | 3 of the same rank | a higher triple |
| Four of a kind | 4 of the same rank | a higher four of a kind only |
| 5-card hand | see below | a stronger 5-card hand |

There are **no bombs**. Four of a kind can't be played on a 2 or on anything other than
another four of a kind.

### 5-card hands

Weakest to strongest. Any hand of a stronger **type** beats any hand of a weaker type
(for example, any flush beats any straight).

1. **Straight:** five ranks in a row, any suits. Since 2 is the top rank, J-Q-K-A-2 is
   the highest straight. Only A and 2 may wrap around to the bottom: A-2-3-4-5 and
   2-3-4-5-6 are straights, topped by their 5 and 6, so they are the two lowest.
   K-A-2-3-4 and Q-K-A-2-3 are not valid.
2. **Flush:** five cards of one suit.
3. **Full house:** a triple plus a pair.
4. **Straight flush:** a straight all in one suit.
5. **Royal flush:** 10-J-Q-K-A all in one suit.

## 4. Breaking ties (same kind)

When two plays are the same kind, this decides which one is higher:

| Play | Compare |
| --- | --- |
| Singles, pairs, triples, fours | the rank; if equal, the highest suit in each |
| Straights, straight flushes | the highest card's rank, then its suit (in A-2-3-4-5 and 2-3-4-5-6 the highest card is the 5 or the 6) |
| Flushes | the suit first, whatever the cards (a ♣ flush beats any ♦ flush); same suit: the highest card |
| Full houses | the rank of the triple (then of the pair) |

## 5. Scoring

- When a player goes out, every other player scores **1 point per card left** in hand.
- Holding **10 or more cards doubles** those points (11 cards = 22 points).
- Points add up across rounds.
- At **25 points or more**, a player is **eliminated** and sits out the rest of the match.
- When one player remains, they **win the match** (a match win is recorded) and the host
  can start a rematch.

## 6. Controls

| Action | How |
| --- | --- |
| Select a card | click it |
| Select a range | **Shift**-click |
| Play the selection | **Space** |
| Pass | **P** |
| Sort the hand | **Sort** (by rank or by suit) |
| Change the selection | **Clear** / **All** |
