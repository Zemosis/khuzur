import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PatchNotes from "../../src/pages/PatchNotes";
import { RELEASES, VERSION } from "../../src/utils/changelog";

describe("PatchNotes", () => {
  it("lists every release, newest first, the newest marked live", () => {
    render(
      <MemoryRouter>
        <PatchNotes />
      </MemoryRouter>,
    );
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent).filter((t) => t.startsWith("v"));
    expect(headings).toEqual(RELEASES.map((r) => `v${r.version}`));
    const newest = screen.getByRole("region", { name: `v${VERSION}` });
    expect(within(newest).getByText("Live now")).toBeInTheDocument();
    expect(screen.getAllByText("Live now")).toHaveLength(1);
  });
});
