// Your own say over table chat: muting a player (from their name in the chat
// panel) and turning speech bubbles off (in Settings).

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GameChat from "../../src/components/thirteen/GameChat";
import SettingsModal from "../../src/components/SettingsModal";
import { bubblesOn, setBubblesOn, setMuted, isMuted } from "../../src/utils/chatPrefs";

const chat = (id, sender, text, isMe = false) => ({ id: `m${id}`, type: "CHAT", sender, text, timestamp: "12:00", isMe });
const messages = [chat(1, "TROLL #0001", "spam spam"), chat(2, "ANN #0002", "hi all"), chat(3, "ME #0003", "hey", true)];

afterEach(() => {
  setMuted("TROLL #0001", false);
  setBubblesOn(true);
  localStorage.clear();
});

describe("muting a player", () => {
  it("their name opens a menu; MUTE hides their messages, and the muted strip brings them back", async () => {
    render(<GameChat messages={messages} onSendMessage={() => {}} />);
    const log = screen.getByRole("log");
    expect(log).toHaveTextContent("spam spam");

    await userEvent.click(screen.getByRole("button", { name: "TROLL" }));
    await userEvent.click(screen.getByRole("button", { name: "Mute TROLL" }));
    expect(isMuted("TROLL #0001")).toBe(true);
    expect(log).not.toHaveTextContent("spam spam");
    expect(log).toHaveTextContent("hi all");

    const strip = screen.getByRole("group", { name: "Muted players" });
    await userEvent.click(within(strip).getByRole("button", { name: "Unmute TROLL" }));
    expect(isMuted("TROLL #0001")).toBe(false);
    expect(log).toHaveTextContent("spam spam");
    expect(screen.queryByRole("group", { name: "Muted players" })).toBeNull();
  });

  it("you can't mute yourself", () => {
    render(<GameChat messages={messages} onSendMessage={() => {}} />);
    expect(screen.queryByRole("button", { name: "ME" })).toBeNull();
  });

  it("the message input stops at 120 characters", () => {
    render(<GameChat messages={[]} onSendMessage={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Chat message" })).toHaveAttribute("maxLength", "120");
  });
});

describe("the chat bubbles setting", () => {
  it("toggles on and off in Settings, remembered in this browser", async () => {
    render(<SettingsModal onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /CHAT BUBBLES: ON/ }));
    expect(bubblesOn()).toBe(false);
    expect(localStorage.getItem("khuzur_bubbles")).toBe("off");
    await userEvent.click(screen.getByRole("button", { name: /CHAT BUBBLES: OFF/ }));
    expect(bubblesOn()).toBe(true);
    expect(localStorage.getItem("khuzur_bubbles")).toBe("on");
  });
});
