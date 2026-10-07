// How your hand is laid out: RANK or SUIT (remembered across visits), or your
// own order once you drag cards, for the rest of the round.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHandOrder } from "../../src/hooks/useHandOrder";

beforeEach(() => localStorage.clear());

describe("useHandOrder", () => {
  it("starts by rank, or by the last mode picked", () => {
    expect(renderHook(() => useHandOrder("r1")).result.current).toMatchObject({ mode: "rank", order: null });
    localStorage.setItem("khuzur_sort", "suit");
    expect(renderHook(() => useHandOrder("r1")).result.current.mode).toBe("suit");
  });

  it("a drag switches to your own order; RANK or SUIT replaces it and is remembered", () => {
    const { result } = renderHook(() => useHandOrder("r1"));
    act(() => result.current.reorder(["A♠", "3♦"]));
    expect(result.current).toMatchObject({ mode: "custom", order: ["A♠", "3♦"] });
    act(() => result.current.pick("suit"));
    expect(result.current).toMatchObject({ mode: "suit", order: null });
    expect(localStorage.getItem("khuzur_sort")).toBe("suit");
  });

  it("your own order lasts the round; the next deal is sorted by the mode you last picked", () => {
    const { result, rerender } = renderHook(({ round }) => useHandOrder(round), { initialProps: { round: "r1" } });
    act(() => result.current.reorder(["A♠", "3♦"]));
    rerender({ round: "r2" });
    expect(result.current).toMatchObject({ mode: "rank", order: null });
  });
});
