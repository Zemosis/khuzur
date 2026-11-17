// Results of `npm run sim:cpu` and `npm run sim:shuffle` (scripts/sim/), shown
// on the How it works page's Evidence chapters. Rerun the scripts and update
// these when a CPU or a shuffle changes.

export const SIM = {
  date: "16 November 2026",
  // `npm run sim:cpu`: share of matches won by level A (95% interval).
  cpu: [
    { game: "Thirteen", matchup: "1 Hard among 3 Medium", p: 0.673, ci: 0.038, fair: "25%" },
    { game: "Thirteen", matchup: "1 Medium among 3 Easy", p: 0.758, ci: 0.034, fair: "25%" },
    { game: "Thirteen", matchup: "1 Hard among 3 Easy", p: 0.765, ci: 0.034, fair: "25%" },
    { game: "Muushig", matchup: "1 Hard among 4 Medium", p: 0.246, ci: 0.038, fair: "20%" },
    { game: "Muushig", matchup: "1 Medium among 4 Easy", p: 0.619, ci: 0.043, fair: "20%" },
    { game: "Muushig", matchup: "1 Hard among 4 Easy", p: 0.553, ci: 0.044, fair: "20%" },
    { game: "Khuzur heads-up, 5 cards", matchup: "Hard vs Medium", p: 0.764, ci: 0.037, fair: "50%" },
    { game: "Khuzur heads-up, 5 cards", matchup: "Medium vs Easy", p: 0.792, ci: 0.036, fair: "50%" },
    { game: "Khuzur heads-up, 5 cards", matchup: "Hard vs Easy", p: 0.912, ci: 0.025, fair: "50%" },
    { game: "Khuzur 2v2, 5 cards", matchup: "Hard vs Medium", p: 0.71, ci: 0.04, fair: "50%" },
    { game: "Khuzur 2v2, 5 cards", matchup: "Medium vs Easy", p: 0.68, ci: 0.041, fair: "50%" },
    { game: "Khuzur 2v2, 5 cards", matchup: "Hard vs Easy", p: 0.816, ci: 0.034, fair: "50%" },
    { game: "Khuzur 2v2, 7 cards", matchup: "Hard vs Medium", p: 0.773, ci: 0.047, fair: "50%" },
    { game: "Khuzur 2v2, 7 cards", matchup: "Medium vs Easy", p: 0.797, ci: 0.046, fair: "50%" },
    { game: "Khuzur 2v2, 7 cards", matchup: "Hard vs Easy", p: 0.927, ci: 0.029, fair: "50%" },
  ],
  // Six seats, three of each level alternating, big blind 10.
  poker: [
    { matchup: "Hard vs Medium", bb100: 15.1, ci: 7.1, size: "80 × 400" },
    { matchup: "Medium vs Easy", bb100: 52.1, ci: 11.6, size: "80 × 400" },
    { matchup: "Hard vs Easy", bb100: 79.5, ci: 10.5, size: "80 × 400" },
  ],
  // Khuzur's November 2026 rewrite against the CPU it replaced, paired deals,
  // 1,000 matches per table (MEDIUM, EASY) or 300 (HARD); level A's win share.
  khuzurDev: [
    ["New MEDIUM vs old MEDIUM", "59.3%", "67.8%", "51.7%", "51.3%", "62.5%", "62.2%"],
    ["New EASY vs old EASY", "48.5%", "53.0%", "58.6%", "52.1%", "65.9%", "70.1%"],
    ["New HARD vs old HARD", "64.3%", "51.3%", "47.7%", "62.0%", "46.7%", "45.7%"],
    ["New HARD vs new MEDIUM (200 per table)", "73.5%", "69.5%", "57.5%", "81.0%", "74.5%", "57.5%"],
  ],
  // `npm run sim:shuffle`: [shuffle, orders χ², p, positions χ² (df), p].
  shuffle: [
    ["Thirteen", "21.4", "0.556", "2,677 (2,601)", "0.147"],
    ["Muushig", "18.8", "0.715", "937 (961)", "0.705"],
    ["Poker", "28.8", "0.186", "2,569 (2,601)", "0.668"],
    ["Khuzur 5-card", "22.3", "0.503", "1,219 (1,089)", "0.004 *"],
    ["Khuzur 7-card", "20.4", "0.619", "4,329 (4,225)", "0.128"],
    ["Blackjack shoe", "18.6", "0.727", "97,439 (96,721)", "0.052"],
  ],
  control:
    "* The smallest of the twelve p-values. Under uniformity the chance that at least one of twelve falls at or below 0.004 is 1 − 0.996¹² ≈ 4.7%, so a value like it is expected about one run in twenty. Three independent replications of that test at twice the size (120,000 decks) gave p = 0.448, 0.275 and 0.069. The control, the broken shuffle, scored χ² = 72,076: its commonest order came up 140,750 times and its rarest 74,529, against 100,000 expected. p < 10⁻⁶.",
  invariants:
    "7,200 whole matches and 96,000 poker hands (18 minutes on 15 threads): every CPU move legal, no card or chip made or lost, every match finished.",
};
