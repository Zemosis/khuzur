// CPU BENCHMARK — every game's CPU levels against each other, over whole
// matches, on all cores. `npm run sim:cpu` (or `node scripts/sim/cpu.mjs
// [game ...] [--scale 0.25]`). The numbers on the How it works page and in
// the README come from this script.
//
// Method (duplicate format, a variance-reduction trick from bridge):
//   Thirteen, Muushig  one CPU of level A at a table of level B. Each deal is
//                      replayed once per seat with A moved round the table,
//                      so A's fair share of wins is 1 in (seats).
//   Khuzur             two sides, A and B, alternating seats (heads-up, 2v2).
//                      Each deal is played twice with the sides swapped. Fair
//                      share: 1 in 2.
//   Poker              six seats, A and B alternating; each session of hands
//                      is replayed with the levels swapped. Reported in big
//                      blinds won per 100 hands (bb/100) by level A.
// Every move is checked: no card or chip appears or vanishes, every CPU move
// is legal, every match ends. Seeds are fixed, so a run is reproducible.

import { Worker } from "node:worker_threads";
import os from "node:os";

const args = process.argv.slice(2);
const scaleAt = args.indexOf("--scale");
const SCALE = scaleAt >= 0 ? Number(args[scaleAt + 1]) : 1;
const games = args.filter((a, i) => !a.startsWith("--") && i !== scaleAt + 1);
const wanted = (g) => !games.length || games.includes(g);

const size = Math.max(1, os.cpus().length - 1);
const workers = Array.from({ length: size }, () => new Worker(new URL("./cpu-worker.mjs", import.meta.url)));
const idle = [...workers];
const queue = [];
function run(job) {
  return new Promise((resolve) => {
    queue.push({ job, resolve });
    pump();
  });
}
function pump() {
  while (idle.length && queue.length) {
    const w = idle.pop();
    const { job, resolve } = queue.shift();
    w.once("message", (r) => {
      idle.push(w);
      resolve(r);
      pump();
    });
    w.postMessage(job);
  }
}

const broken = [];
const note = (r, job) => {
  if (!r.ok) broken.push(`${job.game} seed ${job.seed}: ${r.error}`);
  return r.ok;
};

/** Share of wins (0–1) and its 95% interval half-width. */
const share = (wins, n) => ({ p: wins / n, ci: 1.96 * Math.sqrt(((wins / n) * (1 - wins / n)) / n), n });

/** One A among B's, rotated through every seat on each deal. */
async function oneAmong(game, seats, A, B, deals, seed0) {
  const jobs = [];
  for (let d = 0; d < deals; d++) {
    for (let at = 0; at < seats; at++) {
      const levels = Array.from({ length: seats }, (_, i) => (i === at ? A : B));
      const job = { game, levels, seed: seed0 + d };
      jobs.push(run(job).then((r) => (note(r, job) ? (r.winners.includes(at) ? 1 / r.winners.length : 0) : null)));
    }
  }
  const out = (await Promise.all(jobs)).filter((x) => x !== null);
  return { ...share(out.reduce((a, b) => a + b, 0), out.length), fair: 1 / seats };
}

/** Side A against side B, seats alternating, each deal played with the sides swapped. */
async function sides(table, A, B, deals, seed0) {
  const n = table.perTeam * table.teams;
  const jobs = [];
  for (let d = 0; d < deals; d++) {
    for (const aTeam of [0, 1]) {
      const levels = Array.from({ length: n }, (_, i) => (i % table.teams === aTeam ? A : B));
      const job = { game: "khuzur", levels, seed: seed0 + d, table };
      jobs.push(run(job).then((r) => (note(r, job) ? (r.winners.some((s) => s % table.teams === aTeam) ? 1 : 0) : null)));
    }
  }
  const out = (await Promise.all(jobs)).filter((x) => x !== null);
  return { ...share(out.reduce((a, b) => a + b, 0), out.length), fair: 0.5 };
}

/** bb/100 for level A, six seats alternating, each session replayed with the levels swapped. */
async function pokerBb(A, B, sessions, hands, seed0) {
  const jobs = [];
  for (let d = 0; d < sessions; d++) {
    for (const flip of [0, 1]) {
      const levels = Array.from({ length: 6 }, (_, i) => ((i % 2 === flip) ? A : B));
      const job = { game: "poker", levels, seed: seed0 + d, hands };
      jobs.push(
        run(job).then((r) => {
          if (!note(r, job)) return null;
          const won = r.net.reduce((sum, v, i) => sum + (levels[i] === A ? v : 0), 0) / 3; // per A seat
          return (won / 10 / hands) * 100; // big blind = 10
        }),
      );
    }
  }
  // The two halves of a duplicate pair share their deals: average them first.
  const per = (await Promise.all(jobs)).filter((x) => x !== null);
  const mean = per.reduce((a, b) => a + b, 0) / per.length;
  const sd = Math.sqrt(per.reduce((a, b) => a + (b - mean) ** 2, 0) / (per.length - 1));
  return { bb100: mean, ci: (1.96 * sd) / Math.sqrt(per.length), sessions: per.length, hands };
}

const n = (x) => Math.max(2, Math.round(x * SCALE));
const pct = (r) => `${(100 * r.p).toFixed(1)}% ± ${(100 * r.ci).toFixed(1)} (fair ${(100 * r.fair).toFixed(0)}%, n=${r.n})`;
const LADDER = [
  ["HARD", "MEDIUM"],
  ["MEDIUM", "EASY"],
  ["HARD", "EASY"],
];
const results = {};
const t0 = Date.now();

if (wanted("thirteen")) {
  for (const [A, B] of LADDER) {
    const r = await oneAmong("thirteen", 4, A, B, n(150), 1000);
    results[`thirteen ${A} among ${B}`] = r;
    console.log(`Thirteen  1 ${A} among 3 ${B}: ${pct(r)}`);
  }
}
if (wanted("muushig")) {
  for (const [A, B] of LADDER) {
    const r = await oneAmong("muushig", 5, A, B, n(100), 2000);
    results[`muushig ${A} among ${B}`] = r;
    console.log(`Muushig   1 ${A} among 4 ${B}: ${pct(r)}`);
  }
}
if (wanted("khuzur")) {
  for (const table of [
    { perTeam: 1, teams: 2, handSize: 5 },
    { perTeam: 2, teams: 2, handSize: 5 },
    { perTeam: 2, teams: 2, handSize: 7 },
  ]) {
    for (const [A, B] of LADDER) {
      const r = await sides(table, A, B, n(table.handSize === 7 ? 150 : 250), 3000);
      const name = table.perTeam === 1 ? "heads-up" : "2v2";
      results[`khuzur ${name} h${table.handSize} ${A} vs ${B}`] = r;
      console.log(`Khuzur    ${name}, ${table.handSize} cards, ${A} vs ${B}: ${pct(r)}`);
    }
  }
}
if (wanted("poker")) {
  for (const [A, B] of LADDER) {
    const r = await pokerBb(A, B, n(40), 400, 4000);
    results[`poker ${A} vs ${B}`] = r;
    console.log(`Poker     3 ${A} vs 3 ${B}: ${r.bb100.toFixed(1)} bb/100 ± ${r.ci.toFixed(1)} (${r.sessions} sessions × ${r.hands} hands)`);
  }
}

console.log(`\n${broken.length ? `BROKEN (${broken.length}):\n  ${broken.join("\n  ")}` : "Every move legal, nothing made or lost, every match ended."}`);
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s on ${size} threads`);
console.log(JSON.stringify(results));
workers.forEach((w) => w.terminate());
process.exitCode = broken.length ? 1 : 0;
