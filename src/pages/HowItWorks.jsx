// HOW IT WORKS — the hall's math and algorithms (/how-it-works): randomness,
// server authority, the AI concepts behind every CPU, each game's CPU, the
// simulations that check them, and the reward math. Opened from the main
// menu's footer. The words are in howItWorks/chapters.jsx.
//
// Laid out like PATCH NOTES: on the left a tree of parts, each a folder of
// chapters, and the chapter you're reading lists its sections, which jump to
// them. On the right, that one chapter, with the previous and next a click
// away. The address keeps the chapter (?c=khuzur) so it can be linked. On
// phones the tree folds into a CONTENTS button.

import React, { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Panel, TopBar } from "../components/PixelUI";
import { INK } from "../components/pixelTokens";
import SettingsModal from "../components/SettingsModal";
import PixelIcon from "../components/PixelIcon";
import { reducedMotion } from "../utils/motion";
import { PARTS } from "./howItWorks/chapters";

const ACCENT = "#b48cff";
const GUIDE = "#2a234d"; // the tree's indent lines

const CHAPTERS = PARTS.flatMap((part) => part.chapters.map((c) => ({ ...c, part: part.title })));
const sectionId = (chapter, i) => `hiw-${chapter}-${i}`;

// ------------------------------------------------------------ the tree ----

function Tree({ selected, onSelect, isOpen, onToggle }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {PARTS.map((part, n) => {
        const open = isOpen(part.title);
        return (
          <li key={part.title}>
            <button type="button" onClick={() => onToggle(part.title)} aria-expanded={open} className="pixel-hbtn w-full flex items-center gap-2 px-2 py-1.5 text-left">
              <span className="shrink-0 text-bone/70">
                <PixelIcon name={open ? "down" : "right"} size={10} />
              </span>
              <span className="font-pixel-display text-[10px] text-parchment shrink-0">{n + 1}</span>
              <span className="font-pixel-body text-[18px] text-bone/80 truncate min-w-0">{part.title}</span>
            </button>
            {open && (
              <ul className="flex flex-col gap-0.5 ml-[12px] pl-2 py-0.5" style={{ borderLeft: `2px solid ${GUIDE}` }}>
                {part.chapters.map((c, k) => (
                  <ChapterItem key={c.id} chapter={c} number={`${n + 1}.${k + 1}`} current={c.id === selected.id} onSelect={onSelect} />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ChapterItem({ chapter, number, current, onSelect }) {
  const jump = (i) => document.getElementById(sectionId(chapter.id, i))?.scrollIntoView?.({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(chapter.id)}
        aria-current={current ? "page" : undefined}
        className="pixel-hbtn w-full flex items-center gap-2 px-2 py-1.5 text-left"
        style={current ? { backgroundColor: ACCENT, color: INK } : { color: "#ead8b1" }}
      >
        <span className="font-pixel-display text-[9px] shrink-0 opacity-70">{number}</span>
        <span className="font-pixel-body text-[18px] leading-tight">{chapter.title}</span>
      </button>
      {/* The chapter you're reading lists its sections, like headings in a file. */}
      {current && (
        <ul className="flex flex-col ml-[10px] pl-2 my-0.5" style={{ borderLeft: `2px solid ${GUIDE}` }}>
          {chapter.sections.map((s, i) => (
            <li key={s.title}>
              <button type="button" onClick={() => jump(i)} className="pixel-hbtn w-full text-left px-2 py-1 font-pixel-body text-[17px] leading-tight text-bone/80">
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// --------------------------------------------------------- the chapter ----

function Chapter({ chapter }) {
  return (
    <div className="flex flex-col gap-6">
      {chapter.summary && <p className="font-pixel-body text-[20px] sm:text-[22px] leading-snug text-bone">{chapter.summary}</p>}
      {chapter.sections.map((s, i) => (
        <section key={s.title} id={sectionId(chapter.id, i)} aria-label={s.title} className="flex flex-col gap-3 scroll-mt-4">
          <h3 className="font-pixel-display text-[11px] sm:text-[12px] uppercase leading-snug" style={{ color: "#5fd4d6" }}>
            {s.title}
          </h3>
          <div className="flex flex-col gap-3 font-pixel-body text-[20px] sm:text-[21px] leading-snug text-parchment/90">{s.body}</div>
        </section>
      ))}
    </div>
  );
}

/** ← the previous chapter, the next one →. */
function Neighbours({ chapter, onSelect }) {
  const at = CHAPTERS.findIndex((c) => c.id === chapter.id);
  const btn = (c, dir) =>
    c ? (
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        className="pixel-hbtn flex items-center gap-2 px-3 font-pixel-display text-[10px] uppercase text-parchment"
        style={{ minHeight: 40, backgroundColor: "#1f1a3d", boxShadow: `0 0 0 2px ${INK}` }}
      >
        {dir < 0 && <PixelIcon name="left" size={10} />}
        {c.title}
        {dir > 0 && <PixelIcon name="right" size={10} />}
      </button>
    ) : (
      <span />
    );
  return (
    <nav aria-label="Other chapters" className="flex flex-wrap justify-between gap-3 pt-5 mt-6" style={{ borderTop: `2px solid ${GUIDE}` }}>
      {btn(CHAPTERS[at - 1], -1)}
      {btn(CHAPTERS[at + 1], 1)}
    </nav>
  );
}

// ------------------------------------------------------------- the page ----

export default function HowItWorks() {
  const [showSettings, setShowSettings] = useState(false);
  const [params, setParams] = useSearchParams();
  const [treeOpen, setTreeOpen] = useState(false); // phones: the tree under CONTENTS
  const bodyRef = useRef(null);

  const selected = CHAPTERS.find((c) => c.id === params.get("c")) ?? CHAPTERS[0];
  const [openParts, setOpenParts] = useState(() => new Set(PARTS.map((p) => p.title)));
  const isOpen = (title) => openParts.has(title);
  const togglePart = (title) =>
    setOpenParts((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  const select = (id) => {
    setParams({ c: id }, { replace: true });
    setOpenParts((prev) => new Set(prev).add(CHAPTERS.find((c) => c.id === id).part));
    setTreeOpen(false);
    bodyRef.current?.scrollTo?.({ top: 0 });
  };

  const iconBtn = { width: 32, height: 32, backgroundColor: "#1f1a3d", boxShadow: `0 0 0 2px ${INK}`, color: "#ead8b1" };
  const number = (() => {
    const p = PARTS.findIndex((part) => part.title === selected.part);
    return `${p + 1}.${PARTS[p].chapters.findIndex((c) => c.id === selected.id) + 1}`;
  })();

  return (
    <div className="relative w-full h-dvh starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TopBar title="How it works" accent={ACCENT} onSettings={() => setShowSettings(true)} />

      <main className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden p-4">
        <div className="max-w-6xl mx-auto h-full flex flex-col lg:grid lg:grid-cols-[320px_minmax(0,1fr)] gap-4 lg:gap-6">
          {/* The tree. */}
          <Panel
            title="Contents"
            icon="book"
            deep="#463a78"
            className="lg:min-h-0 max-lg:shrink-0"
            right={
              <span className="flex items-center gap-1.5">
                <button type="button" onClick={() => setOpenParts(new Set(PARTS.map((p) => p.title)))} aria-label="Expand all" title="Expand all" className="pixel-hbtn flex items-center justify-center" style={iconBtn}>
                  <PixelIcon name="down" size={10} />
                </button>
                <button type="button" onClick={() => setOpenParts(new Set())} aria-label="Collapse all" title="Collapse all" className="pixel-hbtn flex items-center justify-center" style={iconBtn}>
                  <PixelIcon name="up" size={10} />
                </button>
              </span>
            }
          >
            <div className="flex flex-col gap-2 p-3 lg:flex-1 lg:min-h-0">
              {/* Phones: the tree folds away under the chapter you're reading. */}
              <button
                type="button"
                onClick={() => setTreeOpen((o) => !o)}
                aria-expanded={treeOpen}
                className="lg:hidden pixel-hbtn flex items-center gap-2 px-2 py-2 font-pixel-display text-[10px] uppercase text-parchment"
                style={{ backgroundColor: "#1f1a3d", boxShadow: `0 0 0 2px ${INK}` }}
              >
                <PixelIcon name={treeOpen ? "down" : "right"} size={10} />
                All chapters
                <span className="ml-auto text-glow-gold truncate">
                  {number} {selected.title}
                </span>
              </button>
              <nav aria-label="Chapters" className={`lg:flex-1 lg:min-h-0 overflow-y-auto ${treeOpen ? "" : "max-lg:hidden"}`}>
                <Tree selected={selected} onSelect={select} isOpen={isOpen} onToggle={togglePart} />
              </nav>
            </div>
          </Panel>

          {/* One chapter. */}
          <Panel
            title={`${number} ${selected.title}`}
            icon="book"
            deep="#8a6a12"
            className="lg:min-h-0 max-lg:shrink-0"
            right={<span className="font-pixel-body text-[18px] hidden sm:inline" style={{ color: INK }}>{selected.part}</span>}
          >
            <article ref={bodyRef} aria-label={selected.title} className="lg:flex-1 lg:min-h-0 overflow-y-auto p-5 sm:p-8">
              <Chapter chapter={selected} />
              <Neighbours chapter={selected} onSelect={select} />
            </article>
          </Panel>
        </div>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
