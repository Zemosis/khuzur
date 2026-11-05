// Khuzur engine: every rule in docs/khuzur-rulebook.md, move by move.

import { describe, it, expect } from "vitest";
import { createDeck } from "../../src/utils/khuzur/cards.js";
import {
  PHASES,
  beat,
  canSwapSeven,
  createMatch,
  deal,
  drawForDeal,
  isValidTable,
  lead,
  leadLimit,
  pickUp,
  seatCount,
  standings,
  startNextMatch,
  surrender,
  swapTrumpSeven,
  topLayer,
} from "../../src/utils/khuzur/engine.js";
import { seededRandom } from "../helpers/cards.js";
import { c, cs, idsOf } from "../helpers/khuzur.js";

const playersFor = (n) => Array.from({ length: n }, (_, i) => ({ name: i ? `Bot ${i}` : "You", type: i ? "AI" : "HUMAN" }));
const newMatch = (table, seed = 1) => createMatch({ players: playersFor(seatCount(table)), table, rng: seededRandom(seed) });
const T2v2 = { perTeam: 2, teams: 2, handSize: 5 };

/** A match waiting on its draw, the pile stacked top first and drawing in seat order. */
function drawState(table, pile) {
  const s = newMatch(table);
  const order = Array.from({ length: seatCount(table) }, (_, i) => i);
  return { ...s, dealDeck: cs(pile), drawers: order, turn: 0 };
}
const drawTop = (s) => drawForDeal(s, s.turn, 1, seededRandom(9));

describe("table shapes", () => {
  it.each([
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
    [1, 6],
    [2, 2],
    [2, 3],
    [3, 2],
  ])("%i per team × %i teams is a table", (perTeam, teams) => {
    expect(isValidTable({ perTeam, teams })).toBe(true);
  });

  it.each([
    [1, 1],
    [1, 7],
    [2, 4],
    [3, 3],
    [4, 1],
  ])("%i per team × %i teams is not", (perTeam, teams) => {
    expect(isValidTable({ perTeam, teams })).toBe(false);
  });

  it("needs one player per seat", () => {
    expect(() => createMatch({ players: playersFor(3), table: T2v2 })).toThrow();
  });

  it("rejects a hand size that isn't 5 or 7", () => {
    expect(() => createMatch({ players: playersFor(4), table: { ...T2v2, handSize: 6 } })).toThrow();
  });

  it("seats the teams alternately", () => {
    const s = newMatch({ perTeam: 2, teams: 3, handSize: 5 });
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(s.places).toEqual([null, null, null]);
  });

  it("in a free for all every player is their own team", () => {
    const s = newMatch({ perTeam: 1, teams: 5, handSize: 5 });
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 2, 3, 4]);
  });

  it("opens with the draw for the deal", () => {
    const s = newMatch(T2v2);
    expect(s.phase).toBe(PHASES.DRAW);
    expect(s.dealDeck).toHaveLength(34);
    expect(s.drawers).toHaveLength(4);
    expect(s.turn).toBe(s.drawers[0]);
  });
});

describe("the draw for the deal", () => {
  it("the highest card deals, and the player on the dealer's left leads", () => {
    let s = drawState(T2v2, "8♦ 9♣ A♠ K♠ 7♦ 7♣");
    for (let i = 0; i < 4; i++) s = drawTop(s);
    expect(s.phase).toBe(PHASES.PLAY);
    expect(s.dealer).toBe(2);
    expect(s.turn).toBe(3);
    expect(s.teamDealers).toEqual({ 0: 2 });
  });

  it("ranks by suit at the same rank, with no trump", () => {
    let s = drawState(T2v2, "9♥ 9♠ 9♣ 9♦");
    for (let i = 0; i < 4; i++) s = drawTop(s);
    expect(s.dealer).toBe(1);
  });

  it("refuses a draw out of turn or too deep", () => {
    const s = drawState(T2v2, "8♦ 9♣ A♠ K♠ 7♦ 7♣");
    expect(() => drawForDeal(s, 1, 1)).toThrow("Not your turn");
    expect(() => drawForDeal(s, 0, 7)).toThrow();
    expect(() => drawForDeal(s, 0, 0)).toThrow();
  });

  it("tied twins draw again, and only they do", () => {
    let s = drawState({ ...T2v2, handSize: 7 }, "A♠ A♠:2 8♦ 9♦ K♠ Q♠ 7♣");
    for (let i = 0; i < 4; i++) s = drawTop(s);
    expect(s.phase).toBe(PHASES.DRAW);
    expect(s.drawers).toEqual([0, 1]);
    expect(s.turn).toBe(0);
    s = drawTop(s);
    s = drawTop(s);
    expect(s.phase).toBe(PHASES.PLAY);
    expect(s.dealer).toBe(0);
  });
});

describe("the deal", () => {
  const dealt = (table, dealer, deck) => deal(newMatch(table), dealer, seededRandom(5), deck);

  it("deals one card at a time, starting on the dealer's left", () => {
    const deck = createDeck(5);
    const s = dealt(T2v2, 1, deck);
    expect(s.players[2].hand[0].id).toBe(deck[0].id);
    expect(s.players[3].hand[0].id).toBe(deck[1].id);
    expect(s.players[0].hand[0].id).toBe(deck[2].id);
    expect(s.players[1].hand[0].id).toBe(deck[3].id);
    expect(s.players[2].hand[1].id).toBe(deck[4].id);
    expect(s.trumpCard.id).toBe(deck[20].id);
    expect(s.trumpSuit).toBe(deck[20].suit);
    expect(s.turn).toBe(2);
    expect(s.phase).toBe(PHASES.PLAY);
    expect(s.stack).toBeNull();
  });

  it.each([
    [{ perTeam: 1, teams: 2, handSize: 5 }, 23],
    [{ perTeam: 1, teams: 6, handSize: 5 }, 3],
    [{ perTeam: 1, teams: 2, handSize: 7 }, 51],
    [{ perTeam: 2, teams: 3, handSize: 7 }, 23],
  ])("%o leaves %i cards to draw besides the trump", (table, left) => {
    const s = deal(newMatch(table), 0, seededRandom(4));
    expect(s.drawPile).toHaveLength(left);
    for (const p of s.players) expect(p.hand).toHaveLength(table.handSize);
    const all = [...s.players.flatMap((p) => p.hand), ...s.drawPile, s.trumpCard];
    expect(new Set(idsOf(all)).size).toBe(createDeck(table.handSize).length);
  });

  /** A 5-card deck with `ids` placed right after the cards dealt to `n` players. */
  function deckWithAfterDeal(n, ids) {
    const rest = createDeck(5).filter((x) => !ids.includes(x.id));
    return [...rest.slice(0, n * 5), ...cs(ids.join(" ")), ...rest.slice(n * 5)];
  }

  it("a joker turned as trump goes back into the middle of the pile", () => {
    const deck = deckWithAfterDeal(2, ["GJ", "9♣"]);
    const s = dealt({ perTeam: 1, teams: 2, handSize: 5 }, 0, deck);
    expect(s.trumpCard.id).toBe("9♣");
    const at = idsOf(s.drawPile).indexOf("GJ");
    expect(at).toBeGreaterThanOrEqual(5);
    expect(at).toBeLessThanOrEqual(18);
    expect(s.drawPile).toHaveLength(23);
    expect(s.events.filter((e) => e.type === "jokerReturned")).toHaveLength(1);
  });

  it("two jokers in a row both go back", () => {
    const deck = deckWithAfterDeal(2, ["GJ", "CJ", "9♣"]);
    const s = dealt({ perTeam: 1, teams: 2, handSize: 5 }, 0, deck);
    expect(s.trumpCard.id).toBe("9♣");
    expect(idsOf(s.drawPile)).toEqual(expect.arrayContaining(["GJ", "CJ"]));
    expect(s.events.filter((e) => e.type === "jokerReturned")).toHaveLength(2);
  });

  it("works with only 4 cards left at a 6-player table", () => {
    const deck = deckWithAfterDeal(6, ["GJ", "9♣"]);
    const s = dealt({ perTeam: 1, teams: 6, handSize: 5 }, 0, deck);
    expect(s.trumpCard.id).toBe("9♣");
    expect(s.drawPile).toHaveLength(3);
    expect(idsOf(s.drawPile)).toContain("GJ");
  });
});

describe("leadLimit", () => {
  const withHands = (sizes, out = []) => {
    const s = deal(newMatch({ perTeam: 1, teams: sizes.length, handSize: 5 }), 0, seededRandom(2));
    const filler = createDeck(7);
    return {
      ...s,
      players: s.players.map((p, i) => ({ ...p, hand: filler.slice(i * 10, i * 10 + sizes[i]), out: out.includes(i) })),
    };
  };

  it("is the smallest hand at the table", () => {
    expect(leadLimit(withHands([5, 5, 2, 5]))).toBe(2);
  });

  it("counts the leader's own hand", () => {
    expect(leadLimit(withHands([1, 5, 5]))).toBe(1);
  });

  it("ignores players who are out", () => {
    expect(leadLimit(withHands([5, 0, 4], [1]))).toBe(4);
  });

  it("never passes the game's hand size", () => {
    expect(leadLimit(withHands([9, 9, 9]))).toBe(5);
  });
});

/**
 * A PLAY state built directly. hands: one id string per seat. trump: the trump
 * suit. trumpCard: the face-up card's id, or null once drawn. pile: the draw
 * pile, top first.
 */
function playState({ table = { perTeam: 1, teams: 4, handSize: 5 }, hands, trump = "♥", trumpCard = "A♥", pile = "", turn = 0, dealer = null, out = [] }) {
  const s = deal(newMatch(table), 0, seededRandom(1));
  return {
    ...s,
    dealer: dealer ?? (turn + hands.length - 1) % hands.length,
    players: s.players.map((p, i) => ({ ...p, hand: cs(hands[i]), out: out.includes(i) })),
    trumpSuit: trump,
    trumpCard: trumpCard ? c(trumpCard) : null,
    drawPile: cs(pile),
    deadPile: [],
    stack: null,
    turn,
    events: [],
  };
}
const handOf = (s, seat) => idsOf(s.players[seat].hand).sort();
const FOUR = ["J♠ J♦ 9♣ 7♦ 8♦", "A♠ 10♣ Q♥ 7♣ 8♣", "K♦ K♣ 9♦ 10♦ 7♠", "Q♠ Q♦ 10♠ 9♠ 8♠"];
const PILE = "J♣ J♥ 10♥ 9♥ K♠ K♥ Q♣ Q♥:2";

describe("leading", () => {
  it("puts the cards on a new stack, draws back up and passes the turn left", () => {
    const s = lead(playState({ hands: FOUR, pile: PILE }), 0, ["J♠", "J♦", "9♣"]);
    expect(idsOf(s.stack.layers[0])).toEqual(["J♠", "J♦", "9♣"]);
    expect(s.stack.leader).toBe(0);
    expect(s.stack.owners).toEqual([0]);
    expect(s.stack.pending).toEqual([1, 2, 3]);
    expect(handOf(s, 0)).toEqual(["7♦", "8♦", "J♣", "J♥", "10♥"].sort());
    expect(s.drawPile).toHaveLength(5);
    expect(s.turn).toBe(1);
    expect(s.events.map((e) => e.type)).toEqual(["lead", "draw"]);
  });

  it("refuses an invalid lead", () => {
    expect(() => lead(playState({ hands: FOUR, pile: PILE }), 0, ["J♠", "9♣"])).toThrow("That isn't a valid lead");
    expect(() => lead(playState({ hands: FOUR, pile: PILE }), 0, ["J♠", "8♦", "9♣"])).toThrow("That isn't a valid lead");
  });

  it("refuses a lead bigger than the smallest hand", () => {
    const hands = [...FOUR];
    hands[2] = "K♦ K♣";
    expect(() => lead(playState({ hands, pile: PILE }), 0, ["J♠", "J♦", "9♣"])).toThrow("You can lead at most 2 cards");
  });

  it("refuses cards that aren't in the hand, and moves out of turn", () => {
    expect(() => lead(playState({ hands: FOUR, pile: PILE }), 0, ["A♠"])).toThrow();
    expect(() => lead(playState({ hands: FOUR, pile: PILE }), 1, ["A♠"])).toThrow("Not your turn");
  });

  it("refuses a lead while a stack is open", () => {
    const s = lead(playState({ hands: FOUR, pile: PILE }), 0, ["9♣"]);
    expect(() => lead(s, 1, ["A♠"])).toThrow("Beat the stack or pick it up");
  });

  it("teammates must beat too: the pending list holds every other player", () => {
    const s = lead(playState({ table: { perTeam: 2, teams: 2, handSize: 5 }, hands: FOUR, pile: PILE }), 0, ["9♣"]);
    expect(s.stack.pending).toEqual([1, 2, 3]);
  });
});

describe("beating", () => {
  const led = () => lead(playState({ hands: FOUR, pile: PILE }), 0, ["J♠", "J♦", "9♣"]);

  it("covers every card of the top layer, column by column, and draws back up", () => {
    const hands = [...FOUR];
    hands[1] = "Q♠ K♠ 10♣ 7♣ 8♣";
    let s = lead(playState({ hands, pile: PILE }), 0, ["J♠", "J♦", "9♣"]);
    s = beat(s, 1, ["10♣", "K♠", "Q♠"]);
    expect(idsOf(topLayer(s))).toEqual(["K♠", "Q♠", "10♣"]);
    expect(s.stack.owners).toEqual([0, 1]);
    expect(s.stack.pending).toEqual([2, 3]);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.turn).toBe(2);
  });

  it("refuses the wrong number of cards", () => {
    expect(() => beat(led(), 1, ["A♠"])).toThrow("Beat with exactly 3 cards");
  });

  it("refuses cards that don't beat", () => {
    expect(() => beat(led(), 1, ["A♠", "10♣", "7♣"])).toThrow("Those cards don't beat the top layer");
  });

  it("refuses a beat from anyone but the next player", () => {
    expect(() => beat(led(), 2, ["K♦", "K♣", "10♦"])).toThrow("Not your turn");
  });

  it("a stack that goes all the way round goes dead, and the last beater leads", () => {
    let s = lead(playState({ hands: FOUR, pile: PILE }), 0, ["8♦"]);
    s = beat(s, 1, ["8♣"]);
    s = beat(s, 2, ["9♦"]);
    s = beat(s, 3, ["9♠"]);
    expect(s.stack).toBeNull();
    expect(idsOf(s.deadPile).sort()).toEqual(["8♦", "8♣", "9♦", "9♠"].sort());
    expect(s.turn).toBe(3);
    expect(s.events.at(-1)).toMatchObject({ type: "dead", count: 4, seat: 3 });
  });

  it("in 1v1 one beat ends the stack and the beater leads", () => {
    const table = { perTeam: 1, teams: 2, handSize: 5 };
    let s = lead(playState({ table, hands: FOUR.slice(0, 2), pile: PILE }), 0, ["8♦"]);
    s = beat(s, 1, ["8♣"]);
    expect(s.stack).toBeNull();
    expect(s.turn).toBe(1);
  });
});

describe("picking up", () => {
  it("takes every layer into the hand, without drawing, and the player on the left leads", () => {
    let s = lead(playState({ hands: FOUR, pile: PILE }), 0, ["8♦"]);
    s = beat(s, 1, ["8♣"]);
    const pileBefore = s.drawPile.length;
    s = pickUp(s, 2);
    expect(handOf(s, 2)).toEqual(["K♦", "K♣", "9♦", "10♦", "7♠", "8♦", "8♣"].sort());
    expect(s.drawPile).toHaveLength(pileBefore);
    expect(s.stack).toBeNull();
    expect(s.turn).toBe(3);
    expect(s.events.at(-1)).toMatchObject({ type: "pickUp", seat: 2, count: 2 });
  });

  it("is allowed even when the player could beat", () => {
    const s = pickUp(lead(playState({ hands: FOUR, pile: PILE }), 0, ["7♦"]), 1);
    expect(handOf(s, 1)).toContain("7♦");
  });

  it("is refused from anyone but the next player, and with no stack", () => {
    const s = lead(playState({ hands: FOUR, pile: PILE }), 0, ["7♦"]);
    expect(() => pickUp(s, 2)).toThrow("Not your turn");
    expect(() => pickUp(playState({ hands: FOUR, pile: PILE }), 0)).toThrow();
  });
});

describe("drawing back up when the pile runs dry", () => {
  it("takes what's left, then the face-up trump, and stops there", () => {
    let s = lead(playState({ hands: FOUR, pile: "8♥", trumpCard: "A♥" }), 0, ["J♠", "J♦", "9♣"]);
    expect(handOf(s, 0)).toEqual(["7♦", "8♦", "8♥", "A♥"].sort());
    expect(s.drawPile).toHaveLength(0);
    expect(s.trumpCard).toBeNull();
    expect(s.trumpSuit).toBe("♥");
    expect(s.events.at(-1)).toMatchObject({ type: "draw", seat: 0, count: 2, tookTrump: true });
    const hands = [...FOUR];
    hands[1] = "Q♠ K♠ 10♣ 7♣ 8♣";
    s = lead(playState({ hands, pile: "8♥", trumpCard: "A♥" }), 0, ["J♠", "J♦", "9♣"]);
    s = beat(s, 1, ["10♣", "K♠", "Q♠"]);
    expect(s.players[1].hand).toHaveLength(2);
  });
});

describe("the trump 7", () => {
  const hands = ["7♥ J♦ 9♣ 7♦ 8♦", ...FOUR.slice(1)];

  it("swaps for the face-up trump on your turn to lead", () => {
    const s0 = playState({ hands, pile: PILE, trumpCard: "A♥" });
    expect(canSwapSeven(s0, 0)).toBe(true);
    const s = swapTrumpSeven(s0, 0);
    expect(handOf(s, 0)).toContain("A♥");
    expect(handOf(s, 0)).not.toContain("7♥");
    expect(s.trumpCard.id).toBe("7♥");
    expect(s.turn).toBe(0);
    expect(s.events.at(-1)).toMatchObject({ type: "swapSeven", seat: 0 });
  });

  it("swaps on your turn to beat", () => {
    const h = [...FOUR];
    h[1] = "7♥ 10♣ Q♥ 7♣ 8♣";
    const s = lead(playState({ hands: h, pile: PILE, trumpCard: "A♥" }), 0, ["8♦"]);
    expect(canSwapSeven(s, 1)).toBe(true);
    expect(handOf(swapTrumpSeven(s, 1), 1)).toContain("A♥");
  });

  it("is refused when it isn't your turn", () => {
    const s = playState({ hands, pile: PILE, trumpCard: "A♥", turn: 1 });
    expect(canSwapSeven(s, 0)).toBe(false);
    expect(() => swapTrumpSeven(s, 0)).toThrow("You can't swap now");
  });

  it("is refused once the trump card has been drawn", () => {
    const s = playState({ hands, pile: PILE, trumpCard: null });
    expect(canSwapSeven(s, 0)).toBe(false);
  });

  it("nothing swaps for a face-up 7, so the second trump 7 can't swap", () => {
    const table = { perTeam: 1, teams: 4, handSize: 7 };
    const h = ["7♥:2 J♦ 9♣ 7♦ 8♦", ...FOUR.slice(1)];
    const s = playState({ table, hands: h, pile: PILE, trumpCard: "7♥" });
    expect(canSwapSeven(s, 0)).toBe(false);
  });
});

describe("going out", () => {
  const dry = { pile: "", trumpCard: null };

  it("a player who beats with their last card is out at once, and the stack carries on", () => {
    let s = playState({ ...dry, hands: ["8♦ 7♣", "9♦", "10♦ 7♠", "J♦ 8♠"] });
    s = lead(s, 0, ["8♦"]);
    s = beat(s, 1, ["9♦"]);
    expect(s.players[1].out).toBe(true);
    expect(s.places).toEqual([null, 1, null, null]);
    expect(s.stack.pending).toEqual([2, 3]);
    expect(s.turn).toBe(2);
    expect(s.events.find((e) => e.type === "out")).toMatchObject({ seat: 1, team: 1, place: 1 });
  });

  it("a leader who leads their last cards is out, and everyone else must still beat", () => {
    const s = lead(playState({ ...dry, hands: ["8♦", "9♦ 7♣", "10♦ 7♠", "J♦ 8♠"] }), 0, ["8♦"]);
    expect(s.players[0].out).toBe(true);
    expect(s.stack.pending).toEqual([1, 2, 3]);
    expect(s.turn).toBe(1);
  });

  it("free for all: places go in the order players go out, and the last one left is last", () => {
    let s = playState({ ...dry, hands: ["8♦", "9♦", "10♦ 7♣", "J♦ 7♠"] });
    s = lead(s, 0, ["8♦"]);
    s = beat(s, 1, ["9♦"]);
    s = beat(s, 2, ["10♦"]);
    s = beat(s, 3, ["J♦"]);
    expect(s.stack).toBeNull();
    expect(s.turn).toBe(3);
    s = lead(s, 3, ["7♠"]);
    expect(s.places).toEqual([1, 2, 4, 3]);
    expect(s.phase).toBe(PHASES.MATCH_OVER);
    expect(s.events.at(-1)).toMatchObject({ type: "matchOver", places: [1, 2, 4, 3] });
  });

  it.each([
    [{ perTeam: 2, teams: 2, handSize: 5 }, ["8♦", "9♦ 7♣", "10♦ 7♠", "J♦ 8♠"]],
    [{ perTeam: 3, teams: 2, handSize: 5 }, ["8♦", "9♦ 7♣", "10♦ 7♠", "J♦ 8♠", "Q♦ 8♣", "K♦ 9♠"]],
  ])("%o: the first player out wins for the team and ends the match", (table, hands) => {
    const s = lead(playState({ ...dry, table, hands }), 0, ["8♦"]);
    expect(s.places).toEqual([1, 2]);
    expect(s.phase).toBe(PHASES.MATCH_OVER);
    expect(s.players.filter((p) => p.team === 0).every((p) => p.out)).toBe(true);
  });

  it("2v2v2: a team that goes out leaves the stack, and the other two play on for 2nd", () => {
    const table = { perTeam: 2, teams: 3, handSize: 5 };
    let s = playState({ ...dry, table, hands: ["8♦", "9♦ 7♣", "10♦", "J♦ 8♠", "Q♦ 8♣", "K♦ 9♠"] });
    s = lead(s, 0, ["8♦"]);
    expect(s.players[3].out).toBe(true);
    expect(s.stack.pending).toEqual([1, 2, 4, 5]);
    expect(s.places).toEqual([1, null, null]);
    expect(s.turn).toBe(1);
    s = beat(s, 1, ["9♦"]);
    s = beat(s, 2, ["10♦"]);
    expect(s.places).toEqual([1, 3, 2]);
    expect(s.phase).toBe(PHASES.MATCH_OVER);
  });

  it("2v2v2: when the beater's team goes out with only its own seats left to beat, the stack dies", () => {
    const table = { perTeam: 2, teams: 3, handSize: 5 };
    const s0 = playState({ ...dry, table, hands: ["8♣ 7♣", "8♠ 7♠", "9♦", "J♦ 8♥", "Q♦ 7♥", "K♦ 9♠"], turn: 2 });
    const s = beat({ ...s0, stack: { leader: 1, layers: [cs("8♦")], owners: [1], pending: [2, 5] } }, 2, ["9♦"]);
    expect(s.stack).toBeNull();
    expect(idsOf(s.deadPile)).toEqual(["8♦", "9♦"]);
    expect(s.places).toEqual([null, null, 1]);
    expect(s.turn).toBe(3);
  });

  it("when the last beater went out, the next player still in leads", () => {
    const table = { perTeam: 1, teams: 3, handSize: 5 };
    let s = playState({ ...dry, table, hands: ["8♦ 7♣", "9♦ 7♠", "10♦"] });
    s = lead(s, 0, ["8♦"]);
    s = beat(s, 1, ["9♦"]);
    s = beat(s, 2, ["10♦"]);
    expect(s.stack).toBeNull();
    expect(s.turn).toBe(0);
  });

  it("the lead limit ignores players who are out", () => {
    let s = playState({ ...dry, hands: ["8♦ 8♣ 7♣ 9♠", "9♦", "10♦ 10♣ 10♠", "J♦ J♣ 8♠"] });
    s = lead(s, 0, ["7♣"]);
    s = beat(s, 1, ["9♦"]);
    expect(leadLimit(s)).toBe(3);
  });
});

describe("surrender", () => {
  it("free for all: you're last, and the rest are placed by cards held, fewest first", () => {
    let s = playState({ hands: ["8♦ 7♣ 9♠", "9♦ 7♠", "10♦ 7♥", "J♦"], pile: "", trumpCard: null, out: [3] });
    s = { ...s, places: [null, null, null, 1] };
    s = surrender(s, 0);
    expect(s.places).toEqual([4, 2, 3, 1]);
    expect(s.phase).toBe(PHASES.MATCH_OVER);
  });

  it("teams: the whole team is last, the others placed by their smallest hand", () => {
    const table = { perTeam: 2, teams: 3, handSize: 5 };
    const s = surrender(playState({ table, hands: ["8♦", "9♦ 7♣ 8♣", "10♦ 7♠", "J♦ 8♠", "Q♦", "K♦ 9♠"], pile: PILE }), 3);
    expect(s.places).toEqual([3, 1, 2]);
    expect(standings(s)).toEqual([
      { team: 1, place: 1, seats: [1, 4] },
      { team: 2, place: 2, seats: [2, 5] },
      { team: 0, place: 3, seats: [0, 3] },
    ]);
  });

  it("is only possible during play", () => {
    const s = newMatch(T2v2);
    expect(() => surrender(s, 0)).toThrow();
  });
});

describe("the next match", () => {
  const over = (table, places, extra = {}) => ({ ...playState({ table, hands: Array(seatCount(table)).fill("8♦"), pile: PILE }), phase: PHASES.MATCH_OVER, places, ...extra });

  it("free for all: the deal passes clockwise", () => {
    const s = startNextMatch(over({ perTeam: 1, teams: 4, handSize: 5 }, [1, 2, 3, 4], { dealer: 2, matchNumber: 1 }), seededRandom(3));
    expect(s.dealer).toBe(3);
    expect(s.matchNumber).toBe(2);
    expect(s.phase).toBe(PHASES.PLAY);
    expect(s.turn).toBe(0);
    expect(s.places).toEqual([null, null, null, null]);
    expect(s.players.every((p) => !p.out && p.hand.length === 5)).toBe(true);
  });

  it("teams: the last-place team deals, moving clockwise within the team", () => {
    const s = startNextMatch(over(T2v2, [2, 1], { dealer: 1, teamDealers: { 0: 2 } }), seededRandom(3));
    expect(s.dealer).toBe(0);
    expect(s.teamDealers).toEqual({ 0: 0 });
  });

  it("teams: a team dealing for the first time deals from a random member", () => {
    const table = { perTeam: 2, teams: 3, handSize: 5 };
    const dealers = new Set();
    for (let seed = 1; seed <= 20; seed++) {
      const s = startNextMatch(over(table, [1, 3, 2], { dealer: 0, teamDealers: { 0: 0 } }), seededRandom(seed));
      dealers.add(s.dealer);
      expect(s.teamDealers[1]).toBe(s.dealer);
    }
    expect([...dealers].sort()).toEqual([1, 4]);
  });

  it("only once the match is over", () => {
    expect(() => startNextMatch(playState({ hands: FOUR, pile: PILE }))).toThrow();
  });
});
