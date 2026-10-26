import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AvatarPaint from "../../src/pages/AvatarPaint";

const { auth } = vi.hoisted(() => ({ auth: {} }));
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => auth }));

const art = { pixels: Array.from({ length: 17 }, () => Array(17).fill("#ff0000")) };

beforeEach(() => {
  Object.assign(auth, {
    isGuest: false,
    loading: false,
    profile: { avatar: "custom", custom_slot: 1, avatar_slots: 2, extra_avatars: [], coins: 100 },
    identity: { name: "ME", tag: "0001", avatar: "custom", customSlot: 1, customAvatar: art, avatarSlots: [art, null], customColors: [], gold: 100 },
    updateProfile: vi.fn(async () => {}),
  });
});

const renderAt = (url) =>
  render(
    <MemoryRouter initialEntries={["/", url]} initialIndex={1}>
      <Routes>
        <Route path="/" element={<p>menu</p>} />
        <Route path="/avatar-paint" element={<AvatarPaint />} />
        <Route path="/shop" element={<p>shop</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe("AvatarPaint storage", () => {
  it("opens on the slot you wear, and saves your drawing into an empty bought slot", async () => {
    renderAt("/avatar-paint");
    expect(screen.getByText("Saving to slot 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SAVE" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Save to empty slot 2" }));
    expect(screen.getByText("Saving to slot 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "SAVE" }));

    expect(auth.updateProfile).toHaveBeenCalledWith({
      extra_avatars: [{ v: 3, pixels: art.pixels.flat() }],
      avatar: "custom",
      custom_slot: 2,
    });
  });

  it("?slot= opens that slot", () => {
    renderAt("/avatar-paint?slot=2");
    expect(screen.getByText("Saving to slot 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to empty slot 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("slot 1 still saves to the first painting", async () => {
    auth.identity = { ...auth.identity, avatarSlots: [null, null], customAvatar: null, avatar: "1" };
    renderAt("/avatar-paint");
    await userEvent.click(screen.getByRole("button", { name: "+ NEW" }));
    await userEvent.click(screen.getByRole("button", { name: "SAVE" }));
    expect(auth.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ avatar: "custom", custom_slot: 1, custom_avatar: expect.any(Object) }));
  });

  it("a locked slot opens the shop over the painter, and PAINT IT comes back to that slot", async () => {
    renderAt("/avatar-paint");
    await userEvent.click(screen.getByRole("button", { name: "Slot 3 is locked: buy it in the shop for 3,000 gold" }));
    expect(screen.getByRole("dialog", { name: "Shop" })).toBeInTheDocument();
    expect(screen.queryByText("shop")).not.toBeInTheDocument(); // still on the painter's route
    expect(screen.getByText("Saving to slot 1")).toBeInTheDocument();

    // Slot 2 is already owned here: PAINT IT closes the shop and opens it.
    const slot2 = screen.getByRole("heading", { name: "Slot 2" }).closest("article");
    await userEvent.click(within(slot2).getByRole("button", { name: /paint it/i }));
    expect(screen.queryByRole("dialog", { name: "Shop" })).not.toBeInTheDocument();
    expect(screen.getByText("Saving to slot 2")).toBeInTheDocument();
  });

  it("closing the shop leaves you on the painter", async () => {
    renderAt("/avatar-paint");
    await userEvent.click(screen.getByRole("button", { name: /Slot 3 is locked/ }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Shop" })).not.toBeInTheDocument();
    expect(screen.getByText("Saving to slot 1")).toBeInTheDocument();
  });
});
