// MUUSHIG RULES — the Muushig rulebook, opened from the table header.
//
// Follows docs/muushig-rulebook.md section by section, and the engine in
// utils/muushig/engine.js implements the same rules. If a rule changes, change
// all three. Examples are drawn with real PixelCards.

import React from "react";
import Rulebook, { Callout, CardRow, Cards, CpuLevels, Hi, Kbd, Key, Section, Steps, Versus, XpRules } from "../Rulebook";
import { MAX_DRAW_DEPTH, MAX_FOLDS_IN_A_ROW, MIN_PLAYING, START_SCORE, TRICKS_PER_ROUND, ZERO_PILES_PENALTY } from "../../utils/muushig/engine";
import { FORFEIT_ROUNDS, MIN_STAKED, STAKES } from "../../utils/stakes";
import { fmt } from "../../utils/poker/tiers";

const SECTIONS = [
  ["goal", "The goal"],
  ["cards", "Cards"],
  ["deal", "Dealer, deal, trump"],
  ["join", "Go in or fold"],
  ["swap", "Swapping cards"],
  ["tricks", "Playing tricks"],
  ["scoring", "Scoring"],
  ["cpus", "CPU levels"],
  ["credits", "Playing for credits"],
  ["xp", "XP, levels and gold"],
  ["controls", "Controls"],
];

// How each CPU level plays (utils/muushig/ai.js).
const LEVELS = [
  {
    id: "EASY",
    who: "A beginner",
    traits: [
      "Reads its hand roughly, and often goes in or folds when it shouldn't.",
      "Swaps away a random few of its dead cards.",
      "Doesn't count the cards played, and about one card in three it throws without thinking.",
    ],
  },
  {
    id: "MEDIUM",
    who: "A club player",
    traits: [
      "Weighs each card's chance to eat a pile and goes in when that beats the risk of the +5. Dealing, it counts the face-up trump: an ace there is a pile in the bag.",
      "Swaps the cards a fresh draw would likely beat.",
      "Counts every card played: leads the trumps nobody can beat, and eats with the cheapest card that holds.",
      "Fights hardest for its first pile: that one is worth 6 points.",
    ],
  },
  {
    id: "HARD",
    who: "A strong player",
    traits: [
      "Plays each choice out in its head against hundreds of deals of the cards it can't see.",
      "Deals them to fit what the table has shown: who couldn't follow suit, who couldn't go higher, who swapped few cards and so kept good ones.",
      "Plays to win the match, not the round: a point counts most near the finish, and it goes after whoever is about to win.",
    ],
  },
];

export default function MuushigRules({ onClose }) {
  return (
    <Rulebook
      title="HOW TO PLAY MUUSHIG"
      subtitle="Eat piles to count down to zero · 5 players"
      headerCards="7♣ J♥ K♠ A♦"
      sections={SECTIONS}
      onClose={onClose}
    >
      <Section id="goal" n={1} title="The goal">
        <p>
          Everyone starts on <Key>{START_SCORE} points</Key>. Winning a trick is called <Key>eating</Key> the pile, and every
          pile you eat takes a point off your score. The <Key>first player to reach 0 wins the match</Key>.
        </p>
        <p>
          Go in and eat nothing, and you <Hi color="#e85a7a">gain {ZERO_PILES_PENALTY} points</Hi>. So every hand is a
          choice: go in and fight for piles, or fold and sit it out.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
          {[
            ["5", "players"],
            ["5", "cards each"],
            ["32", "card deck"],
            [String(START_SCORE), "points to shed"],
          ].map(([big, small]) => (
            <div key={small} className="px-3 py-3 text-center" style={{ backgroundColor: "#14102a", boxShadow: "0 0 0 2px #1f1a3d" }}>
              <div className="font-pixel-display text-[18px] text-glow-gold">{big}</div>
              <div className="font-pixel-body text-[18px] text-bone/70 leading-none mt-1.5">{small}</div>
            </div>
          ))}
        </div>
        <p>
          A round goes: <Key>deal → go in or fold → swap cards → dealer takes the trump → {TRICKS_PER_ROUND} tricks →
          scoring</Key>.
        </p>
      </Section>

      <Section id="cards" n={2} title="Cards">
        <p>
          Only <Key>7 through Ace</Key> are used, in all four suits: 32 cards, no jokers.
        </p>
        <div className="overflow-x-auto py-2">
          <div className="min-w-max">
            <Cards spec="7♥ 8♥ 9♥ 10♥ J♥ Q♥ K♥ A♥" width={40} overlap={-0.1} />
          </div>
          <div className="flex justify-between font-pixel-display text-[10px] mt-2 min-w-max" style={{ width: 8 * 44 - 4 }}>
            <span className="text-bone/60">LOW</span>
            <span className="text-glow-gold">HIGH</span>
          </div>
        </div>
        <p>
          Suits have <Key>no order</Key>. A card only beats another card of the <Key>same suit</Key>, unless it's a{" "}
          <Key>trump</Key>: any trump beats any non-trump card.
        </p>
        <Versus win="7♣" lose="7♠" caption="clubs were led, so the 7♣ holds" />
      </Section>

      <Section id="deal" n={3} title="Dealer, deal, trump">
        <Steps
          items={[
            <>
              First round: everyone draws for the deal and the <Key>highest rank deals</Key>. After that the deal passes{" "}
              <Key>clockwise</Key>.
            </>,
            <>
              The dealer gives everyone <Key>5 cards</Key>.
            </>,
            <>
              The next card is turned <Key>face up</Key> and set on the table. Its suit is <Key>trump</Key> for the whole
              round.
            </>,
            <>
              The last <Key>6 cards</Key> are the <Key>draw pile</Key>.
            </>,
          ]}
        />
        <Callout tone="rule" title="DRAWING FOR THE DEAL">
          A shuffled pile sits in the middle. A <Key>random player</Key> draws first, then clockwise: pick how deep to go,
          from 1 to {MAX_DRAW_DEPTH} cards down, and take <Key>only that card</Key>; the cards above it stay on the pile.
          Every card is turned face up. The <Key>highest rank deals</Key>; tied players draw again. Every match starts with
          a new draw.
        </Callout>
        <p>
          The table also has a <Key>dead pile</Key>: every discarded card and every folded hand goes there face down, and
          never comes back this round.
        </p>
      </Section>

      <Section id="join" n={4} title="Go in or fold">
        <p>
          Starting <Key>left of the dealer</Key> and going clockwise (the dealer decides last), each player says whether they{" "}
          <Key>go in</Key> this round or <Key>fold</Key>.
        </p>
        <p>
          A folded hand goes to the dead pile and its player sits the round out. Their <Hi>score doesn't change</Hi>: a
          safe choice with a bad hand.
        </p>
        <Callout tone="rule" title={`AT LEAST ${MIN_PLAYING} MUST GO IN`}>
          When the players still to decide are needed to make {MIN_PLAYING}, they can't fold.
        </Callout>
        <Callout tone="rule" title={`NO ${MAX_FOLDS_IN_A_ROW + 1} FOLDS IN A ROW`}>
          Fold {MAX_FOLDS_IN_A_ROW} rounds in a row and you <Key>must go in</Key> on the next one, whatever your hand.
          Going in starts the count over.
        </Callout>
      </Section>

      <Section id="swap" n={5} title="Swapping cards">
        <p>
          Starting left of the dealer (skipping folded players, dealer last), each player may <Key>discard</Key> any
          number of cards onto the dead pile and <Key>draw</Key> the same number from the draw pile.
        </p>
        <p>
          You can't discard more cards than the draw pile holds. Once it's empty, the players after that can't swap, and
          the dead pile takes its spot on the table.
        </p>
        <Callout tone="tip" title="THE DEALER TAKES THE TRUMP">
          After everyone has swapped, a dealer who is playing may <Key>discard one card and take the face-up trump</Key>.
          Unless every card they hold is better than it, they should. Once it's taken, the table shows just the trump
          suit.
        </Callout>
      </Section>

      <Section id="tricks" n={6} title="Playing tricks">
        <p>
          The <Key>first trick</Key> is led by the first playing player left of the dealer. Each later trick is led by{" "}
          <Key>whoever ate the last one</Key>. Play goes clockwise, one card each.
        </p>
        <div className="flex flex-col gap-2">
          <CardRow
            name="FOLLOW THE LED SUIT"
            spec="9♠"
            text="If you hold the led suit, you must play it: a higher one than any on the table if you have it."
            extra="Holding the led suit, you can't trump in, even if someone else already has."
          />
          <CardRow
            name="NONE OF IT? TRUMP"
            spec="Q♦"
            text="Without the led suit, you must play a trump: a higher one than any trump on the table if you have it."
            extra="With neither the led suit nor a trump, play any card."
          />
        </div>
        <p>
          The table only lets you pick cards you may play: the rest of your hand is <Key>dimmed</Key>.
        </p>
        <p>
          The <Key>highest trump</Key> eats the pile. With no trump played, the <Key>highest card of the led suit</Key>{" "}
          does. A card of any other suit never wins.
        </p>
        <Versus win="8♦" lose="A♠" caption="with ♦ trump, even a small trump eats the ace" />
        <Callout tone="rule" title="THE STACK">
          The trick is stacked in the middle of the table. A card that <Key>beats the top card</Key> goes on top; anything
          weaker is tucked underneath. When everyone has played, <Key>whoever's card is on top eats the pile</Key>.
        </Callout>
      </Section>

      <Section id="scoring" n={7} title="Scoring">
        <p>
          Every round is exactly <Key>{TRICKS_PER_ROUND} tricks</Key>. When they're done:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full max-w-[520px] font-pixel-body text-[20px]" style={{ borderCollapse: "separate", borderSpacing: "0 4px" }}>
            <thead>
              <tr className="font-pixel-display text-[10px] text-bone/60 text-left">
                <th className="px-3 py-1 font-normal">PILES EATEN</th>
                <th className="px-3 py-1 font-normal">SCORE CHANGE</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["0 (and you went in)", `+${ZERO_PILES_PENALTY}`, "#e85a7a"],
                ["1", "-1", "#9bd14f"],
                ["3", "-3", "#9bd14f"],
                ["5 (round won)", "-5", "#9bd14f"],
                ["folded", "no change", "#c8b890"],
              ].map(([n, d, c]) => (
                <tr key={n} style={{ backgroundColor: "#14102a" }}>
                  <td className="px-3 py-1.5">{n}</td>
                  <td className="px-3 py-1.5" style={{ color: c }}>
                    {d}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Callout tone="rule" title="5 EATEN = ROUND WON">
          Eat <Key>all 5 piles</Key> and you <Key>win the round</Key>: you drop 5 points, and everyone else who went in ate
          nothing, so they all take <Hi color="#e85a7a">+{ZERO_PILES_PENALTY}</Hi>.
        </Callout>
        <p>
          The match ends after the first round in which someone reaches <Key>0 or less</Key>. The <Key>lowest score</Key>{" "}
          wins; on a tie, whoever ate more piles in that last round.
        </p>
      </Section>

      <Section id="cpus" n={8} title="CPU levels">
        <p>
          CPUs come in three levels. Pick one for a practice table; online, the host picks each CPU seat's level, and empty seats
          fill with <Key>MEDIUM</Key> CPUs when the game starts (<Key>HARD</Key> at a credit table). Every level goes in with a trump nobody can beat, the face-up one
          included when it deals.
        </p>
        <CpuLevels levels={LEVELS} />
        <Callout tone="rule" title="NO PEEKING">
          CPUs never see anyone's cards. They know only what you could know in their seat: their own hand and the cards they
          swapped away, the face-up trump, how many cards each player swapped, and what's been played.
        </Callout>
      </Section>

      <Section id="credits" n={9} title="Playing for credits">
        <p>
          On the lobby's <Key>CREDITS</Key> tab, signed-in players play for credits. Muushig is played for a stake: everyone at the
          table puts in <Key>the same amount</Key>, and <Key>the match winner takes the pot</Key>.
        </p>
        <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(140px,auto) 1fr" }}>
          {[
            ["STAKES", `LOW ${fmt(STAKES.LOW)} · MID ${fmt(STAKES.MID)} · HIGH ${fmt(STAKES.HIGH)}. The host picks one`],
            ["SITTING", "Your stake leaves your balance when you sit. Get up before the deal and it comes back"],
            ["STARTING", `At least ${MIN_STAKED} players with stakes in. Hard bots fill the empty seats`],
            ["THE POT", "Every player's stake. Bots put nothing in"],
            ["A TIE", "Level on score and on piles in the last round: the pot is split"],
          ].map(([k, v]) => (
            <React.Fragment key={k}>
              <div className="font-pixel-display text-[10px] text-parchment flex items-center">{k}</div>
              <div className="text-bone/80">{v}</div>
            </React.Fragment>
          ))}
        </div>
        <Callout tone="rule" title="A BOT WINS, THE POT IS LOST">
          If a bot wins the match, nobody gets the pot: those credits are gone.
        </Callout>
        <Callout tone="rule" title="LEAVING MID-MATCH">
          A Hard bot plays your seat and your stake stays in. Come back to the table and the seat is yours again, but once the
          bot has finished <Key>{FORFEIT_ROUNDS} rounds</Key> for you, the seat is the bot's: if it wins, the pot is lost.
        </Callout>
      </Section>

      <XpRules n={10} />

      <Section id="controls" n={11} title="Controls">
        <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(140px,auto) 1fr" }}>
          {[
            [<>DEPTH − / +</>, "Drawing for the deal: how deep into the pile to take your card (or ← →)"],
            [<>GO IN / FOLD</>, "Join the round or sit it out"],
            [<>Click cards</>, "Swapping: pick the cards to discard. Dealer: pick the card to give up for the trump"],
            [<>Click a card</>, "Tricks: pick the card to throw (dimmed cards can't be played right now)"],
            [<Kbd>SPACE</Kbd>, "The highlighted button: TAKE, GO IN, SWAP, TAKE TRUMP or THROW"],
            [<>SORT</>, "Arrange your hand by rank or by suit"],
          ].map(([k, v], i) => (
            <React.Fragment key={i}>
              <div className="font-pixel-display text-[10px] text-parchment flex items-center">{k}</div>
              <div className="text-bone/80">{v}</div>
            </React.Fragment>
          ))}
        </div>
        <Callout tone="tip" title="GOOD LUCK">
          One eaten pile beats none by six points, so don't go in with a hand that can't eat.
        </Callout>
      </Section>
    </Rulebook>
  );
}
