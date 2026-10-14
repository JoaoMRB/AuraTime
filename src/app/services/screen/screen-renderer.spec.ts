import { DisplaySnapshot, ScreenView } from './display-snapshot';
import { drawScreen, formatMmSs, gradientLine, withAlpha, wrapText } from './screen-renderer';
import { THEME_IDS, ThemeId } from './theme-tokens';
import { labelsFor } from './screen-logic';

function snapshot(overrides: Partial<DisplaySnapshot> = {}): DisplaySnapshot {
  return {
    now: new Date(2026, 0, 15, 21, 5, 33),
    theme: 'emerald-gold',
    fontId: 'outfit',
    clock: { hhmm: '21:05', seconds: 33, ampm: '', dateLabel: 'Thursday, January 15', use24h: true },
    focus: {
      phase: 'work',
      remainingSec: 1100,
      totalSec: 1500,
      tasks: [
        { text: 'Write the report', done: false, active: true },
        { text: 'Review the pull request that is way too long to fit on one single line of the screen', done: false, active: false }
      ]
    },
    weather: { tempC: 18, condition: 'sunny', description: 'Clear sky', icon: '☀️', city: 'Lisbon' },
    quote: { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
    stats: { todayMin: 75, streak: 3 },
    week: {
      days: [
        { label: 'FRI', minutes: 0, isToday: false }, { label: 'SAT', minutes: 25, isToday: false },
        { label: 'SUN', minutes: 0, isToday: false }, { label: 'MON', minutes: 75, isToday: false },
        { label: 'TUE', minutes: 50, isToday: false }, { label: 'WED', minutes: 100, isToday: false },
        { label: 'THU', minutes: 75, isToday: true }
      ],
      totalMin: 325,
      streak: 3
    },
    alarm: { label: 'Wake up', hhmm: '07:30', ampm: '', minutesUntil: 553, whenLabel: 'Tomorrow' },
    countdown: { title: 'Release', remainingSec: 3725 },
    worldClocks: [
      { label: 'New York', hhmm: '16:05', ampm: '', dayOffset: 0, utc: 'UTC-5' },
      { label: 'London', hhmm: '21:05', ampm: '', dayOffset: 0, utc: 'UTC+0' },
      { label: 'Tokyo', hhmm: '06:05', ampm: '', dayOffset: 1, utc: 'UTC+9' }
    ],
    labels: labelsFor('en'),
    ...overrides
  };
}

function render(snap: DisplaySnapshot, view: ScreenView, opts = {}): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 320;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  drawScreen(ctx, snap, view, opts);
  return ctx.getImageData(0, 0, 480, 320).data;
}

function differs(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
  return false;
}

function distinctColors(data: Uint8ClampedArray): number {
  const seen = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (seen.size > 50) break;
  }
  return seen.size;
}

describe('screen-renderer', () => {
  const views: ScreenView[] = ['clock', 'focus', 'weather'];

  it('draws something non-trivial for every theme and view', () => {
    for (const theme of THEME_IDS as readonly ThemeId[]) {
      for (const view of views) {
        const data = render(snapshot({ theme }), view);
        expect(distinctColors(data)).withContext(`${theme}/${view}`).toBeGreaterThan(10);
      }
    }
  });

  it('paints an all-black frame in night-black mode', () => {
    const data = render(snapshot(), 'clock', { black: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) {
        fail(`non-black pixel at ${i / 4}`);
        return;
      }
    }
    expect(true).toBeTrue();
  });

  it('looks different per theme and per view', () => {
    const a = render(snapshot({ theme: 'emerald-gold' }), 'clock');
    const b = render(snapshot({ theme: 'light-glass' }), 'clock');
    expect(differs(a, b)).toBeTrue();
    expect(differs(render(snapshot(), 'clock'), render(snapshot(), 'focus'))).toBeTrue();
    expect(differs(render(snapshot(), 'focus'), render(snapshot(), 'weather'))).toBeTrue();
  });

  it('is deterministic for the same snapshot', () => {
    expect(differs(render(snapshot(), 'clock'), render(snapshot(), 'clock'))).toBeFalse();
  });

  it('moves the seconds line, and only changes a small area between seconds', () => {
    const a = render(snapshot(), 'clock');
    const b = render(snapshot({ clock: { ...snapshot().clock, seconds: 34 } }), 'clock');
    expect(differs(a, b)).toBeTrue();
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) changed++;
    expect(changed).toBeLessThan(500); // a thin line, not a full redraw
  });

  it('reflects remaining time and tasks in the focus view', () => {
    const base = render(snapshot(), 'focus');
    const later = render(snapshot({ focus: { ...snapshot().focus, remainingSec: 600 } }), 'focus');
    const noTasks = render(snapshot({ focus: { ...snapshot().focus, tasks: [] } }), 'focus');
    expect(differs(base, later)).toBeTrue();
    expect(differs(base, noTasks)).toBeTrue();
  });

  it('falls back to the clock when the weather view has no data', () => {
    const noWeather = render(snapshot({ weather: undefined }), 'weather');
    expect(differs(noWeather, render(snapshot({ weather: undefined }), 'clock'))).toBeFalse();
  });

  it('shifts the content (anti burn-in) but not the background corners', () => {
    const a = render(snapshot(), 'clock');
    const b = render(snapshot(), 'clock', { shift: { x: 6, y: -5 } });
    expect(differs(a, b)).toBeTrue();
    // Top-left corner pixel (outside the card) is unchanged
    expect([a[0], a[1], a[2]]).toEqual([b[0], b[1], b[2]]);
  });

  describe('helpers', () => {
    it('formats mm:ss and clamps negatives', () => {
      expect(formatMmSs(1500)).toBe('25:00');
      expect(formatMmSs(65)).toBe('01:05');
      expect(formatMmSs(-3)).toBe('00:00');
    });

    it('converts hex + alpha to rgba and clamps alpha', () => {
      expect(withAlpha('#D4AF37', 0.25)).toBe('rgba(212, 175, 55, 0.25)');
      expect(withAlpha('#000000', 2)).toBe('rgba(0, 0, 0, 1)');
    });

    it('builds CSS-like gradient lines', () => {
      const down = gradientLine(180, 100, 50);
      expect(down.x0).toBeCloseTo(50);
      expect(down.x1).toBeCloseTo(50);
      expect(down.y0).toBeLessThan(down.y1);
      const diagonal = gradientLine(135, 100, 100); // to bottom right
      expect(diagonal.x0).toBeLessThan(diagonal.x1);
      expect(diagonal.y0).toBeLessThan(diagonal.y1);
    });

    it('wraps text into at most N lines, ellipsizing the overflow', () => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = '16px sans-serif';
      const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';
      const lines = wrapText(ctx, text, 150, 2);
      expect(lines.length).toBe(2);
      expect(lines[1].endsWith('…')).toBeTrue();
      for (const l of lines) expect(ctx.measureText(l).width).toBeLessThanOrEqual(150);
      expect(wrapText(ctx, 'short', 150, 2)).toEqual(['short']);
    });
  });
});
