// The blackjack table page: real engine states go through the engine's own
// view function, as the server sends them, and the page answers with bj_ events.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import GameBlackjack from "../../src/pages/blackjack/GameBlackjack";
import {
  act as play,
  closeBetting,
  createTable,
  deal,
  dealerStep,
  openBetting,
  placeBet,
  setBankroll,
  setReady,
  sit,
  viewFor,
} from "../../src/utils/blackjack/engine.js";
import { eventEntry, withContext } from "../../src/utils/blackjack/log.js";
import { cards, riggedShoe } from "../helpers/blackjack.js";

const { handlers, fakeSocket } = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
    fakeSocket: {
      connected: true,
      id: "sock-1",
      on: (ev, fn) => (handlers[ev] ||= new Set()).add(fn),
      off: (ev, fn) => handlers[ev]?.delete(fn),
      emit: vi.fn(),
      timeout: () => ({ emit: () => {} }),
    },
  };
});
vi.mock("../../src/utils/socket", () => ({ socket: fakeSocket, connectSocket: () => Promise.resolve() }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ identity: { name: "ME", tag: "0003", avatar: "2", customAvatar: null } }),
}));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, ping: 42 }) }));

const LOBBY = "PUB-BJ0001";
const NAMES = ["ME #0003", "ANN #0001", "BOB #0002"];
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));
const emitted = (ev) => fakeSocket.emit.mock.calls.filter(([e]) => e === ev).map(([, d]) => d);

/** A table with NAMES[i] at seat i for each bankroll given (null: empty), you at seat 0. */
function table(bankrolls, { credit = false, shoe } = {}) {
  let s = createTable({ credit, shoe: shoe && riggedShoe(shoe) });
  bankrolls.forEach((b, i) => {
    if (b != null) s = sit(s, i, { name: NAMES[i], bankroll: b });
  });
  return s;
}
/** Bets per seat ({ seat: amount }), everyone ready, the cards dealt. */
function dealtWith(s, bets) {
  s = openBetting(s);
  for (const [seat, amount] of Object.entries(bets)) s = setReady(placeBet(s, Number(seat), amount), Number(seat));
  return deal(closeBetting(s));
}
const view = (s, extra = {}) => ({
  ...viewFor(s, 0),
  phaseMsLeft: 12000,
  saving: false,
  closingAfterRound: false,
  credit: s.credit,
  amHost: true,
  dealMsLeft: 0,
  levels: {},
  ...extra,
});

function Lobby() {
  return <div>BLACKJACK LOBBY {useLocation().state?.tab ?? "free"}</div>;
}
const open = async () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/game-blackjack", state: { lobbyId: LOBBY, playerName: "ME #0003" } }]}>
      <Routes>
        <Route path="/game-blackjack" element={<GameBlackjack />} />
        <Route path="/lobby-blackjack" element={<Lobby />} />
        <Route path="/" element={<div>MAIN MENU</div>} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
};
const button = (name) => screen.getByRole("button", { name });

beforeEach(() => fakeSocket.emit.mockClear());

describe("blackjack table online", () => {
  it("draws five seats with seat 0 at the right, and SIT on empty seats while betting", async () => {
    await open();
    expect(emitted("join_lobby")).toEqual([{ lobbyId: LOBBY, playerName: "ME #0003" }]);
    expect(emitted("check_game_status")).toEqual([{ lobbyId: LOBBY }]);
    serverSends("blackjack_state", view(openBetting(table([1000, 1000]))));

    const seats = [...document.querySelectorAll("[data-seat]")];
    expect(seats.map((el) => el.dataset.seat)).toEqual(["0", "1", "2", "3", "4"]);
    const left = seats.map((el) => parseFloat(el.style.left));
    // Seat 0 (first base) is furthest right, and play goes right to left.
    for (let i = 1; i < 5; i++) expect(left[i]).toBeLessThan(left[i - 1]);
    expect(seats[0]).toHaveTextContent("ME");
    expect(seats[1]).toHaveTextContent("ANN");

    const sits = screen.getAllByRole("button", { name: "SIT" });
    expect(sits).toHaveLength(3);
    sits.forEach((b) => expect(b).toBeEnabled());
    await userEvent.click(within(seats[3]).getByRole("button", { name: "SIT" }));
    expect(emitted("bj_sit")).toEqual([{ lobbyId: LOBBY, seat: 3 }]);

    // With a bet down you stay put; mid-round nobody moves.
    serverSends("blackjack_state", view(placeBet(openBetting(table([1000, 1000])), 0, 50)));
    screen.getAllByRole("button", { name: "SIT" }).forEach((b) => expect(b).toBeDisabled());
    serverSends("blackjack_state", view(dealtWith(table([1000, 1000], { shoe: "10♠ 9♠ 10♣ 8♥ 7♦ 7♣" }), { 0: 100 })));
    screen.getAllByRole("button", { name: "SIT" }).forEach((b) => expect(b).toBeDisabled());
  });

  it("chips add to the bet, CLEAR resets, REBET repeats, x2 doubles; DEAL emits bj_bet then bj_ready", async () => {
    await open();
    let s = openBetting(table([1000, 1000]));
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, lastBet: 200 } : p)) };
    serverSends("blackjack_state", view(s));
    const box = screen.getByLabelText("Bet amount");
    expect(screen.getByText("PLACE YOUR BETS")).toBeInTheDocument();
    expect(screen.getByText(/0:12/)).toBeInTheDocument();

    await userEvent.click(button("100"));
    await userEvent.click(button("50"));
    expect(box).toHaveValue("150");
    await userEvent.click(button("x2"));
    expect(box).toHaveValue("300");
    await userEvent.click(button("CLEAR"));
    expect(box).toHaveValue("");
    await userEvent.click(button("REBET"));
    expect(box).toHaveValue("200");
    await userEvent.clear(box);
    await userEvent.type(box, "275");
    expect(box).toHaveValue("275");

    fakeSocket.emit.mockClear();
    await userEvent.click(button("DEAL"));
    expect(fakeSocket.emit.mock.calls).toEqual([
      ["bj_bet", { lobbyId: LOBBY, amount: 275 }],
      ["bj_ready", { lobbyId: LOBBY }],
    ]);
  });

  it("DEAL is disabled under 10", async () => {
    await open();
    serverSends("blackjack_state", view(openBetting(table([1000]))));
    const box = screen.getByLabelText("Bet amount");
    expect(button("DEAL")).toBeDisabled();
    await userEvent.type(box, "9");
    expect(button("DEAL")).toBeDisabled();
    await userEvent.clear(box);
    await userEvent.click(button("10"));
    expect(button("DEAL")).toBeEnabled();
    // Nor over what you have.
    await userEvent.clear(box);
    await userEvent.type(box, "1001");
    expect(button("DEAL")).toBeDisabled();
  });

  it("on your turn only legal actions are enabled; clicking emits bj_action", async () => {
    await open();
    // A pair of 8s, but 600 of your 1,000 is bet: no double, no split.
    const s = dealtWith(table([1000], { shoe: "8♠ 10♣ 8♦ 7♥" }), { 0: 600 });
    serverSends("blackjack_state", view(s));
    expect(button("HIT")).toBeEnabled();
    expect(button("STAND")).toBeEnabled();
    expect(button("DOUBLE")).toBeDisabled();
    expect(button("SPLIT")).toBeDisabled();
    expect(screen.getByText("YOUR TURN 0:12")).toBeInTheDocument();
    await userEvent.click(button("HIT"));
    expect(emitted("bj_action")).toEqual([{ lobbyId: LOBBY, type: "HIT" }]);

    // Enough left over: all four.
    serverSends("blackjack_state", view(dealtWith(table([1000], { shoe: "8♠ 10♣ 8♦ 7♥" }), { 0: 100 })));
    for (const name of ["HIT", "STAND", "DOUBLE", "SPLIT"]) expect(button(name)).toBeEnabled();
    await userEvent.click(button("SPLIT"));
    expect(emitted("bj_action").at(-1)).toEqual({ lobbyId: LOBBY, type: "SPLIT" });

    // Someone else's turn: no buttons.
    const theirs = play(dealtWith(table([1000, 1000], { shoe: "10♠ 10♦ 10♣ 9♠ 6♦ 7♥" }), { 0: 100, 1: 100 }), 0, "STAND");
    serverSends("blackjack_state", view(theirs));
    expect(screen.queryByRole("button", { name: "HIT" })).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for ANN/)).toBeInTheDocument();
  });

  it("insurance shows YES/NO with the cost and emits bj_insurance", async () => {
    await open();
    const s = dealtWith(table([2000], { shoe: "10♠ A♣ 9♥ 7♦" }), { 0: 750 });
    serverSends("blackjack_state", view(s));
    expect(screen.getByText("INSURANCE FOR 375?")).toBeInTheDocument();
    expect(screen.getByText("no answer = no")).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Dealer says" })).toHaveTextContent("INSURANCE?");
    await userEvent.click(button("YES"));
    await userEvent.click(button("NO"));
    expect(emitted("bj_insurance")).toEqual([
      { lobbyId: LOBBY, take: true },
      { lobbyId: LOBBY, take: false },
    ]);
  });

  it("shows the dealer's hole card face down until revealed", async () => {
    await open();
    let s = dealtWith(table([1000], { shoe: "10♠ K♣ 7♥ 9♦" }), { 0: 100 });
    serverSends("blackjack_state", view(s));
    const dealer = () => screen.getByLabelText("Dealer's cards");
    expect(dealer().querySelectorAll(".pixel-card-back")).toHaveLength(1);
    expect(dealer().querySelectorAll(".pixel-card:not(.pixel-card-back)")).toHaveLength(1);
    expect(dealer()).toHaveTextContent("K♣");
    expect(dealer()).not.toHaveTextContent("9♦");

    s = dealerStep(play(s, 0, "STAND")); // the dealer reveals
    serverSends("blackjack_state", view(s));
    expect(dealer().querySelectorAll(".pixel-card-back")).toHaveLength(0);
    expect(dealer()).toHaveTextContent("9♦");
    s = dealerStep(s); // stands on 19
    serverSends("blackjack_state", view(s));
    expect(screen.getByRole("note", { name: "Dealer says" })).toHaveTextContent("DEALER HAS 19");
  });

  it("result tags: +250 BLACKJACK in gold, -100 in rose, PUSH", async () => {
    await open();
    // You: A K, a blackjack on 167 (pays 250). ANN 17 and BOB 18 against the dealer's 18.
    let s = dealtWith(table([1000, 1000, 1000], { shoe: "A♠ 10♦ 10♣ 10♥ K♥ 7♣ 8♦ 8♠" }), { 0: 167, 1: 100, 2: 100 });
    s = play(play(s, 1, "STAND"), 2, "STAND");
    s = dealerStep(dealerStep(s));
    expect(s.phase).toBe("ROUND_OVER");
    serverSends("blackjack_state", view(s, { phaseMsLeft: null }));

    const bj = screen.getByText("BLACKJACK +250");
    expect(bj).toHaveStyle({ backgroundColor: "#f4c430" });
    expect(screen.getByText("-100")).toHaveStyle({ backgroundColor: "#e85a7a" });
    expect(screen.getByText("PUSH", { selector: "[data-result]" })).toHaveStyle({ backgroundColor: "#463a78" });
    expect(screen.getByText("YOU WON 250")).toBeInTheDocument();

    serverSends("progress_reward", { xp: 6, gold: 8, levelBefore: 3, levelAfter: 3, expAfter: 100 });
    expect(screen.getByText("+6 XP · +8 GOLD")).toBeInTheDocument();
  });

  it("logs dealer and player events as plain lines", async () => {
    await open();
    // You stand on 19; ANN doubles on 11 for 21; the dealer's 16 draws a 9 and busts.
    const start = table([1000, 1000], { shoe: "10♠ 6♦ 10♣ 9♥ 5♣ 6♥ 10♦ 9♠" });
    let s = openBetting(start);
    s = placeBet(placeBet(s, 0, 100), 1, 200);
    serverSends("blackjack_state", view(s));
    s = deal(closeBetting(setReady(setReady(s, 0), 1)));
    serverSends("blackjack_state", view(s));
    s = play(s, 0, "STAND");
    serverSends("blackjack_state", view(s));
    s = play(s, 1, "DOUBLE");
    serverSends("blackjack_state", view(s));
    s = dealerStep(s);
    serverSends("blackjack_state", view(s));
    s = dealerStep(s);
    serverSends("blackjack_state", view(s));
    s = dealerStep(s);
    serverSends("blackjack_state", view(s));
    expect(s.phase).toBe("ROUND_OVER");

    // jsdom's window is a compact layout: the sidebar is a drawer to open first.
    await userEvent.click(screen.getByRole("button", { name: /^Scoreboard and chat/ }));
    await userEvent.click(screen.getByRole("tab", { name: "LOG" }));
    const log = screen.getByRole("log");
    const lines = [...log.children].map((el) => el.textContent);
    expect(lines).toEqual(["ME bets 100", "ANN bets 200", "ME stands on 19", "ANN doubles on 11", "Dealer busts with 25", "ME wins 100", "ANN wins 400"]);

    // The rest of the spec's lines, straight from the log function.
    const names = ["NOVSH", "BOB", "CAT"];
    expect(eventEntry({ type: "dealer_blackjack", total: 21 }, names)).toBe("Dealer has blackjack");
    // A leave is already in the log from the server ("NOVSH left the table."): no second line.
    expect(eventEntry({ type: "leave", seat: 0 }, names)).toBeNull();
    expect(eventEntry({ type: "shuffle" }, names)).toBe("New shoe");
    expect(eventEntry({ type: "result", seat: 2, hand: 0, amount: 800, bet: 400 }, names)).toBe("CAT wins 400");
    expect(eventEntry({ type: "dealer_reveal", card: cards("9♦")[0], total: 19 }, names)).toBeNull();
    const split = { seats: [null, { hands: [{ cards: cards("8♠ 3♣"), bet: 100 }, { cards: cards("8♦"), bet: 100 }] }] };
    expect(eventEntry(withContext({ type: "split", seat: 1, hand: 0, amount: 100 }, split.seats), names)).toBe("BOB splits 8s");
  });

  it("REBUY appears at a free table below 10 chips and emits bj_rebuy", async () => {
    await open();
    serverSends("blackjack_state", view(setBankroll(openBetting(table([1000, 1000])), 0, 5)));
    await userEvent.click(button("REBUY"));
    expect(emitted("bj_rebuy")).toEqual([{ lobbyId: LOBBY }]);
    // Not with chips to bet, and never at a credit table.
    serverSends("blackjack_state", view(openBetting(table([1000, 1000]))));
    expect(screen.queryByRole("button", { name: "REBUY" })).not.toBeInTheDocument();
    serverSends("blackjack_state", view(setBankroll(openBetting(table([1000, 1000], { credit: true })), 0, 5)));
    expect(screen.queryByRole("button", { name: "REBUY" })).not.toBeInTheDocument();
  });

  it("no symbol glyphs other than card suits in the rendered UI text", async () => {
    await open();
    const glyphs = /[✦⚔►●✕☠]/;
    serverSends("blackjack_state", view(openBetting(table([1000, 1000], { credit: true }))));
    expect(document.body.textContent).not.toMatch(glyphs);
    expect(document.body.textContent).not.toMatch(/HOUSE/);
    serverSends("blackjack_state", view(dealtWith(table([1000, 1000], { credit: true, shoe: "8♠ 10♦ A♣ 8♦ 7♥ 9♠" }), { 0: 100, 1: 100 })));
    expect(document.body.textContent).not.toMatch(glyphs);
    expect(document.body.textContent).not.toMatch(/HOUSE/);
    // Your blackjack, and ANN's 20 hits into a bust: the round is over at once.
    const s = play(dealtWith(table([1000, 1000], { shoe: "A♠ 10♦ 10♣ 10♥ K♥ 7♣ 8♦ 8♠" }), { 0: 100, 1: 100 }), 1, "HIT");
    expect(s.phase).toBe("ROUND_OVER");
    serverSends("blackjack_state", view(s, { phaseMsLeft: null }));
    expect(document.body.textContent).not.toMatch(glyphs);
  });

  it("a rejected move shows why; leaving a credit table returns to the CREDITS tab", async () => {
    await open();
    serverSends("blackjack_state", view(openBetting(table([1000, 1000], { credit: true }))));
    serverSends("move_rejected", { reason: "The minimum bet is 10" });
    expect(screen.getByText("The minimum bet is 10")).toBeInTheDocument();
    serverSends("table_left", { reason: "closed" });
    expect(screen.getByText("BLACKJACK LOBBY credits")).toBeInTheDocument();
  });
});
