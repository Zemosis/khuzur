// RULEBOOK — the shell and building blocks of an in-game rulebook: a modal
// with a section nav that follows the reader, plus inline highlights,
// callouts and card examples drawn with real PixelCards.
//
// Same look as Thirteen's RulesModal; Muushig's and Poker's rules are built on
// this, and every game's CPU levels show through CpuLevels.

import React, { useEffect, useRef, useState } from "react";
import { PixelCard } from "./PixelCard";
import PixelIcon from "./PixelIcon";

// "10♥ J♥" → card objects for PixelCard.
const parse = (spec) => spec.split(" ").map((c) => ({ rank: c.slice(0, -1), suit: c.slice(-1), id: c }));

export function Cards({ spec, width = 44, overlap = 0.42, dim = false }) {
  const cards = parse(spec);
  return (
    <div className="flex items-end shrink-0" style={{ opacity: dim ? 0.45 : 1 }}>
      {cards.map((c, i) => (
        <div key={c.id + i} style={{ marginLeft: i ? -width * overlap : 0 }}>
          <PixelCard rank={c.rank} suit={c.suit} width={width} />
        </div>
      ))}
    </div>
  );
}

// Inline highlights: gold = key term, cyan = tip, rose = warning.
export const Key = ({ children }) => (
  <strong
    className="font-normal px-1"
    style={{ color: "#f4c430", backgroundColor: "rgba(244,196,48,0.14)", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}
  >
    {children}
  </strong>
);
export const Hi = ({ children, color = "#5fd4d6" }) => <span style={{ color }}>{children}</span>;

export function Callout({ tone = "tip", title, children }) {
  const t = {
    tip: { c: "#5fd4d6", bg: "rgba(95,212,214,0.08)", icon: "star" },
    warn: { c: "#e85a7a", bg: "rgba(232,90,122,0.08)", icon: "skull" },
    rule: { c: "#f4c430", bg: "rgba(244,196,48,0.08)", icon: "crown" },
  }[tone];
  return (
    <div className="px-4 py-3 my-4" style={{ backgroundColor: t.bg, boxShadow: `inset 4px 0 0 ${t.c}` }}>
      <div className="flex items-center gap-2 font-pixel-display text-[10px] tracking-wider mb-1.5" style={{ color: t.c }}>
        <PixelIcon name={t.icon} size={12} />
        {title}
      </div>
      <div className="font-pixel-body text-[20px] leading-snug text-parchment">{children}</div>
    </div>
  );
}

export function Section({ id, n, title, children }) {
  return (
    <section id={`rule-${id}`} data-rule={id} className="scroll-mt-4 pb-8 mb-8" style={{ borderBottom: "3px solid #1f1a3d" }}>
      <h2 className="flex items-baseline gap-3 mb-4">
        <span className="font-pixel-display text-[12px] text-bone/40">{String(n).padStart(2, "0")}</span>
        <span className="font-pixel-display text-[16px] text-glow-gold tracking-wide">{title}</span>
      </h2>
      <div className="font-pixel-body text-[21px] leading-snug text-parchment/90 flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Numbered steps with gold number tiles. */
export function Steps({ items }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((text, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="font-pixel-display text-[11px] shrink-0 w-7 h-7 flex items-center justify-center"
            style={{ backgroundColor: "#f4c430", color: "#1a1024" }}
          >
            {i + 1}
          </span>
          <span>{text}</span>
        </li>
      ))}
    </ol>
  );
}

export function Kbd({ children }) {
  return (
    <kbd
      className="font-pixel-display text-[10px] px-2 py-1 mx-0.5"
      style={{ backgroundColor: "#ead8b1", color: "#1a1024", boxShadow: "inset 0 -3px 0 #a89870" }}
    >
      {children}
    </kbd>
  );
}

/** A card example next to its name and explanation. */
export function CardRow({ name, spec, text, extra }) {
  return (
    <div className="flex items-center gap-5 px-4 py-3" style={{ backgroundColor: "#14102a", boxShadow: "0 0 0 2px #1f1a3d" }}>
      <div className="w-[150px] shrink-0 flex justify-center">
        <Cards spec={spec} />
      </div>
      <div className="min-w-0">
        <div className="font-pixel-display text-[12px] text-parchment mb-1">{name}</div>
        <div className="font-pixel-body text-[20px] leading-tight text-bone/80">{text}</div>
        {extra && <div className="font-pixel-body text-[18px] leading-tight text-bone/60 mt-1">{extra}</div>}
      </div>
    </div>
  );
}

// The three CPU levels' colors, everywhere they're shown.
const LEVEL_COLORS = { EASY: "#9bd14f", MEDIUM: "#f4c430", HARD: "#e85a7a" };

/** The CPU levels side by side. levels: [{ id: "EASY", who: "A beginner", traits: [text] }]. */
export function CpuLevels({ levels }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {levels.map((l) => (
        <div key={l.id} className="px-4 py-3" style={{ backgroundColor: "#14102a", boxShadow: `0 0 0 2px #1f1a3d, inset 0 4px 0 ${LEVEL_COLORS[l.id]}` }}>
          <div className="font-pixel-display text-[12px] mb-1" style={{ color: LEVEL_COLORS[l.id] }}>
            {l.id}
          </div>
          <div className="font-pixel-body text-[19px] text-bone/70 mb-2 leading-none">{l.who}</div>
          <ul className="flex flex-col gap-1.5 font-pixel-body text-[19px] leading-snug text-parchment/90 list-disc pl-5">
            {l.traits.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Versus({ win, lose, caption }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Cards spec={win} />
      <span className="font-pixel-display text-[10px] text-glow-gold">BEATS</span>
      <Cards spec={lose} dim />
      {caption && <span className="font-pixel-body text-[19px] text-bone/70">{caption}</span>}
    </div>
  );
}

/**
 * The modal. `sections` is [[id, label], …] matching the <Section id>s in
 * `children`; the nav highlights whichever one is being read.
 */
export default function Rulebook({ title, subtitle, headerCards, sections, onClose, children }) {
  const scrollRef = useRef(null);
  const closeRef = useRef(null);
  const [active, setActive] = useState(sections[0][0]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.dataset.rule);
      },
      { root, rootMargin: "0px 0px -65% 0px" },
    );
    root.querySelectorAll("[data-rule]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const jump = (id) => {
    const root = scrollRef.current;
    const el = root?.querySelector(`#rule-${id}`);
    if (el) root.scrollTo({ top: el.offsetTop - 16, behavior: "smooth" });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4"
      style={{ backgroundColor: "rgba(10,7,18,0.82)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        className="flex flex-col w-full max-w-[1080px] h-full max-h-[880px]"
        style={{ backgroundColor: "#110d22", border: "4px solid #0a0712", boxShadow: "0 0 0 4px #463a78, 8px 8px 0 #0a0712" }}
      >
        <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-2 shrink-0" style={{ minHeight: 64, backgroundColor: "#1a1024", borderBottom: "4px solid #0a0712" }}>
          <span className="text-glow-gold max-sm:hidden">
            <PixelIcon name="book" size={24} />
          </span>
          <div className="flex-1 min-w-0">
            <h1 id="rules-title" className="font-pixel-display text-[12px] sm:text-[16px] leading-snug text-glow-gold tracking-wider">
              {title}
            </h1>
            <div className="font-pixel-body text-[18px] text-bone/60 leading-none mt-1">{subtitle}</div>
          </div>
          {headerCards && (
            <div className="hidden md:flex items-end">
              <Cards spec={headerCards} width={34} overlap={0.3} />
            </div>
          )}
          <button
            ref={closeRef}
            onClick={onClose}
            className="pixel-btn font-pixel-display text-[10px] px-3 py-2 flex items-center gap-2 shrink-0"
            style={{ backgroundColor: "#7a1530", borderColor: "#3a0a18", color: "#ead8b1" }}
          >
            <PixelIcon name="close" size={12} /> <span className="max-sm:sr-only">CLOSE</span>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav
            className="hidden md:flex flex-col gap-1 p-3 w-[210px] shrink-0 overflow-y-auto"
            style={{ backgroundColor: "#0e0a1f", borderRight: "4px solid #0a0712" }}
            aria-label="Rule sections"
          >
            {sections.map(([id, label], i) => {
              const on = active === id;
              return (
                <button
                  key={id}
                  onClick={() => jump(id)}
                  aria-current={on ? "true" : undefined}
                  className="pixel-hbtn text-left flex items-center gap-2 px-3 py-2"
                  style={{ backgroundColor: on ? "#2e1a3a" : "transparent", boxShadow: on ? "inset 3px 0 0 #f4c430" : "none" }}
                >
                  <span className="font-pixel-display text-[10px]" style={{ color: on ? "#f4c430" : "#6b5a9a" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-pixel-body text-[20px] leading-none" style={{ color: on ? "#ead8b1" : "#a89cc8" }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </nav>

          <div ref={scrollRef} className="relative flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 md:px-10 py-6 sm:py-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
