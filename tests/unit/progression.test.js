import { describe, it, expect } from "vitest";
import {
  xpToNext,
  levelStart,
  levelForExp,
  levelProgress,
  matchReward,
  pokerHandReward,
  levelUpGold,
  applyGain,
} from "../../src/utils/progression.js";

describe("the level curve", () => {
  it("costs 50 XP more each level, from 100 up to 1,500", () => {
    expect([1, 2, 3, 4].map(xpToNext)).toEqual([100, 150, 200, 250]);
    expect(xpToNext(28)).toBe(1450);
    expect(xpToNext(29)).toBe(1500);
    expect(xpToNext(80)).toBe(1500);
  });

  it("starts each level where the last one ends", () => {
    expect(levelStart(1)).toBe(0);
    expect(levelStart(2)).toBe(100);
    expect(levelStart(10)).toBe(2700);
    for (let level = 1; level < 60; level++) {
      expect(levelForExp(levelStart(level))).toBe(level);
      expect(levelForExp(levelStart(level + 1) - 1)).toBe(level);
    }
  });

  it("reads progress into a level", () => {
    expect(levelProgress(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelProgress(99)).toEqual({ level: 1, into: 99, need: 100 });
    expect(levelProgress(130)).toEqual({ level: 2, into: 30, need: 150 });
  });
});

describe("match rewards", () => {
  const rewards = (players) => Array.from({ length: players }, (_, i) => matchReward({ place: i + 1, players }));

  it("pays the winner 70 XP and 80 gold, last place 30 and 20", () => {
    expect(rewards(2)).toEqual([{ xp: 70, gold: 80 }, { xp: 30, gold: 20 }]);
    expect(rewards(4)).toEqual([
      { xp: 70, gold: 80 },
      { xp: 57, gold: 60 },
      { xp: 43, gold: 40 },
      { xp: 30, gold: 20 },
    ]);
    expect(rewards(5)).toEqual([
      { xp: 70, gold: 80 },
      { xp: 60, gold: 65 },
      { xp: 50, gold: 50 },
      { xp: 40, gold: 35 },
      { xp: 30, gold: 20 },
    ]);
  });

  it("pays a poker hand, and more for winning it", () => {
    expect(pokerHandReward({ won: false })).toEqual({ xp: 4, gold: 3 });
    expect(pokerHandReward({ won: true })).toEqual({ xp: 6, gold: 8 });
  });
});

describe("level-ups", () => {
  it("pay 25 gold a level, doubled every 5th", () => {
    expect([2, 3, 4, 5, 10, 11].map(levelUpGold)).toEqual([50, 75, 100, 250, 500, 275]);
  });

  it("are counted when a reward crosses one or more levels", () => {
    expect(applyGain(90, { xp: 70, gold: 80 })).toEqual({
      xp: 70, gold: 80, levelUpGold: 50, expBefore: 90, expAfter: 160, levelBefore: 1, levelAfter: 2,
    });
    expect(applyGain(0, { xp: 450, gold: 0 })).toMatchObject({ levelBefore: 1, levelAfter: 4, levelUpGold: 50 + 75 + 100 });
    expect(applyGain(10, { xp: 30, gold: 20 })).toMatchObject({ levelUpGold: 0, levelAfter: 1 });
  });
});
