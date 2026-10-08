// POKER RULES — the Poker rulebook, opened from the table header and the main
// menu's RULES picker.
//
// Follows docs/poker-rulebook.md section by section, and the engine in
// utils/poker/engine.js implements the same rules. If a rule changes, change
// all three. Examples are drawn with real PixelCards.

import React from "react";
import Rulebook, { Callout, CardRow, Hi, Kbd, Key, Section, Steps } from "../Rulebook";
import { BIG_BLIND, BUY_IN, MAX_SEATS, SMALL_BLIND } from "../../utils/poker/engine";
import { DEFAULT_POKER_DELAYS, MAX_TIMEOUTS } from "../../utils/poker/table";

const SECTIONS = [
  ["goal", "The goal"],
  ["hand", "A hand"],
  ["betting", "Betting"],
  ["ranks", "Hand ranks"],
  ["showdown", "Showdown and pots"],
  ["table", "Seats and chips"],
  ["controls", "Controls"],
];

export default function PokerRules({ onClose }) {
  return (
    <Rulebook title="HOW TO PLAY POKER" subtitle={`No-limit Texas Hold'em · up to ${MAX_SEATS} players`} headerCards="A♠ K♠ Q♠ J♠" sections={SECTIONS} onClose={onClose}>
      <Section id="goal" n={1} title="The goal">
        <p>
          Win chips. Each hand you get <Key>2 cards</Key> of your own and share <Key>5 cards</Key> on the table with everyone. The best{" "}
          <Key>5-card hand</Key> made from those 7 wins the pot, or you win it by betting until everyone else <Hi>folds</Hi>.
        </p>
        <p>
          Everyone sits down with <Key>{BUY_IN} chips</Key>. Blinds are <Key>{SMALL_BLIND}/{BIG_BLIND}</Key>.
        </p>
      </Section>

      <Section id="hand" n={2} title="A hand">
        <Steps
          items={[
            "The dealer button (D) moves one seat left. The next two players post the small and big blinds.",
            "Everyone gets 2 cards. Betting starts left of the big blind.",
            "The flop: 3 shared cards, then betting.",
            "The turn: a 4th card, then betting.",
            "The river: a 5th card, then the last betting round and the showdown.",
          ]}
        />
        <Callout tone="tip" title="Two players">
          With only two players dealt in, the button posts the small blind and acts first before the flop, last after it.
        </Callout>
      </Section>

      <Section id="betting" n={3} title="Betting">
        <p>
          On your turn: <Key>fold</Key> (give up the hand), <Key>check</Key> (when there's nothing to call), <Key>call</Key> the bet, or{" "}
          <Key>bet / raise</Key>. A raise must be at least as big as the last bet or raise. You can always go <Key>all-in</Key>.
        </p>
        <p>
          An all-in that's smaller than a full raise doesn't let players who already acted raise again; they can only call it or fold.
        </p>
      </Section>

      <Section id="ranks" n={4} title="Hand ranks">
        <p>Best first. Suits never break a tie: the next-highest cards (kickers) do.</p>
        <div className="flex flex-col gap-2">
          <CardRow name="Straight flush" spec="9♥ 8♥ 7♥ 6♥ 5♥" text="Five in a row, one suit. Ace-high is a royal flush." />
          <CardRow name="Four of a kind" spec="Q♠ Q♥ Q♦ Q♣ 3♠" text="Four cards of one rank." />
          <CardRow name="Full house" spec="8♠ 8♥ 8♦ K♣ K♠" text="Three of a kind and a pair." />
          <CardRow name="Flush" spec="A♦ J♦ 9♦ 6♦ 2♦" text="Five of one suit." />
          <CardRow name="Straight" spec="10♣ 9♦ 8♠ 7♥ 6♣" text="Five in a row. A-2-3-4-5 is the lowest." />
          <CardRow name="Three of a kind" spec="7♠ 7♥ 7♦ K♣ 2♠" text="Three cards of one rank." />
          <CardRow name="Two pair" spec="J♠ J♥ 4♦ 4♣ A♠" text="Two different pairs." />
          <CardRow name="Pair" spec="10♠ 10♥ K♦ 6♣ 3♠" text="Two cards of one rank." />
          <CardRow name="High card" spec="A♠ Q♥ 9♦ 6♣ 3♠" text="Nothing else: the highest card plays." />
        </div>
      </Section>

      <Section id="showdown" n={5} title="Showdown and pots">
        <p>
          The last player to bet on the river shows first (or the first player left of the button if everyone checked). A hand that wins nothing
          is mucked unshown. When players are all-in with no more betting possible, every hand is shown and the board runs out.
        </p>
        <p>
          A player all-in for less can only win what each opponent matched: the rest goes to a <Key>side pot</Key> they can't win. A tie
          splits the pot; an odd chip goes to the first winner left of the button.
        </p>
      </Section>

      <Section id="table" n={6} title="Seats and chips">
        <p>
          Sit down any time: you're dealt in from the <Key>next hand</Key>. Leave any time: a hand you're in folds.
        </p>
        <p>
          Each turn has <Key>{DEFAULT_POKER_DELAYS.turn / 1000} seconds</Key> online. When it runs out you check if you can, else fold. Run out{" "}
          {MAX_TIMEOUTS} times in a row and you <Hi color="#e85a7a">sit out</Hi> until you press I'M BACK; sit out for{" "}
          {DEFAULT_POKER_DELAYS.sitOutKick / 60000} minutes and you leave the table.
        </p>
        <p>
          Out of chips? Press <Key>REBUY</Key> for another {BUY_IN}. These chips are free and don't count anywhere else.
        </p>
      </Section>

      <Section id="controls" n={7} title="Controls">
        <p>
          <Kbd>F</Kbd> fold · <Kbd>C</Kbd> check or call · <Kbd>R</Kbd> raise by the amount set. ½ POT, POT and ALL-IN set the amount; the slider
          and the box fine-tune it, and <Kbd>Enter</Kbd> in the box raises.
        </p>
      </Section>
    </Rulebook>
  );
}
