import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import PatchNotes from "../../src/pages/PatchNotes";
import { RELEASES, VERSION } from "../../src/utils/changelog";

/** Shows the address's ?query, so a test can read it. */
function Where() {
  return <span aria-label="address">{useLocation().search}</span>;
}

const renderNotes = (url = "/patch-notes") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/patch-notes"
          element={
            <>
              <PatchNotes />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

const esc = (v) => v.replace(/\./g, "\\.");
const lineOf = (v) => v.split(".").slice(0, 2).join(".");
const tree = () => screen.getByRole("navigation", { name: "Versions" });
const versionBtn = (v) => within(tree()).getByRole("button", { name: new RegExp(`^v${esc(v)}(?![.\\d])`) });
const lineBtn = (l) => within(tree()).getByRole("button", { name: new RegExp(`^v${esc(l)}(?![.\\d])`) });
const notes = () => screen.getByRole("article");
const older = RELEASES.find((r) => lineOf(r.version) !== lineOf(VERSION) && r.sections.some((s) => s.title));

describe("PatchNotes", () => {
  it("shows the newest version's notes, marked live, with its line open in the tree", () => {
    renderNotes();
    expect(screen.getByRole("heading", { name: `v${VERSION}` })).toBeInTheDocument();
    expect(notes()).toHaveAccessibleName(`v${VERSION}`);
    expect(versionBtn(VERSION)).toHaveAttribute("aria-current", "page");
    expect(lineBtn(lineOf(VERSION))).toHaveAttribute("aria-expanded", "true");
    expect(lineBtn(lineOf(older.version))).toHaveAttribute("aria-expanded", "false");
    // Only one version's notes at a time.
    const items = RELEASES[0].sections.reduce((n, s) => n + s.items.length, 0);
    expect(within(notes()).getAllByRole("listitem")).toHaveLength(items);
  });

  it("picking a version in the tree shows its notes and puts it in the address", async () => {
    renderNotes();
    await userEvent.click(lineBtn(lineOf(older.version)));
    await userEvent.click(versionBtn(older.version));
    expect(notes()).toHaveAccessibleName(`v${older.version}`);
    expect(versionBtn(older.version)).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("address")).toHaveTextContent(`?v=${older.version}`);
    // The version you read lists its sections in the tree.
    const firstTitle = older.sections.find((s) => s.title).title;
    expect(within(tree()).getByRole("button", { name: firstTitle })).toBeInTheDocument();
  });

  it("opens the version in the address, with its line open", () => {
    renderNotes(`/patch-notes?v=${older.version}`);
    expect(notes()).toHaveAccessibleName(`v${older.version}`);
    expect(lineBtn(lineOf(older.version))).toHaveAttribute("aria-expanded", "true");
  });

  it("OLDER and NEWER step through the versions", async () => {
    renderNotes();
    await userEvent.click(screen.getByRole("button", { name: `Older v${RELEASES[1].version}` }));
    expect(notes()).toHaveAccessibleName(`v${RELEASES[1].version}`);
    await userEvent.click(screen.getByRole("button", { name: `Newer v${VERSION}` }));
    expect(notes()).toHaveAccessibleName(`v${VERSION}`);
    expect(screen.queryByRole("button", { name: /^Newer/ })).not.toBeInTheDocument();
  });

  it("expand all and collapse all open and close every line", async () => {
    renderNotes();
    await userEvent.click(screen.getByRole("button", { name: "Expand all" }));
    const lines = [...new Set(RELEASES.map((r) => lineOf(r.version)))];
    expect(lines.map((l) => lineBtn(l).getAttribute("aria-expanded"))).toEqual(lines.map(() => "true"));
    expect(within(tree()).getAllByRole("button", { name: /^v\d+\.\d+\.\d+/ })).toHaveLength(RELEASES.length);
    await userEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(within(tree()).queryAllByRole("button", { name: /^v\d+\.\d+\.\d+/ })).toHaveLength(0);
  });

  it("the filter narrows the tree and the notes to what matches, marked", async () => {
    renderNotes();
    await userEvent.type(screen.getByRole("searchbox", { name: /filter/i }), "padlock");
    expect(screen.getByRole("status")).toHaveTextContent("1 note matches");
    const items = within(notes()).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(within(items[0]).getByText("padlock")).toHaveProperty("tagName", "MARK");
    await userEvent.click(screen.getByRole("button", { name: "Clear the filter" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("filtering jumps to the first version that matches", async () => {
    renderNotes();
    await userEvent.type(screen.getByRole("searchbox", { name: /filter/i }), "Thirteen for credits");
    const first = RELEASES.find((r) => r.sections.some((s) => s.title?.includes("Thirteen for credits")));
    expect(notes()).toHaveAccessibleName(`v${first.version}`);
  });

  it("says when nothing matches", async () => {
    renderNotes();
    await userEvent.type(screen.getByRole("searchbox", { name: /filter/i }), "zzzqqq");
    expect(screen.getByRole("status")).toHaveTextContent("No notes match");
    expect(screen.getByText(/Nothing in the notes mentions "zzzqqq"/)).toBeInTheDocument();
  });
});
