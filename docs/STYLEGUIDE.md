# Style Guide

The design rules for every screen, panel, modal and popup in Khuzur. Read this before building any new UI: every element must look like it belongs in a pixel-art dungeon card hall.

## Contents

1. [Design language](#1-design-language)
2. [Typography](#2-typography)
3. [Icons](#3-icons)
4. [Color palette](#4-color-palette)
5. [Components](#5-components)
6. [Backgrounds, glows and animation](#6-backgrounds-glows-and-animation)
7. [Player identity](#7-player-identity)
8. [Shared screens](#8-shared-screens)
9. [Small screens](#9-small-screens)
10. [Spacing and layout](#10-spacing-and-layout)

---

## 1. Design language

**Theme:** a retro pixel-art dungeon card hall. Dark backgrounds, glowing accents, hard pixel borders. Everything looks rendered on a 16-bit console.

**Mood:** gritty, warm lamplight, dungeon tavern, enchanted cards, worn parchment.

| Do | Don't |
| --- | --- |
| Sharp rectangles | Rounded corners (`border-radius`) anywhere |
| Hard 2–4px borders and solid drop shadows | Soft blurred "modern" shadows |
| Flat colors, dithering, radial glows | Glossy or "modern" gradients |
| `PixelIcon` bitmaps | Emoji or symbol characters in UI text |

---

## 2. Typography

| Role | Font | Class | Used for |
| --- | --- | --- | --- |
| Headings, labels, tags | Press Start 2P | `.font-pixel-display` | Panel titles, buttons, stat labels, section headers |
| Body text, values, chat | VT323 | `.font-pixel-body` | Descriptions, player names, messages, numbers |
| Mid-weight UI | Silkscreen | `.font-pixel-mid` | Breadcrumbs, secondary labels |

**Sizes are minimums, not suggestions.**

| Font | Minimum | Typical |
| --- | --- | --- |
| Press Start 2P | **10px** (header buttons, labels) | 11–12px for panel titles and buttons; 15–18px for names and screen titles |
| VT323 | **18px** (secondary notes) | 20–22px for body text and values |

- **The one exception:** tiny tags and badges (CPU, YOU, SOON) may use Press Start 2P at 8–9px.
- **Keep sizes crisp:** Press Start 2P is sharpest at multiples of 8px.
- **VT323 is thin and short:** `text-sm` / `text-xs` sizes are unreadable in it.
- **Case:** uppercase for panel titles and buttons, sentence case for body copy.

---

## 3. Icons

> **Never put symbol characters (⚔ ✦ ⚙ ☠ ► ● ✕ …) in UI text.** Press Start 2P and VT323 have no glyphs for them, so the browser swaps in a system font, or shows nothing. They render as tiny, misaligned or missing marks.

- **Use `PixelIcon`** (`src/components/PixelIcon.jsx`): 8×8 bitmaps drawn as crisp SVG that take the current text color. Add new icons there as 8-row maps of `#` and `.`.
- **No decorative flourishes.** Flourishes around titles (`✦ TITLE ✦`) are dropped entirely: the colored header bar already marks a title.
- **Card suits are content.** ♠♥♦♣ on cards stay as text.
- **Connection quality** uses `SignalBars` from `PixelUI.jsx`.

---

## 4. Color palette

Defined in `src/index.css` with `@theme`.

| Token | Hex | Role |
| --- | --- | --- |
| `void` | `#0a0712` | Deepest background, borders, shadows |
| `night` | `#14102a` | Secondary background |
| `twilight` | `#1f1a3d` | Card and panel backgrounds, inputs |
| `dusk` | `#2a234d` | Tertiary panels, inactive borders |
| `mist` | `#463a78` | Muted purple UI elements |
| `gold` | `#f4c430` | Primary accent: active states, XP, highlights |
| `gold-deep` | `#c89820` | Gold borders, secondary gold |
| `gold-glow` | `#ffe066` | Inner glow on gold elements |
| `cyan-glow` | `#5fd4d6` | Secondary accent: online indicators, wins |
| `cyan-deep` | `#2a8a8c` | Cyan borders |
| `rose` | `#e85a7a` | Danger, private and warning accent |
| `rose-deep` | `#a83a5a` | Rose borders |
| `parchment` | `#ead8b1` | Primary text |
| `bone` | `#c8b890` | Secondary, muted text |
| `poison` | `#9bd14f` | Success, join and Easy accent |
| `poison-deep` | `#6a9a30` | Poison borders |
| `felt` | `#4a1a2c` | Table felt |
| `oak` | `#6b3a1f` | Wood trim accents |

**CPU levels** always use the same three colors: Easy `poison` `#9bd14f`, Medium `gold` `#f4c430`, Hard `rose` `#e85a7a`.

---

## 5. Components

### Panels

`Panel` (`PixelUI.jsx`) on newer screens, `PixelPanel` (`PixelCard.jsx`) on older ones.

- 4px solid border in the accent color, with an outer 4px `void` shadow.
- Inner highlight: `inset 0 4px 0 rgba(255,255,255,0.06)`.
- Title bar: a full-width colored strip with `border-bottom: 4px solid void`, its title in uppercase `font-pixel-display`.

### Buttons

`Btn` (`PixelUI.jsx`), `PixelButton` (`PixelCard.jsx`) and the `.pixel-btn` class.

| State | Look |
| --- | --- |
| Rest | 4px `void` border, inner top highlight and bottom shadow, 4px `void` drop shadow (the "raised" pixel look) |
| Hover | `translateY(-2px)`, shadow grows to 6px |
| Active | `translateY(2px)`, shadow collapses to 0 |
| Disabled | `opacity: 0.4`, no movement, `cursor: not-allowed` |

Sizes: `sm`, `md`, `lg`, `xl`. Colors: `gold`, `cyan`, `rose`, `poison`, `dusk`, `bone`, `danger`.

### Inputs

- `void` background with a `3px solid twilight` border, and an inner shadow `inset 0 2px 0 0 rgba(0,0,0,0.5)`.
- `parchment` text, in `font-pixel-display` or `font-pixel-body`.
- No rounded corners and no focus outline. Uppercase where thematic (codes, names).

### Avatars

`PixelAvatar` (`PixelCard.jsx`):

- **The grid.** Every avatar, the five built-ins and painted ones alike, is a 17×17 pixel grid drawn by `CustomAvatarCanvas`. The grid is odd so a drawing has a true center column to mirror around. Built-ins come from `presetAvatar()` in `utils/avatarConstants.js`.
- **Sizes.** Ask for multiples of 17 (34, 51, 68, 102) so the layout gets exactly the size it asked for.
- **Snapping.** The drawn size snaps so each avatar pixel is a whole number of **device** pixels, which accounts for Windows display scaling. Ask for any size and expect it rounded to the nearest clean multiple.
- **Never scale an avatar** with CSS transforms or percentage sizes: that brings back uneven pixels.
- **Border.** A 2px `void` border and drop shadow sit outside the art, so edge pixels are never cropped.

### Hover and focus

Every clickable element must visibly react to hover **and** keyboard focus.

| Class | For | Reaction |
| --- | --- | --- |
| `.pixel-btn` | Buttons | Lifts 3px, brightens, gains a 3px parchment outline |
| `.pixel-hbtn` | Small buttons in panel header bars (Edit, Refresh) | Brightens and outlines |
| `.pixel-choice` + `--tone` | Outlined tiles | Fill with their color |
| `.pixel-pick` | Swatches and avatar tiles | Outline |

Motion is dropped under `prefers-reduced-motion`; the outline remains.

### Modals and popups

- **Style.** The same style as panels: a `night` background, an accent-colored border, and a title bar on top.
- **Backdrop.** Semi-transparent void, `rgba(10, 7, 18, 0.85)`, optionally dithered.
- **Close button.** A small pixel button in the top right, or built into the title bar. **Escape** and a click on the backdrop close it too.
- **Layout.** `void`-colored inner sections group inputs, and action buttons sit at the bottom, full width or side by side.

### Tags and badges

Small solid rectangles with a 2px `void` border, in `font-pixel-display` at 8–9px. Used for SOON, LOCKED, CPU, YOU, level badges and status markers.

---

## 6. Backgrounds, glows and animation

### Backgrounds

| Class | Where |
| --- | --- |
| `.starfield` | Main menu and lobby: scattered dots on a void-to-night gradient |
| `.felt-bg` | Game table surfaces: dark red with a subtle radial gradient |
| `.dither-shadow`, `.dither-light` | 45° repeating line overlays for texture |
| `.checker-strip` | Decorative divider bars |

### Glows

| Class | Effect |
| --- | --- |
| `.glow-gold` / `.text-glow-gold` | Gold drop shadow / text shadow |
| `.glow-cyan` / `.text-glow-cyan` | Cyan glow |
| `.glow-rose` / `.text-glow-rose` | Rose glow |
| `.text-shadow-hard` | A plain `2px 2px 0 #000` text shadow |

### Animation

| Class | Effect |
| --- | --- |
| `.pulse-gold` | Pulsing gold border glow (1.6s) |
| `.blink` | On/off step blink (1s) |
| `.float-y` | Gentle vertical float (2.4s) |
| `.shimmer-text` | Gold shimmer across text (3s) |

- Buttons move with 80ms ease transforms, cards with 120ms.
- Hover lifts range from 2px to 8px depending on the element.
- Card motion (dealing, plays, folds) uses GSAP timelines. Under reduced motion it is skipped or shortened.

---

## 7. Player identity

### Names and tags

| Part | Rule | Example |
| --- | --- | --- |
| Display name | Up to 6 characters, uppercase letters and digits, `font-pixel-display` | `WANDER` |
| Tag | `#` + 4 letters or digits, `font-pixel-body` | `#4719` |
| Together | `NAME #TAG`, unique as a pair | `WANDER #4719` |
| Avatar | One of the five built-ins, or one painted in the avatar painter | |

### Guests (not signed in)

- Name, tag and avatar are **assigned at random** on the first visit and kept in `localStorage`.
- Guests **can't change** them; the editor is hidden, and a muted "Guest" label shows instead.
- No stats are saved on the server.

### Signed-in players

- Can change their name, tag and avatar on `/profile`, which also holds the stats sheet. The server checks the name-and-tag pair is unique.
- Stats (EXP, wins, level) are saved and shown with glow accents.
- The lobby's Adventurer card is read-only (name, tag, level, XP bar). Its Edit button opens `/profile`.

### Signing in

- **Where.** The **player menu** in the top right (and Settings) holds **Sign in** for guests and **Sign out** for players. Sign in opens a **modal** over the main menu, not a separate page.
- **How.** Email and password, or **Google** or **Discord**; each provider's button shows only when the server has it set up. A SIGN IN / SIGN UP toggle switches forms.
- **New accounts** go to a profile setup step: pick a name, tag and avatar.
- **Errors** appear as inline messages in the rose accent.

---

## 8. Shared screens

| Piece | Rule |
| --- | --- |
| **Lobby** | Every game uses `components/lobby/GameLobby.jsx`, configured with a title, accent, route and socket event names. Don't fork it per game. |
| **Building blocks** | `components/PixelUI.jsx` (`Panel`, `Btn`, `HeaderBtn`, `TopBar`, `SignalBars`) and `components/pixelTokens.js` (`INK`, `TONES`, `inputStyle`) |
| **Game tables** | `components/TableChrome.jsx` holds the header and the scoreboard/chat sidebar every table shares (`TableHeader`, `TableSidebar`). Don't build a table header by hand. |
| **Fitting the viewport** | Lobby-style screens size vertically from the `--ctl`, `--gap`, `--hdr` and `--pad` variables in `index.css`, which scale with the viewport height. Check any change at 1366×657 (a laptop at 100% zoom) and 1920×969: no page scroll, no clipped panels. |

---

## 9. Small screens

Every screen works on a phone held either way and in a split-screen window. Check changes at **375×667**, **844×390** and **942×909** as well as the laptop sizes.

### Menu-style screens

The main menu, lobby, profile and avatar painter: below Tailwind's `lg`, panels stack at their natural height and the page scrolls. Never let a fixed-height grid squeeze panels; give rows `minmax(min-content, 1fr)`, or let them flow.

### Game tables

Tables switch layout in JavaScript (`useTableMetrics`), not CSS, because card sizes and seat positions are computed.

| Setting | When | What changes |
| --- | --- | --- |
| `compact` | Under 1200px wide | The sidebar slides out from a header button that counts unread chat, and the header keeps to one row |
| `seats: strip` | Phones held upright (under 640px wide) | A row of small plates above the felt |
| `seats: row` | Short screens (under 560px tall) | Slim plates beside the felt |
| `seats: full` | Otherwise | Full seats around the felt |

- **Controls** wrap into rows on phones (the status line, then buttons at full width) and stay on one row from `sm` up. `dense` trims them on short screens.
- **Icon-only buttons** keep a name for screen readers: an `aria-label`, or the label in `max-sm:sr-only`.

---

## 10. Spacing and layout

- **Page structure:** `w-full h-screen`, a flex column, the top bar on top.
- **Lobby-style grids:** `grid-cols-[400px_1fr]`.
- **Gaps:** `gap-2` to `gap-4` between panels, `p-2` to `p-3` inside them.
- **Positioning:** inline styles for pixel-precise control.
- **Corners:** none rounded, anywhere. Everything is a sharp rectangle.
