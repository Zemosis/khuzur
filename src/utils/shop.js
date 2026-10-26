// SHOP — what gold buys. One copy runs on the server, which sells
// (server/game/shop.js), and one in the browser, which draws the shop;
// tests/unit/rules-copies.test.js keeps them identical.
//
// Prices follow docs/gold-economy.md: an average match pays about 75 gold
// all in, so price in matches and round to a tier. Once an item is on sale
// its price stays.

/** The shop's tabs. Only `live` ones sell anything yet; the rest show as SOON. */
export const SHOP_CATEGORIES = [
  { id: "avatar", label: "Avatar slots", live: true, blurb: "Keep more painted avatars and switch between them from your badge." },
  { id: "borders", label: "Avatar borders", live: false, blurb: "Frames around your avatar, at every table and on your profile." },
  { id: "titles", label: "Titles", live: false, blurb: "A line under your name. Some you buy, some you earn by playing." },
  { id: "cards", label: "Card variants", live: false, blurb: "New card backs, then whole new faces for your hand." },
];

/** Painted-avatar slots: everyone has the first, and can buy up to this many. */
export const MAX_AVATAR_SLOTS = 3;

export const SHOP_ITEMS = [
  {
    id: "avatar_slot_2",
    category: "avatar",
    name: "Avatar slot 2",
    desc: "A second painted avatar.",
    price: 1500,
    avatarSlot: 2,
  },
  {
    id: "avatar_slot_3",
    category: "avatar",
    name: "Avatar slot 3",
    desc: "A third painted avatar.",
    price: 3000,
    avatarSlot: 3,
    requires: "avatar_slot_2",
  },
];

export function shopItem(id) {
  return SHOP_ITEMS.find((i) => i.id === id) ?? null;
}

/** Whether a profile ({ avatar_slots }) owns an item. */
export function ownsItem(profile, item) {
  if (item.avatarSlot) return (profile?.avatar_slots ?? 1) >= item.avatarSlot;
  return false;
}

/**
 * Why a profile ({ coins, avatar_slots }) can't buy an item, or null if it can:
 * "owned", "requires" (buy item.requires first) or "gold" (too little).
 */
export function cantBuy(profile, item) {
  if (ownsItem(profile, item)) return "owned";
  if (item.requires && !ownsItem(profile, shopItem(item.requires))) return "requires";
  if ((profile?.coins ?? 0) < item.price) return "gold";
  return null;
}
