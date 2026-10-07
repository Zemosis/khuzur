// The Thirteen table online: the server's states drive the page and your
// moves go out as request_move. States are real engine states.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import GameThirteen from "../../src/pages/thirteen/GameThirteen";
import { passAction, playCards, startNextRound } from "../../src/utils/gameLogic.js";
import { cards, stateWith } from "../helpers/cards.js";
import * as logic from "../../src/utils/gameLogic.js";

const { handlers, fakeSocket } = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
    fakeSocket: {
      id: "sock-1",
      connected: true,
      on: (ev, fn) => (handlers[ev] ||= new Set()).add(fn),
      off: (ev, fn) => handlers[ev]?.delete(fn),
      emit: vi.fn(),
    },
  };
});
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));

vi.mock("../../src/utils/socket", () => ({ socket: fakeSocket, connectSocket: () => Promise.resolve() }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => ({ connected: true, ping: 5 }) }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ identity: { name: "ME", tag: "0001", avatar: "1", customAvatar: null } }),
}));

const NAMES = ["ME #0001", "Bot Saturn", "FRIEND #0002", "Bot Venus"];
/** As the server sends it to seat 0: everyone else's hand hidden. */
const view = (s) => ({
  ...s,
  players: s.players.map((p, i) => ({
    ...p,
    name: NAMES[i],
    type: i === 0 || i === 2 ? "HUMAN" : "AI",
    socketId: i === 0 ? "sock-1" : null,
    hand: i === 0 ? p.hand : p.hand.map(() => ({ hidden: true })),
  })),
  amHost: true,
});

const open = () =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/game-13", state: { lobbyId: "PUB-ABC123", isHost: true, playerName: "ME #0001" } }]}>
      <Routes>
        <Route path="/game-13" element={<GameThirteen />} />
      </Routes>
    </MemoryRouter>,
  );
const cardEl = (container, id) => container.querySelector(`[data-card-id="${id}"] .pixel-card`);
const yourTurn = () => screen.findByText(/Your turn!/, {}, { timeout: 8000 });

beforeEach(() => {
  fakeSocket.emit.mockClear();
  for (const k of Object.keys(handlers)) delete handlers[k];
});

describe("GameThirteen online", () => {
  it("a selection you passed with doesn't carry into the next round", async () => {
    // Bot Venus leads a 5♠; you pick 7♥ but pass instead.
    const lead = stateWith(logic, {
      hands: ["3♦ 7♥ 9♣ K♠", "4♣ 6♣", "8♦ 10♦", "5♠ J♣"],
      current: 3,
    });
    const s1 = playCards(lead, cards("5♠")).newState;
    const { container } = open();
    await act(async () => {});
    serverSends("game_state_update", view(s1));
    await yourTurn();

    const user = userEvent.setup();
    await user.click(cardEl(container, "7♥"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^PASS/ }));
    expect(fakeSocket.emit).toHaveBeenCalledWith("request_move", { lobbyId: "PUB-ABC123", action: "pass", data: {} });

    // Someone wins the round; the next one deals you a hand without the 7♥.
    const passed = passAction(s1);
    serverSends("game_state_update", view(passed));
    const next = startNextRound({ ...passed, winnerIndex: 0 }, [
      cards("4♦ 8♠ Q♥"),
      cards("3♣ 6♦"),
      cards("9♦ J♦"),
      cards("10♣ A♣"),
    ]);
    serverSends("game_state_update", view(next));
    await yourTurn();

    await user.click(cardEl(container, "8♠"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.queryByText("Invalid")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^PLAY/ }));
    expect(fakeSocket.emit).toHaveBeenLastCalledWith("request_move", {
      lobbyId: "PUB-ABC123",
      action: "play",
      data: { cards: ["8♠"] },
    });
  }, 20000);

  it("a rejected move's reason gives way once you change your pick", async () => {
    const s1 = stateWith(logic, { hands: ["3♦ 7♥ 9♣ K♠", "4♣ 6♣", "8♦ 10♦", "5♠ J♣"], current: 0 });
    const { container } = open();
    await act(async () => {});
    serverSends("game_state_update", view(s1));
    await yourTurn();

    const user = userEvent.setup();
    await user.click(cardEl(container, "3♦"));
    serverSends("move_rejected", { reason: "Must beat the current play" });
    expect(screen.getByText("Must beat the current play")).toBeInTheDocument();

    await user.click(cardEl(container, "7♥"));
    expect(screen.queryByText("Must beat the current play")).not.toBeInTheDocument();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  }, 20000);

  const seatsShown = () => ["left", "top", "right"].filter((pos) => document.querySelector(`[data-deal-seat="${pos}"]`));

  it("a two-player table seats your opponent across from you", async () => {
    const s = stateWith(logic, { hands: ["3♦ 7♥", "4♣ 6♣"], current: 0 });
    open();
    await act(async () => {});
    serverSends("game_state_update", view(s));
    await yourTurn();
    expect(seatsShown()).toEqual(["top"]);
    expect(screen.getAllByText("Bot Saturn").length).toBeGreaterThan(0);
  }, 20000);

  it("a three-player table seats the others left and right", async () => {
    const s = stateWith(logic, { hands: ["3♦ 7♥", "4♣ 6♣", "8♦ 10♦"], current: 0 });
    open();
    await act(async () => {});
    serverSends("game_state_update", view(s));
    await yourTurn();
    expect(seatsShown()).toEqual(["left", "right"]);
  }, 20000);

  it("someone who joins a full two-player table watches it", async () => {
    const s = stateWith(logic, { hands: ["3♦ 7♥", "4♣ 6♣"], current: 0 });
    const watched = { ...view(s), players: view(s).players.map((p, i) => ({ ...p, name: ["ANN #0005", "BOB #0006"][i], socketId: null })) };
    open();
    await act(async () => {});
    serverSends("game_state_update", watched);
    expect(await screen.findByText(/Waiting for ANN/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(seatsShown()).toEqual(["top"]);
  }, 20000);

  it("dragging a card puts the hand in your own order; RANK sorts it again", async () => {
    const s = stateWith(logic, { hands: ["3♦ 7♥ 9♣ K♠", "4♣ 6♣", "8♦ 10♦", "5♠ J♣"], current: 0 });
    const { container } = open();
    await act(async () => {});
    serverSends("game_state_update", view(s));
    await yourTurn();
    const order = () => [...container.querySelectorAll("[data-card-id]")].map((el) => el.dataset.cardId);
    const pressed = (name) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
    expect(order()).toEqual(["3♦", "7♥", "9♣", "K♠"]);
    expect(pressed("RANK")).toBe("true");

    const card = cardEl(container, "3♦");
    fireEvent.pointerDown(card, { clientX: 300, clientY: 500, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 900, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 900, clientY: 500, pointerId: 1 });
    expect(order()).toEqual(["7♥", "9♣", "K♠", "3♦"]);
    expect(pressed("RANK")).toBe("false");
    expect(pressed("SUIT")).toBe("false");

    await userEvent.setup().click(screen.getByRole("button", { name: "RANK" }));
    expect(order()).toEqual(["3♦", "7♥", "9♣", "K♠"]);
    expect(pressed("RANK")).toBe("true");
  }, 20000);

  it("your turn is hard to miss: a banner, a gold frame on your hand, your side of the felt glowing", async () => {
    const s = stateWith(logic, { hands: ["3♦ 7♥ 9♣ K♠", "4♣ 6♣", "8♦ 10♦", "5♠ J♣"], current: 0 });
    const { container } = open();
    await act(async () => {});
    serverSends("game_state_update", view(s));
    await yourTurn();
    expect(screen.getByText("YOUR TURN")).toBeInTheDocument();
    expect(container.querySelector('[data-your-turn="true"]')).not.toBeNull();
    expect(container.querySelector('[data-turn-side="bottom"]')).not.toBeNull();
  }, 20000);

  it("someone else's turn: the felt glows on their side and the other seats dim", async () => {
    const s = stateWith(logic, { hands: ["3♦ 7♥ 9♣ K♠", "4♣ 6♣", "8♦ 10♦", "5♠ J♣"], current: 1 });
    const { container } = open();
    await act(async () => {});
    serverSends("game_state_update", view(s));
    await screen.findByText(/Waiting for Bot Saturn/, {}, { timeout: 8000 });
    expect(container.querySelector('[data-turn-side="left"]')).not.toBeNull();
    expect(container.querySelector('[data-your-turn="true"]')).toBeNull();
    const plateOf = (pos) => container.querySelector(`[data-plate="${pos}"]`);
    expect(plateOf("left").style.opacity).toBe("1");
    expect(plateOf("top").style.opacity).toBe("0.6");
  }, 20000);

  it("a chat message pops up over its sender's seat, and yours over your hand", async () => {
    const s = stateWith(logic, { hands: ["3♦ 7♥ 9♣ K♠", "4♣ 6♣", "8♦ 10♦", "5♠ J♣"], current: 0 });
    open();
    await act(async () => {});
    serverSends("game_state_update", view(s));
    await yourTurn();
    serverSends("receive_chat", { id: "c1", type: "CHAT", sender: "FRIEND #0002", text: "your go!", timestamp: "10:00" });
    expect(screen.getByRole("note", { name: "FRIEND says" })).toHaveTextContent("your go!");
    serverSends("receive_chat", { id: "c2", type: "CHAT", sender: "ME #0001", text: "thinking", timestamp: "10:00" });
    expect(screen.getByRole("note", { name: "ME says" })).toHaveTextContent("thinking");
  }, 20000);
});
