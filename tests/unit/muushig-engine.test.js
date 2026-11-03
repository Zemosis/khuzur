// Muushig engine: every rule in docs/muushig-rulebook.md.

import { describe, it, expect } from "vitest";
import {
  PHASES,
  START_SCORE,
  allowedPlays,
  canFold,
  collectTrick,
  createDeck,
  createMatch,
  decide,
  drawForDeal,
  foldBlock,
  makeCard,
  maxDiscard,
  maxDrawDepth,
  playCard,
  rematch,
  stackOrder,
  startNextRound,
  swap,
  takeTrump,
  trickWinner,
} from "../../src/utils/muushig/engine.js";
import { seededRandom } from "../helpers/cards.js";

const c = (id) => makeCard(id.slice(0, -1), id.slice(-1));
const cs = (ids) => (ids.trim() ? ids.trim().split(/\s+/).map(c) : []);
const idsOf = (list) => list.map((x) => x.id);

const PLAYERS = ["You", "Bot Saturn", "Bot Venus", "Bot Mars", "Bot Jupiter"].map((name, i) => ({ name, type: i ? "AI" : "HUMAN", level: "MEDIUM" }));
/** Runs the draw for the deal, everyone taking the top card. */
function drawAll(s, rng) {
  while (s.phase === PHASES.DRAW) s = drawForDeal(s, s.turn, 1, rng);
  return s;
}
const newMatch = (seed = 1) => {
  const rng = seededRandom(seed);
  return drawAll(createMatch({ players: PLAYERS, rng }), rng);
};
/** A match waiting on its draw, with the pile stacked top first. */
function drawState(pile, seed = 1) {
  const s = createMatch({ players: PLAYERS, rng: seededRandom(seed) });
  return { ...s, dealDeck: cs(pile) };
}
/** Seats clockwise from `seat`. */
const around = (seat) => [0, 1, 2, 3, 4].map((i) => (seat + i) % 5);

/** A PLAY-phase state: hands per seat (null = folded), the trick so far, whose turn. */
function playState({ hands, trump = "♦", trick = [], turn, dealer = 4, trickNumber = 1, eaten = [0, 0, 0, 0, 0], scores }) {
  return {
    matchNumber: 1,
    roundNumber: 1,
    dealer,
    players: hands.map((h, seat) => ({
      id: seat,
      name: PLAYERS[seat].name,
      type: "AI",
      level: "MEDIUM",
      score: scores ? scores[seat] : START_SCORE,
      hand: cs(h ?? ""),
      status: h === null ? "fold" : "play",
      eaten: eaten[seat],
      discarded: [],
    })),
    trumpCard: c(`9${trump}`),
    trumpSuit: trump,
    trumpTakenBy: null,
    drawPile: [],
    deadPile: [],
    played: [],
    trick: trick.map(([seat, id]) => ({ seat, card: c(id) })),
    trickNumber,
    trickWinner: null,
    phase: PHASES.PLAY,
    turn,
    events: [],
    matchWinner: null,
  };
}

describe("deck and deal", () => {
  it("uses 32 cards, 7 through A", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(32);
    expect(new Set(deck.map((x) => x.rank))).toEqual(new Set(["7", "8", "9", "10", "J", "Q", "K", "A"]));
  });

  it("deals 5 each, turns one trump card, leaves 6 to draw", () => {
    const s = newMatch();
    s.players.forEach((p) => expect(p.hand).toHaveLength(5));
    expect(s.drawPile).toHaveLength(6);
    expect(s.trumpSuit).toBe(s.trumpCard.suit);
    const all = [...s.players.flatMap((p) => p.hand), ...s.drawPile, s.trumpCard];
    expect(new Set(idsOf(all)).size).toBe(32);
    expect(s.phase).toBe(PHASES.DECIDE);
    expect(s.turn).toBe((s.dealer + 1) % 5);
    expect(s.players.every((p) => p.score === START_SCORE)).toBe(true);
  });

  it("picks the first dealer by the highest drawn card", () => {
    const s = newMatch(7);
    const first = s.events.find((e) => e.type === "firstDealer");
    const top = Math.max(...s.dealDraws.map((d) => d.card.rankValue));
    expect(first.seat).toBe(s.dealer);
    expect(first.card.rankValue).toBe(top);
  });
});

describe("draw for the deal", () => {
  it("opens the match: a full shuffled pile, no dealer, no hands yet", () => {
    const s = createMatch({ players: PLAYERS, rng: seededRandom(2) });
    expect(s.phase).toBe(PHASES.DRAW);
    expect(s.roundNumber).toBe(0);
    expect(s.dealer).toBe(null);
    expect(s.dealDeck).toHaveLength(32);
    expect(s.players.every((p) => p.hand.length === 0)).toBe(true);
    expect(s.events).toEqual([{ type: "drawStart", seat: s.turn }]);
  });

  it("the first player to draw is random", () => {
    const starters = new Set(Array.from({ length: 40 }, (_, i) => createMatch({ players: PLAYERS, rng: seededRandom(i) }).turn));
    expect(starters).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it("takes the N-th card from the top; the cards above it stay", () => {
    let s = drawState("7♠ 8♠ 9♠ 10♠ J♠ Q♠ K♠");
    const seat = s.turn;
    s = drawForDeal(s, seat, 3);
    expect(idsOf(s.dealDeck)).toEqual(["7♠", "8♠", "10♠", "J♠", "Q♠", "K♠"]);
    expect(s.dealDraws).toEqual([{ seat, card: c("9♠"), depth: 3 }]);
    expect(s.events.at(-1)).toEqual({ type: "dealDraw", seat, card: c("9♠"), depth: 3 });
    expect(s.turn).toBe((seat + 1) % 5);
  });

  it("draws go clockwise, and the highest card deals", () => {
    let s = drawState("7♠ 8♠ A♣ 9♠ 10♠ J♠ Q♠");
    const order = around(s.turn);
    for (const seat of order) {
      expect(s.turn).toBe(seat);
      s = drawForDeal(s, seat, 1);
    }
    expect(s.dealer).toBe(order[2]);
    expect(s.phase).toBe(PHASES.DECIDE);
    expect(s.roundNumber).toBe(1);
    expect(s.players.every((p) => p.hand.length === 5)).toBe(true);
    expect(s.events.find((e) => e.type === "firstDealer")).toEqual({ type: "firstDealer", seat: order[2], card: c("A♣") });
  });

  it("depth runs from 1 to 10, and never past the pile", () => {
    const s = drawState("7♠ 8♠ 9♠ 10♠ J♠ Q♠ K♠ A♠ 7♥ 8♥ 9♥ 10♥");
    expect(maxDrawDepth(s)).toBe(10);
    for (const bad of [0, 11, 2.5, "3"]) expect(() => drawForDeal(s, s.turn, bad)).toThrow(/between 1 and 10/);
    expect(maxDrawDepth({ ...s, dealDeck: cs("7♠ 8♠ 9♠") })).toBe(3);
    expect(() => drawForDeal(s, (s.turn + 1) % 5, 1)).toThrow(/Not your turn/);
  });

  it("the same rank is settled by suit: spades, then hearts, diamonds, clubs", () => {
    const dealerOf = (pile) => {
      let s = drawState(pile);
      const order = around(s.turn);
      for (const seat of order) s = drawForDeal(s, seat, 1);
      return { s, order };
    };
    let { s, order } = dealerOf("K♣ 7♠ K♥ 8♠ K♦ 9♠");
    expect(s.phase).toBe(PHASES.DECIDE);
    expect(s.dealer).toBe(order[2]); // K♥ over K♦ and K♣
    expect(s.events.find((e) => e.type === "firstDealer").card).toEqual(c("K♥"));
    ({ s, order } = dealerOf("A♣ A♦ A♥ A♠ 7♠ 8♠"));
    expect(s.dealer).toBe(order[3]); // A♠
    ({ s, order } = dealerOf("A♣ K♠ Q♠ J♠ 10♠ 9♠"));
    expect(s.dealer).toBe(order[0]); // rank first: A♣ over K♠
  });

  it("a rematch opens with a new draw", () => {
    const s = { ...newMatch(), phase: PHASES.MATCH_OVER };
    const again = rematch(s, seededRandom(4));
    expect(again.phase).toBe(PHASES.DRAW);
    expect(again.dealDeck).toHaveLength(32);
  });
});

describe("play or fold", () => {
  it("goes left of the dealer first, folded hands go to the dead pile", () => {
    let s = newMatch();
    const first = s.turn;
    const hand = s.players[first].hand;
    s = decide(s, first, false);
    expect(s.players[first].status).toBe("fold");
    expect(s.players[first].hand).toEqual([]);
    expect(idsOf(s.deadPile)).toEqual(idsOf(hand));
    expect(s.turn).toBe((first + 1) % 5);
  });

  it("needs at least 2 players", () => {
    let s = newMatch();
    for (let i = 0; i < 3; i++) s = decide(s, s.turn, false);
    // 2 left undecided: both must play.
    expect(canFold(s, s.turn)).toBe(false);
    expect(() => decide(s, s.turn, false)).toThrow(/2 players/);
    s = decide(s, s.turn, true);
    expect(canFold(s, s.turn)).toBe(false);
    s = decide(s, s.turn, true);
    expect(s.phase).toBe(PHASES.SWAP);
  });

  it("counts folds in a row: folding adds one, going in resets it", () => {
    let s = newMatch();
    expect(s.players.every((p) => p.foldStreak === 0)).toBe(true);
    const [a, b] = [s.turn, (s.turn + 1) % 5];
    s.players[b].foldStreak = 1;
    s = decide(s, a, false);
    s = decide(s, b, true);
    expect(s.players[a].foldStreak).toBe(1);
    expect(s.players[b].foldStreak).toBe(0);
  });

  it("after folding 2 rounds in a row, you must go in", () => {
    let s = newMatch();
    const seat = s.turn;
    s.players[seat].foldStreak = 2;
    expect(canFold(s, seat)).toBe(false);
    expect(foldBlock(s, seat)).toBe("streak");
    expect(() => decide(s, seat, false)).toThrow(/2 rounds in a row/);
    s = decide(s, seat, true);
    expect(s.players[seat].foldStreak).toBe(0);
  });

  it("the fold streak carries into the next round, and a rematch clears it", () => {
    let s = newMatch();
    s.players[0].foldStreak = 2;
    s.phase = PHASES.ROUND_END;
    s = startNextRound(s, seededRandom(3));
    expect(s.players[0].foldStreak).toBe(2);
    s.phase = PHASES.MATCH_OVER;
    expect(rematch(s, seededRandom(3)).players[0].foldStreak).toBe(0);
  });

  it("rejects a move out of turn", () => {
    const s = newMatch();
    expect(() => decide(s, (s.turn + 1) % 5, true)).toThrow(/turn/);
  });
});

function allPlay(s) {
  while (s.phase === PHASES.DECIDE) s = decide(s, s.turn, true);
  return s;
}

describe("swapping", () => {
  it("discards to the dead pile and draws the same number", () => {
    let s = allPlay(newMatch());
    const seat = s.turn;
    expect(seat).toBe((s.dealer + 1) % 5);
    const out = idsOf(s.players[seat].hand.slice(0, 2));
    const top2 = idsOf(s.drawPile.slice(0, 2));
    s = swap(s, seat, out);
    expect(s.players[seat].hand).toHaveLength(5);
    expect(idsOf(s.players[seat].hand)).toEqual(expect.arrayContaining(top2));
    expect(idsOf(s.deadPile)).toEqual(out);
    expect(s.drawPile).toHaveLength(4);
  });

  it("can't discard more than the draw pile holds, and skips everyone once it's empty", () => {
    let s = allPlay(newMatch());
    expect(maxDiscard(s)).toBe(5);
    s = swap(s, s.turn, idsOf(s.players[s.turn].hand.slice(0, 5)));
    expect(maxDiscard(s)).toBe(1);
    expect(() => swap(s, s.turn, idsOf(s.players[s.turn].hand.slice(0, 2)))).toThrow(/draw pile/);
    s = swap(s, s.turn, idsOf(s.players[s.turn].hand.slice(0, 1)));
    // Pile empty: the rest (dealer included) are skipped, straight to the trump.
    expect(s.phase).toBe(PHASES.TRUMP);
    expect(s.turn).toBe(s.dealer);
    expect(s.events.filter((e) => e.type === "swap" && e.emptyPile)).toHaveLength(3);
  });

  it("the dealer swaps last, then may take the trump for one card", () => {
    let s = allPlay(newMatch());
    while (s.phase === PHASES.SWAP) s = swap(s, s.turn, []);
    expect(s.phase).toBe(PHASES.TRUMP);
    const dealer = s.dealer;
    const give = s.players[dealer].hand[0];
    s = takeTrump(s, dealer, give.id);
    expect(idsOf(s.players[dealer].hand)).toContain(s.trumpCard.id);
    expect(idsOf(s.players[dealer].hand)).not.toContain(give.id);
    expect(s.trumpTakenBy).toBe(dealer);
    expect(s.phase).toBe(PHASES.PLAY);
    expect(s.turn).toBe((dealer + 1) % 5);
  });

  it("a folded dealer never gets the trump option", () => {
    let s = newMatch();
    while (s.phase === PHASES.DECIDE) s = decide(s, s.turn, s.turn !== s.dealer);
    while (s.phase === PHASES.SWAP) s = swap(s, s.turn, []);
    expect(s.phase).toBe(PHASES.PLAY);
    expect(s.turn).toBe((s.dealer + 1) % 5);
  });
});

describe("what you must play", () => {
  it("leading: any card", () => {
    const s = playState({ hands: ["A♦ Q♣ 7♠", "", "", "", ""], turn: 0 });
    expect(idsOf(allowedPlays(s, 0))).toEqual(["A♦", "Q♣", "7♠"]);
  });

  it("other suit led: a higher card of that suit must be played", () => {
    const s = playState({ hands: ["10♠ A♠ J♦ 7♥", "", "", "", ""], trick: [[2, "9♠"], [4, "8♥"]], turn: 0 });
    expect(idsOf(allowedPlays(s, 0))).toEqual(["10♠", "A♠"]);
  });

  it("other suit led, none higher: still that suit, never a trump or another suit", () => {
    const s = playState({ hands: ["8♠ J♦ 7♥", "", "", "", ""], trick: [[2, "9♠"]], turn: 0 });
    expect(idsOf(allowedPlays(s, 0))).toEqual(["8♠"]);
  });

  it("other suit led, trumped in: you still follow the led suit", () => {
    const s = playState({ hands: ["10♠ 7♠ K♦ 7♣", "", "", "", ""], trick: [[2, "9♠"], [3, "10♦"]], turn: 0 });
    expect(idsOf(allowedPlays(s, 0))).toEqual(["10♠"]);
  });

  it("other suit led, none of it held: you must trump", () => {
    const s = playState({ hands: ["8♦ K♦ 7♣ A♥", "", "", "", ""], trick: [[2, "9♠"]], turn: 0 });
    expect(idsOf(allowedPlays(s, 0))).toEqual(["8♦", "K♦"]);
  });

  it("trumped in and none of the led suit: a higher trump if you have one", () => {
    const s = playState({ hands: ["K♦ 8♦ 7♣", "", "", "", ""], trick: [[2, "9♠"], [3, "10♦"]], turn: 0 });
    expect(idsOf(allowedPlays(s, 0))).toEqual(["K♦"]);
  });

  it("trumped in and none of the led suit, no higher trump: any trump", () => {
    const s = playState({ hands: ["7♣ 9♣ 8♦ J♦", "", "", "", ""], trick: [[2, "7♠"], [3, "K♦"]], turn: 0 });
    expect(idsOf(allowedPlays(s, 0))).toEqual(["8♦", "J♦"]);
  });

  it("trump led: a higher trump if you have one, else any trump", () => {
    let s = playState({ hands: ["K♦ 8♦ 7♣", "", "", "", ""], trick: [[2, "Q♦"]], turn: 0 });
    expect(idsOf(allowedPlays(s, 0))).toEqual(["K♦"]);
    s = playState({ hands: ["8♦ 9♦ 7♣", "", "", "", ""], trick: [[2, "Q♦"]], turn: 0 });
    expect(idsOf(allowedPlays(s, 0))).toEqual(["8♦", "9♦"]);
  });

  it("neither the led suit nor a trump: anything goes", () => {
    const s = playState({ hands: ["7♣ Q♥ A♣", "", "", "", ""], trick: [[2, "9♠"], [3, "10♦"]], turn: 0 });
    expect(idsOf(allowedPlays(s, 0))).toEqual(["7♣", "Q♥", "A♣"]);
  });

  it("the trump ace is just the highest trump: no need to play it", () => {
    const s = playState({ hands: ["A♦ K♦ Q♣", "", "", "", ""], trick: [[2, "Q♦"]], turn: 0 });
    expect(idsOf(allowedPlays(s, 0))).toEqual(["A♦", "K♦"]);
  });

  it("a card that isn't allowed is rejected, and a legal play leaves the hand as it was", () => {
    const s = playState({ hands: ["8♠ J♦ 7♥", "9♣", null, null, null], trick: [[1, "9♠"]], turn: 0 });
    expect(() => playCard(s, 0, "J♦")).toThrow(/can't be played/);
    const next = playCard(s, 0, "8♠");
    expect(idsOf(next.players[0].hand)).toEqual(["J♦", "7♥"]);
    expect(next.events.filter((e) => e.type !== "play")).toEqual([]);
  });
});

describe("the stack and who eats", () => {
  it("the highest trump eats; otherwise the highest led card", () => {
    const trick = [
      { seat: 2, card: c("9♠") },
      { seat: 4, card: c("8♦") },
      { seat: 0, card: c("A♠") },
    ];
    expect(trickWinner(trick, "♦")).toBe(4);
    expect(trickWinner(trick, "♥")).toBe(0);
  });

  it("an off-suit card never wins, even if higher", () => {
    expect(trickWinner([{ seat: 0, card: c("7♣") }, { seat: 1, card: c("A♠") }], "♦")).toBe(0);
  });

  it("stacks winners on top and tucks the rest under", () => {
    const trick = [
      { seat: 2, card: c("9♠") },
      { seat: 4, card: c("8♦") },
      { seat: 0, card: c("10♠") },
    ];
    expect(stackOrder(trick, "♦").map((p) => p.card.id)).toEqual(["10♠", "9♠", "8♦"]);
  });
});

describe("tricks and scoring", () => {
  it("the eater leads the next trick", () => {
    let s = playState({ hands: ["9♠ 7♥", "K♠ 7♣", null, null, null], turn: 0, dealer: 4 });
    s = playCard(s, 0, "9♠");
    s = playCard(s, 1, "K♠");
    expect(s.phase).toBe(PHASES.TRICK_END);
    expect(s.trickWinner).toBe(1);
    s = collectTrick(s);
    expect(s.players[1].eaten).toBe(1);
    expect(s.turn).toBe(1);
    expect(s.trickNumber).toBe(2);
  });

  it("scores −1 per pile, +5 for none, nothing when folded; 5 piles wins the round", () => {
    let s = playState({
      hands: ["A♦", "7♣", null, "8♣", null],
      turn: 0,
      trickNumber: 5,
      eaten: [4, 0, 0, 0, 0],
      scores: [10, 15, 12, 15, 15],
    });
    s = playCard(s, 0, "A♦");
    s = playCard(s, 1, "7♣");
    s = playCard(s, 3, "8♣");
    s = collectTrick(s);
    expect(s.phase).toBe(PHASES.ROUND_END);
    expect(s.players.map((p) => p.score)).toEqual([5, 20, 12, 20, 15]);
    expect(s.roundResults.roundWinner).toBe(0);
  });

  it("ends the match at 0, lowest score wins", () => {
    let s = playState({ hands: ["A♦", "K♦", null, null, null], turn: 0, trickNumber: 5, eaten: [1, 2, 0, 0, 0], scores: [2, 3, 9, 9, 9] });
    s = playCard(s, 0, "A♦");
    s = playCard(s, 1, "K♦");
    s = collectTrick(s);
    expect(s.players[0].score).toBe(0);
    expect(s.players[1].score).toBe(1);
    expect(s.phase).toBe(PHASES.MATCH_OVER);
    expect(s.matchWinner).toBe(0);
  });

  it("the deal passes clockwise; a rematch starts a new match", () => {
    let s = playState({ hands: ["A♦", "K♦", null, null, null], turn: 0, trickNumber: 5, dealer: 2 });
    s = collectTrick(playCard(playCard(s, 0, "A♦"), 1, "K♦"));
    const next = startNextRound(s, seededRandom(3));
    expect(next.dealer).toBe(3);
    expect(next.roundNumber).toBe(2);
    expect(next.players[0].score).toBe(s.players[0].score);
    const again = rematch(next, seededRandom(4));
    expect(again.matchNumber).toBe(2);
    expect(again.players.every((p) => p.score === START_SCORE)).toBe(true);
  });
});

describe("a whole match", () => {
  it("runs to a winner (seat 0 always plays, the others fold when they can)", () => {
    const rng = seededRandom(11);
    let s = createMatch({ players: PLAYERS, rng });
    for (let steps = 0; steps < 5000 && s.phase !== PHASES.MATCH_OVER; steps++) {
      if (s.phase === PHASES.DRAW) s = drawForDeal(s, s.turn, 1 + Math.floor(rng() * maxDrawDepth(s)), rng);
      else if (s.phase === PHASES.DECIDE) s = decide(s, s.turn, s.turn === 0 || !canFold(s, s.turn));
      else if (s.phase === PHASES.SWAP) s = swap(s, s.turn, []);
      else if (s.phase === PHASES.TRUMP) s = takeTrump(s, s.turn, s.players[s.turn].hand[0].id);
      else if (s.phase === PHASES.PLAY) s = playCard(s, s.turn, allowedPlays(s, s.turn)[0].id);
      else if (s.phase === PHASES.TRICK_END) s = collectTrick(s);
      else if (s.phase === PHASES.ROUND_END) s = startNextRound(s, rng);
    }
    expect(s.phase).toBe(PHASES.MATCH_OVER);
    expect(s.players[s.matchWinner].score).toBeLessThanOrEqual(0);
  });
});

describe("rulebook edge cases", () => {
  // §8: the lowest score wins; a tie goes to whoever ate more piles that round.
  it("a tie on the lowest score goes to whoever ate more piles in the last round", () => {
    // Seat 1 eats the last pile: seat 0 ends on 0 with 2 piles, seat 1 on 0 with 3.
    let s = playState({ hands: ["7♣", "A♦", null, null, null], turn: 0, trickNumber: 5, eaten: [2, 2, 0, 0, 0], scores: [2, 3, 9, 9, 9] });
    s = collectTrick(playCard(playCard(s, 0, "7♣"), 1, "A♦"));
    expect(s.players[0].score).toBe(0);
    expect(s.players[1].score).toBe(0);
    expect(s.phase).toBe(PHASES.MATCH_OVER);
    expect(s.matchWinner).toBe(1);
  });

  it("past 0, the lowest score wins even with fewer piles", () => {
    // Seat 0: 1 − 2 piles = −1. Seat 1: 3 − 3 piles = 0.
    let s = playState({ hands: ["A♦", "7♣", null, null, null], turn: 0, trickNumber: 5, eaten: [1, 3, 0, 0, 0], scores: [1, 3, 9, 9, 9] });
    s = collectTrick(playCard(playCard(s, 0, "A♦"), 1, "7♣"));
    expect(s.players.slice(0, 2).map((p) => p.score)).toEqual([-1, 0]);
    expect(s.matchWinner).toBe(0);
  });

  it("nobody at 0 or less: the match goes on", () => {
    let s = playState({ hands: ["A♦", "7♣", null, null, null], turn: 0, trickNumber: 5, eaten: [0, 0, 0, 0, 0], scores: [2, 9, 9, 9, 9] });
    s = collectTrick(playCard(playCard(s, 0, "A♦"), 1, "7♣"));
    expect(s.players[0].score).toBe(1);
    expect(s.phase).toBe(PHASES.ROUND_END);
    expect(s.matchWinner).toBeNull();
  });

  // §5 and §6: with the seat left of the dealer folded, the next player in starts.
  it("swapping and the first trick start with the first player in, left of the dealer", () => {
    let s = newMatch(5);
    const [, left, second, third, fourth] = around(s.dealer);
    expect(s.turn).toBe(left);
    s = decide(s, left, false); // the seat left of the dealer folds
    s = decide(s, second, true);
    s = decide(s, third, false);
    s = decide(s, fourth, true);
    s = decide(s, s.dealer, false);
    expect(s.phase).toBe(PHASES.SWAP);
    expect(s.turn).toBe(second);
    s = swap(s, second, []);
    expect(s.turn).toBe(fourth); // the folded seat in between is skipped
    s = swap(s, fourth, []);
    // The dealer folded: no trump option, play starts with the first player in.
    expect(s.phase).toBe(PHASES.PLAY);
    expect(s.turn).toBe(second);
    s = playCard(s, second, allowedPlays(s, second)[0].id);
    expect(s.turn).toBe(fourth);
    s = playCard(s, fourth, allowedPlays(s, fourth)[0].id);
    expect(s.phase).toBe(PHASES.TRICK_END); // only the two players in play the trick
  });

  // §5: the dealer's trump option doesn't depend on the draw pile.
  it("the dealer may still take the trump once the draw pile is empty", () => {
    let s = newMatch(7);
    for (let i = 0; i < 5; i++) s = decide(s, s.turn, true);
    const [, left, second] = around(s.dealer);
    s = swap(s, left, idsOf(s.players[left].hand)); // 5 of the 6 cards
    s = swap(s, second, [s.players[second].hand[0].id]); // the last one
    expect(s.drawPile).toHaveLength(0);
    // Everyone after that is skipped, and the dealer gets the trump option.
    expect(s.phase).toBe(PHASES.TRUMP);
    expect(s.turn).toBe(s.dealer);
    const give = s.players[s.dealer].hand[0];
    const trump = s.trumpCard;
    s = takeTrump(s, s.dealer, give.id);
    expect(idsOf(s.players[s.dealer].hand)).toContain(trump.id);
    expect(idsOf(s.deadPile)).toContain(give.id);
    expect(s.phase).toBe(PHASES.PLAY);
  });
});
