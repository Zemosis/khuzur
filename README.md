# Khuzur

_Khuzur_ (хөзөр) is Mongolian for playing cards. It's a real-time multiplayer card hall in the browser, styled like a 16-bit console game: five card games, online tables with friends or strangers, and CPU opponents at three levels built on game-AI techniques (determinized Monte Carlo search, Bayesian inference, constraint satisfaction).

**Play it:** https://khuzur.onrender.com (the server sleeps when idle; the first visit can take about a minute).
**How it works:** the site's [/how-it-works](https://khuzur.onrender.com/how-it-works) page documents every algorithm, formula and benchmark below in depth.

## Highlights

- **5 games, 1 engine pattern.** Thirteen, Muushig, Khuzur, No-limit Hold'em and Blackjack, each a pure `(state, action) → state` rules engine that runs in the browser (practice) and on the server (online) from copies kept identical by tests.
- **Server-authoritative multiplayer** over Socket.IO: clients send intents, the server validates them, and each seat receives a redacted projection with every hidden card removed.
- **CPU players that never peek**, verified by metamorphic tests: redeal every card a seat can't see, and the CPU must make the identical decision.
- **Provably uniform shuffles** (Fisher–Yates on the Web Crypto CSPRNG), checked with chi-square goodness-of-fit tests on every game's shuffle.
- **Accounts and an economy:** Google/Discord/email sign-in, XP and levels, a gold shop, and credit stakes recorded in a ledger the server audits at start-up.
- **2,000+ automated tests** (Vitest): rules, whole-match simulations, real sockets, Postgres.

## Games

| Game | Players | What it is | Rules |
| --- | --- | --- | --- |
| **Thirteen** | 2–4 | Climbing/shedding game in the style of Vietnam's _Tiến lên_ | [Rulebook](docs/thirteen-rulebook.md) |
| **Muushig** | 5 | Mongolian trick-taking game with trumps, a race from 15 points to 0 | [Rulebook](docs/muushig-rulebook.md) |
| **Khuzur** | 2–6 | Mongolian beat-or-pick-up game, free for all or teams (2v2, 2v2v2, 3v3) | [Rulebook](docs/khuzur-rulebook.md) |
| **Poker** | 2–7 | No-limit Texas Hold'em, for chips or credits | [Rulebook](docs/poker-rulebook.md) |
| **Blackjack** | 1–5 | Six-deck shoe against the house, S17, blackjack pays 3:2 | [Rulebook](docs/blackjack-rulebook.md) |

## Game AI

Each CPU is a utility-based agent restricted to its seat's percepts. The Hard levels share one approach: sample complete deals of the unseen cards that satisfy everything the table has revealed (a CSP, filled most-constrained variable first), play each candidate move out to the end in every sample with a heuristic rollout policy, and pick the best average (Perfect Information Monte Carlo, i.e. one-level MCTS with common random numbers).

| Game | Medium | Hard |
| --- | --- | --- |
| **Thirteen** | DP planner over 2¹³ hand subsets (memoized), hypergeometric hold chances, blocking | Card counting + pass inference, 40 constraint-consistent deals, expected-points minimization |
| **Muushig** | Per-card trick odds tables, expected-value go-in rule (margin tuned over 2,000 matches) | Deals consistent with voids, rank caps and swap counts (MRV order), 150–360 samples, match-win utility |
| **Poker** | Chen-formula ranges by position, Monte Carlo equity vs pot odds | Naive-Bayes hand reading with smoothed opponent profiles, range-weighted equity (400 run-outs), bluffs, push-or-fold |
| **Khuzur** | Linear evaluation (card worth from counting, opponent cover probability), 12 weights tuned by hill climbing on self-play | Bayesian likelihood weighting of pick-ups, CSP world sampling, sequential halving over a 6,000-move rollout budget (~25–45 ms) |

Easy levels are deliberately human: Khuzur's Easy samples moves from a softmax over Medium's scores (τ = 1), so its mistakes are plausible near-misses.

### Benchmarks

`npm run sim:cpu` plays whole matches between levels on fixed seeds in duplicate format (each deal replayed with the levels rotated through the seats, so deal luck cancels), checking after every move that no card or chip appears or vanishes and every move is legal. ± is a 95% interval.

| Matchup | Result | Fair share |
| --- | --- | --- |
| Thirteen: 1 Hard among 3 Medium | **67.3% ± 3.8** of matches won | 25% |
| Thirteen: 1 Medium among 3 Easy | **75.8% ± 3.4** | 25% |
| Muushig: 1 Hard among 4 Medium | **24.6% ± 3.8** | 20% |
| Muushig: 1 Medium among 4 Easy | **61.9% ± 4.3** | 20% |
| Khuzur 2v2: Hard side vs Medium side | **71.0% ± 4.0** | 50% |
| Khuzur heads-up: Hard vs Medium | **76.4% ± 3.7** | 50% |
| Khuzur 2v2: Medium side vs Easy side | **68.0% ± 4.1** | 50% |
| Poker, 6 seats: 3 Hard vs 3 Medium | **+15.1 ± 7.1** big blinds / 100 hands | 0 |
| Poker, 6 seats: 3 Medium vs 3 Easy | **+52.1 ± 11.6** bb/100 | 0 |

7,200 whole matches and 96,000 poker hands in all (18 minutes on 15 threads), with zero invariant violations. The full table, including where a level falls short (Muushig's Hard is only modestly ahead of Medium), is on the How it works page.

Khuzur's November 2026 CPU rewrite beat the CPUs it replaced on paired deals: Medium 51–68% across six table shapes, Hard 62–64% heads-up (even in team games).

`npm run sim:shuffle` runs χ² goodness-of-fit tests on every game's own shuffle with the production generator: 2.4M shuffles of a 4-card deck per game (all 24 orders), plus card-by-position counts over 60,000 full decks. The 12 p-values are spread as uniformity predicts (0.004 to 0.73; the one low value didn't replicate, at p = 0.45, 0.28 and 0.07 over 3 reruns at twice the size). The textbook-broken "swap with any position" shuffle, run as a control, is rejected with χ² = 72,076 on 23 df (p < 10⁻⁶).

## Tech stack

- **Client:** React 19, Vite, Tailwind CSS 4, GSAP, Socket.IO client.
- **Server:** Node.js 22, Express 5, Socket.IO, PostgreSQL 17 (migrations, ledger, match history).
- **Hosting:** Render (site and game server), Supabase (Postgres).
- **Testing:** Vitest (unit, server and jsdom UI projects), Testing Library.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the runtime design, socket protocol, database schema and security model.

## Running it locally

You need Node.js 22 and Postgres 17. The easiest way to get Postgres is a container:

```sh
podman run -d --name khuzur-db -p 5432:5432 \
  -e POSTGRES_USER=khuzur -e POSTGRES_PASSWORD=khuzur -e POSTGRES_DB=khuzur \
  -v khuzur-pgdata:/var/lib/postgresql/data docker.io/library/postgres:17
```

(`docker` takes the same flags.) Copy `.env.example` to `.env` and `server/.env.example` to `server/.env`, then:

```sh
cd server && npm install && npm run dev   # game server on :3001 (migrates the database)
npm install && npm run dev                # site on http://localhost:5173
```

Without a database the server still runs, with guest play only.

## Tests and benchmarks

```sh
npm test               # everything
npm run test:unit      # rules, CPU logic, whole-match simulations
npm run test:server    # engines, real sockets, database
npm run test:ui        # components (jsdom)
npm run sim:cpu        # CPU benchmark, all games (minutes, all cores)
npm run sim:shuffle    # shuffle uniformity tests
```

Database tests (`server/tests/db`) run only when `TEST_DATABASE_URL` points at a throwaway database; they wipe it.

## Documentation

| Document | What's in it |
| --- | --- |
| [Rulebooks](docs/) | One per game, including how each CPU level plays |
| [Architecture](docs/ARCHITECTURE.md) | Client, server and database, security, deployment |
| [Style guide](docs/STYLEGUIDE.md) | The pixel-art design rules every screen follows |
| [Changelog](CHANGELOG.md) | Every release, newest first |

## License

[MIT](LICENSE) © 2026 Zemosis
