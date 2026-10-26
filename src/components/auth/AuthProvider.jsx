// AUTH PROVIDER — who the player is: a signed-in account (restored from a
// saved token on load) or this browser's guest identity. Read it anywhere
// below with useAuth() (hooks/useAuth.js).

import React, { useState, useEffect } from "react";
import { api, getToken, setToken, oauthStartUrl } from "../../lib/api";
import { getGuestIdentity } from "../../lib/guestIdentity";
import { deserializeAvatar } from "../../utils/avatarConstants";
import { AuthContext } from "../../hooks/useAuth";

export default function AuthProvider({ children }) {
  // { token, user: { id, email } } while signed in, null for guests.
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  // Only a saved token needs a round trip before we know who the player is.
  const [loading, setLoading] = useState(() => !!getToken());

  const guest = getGuestIdentity();

  // Restore a saved session on load. A 401 means the token expired or the
  // account is gone, so drop it; any other failure (server down) keeps the
  // token for next time and plays as a guest meanwhile.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api("/me")
      .then(({ user, profile }) => {
        setSession({ token, user });
        setProfile(profile);
      })
      .catch((err) => {
        if (err.status === 401) setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  function applySession({ token, user, profile }) {
    setToken(token);
    setSession({ token, user });
    setProfile(profile);
  }

  async function fetchProfile() {
    const { profile } = await api("/me");
    setProfile(profile);
    return profile;
  }

  async function signIn(email, password) {
    const data = await api("/login", { method: "POST", body: { email, password } });
    applySession(data);
    return data;
  }

  async function signUp(email, password) {
    const data = await api("/signup", { method: "POST", body: { email, password } });
    applySession(data);
    return data;
  }

  // Leaves the site for the provider; the server brings the player back to
  // /auth/callback (pages/AuthCallback.jsx), which calls completeOAuth.
  function signInWithOAuth(provider, returnTo = window.location.pathname) {
    window.location.assign(oauthStartUrl(provider, returnTo));
  }

  /** Takes the session token from an OAuth sign-in. Returns the profile. */
  async function completeOAuth(token) {
    setToken(token);
    try {
      const { user, profile } = await api("/me");
      setSession({ token, user });
      setProfile(profile);
      return profile;
    } catch (err) {
      setToken(null);
      throw err;
    }
  }

  async function signOut() {
    setToken(null);
    setSession(null);
    setProfile(null);
  }

  async function updateProfile(updates) {
    if (!session) return;
    const { profile } = await api("/profile", { method: "PATCH", body: updates });
    setProfile(profile);
    return profile;
  }

  // The server creates the profile row at signup, so setup just fills it in.
  const createProfile = updateProfile;

  const isGuest = !session;

  // Signed in but never picked a name — the OAuth path skips the signup form,
  // so the setup step has to be driven off the profile, not the signup flow.
  const needsProfileSetup = !!session && !loading && !profile?.username;

  const customAvatar = profile?.custom_avatar ? deserializeAvatar(profile.custom_avatar) : null;

  const customColors = profile?.custom_colors || [];

  const identity = isGuest
    ? { name: guest.name, tag: guest.tag, avatar: guest.avatar, customAvatar: null, customColors: [], level: 1, exp: 0, gold: 0, wins: 0, gamesPlayed: 0 }
    : {
        name: profile?.username || guest.name,
        tag: profile?.tag || guest.tag,
        avatar: profile?.avatar || guest.avatar,
        customAvatar,
        customColors,
        level: profile?.level ?? 1,
        exp: profile?.exp ?? 0,
        gold: profile?.coins ?? 0, // kept in the profile's coins column
        wins: profile?.wins ?? 0,
        gamesPlayed: profile?.games_played ?? 0,
      };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        isGuest,
        needsProfileSetup,
        identity,
        signIn,
        signUp,
        signInWithOAuth,
        completeOAuth,
        signOut,
        updateProfile,
        createProfile,
        fetchProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
