# AuraTime

> A minimalist, luxury screen clock.

![LandingPage](LandingPage.png)

## What is it?

AuraTime is a minimalist luxury screen clock and ambient focus hub designed to elevate your workspace into a deeply productive sanctuary.

**Features:**
- **Ambient Soundscapes (100% Procedural Web Audio):** Synthesized rain, crackling fireplace, thunder, wind, pink/brown noise, and binaural focus frequencies with independent track mixer & focus presets. Zero audio files or copyright concerns — purely mathematical browser synthesis.
- **Today's 3 & Focus Tasks:** Minimalist priority list integrated directly with Pomodoro cycles and progress tracking.
- **Quick Scratchpad:** Local instant notes drawer for deep work sessions.
- **Focus Analytics & Streaks:** Daily/weekly focus hours, Pomodoro counters, and streak visualization.
- **Real-Time Weather & Daily Quotes:** Open-Meteo weather integration and stoic inspiration.
- **Floating Mini Clock (Picture-in-Picture):** Pop out an always-on-top clock/pomodoro widget while coding or writing.
- **Chrome / Edge New Tab Extension:** Packaged Manifest V3 extension to transform every new tab into your zen dashboard.
- **Luxury Aesthetics:** Emerald Gold, Liquid Glass, Obsidian Platinum, and Frosted Glass themes with customizable angles, scales, and fonts.
- **Zen Screensaver Mode:** Anti-burn-in minimal immersion for OLED/ultrawide displays.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `M` | Toggle Ambient Soundscape Mixer |
| `T` | Toggle Today's Focus Tasks |
| `N` | Toggle Quick Scratchpad Notes |
| `S` | Toggle Focus Stats & Streaks |
| `P` | Toggle Picture-in-Picture Mini Window |
| `Z` | Toggle Zen Mode (Screensaver) |
| `Esc` | Close all open drawers & panels |

## Quick Start

```bash
git clone https://github.com/JoaoMRB/AuraTime.git
cd AuraTime
npm install
npm start
```
Then open `http://localhost:4200`.

## Build as Chrome/Edge "New Tab" Extension

```bash
npm run build:extension
```
1. Open `chrome://extensions` (or `edge://extensions`) in your browser.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the generated `dist-extension` folder.
4. Open a new tab!

## Support

- **GitHub:** https://github.com/JoaoMRB/AuraTime
- **Buy me a coffee:** https://buymeacoffee.com/malog

---

Built with Angular, Tailwind CSS, and a passion for minimalism.
