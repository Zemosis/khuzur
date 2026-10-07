import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import WaitingTable from "../../src/components/thirteen/WaitingTable";

// Avatars paint on a canvas; stand one in that shows which avatar it is.
vi.mock("../../src/components/PixelCard", async (importOriginal) => ({
  ...(await importOriginal()),
  PixelAvatar: ({ variant }) => <span data-testid="avatar">{String(variant)}</span>,
}));

const human = (name, variant) => ({ kind: "human", name, avatar: { variant, custom: null }, isHost: false, connected: true });
const say = (id, sender, isMe = false) => ({ id: `c${id}`, type: "CHAT", sender, text: `line ${id}`, timestamp: "12:00", isMe });

describe("waiting table chat", () => {
  it("shows each sender with their seat's avatar, and yours with your own", () => {
    render(
      <WaitingTable
        table={{
          name: "Hideout",
          code: "ABC123",
          isPrivate: false,
          isHost: true,
          mySeat: 0,
          seats: [human("ME #0001", "1"), human("ANN #0002", "4"), null, null, null],
        }}
        messages={[say(1, "ANN #0002"), say(2, "ME #0001", true), say(3, "GONE #0009")]}
        myFace={{ variant: "3", customAvatarData: null }}
        onSendMessage={() => {}}
        onExit={() => {}}
      />,
    );
    const avatarOf = (text) => within(screen.getByText(text).closest(".flex.gap-2")).getByTestId("avatar").textContent;
    expect(avatarOf("line 1")).toBe("4");
    expect(avatarOf("line 2")).toBe("3");
    // Someone no longer seated falls back to the default face.
    expect(avatarOf("line 3")).toBe("2");
  });

  it("a new message pops up over the sender's seat, but never over yours", () => {
    const table = {
      name: "Hideout",
      code: "ABC123",
      isPrivate: false,
      isHost: true,
      mySeat: 0,
      seats: [human("ME #0001", "1"), human("ANN #0002", "4"), null, null],
    };
    const props = { table, myFace: { variant: "3", customAvatarData: null }, onSendMessage: () => {}, onExit: () => {} };
    const { rerender } = render(<WaitingTable {...props} messages={[say(1, "ANN #0002")]} />);
    // What was said before you arrived doesn't pop up.
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    rerender(<WaitingTable {...props} messages={[say(1, "ANN #0002"), say(2, "ANN #0002"), say(3, "ME #0001", true)]} />);
    expect(screen.getByRole("note", { name: "ANN says" })).toHaveTextContent("line 2");
    // Yours never pops up over your own seat.
    expect(screen.queryByRole("note", { name: "ME says" })).not.toBeInTheDocument();
  });
});
