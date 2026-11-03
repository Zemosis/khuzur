// The Muushig table, driven like a player would: the page is opened on a real
// engine state at each step of a round (draw for the deal, go in or fold, swap,
// take the trump, play) and the status line and buttons are checked, then used.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import GameMuushig from "../../src/pages/muushig/GameMuushig";
import { seededRandom } from "../helpers/cards.js";

// The page opens on whatever state `start.state` holds (or a real new match).
const { start, reportSoloMatch } = vi.hoisted(() => ({ start: { state: null }, reportSoloMatch: vi.fn() }));
vi.mock("../../src/utils/muushig/engine", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, createMatch: (opts) => start.state ?? real.createMatch(opts) };
});
vi.mock("../../src/lib/soloMatches", () => ({ reportSoloMatch }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ identity: { name: "TESTER", tag: "0001", avatar: "1", customAvatar: null } }),
}));

const E = await vi.importActual("../../src/utils/muushig/engine.js");
const { PHASES } = E;
const PLAYERS = [{ name: "TESTER", type: "HUMAN" }, ...["Bot Saturn", "Bot Venus", "Bot Mars", "Bot Jupiter"].map((name) => ({ name, type: "AI", level: "MEDIUM" }))];

/** A dealt first round (seeded), then adjusted: whose deal, whose turn, … */
function dealt(over = {}) {
  const rng = seededRandom(3);
  let s = E.createMatch({ players: PLAYERS, rng });
  while (s.phase === PHASES.DRAW) s = E.drawForDeal(s, s.turn, 1, rng);
  return { ...s, ...over };
}
const allIn = (s) => {
  while (s.phase === PHASES.DECIDE) s = E.decide(s, s.turn, true);
  return s;
};
/** Everyone in, everyone keeps their hand, up to your turn in `phase`. */
function upTo(phase, dealer) {
  let s = allIn(dealt({ dealer, turn: E.leftOf(dealer) }));
  while (s.phase !== phase || s.turn !== 0) {
    if (s.phase === PHASES.SWAP) s = E.swap(s, s.turn, []);
    else if (s.phase === PHASES.TRUMP) s = E.takeTrump(s, s.turn, null);
  }
  return s;
}

const openTable = (state) => {
  start.state = state;
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/game-muushig", state: { lobbyId: "SOLO-TEST01", playerName: "TESTER #0001" } }]}>
      <Routes>
        <Route path="/game-muushig" element={<GameMuushig />} />
        <Route path="/" element={<div>MAIN MENU</div>} />
      </Routes>
    </MemoryRouter>,
  );
};
// The draw for the deal, the dealer banner and the deal play out first.
const SETTLE = { timeout: 10_000 };
// The phase's main button also reads "(SPACE)": it fires on the space bar too.
const named = (label) => new RegExp(`^${label.replace(/[()]/g, "\\$&")}(\\(SPACE\\))?$`);
const button = (label, opts = SETTLE) => screen.findByRole("button", { name: named(label) }, opts);
const getButton = (label) => screen.getByRole("button", { name: named(label) });
const queryButton = (label) => screen.queryByRole("button", { name: named(label) });
const status = () => screen.getByRole("status");
const cardEl = (id) => document.querySelector(`[aria-label="Your hand"] [data-card-id="${id}"]`);
const pickCard = (user, id) => user.click(cardEl(id).firstChild.firstChild);

beforeEach(() => {
  start.state = null;
  reportSoloMatch.mockClear();
});

describe("GameMuushig", () => {
  it("opens with the draw for the deal; on your draw you pick a depth and take it", async () => {
    const user = userEvent.setup();
    openTable(E.createMatch({ players: PLAYERS, rng: () => 0 })); // you draw first
    const take = await button("TAKE");
    expect(status()).toHaveTextContent(`take any card 1 to ${E.MAX_DRAW_DEPTH} down`);
    await user.click(take);
    expect(queryButton("TAKE")).not.toBeInTheDocument();
    expect(status()).toHaveTextContent(/Bot Saturn is drawing/);
  }, 20_000);

  it("go in or fold: GO IN tells the table and hands the turn on", async () => {
    const user = userEvent.setup();
    openTable(dealt({ dealer: 4, turn: 0 }));
    const goIn = await button("GO IN");
    expect(status()).toHaveTextContent("Go in this round, or fold and sit it out?");
    expect(getButton("FOLD")).toBeEnabled();
    await user.click(goIn);
    expect(status()).toHaveTextContent("Bot Saturn is deciding...");
  }, 20_000);

  it("folding puts your hand away", async () => {
    const user = userEvent.setup();
    openTable(dealt({ dealer: 4, turn: 0 }));
    await user.click(await button("FOLD"));
    expect(document.querySelectorAll('[aria-label="Your hand"] [data-card-id]')).toHaveLength(0);
    expect(screen.getByLabelText("Your hand")).toHaveTextContent("YOU FOLDED — SITTING OUT THIS ROUND");
    expect(status()).toHaveTextContent("Bot Saturn is deciding...");
  }, 20_000);

  it("throwing your last card empties the hand without claiming a win", async () => {
    // The round's last trick; nobody reaches 0, so the match goes on.
    const s = upTo(PHASES.PLAY, 4);
    const players = s.players.map((p) => ({ ...p, score: 9, hand: [p.hand[0]] }));
    openTable({ ...s, players, trickNumber: E.TRICKS_PER_ROUND });
    const user = userEvent.setup();
    const thrw = await button("THROW");
    await pickCard(user, players[0].hand[0].id);
    await user.click(thrw);
    expect(screen.getByLabelText("Your hand")).toHaveTextContent("ALL CARDS PLAYED");
    expect(screen.getByLabelText("Your hand")).not.toHaveTextContent(/YOU WIN/);
  }, 20_000);

  it("after folding 2 rounds in a row, FOLD is locked and the line says why", async () => {
    const s = dealt({ dealer: 4, turn: 0 });
    s.players = s.players.map((p, i) => (i === 0 ? { ...p, foldStreak: E.MAX_FOLDS_IN_A_ROW } : p));
    openTable(s);
    await button("GO IN");
    expect(getButton("FOLD")).toBeDisabled();
    expect(status()).toHaveTextContent(`You folded the last ${E.MAX_FOLDS_IN_A_ROW} rounds: this time you must go in.`);
  }, 20_000);

  it("when you're needed to make 2 players, FOLD is locked", async () => {
    // You deal, so you decide last: three fold, the fourth has to go in, and
    // you're the only one left to make 2.
    let s = dealt({ dealer: 0, turn: 1 });
    for (let i = 0; i < 3; i++) s = E.decide(s, s.turn, false);
    s = E.decide(s, 4, true);
    expect(s.turn).toBe(0);
    openTable(s);
    await button("GO IN");
    expect(getButton("FOLD")).toBeDisabled();
    expect(status()).toHaveTextContent("You must go in: at least 2 players are needed.");
  }, 20_000);

  it("swapping: KEEP ALL, or pick cards and SWAP that many", async () => {
    const user = userEvent.setup();
    const s = upTo(PHASES.SWAP, 4);
    openTable(s);
    await button("KEEP ALL");
    expect(status()).toHaveTextContent(`Pick up to 5 cards to swap. The draw pile has ${s.drawPile.length}.`);
    const [a, b] = s.players[0].hand;
    await pickCard(user, a.id);
    await pickCard(user, b.id);
    await user.click(getButton("SWAP 2"));
    expect(status()).toHaveTextContent("Bot Saturn is swapping...");
  }, 20_000);

  it("the dealer's trump: KEEP HAND, or pick a card to give up and TAKE TRUMP", async () => {
    const user = userEvent.setup();
    const s = upTo(PHASES.TRUMP, 0);
    openTable(s);
    const take = await button("TAKE TRUMP");
    expect(take).toBeDisabled();
    expect(getButton("KEEP HAND")).toBeEnabled();
    const give = s.players[0].hand[0];
    await pickCard(user, give.id);
    expect(take).toBeEnabled();
    await user.click(take);
    expect(cardEl(s.trumpCard.id)).not.toBeNull();
    expect(status()).toHaveTextContent("Waiting for Bot Saturn...");
  }, 20_000);

  it("your lead: THROW waits for a card, then plays it", async () => {
    const user = userEvent.setup();
    const s = upTo(PHASES.PLAY, 4);
    openTable(s);
    const thrw = await button("THROW");
    expect(status()).toHaveTextContent("Your lead. Throw any card.");
    expect(thrw).toBeDisabled();
    const card = s.players[0].hand[0];
    await pickCard(user, card.id);
    await user.click(thrw);
    expect(status()).toHaveTextContent("Waiting for Bot Saturn...");
    expect(cardEl(card.id)).toBeNull();
  }, 20_000);

  /** Your turn after seat 4 led `ledId`, holding `handIds` (L = led suit, T = trump, O = another suit). */
  function following(handIds, ledId) {
    const s = upTo(PHASES.PLAY, 4);
    const [L, O] = E.SUITS.filter((x) => x !== s.trumpSuit);
    const card = (id) => E.makeCard(id.slice(0, -1), { L, T: s.trumpSuit, O }[id.slice(-1)]);
    s.players = s.players.map((p, i) => (i === 0 ? { ...p, hand: handIds.map(card) } : p));
    return { ...s, trick: [{ seat: 4, card: card(ledId) }], turn: 0, cards: handIds.map(card) };
  }
  const isDim = (id) => cardEl(id).querySelector(".pixel-card").classList.contains("dim");

  it("following: you must play the led suit, higher if you can; the rest is dimmed and locked", async () => {
    const user = userEvent.setup();
    const s = following(["7L", "AL", "KT", "9O"], "10L");
    const [low, high, trump, other] = s.cards;
    openTable(s);
    const thrw = await button("THROW");
    expect(status()).toHaveTextContent("is eating. Follow");
    expect([low, high, trump, other].map((c) => isDim(c.id))).toEqual([true, false, true, true]);
    await pickCard(user, trump.id); // a trump isn't allowed while you hold the led suit
    expect(thrw).toBeDisabled();
    await pickCard(user, high.id);
    expect(thrw).toBeEnabled();
  }, 20_000);

  it("following without the led suit: you must trump", async () => {
    const s = following(["KT", "8T", "9O"], "10L");
    const [k, eight, other] = s.cards;
    openTable(s);
    await button("THROW");
    expect(status()).toHaveTextContent("you must trump");
    expect([k, eight, other].map((c) => isDim(c.id))).toEqual([false, false, true]);
  }, 20_000);

  it("RULES opens the Muushig rulebook", async () => {
    const user = userEvent.setup();
    openTable(dealt({ dealer: 4, turn: 0 }));
    await user.click(screen.getByRole("button", { name: /rules/i }));
    expect(screen.getByRole("dialog", { name: "HOW TO PLAY MUUSHIG" })).toBeInTheDocument();
  });

  it("reports a finished match for your stats once it ends", async () => {
    // One trick from the end: you lead the last card and reach 0.
    const s = upTo(PHASES.PLAY, 4);
    const players = s.players.map((p, i) => ({ ...p, score: i === 0 ? 1 : 9, eaten: i === 0 ? 4 : 0, hand: [p.hand[0]] }));
    openTable({ ...s, players, trickNumber: E.TRICKS_PER_ROUND });
    expect(reportSoloMatch).not.toHaveBeenCalled();
    const user = userEvent.setup();
    const thrw = await button("THROW");
    await pickCard(user, players[0].hand[0].id);
    await user.click(thrw);
    // The CPUs play their last cards and the match is scored.
    await act(async () => {});
    await screen.findByText("MATCH OVER", {}, { timeout: 15_000 });
    expect(reportSoloMatch).toHaveBeenCalledTimes(1);
    const report = reportSoloMatch.mock.calls[0][0];
    expect(report).toMatchObject({ gameType: "muushig", me: 0, rounds: 1 });
    expect(report.matchId).toMatch(/^MU-[A-Z0-9]+-1$/);
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "REMATCH" })).toBeInTheDocument();
  }, 30_000);
});
