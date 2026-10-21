// ADMIN — credits review, for the accounts in the server's ADMIN_USER_IDS.
// The economy check, flagged pairs, a pair's hands with both players' cards,
// RETURN / REMOVE / FREEZE / DISMISS (each with a note), and account lookup.
// Anyone else gets the not-found page: the server answers them 404.

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar, Panel, Btn } from "../components/PixelUI";
import { TONES, INK, inputStyle } from "../components/pixelTokens";
import { api } from "../lib/api";
import { connectSocket } from "../utils/socket";
import { useAuth } from "../hooks/useAuth";
import { fmt } from "../utils/poker/tiers";
import { eventLine } from "../utils/poker/log";

const ADMIN = { base: "/api/admin" };
const call = (path, body) => api(path, body ? { method: "POST", ...ADMIN, body } : ADMIN);
const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
const TEXT = "font-pixel-body text-[20px] leading-tight";

function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center gap-5 h-screen starfield font-pixel-body text-parchment text-center px-4">
      <div className="font-pixel-display text-[14px]" style={{ color: "#e85a7a" }}>
        PAGE NOT FOUND
      </div>
      <Btn tone={TONES.dusk} onClick={() => navigate("/")} className="px-4">
        Main menu
      </Btn>
    </div>
  );
}

function Economy({ check }) {
  return (
    <Panel title="Economy" icon="check" deep={check.ok ? "#6a9a30" : "#a83a5a"}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
        {[
          ["Balances", check.balances],
          ["At tables", check.atTables],
          ["Granted", check.granted],
          ["Claimed", check.claimed],
          ["Removed", check.removed],
          ["Won by bots", check.wonByBots ?? 0],
        ].map(([label, n]) => (
          <div key={label} className={TEXT}>
            <div className="text-bone/70">{label}</div>
            <div className="font-pixel-display text-[12px] tabular-nums">{fmt(n)}</div>
          </div>
        ))}
        <div className="font-pixel-display text-[14px] self-center" style={{ color: check.ok ? "#9bd14f" : "#e85a7a" }}>
          {check.ok ? "OK" : "MISMATCH"}
        </div>
      </div>
    </Panel>
  );
}

function Flags({ flags, onReview }) {
  return (
    <Panel title="Flagged pairs" icon="skull" deep="#a83a5a">
      {flags.length === 0 ? (
        <p className={`${TEXT} p-4 text-bone`}>Nothing flagged in the last 30 days.</p>
      ) : (
        <ul>
          {flags.map((f) => (
            <li key={`${f.loser}>${f.winner}`} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "2px solid #1f1a3d" }}>
              <div className="flex-1 min-w-0">
                <div className="font-pixel-display text-[11px] truncate">
                  {f.loserName} → {f.winnerName}
                </div>
                <div className={`${TEXT} text-bone/80`}>
                  {fmt(f.flow)} lost to them ({Math.round(f.share * 100)}% of their losses, {fmt(f.back)} back) · last {when(f.lastAt)}
                </div>
                <div className={`${TEXT} text-bone/60`}>
                  {f.hands} hands · {f.privateHands} private · {f.bigFolds} big folds · {f.loserClaims} claims · account since {f.loserSince ? when(f.loserSince) : "?"}
                </div>
              </div>
              <Btn tone={TONES.rose} onClick={() => onReview(f)} className="px-3" style={{ height: 40 }} title="Review">
                <span className="sr-only">Review {f.loserName} → {f.winnerName}</span>
                <span aria-hidden>Review</span>
              </Btn>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Pair({ flag, onDone }) {
  const [pair, setPair] = useState(null);
  const [note, setNote] = useState("");
  // Pre-filled with the net flow (what B kept of A's credits); the admin can change it.
  const [amount, setAmount] = useState(Math.max(1, flag.flow - flag.back));
  const [frozen, setFrozen] = useState({ [flag.loser]: !!flag.loserFrozen, [flag.winner]: !!flag.winnerFrozen });
  const [reversed, setReversed] = useState(false); // RETURN / REMOVE done: not again from this flag
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call(`/pairs/${flag.loser}/${flag.winner}`).then(setPair).catch((err) => setResult(err.message));
  }, [flag]);

  const act = async (path, body, done) => {
    setBusy(true);
    try {
      const r = await call(path, { ...body, note: note.trim() });
      setResult(await done(r));
      onDone();
    } catch (err) {
      setResult(err.message);
    } finally {
      setBusy(false);
    }
  };
  /** A reversal also dismisses the flag, so the list doesn't offer the same credits back again. */
  const reverse = (body, verb) =>
    act("/reverse", { ...body, amount }, async (r) => {
      setReversed(true);
      await call("/dismiss", { loserId: flag.loser, winnerId: flag.winner, note: `Reversed: ${note.trim()}` });
      return `${verb} ${fmt(r.recovered)} of ${fmt(r.requested)}.`;
    });
  const toggleFreeze = (userId, name) =>
    act("/freeze", { userId, frozen: !frozen[userId] }, (r) => {
      setFrozen((f) => ({ ...f, [userId]: r.frozen }));
      return `${name} is ${r.frozen ? "frozen" : "unfrozen"}.`;
    });
  const off = busy || !note.trim();
  const amountOk = Number.isInteger(amount) && amount >= 1;

  return (
    <Panel title={`${flag.loserName} → ${flag.winnerName}`} icon="cards" deep="#463a78">
      <div className="flex flex-col gap-3 p-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) 140px" }}>
          <label className="flex flex-col gap-1">
            <span className="font-pixel-display text-[10px]">Note</span>
            <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="font-pixel-body text-[22px] px-3 text-parchment" style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-pixel-display text-[10px]">Amount</span>
            <input
              aria-label="Amount"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Math.round(Number(e.target.value)))}
              className="font-pixel-body text-[22px] px-3 text-parchment"
              style={inputStyle}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {!reversed && (
            <>
              <Btn tone={TONES.poison} disabled={off || !amountOk} className="px-3" onClick={() => reverse({ from: flag.winner, to: flag.loser }, "Recovered")}>
                Return {fmt(amount)} to {flag.loserName}
              </Btn>
              <Btn tone={TONES.rose} disabled={off || !amountOk} className="px-3" onClick={() => reverse({ from: flag.winner }, "Removed")}>
                Remove {fmt(amount)}
              </Btn>
            </>
          )}
          {[
            [flag.winner, flag.winnerName],
            [flag.loser, flag.loserName],
          ].map(([id, name]) => (
            <Btn key={id} tone={TONES.dusk} disabled={off} className="px-3" onClick={() => toggleFreeze(id, name)}>
              {frozen[id] ? "Unfreeze" : "Freeze"} {name}
            </Btn>
          ))}
          <Btn tone={TONES.cyan} disabled={off} className="px-3" onClick={() => act("/dismiss", { loserId: flag.loser, winnerId: flag.winner }, () => "Dismissed.")}>
            Dismiss
          </Btn>
        </div>
        {result && (
          <p role="status" className={TEXT} style={{ color: "#f4c430" }}>
            {result}
          </p>
        )}
        {pair?.hands.map((h) => {
          if (GAME_NAMES[h.gameType]) return <StakeMatch key={h.id} match={h} />;
          const seats = [];
          for (const s of h.seats) seats[s.seat] = { name: s.name };
          return (
            <article key={h.id} className="p-3" style={{ backgroundColor: INK, border: "3px solid #1f1a3d" }}>
              <div className="font-pixel-display text-[10px] text-bone/80">
                {when(h.playedAt)} · {h.tier}
                {h.isPrivate ? " · private" : ""} · board {h.board.join(" ") || "—"}
              </div>
              {h.seats.map((s) => (
                <div key={s.seat} className={`${TEXT} flex gap-3`}>
                  <span className="min-w-[120px]">{s.name}</span>
                  <span>{(s.hole ?? []).join(" ")}</span>
                  <span className="ml-auto tabular-nums" style={{ color: s.net >= 0 ? "#9bd14f" : "#e85a7a" }}>
                    {s.net > 0 ? "+" : ""}
                    {fmt(s.net)}
                  </span>
                </div>
              ))}
              <ol className={`${TEXT} text-bone/70 mt-1`}>
                {h.events.map((e, i) => {
                  const line = eventLine(e, seats);
                  return line ? <li key={i}>{line}</li> : null;
                })}
              </ol>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

const GAME_NAMES = { muushig: "Muushig", thirteen: "Thirteen" };

/** A credit match (Muushig, Thirteen) in a pair's history: the stake, who staked, and each one's score and net. */
function StakeMatch({ match }) {
  const staked = match.seats.filter((s) => s.user_id);
  const stake = staked[0]?.stack_before ?? 0;
  return (
    <article className="p-3" style={{ backgroundColor: INK, border: "3px solid #1f1a3d" }}>
      <div className="font-pixel-display text-[10px] text-bone/80">
        {when(match.playedAt)} · {GAME_NAMES[match.gameType] ?? match.gameType} · {match.tier} {fmt(stake)}
        {match.isPrivate ? " · private" : ""} · pot {fmt(stake * staked.length)}
        {match.cpuTake > 0 ? ` · ${fmt(match.cpuTake)} to bots` : ""}
      </div>
      {staked.map((s) => (
        <div key={s.seat} className={`${TEXT} flex gap-3`}>
          <span className="min-w-[120px]">{s.name}</span>
          <span>
            score {s.score}
            {s.forfeited ? " · forfeited" : ""}
          </span>
          <span className="ml-auto tabular-nums" style={{ color: s.net >= 0 ? "#9bd14f" : "#e85a7a" }}>
            {s.net > 0 ? "+" : ""}
            {fmt(s.net)}
          </span>
        </div>
      ))}
    </article>
  );
}

function Lookup() {
  const [q, setQ] = useState("");
  const [account, setAccount] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const find = async () => {
    try {
      setAccount(await call(`/accounts?q=${encodeURIComponent(q)}`));
      setError("");
    } catch (err) {
      setError(err.message);
      setAccount(null);
    }
  };
  const search = (e) => {
    e.preventDefault();
    find();
  };
  const toggleFreeze = async () => {
    try {
      await call("/freeze", { userId: account.userId, frozen: !account.frozen, note: note.trim() });
      setNote("");
      await find();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Panel title="Account lookup" icon="user" deep="#2a8a8c">
      <form onSubmit={search} className="flex gap-2 p-4">
        <input aria-label="NAME#TAG" value={q} onChange={(e) => setQ(e.target.value)} placeholder="NAME#TAG" className="flex-1 font-pixel-body text-[22px] px-3 text-parchment" style={inputStyle} />
        <Btn tone={TONES.cyan} type="submit" className="px-4">
          Find
        </Btn>
      </form>
      {error && <p className={`${TEXT} px-4 pb-4`} style={{ color: "#e85a7a" }}>{error}</p>}
      {account && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          <div className={TEXT}>
            {account.name} · {fmt(account.balance)} credits{account.seat ? ` + ${fmt(account.seat.onTable)} at ${account.seat.tableName}` : ""}
            {account.frozen ? ` · FROZEN (${account.frozenNote})` : ""}
          </div>
          <div className="flex gap-2">
            <input aria-label="Account note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Note" className="flex-1 font-pixel-body text-[22px] px-3 text-parchment" style={inputStyle} />
            <Btn tone={TONES.dusk} disabled={!note.trim()} className="px-4" onClick={toggleFreeze}>
              {account.frozen ? "Unfreeze" : "Freeze"}
            </Btn>
          </div>
          <ol className={`${TEXT} text-bone/80`}>
            {account.ledger.map((r) => (
              <li key={r.id}>
                {when(r.created_at)} · {r.kind} {r.amount > 0 ? "+" : ""}
                {fmt(r.amount)} → {fmt(r.balance_after)}
                {r.note ? ` · ${r.note}` : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const { identity } = useAuth();
  const [state, setState] = useState({ status: "loading" });
  // Keeps the top bar's server status live, as on every other screen.
  useEffect(() => {
    connectSocket(identity);
  }, [identity.name, identity.tag]);
  const [reviewing, setReviewing] = useState(null);

  const [version, setVersion] = useState(0); // bumped after an action: load everything again
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let current = true;
    Promise.all([call("/check"), call("/flags")])
      .then(([check, flags]) => current && setState({ status: "ok", check, flags }))
      .catch((err) => current && setState({ status: err.status === 404 ? "missing" : "error", error: err.message }));
    return () => {
      current = false;
    };
  }, [version]);

  if (state.status === "missing") return <NotFound />;
  return (
    <div className="relative w-full h-screen starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TopBar title="Admin" accent="#e85a7a" backLabel="Menu" onBack={() => navigate("/")} />
      <main className="flex-1 min-h-0 w-full max-w-[1000px] mx-auto p-4 flex flex-col gap-4 overflow-y-auto">
        {state.status === "loading" && <p className={TEXT}>Loading...</p>}
        {state.status === "error" && <p className={TEXT} style={{ color: "#e85a7a" }}>{state.error}</p>}
        {state.status === "ok" && (
          <>
            <Economy check={state.check} />
            <Flags flags={state.flags} onReview={setReviewing} />
            {reviewing && <Pair key={`${reviewing.loser}>${reviewing.winner}`} flag={reviewing} onDone={reload} />}
            <Lookup />
          </>
        )}
      </main>
    </div>
  );
}
