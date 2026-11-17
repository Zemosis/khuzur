// HOW IT WORKS — the chapters of /how-it-works, grouped into parts. Each
// chapter is { id, title, summary, sections: [{ title, body }] }.
//
// Keep every claim true to the code it describes:
//   shuffles        utils/deckUtils.js, utils/<game>/ (secureRandom, shuffle)
//   hidden info     server/game/*Game.js, server/game/engine.js (viewFor, redactState)
//   Thirteen CPU    utils/aiPlayer.js, aiSearch.js, aiCombos.js
//   Muushig CPU     utils/muushig/ai.js
//   Poker CPU       utils/poker/ai.js
//   Khuzur CPU      utils/khuzur/ai.js, aiView.js, aiPolicy.js, aiSearch.js
//   Blackjack       utils/blackjack/rules.js
//   rewards         utils/progression.js, utils/stakes.js
//   the numbers     scripts/sim/cpu.mjs and scripts/sim/shuffle.mjs (SIM below)

import { C, Formula, Grid, List, Pow, T } from "./blocks";
import { SIM } from "./simResults";

// ---- Part 1: fair play ------------------------------------------------------------

const randomness = {
  id: "randomness",
  title: "Shuffling and randomness",
  summary: "Every deck in every game is a uniformly random permutation drawn from a cryptographically secure generator. No rule, player, stake or history can bias it.",
  sections: [
    {
      title: "Fisher–Yates (Durstenfeld) shuffle",
      body: (
        <>
          <p>
            All five games shuffle with the in-place <T>Fisher–Yates shuffle</T> in Durstenfeld's form: O(n) time, O(1) extra space.
          </p>
          <Formula>{`for i from n−1 down to 1:
    j ← uniform integer in [0, i]
    swap deck[i], deck[j]`}</Formula>
          <p>
            <T>Uniformity proof.</T> Step i has i + 1 equally likely choices, so a run has n · (n−1) · … · 2 = n! equally likely
            sequences of choices. The map from choice sequences to permutations is a bijection: the card that ends in position i is
            fixed by the choice at step i alone. So every one of the n! permutations has probability exactly 1/n!. The unit tests
            check this bijection directly, enumerating every choice sequence for a 3-card deck.
          </p>
          <Grid
            rows={[
              ["Deck", "n", "n! orders", "log₂ n! (bits)"],
              ["Muushig", "32", <Pow m="2.63" e={35} />, "117.7"],
              ["Khuzur, 5-card game", "34", <Pow m="2.95" e={38} />, "127.8"],
              ["Thirteen, Poker", "52", <Pow m="8.07" e={67} />, "225.6"],
              ["Khuzur, 7-card game", "66", <Pow m="5.44" e={92} />, "308.1"],
              ["Blackjack shoe (6 decks)", "312", <Pow m="2.10" e={644} />, "2,140"],
            ]}
          />
        </>
      ),
    },
    {
      title: "The entropy source",
      body: (
        <>
          <p>
            Random numbers come from the platform's <T>CSPRNG</T> through the Web Crypto API, <C>crypto.getRandomValues</C>: the
            operating system's generator, in the browser and in Node on the server. A CSPRNG is built so that no number of past
            outputs predicts the next. <C>Math.random</C> is never used to deal. In V8 it is xorshift128+, whose 128-bit state can
            be recovered from a handful of outputs, after which every future shuffle is known.
          </p>
          <p>
            Each shuffle draws n − 1 fresh 32-bit words, 1,632 bits for a 52-card deck against the 225.6 bits needed to index every
            order. A seeded 32-bit generator, by contrast, could only ever reach 2<sup>32</sup> of the 8 × 10<sup>67</sup> orders.
          </p>
        </>
      ),
    },
    {
      title: "Range reduction bias",
      body: (
        <>
          <p>
            A word u ∈ [0, 2<sup>32</sup>) becomes an index by ⌊u · k / 2<sup>32</sup>⌋. Since 2<sup>32</sup> is not a multiple of
            k, each index receives either ⌊2<sup>32</sup>/k⌋ or ⌈2<sup>32</sup>/k⌉ words, so two indices differ in probability by at
            most a factor of 1 + 1/⌊2<sup>32</sup>/k⌋.
          </p>
          <Grid
            rows={[
              ["Choice among k", "Largest relative bias"],
              ["32 (Muushig)", "1 in 134,217,728"],
              ["52 (Thirteen, Poker)", "1 in 82,595,524"],
              ["66 (Khuzur 7-card)", "1 in 65,075,262"],
              ["312 (Blackjack shoe)", "1 in 13,765,920"],
            ]}
          />
          <p>That is far below what any number of games could detect; the chi-square tests in Evidence find nothing.</p>
        </>
      ),
    },
    {
      title: "Randomness inside the rules",
      body: (
        <List
          items={[
            ["Khuzur's returned joker", "a joker turned up as trump is reinserted uniformly at random into the middle half of the draw pile, indices ⌊L/4⌋ to ⌈3L/4⌉ for a pile of L."],
            ["Draw for the deal", "in Khuzur and Muushig each player picks how deep (1–10 cards) to draw from a shuffled deck: a choice, not a hidden roll."],
            ["Blackjack shoe", "six decks shuffled together and reshuffled once the cut card is passed, 234 of 312 cards (75% penetration)."],
            ["Seeding", "every engine takes its random source as an argument (dependency injection). Production passes the CSPRNG; only tests and the simulation scripts pass a seeded mulberry32, so their runs are reproducible."],
          ]}
        />
      ),
    },
  ],
};

const hidden = {
  id: "hidden",
  title: "Server authority and hidden information",
  summary: "Online, the server owns the only full copy of a game. Each browser receives a per-seat projection with every hidden card removed, and each CPU decides from the same restricted view.",
  sections: [
    {
      title: "Authoritative server",
      body: (
        <>
          <p>
            A client sends an <T>intent</T> ("play these cards"). The server runs it through the game's pure rules engine, a
            function (state, action) → state′ that throws on an illegal move, and broadcasts the result. The browser never decides
            anything. The same engine files run in the browser for practice games, and a test requires the two copies to be
            byte-identical so they can't drift apart.
          </p>
        </>
      ),
    },
    {
      title: "Redacted views",
      body: (
        <>
          <p>
            Before sending, the server projects the state for each seat (<C>viewFor</C>, <C>redactState</C>): every other hand, the
            draw pile, the dead pile and the deck become <C>{"{ hidden: true }"}</C> placeholders of the same length, and private keys
            are stripped. A modified client therefore has nothing to read: the information never reaches it.
          </p>
        </>
      ),
    },
    {
      title: "CPUs see what a seat sees",
      body: (
        <>
          <p>
            Each CPU is an <T>agent</T> whose percepts are limited to its seat: one perception function per game (Thirteen's{" "}
            <C>readTable</C>, Muushig's <C>viewOf</C>, Poker's <C>viewFor</C>, Khuzur's <C>readTable</C>) reads its own hand, the
            public history and every other hand's length, and nothing else.
          </p>
          <p>
            This is enforced by <T>metamorphic tests</T>: take a real position, redeal every card the seat can't see (same counts, same
            public history), and require the CPU to make exactly the same decision at every level. A CPU that read a hidden card
            would change its mind on some redeal. Every game's CPU has such a test.
          </p>
        </>
      ),
    },
  ],
};

// ---- Part 2: AI foundations ----------------------------------------------------------

const agents = {
  id: "agents",
  title: "Agents and environments",
  summary: "Classifying the task environment decides which algorithms can work at all.",
  sections: [
    {
      title: "The task environment",
      body: (
        <>
          <Grid
            rows={[
              ["Property", "Card games here", "Consequence"],
              ["Observable?", "Partially (hidden hands, pile order)", "Reason over belief states, not states"],
              ["Agents", "2–7, in teams or free for all", "Not two-player zero-sum in general"],
              ["Deterministic?", "Stochastic (draws, unseen cards)", "Chance nodes; average over outcomes"],
              ["Episodic?", "Sequential", "A move matters for the rest of the match"],
              ["Static?", "Static (turn-based)", "Think while it's your turn"],
              ["Discrete?", "Discrete", "Enumerable moves"],
            ]}
          />
          <p>
            Each CPU is a <T>utility-based agent</T>: its percept is the redacted view, its actions are the legal moves the engine
            enumerates, and its utility is the match result (place, points or chips), not the trick or hand in front of it.
          </p>
        </>
      ),
    },
    {
      title: "Why not minimax",
      body: (
        <>
          <p>
            Minimax and α-β pruning assume a <T>two-player, constant-sum game of perfect information</T>. These games break all three
            assumptions: hands are hidden, tables seat up to seven, and a 2v2v2 Khuzur table or a five-player Muushig match isn't
            zero-sum between two sides. A minimax tree would also need a node for every possible deal of the unseen cards.
          </p>
          <p>
            The CPUs therefore use <T>determinized Monte Carlo search</T> (Perfect Information Monte Carlo): sample complete deals
            consistent with what's known, play each candidate out in each, and average. Averaging over sampled deals is exactly the
            value of a <T>chance node</T>: Σ P(deal) · value(deal), estimated by sampling instead of enumeration.
          </p>
        </>
      ),
    },
  ],
};

const searchChapter = {
  id: "search",
  title: "Search and constraint satisfaction",
  summary: "Rules as a state space, and imagined deals as a constraint satisfaction problem.",
  sections: [
    {
      title: "Engines as state spaces",
      body: (
        <>
          <p>
            Each engine defines the four components of a <T>search space</T>: states (immutable game states), operators (lead,
            beat, pick up, play, pass, bet…), the initial state (the deal) and the goal test (match over). Because transitions are
            pure functions, a CPU can apply a move to a copy and play forward without touching the real game, which is what makes
            the simulations below possible.
          </p>
          <List
            items={[
              ["Depth-first enumeration", "Khuzur HARD lists every distinct way to cover a layer by a DFS over the layer's columns, cheapest cards first, skipping twin cards (duplicate detection) and stopping at 40."],
              ["Bipartite matching", "\"Can these cards cover that layer?\" is a matching problem between cover cards and layer cards; the engine solves it with Kuhn's augmenting-path algorithm (at most 7 columns)."],
            ]}
          />
        </>
      ),
    },
    {
      title: "Determinization as a CSP",
      body: (
        <>
          <p>
            Sampling a deal of the unseen cards is a <T>constraint satisfaction problem</T>. Variables are the hidden slots: each
            opponent's unknown cards, each draw-pile position, and the cards of surrendered hands. Domains are the unseen cards. The
            constraints are what the table has shown:
          </p>
          <List
            items={[
              ["Global (count) constraints", "every slot filled exactly once; every hand and pile keeps its public size."],
              ["Unary constraints (node consistency)", "Muushig: a player who didn't follow suit has none of that suit, and one who played under the top card has nothing above it. Thirteen: a player who passed holding exactly enough cards to answer can't beat the play. Values that break them are pruned from that slot's domain before assignment."],
              ["Fixed assignments", "Khuzur: cards a player picked up, or the face-up trump they drew, are pinned to their hand."],
              ["Positional constraints", "Khuzur: a returned joker sits where the deal rule could have put it, and the pile is drawn in order, so it belongs to whoever drew that position, or is still in the pile."],
            ]}
          />
          <p>
            Variable ordering follows the <T>minimum-remaining-values</T> heuristic: Muushig deals the seat with the fewest
            consistent cards first ("the tightest fit picks first"), and Khuzur places a returned joker, whose domain is a few
            positions, before anything else. Values are then drawn at random. If a sample fails, it restarts. Muushig drops its
            soft readings after 20 failed attempts rather than loop: a pragmatic relaxation that trades a little accuracy for
            guaranteed termination.
          </p>
        </>
      ),
    },
    {
      title: "Dynamic programming over subsets",
      body: (
        <>
          <p>
            Thirteen's hand planner splits a hand into the fewest, strongest plays. It is a <T>memoized recursion</T> over bitmasks of
            the hand (2<sup>13</sup> = 8,192 subsets): the best split of a subset is the best combination containing its lowest card
            plus the best split of what's left. Every subproblem is solved once, so "what is my hand worth if I play this?" is an
            O(1) lookup during search.
          </p>
          <Formula>{`best(∅) = 0
best(S) = min over plays c ⊆ S containing lowest(S):  weight(c) + best(S \\ c)`}</Formula>
        </>
      ),
    },
    {
      title: "Cycles",
      body: (
        <p>
          Khuzur's state graph has cycles: voluntary pick-ups can pass the same cards round forever. As with repetition rules in
          chess or checkers, a CPU detects them, here as two pick-ups with no draw and no dead stack in between, and switches to
          progress-making moves (beat with its lowest cover, lead its weakest single) until the stack goes round.
        </p>
      ),
    },
  ],
};

const probability = {
  id: "probability",
  title: "Probability and Bayesian inference",
  summary: "Counting cards, hypergeometric odds, and Bayes' rule over what opponents did.",
  sections: [
    {
      title: "Card counting",
      body: (
        <p>
          Medium and Hard CPUs track every card that has left play, so probabilities are taken over the true unseen set, not the
          whole deck. In Khuzur a card's worth is the share of still-unseen cards that can't beat it: once the higher spades and
          the trumps are gone, K♠ is worth as much as a joker.
        </p>
      ),
    },
    {
      title: "Hypergeometric odds",
      body: (
        <>
          <p>
            The chance an opponent holding u of the N unseen cards holds none of the b cards that beat yours is a hypergeometric
            probability:
          </p>
          <Formula>{`P(none) = C(N−b, u) / C(N, u) = Π_{i=0}^{u−1} (N−b−i) / (N−i)`}</Formula>
          <p>
            For a multi-card layer the CPU multiplies the per-card chances, assuming independence. That is the{" "}
            <T>naive conditional-independence</T> assumption of naive Bayes. It is not exactly true (the same card can't cover two
            columns), but it's a close, O(k) approximation used thousands of times per decision.
          </p>
        </>
      ),
    },
    {
      title: "Bayes' rule over worlds (Khuzur)",
      body: (
        <>
          <p>
            Picking up is evidence, not proof: a player may pick up by choice. Khuzur HARD weighs every sampled world by the
            likelihood of the table's pick-ups in it (<T>likelihood weighting</T>):
          </p>
          <Formula>{`P(world | history) ∝ P(history | world) · P(world)

P(pick up | could have beaten) = 0.30 while cards remain to draw
                               = 0.08 once the pile is dry
P(pick up | couldn't beat)     = 1`}</Formula>
          <p>
            "Could have beaten" is evaluated on the cards the player held at the time: the cards publicly known to be theirs then,
            plus as many of their hidden cards as they can't have drawn since. The prior P(world) is uniform over deals that satisfy
            the hard constraints; outcomes are averaged with the weights normalized (the α of Bayes' rule).
          </p>
        </>
      ),
    },
    {
      title: "Naive Bayes hand reading (Poker)",
      body: (
        <>
          <p>Poker HARD gives every possible two-card holding h of each opponent a weight from that player's actions this hand:</p>
          <Formula>{`w(h) ∝ P(h) · Π_actions P(action | h, player's style)`}</Formula>
          <p>
            Actions are treated as conditionally independent given the holding: the naive Bayes model. A preflop raise favours
            holdings above that player's raising threshold on the Chen scale (a smooth sigmoid, never zero, since people bluff); a
            postflop bet favours made hands and draws; a check leans weak. Each player's style (how often they play a hand, raise,
            bet, fold) is a frequency estimate <T>smoothed by a prior</T> worth 12 typical hands, the pseudo-count fix for
            small samples. Only 85% of imagined hands are drawn from the read, the rest uniformly, so a maniac can't exploit an
            over-trusting read.
          </p>
        </>
      ),
    },
  ],
};

const optimization = {
  id: "optimization",
  title: "Monte Carlo search and optimization",
  summary: "How the Hard CPUs turn sampled worlds into a decision, and how the Khuzur CPU's evaluation was tuned.",
  sections: [
    {
      title: "Flat Monte Carlo with rollouts",
      body: (
        <>
          <p>
            For each candidate move m and sampled world w, apply m and play the game to the end with a fast heuristic policy for
            every seat (a <T>rollout</T>). The estimate of m is the mean utility. This is the simulation and backpropagation of{" "}
            <T>Monte Carlo Tree Search</T> with a one-level tree, and with the "smarter random" rollouts the MCTS literature
            recommends: each seat follows the Medium policy instead of moving at random.
          </p>
          <Formula>{`Q(m) ≈ Σ_w  weight(w) · U(rollout(apply(w, m)))  /  Σ_w weight(w)`}</Formula>
          <p>
            Every candidate is evaluated on the same worlds (<T>common random numbers</T>), so differences between moves aren't
            drowned by differences between deals. That is a variance-reduction technique, the same idea as duplicate bridge.
          </p>
        </>
      ),
    },
    {
      title: "Budget allocation: sequential halving",
      body: (
        <>
          <p>
            Choosing which candidate deserves more samples is a <T>multi-armed bandit</T>, the exploration/exploitation problem UCB1
            solves inside MCTS. Khuzur HARD uses <T>sequential halving</T>, a bandit algorithm for picking the single best arm on a
            fixed budget: split the budget into ⌈log₂ K⌉ rounds, sample every surviving move equally each round, and drop the worse
            half. Good moves get most of the 6,000 simulated moves per decision; obviously bad ones stop costing anything early.
          </p>
        </>
      ),
    },
    {
      title: "Hill climbing on self-play",
      body: (
        <>
          <p>
            Khuzur MEDIUM scores a move with a weighted sum of features (cards shed, worth kept, the next player's chance to cover,
            cards picked up, tempo…). The twelve weights were tuned by <T>stochastic hill climbing</T>:
          </p>
          <Formula>{`repeat 250 times:
    candidate ← best with 1–2 weights scaled by 1.35 or 1/1.35
    play 6,000 CPU matches, candidate vs best, on paired deals
         (six table shapes, sides swapped on each deal)
    if candidate wins > 51.2%:  best ← candidate`}</Formula>
          <p>
            The 51.2% acceptance bar is about two standard errors above 50% at that sample size, so noise rarely passes as
            improvement. Muushig MEDIUM's go-in margin was likewise chosen by comparing candidates over 2,000 matches.
          </p>
        </>
      ),
    },
    {
      title: "Softmax selection (Easy)",
      body: (
        <>
          <p>
            A believable beginner should make plausible mistakes, not random ones. Khuzur EASY scores moves like MEDIUM (without card
            counting or thinking about the next player) and samples one from a <T>Boltzmann (softmax) distribution</T>:
          </p>
          <Formula>{`P(m) = exp(score(m) / τ) / Σ_m' exp(score(m') / τ),   τ = 1.0`}</Formula>
          <p>A move one point worse is e⁻¹ ≈ 37% as likely: close seconds happen often, blunders rarely.</p>
        </>
      ),
    },
  ],
};

// ---- Part 3: the CPUs --------------------------------------------------------------------

const thirteen = {
  id: "thirteen",
  title: "Thirteen",
  summary: "A climbing/shedding game: beat the last play with a higher combination of the same size, empty your hand first, and avoid points.",
  sections: [
    {
      title: "Representation",
      body: (
        <p>
          Cards are integers 0–51 (rank × 4 + suit), so a higher number is a stronger single; every combination has a{" "}
          <C>power</C>, and of two of the same size the higher power wins. Hands are bitmasks for the planner.
        </p>
      ),
    },
    {
      title: "Easy, Medium, Hard",
      body: (
        <List
          items={[
            ["EASY", "always plays when it can: leads its lowest card (half the time with its partners), answers with the cheapest winning play, but one time in four any winning play, 2s included. No memory."],
            ["MEDIUM", "plans its hand into the fewest, strongest plays (the DP planner) weighted by each play's estimated hold chance, sheds lowest first, keeps aces and 2s while it holds more than 7 cards, and blocks: against a one-card opponent it answers singles with its highest and leads sets."],
            ["HARD", "adds card counting and pass inference to the view, then a determinized Monte Carlo search: 40 sampled deals consistent with the pass limits, its 5 best-scored moves plus a few always-weighed ones (the cheapest and highest answer, passing, a safe single), each rolled out to the end of the round with a planner-based policy for every seat. It minimizes expected points, with the scoring's nonlinearity built in: 10+ cards left score double, and points that eliminate it cost 10 extra."],
          ]}
        />
      ),
    },
    {
      title: "Hold chance",
      body: (
        <p>
          For a play of size k, the chance an opponent holding c of the u unseen cards beats it is computed from the number of
          beating sets among the unseen cards (pairs, triples, fours of a higher rank, or the same rank with a higher suit) and the
          hypergeometric chance of holding all k cards of one; 5-card hands use precomputed odds by hand type. The hold chance is
          the product over opponents.
        </p>
      ),
    },
  ],
};

const muushigCh = {
  id: "muushig",
  title: "Muushig",
  summary: "A five-player trick-taking game with trumps, a decide-to-play phase, card swaps, and a race from 15 points to 0.",
  sections: [
    {
      title: "Representation",
      body: <p>Cards are integers 0–31 (suit × 8 + rank) and any set of cards is a 32-bit mask, so rollouts are cheap bitwise operations.</p>,
    },
    {
      title: "Easy, Medium, Hard",
      body: (
        <List
          items={[
            ["EASY", "reads its hand like MEDIUM but misjudges going in (its estimate gets uniform noise), swaps a random few weak cards, plays without counting, and one card in three without thinking."],
            ["MEDIUM", "prices each card by its chance to take a trick, from odds tables indexed by suit type (trump, plain, under a higher card it holds), the number of higher cards still out and the number of rivals. Goes in when the expected tricks, minus 5 × P(no tricks), beat a margin of 0.3. Swaps every card a blind draw would beat on average."],
            ["HARD", "determinized Monte Carlo with constraint-consistent deals (voids, rank caps, swap counts; MRV ordering): 360 samples to decide, 150 to swap, 150 for the trump, 240 per card played. The utility is an estimated probability of winning the match: a softmax over the projected scores, exp(−β·(score − leader's score)) normalized, with β = 4 / (12 + leader's score), so it sharpens as the leader nears 0. A point near the finish, or one taken from the leader, is worth more than a point early."],
          ]}
        />
      ),
    },
  ],
};

const pokerCh = {
  id: "poker",
  title: "Poker",
  summary: "No-limit Texas Hold'em, 2–7 seats.",
  sections: [
    {
      title: "Easy, Medium, Hard",
      body: (
        <List
          items={[
            ["EASY", "loose-passive: plays too many hands, calls with any pair or draw, raises only big hands, never bluffs."],
            ["MEDIUM", "tight by position: Chen-formula starting-hand thresholds per position (early, middle, late, blind) that respect the size of a raise; postflop, equity against random hands by 150 Monte Carlo run-outs, shaded down when bet into, compared with pot odds."],
            ["HARD", "Bayesian hand reading (see Probability), equity against the weighted ranges by 400 run-outs, bet sizing by strength, occasional slow-play, bluffs and semi-bluffs where fold equity is high (few opponents, a draw, opponents who fold often), late-position steals, and push-or-fold at 12 big blinds or fewer."],
          ]}
        />
      ),
    },
    {
      title: "Equity and pot odds",
      body: (
        <>
          <Formula>{`equity   = P(win) + ½·P(tie)            (estimated by sampled run-outs)
pot odds = to_call / (pot + to_call)`}</Formula>
          <p>Calling is profitable in expectation when equity exceeds the pot odds; the CPUs start from that comparison and adjust for position, bets faced and their reads.</p>
        </>
      ),
    },
  ],
};

const khuzurCh = {
  id: "khuzur",
  title: "Khuzur",
  summary: "Lead at the next player, who must beat every card or pick the whole stack up; hands refill while the pile lasts, then it's a race to empty your hand. 2–6 players, teams or free for all.",
  sections: [
    {
      title: "Knowledge (aiView.js)",
      body: (
        <List
          items={[
            ["Known cards", "a picked-up stack was face up, so its cards are known to be in the picker's hand until played; the same for the face-up trump drawn last or swapped for the trump 7."],
            ["Gone cards", "stacks that went all the way round are out of play. A surrendered hand goes to the dead pile unseen: those cards are gone but unidentified, so they stay in the unseen set with a slot of their own."],
            ["Evidence", "every pick-up, with the layer that wasn't beaten, what the picker was known to hold then, and how many unknown cards they've drawn since."],
            ["Returned jokers", "the deal's reinsertion range, plus the public draw log (which seat drew which pile positions), constrain where a returned joker can be."],
          ]}
        />
      ),
    },
    {
      title: "MEDIUM: a linear evaluation",
      body: (
        <>
          <p>
            worth(c) = 1 − beaters(c) / |unseen|. The chance the next defender covers a layer L is the product of per-card
            hypergeometric cover chances, with their known cards checked first. Each candidate move is scored:
          </p>
          <Formula>{`while the pile lasts (lead or beat with cards X):
  − keep·Σ worth(X) + keep·avg·refills + pickPre·(|X| − refills)
  + sizePre·|X| − trumpPre·#trumps(X)
  ± pressPre·(1 − P(next covers X))·|stack after|
  + tempo  if the stack dies and you lead next

once the pile is dry:
  shedDry·|X| − keepDry·Σ worth(X)
  ± pressDry·(1 − P(next covers X))·|stack after|
  − outRisk·P(next covers X)  if that covering empties their hand
  + ∞  if X empties your hand

picking up S cards:
  − pick·|S| + gain·Σ worth(S)`}</Formula>
          <p>The weights come from the hill climb described under Monte Carlo search and optimization.</p>
        </>
      ),
    },
    {
      title: "HARD: determinized search",
      body: (
        <List
          items={[
            ["Candidates", "MEDIUM's moves within 1.5 points of its best (at most 6), picking up, and the cheapest cover and cheapest lead of each size with and without trumps."],
            ["Worlds", "the unseen cards dealt as a CSP: known cards pinned, a returned joker placed first (MRV) by replaying the deal's reinsertion and the draw log, everything else uniformly. Each world is weighted by Bayes' rule over the pick-ups."],
            ["Rollouts", "every seat plays MEDIUM's policy, with card counting from public information only, to the end of the match (capped at 250 moves, scored by hand sizes if cut)."],
            ["Utility", "the team's final place, scaled so 1st = 1 and last = 0."],
            ["Budget", "6,000 simulated moves per decision split by sequential halving, typically 25–45 ms; a new round never starts past 1.5× the budget."],
          ]}
        />
      ),
    },
    {
      title: "Lookahead beats rules: an example",
      body: (
        <p>
          Dry pile, opponent holding one card, you holding 8♠ 7♦ and the gray joker. MEDIUM leads the gray joker, which only the
          colored joker beats, so the opponent can't go out on it. HARD plays it out. The opponent picks the joker up, beats your
          next lead with it, and leads their last card. Leading the 7♦ loses at once only if their single card beats it. HARD
          leads the 7♦. This exact position is a unit test.
        </p>
      ),
    },
  ],
};

const blackjackCh = {
  id: "blackjack",
  title: "Blackjack",
  summary: "No CPU opponents: you play the house, and the dealer's play is a fixed rule.",
  sections: [
    {
      title: "House rules",
      body: (
        <List
          items={[
            ["Shoe", "six 52-card decks (312 cards), reshuffled after the cut card at 234 cards."],
            ["Dealer", "stands on every 17, soft 17 included (S17)."],
            ["Payouts", "blackjack 3:2 (not after a split), other wins 1:1."],
          ]}
        />
      ),
    },
  ],
};

// ---- Part 4: evidence ----------------------------------------------------------------------

const pct = (p, ci) => `${(100 * p).toFixed(1)}% ± ${(100 * ci).toFixed(1)}`;

const simulations = {
  id: "simulations",
  title: "CPU benchmarks",
  summary: `Whole matches between CPU levels, every game, on fixed seeds (scripts/sim/cpu.mjs, run ${SIM.date}). The ± is a 95% confidence interval.`,
  sections: [
    {
      title: "Method",
      body: (
        <List
          items={[
            ["Duplicate format", "each deal is replayed with the levels rotated through the seats (Thirteen, Muushig: one CPU of level A among level B; Khuzur and Poker: sides swapped), so the luck of the deal cancels between the levels compared. This is common random numbers again."],
            ["Fair share", "with no skill difference, one CPU among four (Thirteen) wins 25%, one among five (Muushig) 20%, one side of two (Khuzur) 50%, and Poker's net is 0 bb/100."],
            ["Invariants", "after every move: no card or chip appears or vanishes, every CPU move is legal, every match ends. The run fails on any violation."],
          ]}
        />
      ),
    },
    {
      title: "Win rates",
      body: (
        <>
          <Grid rows={[["Game", "Matchup", "Level A's result", "Fair share"], ...SIM.cpu.map((r) => [r.game, r.matchup, pct(r.p, r.ci), r.fair])]} />
          <p className="text-[18px] text-bone/80">{SIM.invariants}</p>
        </>
      ),
    },
    {
      title: "What the numbers say",
      body: (
        <List
          items={[
            ["Every level is ordered", "in every game each level beats the one below it, by wide margins everywhere but Muushig's HARD over MEDIUM (below): one Thirteen MEDIUM among three EASY wins 3× its fair share, Khuzur HARD wins 71–92% of matches against weaker sides, and poker HARD takes 15 big blinds per 100 hands from MEDIUM."],
            ["Ceilings", "against EASY, Thirteen's HARD (76.5%) and MEDIUM (75.8%) are indistinguishable: once opponents blunder, the extra search finds little more."],
            ["A known weakness", "Muushig's HARD is only modestly ahead of MEDIUM (24.6% against a fair 20%) and does worse than MEDIUM against EASY tables (55.3% vs 61.9%). A likely reason, not yet tested: its rollouts play every seat as MEDIUM, which misjudges a table of beginners, a classic opponent-modelling error of determinized search. It's the next CPU to improve."],
          ]}
        />
      ),
    },
    {
      title: "Poker",
      body: <Grid rows={[["Matchup (3 vs 3, six seats)", "Level A's result", "Sessions × hands"], ...SIM.poker.map((r) => [r.matchup, `${r.bb100 > 0 ? "+" : ""}${r.bb100.toFixed(1)} ± ${r.ci.toFixed(1)} bb/100`, r.size])]} />,
    },
    {
      title: "Khuzur: before and after the rewrite",
      body: (
        <>
          <p>The CPU rewrite of November 2026 was measured against the previous CPU on the same paired deals (1,000 matches per table for MEDIUM and EASY, 300 for HARD):</p>
          <Grid rows={[["Matchup", "Heads-up 5", "2v2 5", "3v3 5", "Heads-up 7", "2v2 7", "3v3 7"], ...SIM.khuzurDev]} />
          <p>
            HARD gains clearly heads-up, but in team play it only matches the old HARD. Wider candidate lists, three times the
            budget and turning the Bayesian evidence off all moved results by less than the noise: with luck of the deal shared
            across four to six hands, team results seem close to the ceiling a stronger single seat can reach.
          </p>
        </>
      ),
    },
  ],
};

const shuffleTests = {
  id: "shuffle-tests",
  title: "Shuffle tests",
  summary: `Chi-square goodness-of-fit tests on every game's own shuffle function, driven by the production CSPRNG (scripts/sim/shuffle.mjs, run ${SIM.date}).`,
  sections: [
    {
      title: "Method",
      body: (
        <List
          items={[
            ["Orders", "shuffle a 4-card deck 2.4 million times; each of the 24 orders should appear 100,000 times. χ² with 23 degrees of freedom."],
            ["Positions", "shuffle the game's full deck 60,000 times (20,000 for the 312-card shoe); every card should land in every position equally often. χ² with (n−1)² degrees of freedom."],
            ["p-values", "the probability that a perfectly uniform shuffle looks at least this uneven (Wilson–Hilferty approximation). Under uniformity, p is itself uniform on [0, 1]: a few small ones among many are expected, a consistent drift to 0 means bias."],
            ["Control", "the classic broken shuffle (swap each card with any position, not one at or before it) has 4⁴ = 256 equally likely runs onto 24 orders, which can't be uniform. The test must reject it."],
          ]}
        />
      ),
    },
    {
      title: "Results",
      body: (
        <>
          <Grid rows={[["Shuffle", "Orders χ² (df 23)", "p", "Positions χ² (df)", "p"], ...SIM.shuffle]} />
          {SIM.control && <p>{SIM.control}</p>}
        </>
      ),
    },
  ],
};

const engineering = {
  id: "engineering",
  title: "Engineering and tests",
  summary: "How the code is kept correct.",
  sections: [
    {
      title: "Architecture",
      body: (
        <List
          items={[
            ["Pure engines", "rules are pure functions over immutable state; timers, sockets and React stay outside. That makes them testable, replayable and safe to simulate from."],
            ["Two copies, one truth", "each engine runs in the browser (practice) and on the server (online). The Muushig, Poker, Blackjack and Khuzur rules and every CPU are byte-identical files, which a test diffs; Thirteen's rule tests run against both copies."],
            ["Stack", "React 19, Vite, Tailwind CSS 4 and GSAP on the client; Node.js, Express 5, Socket.IO and PostgreSQL 17 on the server."],
          ]}
        />
      ),
    },
    {
      title: "Tests",
      body: (
        <List
          items={[
            ["Suite", "over 2,000 Vitest tests in unit, server and UI projects."],
            ["Kinds", "example-based rule tests; whole-match simulations that check invariants (poker: 300 hands per table without a chip made or lost); metamorphic tests that no CPU peeks; a bijection test for the shuffle; real-socket server tests; database tests against a throwaway Postgres."],
            ["Credits", "every credit that moves between a balance and a table is written to a ledger, and the server checks at start-up that the books balance."],
          ]}
        />
      ),
    },
  ],
};

// ---- Part 5: rewards ---------------------------------------------------------------------

const rewards = {
  id: "rewards",
  title: "XP, gold and credits",
  summary: "The progression and economy formulas.",
  sections: [
    {
      title: "Levels",
      body: (
        <>
          <Formula>{`xpToNext(L)  = min(100 + 50·(L − 1), 1500)
levelStart(L) = Σ_{l<L} xpToNext(l)          (quadratic until L = 29, then linear)
levelUpGold(L) = 25·L · (2 if L ≡ 0 mod 5 else 1)`}</Formula>
        </>
      ),
    },
    {
      title: "Match rewards",
      body: (
        <>
          <p>Thirteen, Muushig and Khuzur pay by place p among n seats, CPUs included, by linear interpolation:</p>
          <Formula>{`share = (n − p) / (n − 1)
XP    = round(30 + 40·share)        1st: 70, last: 30
gold  = round(20 + 60·share)        1st: 80, last: 20`}</Formula>
          <p>A poker hand pays 4 XP and 3 gold, or 6 XP and 8 gold if won, at most one paid hand per 30 seconds at a table.</p>
        </>
      ),
    },
    {
      title: "Credit pots",
      body: (
        <p>
          At a Thirteen, Muushig or Khuzur credit table every player stakes the same amount (100, 500 or 2,000) and the 1st-place
          player or team takes the pot, split evenly among its people. CPUs stake nothing, and a pot a CPU wins is lost, so bots
          can't be farmed. The leaderboard ranks by credits; there is no hidden skill rating.
        </p>
      ),
    },
  ],
};

// ---- The parts -------------------------------------------------------------------------------

export const PARTS = [
  { title: "Fair play", chapters: [randomness, hidden] },
  { title: "AI foundations", chapters: [agents, searchChapter, probability, optimization] },
  { title: "The CPUs", chapters: [thirteen, muushigCh, pokerCh, khuzurCh, blackjackCh] },
  { title: "Evidence", chapters: [simulations, shuffleTests, engineering] },
  { title: "Economy", chapters: [rewards] },
];

