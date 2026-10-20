// PATCH NOTES — what changed in every version (/patch-notes), newest first,
// straight from CHANGELOG.md (utils/changelog.js). Opened from the main
// menu's footer.

import React, { useState } from "react";
import { Panel, TopBar } from "../components/PixelUI";
import SettingsModal from "../components/SettingsModal";
import PixelIcon from "../components/PixelIcon";
import { RELEASES } from "../utils/changelog";

const ACCENT = "#f4c430";

/** `text` with its **bold** parts in gold. */
function Rich({ text }) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="text-gold">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function Release({ release, latest }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`v${release.version}`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`v${release.version}`} className="font-pixel-display text-[14px] sm:text-[16px]" style={{ color: ACCENT }}>
          v{release.version}
        </h2>
        {latest && (
          <span className="font-pixel-display text-[9px] uppercase px-2 py-1" style={{ backgroundColor: "#179fa2", color: "#0a0712" }}>
            Live now
          </span>
        )}
        {release.date && <span className="font-pixel-body text-[18px] text-bone/60">{release.date}</span>}
      </header>
      {release.intro.map((p, i) => (
        <p key={i} className="font-pixel-body text-[20px] sm:text-[22px] leading-snug text-bone">
          <Rich text={p} />
        </p>
      ))}
      {release.sections.map((section, i) => (
        <div key={i} className="flex flex-col gap-2">
          {section.title && (
            <h3 className="font-pixel-display text-[11px] sm:text-[12px] uppercase" style={{ color: "#5fd4d6" }}>
              {section.title}
            </h3>
          )}
          <ul className="flex flex-col gap-2">
            {section.items.map((item, j) => (
              <li key={j} className="flex gap-3 font-pixel-body text-[20px] sm:text-[22px] leading-snug text-parchment/90">
                <span className="text-gold shrink-0 mt-1.5" aria-hidden>
                  <PixelIcon name="right" size={10} />
                </span>
                <span>
                  <Rich text={item} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default function PatchNotes() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="relative w-full h-dvh starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TopBar title="Patch notes" accent={ACCENT} onSettings={() => setShowSettings(true)} />

      <main className="flex-1 min-h-0 overflow-y-auto p-4">
        <Panel title="What's new" icon="book" deep="#8a6a12" className="max-w-3xl mx-auto">
          <article className="flex flex-col gap-10 p-5 sm:p-8">
            {RELEASES.map((release, i) => (
              <Release key={release.version} release={release} latest={i === 0} />
            ))}
          </article>
        </Panel>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
