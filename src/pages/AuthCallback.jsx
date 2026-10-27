// AUTH CALLBACK — where Google / Discord sign-in lands (/auth/callback). The
// game server (server/oauth.js) puts the session token, or what went wrong,
// in the URL fragment. The token is taken out of the address bar at once,
// then the player goes back where they started — or to the main menu, which
// asks a new player to pick a name and tag. Linking a login to an account
// (#link=ok, or why not) goes straight back to the profile with the result.

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const ERRORS = {
  cancelled: "Sign in was cancelled.",
  no_email: "That account has no verified email address. Verify it with the provider, or sign up with email.",
  unavailable: "That sign-in option isn't available right now.",
  failed: "Sign in didn't work. Please try again.",
};

export default function AuthCallback() {
  const navigate = useNavigate();
  const { completeOAuth } = useAuth();
  // What the server sent, read once on arrival.
  const [landing] = useState(() => Object.fromEntries(new URLSearchParams(window.location.hash.slice(1))));
  const [error, setError] = useState(() => (landing.token || landing.link ? "" : ERRORS[landing.error] || ERRORS.failed));
  const started = useRef(false);

  useEffect(() => {
    // Once, even when StrictMode runs the effect twice.
    if (started.current) return;
    started.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    if (landing.link) {
      navigate(landing.returnTo || "/profile", { replace: true, state: { link: landing.link, provider: landing.provider } });
      return;
    }
    if (!landing.token) return;
    completeOAuth(landing.token)
      .then((profile) => navigate(profile?.username ? landing.returnTo || "/" : "/", { replace: true }))
      .catch(() => setError(ERRORS.failed));
  }, [completeOAuth, navigate, landing]);

  return (
    <div className="flex flex-col items-center justify-center gap-5 h-dvh starfield font-pixel-body text-parchment text-center px-4">
      {error ? (
        <>
          <div className="font-pixel-display text-[14px]" style={{ color: "#e85a7a" }}>
            COULDN'T SIGN IN
          </div>
          <div role="alert" className="font-pixel-body text-[22px] text-bone/80 max-w-md">
            {error}
          </div>
          <button
            onClick={() => navigate("/", { replace: true })}
            className="pixel-btn font-pixel-display text-[10px] px-4 py-3"
            style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}
          >
            BACK TO MENU
          </button>
        </>
      ) : (
        <div className="font-pixel-display text-[14px] text-glow-gold blink">SIGNING IN...</div>
      )}
    </div>
  );
}
