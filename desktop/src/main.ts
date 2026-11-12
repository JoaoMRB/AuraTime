import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SCREEN_VIEWS, ScreenView } from '../../src/app/services/screen/display-snapshot';
import { resolveFont, resolveThemeId } from '../../src/app/services/screen/theme-tokens';
import { SCREEN_HEIGHT, SCREEN_WIDTH, diffRect, extractRect } from '../../src/app/services/screen/turing-protocol';
import { DisplayLink, findDisplayPath } from './display-link';
import { FrameSource } from './frame-source';

/*
 * AuraTime display service: draws the screen and sends it to the USB display, with no browser involved.
 *
 *   node dist/aura-time-display.mjs [--view clock] [--theme emerald-gold] [--font outfit] [--lang en]
 *                                   [--brightness 60] [--12h] [--demo] [--no-reset] [--no-flow-control]
 *                                   [--png out.png]      draw one frame to a file and exit (no display needed)
 */

const RETRY_MS = 5000;
const MEMORY_LOG_MS = 60000;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const viewArg = value('view', 'clock');
if (!(ALL_SCREEN_VIEWS as readonly string[]).includes(viewArg)) {
  console.error(`Unknown view "${viewArg}". Views: ${ALL_SCREEN_VIEWS.join(', ')}`);
  process.exit(2);
}
const view = viewArg as ScreenView;
const brightness = Math.min(100, Math.max(0, Number(value('brightness', '60')) || 0));

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, value('assets', '../../public'));
const frames = new FrameSource(assetsDir, {
  theme: resolveThemeId(value('theme', '')),
  fontId: resolveFont(value('font', '')).id,
  lang: value('lang', 'en'),
  use24h: !flag('12h'),
  demo: flag('demo')
});

const pngPath = value('png', '');
if (pngPath) {
  frames.draw(view);
  writeFileSync(pngPath, frames.png());
  console.log(`Wrote ${pngPath}`);
  process.exit(0);
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const log = (text: string) => console.log(`${new Date().toLocaleTimeString()} ${text}`);
const memory = () => `${Math.round(process.memoryUsage.rss() / 1048576)} MB`;

const link = new DisplayLink();
let stopping = false;

async function run(): Promise<void> {
  let waitingLogged = false;
  while (!stopping) {
    if (!(await findDisplayPath())) {
      if (!waitingLogged) log('Waiting for the display to be plugged in...');
      waitingLogged = true;
      await sleep(RETRY_MS);
      continue;
    }
    waitingLogged = false;
    try {
      await link.connect({ brightness, flowControl: !flag('no-flow-control'), skipReset: flag('no-reset') });
      log(`Connected: ${link.model} (memory ${memory()})`);
      await sendLoop();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const busy = /access denied|busy|in use|failed to open/i.test(text);
      log(busy ? `The display's port is in use by another program (${text}).` : `Link error: ${text}`);
    }
    await link.close();
    if (!stopping) await sleep(RETRY_MS);
  }
}

/** One frame per second, aligned to the clock; only the pixels that changed are sent. */
async function sendLoop(): Promise<void> {
  let previous: Uint16Array | null = null;
  let lastMemoryLog = Date.now();
  while (!stopping) {
    frames.draw(view);
    const current = frames.rgb565();
    const rect = diffRect(previous, current, SCREEN_WIDTH, SCREEN_HEIGHT);
    if (rect) await link.sendBitmap(rect, extractRect(current, SCREEN_WIDTH, rect));
    previous = current;

    if (Date.now() - lastMemoryLog >= MEMORY_LOG_MS) {
      lastMemoryLog = Date.now();
      log(`Running (memory ${memory()})`);
    }
    await sleep(1000 - (Date.now() % 1000));
  }
}

async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await link.close();
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

void run();
