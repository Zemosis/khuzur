import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import MainMenu from "../../src/pages/MainMenu";

let stats;
const { auth } = vi.hoisted(() => ({ auth: { isGuest: true, updateProfile: null } }));

vi.mock("../../src/utils/socket", () => ({ socket: {}, connectSocket: () => {} }));
const { credits } = vi.hoisted(() => ({ credits: { balance: 2340, notice: null } }));
vi.mock("../../src/lib/api", () => ({ api: vi.fn(async (path) => (path === "/notice" ? { ...credits, notice: null } : credits)) }));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => stats }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    identity: { name: "TESTER", tag: "0001", avatar: "1" },
    isGuest: auth.isGuest,
    needsProfileSetup: false,
    signOut: () => {},
    updateProfile: auth.updateProfile,
  }),
}));

const renderMenu = () =>
  render(
    <MemoryRouter>
      <MainMenu />
    </MemoryRouter>,
  );

beforeEach(() => {
  auth.isGuest = true;
  auth.updateProfile = vi.fn(async () => {});
  stats = { connected: true, online: 3, tables: 2, ping: 12, lobbies: { thirteen: 2, muushig: 0 } };
});

describe("MainMenu", () => {
  it("is branded Khuzur, with a Card Hall kicker and no per-game kickers", () => {
    renderMenu();
    expect(screen.getByText("KHUZUR")).toBeInTheDocument();
    expect(screen.getByText("Card Hall")).toBeInTheDocument();
    expect(screen.queryByText(/CARD-LORE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tien Len/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mongolian Trickster/)).not.toBeInTheDocument();
  });

  it("shows live open-lobby counts instead of play counts", () => {
    renderMenu();
    expect(screen.getByText("2 lobbies open")).toBeInTheDocument();
    expect(screen.getByText("0 lobbies open")).toBeInTheDocument();
    expect(screen.queryByText(/plays/)).not.toBeInTheDocument();
  });

  it("uses the singular for one lobby and a dash when offline", () => {
    stats = { ...stats, lobbies: { thirteen: 1, muushig: 0 } };
    const { unmount } = renderMenu();
    expect(screen.getByText("1 lobby open")).toBeInTheDocument();
    unmount();

    stats = { connected: false, online: null, tables: null, ping: null };
    renderMenu();
    expect(screen.queryByText(/lobb(y|ies) open/)).not.toBeInTheDocument();
  });

  const renderWithProfileRoute = () =>
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/profile" element={<div>PROFILE PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );

  it("the player badge is one button that opens the player menu", async () => {
    const user = userEvent.setup();
    auth.isGuest = false;
    renderWithProfileRoute();
    const badge = screen.getByRole("button", { name: /TESTER #0001/ });
    expect(badge).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(badge);
    expect(badge).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Player menu" });
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(5);
    expect(within(menu).getByRole("menuitemradio", { name: "Avatar 1" })).toHaveAttribute("aria-checked", "true");

    await user.click(within(menu).getByRole("menuitem", { name: /view profile/i }));
    expect(screen.getByText("PROFILE PAGE")).toBeInTheDocument();
  });

  it("switches your avatar straight from the player menu", async () => {
    const user = userEvent.setup();
    auth.isGuest = false;
    renderMenu();
    await user.click(screen.getByRole("button", { name: /TESTER #0001/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Avatar 3" }));
    expect(auth.updateProfile).toHaveBeenCalledWith({ avatar: "3" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("a guest's menu explains avatars need an account, and still links the profile", async () => {
    const user = userEvent.setup();
    renderWithProfileRoute();
    await user.click(screen.getByRole("button", { name: /TESTER #0001/ }));
    const menu = screen.getByRole("menu", { name: "Player menu" });
    expect(within(menu).queryByRole("menuitemradio")).not.toBeInTheDocument();
    expect(within(menu).getByText(/sign in to choose an avatar/i)).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: /view profile/i }));
    expect(screen.getByText("PROFILE PAGE")).toBeInTheDocument();
  });

  it("closes the player menu on Escape or a click outside", async () => {
    const user = userEvent.setup();
    auth.isGuest = false;
    renderMenu();
    const badge = screen.getByRole("button", { name: /TESTER #0001/ });
    await user.click(badge);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Player menu" })).not.toBeInTheDocument();
    await user.click(badge);
    await user.click(screen.getByText("KHUZUR"));
    expect(screen.queryByRole("menu", { name: "Player menu" })).not.toBeInTheDocument();
  });

  it("opens either game's rulebook from the Rules picker", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /rules/i }));
    const menu = screen.getByRole("menu", { name: /rulebook/i });
    await user.click(within(menu).getByRole("menuitem", { name: /thirteen/i }));
    expect(screen.getByRole("dialog", { name: "HOW TO PLAY THIRTEEN" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /rules/i }));
    await user.click(screen.getByRole("menuitem", { name: /muushig/i }));
    expect(screen.getByRole("dialog", { name: "HOW TO PLAY MUUSHIG" })).toBeInTheDocument();
  });

  it("a signed-in player sees their credit balance on their badge", async () => {
    auth.isGuest = false;
    renderMenu();
    expect(await screen.findByText("2,340 CR")).toBeInTheDocument();
  });

  it("a guest's badge has no balance", () => {
    renderMenu();
    expect(screen.queryByText(/ CR$/)).toBeNull();
  });

  it("after a restart the main menu says where your table credits went", async () => {
    auth.isGuest = false;
    credits.notice = { amount: 600, tableName: "Felt" };
    renderMenu();
    expect(await screen.findByText("The server restarted. Your 600 credits from table Felt are back in your balance.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByText(/The server restarted/)).toBeNull();
    credits.notice = null;
  });
});
