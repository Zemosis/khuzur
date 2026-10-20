// Chat bubbles over the sender's seat: what each one says, and for how long.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChatBubbles, bubbleMs } from "../../src/hooks/useChatBubbles";
import { setBubblesOn, setMuted } from "../../src/utils/chatPrefs";

const chat = (id, sender, text, isMe = false) => ({ id: `m${id}`, type: "CHAT", sender, text, timestamp: "12:00", isMe });
const log = (id) => ({ id: `s${id}`, type: "SYSTEM", kind: "pass", name: "ANN" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  setBubblesOn(true);
  setMuted("ANN #0001", false);
});

const setup = (initial = []) =>
  renderHook(({ messages }) => useChatBubbles(messages), { initialProps: { messages: initial } });

describe("useChatBubbles", () => {
  it("shows a new message over its sender, then clears it", () => {
    const { result, rerender } = setup();
    rerender({ messages: [chat(1, "ANN #0001", "hi")] });
    expect(result.current.bubbleFor("ANN #0001")).toEqual(["hi"]);
    expect(result.current.bubbleFor("BOB #0002")).toBeNull();
    act(() => vi.advanceTimersByTime(bubbleMs("hi") + 50));
    expect(result.current.bubbleFor("ANN #0001")).toBeNull();
  });

  it("stays 4s for a short message, longer for a long one, never past 8s", () => {
    expect(bubbleMs("gg")).toBeGreaterThanOrEqual(4000);
    expect(bubbleMs("x".repeat(40))).toBeGreaterThan(bubbleMs("gg"));
    expect(bubbleMs("x".repeat(300))).toBe(8000);
  });

  it("messages in a row stack in one bubble, the last 3, and each restarts the clock", () => {
    const { result, rerender } = setup();
    const msgs = [];
    for (const [i, t] of ["one", "two", "three", "four"].entries()) {
      msgs.push(chat(i, "ANN #0001", t));
      rerender({ messages: [...msgs] });
      act(() => vi.advanceTimersByTime(3000));
    }
    expect(result.current.bubbleFor("ANN #0001")).toEqual(["two", "three", "four"]);
    act(() => vi.advanceTimersByTime(bubbleMs("four") - 3000 + 50));
    expect(result.current.bubbleFor("ANN #0001")).toBeNull();
  });

  it("your own messages pop up over your own spot, never over a namesake's seat", () => {
    const { result, rerender } = setup();
    expect(result.current.mine).toBeNull();
    rerender({ messages: [chat(1, "ME #0003", "my turn?", true)] });
    expect(result.current.mine).toEqual(["my turn?"]);
    expect(result.current.bubbleFor("ME #0003")).toBeNull();
    expect(result.current.bubbleFor("ME #0009")).toBeNull();
    act(() => vi.advanceTimersByTime(bubbleMs("my turn?") + 50));
    expect(result.current.mine).toBeNull();
  });

  it("a muted player's messages never pop up, and muting hides a bubble already up", () => {
    const { result, rerender } = setup();
    rerender({ messages: [chat(1, "ANN #0001", "hi")] });
    expect(result.current.bubbleFor("ANN #0001")).toEqual(["hi"]);
    act(() => setMuted("ANN #0001", true));
    expect(result.current.bubbleFor("ANN #0001")).toBeNull();
    rerender({ messages: [chat(1, "ANN #0001", "hi"), chat(2, "ANN #0001", "hello??")] });
    expect(result.current.bubbleFor("ANN #0001")).toBeNull();
  });

  it("with bubbles turned off in Settings, nothing pops up, yours included", () => {
    const { result, rerender } = setup();
    act(() => setBubblesOn(false));
    rerender({ messages: [chat(1, "ANN #0001", "hi"), chat(2, "ME #0003", "yo", true)] });
    expect(result.current.bubbleFor("ANN #0001")).toBeNull();
    expect(result.current.mine).toBeNull();
  });

  it("chat already there when the table opens, and the move log, never pop up", () => {
    const { result, rerender } = setup([chat(1, "ANN #0001", "earlier")]);
    expect(result.current.bubbleFor("ANN #0001")).toBeNull();
    rerender({ messages: [chat(1, "ANN #0001", "earlier"), log(2)] });
    expect(result.current.bubbleFor("ANN")).toBeNull();
  });

  it("matches a seat by name even when the chat sender carries no tag", () => {
    const { result, rerender } = setup();
    rerender({ messages: [chat(1, "Bot Saturn", "beep")] });
    expect(result.current.bubbleFor("Bot Saturn")).toEqual(["beep"]);
  });
});
