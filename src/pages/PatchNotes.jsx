// PATCH NOTES — what changed in every version (/patch-notes), straight from
// CHANGELOG.md (utils/changelog.js). Opened from the main menu's footer.
//
// Two panes. On the left, a tree of versions, newest first: each minor line
// (v1.4, v1.3, ...) is a folder of its versions, and the version you're
// reading lists its sections, which jump to them. On the right, that one
// version's notes, with the older and newer versions a click away. The
// address keeps the version (?v=1.3.0) so it can be linked. FILTER narrows
// the tree to the versions that mention what you type, and the notes to the
// lines that do. On phones the tree folds into a VERSIONS button.

import React, { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Panel, TopBar } from "../components/PixelUI";
import { INK, inputStyle } from "../components/pixelTokens";
import SettingsModal from "../components/SettingsModal";
import PixelIcon from "../components/PixelIcon";
import { RELEASES } from "../utils/changelog";
import { reducedMotion } from "../utils/motion";

const ACCENT = "#f4c430";
const GUIDE = "#2a234d"; // the tree's indent lines

const plain = (text) => text.replace(/\*\*/g, "");
const lineOf = (version) => version.split(".").slice(0, 2).join(".");

/** Releases grouped by minor line: [{ line: "1.3", releases }], newest first. */
function groupByLine(releases) {
  const lines = [];
  for (const release of releases) {
    const line = lineOf(release.version);
    if (lines.at(-1)?.line !== line) lines.push({ line, releases: [] });
    lines.at(-1).releases.push(release);
  }
  return lines;
}

const LINES = groupByLine(RELEASES);
// A line is named after its x.y.0 release's first section, when it has one.
const LINE_TITLES = Object.fromEntries(LINES.map((l) => [l.line, l.releases.at(-1).sections.find((s) => s.title)?.title ?? null]));
const NEWEST = RELEASES[0];

/**
 * The releases with only the notes matching `query` (a version matching it
 * keeps all its notes, a section title all its items), the rest dropped.
 */
function filterReleases(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const hit = (text) => plain(text).toLowerCase().includes(q);
  const kept = [];
  for (const r of RELEASES) {
    if (r.version.includes(q)) {
      kept.push(r);
      continue;
    }
    const sections = r.sections
      .map((s) => ({ ...s, items: s.title && hit(s.title) ? s.items : s.items.filter(hit) }))
      .filter((s) => s.items.length);
    const intro = r.intro.filter(hit);
    if (sections.length || intro.length) kept.push({ ...r, intro, sections });
  }
  return kept;
}

const noteCount = (r) => r.intro.length + r.sections.reduce((n, s) => n + s.items.length, 0);

/** `text` with its **bold** parts in gold and `query` marked. */
function Rich({ text, query }) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) => {
    const marked = <Mark text={part} query={query} />;
    return i % 2 ? (
      <span key={i} className="text-gold">
        {marked}
      </span>
    ) : (
      <React.Fragment key={i}>{marked}</React.Fragment>
    );
  });
}

function Mark({ text, query }) {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"));
  return parts.map((p, i) =>
    i % 2 ? (
      <mark key={i} style={{ backgroundColor: ACCENT, color: INK }}>
        {p}
      </mark>
    ) : (
      p
    ),
  );
}

const LiveTag = () => (
  <span className="font-pixel-display text-[8px] uppercase px-1.5 py-1 leading-none shrink-0" style={{ backgroundColor: "#179fa2", color: INK }}>
    Live
  </span>
);

const SectionId = (version, i) => `notes-${version}-${i}`;

// ------------------------------------------------------------ the tree ----

function Tree({ lines, selected, onSelect, isOpen, onToggle, query }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {lines.map((l) => {
        const open = isOpen(l.line);
        return (
          <li key={l.line}>
            <button
              type="button"
              onClick={() => onToggle(l.line)}
              aria-expanded={open}
              className="pixel-hbtn w-full flex items-center gap-2 px-2 py-1.5 text-left"
            >
              <span className="shrink-0 text-bone/70">
                <PixelIcon name={open ? "down" : "right"} size={10} />
              </span>
              <span className="font-pixel-display text-[10px] text-parchment shrink-0">v{l.line}</span>{" "}
              {LINE_TITLES[l.line] && <span className="font-pixel-body text-[18px] text-bone/70 truncate min-w-0">{LINE_TITLES[l.line]}</span>}
            </button>
            {open && (
              <ul className="flex flex-col gap-0.5 ml-[12px] pl-2 py-0.5" style={{ borderLeft: `2px solid ${GUIDE}` }}>
                {l.releases.map((r) => (
                  <VersionItem key={r.version} release={r} current={r.version === selected?.version} onSelect={onSelect} query={query} />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function VersionItem({ release, current, onSelect, query }) {
  const jump = (i) => {
    document.getElementById(SectionId(release.version, i))?.scrollIntoView?.({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const titled = release.sections.map((s, i) => ({ title: s.title, i })).filter((s) => s.title);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(release.version)}
        aria-current={current ? "page" : undefined}
        className="pixel-hbtn w-full flex items-center gap-2 px-2 py-1.5 text-left"
        style={current ? { backgroundColor: ACCENT, color: INK } : { color: "#ead8b1" }}
      >
        <span className="font-pixel-display text-[10px]">v{release.version}</span>{" "}
        {release.version === NEWEST?.version && <LiveTag />}{" "}
        {query && (
          <span className="font-pixel-body text-[18px] opacity-70">
            ({noteCount(release)})
          </span>
        )}
        <span className="ml-auto font-pixel-body text-[17px] whitespace-nowrap" style={{ opacity: current ? 0.8 : 0.5 }}>
          {release.date?.replace(/^(\d+) (\w{3})\w* \d+$/, "$1 $2")}
        </span>
      </button>
      {/* The version you're reading lists its sections, like headings in a file. */}
      {current && titled.length > 0 && (
        <ul className="flex flex-col ml-[10px] pl-2 my-0.5" style={{ borderLeft: `2px solid ${GUIDE}` }}>
          {titled.map(({ title, i }) => (
            <li key={i}>
              <button type="button" onClick={() => jump(i)} className="pixel-hbtn w-full text-left px-2 py-1 font-pixel-body text-[18px] leading-tight text-bone/80">
                {title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ----------------------------------------------------------- the notes ----

function Notes({ release, query }) {
  return (
    <div className="flex flex-col gap-5">
      {release.intro.map((p, i) => (
        <p key={i} className="font-pixel-body text-[20px] sm:text-[22px] leading-snug text-bone">
          <Rich text={p} query={query} />
        </p>
      ))}
      {release.sections.map((section, i) => (
        <section key={i} id={SectionId(release.version, i)} className="flex flex-col gap-2 scroll-mt-4" aria-label={section.title ?? undefined}>
          {section.title && (
            <h3 className="font-pixel-display text-[11px] sm:text-[12px] uppercase" style={{ color: "#5fd4d6" }}>
              <Mark text={section.title} query={query} />
            </h3>
          )}
          <ul className="flex flex-col gap-2">
            {section.items.map((item, j) => (
              <li key={j} className="flex gap-3 font-pixel-body text-[20px] sm:text-[22px] leading-snug text-parchment/90">
                <span className="text-gold shrink-0 mt-1.5" aria-hidden>
                  <PixelIcon name="right" size={10} />
                </span>
                <span>
                  <Rich text={item} query={query} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** ← the older version, the newer one → (in the list being shown). */
function Neighbours({ list, release, onSelect }) {
  const at = list.findIndex((r) => r.version === release.version);
  const older = list[at + 1];
  const newer = list[at - 1];
  const btn = (r, dir) =>
    r ? (
      <button
        type="button"
        onClick={() => onSelect(r.version)}
        className="pixel-hbtn flex items-center gap-2 px-3 font-pixel-display text-[10px] uppercase text-parchment"
        style={{ height: 40, backgroundColor: "#1f1a3d", boxShadow: `0 0 0 2px ${INK}` }}
      >
        {dir < 0 && <PixelIcon name="left" size={10} />}
        {dir < 0 ? "Older" : "Newer"} v{r.version}
        {dir > 0 && <PixelIcon name="right" size={10} />}
      </button>
    ) : (
      <span />
    );
  return (
    <nav aria-label="Other versions" className="flex flex-wrap justify-between gap-3 pt-5 mt-6" style={{ borderTop: `2px solid ${GUIDE}` }}>
      {btn(older, -1)}
      {btn(newer, 1)}
    </nav>
  );
}

// ------------------------------------------------------------- the page ----

export default function PatchNotes() {
  const [showSettings, setShowSettings] = useState(false);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [treeOpen, setTreeOpen] = useState(false); // phones: the tree under VERSIONS
  const notesRef = useRef(null);

  const filtered = useMemo(() => filterReleases(query), [query]);
  const list = filtered ?? RELEASES;
  const lines = filtered ? groupByLine(filtered) : LINES;

  // The version in the address, else the newest; while filtering, the first
  // match if that version has none.
  const asked = params.get("v");
  const selected = list.find((r) => r.version === asked) ?? (filtered ? list[0] : (RELEASES.find((r) => r.version === asked) ?? NEWEST));

  // Open folders: the selected version's line to start with. While filtering, every line is open.
  const [openLines, setOpenLines] = useState(() => new Set([lineOf(selected?.version ?? "")]));
  const isOpen = (line) => !!filtered || openLines.has(line);
  const toggleLine = (line) =>
    setOpenLines((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  const select = (version) => {
    setParams({ v: version }, { replace: true });
    setOpenLines((prev) => new Set(prev).add(lineOf(version)));
    setTreeOpen(false);
    notesRef.current?.scrollTo?.({ top: 0 });
  };

  const matches = filtered?.reduce((n, r) => n + noteCount(r), 0);
  const iconBtn = { width: 32, height: 32, backgroundColor: "#1f1a3d", boxShadow: `0 0 0 2px ${INK}`, color: "#ead8b1" };

  return (
    <div className="relative w-full h-dvh starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TopBar title="Patch notes" accent={ACCENT} onSettings={() => setShowSettings(true)} />

      <main className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden p-4">
        <div className="max-w-6xl mx-auto h-full flex flex-col lg:grid lg:grid-cols-[320px_minmax(0,1fr)] gap-4 lg:gap-6">
          {/* The tree. */}
          <Panel
            title="Versions"
            icon="book"
            deep="#463a78"
            className="lg:min-h-0 max-lg:shrink-0"
            right={
              <span className="flex items-center gap-1.5">
                <button type="button" onClick={() => setOpenLines(new Set(LINES.map((l) => l.line)))} aria-label="Expand all" title="Expand all" className="pixel-hbtn flex items-center justify-center" style={iconBtn}>
                  <PixelIcon name="down" size={10} />
                </button>
                <button type="button" onClick={() => setOpenLines(new Set())} aria-label="Collapse all" title="Collapse all" className="pixel-hbtn flex items-center justify-center" style={iconBtn}>
                  <PixelIcon name="up" size={10} />
                </button>
              </span>
            }
          >
            <div className="flex flex-col gap-2 p-3 lg:flex-1 lg:min-h-0">
              <label className="flex items-center gap-2 px-3 shrink-0" style={{ ...inputStyle, height: 40 }}>
                <span className="text-bone/60 shrink-0">
                  <PixelIcon name="search" size={12} />
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter notes"
                  aria-label="Filter the patch notes"
                  className="pixel-search flex-1 min-w-0 bg-transparent outline-none font-pixel-body text-[20px] text-parchment placeholder:text-bone/40"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear the filter" className="pixel-hbtn shrink-0 text-rose p-1">
                    <PixelIcon name="close" size={10} />
                  </button>
                )}
              </label>
              {filtered && (
                <p role="status" className="px-1 font-pixel-body text-[18px] text-bone/70">
                  {matches ? `${matches} ${matches === 1 ? "note matches" : "notes match"}` : "No notes match"}
                </p>
              )}
              {/* Phones: the tree folds away under the version you're reading. */}
              <button
                type="button"
                onClick={() => setTreeOpen((o) => !o)}
                aria-expanded={treeOpen}
                className="lg:hidden pixel-hbtn flex items-center gap-2 px-2 py-2 font-pixel-display text-[10px] uppercase text-parchment"
                style={{ backgroundColor: "#1f1a3d", boxShadow: `0 0 0 2px ${INK}` }}
              >
                <PixelIcon name={treeOpen ? "down" : "right"} size={10} />
                All versions
                {selected && <span className="ml-auto text-glow-gold">v{selected.version}</span>}
              </button>
              <nav aria-label="Versions" className={`lg:flex-1 lg:min-h-0 overflow-y-auto ${treeOpen ? "" : "max-lg:hidden"}`}>
                <Tree lines={lines} selected={selected} onSelect={select} isOpen={isOpen} onToggle={toggleLine} query={query} />
              </nav>
            </div>
          </Panel>

          {/* One version's notes. */}
          <Panel
            title={selected ? `v${selected.version}` : "No notes match"}
            icon="book"
            deep="#8a6a12"
            className="lg:min-h-0 max-lg:shrink-0"
            right={
              selected && (
                <span className="flex items-center gap-2">
                  {selected.version === NEWEST?.version && <LiveTag />}
                  {selected.date && <span className="font-pixel-body text-[18px]" style={{ color: INK }}>{selected.date}</span>}
                </span>
              )
            }
          >
            <article ref={notesRef} aria-label={selected ? `v${selected.version}` : undefined} className="lg:flex-1 lg:min-h-0 overflow-y-auto p-5 sm:p-8">
              {selected ? (
                <>
                  <Notes release={selected} query={query} />
                  <Neighbours list={list} release={selected} onSelect={select} />
                </>
              ) : (
                <p className="font-pixel-body text-[20px] text-bone/70">Nothing in the notes mentions "{query.trim()}".</p>
              )}
            </article>
          </Panel>
        </div>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
