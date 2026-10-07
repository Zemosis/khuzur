// The server's answer to a chat flood, turned into a notice and a hold on the
// chat box for as long as the server said.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChatLimit } from "../../src/hooks/useChatLimit";

const { handlers, fakeSocket } = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
    fakeSocket: {
      on: (ev, fn) => (handlers[ev] ||= new Set()).add(fn),
      off: (ev, fn) => handlers[ev]?.delete(fn),
    },
  };
});
vi.mock("../../src/utils/socket", () => ({ socket: fakeSocket }));
const serverSends = (ev, data) => act(() => handlers[ev]?.forEach((fn) => fn(data)));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useChatLimit", () => {
  it("starts open", () => {
    const { result } = renderHook(() => useChatLimit());
    expect(result.current).toEqual({ notice: null, blocked: false });
  });

  it("too fast: holds chat with a countdown, then lets go", () => {
    const { result } = renderHook(() => useChatLimit());
    serverSends("chat_rejected", { reason: "slow", retryInMs: 2400 });
    expect(result.current).toEqual({ notice: "Slow down — chat again in 3s", blocked: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.notice).toBe("Slow down — chat again in 2s");
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current).toEqual({ notice: null, blocked: false });
  });

  it("a repeat: says so for a moment without holding chat", () => {
    const { result } = renderHook(() => useChatLimit());
    serverSends("chat_rejected", { reason: "repeat", retryInMs: 8000 });
    expect(result.current).toEqual({ notice: "You just said that — try something new", blocked: false });
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.notice).toBeNull();
  });

  it("stops listening once unmounted", () => {
    const { unmount } = renderHook(() => useChatLimit());
    unmount();
    expect(handlers.chat_rejected?.size ?? 0).toBe(0);
  });
});
