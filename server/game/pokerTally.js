// POKER TALLY — a player's record at one poker table, built hand by hand and
// stored as their game_players.stats: the counts the profile sums
// (player_poker_stats), how often each hand rank was shown and won at a
// showdown, and their own log of hands, hole cards included, for their table
// page (server/matches.js).

// The log keeps the latest hands, so a table played for hours stays a reasonable size.
export const LOGGED_HANDS = 500;

const empty = () => ({ hands_played: 0, hands_won: 0, net: 0, biggest_pot: 0, vpip_hands: 0, showdowns: 0, showdowns_won: 0 });

/**
 * Adds one finished hand to a player's tally (null to start one) and returns
 * it. hand: the engine's handSummary; result: this player's seat result in it.
 */
export function tallyHand(tally, hand, result) {
  const t = tally ?? empty();
  const r = result;
  t.hands_played += 1;
  t.net += r.net;
  t.biggest_pot = Math.max(t.biggest_pot, r.won);
  if (r.won > 0) t.hands_won += 1;
  if (r.vpip) t.vpip_hands += 1;
  if (r.showdown) t.showdowns += 1;
  if (r.showdown && r.won > 0) t.showdowns_won += 1;
  if (r.showdown && r.shown_rank) {
    const rank = ((t.showdown_ranks ||= {})[r.shown_rank] ||= { shown: 0, won: 0 });
    rank.shown += 1;
    if (r.won > 0) rank.won += 1;
  }
  (t.hands ||= []).push({
    n: hand.roundNumber,
    net: r.net,
    won: r.won,
    hole: r.hole,
    board: hand.board,
    folded: r.folded_street,
    showdown: r.showdown,
    rank: r.shown_rank,
    shown: r.shown_hand,
    winners: hand.seatResults.filter((w) => w.won > 0).map((w) => ({ name: w.name, hand: w.shown_hand })),
  });
  if (t.hands.length > LOGGED_HANDS) t.hands.shift();
  return t;
}
