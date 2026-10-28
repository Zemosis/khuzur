import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import MainMenu from "../../src/pages/MainMenu";
import { VERSION } from "../../src/utils/changelog";

let stats;
const { auth } = vi.hoisted(() => ({ auth: { isGuest: true, updateProfile: null, signOut: null, extra: {} } }));

vi.mock("../../src/utils/socket", () => ({ socket: {}, connectSocket: () => {} }));
const { credits } = vi.hoisted(() => ({ credits: { balance: 2340, notice: null } }));
// CLAIM tops the balance back up to 1,000: the server then says "over".
const claimed = () => ({ ...credits, balance: 1000, claim: { state: "over" } });
vi.mock("../../src/lib/api", () => ({
  api: vi.fn(async (path) => (path === "/notice" ? { ...credits, notice: null } : path === "/claim" ? claimed() : credits)),
}));
vi.mock("../../src/hooks/useServerStats", () => ({ useServerStats: () => stats }));
vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    identity: { name: "TESTER", tag: "0001", avatar: "1", level: 2, exp: 130, gold: 1250, ...auth.extra },
    isGuest: auth.isGuest,
    needsProfileSetup: false,
    signOut: auth.signOut,
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
  auth.extra = {};
  auth.updateProfile = vi.fn(async () => {});
  auth.signOut = vi.fn();
  stats = { connected: true, online: 3, tables: 2, ping: 12, lobbies: { thirteen: 2, muushig: 0 } };
});

describe("MainMenu", () => {
  it("shows the version from the patch notes, and links to them", () => {
    renderMenu();
    expect(screen.getByText(new RegExp(`v${VERSION.replace(/\./g, "\\.")} — patch`))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Patch notes" })).toHaveAttribute("href", "/patch-notes");
  });

  it("is branded Khuzur, with no kicker, tagline or per-game kickers", () => {
    renderMenu();
    expect(screen.getByText("KHUZUR")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CHOOSE YOUR GAME" })).toBeInTheDocument();
    expect(screen.queryByText("Card Hall")).not.toBeInTheDocument();
    expect(screen.queryByText(/dungeon-master/)).not.toBeInTheDocument();
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

  it("lists each painted slot in the player menu, and wears the one you pick", async () => {
    const user = userEvent.setup();
    auth.isGuest = false;
    const art = { pixels: Array.from({ length: 17 }, () => Array(17).fill("#f4c430")) };
    auth.extra = { avatar: "custom", customSlot: 1, customAvatar: art, avatarSlots: [art, null, art] };
    renderMenu();
    await user.click(screen.getByRole("button", { name: /TESTER #0001/ }));
    expect(screen.getByRole("menuitemradio", { name: "Painted avatar 1" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("menuitemradio", { name: "Painted avatar 2" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitemradio", { name: "Painted avatar 3" }));
    expect(auth.updateProfile).toHaveBeenCalledWith({ avatar: "custom", custom_slot: 3 });
  });

  it("SHOP opens the shop over the menu, and closing it goes back", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Shop" }));
    expect(screen.getByRole("dialog", { name: "Shop" })).toBeInTheDocument();
    expect(screen.getByText("CHOOSE YOUR GAME")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close the shop" }));
    expect(screen.queryByRole("dialog", { name: "Shop" })).not.toBeInTheDocument();
  });

  it("a link to /shop opens the menu with the shop on top", async () => {
    render(
      <MemoryRouter initialEntries={["/shop"]}>
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/shop" element={<MainMenu />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("dialog", { name: "Shop" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Shop" })).not.toBeInTheDocument();
    expect(screen.getByText("CHOOSE YOUR GAME")).toBeInTheDocument();
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

  it("keeps sign in / out off the top bar: they live in the player menu", async () => {
    const user = userEvent.setup();
    auth.isGuest = false;
    renderMenu();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /TESTER #0001/ }));
    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(auth.signOut).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("a guest signs in from the player menu", async () => {
    const user = userEvent.setup();
    renderMenu();
    expect(screen.queryByRole("button", { name: /^sign in$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /TESTER #0001/ }));
    await user.click(screen.getByRole("menuitem", { name: /sign in/i }));
    expect(screen.queryByRole("menu", { name: "Player menu" })).not.toBeInTheDocument();
  });

  it("Settings also signs you out", async () => {
    const user = userEvent.setup();
    auth.isGuest = false;
    renderMenu();
    await user.click(screen.getByTitle("Settings"));
    await user.click(screen.getByRole("button", { name: "SIGN OUT" }));
    expect(auth.signOut).toHaveBeenCalled();
    expect(screen.queryByText("SETTINGS")).not.toBeInTheDocument();
  });

  it("the game row's arrows stay hidden while every game fits", () => {
    renderMenu();
    expect(screen.queryByRole("button", { name: "More games" })).not.toBeInTheDocument();
    const prev = screen.getByLabelText("Previous games");
    expect(prev).toBeDisabled();
    expect(prev).not.toBeVisible();
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
    expect(screen.queryByTitle("Gold")).toBeNull();
    expect(screen.queryByText(/^LV /)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("signed in, the badge shows your level and your gold, and leaves the XP bar to the profile", () => {
    auth.isGuest = false;
    renderMenu();
    const badge = screen.getByRole("button", { name: /TESTER/ });
    expect(within(badge).getByText("LV 2")).toBeInTheDocument();
    expect(within(badge).queryByRole("progressbar")).toBeNull();
    expect(within(badge).getByTitle("Gold")).toHaveTextContent("1,250 gold");
  });

  it("shows your leaderboard rank beside your balance", async () => {
    auth.isGuest = false;
    credits.rank = 57;
    renderMenu();
    expect(await screen.findByTitle("Credits")).toHaveTextContent("2,340 CR · #57");
    credits.rank = null;
  });

  it("leaves the rank off outside the top 500", async () => {
    auth.isGuest = false;
    credits.rank = 501;
    renderMenu();
    expect(await screen.findByTitle("Credits")).toHaveTextContent(/^2,340 CR$/);
    credits.rank = null;
  });

  it("claiming tops you up: the loader, the amount floats off, and the chip locks", async () => {
    auth.isGuest = false;
    credits.balance = 240;
    credits.claim = { state: "ready", amount: 760 };
    renderMenu();
    const claim = await screen.findByRole("button", { name: "CLAIM +760 CR" });
    await userEvent.click(claim);
    // The pixel loader shows while it goes through, for long enough to see.
    expect(screen.getByRole("button", { name: "Claiming" })).toBeInTheDocument();
    expect(await screen.findByText("1,000 CR")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("+760 CR");
    expect(screen.queryByRole("button", { name: /CLAIM/ })).toBeNull();
    expect(screen.getByText(/full, claim under 1,000/)).toBeInTheDocument();
    credits.balance = 2340;
    credits.claim = undefined;
  });

  it("the claim chip is always there: locked over 1,000, a countdown while you wait, nothing for guests", async () => {
    auth.isGuest = false;
    credits.claim = { state: "over" };
    const { unmount } = renderMenu();
    expect(await screen.findByText(/full, claim under 1,000/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CLAIM/ })).toBeNull();
    unmount();
    credits.claim = { state: "wait", nextAt: new Date(Date.now() + 3_600_000).toISOString() };
    const second = renderMenu();
    expect(await screen.findByRole("timer", { name: "Next claim" })).toHaveTextContent(/NEXT CLAIM 0[01]:\d\d:\d\d/);
    second.unmount();
    auth.isGuest = true;
    renderMenu();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByText(/full, claim under/)).toBeNull();
    credits.claim = undefined;
  });

  it("shows a BLACKJACK tile that opens /lobby-blackjack", async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/lobby-blackjack" element={<p>blackjack lobby</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("1-5 PLAYERS")).toBeInTheDocument();
    await userEvent.click(screen.getByText("BLACKJACK"));
    expect(screen.getByText("blackjack lobby")).toBeInTheDocument();
  });

  it("RANKS opens the leaderboard, for guests too", async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/leaderboard" element={<p>leaderboard page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    expect(screen.getByText("leaderboard page")).toBeInTheDocument();
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
