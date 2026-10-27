// LINKED LOGINS — the profile's list of ways into this account: email and
// password, Google, Discord. LINK sends the player to the provider with a
// link ticket (server/oauth.js), whatever email that account uses, and they
// come back here (AuthCallback passes on how it went). UNLINK asks once more,
// and the server refuses to drop the last way in. Credit play needs Google or
// Discord, so this is where the credits lobby's LINK button lands (#logins).

import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, oauthStartUrl } from "../../lib/api";
import { INK } from "../pixelTokens";
import PixelIcon from "../PixelIcon";

const PROVIDERS = [
  { id: "google", label: "Google", color: "#ea4335" },
  { id: "discord", label: "Discord", color: "#5865f2" },
];

const name = (id) => PROVIDERS.find((p) => p.id === id)?.label ?? id;

/** What came back from a link, in words. */
function linkMessage({ link, provider }) {
  const p = name(provider);
  return (
    {
      ok: { kind: "ok", text: `${p} is linked. You can sign in with it, and play for credits.` },
      taken: { kind: "error", text: `That ${p} account already belongs to another player.` },
      exists: { kind: "error", text: `This account already has a ${p} login. Unlink it first.` },
      expired: { kind: "error", text: "That took too long. Press LINK again." },
      cancelled: { kind: "error", text: `Linking ${p} was cancelled.` },
    }[link] ?? { kind: "error", text: `Linking ${p} didn't work. Please try again.` }
  );
}

export default function LinkedLogins() {
  const location = useLocation();
  const navigate = useNavigate();
  const [logins, setLogins] = useState(null); // { password, providers }
  const [available, setAvailable] = useState([]); // providers the server has set up
  const [confirming, setConfirming] = useState(null); // the provider awaiting UNLINK's second press
  const [busy, setBusy] = useState(null);
  // How a link went, handed over by AuthCallback; read once, then cleared from history.
  const [message, setMessage] = useState(() => (location.state?.link ? linkMessage(location.state) : null));

  useEffect(() => {
    if (location.state?.link) navigate(`${location.pathname}${location.hash}`, { replace: true, state: null });
    if (location.hash === "#logins") document.getElementById("logins")?.scrollIntoView?.({ block: "center" });
    api("/logins")
      .then(setLogins)
      .catch((err) => setMessage({ kind: "error", text: err.message }));
    api("/oauth/providers")
      .then((data) => setAvailable(data.providers || []))
      .catch(() => {});
    // On arrival only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const link = async (provider) => {
    setBusy(provider);
    setMessage(null);
    try {
      const { ticket } = await api("/link-ticket", { method: "POST" });
      window.location.assign(`${oauthStartUrl(provider, "/profile#logins")}&link=${encodeURIComponent(ticket)}`);
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
      setBusy(null);
    }
  };

  const unlink = async (provider) => {
    setBusy(provider);
    setMessage(null);
    try {
      setLogins(await api(`/logins/${provider}`, { method: "DELETE" }));
      setMessage({ kind: "ok", text: `${name(provider)} is unlinked.` });
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const linked = logins?.providers ?? [];
  const rows = PROVIDERS.filter((p) => available.includes(p.id) || linked.includes(p.id));
  const btn = (bg, color) => ({ height: 36, backgroundColor: bg, color, boxShadow: `0 0 0 2px ${INK}` });

  return (
    <fieldset id="logins" className="scroll-mt-4">
      <legend className="font-pixel-display text-[11px] text-parchment mb-3">Linked logins</legend>
      <ul className="flex flex-col gap-2">
        <li className="flex items-center gap-3 px-3 py-2" style={{ backgroundColor: INK, boxShadow: "0 0 0 2px #2a234d" }}>
          <PixelIcon name="key" size={12} className="text-bone/70" />
          <span className="flex-1 font-pixel-body text-[20px] text-parchment">Email and password</span>
          <span className="font-pixel-display text-[9px] uppercase" style={{ color: logins?.password ? "#5fd4d6" : "#c8b890" }}>
            {logins ? (logins.password ? "Set" : "None") : "..."}
          </span>
        </li>
        {rows.map((p) => {
          const on = linked.includes(p.id);
          return (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2" style={{ backgroundColor: INK, boxShadow: "0 0 0 2px #2a234d" }}>
              <span aria-hidden className="shrink-0" style={{ width: 10, height: 10, backgroundColor: p.color, boxShadow: `0 0 0 2px ${INK}` }} />
              <span className="flex-1 font-pixel-body text-[20px] text-parchment">{p.label}</span>
              {on && <span className="font-pixel-display text-[9px] uppercase" style={{ color: "#5fd4d6" }}>Linked</span>}
              {!logins ? null : on ? (
                confirming === p.id ? (
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => unlink(p.id)} disabled={busy === p.id} className="pixel-hbtn px-2 font-pixel-display text-[9px] uppercase" style={btn("#e85a7a", INK)}>
                      {busy === p.id ? "..." : "Sure?"}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="pixel-hbtn px-2 font-pixel-display text-[9px] uppercase" style={btn("#1f1a3d", "#ead8b1")}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirming(p.id)} aria-label={`Unlink ${p.label}`} className="pixel-hbtn px-2 font-pixel-display text-[9px] uppercase" style={btn("#1f1a3d", "#ead8b1")}>
                    Unlink
                  </button>
                )
              ) : (
                <button type="button" onClick={() => link(p.id)} disabled={!!busy} aria-label={`Link ${p.label}`} className="pixel-hbtn px-3 font-pixel-display text-[9px] uppercase" style={btn("#5fd4d6", INK)}>
                  {busy === p.id ? "..." : "Link"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {logins && (
        <p className="mt-2 font-pixel-body text-[18px] leading-tight text-bone/70">
          {linked.length
            ? "Sign in with any of these. Credit play is unlocked."
            : "Link Google or Discord to play for credits. Its email doesn't have to match this account's."}
        </p>
      )}
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className="mt-2 font-pixel-body text-[20px] leading-tight" style={{ color: message.kind === "error" ? "#e85a7a" : "#9bd14f" }}>
          {message.text}
        </p>
      )}
    </fieldset>
  );
}
