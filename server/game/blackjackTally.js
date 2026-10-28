// BLACKJACK TALLY — a player's record at one blackjack table, built round by
// round and stored as their game_players.stats: the counts the profile sums
// (player_blackjack_stats), and their own log of rounds (their hands and the
// dealer's) for their table page.

// The log keeps the latest rounds, so a table played for hours stays a reasonable size.
export const LOGGED_ROUNDS = 500;

const empty = () => ({ rounds_played: 0, rounds_won: 0, rounds_pushed: 0, blackjacks: 0, doubles: 0, splits: 0, biggest_win: 0, net: 0 });

/**
 * Adds one finished round to a player's tally (null to start one) and returns
 * it. summary: the engine's roundSummary; result: this player's seat result in it.
 */
export function tallyRound(tally, summary, result) {
  const t = tally ?? empty();
  const r = result;
  t.rounds_played += 1;
  t.net += r.net;
  if (r.net > 0) t.rounds_won += 1;
  if (r.net === 0) t.rounds_pushed += 1;
  if (r.blackjack) t.blackjacks += 1;
  if (r.doubled) t.doubles += 1;
  if (r.split) t.splits += 1;
  t.biggest_win = Math.max(t.biggest_win, r.net);
  (t.rounds ||= []).push({ n: summary.roundNumber, net: r.net, hands: r.hands, dealer: summary.dealer });
  if (t.rounds.length > LOGGED_ROUNDS) t.rounds.shift();
  return t;
}
