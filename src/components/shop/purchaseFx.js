// PURCHASE FX — what buying looks like, in two beats (GSAP):
//
//   payIntoSlot   pixel coins leave your gold count, arc across the shop and
//                 drop into the slot, whose padlock rattles as they land
//   unlockBurst   the slot opens: its face pops in and pixel sparks fly out
//
// Sprites are plain squares in a fixed layer over the shop (`layer`), so they
// stay sharp and don't spin. With REDUCED animations neither runs: the slot
// just opens.

import gsap from "gsap";
import { reducedMotion } from "../../utils/motion";
import { soundManager } from "../../utils/SoundManager";

const INK = "#0a0712";
const COINS = 8;
const SPARKS = 12;
const SPARK_COLORS = ["#f4c430", "#ffe066", "#5fd4d6", "#ead8b1"];

const center = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** A square sprite in the layer, centred on its x/y. */
function sprite(layer, size, style) {
  const el = document.createElement("span");
  Object.assign(el.style, {
    position: "absolute",
    left: `${-size / 2}px`,
    top: `${-size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    willChange: "transform",
    ...style,
  });
  layer.appendChild(el);
  return el;
}

const coin = (layer) =>
  sprite(layer, 10, {
    backgroundColor: "#f4c430",
    boxShadow: `inset -2px -2px 0 #c89820, inset 2px 2px 0 #ffe066, 0 0 0 2px ${INK}`,
  });

/**
 * Coins from `from` (the gold count) to `to` (the slot's face), then the
 * padlock in `to` rattles. Resolves once it's over (at once when reduced).
 */
export function payIntoSlot({ layer, from, to }) {
  if (reducedMotion() || !layer || !from || !to) return Promise.resolve();
  const a = center(from);
  const b = center(to);
  const tl = gsap.timeline();
  for (let i = 0; i < COINS; i++) {
    const el = coin(layer);
    const at = i * 0.05;
    const lift = 50 + ((i * 37) % 50); // a different arc for each coin, no randomness
    const land = { x: b.x + ((i % 3) - 1) * 8, y: b.y };
    tl.set(el, { x: a.x, y: a.y, scale: 1 }, at)
      .to(el, { x: land.x, duration: 0.6, ease: "power1.in" }, at)
      .to(el, { y: Math.max(12, Math.min(a.y, land.y) - lift), duration: 0.25, ease: "power2.out" }, at)
      .to(el, { y: land.y, duration: 0.35, ease: "power2.in" }, at + 0.25)
      .to(el, { scale: 0.3, opacity: 0, duration: 0.08, onStart: () => soundManager.playCoin() }, at + 0.6);
  }
  // The padlock rattles in whole pixels as the last coins drop in.
  tl.to(to, { keyframes: { x: [0, -3, 3, -3, 3, 0] }, duration: 0.3, ease: "steps(5)" }, `>-0.2`);
  tl.eventCallback("onComplete", () => {
    layer.replaceChildren();
    gsap.set(to, { clearProps: "transform" });
  });
  return tl.then();
}

/** The slot's face pops in and sparks burst from it. */
export function unlockBurst({ layer, face }) {
  if (reducedMotion() || !layer || !face) return;
  soundManager.playUnlock();
  const c = center(face);
  const tl = gsap.timeline({ onComplete: () => layer.replaceChildren() });
  tl.fromTo(face, { scale: 0.3 }, { scale: 1, duration: 0.45, ease: "back.out(3)", clearProps: "transform" }, 0);
  for (let i = 0; i < SPARKS; i++) {
    const angle = (i / SPARKS) * Math.PI * 2;
    const reach = 54 + (i % 3) * 14;
    const el = sprite(layer, i % 2 ? 6 : 8, { backgroundColor: SPARK_COLORS[i % SPARK_COLORS.length], boxShadow: `0 0 0 2px ${INK}` });
    tl.set(el, { x: c.x, y: c.y }, 0)
      .to(el, { x: c.x + Math.cos(angle) * reach, y: c.y + Math.sin(angle) * reach, duration: 0.5, ease: "power2.out" }, 0.05)
      .to(el, { opacity: 0, duration: 0.25 }, 0.4);
  }
}
