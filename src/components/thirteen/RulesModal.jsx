// RULES MODAL — the Thirteen rulebook, opened from the table header.
//
// Every rule here mirrors utils/handEvaluator.js and utils/gameLogic.js (the
// server runs the same files); if a rule changes there, change it here and in
// docs/thirteen-rulebook.md. Examples are drawn with real PixelCards.

import React, { useEffect, useRef, useState } from "react";
import { PixelCard } from "../PixelCard";
import PixelIcon from "../PixelIcon";
import { GAME_SETTINGS } from "../../utils/constants";

const OUT_AT = GAME_SETTINGS.ELIMINATION_SCORE;
const DOUBLE_AT = GAME_SETTINGS.PENALTY_THRESHOLD;

const SECTIONS = [
  ["goal", "The goal"],
  ["order", "Card order"],
  ["turns", "Playing a round"],
  ["combos", "Combinations"],
  ["five", "5-card hands"],
  ["ties", "Breaking ties"],
  ["scoring", "Scoring"],
  ["controls", "Controls"],
];

// "10♥ J♥" → card objects for PixelCard.
const parse = (spec) =>
  spec.split(" ").map((c) => ({ rank: c.slice(0, -1), suit: c.slice(-1), id: c }));

function Cards({ spec, width = 44, overlap = 0.42, dim = false }) {
  const cards = parse(spec);
  return (
    <div className="flex items-end shrink-0" style={{ opacity: dim ? 0.45 : 1 }}>
      {cards.map((c, i) => (
        <div key={c.id + i} style={{ marginLeft: i ? -width * overlap : 0 }}>
          <PixelCard rank={c.rank} suit={c.suit} width={width} />
        </div>
      ))}
    </div>
  );
}

// Inline highlights: gold = key term, cyan = tip, rose = warning.
const Key = ({ children }) => (
  <strong className="font-normal px-1" style={{ color: "#f4c430", backgroundColor: "rgba(244,196,48,0.14)", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
    {children}
  </strong>
);
const Hi = ({ children, color = "#5fd4d6" }) => <span style={{ color }}>{children}</span>;

function Callout({ tone = "tip", title, children }) {
  const t = {
    tip: { c: "#5fd4d6", bg: "rgba(95,212,214,0.08)", icon: "star" },
    warn: { c: "#e85a7a", bg: "rgba(232,90,122,0.08)", icon: "skull" },
    rule: { c: "#f4c430", bg: "rgba(244,196,48,0.08)", icon: "crown" },
  }[tone];
  return (
    <div className="px-4 py-3 my-4" style={{ backgroundColor: t.bg, boxShadow: `inset 4px 0 0 ${t.c}` }}>
      <div className="flex items-center gap-2 font-pixel-display text-[10px] tracking-wider mb-1.5" style={{ color: t.c }}>
        <PixelIcon name={t.icon} size={12} />
        {title}
      </div>
      <div className="font-pixel-body text-[20px] leading-snug text-parchment">{children}</div>
    </div>
  );
}

function Section({ id, n, title, children }) {
  return (
    <section id={`rule-${id}`} data-rule={id} className="scroll-mt-4 pb-8 mb-8" style={{ borderBottom: "3px solid #1f1a3d" }}>
      <h2 className="flex items-baseline gap-3 mb-4">
        <span className="font-pixel-display text-[12px] text-bone/40">{String(n).padStart(2, "0")}</span>
        <span className="font-pixel-display text-[16px] text-glow-gold tracking-wide">{title}</span>
      </h2>
      <div className="font-pixel-body text-[21px] leading-snug text-parchment/90 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function ComboRow({ name, spec, beats, extra }) {
  return (
    <div className="flex items-center gap-5 px-4 py-3" style={{ backgroundColor: "#14102a", boxShadow: "0 0 0 2px #1f1a3d" }}>
      <div className="w-[150px] shrink-0 flex justify-center">
        <Cards spec={spec} />
      </div>
      <div className="min-w-0">
        <div className="font-pixel-display text-[12px] text-parchment mb-1">{name}</div>
        <div className="font-pixel-body text-[20px] leading-tight text-bone/80">{beats}</div>
        {extra && <div className="font-pixel-body text-[18px] leading-tight text-bone/60 mt-1">{extra}</div>}
      </div>
    </div>
  );
}

function Versus({ win, lose, caption }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Cards spec={win} />
      <span className="font-pixel-display text-[10px] text-glow-gold">BEATS</span>
      <Cards spec={lose} dim />
      {caption && <span className="font-pixel-body text-[19px] text-bone/70">{caption}</span>}
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd
      className="font-pixel-display text-[10px] px-2 py-1 mx-0.5"
      style={{ backgroundColor: "#ead8b1", color: "#1a1024", boxShadow: "inset 0 -3px 0 #a89870" }}
    >
      {children}
    </kbd>
  );
}

export default function RulesModal({ onClose }) {
  const scrollRef = useRef(null);
  const closeRef = useRef(null);
  const [active, setActive] = useState(SECTIONS[0][0]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Highlight the section being read in the side nav.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.dataset.rule);
      },
      { root, rootMargin: "0px 0px -65% 0px" },
    );
    root.querySelectorAll("[data-rule]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const jump = (id) => {
    const root = scrollRef.current;
    const el = root?.querySelector(`#rule-${id}`);
    if (el) root.scrollTo({ top: el.offsetTop - 16, behavior: "smooth" });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4"
      style={{ backgroundColor: "rgba(10,7,18,0.82)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        className="flex flex-col w-full max-w-[1080px] h-full max-h-[880px]"
        style={{ backgroundColor: "#110d22", border: "4px solid #0a0712", boxShadow: "0 0 0 4px #463a78, 8px 8px 0 #0a0712" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-2 shrink-0" style={{ minHeight: 64, backgroundColor: "#1a1024", borderBottom: "4px solid #0a0712" }}>
          <span className="text-glow-gold max-sm:hidden">
            <PixelIcon name="book" size={24} />
          </span>
          <div className="flex-1 min-w-0">
            <h1 id="rules-title" className="font-pixel-display text-[12px] sm:text-[16px] leading-snug text-glow-gold tracking-wider">
              HOW TO PLAY THIRTEEN
            </h1>
            <div className="font-pixel-body text-[18px] text-bone/60 leading-none mt-1">Shed every card before anyone else · 4 players</div>
          </div>
          <div className="hidden md:flex items-end">
            <Cards spec="3♦ 7♣ Q♥ 2♠" width={34} overlap={0.3} />
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="pixel-btn font-pixel-display text-[10px] px-3 py-2 flex items-center gap-2 shrink-0"
            style={{ backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" }}
          >
            <PixelIcon name="close" size={12} /> <span className="max-sm:sr-only">CLOSE</span>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Side nav */}
          <nav className="hidden md:flex flex-col gap-1 p-3 w-[210px] shrink-0 overflow-y-auto" style={{ backgroundColor: "#0e0a1f", borderRight: "4px solid #0a0712" }} aria-label="Rule sections">
            {SECTIONS.map(([id, label], i) => {
              const on = active === id;
              return (
                <button
                  key={id}
                  onClick={() => jump(id)}
                  aria-current={on ? "true" : undefined}
                  className="pixel-hbtn text-left flex items-center gap-2 px-3 py-2"
                  style={{ backgroundColor: on ? "#2e1a3a" : "transparent", boxShadow: on ? "inset 3px 0 0 #f4c430" : "none" }}
                >
                  <span className="font-pixel-display text-[10px]" style={{ color: on ? "#f4c430" : "#6b5a9a" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-pixel-body text-[20px] leading-none" style={{ color: on ? "#ead8b1" : "#a89cc8" }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div ref={scrollRef} className="relative flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 md:px-10 py-6 sm:py-8">
            <Section id="goal" n={1} title="The goal">
              <p>
                Be the <Key>first to play every card</Key> in your hand. Each round, everyone else scores points for the
                cards they're still holding — and <Hi color="#e85a7a">points are bad</Hi>.
              </p>
              <p>
                Reach <Key>{OUT_AT} points</Key> and you're eliminated. The <Key>last player standing wins the match</Key>.
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
                {[
                  ["4", "players"],
                  ["13", "cards each"],
                  ["52", "card deck, no jokers"],
                  [String(OUT_AT), "points = out"],
                ].map(([big, small]) => (
                  <div key={small} className="px-3 py-3 text-center" style={{ backgroundColor: "#14102a", boxShadow: "0 0 0 2px #1f1a3d" }}>
                    <div className="font-pixel-display text-[18px] text-glow-gold">{big}</div>
                    <div className="font-pixel-body text-[18px] text-bone/70 leading-none mt-1.5">{small}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="order" n={2} title="Card order">
              <p>
                Ranks go from <Key>3 (lowest)</Key> up to <Key>2 (highest)</Key>. Yes — the 2 is the best card in the game.
              </p>
              <div className="overflow-x-auto py-2">
                <div className="flex items-end gap-1 min-w-max">
                  {parse("3♠ 4♠ 5♠ 6♠ 7♠ 8♠ 9♠ 10♠ J♠ Q♠ K♠ A♠ 2♠").map((c) => (
                    <PixelCard key={c.id} rank={c.rank} suit={c.suit} width={40} />
                  ))}
                </div>
                <div className="flex justify-between font-pixel-display text-[10px] mt-2 min-w-max" style={{ width: 13 * 44 - 4 }}>
                  <span className="text-bone/60">LOW</span>
                  <span className="text-glow-gold">HIGH</span>
                </div>
              </div>
              <p>
                When ranks match, the <Key>suit decides</Key>: <Hi color="#e85a7a">♦ Diamonds</Hi> &lt; ♣ Clubs &lt;{" "}
                <Hi color="#e85a7a">♥ Hearts</Hi> &lt; ♠ Spades.
              </p>
              <Versus win="7♠" lose="7♥" caption="same rank, spades is the higher suit" />
              <Callout tone="rule" title="STRONGEST CARD">
                The <Key>2♠</Key> beats every other single card. The <Key>3♦</Key> is the weakest.
              </Callout>
            </Section>

            <Section id="turns" n={3} title="Playing a round">
              <ol className="flex flex-col gap-3">
                {[
                  <>
                    Everyone is dealt <Key>13 cards</Key>. In the first round, whoever holds the <Key>3♦</Key> leads. In later
                    rounds, <Key>the last round's winner</Key> leads.
                  </>,
                  <>
                    The leader plays <Key>any combination</Key> — a single, a pair, a straight… This starts a <Key>trick</Key>.
                  </>,
                  <>
                    Going clockwise, each player must either play a <Key>higher combination of the same kind</Key> (same number
                    of cards) or <Key>pass</Key>.
                  </>,
                  <>
                    Once everyone else passes <Key>in a row</Key>, the player who played last <Key>takes the trick</Key>, the
                    table clears, and they lead a fresh one with anything they like.
                  </>,
                  <>
                    The first player to empty their hand <Key>wins the round</Key>.
                  </>,
                ].map((text, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="font-pixel-display text-[11px] shrink-0 w-7 h-7 flex items-center justify-center" style={{ backgroundColor: "#f4c430", color: "#1a1024" }}>
                      {i + 1}
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>
              <Callout tone="warn" title="PASSING SKIPS ONE TURN">
                If you pass, you <Key>can't play until your turn comes around again</Key>. Then you choose again: play or
                pass. So think before you move. The leader of a trick can't pass: they must play something.
              </Callout>
            </Section>

            <Section id="combos" n={4} title="Combinations">
              <p>
                You can play <Key>1, 2, 3, 4 or 5 cards</Key> at once. A combination can only be beaten by the{" "}
                <Key>same kind</Key> — a pair by a higher pair, a triple by a higher triple.
              </p>
              <div className="flex flex-col gap-2">
                <ComboRow name="SINGLE" spec="9♥" beats="Any one card. Beaten by a higher single." />
                <ComboRow name="PAIR" spec="J♣ J♠" beats="Two cards of the same rank. Beaten by a higher pair." />
                <ComboRow name="TRIPLE" spec="5♦ 5♥ 5♠" beats="Three of the same rank. Beaten by a higher triple." />
                <ComboRow name="FOUR OF A KIND" spec="8♦ 8♣ 8♥ 8♠" beats="All four of one rank. Beaten only by a higher four of a kind." />
              </div>
              <Callout tone="warn" title="NO BOMBS">
                Four of a kind <Key>doesn't cut</Key> other plays: it can't be played on a single 2 or a pair of 2s. It only
                beats another four of a kind.
              </Callout>
            </Section>

            <Section id="five" n={5} title="5-card hands">
              <p>
                Five-card plays are poker hands. Unlike smaller plays, <Key>any 5-card hand can beat a weaker 5-card hand of a
                different type</Key> — a flush beats any straight.
              </p>
              <div className="flex flex-col gap-2">
                <ComboRow
                  name="1 · STRAIGHT"
                  spec="6♣ 7♦ 8♠ 9♥ 10♣"
                  beats="Five ranks in a row, any suits."
                  extra="2 counts as the top card, so J-Q-K-A-2 is the highest straight. Only A and 2 wrap around: A-2-3-4-5 and 2-3-4-5-6 are the two lowest straights. K-A-2-3-4 is not a straight."
                />
                <ComboRow name="2 · FLUSH" spec="3♥ 7♥ 9♥ J♥ K♥" beats="Any five cards of one suit." />
                <ComboRow name="3 · FULL HOUSE" spec="Q♦ Q♣ Q♠ 4♥ 4♠" beats="A triple plus a pair." />
                <ComboRow name="4 · STRAIGHT FLUSH" spec="5♠ 6♠ 7♠ 8♠ 9♠" beats="A straight, all in one suit." />
                <ComboRow name="5 · ROYAL FLUSH" spec="10♦ J♦ Q♦ K♦ A♦" beats="10-J-Q-K-A of one suit. The best hand in the game." />
              </div>
              <Callout tone="tip" title="STRAIGHTS ARE ALWAYS 5">
                Runs longer or shorter than five cards aren't valid plays here — a straight is exactly <Key>5 cards</Key>.
              </Callout>
            </Section>

            <Section id="ties" n={6} title="Breaking ties">
              <p>When two plays are the same kind, compare them like this:</p>
              <ul className="flex flex-col gap-2 pl-1">
                <li>
                  <Key>Singles, pairs, triples, fours</Key> — higher rank wins; on the same rank, the play holding the{" "}
                  <Hi>highest suit</Hi> wins.
                </li>
                <li>
                  <Key>Straights</Key> — compare the <Hi>highest card</Hi>, then its suit. In A-2-3-4-5 and 2-3-4-5-6 the
                  highest card is the 5 or the 6.
                </li>
                <li>
                  <Key>Flushes</Key> — the <Hi>higher suit</Hi> wins, whatever the cards; on the same suit, the highest card.
                </li>
                <li>
                  <Key>Full houses</Key> — the <Hi>triple's rank</Hi> decides.
                </li>
              </ul>
              <div className="flex flex-col gap-4 mt-2">
                <Versus win="K♣ K♠" lose="K♦ K♥" caption="the pair with the spade wins" />
                <Versus win="7♦ 8♦ 9♣ 10♥ J♠" lose="6♠ 7♠ 8♥ 9♣ 10♠" caption="J high beats 10 high" />
                <Versus win="3♣ 5♣ 7♣ 9♣ J♣" lose="4♦ 6♦ 8♦ 10♦ A♦" caption="clubs beat diamonds, whatever the cards" />
              </div>
            </Section>

            <Section id="scoring" n={7} title="Scoring">
              <p>
                When someone goes out, <Key>everyone else scores 1 point per card</Key> left in their hand. The winner scores
                nothing.
              </p>
              <Callout tone="warn" title={`${DOUBLE_AT}+ CARDS = DOUBLE`}>
                Caught with <Key>{DOUBLE_AT} or more cards</Key>? Your points are <Key>doubled</Key>. Holding 11 cards costs
                you 22.
              </Callout>
              <div className="overflow-x-auto">
                <table className="w-full max-w-[520px] font-pixel-body text-[20px]" style={{ borderCollapse: "separate", borderSpacing: "0 4px" }}>
                  <thead>
                    <tr className="font-pixel-display text-[10px] text-bone/60 text-left">
                      <th className="px-3 py-1 font-normal">CARDS LEFT</th>
                      <th className="px-3 py-1 font-normal">POINTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["0 (you won)", "0"],
                      ["3", "3"],
                      ["9", "9"],
                      ["10", "20"],
                      ["13 (never played)", "26 — out"],
                    ].map(([left, pts]) => (
                      <tr key={left} style={{ backgroundColor: "#14102a" }}>
                        <td className="px-3 py-1.5">{left}</td>
                        <td className="px-3 py-1.5 text-glow-gold">{pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Points add up across rounds. At <Key>{OUT_AT} or more</Key> you're <Hi color="#e85a7a">eliminated</Hi> and sit
                out the rest of the match. When only one player is left, <Key>they win the match</Key> and a rematch can start.
              </p>
            </Section>

            <Section id="controls" n={8} title="Controls">
              <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(140px,auto) 1fr" }}>
                {[
                  [<>Click a card</>, "Select or deselect it"],
                  [<><Kbd>SHIFT</Kbd> + click</>, "Select every card between"],
                  [<Kbd>SPACE</Kbd>, "Play the selected cards"],
                  [<Kbd>P</Kbd>, "Pass"],
                  [<>SORT</>, "Arrange your hand by rank or by suit"],
                  [<>CLEAR / ALL</>, "Deselect everything / select every card"],
                ].map(([k, v], i) => (
                  <React.Fragment key={i}>
                    <div className="font-pixel-display text-[10px] text-parchment flex items-center">{k}</div>
                    <div className="text-bone/80">{v}</div>
                  </React.Fragment>
                ))}
              </div>
              <Callout tone="tip" title="GOOD LUCK">Save your 2s — they win the tricks that matter.</Callout>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
