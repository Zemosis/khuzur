// PRIVACY — the privacy policy (/privacy). Google requires one for its
// sign-in, and players deserve to know. Keep it true to the code: if a change
// stores something new about players, say so here and bump UPDATED.

import React, { useState } from "react";
import { Panel, TopBar } from "../components/PixelUI";
import SettingsModal from "../components/SettingsModal";
import PixelIcon from "../components/PixelIcon";

const UPDATED = "1 October 2026";
const CONTACT = "zemosisb@gmail.com";
const ACCENT = "#5fd4d6";

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-pixel-display text-[12px] sm:text-[13px] uppercase leading-snug" style={{ color: ACCENT }}>
        {title}
      </h2>
      <div className="flex flex-col gap-3 font-pixel-body text-[20px] sm:text-[22px] leading-snug text-parchment/90">{children}</div>
    </section>
  );
}

function List({ items }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map(([term, text]) => (
        <li key={term} className="flex gap-3">
          <span className="text-gold shrink-0 mt-1.5" aria-hidden>
            <PixelIcon name="right" size={10} />
          </span>
          <span>
            <span className="text-gold">{term}</span> — {text}
          </span>
        </li>
      ))}
    </ul>
  );
}

const Mail = () => (
  <a href={`mailto:${CONTACT}`} className="underline" style={{ color: ACCENT }}>
    {CONTACT}
  </a>
);

export default function Privacy() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="relative w-full h-dvh starfield font-pixel-body text-parchment flex flex-col overflow-hidden">
      <TopBar title="Privacy" accent={ACCENT} onSettings={() => setShowSettings(true)} />

      <main className="flex-1 min-h-0 overflow-y-auto p-4">
        <Panel title="Privacy policy" icon="lock" deep="#2a8a8c" className="max-w-3xl mx-auto">
          <article className="flex flex-col gap-8 p-5 sm:p-8">
            <p className="font-pixel-body text-[20px] sm:text-[22px] leading-snug text-bone">
              Khuzur is a card hall you can play in your browser. This page says what we keep about you, why, and how to
              have it removed. Last updated {UPDATED}.
            </p>

            <Section title="What we keep">
              <p>If you play as a guest, we keep no account. If you sign in, we keep:</p>
              <List
                items={[
                  ["Your email address", "to sign you in and tell accounts apart."],
                  ["Your password", "only if you made one, and only as a one-way hash: we can't read it."],
                  [
                    "Your Google or Discord account ID",
                    "if you sign in with them, so the same account opens next time. We ask them for your email address and nothing else: not your contacts, your friends or your messages.",
                  ],
                  ["Your profile", "the name, tag and avatar you pick, plus gold, experience and level."],
                  [
                    "Your matches",
                    "who played, the scores, placings and times, so your stats and history work. Guests appear in these records by their guest name only.",
                  ],
                ]}
              />
              <p>
                Table chat is passed between the players at the table and is not saved. We don't use analytics, ads or
                tracking of any kind.
              </p>
            </Section>

            <Section title="On your device">
              <p>
                Your browser keeps your sign-in session, your guest name, your saved colors and your sort setting in its
                local storage, so they survive a reload. While you sign in with Google or Discord, our server sets one
                short-lived cookie (ten minutes at most) that only checks the sign-in is really yours.
              </p>
            </Section>

            <Section title="Who else sees it">
              <p>
                We never sell or share your data. It is stored with the services that run Khuzur: Render hosts the
                website and game server and Supabase hosts the database, both in the United States. Like any web host,
                they may log technical details such as IP addresses to keep the service running. Google and Discord only
                learn that you signed in to Khuzur.
              </p>
              <p>Other players see your name, tag, avatar, level and the results of games you play with them.</p>
            </Section>

            <Section title="Keeping and deleting">
              <p>
                We keep your account until you ask us to delete it. To do that, or to see what we hold about you, write
                to <Mail /> from the email on your account. Deleting an account removes your email, password, sign-in
                links and profile; the matches you played stay in the other players' history without your name.
              </p>
            </Section>

            <Section title="Children">
              <p>Khuzur is not meant for children under 13, and we don't knowingly keep data about them.</p>
            </Section>

            <Section title="Changes and contact">
              <p>
                If this policy changes, this page will show the new date. Questions are welcome at <Mail />.
              </p>
            </Section>
          </article>
        </Panel>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
