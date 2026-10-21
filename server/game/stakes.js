// STAKES — what a credit match (Muushig, Thirteen) plays for and who the pot
// goes to. Everyone at a table stakes the same amount and the match winner
// takes the pot. CPUs stake nothing: a pot a CPU wins is lost. The browser's
// panels and the server's checks both read this file; server/game/stakes.js
// is a byte-identical copy.

export const STAKES = { LOW: 100, MID: 500, HIGH: 2000 };
export const STAKE_TIERS = Object.keys(STAKES);
export const isStakeTier = (id) => typeof id === "string" && Object.hasOwn(STAKES, id);

// A credit match needs this many staked players to start; CPUs fill the rest.
export const MIN_STAKED = 2;
// Away (a CPU covering your seat) for this many finished rounds, and the seat is no longer yours.
export const FORFEIT_ROUNDS = 2;

/**
 * The seats that won a finished Muushig match: the engine's winner and anyone
 * level with them on score and on piles eaten in the last round.
 */
function muushigWinners(state) {
  const finished = state.players.filter((p) => p.score <= 0);
  const [best] = [...finished].sort((a, b) => a.score - b.score || b.eaten - a.eaten);
  return finished.filter((p) => p.score === best.score && p.eaten === best.eaten).map((p) => p.id);
}

/** The seat that won a finished Thirteen match: the last one not eliminated. */
const thirteenWinners = (state) => state.players.flatMap((p, seat) => (p.isEliminated ? [] : [seat]));

const WINNERS = { muushig: muushigWinners, thirteen: thirteenWinners };

/** The seats that won `gameType`'s finished match, from its final state. */
export const matchWinners = (gameType, state) => WINNERS[gameType](state);

/**
 * Who gets the pot. seats: per seat { userId (null for a CPU seat), forfeited };
 * winners: seat indexes. The pot is split evenly between the winners, the
 * credits an uneven split leaves going to the lowest seats one each. A
 * winning seat that is a CPU's, or was forfeited, loses its share.
 * → { pot, payouts: [{ seat, userId, amount }], cpuTake }
 */
export function settlement({ stake, seats, winners }) {
  const pot = stake * seats.filter((s) => s.userId).length;
  const order = [...winners].sort((a, b) => a - b);
  const share = Math.floor(pot / order.length);
  const over = pot - share * order.length;
  const payouts = [];
  let cpuTake = 0;
  order.forEach((seat, i) => {
    const amount = share + (i < over ? 1 : 0);
    const s = seats[seat];
    if (s?.userId && !s.forfeited) payouts.push({ seat, userId: s.userId, amount });
    else cpuTake += amount;
  });
  return { pot, payouts, cpuTake };
}
