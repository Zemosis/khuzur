import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GameChat from "../../src/components/thirteen/GameChat";
import { cards } from "../helpers/cards.js";

const chat = (id, text, sender = "BOB #1234") => ({ id: `c${id}`, type: "CHAT", sender, text, timestamp: "12:00" });
const sys = (id, fields) => ({ id: `s${id}`, type: "SYSTEM", timestamp: "12:00", ...fields });

describe("GameChat", () => {
  it("starts on the chat tab with a prompt", () => {
    render(<GameChat onSendMessage={() => {}} />);
    expect(screen.getByRole("tab", { name: "CHAT" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Say hi to the table!")).toBeInTheDocument();
  });

  it("sends typed messages and quick replies, never blank ones", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<GameChat onSendMessage={onSend} />);
    const input = screen.getByRole("textbox", { name: "Chat message" });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(input, "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.clear(input);
    await user.type(input, "good luck{Enter}");
    expect(onSend).toHaveBeenLastCalledWith("good luck");
    expect(input).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "gg" }));
    expect(onSend).toHaveBeenLastCalledWith("gg");
    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it("while chat is held, it says why and nothing can be sent; what you typed stays", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { rerender } = render(<GameChat onSendMessage={onSend} notice="Slow down — chat again in 2s" blocked />);
    expect(screen.getByRole("status")).toHaveTextContent("Slow down — chat again in 2s");
    const input = screen.getByRole("textbox", { name: "Chat message" });
    await user.type(input, "hello{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("hello");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "gg" })).toBeDisabled();

    rerender(<GameChat onSendMessage={onSend} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("splits chat from the move log", async () => {
    const user = userEvent.setup();
    const messages = [
      chat(1, "hello"),
      sys(1, { kind: "round", round: 1 }),
      sys(2, { kind: "play", playerIndex: 1, name: "Bot Saturn", cards: cards("3♦ 3♠"), combo: "Pair" }),
      sys(3, { kind: "pass", playerIndex: 2, name: "Bot Venus" }),
      sys(4, { kind: "trick", name: "Bot Saturn" }),
      sys(5, { kind: "roundEnd", name: "Bot Saturn" }),
    ];
    render(<GameChat messages={messages} onSendMessage={() => {}} />);
    const log = screen.getByRole("log");
    expect(within(log).getByText("hello")).toBeInTheDocument();
    expect(within(log).queryByText("passed")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "LOG" }));
    expect(screen.getByText("2 MOVES")).toBeInTheDocument();
    expect(within(log).getByText("ROUND 1")).toBeInTheDocument();
    expect(within(log).getByText("passed")).toBeInTheDocument();
    expect(within(log).getByText(/Bot Saturn TAKES THE TRICK/)).toBeInTheDocument();
    expect(within(log).getByText(/Bot Saturn WINS THE ROUND/)).toBeInTheDocument();
    expect(within(log).queryByText("hello")).toBeNull();
  });

  it("counts unread chat while you read the log", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GameChat messages={[chat(1, "a")]} onSendMessage={() => {}} />);
    await user.click(screen.getByRole("tab", { name: "LOG" }));
    rerender(<GameChat messages={[chat(1, "a"), chat(2, "b"), chat(3, "c")]} onSendMessage={() => {}} />);
    expect(screen.getByRole("tab", { name: /CHAT/ })).toHaveTextContent("2");
    await user.click(screen.getByRole("tab", { name: /CHAT/ }));
    expect(screen.getByRole("tab", { name: "CHAT" })).toBeInTheDocument();
  });

  it("sending from the log tab jumps back to chat", async () => {
    const user = userEvent.setup();
    render(<GameChat onSendMessage={() => {}} />);
    await user.click(screen.getByRole("tab", { name: "LOG" }));
    await user.click(screen.getByRole("button", { name: "wp" }));
    expect(screen.getByRole("tab", { name: "CHAT" })).toHaveAttribute("aria-selected", "true");
  });
});
