import { DisplaySnapshot, ScreenView } from './display-snapshot';
import {
  FONT_TOKENS, ThemeTokens, THEME_TOKENS, fontShorthand
} from './theme-tokens';

export interface DrawOptions {
  width: number;
  height: number;
  /** Anti burn-in offset applied to the card and its content (the background stays put). */
  shift: { x: number; y: number };
  /** Paint a fully black frame (night mode). */
  black: boolean;
}

export const DEFAULT_DRAW_OPTIONS: DrawOptions = {
  width: 480,
  height: 320,
  shift: { x: 0, y: 0 },
  black: false
};

const BODY_FONT = "'Inter', sans-serif";
const EMOJI_FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
const CARD_INSET = 20;
const CARD_RADIUS = 28;

type Ctx = CanvasRenderingContext2D;

/** Fonts the renderer needs; load them before the first frame (document.fonts.load). */
export const REQUIRED_FONT_SHORTHANDS: string[] = [
  ...Object.values(FONT_TOKENS).map(f => fontShorthand(f, 32)),
  `500 16px ${BODY_FONT}`,
  `italic 400 16px ${BODY_FONT}`
];

/** Draws one frame of the given view. Pure with respect to app state: everything comes from the snapshot. */
export function drawScreen(ctx: Ctx, snap: DisplaySnapshot, view: ScreenView, options: Partial<DrawOptions> = {}): void {
  const opts: DrawOptions = { ...DEFAULT_DRAW_OPTIONS, ...options };
  const { width: W, height: H } = opts;

  if (opts.black) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    return;
  }

  const theme = THEME_TOKENS[snap.theme];
  drawBackground(ctx, theme, W, H);

  ctx.save();
  ctx.translate(opts.shift.x, opts.shift.y);
  drawCard(ctx, theme, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  switch (view) {
    case 'focus':
      drawFocusView(ctx, snap, theme, W);
      break;
    case 'weather':
      drawWeatherView(ctx, snap, theme, W);
      break;
    default:
      drawClockView(ctx, snap, theme, W);
  }
  ctx.restore();
}

/* ------------------------------ views ------------------------------ */

function drawClockView(ctx: Ctx, snap: DisplaySnapshot, theme: ThemeTokens, W: number): void {
  const cx = W / 2;
  const font = FONT_TOKENS[snap.fontId];

  setLetterSpacing(ctx, '2px');
  ctx.fillStyle = theme.text.accent;
  ctx.font = `500 15px ${BODY_FONT}`;
  ctx.fillText(snap.clock.dateLabel.toUpperCase(), cx, 70);
  setLetterSpacing(ctx, '0px');

  // Time (+ small AM/PM), centred together, shrunk to fit the card
  const ampm = snap.clock.ampm;
  const maxWidth = 360;
  const ampmFont = `600 22px ${BODY_FONT}`;
  ctx.font = ampmFont;
  const ampmWidth = ampm ? ctx.measureText(ampm).width + 10 : 0;
  const size = fitFontSize(ctx, snap.clock.hhmm, size => fontShorthand(font, size), 128, maxWidth - ampmWidth);
  ctx.font = fontShorthand(font, size);
  const timeWidth = ctx.measureText(snap.clock.hhmm).width;
  const startX = cx - (timeWidth + ampmWidth) / 2;
  const baseline = 190;

  ctx.textAlign = 'left';
  ctx.fillStyle = textFill(ctx, theme.text.primary, startX, timeWidth);
  ctx.fillText(snap.clock.hhmm, startX, baseline);
  if (ampm) {
    ctx.font = ampmFont;
    ctx.fillStyle = theme.text.accent;
    ctx.fillText(ampm, startX + timeWidth + 10, baseline);
  }
  ctx.textAlign = 'center';

  // Seconds progress line
  const lineW = 300;
  const lx = cx - lineW / 2;
  const ly = baseline + 24;
  ctx.fillStyle = withAlpha(theme.text.muted, 0.25);
  ctx.fillRect(lx, ly, lineW, 2);
  ctx.fillStyle = theme.text.accent;
  ctx.fillRect(lx, ly, Math.round((lineW * snap.clock.seconds) / 59), 2);

  // Footer: today's focus + streak
  ctx.fillStyle = theme.text.muted;
  ctx.font = `500 14px ${BODY_FONT}`;
  setLetterSpacing(ctx, '1px');
  const { labels, stats } = snap;
  ctx.fillText(`${labels.today} ${stats.todayMin} ${labels.minutes}  ·  ${stats.streak} ${labels.streak}`, cx, 268);
  setLetterSpacing(ctx, '0px');
}

function drawFocusView(ctx: Ctx, snap: DisplaySnapshot, theme: ThemeTokens, W: number): void {
  const cx = W / 2;
  const font = FONT_TOKENS[snap.fontId];
  const { focus, labels } = snap;

  const phaseLabel =
    focus.phase === 'work' ? labels.focus
    : focus.phase === 'break' ? labels.break
    : focus.remainingSec < focus.totalSec ? labels.paused
    : labels.ready;

  setLetterSpacing(ctx, '4px');
  ctx.fillStyle = theme.text.accent;
  ctx.font = `600 16px ${BODY_FONT}`;
  ctx.fillText(phaseLabel, cx, 62);
  setLetterSpacing(ctx, '0px');

  const time = formatMmSs(focus.remainingSec);
  const size = fitFontSize(ctx, time, s => fontShorthand(font, s), 92, 340);
  ctx.font = fontShorthand(font, size);
  const tw = ctx.measureText(time).width;
  ctx.fillStyle = textFill(ctx, theme.text.primary, cx - tw / 2, tw);
  ctx.fillText(time, cx, 150);

  // Progress bar
  const barW = 340;
  const bx = cx - barW / 2;
  const by = 168;
  const progress = focus.totalSec > 0 ? clamp01(1 - focus.remainingSec / focus.totalSec) : 0;
  ctx.fillStyle = withAlpha(theme.text.muted, 0.25);
  roundRect(ctx, bx, by, barW, 6, 3);
  ctx.fill();
  if (progress > 0) {
    ctx.fillStyle = theme.text.accent;
    roundRect(ctx, bx, by, Math.max(6, barW * progress), 6, 3);
    ctx.fill();
  }

  // Today's tasks
  ctx.textAlign = 'left';
  const tx = cx - barW / 2;
  if (focus.tasks.length === 0) {
    ctx.fillStyle = theme.text.muted;
    ctx.font = `italic 400 16px ${BODY_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(labels.noTasks, cx, 228);
  } else {
    focus.tasks.slice(0, 3).forEach((task, i) => {
      const y = 208 + i * 28;
      ctx.fillStyle = task.active ? theme.text.accent : theme.text.muted;
      ctx.font = `${task.active ? 600 : 500} 17px ${BODY_FONT}`;
      ctx.fillText(task.active ? '▸' : '•', tx, y);
      ctx.fillText(ellipsize(ctx, task.text, barW - 26), tx + 24, y);
    });
  }
  ctx.textAlign = 'center';
}

function drawWeatherView(ctx: Ctx, snap: DisplaySnapshot, theme: ThemeTokens, W: number): void {
  const cx = W / 2;
  const font = FONT_TOKENS[snap.fontId];
  const weather = snap.weather;

  if (!weather) {
    drawClockView(ctx, snap, theme, W);
    return;
  }

  // Icon + temperature
  const temp = `${weather.tempC}°`;
  const size = fitFontSize(ctx, temp, s => fontShorthand(font, s), 92, 200);
  ctx.font = fontShorthand(font, size);
  const tw = ctx.measureText(temp).width;
  const iconSize = 58;
  const gap = 18;
  const startX = cx - (tw + gap + iconSize) / 2;

  ctx.textAlign = 'left';
  ctx.font = `${iconSize - 6}px ${EMOJI_FONT}`;
  ctx.fillStyle = theme.text.accent;
  ctx.fillText(weather.icon, startX, 128);
  ctx.font = fontShorthand(font, size);
  ctx.fillStyle = textFill(ctx, theme.text.primary, startX + iconSize + gap, tw);
  ctx.fillText(temp, startX + iconSize + gap, 128);
  ctx.textAlign = 'center';

  setLetterSpacing(ctx, '2px');
  ctx.fillStyle = theme.text.accent;
  ctx.font = `600 16px ${BODY_FONT}`;
  ctx.fillText(weather.description.toUpperCase(), cx, 160);
  ctx.fillStyle = theme.text.muted;
  ctx.font = `500 13px ${BODY_FONT}`;
  ctx.fillText(weather.city.toUpperCase(), cx, 182);
  setLetterSpacing(ctx, '0px');

  // Quote
  if (snap.quote) {
    ctx.fillStyle = withAlpha(theme.text.muted, 0.25);
    ctx.fillRect(cx - 30, 200, 60, 1);

    ctx.fillStyle = theme.text.muted;
    ctx.font = `italic 400 15px ${BODY_FONT}`;
    const lines = wrapText(ctx, `“${snap.quote.text}”`, 360, 2);
    lines.forEach((line, i) => ctx.fillText(line, cx, 226 + i * 21));
    ctx.font = `500 12px ${BODY_FONT}`;
    ctx.fillStyle = theme.text.accent;
    ctx.fillText(`— ${snap.quote.author}`, cx, 226 + lines.length * 21 + 8);
  }
}

/* ----------------------------- primitives ----------------------------- */

function drawBackground(ctx: Ctx, theme: ThemeTokens, W: number, H: number): void {
  const { x0, y0, x1, y1 } = gradientLine(theme.background.angleDeg, W, H);
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, theme.background.stops[0]);
  g.addColorStop(0.5, theme.background.stops[1]);
  g.addColorStop(1, theme.background.stops[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Blurred "spheres": radial gradients fading to transparent
  for (const glow of theme.background.glows) {
    const gx = glow.position === 'top-left' ? 40 : W - 40;
    const gy = glow.position === 'top-left' ? 20 : H - 20;
    const radius = 240;
    const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
    rg.addColorStop(0, withAlpha(glow.color, glow.alpha * 2));
    rg.addColorStop(1, withAlpha(glow.color, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawCard(ctx: Ctx, theme: ThemeTokens, W: number, H: number): void {
  const x = CARD_INSET;
  const y = CARD_INSET;
  const w = W - CARD_INSET * 2;
  const h = H - CARD_INSET * 2;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, CARD_RADIUS);
  ctx.fillStyle = withAlpha(theme.card.fill.color, theme.card.fill.alpha);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(theme.card.border.color, theme.card.border.alpha);
  ctx.stroke();
}

/** Start/end points of a CSS-style linear gradient with the given angle over a w x h box. */
export function gradientLine(angleDeg: number, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
}

/** "#RRGGBB" + alpha -> "rgba(r, g, b, a)". */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.min(1, Math.max(0, alpha))})`;
}

function textFill(ctx: Ctx, colors: string[], x: number, width: number): string | CanvasGradient {
  if (colors.length === 1) return colors[0];
  const g = ctx.createLinearGradient(x, 0, x + width, 0);
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
  return g;
}

/** Largest font size (<= max) whose text fits within maxWidth. */
function fitFontSize(ctx: Ctx, text: string, fontFor: (size: number) => string, max: number, maxWidth: number): number {
  let size = max;
  while (size > 12) {
    ctx.font = fontFor(size);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

export function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function setLetterSpacing(ctx: Ctx, value: string): void {
  if ('letterSpacing' in ctx) {
    (ctx as Ctx & { letterSpacing: string }).letterSpacing = value;
  }
}

function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out.trimEnd() + '…';
}

/** Greedy word wrap into at most `maxLines` lines; the last line is ellipsized if the text is longer. */
export function wrapText(ctx: Ctx, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const candidate = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines - 1) {
      line = [line, ...words.slice(i + 1)].join(' ');
      break;
    }
  }
  if (line) lines.push(ellipsize(ctx, line, maxWidth));
  return lines.slice(0, maxLines);
}
