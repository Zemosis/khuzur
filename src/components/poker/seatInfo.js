// SEAT INFO — what the poker table shows about a seat, shared by the seats,
// your own area and the scoreboard. (The dealer button and the blinds are
// drawn on the felt, not as tags: see OvalTable.)

export const LEVEL_COLOR = { EASY: "#9bd14f", MEDIUM: "#f4c430", HARD: "#e85a7a" };

/** The tags over a seat, most important first. */
export function seatTags(player, { phase }) {
  const tags = [];
  if (player.allIn && !player.folded) tags.push({ label: "ALL-IN", bg: "#e85a7a", fg: "#3a0e1a" });
  if (player.folded) tags.push({ label: "FOLDED", bg: "#463a78", fg: "#ead8b1" });
  if (player.sittingOut) tags.push({ label: player.stack === 0 ? "BUSTED" : "SITTING OUT", bg: "#2a234d", fg: "#ead8b1" });
  else if (!player.inHand && (phase === "BETTING" || phase === "RUNOUT")) tags.push({ label: "NEXT HAND", bg: "#2a234d", fg: "#ead8b1" });
  if (player.type === "AI" && player.level) tags.push({ label: player.level, bg: LEVEL_COLOR[player.level] || "#f4c430" });
  return tags;
}

/**
 * Seats still to act this betting round, in order, starting with the player
 * on turn: in the hand, not folded or all-in, and either yet to act or short
 * of the bet. Empty when nobody is betting.
 */
export function actingOrder(view) {
  if (view.phase !== "BETTING" || view.turn == null) return [];
  const n = view.seats.length;
  return Array.from({ length: n }, (_, k) => (view.turn + k) % n).filter((i) => {
    const p = view.seats[i];
    return p?.inHand && !p.folded && !p.allIn && (!p.acted || p.bet < view.currentBet);
  });
}

const SUFFIX = { 1: "ST", 2: "ND", 3: "RD" };
/** 2 → "2ND", 6 → "6TH". */
export const ordinal = (n) => `${n}${SUFFIX[n] || "TH"}`;

/** Chips a seat holds, counting what it has in the pot while a hand is played (once it's over, the pot is paid). */
export const chipsOf = (p, running) => p.stack + (running ? p.committed : 0);
