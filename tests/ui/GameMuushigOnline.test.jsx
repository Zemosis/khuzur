// The Muushig table online: the server's redacted states drive the page, your
// moves go out as muushig_move, and the waiting table comes first. States here
// are real engine states put through the server's own redaction.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import GameMuushig from "../../src/pages/muushig/GameMuushig";
import { PHASES, collectTrick, createMatch, drawForDeal, startNextRound } from "../../src/utils/muushig/engine.js";
import { aiAction, applyAction } from "../../src/utils/muushig/ai.js";
import { muushigView } from "../../server/game/muushigGame.js";
import { seededRandom } from "../helpers/cards.js";

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

const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));
const LOBBY = "PUB-MU0001";
const NAMES = ["ANN #0001", "BOB #0002", "ME #0003", "Bot Saturn", "Bot Venus"];
const players = () => NAMES.map((name, i) => ({ name, type: i < 3 ? "HUMAN" : "AI", level: i < 3 ? null : "MEDIUM" }));
const ME = 2;

/** A new match whose first drawer is seat `starter`. */
function newMatch(starter = ME) {
  const rest = seededRandom(11);
  let first = true;
  const rng = () => (first ? ((first = false), (starter + 0.5) / 5) : rest());
  return createMatch({ players: players(), rng });
}
/** Plays every seat with the CPU's choice until `test(state)`. */
function playUntil(s, test, rng = seededRandom(5)) {
  for (let i = 0; i < 5000 && !test(s); i++) {
    if (s.phase === PHASES.TRICK_END) s = collectTrick(s);
    else if (s.phase === PHASES.ROUND_END) s = startNextRound(s, rng);
    else s = applyAction(s, aiAction(s, rng), rng);
  }
  if (!test(s)) throw new Error("never got there");
  return s;
}
const view = (s, amHost = false) => ({ ...muushigView(s, ME), amHost });

const table = (over = {}) => ({
  lobbyId: LOBBY,
  gameType: "muushig",
  name: "Ger",
  isPrivate: false,
  status: "waiting",
  code: "MU0001",
  mySeat: ME,
  isHost: true,
  seats: [
    { kind: "human", name: "ANN #0001", avatar: null, isHost: false, connected: true },
    null,
    { kind: "human", name: "ME #0003", avatar: null, isHost: true, connected: true },
    { kind: "cpu", name: "Bot Saturn" },
    null,
  ],
  ...over,
});

const open = () =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/game-muushig", state: { lobbyId: LOBBY, playerName: "ME #0003", isHost: true } }]}>
      <Routes>
        <Route path="/game-muushig" element={<GameMuushig />} />
        <Route path="/" element={<div>MAIN MENU</div>} />
      </Routes>
    </MemoryRouter>,
  );
const status = () => screen.getByRole("status");
const emitted = (ev) => fakeSocket.emit.mock.calls.filter(([e]) => e === ev).map(([, data]) => data);
const button = (label) => screen.findByRole("button", { name: new RegExp(`^${label}(\\(SPACE\\))?$`) }, { timeout: 10_000 });

beforeEach(() => {
  fakeSocket.emit.mockClear();
  for (const k of Object.keys(handlers)) delete handlers[k];
});

describe("GameMuushig online", () => {
  it("joins the table and shows the five-seat waiting table; the host starts it", async () => {
    open();
    await act(async () => {});
    expect(emitted("join_lobby")).toEqual([{ lobbyId: LOBBY, playerName: "ME #0003" }]);
    expect(emitted("check_game_status")).toEqual([{ lobbyId: LOBBY }]);
    serverSends("table_update", table());
    expect(screen.getByText("MUUSHIG")).toBeInTheDocument();
    expect(screen.getByText(/3\/5 seated/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /start game/i }));
    expect(emitted("start_game")).toEqual([{ lobbyId: LOBBY }]);
  });

  it("your draw is sent to the server, and the server's state moves the table on", async () => {
    open();
    const s = newMatch(ME);
    serverSends("muushig_state", view(s, true));
    const take = await button("TAKE");
    expect(status()).toHaveTextContent("Your draw");
    const user = userEvent.setup();
    await user.click(take);
    expect(emitted("muushig_move")).toEqual([{ lobbyId: LOBBY, move: { type: "drawForDeal", depth: 1 } }]);
    // Nothing moves until the server says so.
    expect(status()).toHaveTextContent("Your draw");

    serverSends("muushig_state", view(drawForDeal(s, ME, 1)));
    expect(await screen.findByText(/Bot Saturn is drawing/, {}, { timeout: 10_000 })).toBeInTheDocument();
  }, 20_000);

  it("a tie in the draw for the deal hands you the TAKE button again", async () => {
    // Two aces on top of the pile: you and the next drawer both take one.
    let s = newMatch(ME);
    const aces = s.dealDeck.filter((c) => c.rank === "A");
    const rest = s.dealDeck.filter((c) => c.rank !== "A");
    s = { ...s, dealDeck: [aces[0], aces[1], ...rest, aces[2], aces[3]] };
    open();
    serverSends("muushig_state", view(s));
    const user = userEvent.setup();
    await user.click(await button("TAKE"));
    for (const seat of [ME, 3, 4, 0, 1]) {
      s = drawForDeal(s, seat, 1);
      serverSends("muushig_state", view(s));
    }
    expect(s.drawers).toEqual([ME, 3]); // the tie: you draw again first
    expect(await screen.findByText(/Tie! Draw again/, {}, { timeout: 10_000 })).toBeInTheDocument();
    const again = await button("TAKE");
    expect(again).toBeEnabled();
    await user.click(again);
    expect(emitted("muushig_move")).toHaveLength(2);
  }, 20_000);

  it("drawing last for the deal is just sent: the deal pile is hidden, so the server settles it", async () => {
    let s = newMatch((ME + 1) % 5);
    for (const seat of [3, 4, 0, 1]) s = drawForDeal(s, seat, 1);
    expect(s.turn).toBe(ME);
    open();
    serverSends("muushig_state", view(s));
    await userEvent.setup().click(await button("TAKE"));
    expect(emitted("muushig_move")).toEqual([{ lobbyId: LOBBY, move: { type: "drawForDeal", depth: 1 } }]);
    expect(screen.getByRole("status")).not.toHaveTextContent(/Cannot read|undefined/);
  }, 20_000);

  it("shows the server's reason when a move is rejected", async () => {
    open();
    serverSends("muushig_state", view(newMatch(ME)));
    await button("TAKE");
    serverSends("move_rejected", { reason: "Not your turn" });
    expect(await screen.findByText("Not your turn")).toBeInTheDocument();
  });

  it("joining mid-round skips the round's opening and puts you at the bottom with your own cards", async () => {
    open();
    const s = playUntil(newMatch(0), (x) => x.phase === PHASES.DECIDE && x.turn === ME);
    serverSends("muushig_state", view(s));
    const goIn = await button("GO IN");
    const hand = document.querySelectorAll('[aria-label="Your hand"] [data-card-id]');
    expect([...hand].map((el) => el.dataset.cardId).sort()).toEqual(s.players[ME].hand.map((c) => c.id).sort());
    await userEvent.setup().click(goIn);
    expect(emitted("muushig_move")).toEqual([{ lobbyId: LOBBY, move: { type: "decide", play: true } }]);
    // Every other seat is on the table by name.
    for (const name of ["ANN", "BOB", "Bot Saturn", "Bot Venus"]) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  }, 20_000);

  it("your cards can be dragged into your own order; RANK sorts them again", async () => {
    open();
    const s = playUntil(newMatch(0), (x) => x.phase === PHASES.DECIDE && x.turn === ME);
    serverSends("muushig_state", view(s));
    await button("GO IN");
    const order = () => [...document.querySelectorAll('[aria-label="Your hand"] [data-card-id]')].map((el) => el.dataset.cardId);
    const sorted = order();
    const first = document.querySelector(`[aria-label="Your hand"] [data-card-id="${CSS.escape(sorted[0])}"] .pixel-card`);
    fireEvent.pointerDown(first, { clientX: 100, clientY: 500, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 1500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 1500, clientY: 500, pointerId: 1 });
    expect(order()).toEqual([...sorted.slice(1), sorted[0]]);
    expect(screen.getByRole("button", { name: "RANK" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.setup().click(screen.getByRole("button", { name: "RANK" }));
    expect(order()).toEqual(sorted);
  }, 20_000);

  it("your turn shows a banner, frames your hand and lights your side; chat pops up over the sender", async () => {
    open();
    const s = playUntil(newMatch(0), (x) => x.phase === PHASES.DECIDE && x.turn === ME);
    serverSends("muushig_state", view(s));
    await button("GO IN");
    expect(screen.getByText("YOUR TURN")).toBeInTheDocument();
    expect(document.querySelector('[data-your-turn="true"]')).not.toBeNull();
    expect(document.querySelector('[data-turn-side="bottom"]')).not.toBeNull();
    serverSends("receive_chat", { id: "m1", type: "CHAT", sender: "ANN #0001", text: "go in!", timestamp: "10:00" });
    expect(screen.getByRole("note", { name: "ANN says" })).toHaveTextContent("go in!");
  }, 20_000);

  it("someone else's turn lights their side of the table", async () => {
    open();
    const s = playUntil(newMatch(0), (x) => x.phase === PHASES.DECIDE && x.turn === 3);
    serverSends("muushig_state", view(s));
    await screen.findAllByText(/Bot Saturn/, {}, { timeout: 10_000 });
    // Seat 3 sits one to your left: bottom-left.
    expect(await screen.findByTestId("turn-arrow", {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(document.querySelector('[data-turn-side="bottomLeft"]')).not.toBeNull();
    expect(document.querySelector('[data-your-turn="true"]')).toBeNull();
  }, 20_000);

  it("chat goes to the server and comes back from it", async () => {
    open();
    serverSends("table_update", table());
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/say something/i), "hi all{Enter}");
    expect(emitted("send_chat")).toEqual([{ lobbyId: LOBBY, message: "hi all" }]);
    serverSends("receive_chat", { id: "m1", type: "CHAT", sender: "ANN #0001", text: "hello ME", timestamp: "10:00" });
    // In the chat panel, and in a bubble over ANN's seat.
    expect(screen.getAllByText("hello ME")).toHaveLength(2);
  });

  it("a chat flood the server turns away holds the chat box, at the waiting table and in the game", async () => {
    open();
    serverSends("table_update", table());
    const user = userEvent.setup();
    const openChat = async () => {
      const panel = screen.queryByRole("button", { name: /chat/i });
      if (panel) await user.click(panel);
    };
    await openChat();
    serverSends("chat_rejected", { reason: "slow", retryInMs: 3000 });
    expect(screen.getByRole("status")).toHaveTextContent(/Slow down/);
    expect(screen.getByRole("button", { name: "gg" })).toBeDisabled();

    // Mid-round at the game table.
    const s = playUntil(newMatch(ME), (st) => st.phase === PHASES.PLAY);
    serverSends("muushig_state", view(s));
    await screen.findByText(/MUUSHIG/);
    await openChat();
    serverSends("chat_rejected", { reason: "repeat", retryInMs: 9000 });
    expect(await screen.findByText("You just said that — try something new")).toBeInTheDocument();
  });

  it("round results close by themselves; at match end only the host gets REMATCH", async () => {
    const s = playUntil(newMatch(0), (x) => x.phase === PHASES.ROUND_END);
    const { unmount } = open();
    serverSends("muushig_state", view(s));
    const dialog = await screen.findByRole("dialog", {}, { timeout: 10_000 });
    expect(within(dialog).queryByRole("button", { name: "NEXT ROUND" })).toBeNull();
    expect(within(dialog).getByText(/next round starting/i)).toBeInTheDocument();
    unmount();

    const over = playUntil(s, (x) => x.phase === PHASES.MATCH_OVER);
    open();
    serverSends("muushig_state", view(over, false));
    const guestDialog = await screen.findByRole("dialog", {}, { timeout: 10_000 });
    expect(within(guestDialog).queryByRole("button", { name: "REMATCH" })).toBeNull();
    expect(within(guestDialog).getByText(/waiting for the host/i)).toBeInTheDocument();
    serverSends("muushig_state", view(over, true));
    await userEvent.setup().click(await within(guestDialog).findByRole("button", { name: "REMATCH" }));
    expect(emitted("request_rematch")).toEqual([{ lobbyId: LOBBY }]);
  }, 30_000);

  it("EXIT leaves the table", async () => {
    open();
    serverSends("table_update", table());
    await userEvent.setup().click(screen.getByRole("button", { name: /exit/i }));
    expect(emitted("leave_lobby")).toEqual([{ lobbyId: LOBBY }]);
    expect(screen.getByText("MAIN MENU")).toBeInTheDocument();
  });

  it("a stale link shows why it can't open", async () => {
    open();
    serverSends("error_message", "Lobby not found");
    expect(await screen.findByText("Lobby not found")).toBeInTheDocument();
  });
});
