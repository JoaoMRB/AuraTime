import { TestBed } from '@angular/core/testing';
import { SettingsService, sanitizeSettings } from './settings.service';

const KEY = 'auratime_settings';
const stored = () => JSON.parse(localStorage.getItem(KEY)!);

/** The other window writes (the browser only fires `storage` in the OTHER windows). */
function otherWindowSaves(value: Record<string, unknown>): void {
  const raw = JSON.stringify(value);
  localStorage.setItem(KEY, raw);
  window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: raw, storageArea: localStorage }));
}

describe('SettingsService: saving only what changed', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('writes the defaults the first time', () => {
    TestBed.inject(SettingsService);
    TestBed.flushEffects();
    expect(stored()).toEqual({
      theme: 'emerald-gold', position: 'center', angle: 0, scale: 1, font: 'outfit',
      showSeconds: true, showDate: true, militaryTime: false, mode: 'clock', sound: 'none'
    });
  });

  it("never re-saves another window's mode or sound when this window changes something else", () => {
    const settings = TestBed.inject(SettingsService);
    TestBed.flushEffects(); // this window: mode 'clock', sound 'none'

    // The clock window switches to the Pomodoro and turns the rain on; this window (/screen) does not follow.
    otherWindowSaves({ ...stored(), mode: 'pomodoro', sound: 'rain' });
    TestBed.flushEffects();
    expect(settings.mode()).toBe('clock');
    expect(settings.sound()).toBe('none');

    settings.theme.set('liquid-glass'); // this window changes only the theme
    TestBed.flushEffects();

    expect(stored().theme).toBe('liquid-glass');
    expect(stored().mode).toBe('pomodoro'); // untouched
    expect(stored().sound).toBe('rain'); // untouched
  });

  it("does not echo a value it just received from another window", () => {
    const settings = TestBed.inject(SettingsService);
    TestBed.flushEffects();
    const raw = JSON.stringify({ ...stored(), theme: 'dark-glass' });
    localStorage.setItem(KEY, raw); // the other window's write
    const setItem = spyOn(Storage.prototype, 'setItem').and.callThrough();
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: raw, storageArea: localStorage }));
    TestBed.flushEffects();
    expect(settings.theme()).toBe('dark-glass');
    expect(setItem).not.toHaveBeenCalled(); // nothing written back by this window
  });

  it('keeps fields it does not know about, written by a newer version of the app', () => {
    const settings = TestBed.inject(SettingsService);
    TestBed.flushEffects();
    otherWindowSaves({ ...stored(), futureField: 'keep me' });
    settings.scale.set(1.5);
    TestBed.flushEffects();
    expect(stored().futureField).toBe('keep me');
    expect(stored().scale).toBe(1.5);
  });

  it('two changes in a row are both saved', () => {
    const settings = TestBed.inject(SettingsService);
    TestBed.flushEffects();
    settings.font.set('orbitron');
    TestBed.flushEffects();
    settings.showSeconds.set(false);
    TestBed.flushEffects();
    expect(stored().font).toBe('orbitron');
    expect(stored().showSeconds).toBeFalse();
  });

  it('restores its own saved mode and sound after a reload', () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: 'timer', sound: 'tick', theme: 'light-glass' }));
    const settings = TestBed.inject(SettingsService);
    expect(settings.mode()).toBe('timer');
    expect(settings.sound()).toBe('tick');
    expect(settings.theme()).toBe('light-glass');
    TestBed.flushEffects();
    expect(stored().mode).toBe('timer'); // not rewritten with a default
  });

  it('survives a browser that refuses to store (quota, private window)', () => {
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
    const settings = TestBed.inject(SettingsService);
    expect(() => {
      settings.theme.set('dark-glass');
      TestBed.flushEffects();
    }).not.toThrow();
    expect(settings.theme()).toBe('dark-glass'); // the page still works
  });

  it('survives a browser where reading storage throws', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
    expect(() => TestBed.inject(SettingsService)).not.toThrow();
  });
});

describe('sanitizeSettings: a damaged value never gets in', () => {
  it('keeps valid fields', () => {
    const ok = { theme: 'dark-glass', position: 'top-left', angle: 10, scale: 1.2, font: 'inter', showSeconds: false, showDate: true, militaryTime: true, mode: 'timer', sound: 'rain' };
    expect(sanitizeSettings(ok)).toEqual(ok);
  });

  it('drops values of the wrong type or outside the allowed set', () => {
    expect(sanitizeSettings({
      theme: 42, position: 'middle', angle: 'steep', scale: NaN, font: 'comic-sans',
      showSeconds: 'yes', showDate: 1, militaryTime: null, mode: 'disco', sound: 'whale'
    })).toEqual({});
  });

  it('is not fooled by names that exist on every object', () => {
    for (const font of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(sanitizeSettings({ font })).withContext(font).toEqual({});
    }
  });

  it('clamps out-of-range numbers instead of trusting them', () => {
    expect(sanitizeSettings({ scale: 99 }).scale).toBe(2);
    expect(sanitizeSettings({ scale: 0 }).scale).toBe(0.5);
    expect(sanitizeSettings({ angle: 9999 }).angle).toBe(180);
  });

  it('keeps a legacy theme alias and migrates the old default tilt', () => {
    expect(sanitizeSettings({ theme: 'frosted-glass' }).theme).toBe('frosted-glass');
    expect(sanitizeSettings({ angle: -4 }).angle).toBe(0);
  });

  it('ignores things that are not objects', () => {
    for (const value of [null, undefined, 'text', 5, [], [1, 2]]) expect(sanitizeSettings(value)).toEqual({});
  });

  it('a partly damaged object keeps its good fields', () => {
    expect(sanitizeSettings({ theme: 'dark-glass', scale: 'big', mode: 'timer' })).toEqual({ theme: 'dark-glass', mode: 'timer' });
  });
});
