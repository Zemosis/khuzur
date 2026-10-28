// BLACKJACK ROOM — what a blackjack lobby needs from the socket server beyond
// the shared lobby code in index.js: the table's pacing, each seat's view,
// and the bj_ socket handlers. The seat always comes from the socket's own
// membership, never from the payload; a refusal answers move_rejected.
//
// At a credit table (lobby.credits is a CreditBlackjack, lobby.game its
// table) the moves that move money (DOUBLE, SPLIT, insurance) go through the
// bridge; bets, READY and seat moves go to the table, which the bridge funds
// when betting closes.

import { DEFAULT_BLACKJACK_DELAYS } from "./game/blackjack/table.js";
import { ACTIONS, viewFor } from "./game/blackjack/engine.js";
import { MAX_SEATS } from "./game/blackjack/rules.js";

const envMs = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name] !== "" ? n : fallback;
};

// The test suite sets every pause to BLACKJACK_DELAY_MS, and the turn and
// insurance clocks to BLACKJACK_TURN_MS. The betting window keeps its length.
const PAUSES = ["deal", "dealerStep", "results", "saveRetry"];
export const BLACKJACK_DELAYS = {
  ...DEFAULT_BLACKJACK_DELAYS,
  ...(process.env.BLACKJACK_DELAY_MS ? Object.fromEntries(PAUSES.map((k) => [k, envMs("BLACKJACK_DELAY_MS", DEFAULT_BLACKJACK_DELAYS[k])])) : {}),
  turn: envMs("BLACKJACK_TURN_MS", DEFAULT_BLACKJACK_DELAYS.turn),
  insurance: envMs("BLACKJACK_TURN_MS", DEFAULT_BLACKJACK_DELAYS.insurance),
};

/** A blackjack table as one seat sees it: the running clock, and a credit table's save / close state. */
export const blackjackView = (state, seat, table) => ({
  ...viewFor(state, seat),
  phaseMsLeft: table?.phaseMsLeft() ?? null,
  saving: !!table?.saving,
  closingAfterRound: !!table?.closing,
  credit: !!table?.credit,
});

/** The bj_ events for one socket. lobbies: the server's lobby map. */
export function registerBlackjackHandlers(socket, { lobbies }) {
  const reject = (reason) => socket.emit("move_rejected", { reason });
  const answer = (result) => {
    if (result && !result.ok) reject(result.error);
  };

  /** This socket's seat at a blackjack table: { lobby, member, seat }, or null. */
  const seatAt = (lobbyId) => {
    const lobby = lobbies.get(lobbyId);
    const member = lobby?.members.get(socket.data.playerKey);
    if (lobby?.gameType !== "blackjack" || !lobby.game || member?.seatIndex == null) return null;
    return { lobby, member, seat: member.seatIndex };
  };

  // SIT on an empty seat, between rounds.
  socket.on("bj_sit", ({ lobbyId, seat } = {}) => {
    const at = seatAt(lobbyId);
    if (!at) return;
    if (!Number.isInteger(seat) || seat < 0 || seat >= MAX_SEATS) return reject("No such seat");
    const { lobby, member } = at;
    // Set first: the table broadcasts as they move, and their view needs the new seat.
    member.seatIndex = seat;
    const result = lobby.game.moveSeat(at.seat, seat);
    if (!result.ok) {
      member.seatIndex = at.seat;
      return reject(result.error);
    }
    const entry = lobby.roster.get(member.key);
    if (entry) entry.seatIndex = seat;
  });

  // A bet replaces the last one: 0 clears it.
  socket.on("bj_bet", ({ lobbyId, amount } = {}) => {
    const at = seatAt(lobbyId);
    if (!at) return;
    if (!Number.isInteger(amount) || amount < 0) return reject("Pick an amount");
    answer(at.lobby.game.bet(at.seat, amount));
  });

  socket.on("bj_ready", ({ lobbyId } = {}) => {
    const at = seatAt(lobbyId);
    if (at) answer(at.lobby.game.ready(at.seat));
  });

  // Insurance YES (take: true) or NO (take: false); anything else is no answer.
  socket.on("bj_insurance", async ({ lobbyId, take } = {}) => {
    const at = seatAt(lobbyId);
    if (!at) return;
    if (typeof take !== "boolean") return reject("Answer YES or NO");
    const { lobby, member } = at;
    answer(lobby.credits ? await lobby.credits.insure(member.userId, take === true) : await lobby.game.insure(at.seat, take === true));
  });

  // HIT | STAND | DOUBLE | SPLIT on the hand being played.
  socket.on("bj_action", async ({ lobbyId, type } = {}) => {
    const at = seatAt(lobbyId);
    if (!at) return;
    if (!ACTIONS.includes(type)) return reject("Pick HIT, STAND, DOUBLE or SPLIT");
    const { lobby, member } = at;
    answer(lobby.credits ? await lobby.credits.move(member.userId, type) : await lobby.game.move(at.seat, type));
  });

  // Free tables: back to the starting chips once below the minimum bet.
  socket.on("bj_rebuy", ({ lobbyId } = {}) => {
    const at = seatAt(lobbyId);
    if (!at) return;
    if (at.lobby.credits) return reject("Rebuy is only for free tables");
    answer(at.lobby.game.rebuy(at.seat));
  });
}
