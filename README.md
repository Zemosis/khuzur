# Khuzur: Card Hall

A retro pixel-art card hall in the browser. Play classic card games with friends online, or practise against CPU players, all styled like a 16-bit console game.

**Play it:** https://khuzur.onrender.com (the game server sleeps when idle, so the first visit can take about a minute)

## Games

| Game         | Players | What it is                                                                                                                                                       | Rules                                 |
| ------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Thirteen** | 2–4     | A shedding game in the style of Vietnam's _Tiến lên_: beat the last play with a higher single, pair, triple or 5-card hand, and be the first to empty your hand. | [Rulebook](docs/thirteen-rulebook.md) |
| **Muushig**  | 5       | A Mongolian trick-taking game with trumps. Everyone starts on 15 points, each trick you win takes one off, and the first to reach 0 wins.                        | [Rulebook](docs/muushig-rulebook.md)  |
| **Poker**    | 2–6     | No-limit Texas Hold'em, for free chips or for credits.                                                                                                           | [Rulebook](docs/poker-rulebook.md)    |

Every game also has its rules built in: open **RULES** at any table.

## Features

- **Online tables:** public or private, with invite links. You can rejoin after a refresh or a dropped connection.
- **Practice:** play against CPU players at three levels, **Easy**, **Medium** and **Hard**. Hard counts cards and plays each move out in its head before choosing.
- **Play as a guest,** or sign in with email, Google or Discord.
- **Profiles:** pick an avatar or paint your own, and see your stats and match history, down to each round and each poker hand.
- **Credits:** play poker for a balance that stays with your account. You get a daily top-up and can climb an all-time leaderboard.
- **Chat:** table chat with quick replies and speech bubbles over each seat.
- **Works on phones,** held either way.

## Fair play

Card games only work when nobody can rig the deck or peek at hands. Here is how Khuzur keeps them fair.

- **A truly random shuffle.** Every deal uses the [Fisher–Yates shuffle](https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle), so every order of the deck is equally likely. Its random numbers come from the system's cryptographic generator (`crypto.getRandomValues`), the same kind used for encryption keys. The game never uses `Math.random`: its output can be predicted after seeing a few values, which would let someone work out the next shuffle. Each draw uses a fresh 32-bit random number, so any leftover bias is below one in 80 million.
- **A new deck every time.** Each round or hand starts from a full deck, shuffled again from scratch.
- **The server deals, not your browser.** Online, the game server shuffles, deals and checks every move, and a move it doesn't allow is refused. Your browser receives only your own cards: other players' cards arrive as blank backs, and the deck itself is never sent.
- **CPUs don't cheat.** A CPU knows only what a player in its seat would know: its own hand, how many cards everyone holds, and what's been played. For Thirteen, a test swaps the hidden cards around and checks that a CPU's moves don't change.
- **Tested.** Tests check that the shuffle can produce every order of the deck, each from exactly one sequence of random draws, and that it draws from the secure generator. Fixed, repeatable shuffles exist only inside the tests.
- **Credits are accounted for.** Every credit that moves between a balance and a table is written to a ledger, and the server checks at start-up that the books balance.

## Tech stack

- **Client:** React 19, Vite, Tailwind CSS 4, GSAP for card animation, Socket.IO client.
- **Server:** Node.js, Express 5, Socket.IO, PostgreSQL 17.
- **Hosting:** Render (site and game server) and Supabase (Postgres).

## Running it locally

You need Node.js 22 and Postgres 17. The easiest way to get Postgres is a container:

```sh
podman run -d --name khuzur-db -p 5432:5432 \
  -e POSTGRES_USER=khuzur -e POSTGRES_PASSWORD=khuzur -e POSTGRES_DB=khuzur \
  -v khuzur-pgdata:/var/lib/postgresql/data docker.io/library/postgres:17
```

(`docker` takes the same flags.) Then copy `.env.example` to `.env` and `server/.env.example` to `server/.env`, and start both halves:

```sh
cd server && npm install && npm run dev   # game server on :3001 (sets up the database)
npm install && npm run dev                # site on http://localhost:5173
```

Without a database the server still runs, but with guest play only and no match history.

## Testing

```sh
npm test              # everything
npm run test:unit     # rules, CPU logic, whole-match simulations
npm run test:server   # engine, real sockets, database
npm run test:ui       # table components (jsdom)
npm run test:watch    # re-run on save
npm run coverage      # coverage report in coverage/
```

- **Both copies of the rules are tested.** The game rules exist twice, once for practice in the browser (`src/utils`) and once for the game server (`server/game`). Every rule test runs against both, so the two can't drift apart.
- **No setup needed.** `server/tests/socket.test.js` starts its own server on a free port. Nothing else needs to be running.
- **Database tests** (`server/tests/db`) run only when `TEST_DATABASE_URL` is set, in the environment or in `server/.env`. They wipe that database, so point it at a throwaway one:

  ```sh
  podman exec khuzur-db psql -U khuzur -c "create database khuzur_test owner khuzur"
  ```

## Documentation

| Document                                       | What's in it                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| [Thirteen rulebook](docs/thirteen-rulebook.md) | Card order, combinations, scoring, CPU levels                             |
| [Muushig rulebook](docs/muushig-rulebook.md)   | Dealing, going in or folding, trumps, scoring                             |
| [Poker rulebook](docs/poker-rulebook.md)       | Betting, pots, chips, credit tables                                       |
| [Architecture](docs/ARCHITECTURE.md)           | How the client, server and database fit together, security and deployment |
| [Style guide](docs/STYLEGUIDE.md)              | The pixel-art design rules every screen follows                           |

## License

[MIT](LICENSE) © 2026 Zemosis
