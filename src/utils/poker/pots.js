// POKER POTS — splitting a hand's chips into the main pot and side pots, and
// paying them out.
//
// A player all-in for less can only win what each other player matched of
// their stack: every distinct all-in level opens a new pot, and a pot is won
// only by players who put in at least its level. Arrays are indexed by seat.

/**
 * committed: chips each seat put in this hand (0 for none).
 * live: true for a seat still contesting the hand (dealt in, not folded).
 * → [{ amount, eligible: [seat…] }], main pot first. Pots with the same
 * players are merged. Folded chips count toward the pots but win nothing.
 */
export function buildPots(committed, live) {
  const levels = [...new Set(committed.filter((c, seat) => live[seat] && c > 0))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    const amount = committed.reduce((sum, c) => sum + Math.max(0, Math.min(c, level) - prev), 0);
    const eligible = committed.flatMap((c, seat) => (live[seat] && c >= level ? [seat] : []));
    const last = pots.at(-1);
    if (last && last.eligible.join() === eligible.join()) last.amount += amount;
    else if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  // Chips above every live player's level (folded after betting more): the last pot.
  const total = committed.reduce((a, b) => a + b, 0);
  const placed = pots.reduce((a, p) => a + p.amount, 0);
  if (pots.length && total > placed) pots.at(-1).amount += total - placed;
  return pots;
}

/** Seats clockwise starting left of `button`. */
export function fromLeftOf(button, seatCount) {
  return Array.from({ length: seatCount }, (_, i) => (button + 1 + i) % seatCount);
}

/**
 * scores: each seat's hand score (higher wins; null for a seat not in it).
 * Each pot goes to its best eligible hand; a tie splits it, and chips that
 * don't divide go one each to the tied winners from the button's left.
 * → { won: chips per seat, results: [{ amount, winners: [seat…] }] }
 */
export function awardPots(pots, scores, button, seatCount) {
  const won = Array(seatCount).fill(0);
  const order = fromLeftOf(button, seatCount);
  const results = pots.map(({ amount, eligible }) => {
    const best = Math.max(...eligible.map((seat) => scores[seat]));
    const winners = order.filter((seat) => eligible.includes(seat) && scores[seat] === best);
    const share = Math.floor(amount / winners.length);
    winners.forEach((seat, i) => {
      won[seat] += share + (i < amount - share * winners.length ? 1 : 0);
    });
    return { amount, winners };
  });
  return { won, results };
}
