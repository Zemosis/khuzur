import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WaitingTable from "../../src/components/thirteen/WaitingTable";
import { positionOf } from "../../src/utils/seatPosition";

const human = (name, extra = {}) => ({ kind: "human", name, avatar: { variant: "2", custom: null }, isHost: false, connected: true, ...extra });

const table = (over = {}) => ({
  lobbyId: "PUB-ABC123",
  name: "Khuzur's Hideout",
  isPrivate: false,
  status: "waiting",
  code: "ABC123",
  mySeat: 0,
  isHost: true,
  seats: [human("HOSTY #0001", { isHost: true }), { kind: "cpu", name: "Bot Saturn", level: "MEDIUM" }, null, human("PAL #0002", { connected: false })],
  ...over,
});

const props = (over = {}) => ({
  table: table(),
  messages: [],
  onSendMessage: vi.fn(),
  onExit: vi.fn(),
  onAddCpu: vi.fn(),
  onRemoveCpu: vi.fn(),
  onSetCpuLevel: vi.fn(),
  onStart: vi.fn(),
  ...over,
});

describe("a five-seat (Muushig) table", () => {
  const five = (over = {}) =>
    table({
      gameType: "muushig",
      mySeat: 2,
      seats: [human("ANN #0001", { isHost: true }), null, human("ME #0003"), { kind: "cpu", name: "Bot Saturn" }, null],
      ...over,
    });

  it("seats me at the bottom and the other four around the table, clockwise", () => {
    expect([0, 1, 2, 3, 4].map((s) => positionOf(s, 2, 5))).toEqual(["topRight", "bottomRight", "bottom", "bottomLeft", "topLeft"]);
    render(<WaitingTable {...props({ table: five() })} title="MUUSHIG" />);
    expect(screen.getByText("MUUSHIG")).toBeInTheDocument();
    expect(screen.getByText(/3\/5 seated/)).toBeInTheDocument();
    for (const name of ["ANN", "ME", "Bot Saturn"]) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getAllByText("EMPTY SEAT")).toHaveLength(2);
  });

  it("can start alone: START fills the empty seats with MEDIUM CPUs", () => {
    render(<WaitingTable {...props({ table: five({ seats: [null, null, human("ME #0003", { isHost: true }), null, null] }) })} title="MUUSHIG" fillsEmptySeats />);
    expect(screen.getByRole("button", { name: /start game/i })).toBeEnabled();
    expect(screen.getByText("Empty seats are filled with MEDIUM CPUs when you start.")).toBeInTheDocument();
  });

  it("lets a non-host see every seat but no host controls", () => {
    render(<WaitingTable {...props({ table: five({ isHost: false }) })} title="MUUSHIG" />);
    expect(screen.queryByRole("button", { name: /add \w+ cpu/i })).toBeNull();
    expect(screen.getByText(/waiting for ANN to start/i)).toBeInTheDocument();
  });
});

describe("positionOf", () => {
  it("puts my seat at the bottom and the rest clockwise like the live table", () => {
    expect([0, 1, 2, 3].map((s) => positionOf(s, 0))).toEqual(["bottom", "left", "top", "right"]);
    expect([0, 1, 2, 3].map((s) => positionOf(s, 2))).toEqual(["top", "right", "bottom", "left"]);
  });

  it("seats 2 across from each other and 3 left and right", () => {
    expect([0, 1].map((s) => positionOf(s, 1, 2))).toEqual(["top", "bottom"]);
    expect([0, 1, 2].map((s) => positionOf(s, 0, 3))).toEqual(["bottom", "left", "right"]);
    expect([0, 1, 2].map((s) => positionOf(s, 2, 3))).toEqual(["left", "right", "bottom"]);
  });
});

describe("WaitingTable", () => {
  it("shows every seat: humans, CPUs, an empty shadow seat and a reconnecting player", () => {
    render(<WaitingTable {...props()} />);
    expect(screen.getByText("HOSTY")).toBeInTheDocument();
    expect(screen.getByText("Bot Saturn")).toBeInTheDocument();
    expect(screen.getByText("EMPTY SEAT")).toBeInTheDocument();
    expect(screen.getByText("PAL")).toBeInTheDocument();
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
    expect(screen.getByText(/3\/4 seated/)).toBeInTheDocument();
  });

  it("gives the host add, remove and start controls", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<WaitingTable {...p} />);
    await user.click(screen.getByRole("button", { name: "Add HARD CPU to seat 3" }));
    expect(p.onAddCpu).toHaveBeenCalledWith(2, "HARD");
    await user.click(screen.getByRole("button", { name: "Remove Bot Saturn" }));
    expect(p.onRemoveCpu).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole("button", { name: /start game/i }));
    expect(p.onStart).toHaveBeenCalled();
  });

  it("the host taps a CPU's level to cycle it", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<WaitingTable {...p} />);
    await user.click(screen.getByRole("button", { name: "Bot Saturn: MEDIUM. Change level" }));
    expect(p.onSetCpuLevel).toHaveBeenCalledWith(1, "HARD");
  });

  it("others see a CPU's level but can't change it", () => {
    render(<WaitingTable {...props({ table: table({ isHost: false, mySeat: 3 }) })} />);
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change level/i })).not.toBeInTheDocument();
  });

  it("Thirteen can't start until 2 seats are filled; empty seats stay empty", () => {
    render(<WaitingTable {...props({ table: table({ seats: [human("HOSTY #0001", { isHost: true }), null, null, null] }) })} />);
    expect(screen.getByRole("button", { name: /start game/i })).toBeDisabled();
    expect(screen.getByText("Start with 2 to 4 players. Empty seats stay empty.")).toBeInTheDocument();
  });

  it("copies the code and the invite link", async () => {
    // userEvent.setup() installs a clipboard stub on navigator; spy on it.
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    render(<WaitingTable {...props()} />);
    await user.click(screen.getByRole("button", { name: /copy code/i }));
    expect(write).toHaveBeenLastCalledWith("ABC123");
    await user.click(screen.getByRole("button", { name: /copy invite link/i }));
    expect(write).toHaveBeenLastCalledWith(`${window.location.origin}/join/ABC123`);
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("a non-host waits for the host and gets no host controls", () => {
    render(
      <WaitingTable
        {...props({
          table: table({ mySeat: 3, isHost: false, seats: [human("HOSTY #0001", { isHost: true }), null, null, human("ME #0003")] }),
        })}
      />,
    );
    expect(screen.getByText("Waiting for HOSTY to start")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start game/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add \w+ cpu/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("EMPTY SEAT")).toHaveLength(2);
  });

  it("START can only be pressed once, until the server rejects it", async () => {
    const user = userEvent.setup();
    const p = props();
    const { rerender } = render(<WaitingTable {...p} />);
    const start = screen.getByRole("button", { name: /start game/i });
    await user.click(start);
    await user.click(start);
    expect(p.onStart).toHaveBeenCalledTimes(1);
    expect(start).toBeDisabled();
    rerender(<WaitingTable {...p} errorMessage="Only the host can do that" />);
    expect(screen.getByRole("button", { name: /start game/i })).toBeEnabled();
  });

  it("shows a rejected command's reason", () => {
    render(<WaitingTable {...props({ errorMessage: "That seat isn't empty" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("That seat isn't empty");
  });
});
