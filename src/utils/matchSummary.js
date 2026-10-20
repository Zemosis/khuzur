// MATCH SUMMARY — the match page's figures, from the round results every seat
// has (CPUs included): one player's numbers beside the table's average, and
// each seat's score after every round for the timeline.

const START_SCORE = { thirteen: 0, muushig: 15 };

/** A seat's name without its #tag; an unnamed CPU (older matches) by its seat. */
export const seatName = (s) => (s.name ? s.name.split(" #")[0] : `CPU · seat ${s.seat + 1}`);

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Each seat's results, skipping Thirteen rounds it sat out after going out. */
function playedBy(rounds, seat) {
  const out = [];
  let gone = false;
  for (const round of rounds) {
    const mine = round.results.find((x) => x.seat === seat);
    if (!mine || gone) continue;
    out.push({ round, mine });
    if (mine.eliminated) gone = true;
  }
  return out;
}

function thirteenFigures(rounds, seat) {
  const played = playedBy(rounds, seat);
  const caught = played.filter(({ round }) => round.winnerSeat !== seat).map(({ mine }) => mine.cardsLeft ?? 0);
  return {
    "Rounds won": played.filter(({ round }) => round.winnerSeat === seat).length,
    "Avg cards left when caught": mean(caught),
    "Points taken": played.reduce((sum, { mine }) => sum + Math.max(0, mine.points ?? 0), 0),
  };
}

function muushigFigures(rounds, seat) {
  let eaten = 0, goneIn = 0, folded = 0, sweeps = 0, won = 0;
  for (const round of rounds) {
    const mine = round.results.find((x) => x.seat === seat);
    if (!mine) continue;
    if (mine.folded) {
      folded += 1;
      continue;
    }
    goneIn += 1;
    eaten += mine.eaten ?? 0;
    if (round.winnerSeat === seat) sweeps += 1;
    const most = Math.max(...round.results.map((x) => x.eaten ?? 0));
    if (mine.eaten > 0 && mine.eaten === most) won += 1;
  }
  return { "Piles eaten": eaten, "Rounds gone in": goneIn, "Rounds folded": folded, Sweeps: sweeps, "Rounds won": won };
}

const BETTER = {
  thirteen: { "Rounds won": "high", "Avg cards left when caught": "low", "Points taken": "low" },
  muushig: { "Piles eaten": "high", "Rounds gone in": "high", "Rounds folded": "low", Sweeps: "high", "Rounds won": "high" },
};

/**
 * [{ label, mine, avg, better: "high" | "low" }] for the player in `seat`;
 * `avg` is over every seat that has results (null figures are left out).
 */
export function summaryRows(gameType, rounds, seat) {
  const figures = gameType === "muushig" ? muushigFigures : thirteenFigures;
  const seats = [...new Set(rounds.flatMap((r) => r.results.map((x) => x.seat)))];
  const all = seats.map((s) => figures(rounds, s));
  const mine = figures(rounds, seat);
  return Object.keys(mine).map((label) => ({
    label,
    mine: mine[label],
    avg: mean(all.map((f) => f[label]).filter((v) => v != null)),
    better: BETTER[gameType === "muushig" ? "muushig" : "thirteen"][label],
  }));
}

/** { seat: [start, after round 1, …] } for the timeline. */
export function scoreLines(gameType, rounds, seats) {
  const start = START_SCORE[gameType] ?? 0;
  return Object.fromEntries(
    seats.map((seat) => {
      let last = start;
      const line = [start];
      for (const round of rounds) {
        last = round.results.find((x) => x.seat === seat)?.scoreAfter ?? last;
        line.push(last);
      }
      return [seat, line];
    }),
  );
}
