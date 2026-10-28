// BLACKJACK RULES — the Blackjack rulebook, opened from the table header and
// the main menu's RULES picker.
//
// Follows docs/blackjack-rulebook.md section by section, and the engine in
// utils/blackjack/ implements the same rules. If a rule changes, change all
// three. Examples are drawn with real PixelCards.

import React from "react";
import Rulebook, { Callout, CardRow, Hi, Key, Section, Steps, XpRules } from "../Rulebook";
import { CUT_CARD, DECKS, FREE_CHIPS, MAX_HANDS, MAX_SEATS, MIN_BET } from "../../utils/blackjack/rules";

const SECTIONS = [
  ["goal", "The goal"],
  ["round", "A round"],
  ["payouts", "Payouts"],
  ["moves", "Hit, stand, double and split"],
  ["insurance", "Insurance"],
  ["dealer", "The dealer"],
  ["bets", "Bets and chips"],
  ["credits", "Credit tables"],
  ["xp", "XP, levels and gold"],
];

export default function BlackjackRules({ onClose }) {
  return (
    <Rulebook title="HOW TO PLAY BLACKJACK" subtitle={`Against the dealer · up to ${MAX_SEATS} players`} headerCards="A♠ K♥" sections={SECTIONS} onClose={onClose}>
      <Section id="goal" n={1} title="The goal">
        <p>
          Beat the dealer. Get closer to <Key>21</Key> than the dealer without going over. Go over 21 and you <Hi color="#e85a7a">bust</Hi>: the hand loses at
          once, even if the dealer busts after you.
        </p>
        <p>
          Number cards count their number, J, Q and K count <Key>10</Key>, and an Ace counts <Key>11</Key> unless that would bust you, then <Key>1</Key>. You
          play against the dealer, not each other.
        </p>
        <CardRow name="BLACKJACK" spec="A♠ K♦" text="An Ace and a 10-value card as your first two cards." />
      </Section>

      <Section id="round" n={2} title="A round">
        <Steps
          items={[
            `Place your bet (at least ${MIN_BET}) and press DEAL. The round starts when everyone with a bet has pressed DEAL, or the betting time runs out. Skip betting and you sit the round out and keep your seat.`,
            "Everyone with a bet gets two cards. The dealer gets one card face up and one face down.",
            "If the dealer shows an Ace, you may take insurance first. If the dealer shows an Ace or a 10-value card, the dealer then peeks at the face-down card.",
            "Each hand takes its turn from the first seat on: HIT, STAND, DOUBLE or SPLIT. Run out of time and the hand stands.",
            "The dealer turns the face-down card over and draws. Every hand is then settled at once.",
          ]}
        />
        <p>
          The shoe is <Key>{DECKS} decks</Key>, shuffled by the server. Once about {Math.round((CUT_CARD / (DECKS * 52)) * 100)}% of it has been dealt, it is
          shuffled again before the next round. The count is never shown.
        </p>
      </Section>

      <Section id="payouts" n={3} title="Payouts">
        <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(140px,auto) 1fr" }}>
          {[
            ["WIN", "Pays 1:1: you win your bet, and get it back"],
            ["BLACKJACK", "Pays 3:2. A 21 made after a split is just 21, not a blackjack"],
            ["PUSH", "A tie. Your bet comes back. Your blackjack against the dealer's blackjack is a push"],
            ["LOSE", "You lose your bet"],
          ].map(([k, v]) => (
            <React.Fragment key={k}>
              <div className="font-pixel-display text-[10px] text-parchment flex items-center">{k}</div>
              <div className="text-bone/80">{v}</div>
            </React.Fragment>
          ))}
        </div>
      </Section>

      <Section id="moves" n={4} title="Hit, stand, double and split">
        <Steps
          items={[
            "HIT takes another card. STAND keeps your hand. A 21 stands on its own.",
            "DOUBLE: on any first two cards, including after a split (not on split Aces). You take one more card, then the hand stands. It costs your bet again.",
            `SPLIT: two cards of equal value (a K and a 10 count as a pair) become two hands, up to ${MAX_HANDS} hands. Each split costs your bet again.`,
            "Split Aces get one card each. They can't be hit or split again.",
            "You need the extra amount to double or split. Without it the button is greyed out.",
          ]}
        />
      </Section>

      <Section id="insurance" n={5} title="Insurance">
        <p>
          When the dealer shows an Ace, you are asked YES or NO, before the dealer peeks. Insurance costs <Key>half your bet</Key>, rounded down to a whole
          credit (and it isn't offered if that's 0). Insurance pays 2:1 if the dealer has blackjack, and is lost otherwise. No answer counts as NO.
        </p>
        <Callout tone="rule" title="DEALER BLACKJACK">
          The peek finds it, so the round ends before anyone plays. Only your original bet is lost, unless you have a blackjack too: that pushes.
        </Callout>
      </Section>

      <Section id="dealer" n={6} title="The dealer">
        <p>
          The dealer has no choices. They draw while they have less than 17 and <Key>stands on all 17s</Key>, soft 17 included. If every hand has already
          busted or is a blackjack, the dealer doesn't draw.
        </p>
      </Section>

      <Section id="bets" n={7} title="Bets and chips">
        <p>
          The smallest bet is <Key>{MIN_BET}</Key>. The most is your whole stack. At a free table you sit down with <Key>{FREE_CHIPS} chips</Key> that count
          for nothing outside it, and REBUY brings you back to {FREE_CHIPS} when you can't cover the minimum.
        </p>
      </Section>

      <Section id="credits" n={8} title="Credit tables">
        <p>
          Signed in, you can also play for <Key>credits</Key>, which stay with your account. Your bets, doubles, splits and insurance come out of your balance
          when you make them, and winnings go back in as soon as the round is settled.
        </p>
        <Steps
          items={[
            "You can sit at one credit table at a time, of any game.",
            "Leave mid-round and your hands stand where they are (insurance counts as NO); they settle with the round and the payout still reaches your balance.",
            "Five rounds in a row without a bet stands you up.",
            "The leaderboard ranks credits, and shows your Blackjack net beside Poker's.",
          ]}
        />
      </Section>

      <XpRules n={9} blackjack />
    </Rulebook>
  );
}
