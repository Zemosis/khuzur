import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShopModal from "../../src/components/shop/ShopModal";

const { auth, api } = vi.hoisted(() => ({ auth: {}, api: vi.fn() }));
vi.mock("../../src/lib/api", () => ({ api }));
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => auth }));

const painting = { pixels: Array.from({ length: 17 }, () => Array(17).fill("#f4c430")) };

function signedIn({ gold = 2000, slots = 1 } = {}) {
  Object.assign(auth, {
    isGuest: false,
    profile: { coins: gold, avatar_slots: slots },
    identity: { gold, avatar: "custom", customSlot: 1, avatarSlots: [painting, ...Array(slots - 1).fill(null)] },
    applyProfile: vi.fn(),
  });
}

const props = () => ({ onClose: vi.fn(), onSignIn: vi.fn(), onPaint: vi.fn() });
const card = (n) => screen.getByRole("heading", { name: `Slot ${n}` }).closest("article");

beforeEach(() => {
  api.mockReset();
  signedIn();
});

describe("ShopModal", () => {
  it("is a dialog with your gold and the four sections, three of them SOON", () => {
    render(<ShopModal {...props()} />);
    expect(screen.getByRole("dialog", { name: "Shop" })).toBeInTheDocument();
    expect(screen.getByLabelText("2,000 gold")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Avatar slots", "Avatar bordersSOON", "TitlesSOON", "Card variantsSOON"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("shows slot 1 as yours, worn, and links it to the painter", async () => {
    const p = props();
    render(<ShopModal {...p} />);
    expect(within(card(1)).getByText("WEARING")).toBeInTheDocument();
    await userEvent.click(within(card(1)).getByRole("button", { name: /edit/i }));
    expect(p.onPaint).toHaveBeenCalledWith(1);
  });

  it("buys a slot in two clicks and takes the new profile", async () => {
    const after = { coins: 500, avatar_slots: 2 };
    api.mockResolvedValue({ profile: after });
    render(<ShopModal {...props()} />);

    await userEvent.click(within(card(2)).getByRole("button", { name: "Buy" }));
    expect(api).not.toHaveBeenCalled();
    await userEvent.click(within(card(2)).getByRole("button", { name: "Spend 1,500" }));

    expect(api).toHaveBeenCalledWith("/buy", { method: "POST", body: { itemId: "avatar_slot_2" }, base: "/api/shop" });
    expect(auth.applyProfile).toHaveBeenCalledWith(after);
    expect(await screen.findByRole("status")).toHaveTextContent("Avatar slot 2 is yours. Paint it!");
    // The price drops out of your gold, and the slot opens with a stamp.
    expect(screen.getByText("-1,500")).toBeInTheDocument();
    expect(within(card(2)).getByText("UNLOCKED!")).toBeInTheDocument();
    expect(card(2)).toHaveClass("slot-unlocked");
  });

  it("while the server sells it, SPEND shows the loader and ignores more clicks", async () => {
    let sell;
    api.mockReturnValue(new Promise((resolve) => (sell = resolve)));
    render(<ShopModal {...props()} />);
    await userEvent.click(within(card(2)).getByRole("button", { name: "Buy" }));
    await userEvent.click(within(card(2)).getByRole("button", { name: "Spend 1,500" }));
    const busy = within(card(2)).getByRole("button", { name: "Buying" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    await userEvent.click(busy);
    expect(api).toHaveBeenCalledTimes(1);
    sell({ profile: { coins: 500, avatar_slots: 2 } });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("BACK cancels a purchase", async () => {
    render(<ShopModal {...props()} />);
    await userEvent.click(within(card(2)).getByRole("button", { name: "Buy" }));
    await userEvent.click(within(card(2)).getByRole("button", { name: "Back" }));
    expect(within(card(2)).getByRole("button", { name: "Buy" })).toBeEnabled();
    expect(api).not.toHaveBeenCalled();
  });

  it("shows the server's refusal", async () => {
    api.mockRejectedValue(new Error("Not enough gold"));
    render(<ShopModal {...props()} />);
    await userEvent.click(within(card(2)).getByRole("button", { name: "Buy" }));
    await userEvent.click(within(card(2)).getByRole("button", { name: "Spend 1,500" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not enough gold");
  });

  it("sells slot 3 only after slot 2", () => {
    render(<ShopModal {...props()} />);
    expect(within(card(3)).getByRole("button", { name: "Buy slot 2 first" })).toBeDisabled();
  });

  it("says how much more gold you need", () => {
    signedIn({ gold: 1200 });
    render(<ShopModal {...props()} />);
    expect(within(card(2)).getByRole("button", { name: "Buy" })).toBeDisabled();
    expect(within(card(2)).getByText("300 more gold to go")).toBeInTheDocument();
  });

  it("offers to paint a bought slot that's still empty", async () => {
    signedIn({ slots: 2 });
    const p = props();
    render(<ShopModal {...p} />);
    expect(within(card(2)).getByText("OWNED")).toBeInTheDocument();
    await userEvent.click(within(card(2)).getByRole("button", { name: /paint it/i }));
    expect(p.onPaint).toHaveBeenCalledWith(2);
  });

  it("asks guests to sign in", async () => {
    Object.assign(auth, { isGuest: true, profile: null, identity: { gold: 0, avatar: "1" } });
    const p = props();
    render(<ShopModal {...p} />);
    expect(screen.queryByLabelText(/gold$/)).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /sign in to buy/i });
    expect(buttons).toHaveLength(3);
    await userEvent.click(buttons[0]);
    expect(p.onSignIn).toHaveBeenCalled();
  });

  it("shows the sections that aren't on sale as SOON", async () => {
    render(<ShopModal {...props()} />);
    await userEvent.click(screen.getByRole("tab", { name: /titles/i }));
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAccessibleName("Titles");
    expect(within(panel).getAllByText("SOON")).toHaveLength(3);
    expect(within(panel).queryByRole("button")).not.toBeInTheDocument();
  });

  it("closes on Escape, the X and the backdrop, but not a click inside", async () => {
    const p = props();
    render(<ShopModal {...p} />);
    await userEvent.click(screen.getByRole("dialog"));
    expect(p.onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Close the shop" }));
    await userEvent.click(screen.getByRole("dialog").parentElement);
    expect(p.onClose).toHaveBeenCalledTimes(3);
  });
});
