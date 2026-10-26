// PROGRESSION — XP, levels and gold. One copy runs on the server, which pays
// the rewards (server/game/progression.js), and one in the browser, which
// draws the XP bars; tests/unit/rules-copies.test.js keeps them identical.
//
// A profile keeps its total XP; the level follows from it. Each level costs
// 50 XP more than the last, from 100 up to 1,500, and then 1,500 a level.

const FIRST_STEP = 100;
const STEP_GROWTH = 50;
const MAX_STEP = 1500;

/** XP to go from `level` to the next one. */
export function xpToNext(level) {
  return Math.min(FIRST_STEP + STEP_GROWTH * (level - 1), MAX_STEP);
}

/** Total XP at which `level` starts (level 1 starts at 0). */
export function levelStart(level) {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

/** The level a total of `exp` XP reaches. */
export function levelForExp(exp) {
  let level = 1;
  let start = 0;
  while (start + xpToNext(level) <= exp) start += xpToNext(level++);
  return level;
}

/** Where `exp` stands: { level, into: XP into the level, need: XP the level costs }. */
export function levelProgress(exp) {
  const level = levelForExp(exp);
  return { level, into: exp - levelStart(level), need: xpToNext(level) };
}

/**
 * A Thirteen or Muushig match: `place` out of `players` seats, CPUs included.
 * The winner takes 70 XP and 80 gold, last place 30 XP and 20 gold, and the
 * places between are spread evenly.
 */
export function matchReward({ place, players }) {
  const share = players > 1 ? (players - place) / (players - 1) : 1;
  return { xp: Math.round(30 + 40 * share), gold: Math.round(20 + 60 * share) };
}

/** A poker hand you were dealt into, and a little more if you won it. */
export function pokerHandReward({ won }) {
  return won ? { xp: 6, gold: 8 } : { xp: 4, gold: 3 };
}

/** A poker hand only pays if it ends this long after your last paid hand at the table. */
export const POKER_REWARD_SPACING_MS = 30_000;

/** Gold for reaching `level`: 25 a level, doubled on every 5th. */
export function levelUpGold(level) {
  return 25 * level * (level % 5 === 0 ? 2 : 1);
}

/**
 * Adds a reward to a profile's total XP. → { xp, gold, levelUpGold, expBefore,
 * expAfter, levelBefore, levelAfter }, where levelUpGold sums every level
 * reached on the way.
 */
export function applyGain(exp, { xp, gold }) {
  const expAfter = exp + xp;
  const levelBefore = levelForExp(exp);
  const levelAfter = levelForExp(expAfter);
  let bonus = 0;
  for (let l = levelBefore + 1; l <= levelAfter; l++) bonus += levelUpGold(l);
  return { xp, gold, levelUpGold: bonus, expBefore: exp, expAfter, levelBefore, levelAfter };
}
