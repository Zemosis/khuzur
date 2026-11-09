// KHUZUR RULES — the Khuzur rulebook, opened from the table header and the
// main menu's RULES picker.
//
// Follows docs/khuzur-rulebook.md section by section, and the engine in
// utils/khuzur/ implements the same rules. If a rule changes, change all
// three. Examples are drawn with real PixelCards.

import React from "react";
import Rulebook, { Callout, CardRow, Cards, CpuLevels, Hi, Key, Section, Steps, Versus, XpRules } from "../Rulebook";
import { MIN_STAKED, STAKES } from "../../utils/stakes";
import { fmt } from "../../utils/poker/tiers";
import { MAX_DRAW_DEPTH } from "../../utils/khuzur/engine";

const SECTIONS = [
  ["cards", "Cards"],
  ["table", "The table"],
  ["dealer", "The dealer"],
  ["deal", "Dealing and trump"],
  ["lead", "Leading"],
  ["beat", "Beating and picking up"],
  ["draw", "Drawing back up"],
  ["seven", "The trump 7"],
  ["out", "Going out and standings"],
  ["surrender", "Time limit and surrender"],
  ["online", "Playing online"],
  ["levels", "CPU levels"],
  ["credits", "Playing for credits"],
  ["xp", "XP, levels and gold"],
];

// How each CPU level plays (utils/khuzur/ai.js).
const LEVELS = [
  {
    id: "EASY",
    who: "A beginner",
    traits: ["Often leads a random card.", "Picks up about one stack in three it could have beaten."],
  },
  {
    id: "MEDIUM",
    who: "A steady player",
    traits: [
      "Leads its weakest cards and saves its trumps and jokers.",
      "Beats with the cheapest cards that hold, and picks up small stacks rather than spend a trump while there are cards to draw.",
    ],
  },
  {
    id: "HARD",
    who: "A strong player",
    traits: ["Plays each choice out many times against guesses of the cards it can't see.", "Picks the one that ends best for its team."],
  },
];

function Tiles({ items }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
      {items.map(([big, small]) => (
        <div key={small} className="px-3 py-3 text-center" style={{ backgroundColor: "#14102a", boxShadow: "0 0 0 2px #1f1a3d" }}>
          <div className="font-pixel-display text-[18px] text-glow-gold">{big}</div>
          <div className="font-pixel-body text-[18px] text-bone/70 leading-none mt-1.5">{small}</div>
        </div>
      ))}
    </div>
  );
}

export default function KhuzurRules({ onClose }) {
  return (
    <Rulebook
      title="HOW TO PLAY KHUZUR"
      subtitle="Beat every card or pick them up · empty your hand first · 2 to 6 players"
      headerCards="J♠ J♦ 9♣ GJ CJ"
      sections={SECTIONS}
      onClose={onClose}
    >
      <Section id="cards" n={1} title="Cards">
        <p>
          Lead cards at the next player, who must beat every one of them or pick the whole stack up. Every play refills your hand
          from the pile until it runs dry. Then it's a race: <Key>empty your hand first</Key>.
        </p>
        <Tiles
          items={[
            ["2-6", "players"],
            ["5 or 7", "cards each"],
            ["34 / 66", "cards in play"],
            ["1", "round a match"],
          ]}
        />
        <p>
          <Key>The 5-card game</Key> uses one deck of <Key>34 cards</Key>: 7 through Ace in all four suits, plus a{" "}
          <Key>gray joker</Key> and a <Key>colored joker</Key>. <Key>The 7-card game</Key> uses two decks, <Key>66 cards</Key>:
          every card from 7 to Ace twice, and still only one joker of each colour.
        </p>
        <div className="overflow-x-auto py-2">
          <div className="min-w-max">
            <Cards spec="7♦ 8♦ 9♦ 10♦ J♦ Q♦ K♦ A♦" width={40} overlap={-0.1} />
          </div>
        </div>
        <p>
          At the same rank the suit decides, lowest first: <Key>♦ ♣ ♥ ♠</Key>. From weakest to strongest every card falls in
          one line: <Key>plain cards</Key> by rank then suit, then <Key>trumps</Key> by rank, then the <Key>gray joker</Key>,
          then the <Key>colored joker</Key>. A card beats another only if it's <Key>strictly higher</Key>, so twins never beat
          each other.
        </p>
        <Versus win="8♦" lose="7♠" caption="a higher rank wins, whatever the suit" />
        <Versus win="9♠" lose="9♣" caption="same rank: the higher suit wins" />
        <Versus win="7♥" lose="A♠" caption="with hearts as trump, any trump beats any plain card" />
        <Versus win="GJ" lose="A♥" caption="the gray joker beats every trump" />
        <Versus win="CJ" lose="GJ" caption="nothing beats the colored joker" />
      </Section>

      <Section id="table" n={2} title="The table">
        <p>
          Play alone in a <Key>free for all</Key> of 2 to 6, or in teams: <Key>2v2</Key>, <Key>2v2v2</Key> or{" "}
          <Key>3v3</Key>. Teams <Key>alternate seats</Key>, so you never sit next to a teammate.
        </p>
        <p>
          Play goes <Key>clockwise</Key>: the next player is the one on your <Key>left</Key>. In the middle sit the face-up
          trump, the stack, the draw pile and the dead pile.
        </p>
      </Section>

      <Section id="dealer" n={3} title="The dealer">
        <Callout tone="rule" title="DRAWING FOR THE DEAL">
          At a new table everyone draws: pick how deep to go, from 1 to {MAX_DRAW_DEPTH} cards down, and take only that card.
          The <Key>highest card deals</Key>, by rank then suit. Players tied on twins draw again.
        </Callout>
        <p>
          After that, in a team game the <Key>last-place team deals</Key>, moving round its players clockwise. In a free for
          all the deal passes <Key>clockwise</Key>.
        </p>
      </Section>

      <Section id="deal" n={4} title="Dealing and trump">
        <Steps
          items={[
            <>
              The dealer deals <Key>one card at a time</Key>, clockwise from their left, until everyone has <Key>5</Key> (or{" "}
              <Key>7</Key>).
            </>,
            <>
              The next card is turned <Key>face up</Key>. Its suit is <Key>trump</Key>, and it sits under the draw pile as the{" "}
              <Key>last card drawn</Key>.
            </>,
            <>
              A joker can't be the trump card: it goes back into the <Key>middle of the pile</Key>, and the next card is turned
              instead.
            </>,
            <>The player on the dealer's left leads first.</>,
          ]}
        />
      </Section>

      <Section id="lead" n={5} title="Leading">
        <p>
          A lead is <Key>1, 3, 5 or 7 cards</Key>, and every card needs a <Key>partner of the same rank</Key>, except{" "}
          <Key>at most one</Key>: the lonely card, which can be anything.
        </p>
        <div className="flex flex-col gap-2">
          <CardRow name="1 CARD" spec="K♠" text="Any single card." />
          <CardRow name="3 CARDS" spec="J♠ J♦ 9♣" text="A pair and a lonely card. J J J works too." />
          <CardRow name="5 CARDS" spec="J♠ J♦ Q♣ Q♥ 9♣" text="Two pairs and a lonely card." extra="Four of a kind and one more, or three and a pair, work too." />
          <CardRow name="7 CARDS" spec="J♠ J♦ J♣ Q♣ Q♥ Q♠ 9♣" text="Two triples and one more, or three pairs and one more." />
          <CardRow name="WITH A JOKER" spec="10♠ 10♦ CJ" text="A joker never has a partner, so it can only be the lonely card." />
        </div>
        <Callout tone="warn" title="HOW MANY YOU CAN LEAD">
          Never more than the game's hand size, <Key>5</Key> or <Key>7</Key>, and never more than the{" "}
          <Key>smallest hand at the table</Key>, teammates included. If anyone holds 2 cards, every lead is a single card.
        </Callout>
      </Section>

      <Section id="beat" n={6} title="Beating and picking up">
        <p>
          After a lead, play goes clockwise. On your turn you <Key>beat</Key> or <Key>pick up</Key>.
        </p>
        <p>
          <Key>Beat</Key>: cover every card of the top layer, one card each, with a card that beats it. Your cards become the new
          top layer, and the next player must beat <Hi>your</Hi> cards. Teammates must beat each other too.
        </p>
        <p>
          <Key>Pick up</Key>: take the whole stack, every layer, into your hand, even if you could beat. The player on your left
          leads next.
        </p>
        <Callout tone="rule" title="ALL THE WAY ROUND">
          Once every other player has beaten it, the stack goes to the <Key>dead pile</Key> and the last player to beat it{" "}
          <Key>leads next</Key>.
        </Callout>
      </Section>

      <Section id="draw" n={7} title="Drawing back up">
        <p>
          Every time you lead or beat, you draw back up to <Key>5</Key> (or <Key>7</Key>) the moment your cards are down, before
          the next player moves. Picking up draws nothing. The face-up trump is the <Key>last card drawn</Key>; once the pile is
          empty, nobody draws again.
        </p>
      </Section>

      <Section id="seven" n={8} title="The trump 7">
        <p>
          Holding the <Key>7 of the trump suit</Key>, you may swap it for the face-up trump on any of your turns, while it's
          still on the table. Wait too long and someone may draw it first. Nothing swaps for a face-up 7.
        </p>
      </Section>

      <Section id="out" n={9} title="Going out and standings">
        <p>
          The moment your hand is <Key>empty</Key>, you're out, even in the middle of a stack. The stack carries on with the
          players still in.
        </p>
        <Steps
          items={[
            <>
              <Key>Free for all</Key>: first out is 1st, and the rest play on for 2nd, 3rd and so on. The last player holding cards
              is last.
            </>,
            <>
              <Key>2v2 and 3v3</Key>: the first player out wins for the whole team.
            </>,
            <>
              <Key>2v2v2</Key>: the first player out puts their team 1st, and the other two teams play on for 2nd.
            </>,
          ]}
        />
      </Section>

      <Section id="surrender" n={10} title="Time limit and surrender">
        <p>
          Online tables give you <Key>45 seconds</Key> a turn: run out while leading and the next player leads; run out while
          beating and you pick up. Practice tables have no timer.
        </p>
        <p>
          You can <Key>surrender</Key> at any time during play: you, or your whole team, take the <Key>lowest place left</Key>,
          your cards go to the dead pile, and the rest play on. With two teams, that ends the match.
        </p>
        <Callout tone="rule" title="TEAMS VOTE">
          In a team game online, every person on your team has to agree: SURRENDER asks your teammates, and any of them can press{" "}
          <Key>KEEP PLAYING</Key> to call it off. Bots don't vote.
        </Callout>
      </Section>

      <Section id="online" n={11} title="Playing online">
        <Steps
          items={[
            <>
              Host a table, public or private, then <Key>build it</Key> at the waiting table: players per team, teams, the deal.
            </>,
            <>
              Friends join from the open tables or with its code. At the waiting table, press <Key>SIT HERE</Key> on an empty
              seat to move there: your seat decides your team.
            </>,
            <>
              The host can seat CPUs. Seats still empty at START get a <Key>Medium</Key> CPU (<Key>Hard</Key> at a credit table).
            </>,
            <>
              Leave mid-match and a CPU plays your seat until you come back. <Key>PLAY AGAIN</Key> deals the next match: the
              last-place team deals.
            </>,
          ]}
        />
      </Section>

      <Section id="levels" n={12} title="CPU levels">
        <p>A CPU never sees anyone's cards: only its own hand, the trump, the cards played, and how many each player holds.</p>
        <CpuLevels levels={LEVELS} />
      </Section>

      <Section id="credits" n={13} title="Playing for credits">
        <p>
          On the lobby's <Key>CREDITS</Key> tab, signed-in players play for a stake: everyone puts in <Key>the same amount</Key>,
          and <Key>1st place takes the pot</Key>.
        </p>
        <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(140px,auto) 1fr" }}>
          {[
            ["STAKES", `LOW ${fmt(STAKES.LOW)} · MID ${fmt(STAKES.MID)} · HIGH ${fmt(STAKES.HIGH)}. The host picks one`],
            ["STARTING", `At least ${MIN_STAKED} players with stakes in. Hard bots fill the empty seats`],
            ["THE POT", "Every player's stake. Bots put nothing in"],
            ["1ST PLACE", "The people on the 1st-place team split the whole pot. 2nd and lower get nothing back"],
          ].map(([k, v]) => (
            <React.Fragment key={k}>
              <div className="font-pixel-display text-[10px] text-parchment flex items-center">{k}</div>
              <div className="text-bone/80">{v}</div>
            </React.Fragment>
          ))}
        </div>
        <Callout tone="rule" title="A BOT TEAM WINS, THE POT IS LOST">
          If nobody on the 1st-place team is a person still in their seat, nobody gets the pot. Leave mid-match and a Hard bot
          plays your seat; come back before the end and it's yours again, or it counts as the bot's.
        </Callout>
      </Section>

      <XpRules n={14} />
    </Rulebook>
  );
}
