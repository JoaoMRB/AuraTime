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
  automatic reconnection (unplugged cable, PC asleep, dead port) with growing delays, and a write timeout:
  a write that never finishes is abandoned after 8 seconds, the port is aborted, closed and reopened, and the
  loop goes on.
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
  Finishing a Pomodoro phase is credited once across windows: the credit is taken under a Web Lock and the
  "already credited?" check is repeated inside it, so two windows that notice the end at the same moment cannot
  both credit it (in a browser without Web Locks the check is best effort).
- **Tests**: from none to 418 (Karma), covering the protocol bytes, the renderer (pixel level), the serial link
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

### Fixed: findings of the independent review of the Desk Display branch

- **Alarms:** opening `/screen` no longer stops the alarm checker for the whole app. That page only holds a
  per-component suppression (released when you leave it), so alarms keep ringing on every other route and
  window.
- **Pomodoro after a restart:** a phase that ended while the app was closed is credited once (at most the one
  phase that was in progress), dated to the day it ended, without the chime, and the timer is left stopped.
  Catching up inside a running app after browser throttling is unchanged.
- **Midnight:** "today" and the streak follow the shared clock, so they roll over at midnight without a reload.
- **Weather:** refreshes every 30 minutes; the place shown for a located forecast is a translated "Your
  location" (it used to say "Local"); when location is denied, a city picker (Open-Meteo geocoding) is in the
  clock's settings, and "Lisbon (default)" is shown until a city is chosen.
- **Hidden page:** the heartbeat tolerates the browser's throttled timers, and a throttled tick no longer
  resends the whole picture. The README and `/screen` say that the display needs its own visible window or the
  startup launcher.
- **Serial port:** closing now aborts the writer and cancels the reader before `close()`, failures are logged,
  and a reconnect after a write timeout really reopens the port. A device that never answers the HELLO
  handshake is flagged; silent retries no longer flicker between "connecting" and "disconnected".
- **Several windows:** settings save only the fields that changed (a window no longer overwrites another one's
  mode or sound); only one `/screen` window drives the display (Web Locks) and the others show a preview;
  the Pomodoro credit is atomic across windows.
- **Stored data:** everything read from `localStorage` or a `storage` event is validated entry by entry
  (tasks, alarms, links, world clocks, presets, soundscape, analytics, Pomodoro, settings, screen preferences,
  language, status). Broken entries are dropped; saved links must be http(s); a stored language code can no
  longer become an arbitrary file path. Font, theme and locale lookups use `Object.hasOwn` (a stored
  `"constructor"` is no longer a font). Every storage access is guarded.
- **Alarms and daylight saving:** the time left to an alarm now respects the days it is set for and skips a day
  on which its time does not exist (the hour skipped when clocks go forward).
- **Nothing lost:** when a stored list (tasks, alarms, links, world clocks, timer presets) fails validation, or loses entries, the raw text is first copied to `auratime_<name>_corrupt_<timestamp>` (the newest three are kept).
- **Notes:** the "saved at" label never appeared (the write to it was rejected and hidden); it works now.
- **Web Serial on plain http:** the page says "Web Serial needs HTTPS or localhost" instead of "use Chrome".
- **Docs:** compatibility is worded as "Turing Smart Screen 3.5" class, USB 1A86:5722, rev. A"; the README adds
  the Linux `dialout` and macOS CH34x notes, the exact weather request, the hidden-window advice and the
  `-ExecutionPolicy Bypass` note.

### Removed

- The unused service worker (`src/sw.js`) and its registration. It was never listed in `angular.json` (only
  `public/` is copied into a build), so no build ever contained it and the registration could only fail with a
  404; its cache-first strategy would have pinned visitors to stale builds if it had been served.

### Repository

- `dist-extension/` is now git-ignored.
- `README.md` documents the Desk Display, the always-on setup and the updated shortcuts.
