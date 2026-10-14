import { DisplaySnapshot, ScreenView } from './display-snapshot';
import {
  FONT_TOKENS, FontTokens, ThemeTokens, THEME_TOKENS, fontShorthand
} from './theme-tokens';
import { formatDuration, formatHms } from './screen-data';

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
    case 'week':
      drawWeekView(ctx, snap, theme, W);
      break;
    case 'alarm':
      drawAlarmView(ctx, snap, theme, W);
      break;
    case 'world':
      drawWorldView(ctx, snap, theme, W);
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
  const baseline = 190;
  drawTimeWithSuffix(ctx, theme, font, snap.clock.hhmm, snap.clock.ampm, cx, baseline, 360, 128);

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

function drawWeekView(ctx: Ctx, snap: DisplaySnapshot, theme: ThemeTokens, W: number): void {
  const cx = W / 2;
  const { week, labels } = snap;

  setLetterSpacing(ctx, '3px');
  ctx.fillStyle = theme.text.accent;
  ctx.font = `600 15px ${BODY_FONT}`;
  ctx.fillText(labels.last7Days, cx, 58);
  setLetterSpacing(ctx, '0px');

  const days = week.days.slice(-7);
  const barW = 36;
  const gap = 18;
  const totalW = days.length * barW + Math.max(0, days.length - 1) * gap;
  const x0 = cx - totalW / 2;
  const baseline = 228;
  const maxBarH = 118;
  const scaleMax = Math.max(60, ...days.map(d => d.minutes));

  days.forEach((day, i) => {
    const x = x0 + i * (barW + gap);
    const h = day.minutes > 0 ? Math.max(5, Math.round((day.minutes / scaleMax) * maxBarH)) : 0;

    if (h === 0) {
      ctx.fillStyle = withAlpha(theme.text.muted, 0.3);
      ctx.fillRect(x, baseline - 2, barW, 2);
    } else {
      ctx.fillStyle = day.isToday ? theme.text.accent : withAlpha(theme.text.muted, 0.55);
      roundRect(ctx, x, baseline - h, barW, h, 5);
      ctx.fill();

      ctx.font = `${day.isToday ? 700 : 500} 12px ${BODY_FONT}`;
      ctx.fillStyle = day.isToday ? theme.text.accent : theme.text.muted;
      ctx.fillText(String(day.minutes), x + barW / 2, baseline - h - 7);
    }

    setLetterSpacing(ctx, '1px');
    ctx.font = `${day.isToday ? 700 : 500} 13px ${BODY_FONT}`;
    ctx.fillStyle = day.isToday ? theme.text.accent : theme.text.muted;
    ctx.fillText(day.label, x + barW / 2, baseline + 24);
    setLetterSpacing(ctx, '0px');
  });

  setLetterSpacing(ctx, '1px');
  ctx.fillStyle = theme.text.muted;
  ctx.font = `500 14px ${BODY_FONT}`;
  ctx.fillText(`${week.streak} ${labels.streak}  ·  ${formatDuration(week.totalMin)}`, cx, 284);
  setLetterSpacing(ctx, '0px');
}

function drawAlarmView(ctx: Ctx, snap: DisplaySnapshot, theme: ThemeTokens, W: number): void {
  const { alarm, countdown, labels } = snap;
  if (!alarm && !countdown) {
    drawClockView(ctx, snap, theme, W);
    return;
  }
  const font = FONT_TOKENS[snap.fontId];
  const both = !!alarm && !!countdown;
  const centers = both ? [150, 330] : [W / 2];
  const maxWidth = both ? 150 : 340;
  const size = both ? 56 : 104;
  const captionY = both ? 82 : 70;
  const valueY = both ? 152 : 170;
  const subY = both ? 184 : 208;

  const blocks: { caption: string; value: string; suffix: string; sub: string; detail: string }[] = [];
  if (alarm) {
    blocks.push({
      caption: labels.nextAlarm,
      value: alarm.hhmm,
      suffix: alarm.ampm,
      sub: alarm.label,
      detail: `${alarm.whenLabel}  ·  ${labels.inWord} ${formatDuration(alarm.minutesUntil)}`
    });
  }
  if (countdown) {
    blocks.push({
      caption: labels.countdown,
      value: formatHms(countdown.remainingSec),
      suffix: '',
      sub: countdown.title,
      detail: ''
    });
  }

  blocks.forEach((b, i) => {
    const cx = centers[i];
    setLetterSpacing(ctx, '3px');
    ctx.fillStyle = theme.text.accent;
    ctx.font = `600 ${both ? 12 : 15}px ${BODY_FONT}`;
    ctx.fillText(ellipsize(ctx, b.caption, maxWidth + 20), cx, captionY);
    setLetterSpacing(ctx, '0px');

    drawTimeWithSuffix(ctx, theme, font, b.value, b.suffix, cx, valueY, maxWidth, size, both ? 16 : 22);

    ctx.fillStyle = strongText(theme);
    ctx.font = `600 ${both ? 17 : 21}px ${BODY_FONT}`;
    ctx.fillText(ellipsize(ctx, b.sub, maxWidth + 20), cx, subY);

    if (b.detail) {
      ctx.fillStyle = theme.text.muted;
      ctx.font = `500 ${both ? 13 : 16}px ${BODY_FONT}`;
      ctx.fillText(ellipsize(ctx, b.detail, maxWidth + 20), cx, subY + (both ? 24 : 30));
    }
  });

  if (both) {
    ctx.fillStyle = withAlpha(theme.text.muted, 0.3);
    ctx.fillRect(W / 2, 62, 1, 196);
  }
}

function drawWorldView(ctx: Ctx, snap: DisplaySnapshot, theme: ThemeTokens, W: number): void {
  const clocks = snap.worldClocks.slice(0, 3);
  if (clocks.length === 0) {
    drawClockView(ctx, snap, theme, W);
    return;
  }
  const cx = W / 2;
  const font = FONT_TOKENS[snap.fontId];

  setLetterSpacing(ctx, '3px');
  ctx.fillStyle = theme.text.accent;
  ctx.font = `600 15px ${BODY_FONT}`;
  ctx.fillText(snap.labels.worldClocks, cx, 58);
  setLetterSpacing(ctx, '0px');

  const left = 64;
  const right = W - 64;
  const pitch = 66;
  const top0 = 76 + ((3 - clocks.length) * pitch) / 2;

  clocks.forEach((clock, i) => {
    const top = top0 + i * pitch;
    if (i > 0) {
      ctx.fillStyle = withAlpha(theme.text.muted, 0.2);
      ctx.fillRect(left, top, right - left, 1);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = strongText(theme);
    ctx.font = `600 22px ${BODY_FONT}`;
    ctx.fillText(ellipsize(ctx, clock.label, 190), left, top + 31);

    const day = clock.dayOffset === 0 ? '' : `  ·  ${clock.dayOffset > 0 ? '+' : ''}${clock.dayOffset}d`;
    ctx.fillStyle = theme.text.muted;
    ctx.font = `500 13px ${BODY_FONT}`;
    setLetterSpacing(ctx, '1px');
    ctx.fillText(`${clock.utc}${day}`, left, top + 52);
    setLetterSpacing(ctx, '0px');

    ctx.textAlign = 'center';
    drawTimeWithSuffix(ctx, theme, font, clock.hhmm, clock.ampm, right, top + 48, 190, 46, 15, 'right');
  });
}

/* ----------------------------- primitives ----------------------------- */

/** Time text with an optional small suffix (AM/PM), fitted to maxWidth and filled with the theme gradient. */
function drawTimeWithSuffix(
  ctx: Ctx, theme: ThemeTokens, font: FontTokens, text: string, suffix: string,
  anchorX: number, baseline: number, maxWidth: number, maxSize: number,
  suffixPx = 22, anchor: 'center' | 'right' = 'center'
): void {
  const suffixFont = `600 ${suffixPx}px ${BODY_FONT}`;
  ctx.font = suffixFont;
  const suffixWidth = suffix ? ctx.measureText(suffix).width + 10 : 0;
  const size = fitFontSize(ctx, text, s => fontShorthand(font, s), maxSize, maxWidth - suffixWidth);
  ctx.font = fontShorthand(font, size);
  const textWidth = ctx.measureText(text).width;
  const total = textWidth + suffixWidth;
  const startX = anchor === 'right' ? anchorX - total : anchorX - total / 2;

  ctx.textAlign = 'left';
  ctx.fillStyle = textFill(ctx, theme.text.primary, startX, textWidth);
  ctx.fillText(text, startX, baseline);
  if (suffix) {
    ctx.font = suffixFont;
    ctx.fillStyle = theme.text.accent;
    ctx.fillText(suffix, startX + textWidth + 10, baseline);
  }
  ctx.textAlign = 'center';
}

/** High-contrast text colour for labels that must stand out on the card. */
function strongText(theme: ThemeTokens): string {
  return theme.isLight ? theme.text.primary[0] : '#FFFFFF';
}

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
