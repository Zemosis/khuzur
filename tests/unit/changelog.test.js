// The patch notes come from CHANGELOG.md: its newest release is the site's version.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASES, VERSION, parseChangelog } from "../../src/utils/changelog.js";

describe("the changelog", () => {
  it("reads releases, their sections and items", () => {
    const notes = parseChangelog(`# What's new

Ignored: before any release.

## 2.0.0 — 1 January 2027

A new start.

### Games
- **Chess** arrives.
- Better CPUs.

## 1.9.9

- Fixes.
`);
    expect(notes).toEqual([
      {
        version: "2.0.0",
        date: "1 January 2027",
        intro: ["A new start."],
        sections: [{ title: "Games", items: ["**Chess** arrives.", "Better CPUs."] }],
      },
      { version: "1.9.9", date: null, intro: [], sections: [{ title: null, items: ["Fixes."] }] },
    ]);
  });

  it("puts the newest release first, and that's the site's version", () => {
    expect(VERSION).toBe(RELEASES[0].version);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("lists every version once, newest first, each with something in it", () => {
    const versions = RELEASES.map((r) => r.version.split(".").map(Number));
    for (let i = 1; i < versions.length; i++) {
      const [a, b] = [versions[i - 1], versions[i]];
      expect(a[0] * 1e6 + a[1] * 1e3 + a[2]).toBeGreaterThan(b[0] * 1e6 + b[1] * 1e3 + b[2]);
    }
    for (const r of RELEASES) expect(r.sections.flatMap((s) => s.items).length).toBeGreaterThan(0);
  });

  it("is the CHANGELOG.md at the repo root", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    expect(parseChangelog(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"))).toEqual(RELEASES);
  });
});
