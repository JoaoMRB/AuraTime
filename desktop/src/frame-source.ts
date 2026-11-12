import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { createBaseSnapshot, fillDemoData } from '../../src/app/services/screen/demo-data';
import { ScreenView } from '../../src/app/services/screen/display-snapshot';
import { buildLabels, localeForLang, pixelShift } from '../../src/app/services/screen/screen-logic';
import { drawScreen } from '../../src/app/services/screen/screen-renderer';
import { FontId, ThemeId } from '../../src/app/services/screen/theme-tokens';
import { SCREEN_HEIGHT, SCREEN_WIDTH, rgbaToRgb565 } from '../../src/app/services/screen/turing-protocol';

/**
 * One static font file per weight the renderer asks for. The web app's variable fonts (public/fonts) are not
 * used here: the Skia canvas does not pick the right weight out of a variable font, so every text came out thin.
 */
const FONT_FILES: [pkg: string, file: string, family: string][] = [
  ['inter', 'inter-latin-300-normal', 'Inter'],
  ['inter', 'inter-latin-400-italic', 'Inter'],
  ['inter', 'inter-latin-500-normal', 'Inter'],
  ['inter', 'inter-latin-600-normal', 'Inter'],
  ['inter', 'inter-latin-700-normal', 'Inter'],
  ['outfit', 'outfit-latin-500-normal', 'Outfit'],
  ['orbitron', 'orbitron-latin-700-normal', 'Orbitron'],
  ['playfair-display', 'playfair-display-latin-400-italic', 'Playfair Display']
];

export interface FrameOptions {
  theme: ThemeId;
  fontId: FontId;
  lang: string;
  use24h: boolean;
  /** Fill the views with sample data (there is no user data in the service yet). */
  demo: boolean;
}

/**
 * Draws the screen with the same renderer as the web app (screen-renderer.ts), on a Skia canvas instead of a
 * browser canvas, and returns the frame as RGB565 ready for the display.
 */
export class FrameSource {
  private readonly canvas = createCanvas(SCREEN_WIDTH, SCREEN_HEIGHT);
  private readonly ctx = this.canvas.getContext('2d');
  private readonly labels;
  private readonly locale: string;

  /** @param assetsDir the web app's `public` folder (translations). */
  constructor(assetsDir: string, private readonly options: FrameOptions) {
    for (const [pkg, file, family] of FONT_FILES) {
      const path = fontPath(pkg, file);
      if (!path || !GlobalFonts.registerFromPath(path, family)) {
        console.warn(`[render] font not loaded: @fontsource/${pkg}/files/${file}.woff2`);
      }
    }
    const texts = JSON.parse(readFileSync(join(assetsDir, 'assets', 'i18n', `${options.lang}.json`), 'utf8'));
    this.labels = buildLabels(path => lookup(texts, path));
    this.locale = localeForLang(options.lang);
  }

  draw(view: ScreenView, now = new Date()): void {
    const { theme, fontId, use24h, demo } = this.options;
    const base = createBaseSnapshot({ now, theme, fontId, labels: this.labels, locale: this.locale, use24h });
    const snap = demo ? fillDemoData(base) : base;
    // The renderer is typed for the browser's canvas; the Skia context implements the same drawing API.
    drawScreen(this.ctx as unknown as CanvasRenderingContext2D, snap, view, { shift: pixelShift(now) });
  }

  rgb565(): Uint16Array {
    return rgbaToRgb565(this.ctx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).data);
  }

  png(): Buffer {
    return this.canvas.toBuffer('image/png');
  }
}

function fontPath(pkg: string, file: string): string | null {
  try {
    return createRequire(import.meta.url).resolve(`@fontsource/${pkg}/files/${file}.woff2`);
  } catch {
    return null;
  }
}

function lookup(texts: unknown, path: string): string {
  let node: unknown = texts;
  for (const key of path.split('.')) {
    node = node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
  }
  return typeof node === 'string' ? node : path;
}
