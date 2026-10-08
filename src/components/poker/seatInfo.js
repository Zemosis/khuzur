// SEAT INFO — what the poker table shows about a seat, shared by the seats,
// your own area and the scoreboard.

/** The tags over a seat, most important first. */
export function seatTags(player, { isButton, blind, phase }) {
  const tags = [];
  if (isButton) tags.push({ label: "D", bg: "#ead8b1" });
  if (blind) tags.push({ label: blind, bg: "#5fd4d6", fg: "#0a3a3a" });
  if (player.allIn && !player.folded) tags.push({ label: "ALL-IN", bg: "#e85a7a", fg: "#3a0e1a" });
  if (player.folded) tags.push({ label: "FOLDED", bg: "#463a78", fg: "#ead8b1" });
  if (player.sittingOut) tags.push({ label: player.stack === 0 ? "BUSTED" : "SITTING OUT", bg: "#2a234d", fg: "#ead8b1" });
  else if (!player.inHand && (phase === "BETTING" || phase === "RUNOUT")) tags.push({ label: "NEXT HAND", bg: "#2a234d", fg: "#ead8b1" });
  return tags;
}

/** Chips a seat holds, counting what it has in the pot while a hand is played (once it's over, the pot is paid). */
export const chipsOf = (p, running) => p.stack + (running ? p.committed : 0);
