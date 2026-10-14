import {
  DEFAULT_BRIGHTNESS_CONFIG, effectiveBrightness, isNight, labelsFor, localeForLang,
  pickView, pixelShift, selectTodayTasks, VIEW_ROTATION_SECONDS
} from './screen-logic';

describe('screen-logic', () => {
  describe('pickView', () => {
    const base = { mode: 'auto' as const, focusRunning: false, hasWeather: true, nowMs: 0 };

    it('rotates clock -> focus -> weather every 20 s', () => {
      const at = (slot: number) => pickView({ ...base, nowMs: slot * VIEW_ROTATION_SECONDS * 1000 + 500 });
      expect([at(0), at(1), at(2), at(3)]).toEqual(['clock', 'focus', 'weather', 'clock']);
    });

    it('skips weather when there is no weather data', () => {
      const at = (slot: number) => pickView({ ...base, hasWeather: false, nowMs: slot * 20_000 });
      expect([at(0), at(1), at(2)]).toEqual(['clock', 'focus', 'clock']);
    });

    it('pins focus while a pomodoro is running', () => {
      for (let slot = 0; slot < 4; slot++) {
        expect(pickView({ ...base, focusRunning: true, nowMs: slot * 20_000 })).toBe('focus');
      }
    });

    it('honours a fixed view, falling back to clock for weather without data', () => {
      expect(pickView({ ...base, mode: 'clock', focusRunning: true })).toBe('clock');
      expect(pickView({ ...base, mode: 'weather' })).toBe('weather');
      expect(pickView({ ...base, mode: 'weather', hasWeather: false })).toBe('clock');
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
