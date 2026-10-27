import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LinkedLogins from "../../src/components/profile/LinkedLogins";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../src/lib/api", () => ({
  api,
  oauthStartUrl: (provider, returnTo) => `https://server.test/api/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`,
}));

let logins;
let assign;
beforeEach(() => {
  logins = { password: true, providers: [] };
  api.mockReset();
  api.mockImplementation(async (path, opts) => {
    if (path === "/logins") return logins;
    if (path === "/oauth/providers") return { providers: ["google", "discord"] };
    if (path === "/link-ticket") return { ticket: "tk.1" };
    if (opts?.method === "DELETE") return { password: true, providers: [] };
    throw new Error(`unexpected ${path}`);
  });
  assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

const renderAt = (state) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/profile", hash: "#logins", state }]}>
      <Routes>
        <Route path="/profile" element={<LinkedLogins />} />
      </Routes>
    </MemoryRouter>,
  );
const row = (name) => screen.getByText(name).closest("li");

describe("LinkedLogins", () => {
  it("lists the password and each provider, and says how to unlock credits", async () => {
    renderAt();
    expect(await within(row("Email and password")).findByText("Set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link Discord" })).toBeInTheDocument();
    expect(screen.getByText(/Link Google or Discord to play for credits/)).toBeInTheDocument();
  });

  it("LINK fetches a ticket and goes to the provider with it, returning to the profile", async () => {
    renderAt();
    await userEvent.click(await screen.findByRole("button", { name: "Link Google" }));
    expect(api).toHaveBeenCalledWith("/link-ticket", { method: "POST" });
    expect(assign).toHaveBeenCalledWith("https://server.test/api/auth/oauth/google?returnTo=%2Fprofile%23logins&link=tk.1");
  });

  it("shows a linked provider, and unlinks it after a second press", async () => {
    logins = { password: true, providers: ["google"] };
    renderAt();
    await screen.findByText("Google");
    expect(await within(row("Google")).findByText("Linked")).toBeInTheDocument();
    expect(screen.getByText(/Credit play is unlocked/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unlink Google" }));
    expect(api).not.toHaveBeenCalledWith("/logins/google", { method: "DELETE" });
    await userEvent.click(screen.getByRole("button", { name: "Sure?" }));
    expect(api).toHaveBeenCalledWith("/logins/google", { method: "DELETE" });
    expect(await screen.findByRole("status")).toHaveTextContent("Google is unlinked.");
    expect(screen.getByRole("button", { name: "Link Google" })).toBeInTheDocument();
  });

  it("shows the server's refusal to drop the last way in", async () => {
    logins = { password: false, providers: ["google"] };
    api.mockImplementation(async (path, opts) => {
      if (path === "/logins") return logins;
      if (path === "/oauth/providers") return { providers: ["google"] };
      if (opts?.method === "DELETE") throw new Error("It's your only way to sign in. Link another one first");
    });
    renderAt();
    await userEvent.click(await screen.findByRole("button", { name: "Unlink Google" }));
    await userEvent.click(screen.getByRole("button", { name: "Sure?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("only way to sign in");
    expect(within(row("Email and password")).getByText("None")).toBeInTheDocument();
  });

  it.each([
    ["ok", "google", "Google is linked. You can sign in with it, and play for credits."],
    ["taken", "google", "That Google account already belongs to another player."],
    ["exists", "discord", "This account already has a Discord login. Unlink it first."],
    ["expired", "google", "That took too long. Press LINK again."],
    ["cancelled", "discord", "Linking Discord was cancelled."],
    ["failed", "google", "Linking Google didn't work. Please try again."],
  ])("after a link (%s) it says how it went", async (link, provider, text) => {
    renderAt({ link, provider });
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
