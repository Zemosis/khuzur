// SEAT INFO — what the poker table shows about a seat, shared by the seats and
// the scoreboard, and what the dealer calls and each seat's moves announce.
// (The dealer button and the blinds are drawn on the felt, not as tags: see
// OvalTable.)

export const LEVEL_COLOR = { EASY: "#9bd14f", MEDIUM: "#f4c430", HARD: "#e85a7a" };

/** The tags over a seat, most important first. */
export function seatTags(player, { phase }) {
  const tags = [];
  if (player.allIn && !player.folded) tags.push({ label: "ALL-IN", bg: "#e85a7a", fg: "#3a0e1a" });
  if (player.folded) tags.push({ label: "FOLDED", bg: "#463a78", fg: "#ead8b1" });
  if (player.leaving) tags.push({ label: "LEFT", bg: "#2a234d", fg: "#ead8b1" });
  else if (player.sittingOut) tags.push({ label: player.stack === 0 ? "BUSTED" : "SITTING OUT", bg: "#2a234d", fg: "#ead8b1" });
  else if (player.waitingForBB) tags.push({ label: "WAITING FOR BB", bg: "#2a234d", fg: "#ead8b1" });
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

const short = (name = "") => name.split(" #")[0];

/**
 * What the dealer says: by what the table is doing. dealing: the cards are
 * still going round. result: the hand's winners, as the table shows them.
 */
export function dealerLine(view, { dealing = false, result = null, firstHandSoon = false } = {}) {
  if (result?.length) return result.length > 1 ? "SPLIT POT" : `${short(result[0].name).toUpperCase()} WINS ${result[0].amount}`;
  if (dealing) return "SHUFFLE UP AND DEAL";
  if (firstHandSoon) return "CARDS IN THE AIR SOON";
  if (view.phase === "WAITING") return "TAKE YOUR SEATS";
  if (view.phase === "RUNOUT") return "ALL-IN: THE BOARD RUNS OUT";
  if (view.phase === "BETTING" && view.turn != null) {
    const who = short(view.seats[view.turn]?.name).toUpperCase();
    return view.street === "PREFLOP" ? `${who} TO ACT` : `${view.street} · ${who} TO ACT`;
  }
  return null;
}

const MOVE_CALLOUT = {
  fold: { label: "FOLD", bg: "#463a78", fg: "#ead8b1" },
  check: { label: "CHECK", bg: "#ead8b1" },
  call: { label: "CALL", bg: "#5fd4d6" },
  bet: { label: "BET", bg: "#f4c430" },
  raise: { label: "RAISE", bg: "#f4c430" },
  allin: { label: "ALL-IN", bg: "#e85a7a", fg: "#2a0a14" },
};

/** The moves `view` brings since `prev`, to pop over the seats' plates: [{ id, seat, type, label, bg, fg, delay }]. */
export function moveCallouts(prev, view) {
  const before = prev.handNumber === view.handNumber ? (prev.events ?? []).length : 0;
  return (view.events ?? []).slice(before).flatMap((e, i) => {
    const look = e.type === "act" ? MOVE_CALLOUT[e.action] : null;
    if (!look) return [];
    const amount = e.action === "fold" || e.action === "check" || e.action === "allin" ? "" : ` ${e.amount}`;
    return [{ ...look, label: `${look.label}${amount}`, id: `${view.handNumber}-${before + i}`, seat: e.seat, type: e.action, delay: 0 }];
  });
}
