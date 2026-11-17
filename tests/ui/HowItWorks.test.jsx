import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import HowItWorks from "../../src/pages/HowItWorks";
import { PARTS } from "../../src/pages/howItWorks/chapters";

/** Shows the address's ?query, so a test can read it. */
function Where() {
  return <span aria-label="address">{useLocation().search}</span>;
}

const renderPage = (url = "/how-it-works") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/how-it-works"
          element={
            <>
              <HowItWorks />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

const tree = () => screen.getByRole("navigation", { name: "Chapters" });
const chapters = PARTS.flatMap((p) => p.chapters);

describe("HowItWorks", () => {
  it("opens on the first chapter, every part's chapters listed in the tree", () => {
    renderPage();
    expect(screen.getByRole("article", { name: chapters[0].title })).toBeInTheDocument();
    for (const c of chapters) expect(within(tree()).getByRole("button", { name: new RegExp(c.title) })).toBeInTheDocument();
  });

  it("covers the randomness, every game's CPU, the AI concepts and the evidence", () => {
    const ids = chapters.map((c) => c.id);
    for (const id of ["randomness", "hidden", "agents", "search", "probability", "optimization", "thirteen", "muushig", "poker", "khuzur", "blackjack", "simulations", "shuffle-tests", "rewards"]) {
      expect(ids).toContain(id);
    }
  });

  it("opens a chapter from the tree, keeps it in the address, and lists its sections", async () => {
    const user = userEvent.setup();
    renderPage();
    const khuzur = chapters.find((c) => c.id === "khuzur");
    await user.click(within(tree()).getByRole("button", { name: /Khuzur/ }));
    expect(screen.getByLabelText("address")).toHaveTextContent("?c=khuzur");
    const article = screen.getByRole("article", { name: "Khuzur" });
    for (const s of khuzur.sections) {
      expect(within(article).getByRole("region", { name: s.title })).toBeInTheDocument();
      expect(within(tree()).getByRole("button", { name: s.title })).toBeInTheDocument();
    }
  });

  it("links straight to a chapter, and steps to the next one", async () => {
    const user = userEvent.setup();
    renderPage("/how-it-works?c=probability");
    expect(screen.getByRole("article", { name: "Probability and Bayesian inference" })).toBeInTheDocument();
    const at = chapters.findIndex((c) => c.id === "probability");
    await user.click(within(screen.getByRole("navigation", { name: "Other chapters" })).getByRole("button", { name: new RegExp(chapters[at + 1].title) }));
    expect(screen.getByLabelText("address")).toHaveTextContent(`?c=${chapters[at + 1].id}`);
  });
});
