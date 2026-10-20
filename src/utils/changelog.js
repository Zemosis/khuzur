// CHANGELOG — the patch notes, read from CHANGELOG.md at the repo root, so
// there is one place to write them. The newest release there is the site's
// version (the main menu's footer shows it); the PATCH NOTES page lists them all.
//
// The file's shape: "## 1.2.1 — 20 October 2026" starts a release, "### Title"
// a section in it, "- " an item. Text between a release heading and its
// first item is an intro. **bold** is kept; anything else is plain text.

import raw from "../../CHANGELOG.md?raw";

/**
 * [{ version, date, intro: [text], sections: [{ title|null, items: [text] }] }], newest first.
 */
export function parseChangelog(text) {
  const releases = [];
  let release = null;
  for (const line of text.split(/\r?\n/)) {
    const head = line.match(/^##\s+(\S+)\s*(?:[—–-]\s*(.*))?$/);
    if (head) {
      release = { version: head[1], date: head[2]?.trim() || null, intro: [], sections: [] };
      releases.push(release);
      continue;
    }
    if (!release || !line.trim()) continue;
    const section = line.match(/^###\s+(.*)$/);
    if (section) {
      release.sections.push({ title: section[1].trim(), items: [] });
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (item) {
      if (!release.sections.length) release.sections.push({ title: null, items: [] });
      release.sections.at(-1).items.push(item[1].trim());
    } else if (!release.sections.length) release.intro.push(line.trim());
  }
  return releases;
}

export const RELEASES = parseChangelog(raw);

/** The site's version: the newest release in the notes. */
export const VERSION = RELEASES[0]?.version ?? "0.0.0";
