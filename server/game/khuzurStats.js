// KHUZUR TALLIES — how an online match is recorded per seat, read from the
// engine's final state and event log. The browser's solo report
// (src/utils/soloReport.js khuzurSoloReport) counts the same way, so online
// and practice matches add up the same on a profile.

/** Each seat's final place ({ seat: place }): its team's. */
export function khuzurPlaces(state) {
  return Object.fromEntries(state.players.map((p) => [p.id, state.places[p.team]]));
}

/** One seat's tallies: leads, beats, pick-ups, cards picked up; the match is one round, won by 1st place. */
export function khuzurSeatStats(state, seat) {
  const stats = { leads: 0, beats: 0, pickups: 0, picked_up: 0, rounds_played: 1, rounds_won: 0 };
  for (const e of state.events) {
    if (e.seat !== seat) continue;
    if (e.type === "lead") stats.leads += 1;
    else if (e.type === "beat") stats.beats += 1;
    else if (e.type === "pickUp") {
      stats.pickups += 1;
      stats.picked_up += e.count;
    }
  }
  const team = state.players[seat]?.team;
  if (state.places[team] === 1) stats.rounds_won = 1;
  return stats;
}

/** The match as one round summary, for game_rounds and the match page. */
export function khuzurSummary(state) {
  const first = state.events.find((e) => e.type === "out" && e.place === 1);
  return {
    roundNumber: 1,
    winnerSeat: first ? first.seat : null,
    seatResults: state.players.map((p) => ({ seat_index: p.id, place: state.places[p.team], cards_left: p.hand.length, eliminated: false })),
    highlights: null,
  };
}
