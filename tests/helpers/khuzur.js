// Khuzur test helpers: readable card builders.
//   c("J♠")   a jack of spades (the first deck's)
//   c("J♠:2") its twin from the second deck
//   c("GJ")   the gray joker, c("CJ") the colored joker
//   cs("J♠ J♦ 9♣") a list

import { makeCard, makeJoker } from "../../src/utils/khuzur/cards.js";

export function c(id) {
  if (id === "GJ") return makeJoker("gray");
  if (id === "CJ") return makeJoker("color");
  const [face, copy] = id.split(":");
  return makeCard(face.slice(0, -1), face.slice(-1), copy ? Number(copy) : 1);
}

export const cs = (ids) => (ids.trim() ? ids.trim().split(/\s+/).map(c) : []);
export const idsOf = (list) => list.map((x) => x.id);
