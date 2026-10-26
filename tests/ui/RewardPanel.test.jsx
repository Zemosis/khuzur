import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import RewardPanel, { HandReward } from "../../src/components/RewardPanel";
import { setReducedMotion } from "../../src/utils/motion";

const auth = vi.hoisted(() => ({ isGuest: false, fetchProfile: vi.fn() }));
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => auth }));

const reward = (over = {}) => ({ userId: "u1", xp: 57, gold: 60, levelUpGold: 0, expBefore: 20, expAfter: 77, levelBefore: 1, levelAfter: 1, ...over });

describe("RewardPanel", () => {
  beforeEach(() => {
    auth.isGuest = false;
    auth.fetchProfile = vi.fn(async () => ({}));
  });

  it("says it's adding up while the match is saved", () => {
    render(<RewardPanel reward={undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("ADDING UP YOUR REWARDS...");
    expect(auth.fetchProfile).not.toHaveBeenCalled();
  });

  it("shows the XP and gold, the bar where it ended, and refreshes the profile", () => {
    render(<RewardPanel reward={reward()} />);
    expect(screen.getByText("+57 XP")).toBeInTheDocument();
    expect(screen.getByText("+60 GOLD")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "77");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("LV 1")).toBeInTheDocument();
    expect(screen.queryByText("LEVEL UP!")).not.toBeInTheDocument();
    expect(auth.fetchProfile).toHaveBeenCalledTimes(1);
  });

  it("levels up past the end of the bar, with the level's gold", () => {
    render(<RewardPanel reward={reward({ xp: 70, gold: 80, expBefore: 90, expAfter: 160, levelAfter: 2, levelUpGold: 50 })} />);
    expect(screen.getByText("LEVEL UP!")).toBeInTheDocument();
    expect(screen.getByText("+50 GOLD")).toBeInTheDocument();
    expect(screen.getAllByText(/LV 2/)).toHaveLength(2); // the badge and the banner
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60"); // 160 is 60 into level 2
  });

  it("rolls the bar up from where you were, with full animations", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      render(<RewardPanel reward={reward()} />);
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");
      expect(screen.getByText("+0 XP")).toBeInTheDocument();
    } finally {
      setReducedMotion(true);
      vi.useRealTimers();
    }
  });

  it("shows nothing for a seat that earned nothing, and asks a guest to sign in", () => {
    const { container } = render(<RewardPanel reward={null} />);
    expect(container).toBeEmptyDOMElement();
    auth.isGuest = true;
    render(<RewardPanel reward={undefined} />);
    expect(screen.getByText("SIGN IN TO EARN XP AND GOLD")).toBeInTheDocument();
  });

  it("says why a match against CPUs alone paid nothing", () => {
    render(<RewardPanel reward={{ userId: "u1", unpaid: "cpus" }} />);
    expect(screen.getByText(/NO XP OR GOLD: ONLY CPUS PLAYED TO THE END/)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(auth.fetchProfile).not.toHaveBeenCalled();
  });
});

describe("HandReward", () => {
  it("shows a poker hand's pay, then clears itself", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    try {
      render(<HandReward reward={reward({ xp: 4, gold: 3, expBefore: 0, expAfter: 4 })} onDone={onDone} />);
      expect(screen.getByText("+4 XP")).toBeInTheDocument();
      expect(screen.getByText("+3 GOLD")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1600));
      expect(onDone).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds a level-up a little longer", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    try {
      render(<HandReward reward={reward({ xp: 6, gold: 8, expBefore: 98, expAfter: 104, levelAfter: 2, levelUpGold: 50 })} onDone={onDone} />);
      expect(screen.getByText("LEVEL UP!")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1600));
      expect(onDone).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(2400));
      expect(onDone).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
