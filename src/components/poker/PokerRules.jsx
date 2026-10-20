// POKER RULES — the Poker rulebook, opened from the table header and the main
// menu's RULES picker.
//
// Follows docs/poker-rulebook.md section by section, and the engine in
// utils/poker/engine.js implements the same rules. If a rule changes, change
// all three. Examples are drawn with real PixelCards.

import React from "react";
import Rulebook, { Callout, CardRow, CpuLevels, Hi, Kbd, Key, Section, Steps } from "../Rulebook";
import { BIG_BLIND, BUY_IN, MAX_SEATS, SMALL_BLIND } from "../../utils/poker/engine";
import { DEFAULT_POKER_DELAYS, MAX_TIMEOUTS } from "../../utils/poker/table";
import { TIERS, fmt } from "../../utils/poker/tiers";
import ChipStack from "./ChipStack";
import { CHIP_COLORS } from "./chips";

// The chips, smallest first, each with its colour's name.
const CHIP_NAMES = { 1: "Cream", 5: "Rose", 25: "Green", 100: "Navy", 500: "Purple", 1000: "Orange" };
const CHIP_VALUES = Object.keys(CHIP_COLORS).map(Number).sort((a, b) => a - b);

const SECTIONS = [
  ["goal", "The goal"],
  ["hand", "A hand"],
  ["betting", "Betting"],
  ["ranks", "Hand ranks"],
  ["showdown", "Showdown and pots"],
  ["table", "Seats"],
  ["chips", "Chips"],
  ["cpus", "CPU levels"],
  ["controls", "Controls"],
  ["credits", "Credit tables"],
];

// How each CPU level plays (utils/poker/ai.js).
const LEVELS = [
  {
    id: "EASY",
    who: "A beginner",
    traits: [
      "Plays too many hands, and calls with any pair or draw.",
      "Raises only with a big hand, and never bluffs.",
      "Folds a hand with nothing as soon as someone bets.",
    ],
  },
  {
    id: "MEDIUM",
    who: "A solid regular",
    traits: [
      "Plays its starting hands by position, and wants a better one the bigger the raise.",
      "Works out its chance of winning and calls only when the price is right. Every bet it faces makes it more careful.",
      "Bets its good hands, and follows up a preflop raise with a bet on the flop now and then.",
    ],
  },
  {
    id: "HARD",
    who: "A strong player",
    traits: [
      "Reads hands: every raise, call and check makes some cards likelier than others, and it plays the hand out in its head against them.",
      "Remembers how everyone at the table plays: a raise from someone who raises every hand says little.",
      "Sizes its bets to its hand, bluffs where a bluff works, and bluffs less into players who never fold.",
      "Steals the blinds late, and goes all-in or folds when its stack is short.",
    ],
  },
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
            "The dealer button (D) moves one seat left (the first hand's is drawn at random). The next two players post the small and big blinds.",
            "The house shuffles the deck on the felt and deals everyone 2 cards, one at a time from the button's left. Betting starts left of the big blind.",
            "The flop: 3 shared cards, then betting.",
            "The turn: a 4th card, then betting.",
            "The river: a 5th card, then the last betting round and the showdown.",
          ]}
        />
        <p>
          The deck then lies left of the board; the flop, turn and river come from it. Folded hands go face down onto the <Key>muck</Key>, right of
          the board.
        </p>
        <Callout tone="tip" title="Two players">
          With only two players dealt in, the button posts the small blind and acts first before the flop, last after it.
        </Callout>
        <p>
          A player who can't cover a blind posts everything they have and is all-in; the others still call the full big blind.
        </p>
      </Section>

      <Section id="betting" n={3} title="Betting">
        <p>
          On your turn: <Key>fold</Key> (give up the hand), <Key>check</Key> (when there's nothing to call), <Key>call</Key> the bet, or{" "}
          <Key>bet / raise</Key>. The first bet is at least the big blind, and a raise at least as big as the last bet or raise. You can always go{" "}
          <Key>all-in</Key>.
        </p>
        <p>
          The big blind has the option: if everyone just calls, they may still raise. A round ends when everyone still in has matched the bet or
          is all-in.
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
          If everyone else folds, the last player wins without showing. A bet nobody calls goes back to whoever made it.
        </p>
        <p>
          The last player to bet on the river shows first (or the first player left of the button if everyone checked). A hand that wins nothing
          is mucked unshown. When players are all-in with no more betting possible, every hand is shown and the board runs out.
        </p>
        <p>
          A player all-in for less can only win what each opponent matched: the rest goes to a <Key>side pot</Key> they can't win. A tie
          splits the pot; an odd chip goes to the first winner left of the button.
        </p>
      </Section>

      <Section id="table" n={6} title="Seats">
        <p>
          Sit down any time: you're dealt in from the <Key>next hand</Key>. Leave any time: a hand you're in folds.
        </p>
        <p>
          Each turn has <Key>{DEFAULT_POKER_DELAYS.turn / 1000} seconds</Key> online. When it runs out you check if you can, else fold. Run out{" "}
          {MAX_TIMEOUTS} times in a row and you <Hi color="#e85a7a">sit out</Hi> until you press I'M BACK; sit out for{" "}
          {DEFAULT_POKER_DELAYS.sitOutKick / 60000} minutes and you leave the table.
        </p>
        <p>
          Out of chips? Press <Key>REBUY</Key> for another {BUY_IN}. These chips are free and don't count anywhere else. CPUs rebuy on their own.
        </p>
        <p>
          The host presses <Key>START</Key> once: after a short countdown the first hand deals, and hands follow while two or more players have
          chips. At a free table the host can add CPUs (<Hi color="#9bd14f">EASY</Hi>, <Hi color="#f4c430">MEDIUM</Hi> or{" "}
          <Hi color="#e85a7a">HARD</Hi>), remove them, and close the table. Practice seats you with five CPUs and has no turn clock.
        </p>
      </Section>

      <Section id="chips" n={7} title="Chips">
        <p>
          Each player's bets this round sit in front of them as stacks of chips; collected bets make the <Key>pot</Key> in the middle, with side
          pots as tags beside it. The blinds' chips say <Key>SB</Key> and <Key>BB</Key>.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 py-2" aria-label="Chip values">
          {CHIP_VALUES.map((v) => (
            <div key={v} className="flex flex-col items-center gap-1.5">
              <ChipStack amount={v} chipSize={40} testId={`chip-${v}`} />
              <span className="font-pixel-body text-[18px] leading-none text-bone/70">{CHIP_NAMES[v]}</span>
            </div>
          ))}
        </div>
        <p>
          A stack uses the fewest chips that make its amount, biggest first, one column per value. At most 4 columns of 6 are drawn, so a big
          amount looks short: the number under it is always exact.
        </p>
        <div className="flex items-end justify-center gap-8 py-2">
          <div className="flex flex-col items-center gap-1.5">
            <ChipStack amount={90} chipSize={24} testId="chip-example" />
            <span className="font-pixel-body text-[18px] leading-none text-bone/70">a bet of 90</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <ChipStack amount={10} label="BB" chipSize={24} testId="chip-example" />
            <span className="font-pixel-body text-[18px] leading-none text-bone/70">the big blind</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <ChipStack amount={1875} label="POT" chipSize={24} testId="chip-example" />
            <span className="font-pixel-body text-[18px] leading-none text-bone/70">a pot of 1875</span>
          </div>
        </div>
      </Section>

      <Section id="cpus" n={8} title="CPU levels">
        <p>
          CPUs come in three levels. Practice seats you with five CPUs at the level you pick; at a free table online, the host
          adds each CPU at its own level. Credit tables are for people only.
        </p>
        <CpuLevels levels={LEVELS} />
        <Callout tone="rule" title="NO PEEKING">
          CPUs never see a card before it's shown. They know only what you could know in their seat: their own two cards, the
          board, the bets, and how each player has played at this table.
        </Callout>
      </Section>

      <Section id="controls" n={9} title="Controls">
        <p>
          <Kbd>F</Kbd> fold · <Kbd>C</Kbd> check or call · <Kbd>R</Kbd> raise by the amount set. ½ POT, POT and ALL-IN set the amount; the slider
          and the box fine-tune it, and <Kbd>Enter</Kbd> in the box raises.
        </p>
      </Section>

      <Section id="credits" n={10} title="Credit tables">
        <p>
          Signed in with Google or Discord, you can also play for <Key>credits</Key>, which stay with your account. You start with <Key>1,000</Key>; once a day, if your balance
          plus what's at a table is under 1,000, <Hi>CLAIM</Hi> tops you back up to exactly 1,000.
        </p>
        <Steps
          items={[
            ...Object.values(TIERS).map((t) => `${t.id}: blinds ${t.smallBlind}/${t.bigBlind}, buy in ${fmt(t.minBuyIn)}–${fmt(t.maxBuyIn)}. People only, no CPUs.`),
            "Sitting down moves your buy-in from your balance to the table. Left a table at the same stakes within the hour? Bring at least what you left with.",
            "Newcomers and players back from sitting out are dealt in when the big blind reaches them.",
            "Between hands, ADD CHIPS tops you up to the table's maximum. Out of chips, REBUY.",
            "Leaving sends your stack home. In a hand you fold — unless you're all-in: then it plays out and what it wins is yours.",
            "If the server restarts, every stack goes home and a hand being played doesn't count.",
          ]}
        />
      </Section>
    </Rulebook>
  );
}
