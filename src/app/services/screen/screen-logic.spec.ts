import {
  DEFAULT_BRIGHTNESS_CONFIG, effectiveBrightness, isNight, labelsFor, localeForLang,
  pickView, pixelShift, selectTodayTasks, viewHasContent, VIEW_ROTATION_SECONDS
} from './screen-logic';
import { ALL_SCREEN_VIEWS, DisplaySnapshot, ScreenView } from './display-snapshot';

describe('screen-logic', () => {
  describe('pickView', () => {
    const content = (on: ScreenView[]): Record<ScreenView, boolean> =>
      Object.fromEntries(
        ALL_SCREEN_VIEWS.map(v => [v, v === 'clock' || v === 'focus' || on.includes(v)])
      ) as Record<ScreenView, boolean>;

    const base = {
      mode: 'auto' as const,
      focusRunning: false,
      enabled: ALL_SCREEN_VIEWS as readonly ScreenView[],
      hasContent: content(['week', 'alarm', 'world', 'weather']),
      nowMs: 0
    };
    const seq = (input: Partial<typeof base>, slots = 8) =>
      Array.from({ length: slots }, (_, slot) =>
        pickView({ ...base, ...input, nowMs: slot * VIEW_ROTATION_SECONDS * 1000 + 500 }));

    it('rotates through every view with content, in a fixed order, every 20 s', () => {
      expect(seq({}, 7)).toEqual(['clock', 'focus', 'week', 'alarm', 'world', 'weather', 'clock']);
    });

    it('skips views without content', () => {
      expect(seq({ hasContent: content(['weather']) }, 4)).toEqual(['clock', 'focus', 'weather', 'clock']);
      expect(seq({ hasContent: content(['alarm', 'world']) }, 5)).toEqual(['clock', 'focus', 'alarm', 'world', 'clock']);
      expect(seq({ hasContent: content([]) }, 3)).toEqual(['clock', 'focus', 'clock']);
    });

    it('only rotates through the views the user enabled', () => {
      expect(seq({ enabled: ['clock', 'world'] }, 3)).toEqual(['clock', 'world', 'clock']);
      expect(seq({ enabled: ['week'] }, 2)).toEqual(['week', 'week']);
    });

    it('falls back to the clock when nothing is enabled or nothing has content', () => {
      expect(seq({ enabled: [] }, 2)).toEqual(['clock', 'clock']);
      expect(seq({ enabled: ['week'], hasContent: content([]) }, 2)).toEqual(['clock', 'clock']);
    });

    it('pins focus while a pomodoro is running, unless focus is not in the rotation', () => {
      expect(new Set(seq({ focusRunning: true }, 6))).toEqual(new Set(['focus']));
      expect(seq({ focusRunning: true, enabled: ['clock', 'week'] }, 2)).toEqual(['clock', 'week']);
    });

    it('honours a fixed view, falling back to the clock when it has no content', () => {
      expect(pickView({ ...base, mode: 'clock', focusRunning: true })).toBe('clock');
      expect(pickView({ ...base, mode: 'world' })).toBe('world');
      expect(pickView({ ...base, mode: 'world', hasContent: content([]) })).toBe('clock');
      expect(pickView({ ...base, mode: 'week', enabled: [] })).toBe('week'); // a fixed view ignores the rotation list
    });
  });

  describe('viewHasContent', () => {
    const snap = (over: Partial<DisplaySnapshot>) =>
      ({ week: { days: [], totalMin: 0, streak: 0 }, worldClocks: [], ...over }) as DisplaySnapshot;

    it('reports what each view can show', () => {
      expect(viewHasContent(snap({}))).toEqual({
        clock: true, focus: true, week: false, alarm: false, world: false, weather: false
      });
      const full = viewHasContent(snap({
        week: { days: [], totalMin: 30, streak: 1 },
        alarm: { label: 'a', hhmm: '07:00', ampm: '', minutesUntil: 5, whenLabel: 'Today' },
        worldClocks: [{ label: 'Tokyo', hhmm: '09:00', ampm: '', dayOffset: 0, utc: 'UTC+9' }],
        weather: { tempC: 1, condition: 'x', description: 'x', icon: 'x', city: 'x' }
      }));
      expect(Object.values(full).every(Boolean)).toBeTrue();
    });

    it('counts an active countdown as alarm-view content', () => {
      expect(viewHasContent(snap({ countdown: { title: 'x', remainingSec: 10 } })).alarm).toBeTrue();
    });
  });

  describe('selectTodayTasks', () => {
    const t = (id: string, completed = false) => ({ id, text: `task ${id}`, completed });

    it('puts the active task first, then the next unfinished ones in list order', () => {
      const out = selectTodayTasks([t('a'), t('b'), t('c'), t('d')], 'c');
      expect(out.map(x => x.text)).toEqual(['task c', 'task a', 'task b']);
      expect(out.map(x => x.active)).toEqual([true, false, false]);
    });

    it('skips completed tasks, including a completed active one', () => {
      const out = selectTodayTasks([t('a', true), t('b'), t('c')], 'a');
      expect(out.map(x => x.text)).toEqual(['task b', 'task c']);
      expect(out.every(x => !x.active)).toBeTrue();
    });

    it('returns an empty list when nothing is open', () => {
      expect(selectTodayTasks([], null)).toEqual([]);
      expect(selectTodayTasks([t('a', true)], 'a')).toEqual([]);
    });
  });

  describe('pixelShift', () => {
    it('is deterministic per minute, bounded and changes over time', () => {
      const a = pixelShift(new Date(2026, 0, 1, 10, 0));
      expect(pixelShift(new Date(2026, 0, 1, 10, 0, 59))).toEqual(a);
      const seen = new Set<string>();
      for (let m = 0; m < 120; m++) {
        const s = pixelShift(new Date(2026, 0, 1, 10, m % 60));
        expect(Math.abs(s.x)).toBeLessThanOrEqual(6);
        expect(Math.abs(s.y)).toBeLessThanOrEqual(5);
        seen.add(`${s.x},${s.y}`);
      }
      expect(seen.size).toBeGreaterThan(5);
    });
  });

  describe('night schedule', () => {
    const at = (h: number) => new Date(2026, 0, 1, h, 30);

    it('handles a window that crosses midnight (23h-7h)', () => {
      const cfg = DEFAULT_BRIGHTNESS_CONFIG;
      expect([22, 23, 0, 6, 7, 12].map(h => isNight(at(h), cfg))).toEqual([false, true, true, true, false, false]);
    });

    it('handles a same-day window', () => {
      const cfg = { nightFromHour: 1, nightToHour: 5 };
      expect([0, 1, 4, 5].map(h => isNight(at(h), cfg))).toEqual([false, true, true, false]);
    });

    it('uses base brightness by day and the night level at night', () => {
      expect(effectiveBrightness(at(12), DEFAULT_BRIGHTNESS_CONFIG)).toEqual({ level: 60, black: false });
      expect(effectiveBrightness(at(2), DEFAULT_BRIGHTNESS_CONFIG)).toEqual({ level: 10, black: false });
    });

    it('goes black at night when requested, and ignores the schedule when disabled', () => {
      expect(effectiveBrightness(at(2), { ...DEFAULT_BRIGHTNESS_CONFIG, nightBlack: true })).toEqual({ level: 0, black: true });
      expect(effectiveBrightness(at(2), { ...DEFAULT_BRIGHTNESS_CONFIG, nightEnabled: false })).toEqual({ level: 60, black: false });
    });
  });

  it('maps languages to locales and labels with an English fallback', () => {
    expect(localeForLang('pt')).toBe('pt-PT');
    expect(localeForLang('xx')).toBe('en-US');
    expect(labelsFor('pt').focus).toBe('FOCO');
    expect(labelsFor('de').focus).toBe('FOCUS');
  });
});
