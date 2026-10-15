# Changelog

All notable changes to AuraTime are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added: AuraTime Desk Display (USB screen)

AuraTime can now drive a 480x320 USB display (Turing Smart Screen 3.5" class, USB `1A86:5722`, "rev. A" /
UsbMonitor protocol) from Chrome or Edge, using Web Serial. No driver or extra software is needed.

- **`/screen` page**, a 3-step wizard: check the browser, connect the display, choose the views. The live
  preview is the centrepiece; diagnostics live in a collapsed *Advanced* section.
- **Demo mode**: without a display the preview rotates through every view with sample data, clearly
  labelled. Real data always wins, and the demo stops when a display is connected.
- **Browsers without Web Serial** (Firefox, Safari, phones) get a clear "use Chrome or Edge on a computer"
  message plus the demo preview, with no useless buttons and no error text.
- **Six views**: clock, focus (Pomodoro + today's three tasks), week (last 7 days of focus + streak), next
  alarm / countdown, world clocks (up to 3) and weather + quote. They rotate every 20 s; the focus view
  stays on while a Pomodoro runs; views with no content are skipped, and you choose which ones rotate.
- **Looks like the app**: the five themes and four fonts, taken from a single `theme-tokens.ts`. The display
  follows the app's theme and font by default, with an option to pin its own.
- **Made for a screen that stays on**: only the changed rectangle is sent, a full refresh every 5 minutes,
  night dimming (or a black screen) on a schedule, a few pixels of drift every minute against burn-in,
  automatic reconnection (unplugged cable, PC asleep, dead port) with growing delays, and a write timeout
  so a dead port can never freeze the loop.
- **Windows startup**: `scripts/screen-startup.ps1` (shortcut in the Startup folder, `-Remove` and `-DryRun`)
  and `scripts/screen-launch.ps1` (waits for the page, optionally starts the local server, opens a dedicated
  browser window with timer throttling disabled).
- **Landing page**: a "Desk Display" button next to the app button, and a dedicated section with an animated
  mock-up (it runs the real renderer on a canvas), three setup steps and a compatibility note. No third-party
  logos; the page states that AuraTime is independent.
- **In the app**: a "Desk Display" entry in the clock settings with a connected / not connected indicator and
  a link to `/screen`, and a shortcut button on the extension's new tab.
- **Own SEO**: title and description for `/screen` (also in the prerendered HTML), entry in `sitemap.xml`.
- **Translations**: every Desk Display text, including what is drawn on the display, in the six app languages
  (en, pt, es, fr, de, it) through `TranslationService`, checked by a unit test that every key exists in every
  file. `TranslationService.format()` fills `{placeholders}`, and the language now follows changes made in
  another window.
- **Cross-window sync**: settings, tasks, analytics, Pomodoro, alarms, countdown, world clocks and language
  follow each other through `storage` events, so the clock window and the Desk Display window stay in step.
  Finishing a Pomodoro phase is idempotent across windows (no double credit).
- **Tests**: from none to 271 (Karma), covering the protocol bytes, the renderer (pixel level), the serial link
  with a fake port, wire integrity (header and pixels are never interleaved), reconnection and back-off, demo
  data, translations, and the landing, `/screen` and clock components.

### Changed

- **Pomodoro** counts down from an absolute end time, so it no longer drifts when the tab is throttled or the
  PC sleeps; missed phases are caught up. State is saved (`auratime_pomodoro`) and survives a reload. The phase
  now flips exactly at 00:00 instead of one second later.
- **One shared clock**: `TickService` is the single 1 s source of time; `formatClock()` is a pure, tested
  formatter. The clock component no longer owns the interval.
- **Keyboard shortcuts**: the global shortcuts moved to `,` (settings), `c` (cycle mode) and `h` (cycle theme)
  because `S`, `M` and `T` opened a panel *and* changed settings, mode or theme at the same time. Panel keys
  (`M`, `T`, `N`, `S`, `P`, `Z`) are unchanged.
- **Fonts are self-hosted** (Inter, Orbitron, Outfit, Playfair Display; latin subsets, SIL OFL) instead of
  loaded from Google Fonts, so the app, the extension and the canvas renderer work offline.
- **Browser extension**: the new tab opens the clock instead of the landing page (hash routing inside the
  extension); `build:extension` removes Angular's inline `onload` handler to satisfy the Manifest V3 CSP and
  fails the build if any inline handler/script or missing manifest file remains.

### Fixed

- **Themes lost classes on the first render.** The clock's theme classes were set with `ngClass` maps whose
  entries shared class names, and Angular lets a later false entry remove a class an earlier true entry just
  added. Visible effects: `light-glass` and `liquid-glass` had no background gradient (light-glass looked dark),
  the default Emerald Gold lost the gold gradient on the digits, most clock cards lost their border and blur, and
  the top-left, top-right and bottom-left positions were misaligned. Shared classes now live in their own entry,
  and regression tests mount the clock with each saved theme and position.
- **A frozen clock next to the real one.** The prerendered `/app` page (built with the default mode and theme) was
  hydrated even when the visitor had saved another mode; the unmatched build-time markup (a clock stuck at the
  build time) stayed on screen because the app never becomes "stable" and so is never cleaned up. The clock page
  now renders from scratch in the browser.
- The closed settings and alarm drawers cast their shadow onto the screen edges (visible as dark bands on light
  themes); the shadow now only exists while a drawer is open.
- Space-bar shortcut never worked (`event.key` is `' '`, not `'Space'`), and shortcuts swallowed browser
  combos such as Ctrl+R and Ctrl+-.
- Weather text on the display was Portuguese-only; it now follows the app language.

### Removed

- The unused service worker (`src/sw.js`) and its registration. It was never published (it lived outside the
  assets folder, so the browser only got a 404) and its cache-first strategy would have pinned visitors to
  stale builds.

### Repository

- `dist-extension/` is now git-ignored.
- `README.md` documents the Desk Display, the always-on setup and the updated shortcuts.
