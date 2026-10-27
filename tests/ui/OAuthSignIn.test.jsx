import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import AuthCallback from "../../src/pages/AuthCallback";
import LoginModal from "../../src/components/auth/LoginModal";

const { api, completeOAuth, signInWithOAuth, signIn } = vi.hoisted(() => ({
  api: vi.fn(),
  completeOAuth: vi.fn(),
  signInWithOAuth: vi.fn(),
  signIn: vi.fn(),
}));
vi.mock("../../src/lib/api", () => ({ api }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({ completeOAuth, signInWithOAuth, signIn, signUp: vi.fn(), createProfile: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/** Stands in for the profile: shows the address and what it was handed. */
function ProfileStub() {
  const { pathname, hash, state } = useLocation();
  return <div>PROFILE {pathname}{hash} {JSON.stringify(state)}</div>;
}

/** Lands on /auth/callback with the server's fragment. */
function land(fragment) {
  window.history.replaceState(null, "", `/auth/callback#${fragment}`);
  render(
    <MemoryRouter initialEntries={["/auth/callback"]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<div>MAIN MENU</div>} />
        <Route path="/join/:code" element={<div>JOIN PAGE</div>} />
        <Route path="/profile" element={<ProfileStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthCallback", () => {
  it("takes the token, wipes it from the address bar, and returns the player where they were", async () => {
    completeOAuth.mockResolvedValue({ username: "ANN" });
    land("token=jwt-1&returnTo=%2Fjoin%2FABC123");
    expect(await screen.findByText("JOIN PAGE")).toBeInTheDocument();
    expect(completeOAuth).toHaveBeenCalledExactlyOnceWith("jwt-1");
    expect(window.location.hash).toBe("");
  });

  it("sends a new player to the menu to pick a name first", async () => {
    completeOAuth.mockResolvedValue({ username: null });
    land("token=jwt-1&returnTo=%2Fjoin%2FABC123");
    expect(await screen.findByText("MAIN MENU")).toBeInTheDocument();
  });

  it.each([
    ["cancelled", "Sign in was cancelled."],
    ["no_email", /no verified email/],
    ["anything-else", "Sign in didn't work. Please try again."],
  ])("explains error=%s and offers the way back", async (code, message) => {
    land(`error=${code}`);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(completeOAuth).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "BACK TO MENU" }));
    expect(screen.getByText("MAIN MENU")).toBeInTheDocument();
  });

  it("a link goes back to the profile with how it went, signing nobody in", async () => {
    land("link=ok&provider=google&returnTo=%2Fprofile%23logins");
    expect(await screen.findByText(/PROFILE \/profile#logins/)).toHaveTextContent('{"link":"ok","provider":"google"}');
    expect(completeOAuth).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("a failed link goes back to the profile too, not to an error page", async () => {
    land("link=taken&provider=discord&returnTo=%2Fprofile%23logins");
    expect(await screen.findByText(/PROFILE/)).toHaveTextContent('{"link":"taken","provider":"discord"}');
  });

  it("a token the server won't accept is a failed sign in", async () => {
    completeOAuth.mockRejectedValue(new Error("401"));
    land("token=bad");
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in didn't work");
  });
});

describe("LoginModal provider buttons", () => {
  it("shows only the providers the server has set up, and they don't submit the form", async () => {
    api.mockResolvedValue({ providers: ["discord"] });
    render(
      <MemoryRouter>
        <LoginModal onClose={() => {}} />
      </MemoryRouter>,
    );
    const discord = await screen.findByRole("button", { name: /discord/i });
    expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /facebook/i })).toBeNull();
    await userEvent.setup().click(discord);
    expect(signInWithOAuth).toHaveBeenCalledWith("discord");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("no providers: no OR divider, no buttons", async () => {
    api.mockResolvedValue({ providers: [] });
    render(
      <MemoryRouter>
        <LoginModal onClose={() => {}} />
      </MemoryRouter>,
    );
    await Promise.resolve();
    expect(screen.queryByText("OR")).toBeNull();
  });
});
