# Gold economy

How gold comes in, how it goes out, and how to price what the shop sells.
Read this before you add a shop item or change what a match pays.

Gold is the shop currency. It is not credits: credits are staked at tables and
ranked on the leaderboard, and gold never turns into credits or back.

## Where gold comes from

The rules are in `src/utils/progression.js` (the server runs a copy at
`server/game/progression.js`). Only signed-in players earn.

| Source | Pays |
|---|---|
| An online Thirteen or Muushig match, free or credit | `20 + 60·share` gold, with `share = (n − place)/(n − 1)`. The winner gets 80 and last place 20 |
| A poker hand you were dealt into | 3 gold, or 8 if you won it, at most one paid hand every 30 s per table |
| Reaching a new level | `25 × level`, doubled on every 5th level |

**Only play against people pays.** A match pays only if at least two people
(signed in or guests) play it to the end. A poker hand pays only if at least
two people are dealt in. An online table of one player and CPUs is the same as
practice, and pays nothing. *(`finishSession` in `server/persistence.js`, and
`recordHand` in `server/index.js`.)* If you're the only person left at the end,
the match pays you nothing, and the end screen tells you why.

Nothing else pays. Solo games, guests, abandoned matches and seats a player left
for good pay nothing.

## How fast players earn

An average player finishes mid-table: about **50 gold and 50 XP a match**. Add
level-up gold and the total holds steady through a whole career:

| Matches played | Level | Gold earned in all |
|---:|---:|---:|
| 10 | 4 | 725 |
| 20 | 6 | 1,625 |
| 50 | 9 | 3,725 |
| 100 | 13 | 7,625 |
| 200 | 19 | 15,475 |
| 500 | 31 | 40,000 |

That's **about 75–80 gold a match** for an average player and about 100 for one
who usually wins. Levels get slower, but each level-up pays more, and the two
roughly cancel out. So prices don't need to rise over time.

**The pricing unit: 1 match ≈ 75 gold.** A match takes 10–15 minutes, so an
hour of play is about 300–450 gold. Poker pays about the same per hour: at most
120 paid hands an hour, averaging about 4 gold each, plus level-ups.

*(These figures come from running `applyGain` over a simulated career. Re-run
it whenever the rules in `progression.js` change.)*

## Where gold goes

The **shop** is the only place gold is spent. A purchase:

- is permanent: no rentals, no expiry;
- can't be refunded, except by hand by an admin;
- happens in one transaction on the server. It locks the profile row, checks
  the price against the balance, takes the gold and records the purchase in
  `shop_purchases`. A balance can't go below zero (`profiles_counters_non_negative`).

The catalog is in `src/utils/shop.js`, with a server copy at
`server/game/shop.js`. The server's copy decides the prices, so a browser can't
change what it pays.

## Price tiers

Price everything in matches, then round to a tidy number.

| Tier | Matches | Price | For |
|---|---:|---:|---|
| Common | ~10 | 750 | Simple titles |
| Rare | ~30 | 2,500 | Plain avatar borders, better titles |
| Epic | ~80 | 6,000 | Animated borders, card backs |
| Legendary | ~200 | 15,000 | Full card-face variants, the best borders |

Someone who plays 5 matches a day earns about 400 gold a day: a common item
every two days, an epic item every two weeks, a legendary item every five or
six weeks.

### On sale now

| Item | Price | Why |
|---|---:|---|
| Avatar slot 2 | 1,500 | ~20 matches. The first thing worth saving for, reachable around level 6 |
| Avatar slot 3 | 3,000 | ~40 more matches. Needs slot 2 first |

A player starts with one painted-avatar slot and can own three.

### Planned (shown as SOON in the shop)

| Category | Tiers | Notes |
|---|---|---|
| Avatar borders | Rare → Legendary (2,500–15,000) | A frame drawn around your avatar wherever it shows |
| Titles | Common → Epic (750–6,000) | A line under your name. Some titles should be *earned*, not bought (level 10, first credit pot), so a title can still mean something |
| Card variants | Epic → Legendary (6,000–15,000) | Card backs first, full faces later. Only you see your own faces; everyone sees your back |

## Rules for new items

1. **Price in matches first** (×75), then round to the nearest tier.
2. **Looks only.** Nothing in the shop may change how a game plays out or what
   it pays. No XP boosts, no gold boosts, no credit-related items.
3. **No money and no exchange.** Gold can't be bought with real money or
   credits, and can't be traded between players.
4. **Keep some things earned.** Each category should have a few items you can
   only earn by playing, so the shop isn't the only way to show off.
5. **Add, don't reprice.** Once something is on sale its price stays. To make
   something cheaper, add a new item instead, so earlier buyers aren't punished.

## Things to watch

Nothing here needed changing for the shop to open. These could become
problems once players have something to spend on:

- **Two-tab farming.** Since CPU-only tables pay nothing, the cheapest farm is
  your account plus a guest in a second tab playing to the end. That takes
  real effort, so it's fine for now. If it shows up (the same pairs playing
  over and over), credits' pair flags (`server/credits/flags.js`) are the
  model to copy.
- **Poker hours.** Poker pays about the same per hour as matches, but if hands
  get faster (shorter turn clocks, fewer CPUs thinking), the 30-second spacing
  is what keeps it in line.
- **Supply.** Compare the gold earned (`sum(game_players.coins_earned)`, plus
  level-up gold) with the gold spent (`sum(shop_purchases.price)`), and the
  spread of balances (`percentile_cont` on `profiles.coins`). If balances pile
  up with nothing left to buy, add items before you change any earning rate.
- **No ledger for income yet.** Purchases are recorded and match and poker gold is in
  `game_players.coins_earned`, but level-up gold isn't recorded anywhere. If
  gold ever needs auditing like credits, add a `gold_ledger` like `credit_ledger`.
