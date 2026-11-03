// jsdom has no layout, audio or observers: stub what the table components use.
// Reduced animations are on so GSAP work collapses to (near) instant. The OS
// preference below says "reduce" too, though the game ignores it (see
// utils/motion.js).

import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { setReducedMotion } from "../../src/utils/motion";

afterEach(() => cleanup());
setReducedMotion(true);

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  constructor(cb) {
    this.cb = cb;
  }
  observe(el) {
    this.cb([{ target: el, contentRect: { width: 900, height: 200 } }]);
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver = IntersectionObserverStub;

Element.prototype.scrollTo = function scrollTo() {};

vi.mock("../../src/utils/SoundManager", () => {
  const soundManager = new Proxy({ context: null }, { get: (t, k) => (k in t ? t[k] : () => {}) });
  return { soundManager, default: soundManager };
});

// The avatar painter and colour picker draw on canvases; jsdom returns null for getContext.
const noopContext = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
HTMLCanvasElement.prototype.getContext = () => noopContext;
