import { Injectable, signal, effect, inject, untracked, PLATFORM_ID, DestroyRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FONT_TOKENS } from './screen/theme-tokens';
import { isFiniteNumber, isRecord, parseJson, readStorage, writeStorage } from './safe-storage';

export interface ClockSettings {
  theme: string;
  position: string;
  angle: number;
  scale: number;
  font: string;
  showSeconds: boolean;
  showDate: boolean;
  militaryTime: boolean;
  mode: string; // 'clock' | 'pomodoro' | 'worldclock' | 'stopwatch' | 'timer' | 'alarm'
  sound: string; // 'none' | 'tick' | 'rain'
}

const STORAGE_KEY = 'auratime_settings';

const DEFAULT_SETTINGS: ClockSettings = {
  theme: 'emerald-gold', // The premium default
  position: 'center',
  angle: 0,
  scale: 1.0,
  font: 'outfit',
  showSeconds: true,
  showDate: true,
  militaryTime: false,
  mode: 'clock',
  sound: 'none'
};

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof ClockSettings)[];
const POSITIONS = ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
const MODES = ['clock', 'pomodoro', 'worldclock', 'stopwatch', 'timer', 'alarm'];
const SOUNDS = ['none', 'tick', 'rain'];

/** Previous factory default tilt; migrate stored values to 0° */
const LEGACY_DEFAULT_ANGLE = -4;

/**
 * Keeps only the fields of a stored settings object that are valid, and drops the rest (a damaged value must
 * not break the page, and must not replace a good one). Unknown themes are kept as text: the theme resolver
 * maps them to a real theme, and an old alias such as "frosted-glass" has to survive.
 */
export function sanitizeSettings(raw: unknown): Partial<ClockSettings> {
  if (!isRecord(raw)) return {};
  const out: Partial<ClockSettings> = {};
  const oneOf = (value: unknown, allowed: string[]) => typeof value === 'string' && allowed.includes(value);

  if (typeof raw['theme'] === 'string' && raw['theme'].length > 0 && raw['theme'].length <= 40) out.theme = raw['theme'];
  if (oneOf(raw['position'], POSITIONS)) out.position = raw['position'] as string;
  if (isFiniteNumber(raw['angle'])) {
    const angle = raw['angle'] === LEGACY_DEFAULT_ANGLE ? DEFAULT_SETTINGS.angle : raw['angle'];
    out.angle = Math.min(180, Math.max(-180, angle));
  }
  if (isFiniteNumber(raw['scale'])) out.scale = Math.min(2, Math.max(0.5, raw['scale']));
  if (typeof raw['font'] === 'string' && Object.hasOwn(FONT_TOKENS, raw['font'])) out.font = raw['font'];
  for (const key of ['showSeconds', 'showDate', 'militaryTime'] as const) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean;
  }
  if (oneOf(raw['mode'], MODES)) out.mode = raw['mode'] as string;
  if (oneOf(raw['sound'], SOUNDS)) out.sound = raw['sound'] as string;
  return out;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private destroyRef = inject(DestroyRef);

  // Settings Signals
  theme = signal<string>(DEFAULT_SETTINGS.theme);
  position = signal<string>(DEFAULT_SETTINGS.position);
  angle = signal<number>(DEFAULT_SETTINGS.angle);
  scale = signal<number>(DEFAULT_SETTINGS.scale);
  font = signal<string>(DEFAULT_SETTINGS.font);
  showSeconds = signal<boolean>(DEFAULT_SETTINGS.showSeconds);
  showDate = signal<boolean>(DEFAULT_SETTINGS.showDate);
  militaryTime = signal<boolean>(DEFAULT_SETTINGS.militaryTime);
  mode = signal<string>(DEFAULT_SETTINGS.mode);
  sound = signal<string>(DEFAULT_SETTINGS.sound);

  /**
   * What this window knows to be in storage (loaded, applied from another window, or written by us).
   * Only fields that differ from it are saved: a window must never re-save another window's `mode` or
   * `sound`, which it deliberately does not follow.
   */
  private known: Partial<ClockSettings> = {};

  constructor() {
    if (this.isBrowser) {
      this.loadSettings();

      effect(() => {
        const current = this.snapshot();
        untracked(() => this.saveChanges(current));
      });
    }
  }

  private snapshot(): ClockSettings {
    return {
      theme: this.theme(),
      position: this.position(),
      angle: this.angle(),
      scale: this.scale(),
      font: this.font(),
      showSeconds: this.showSeconds(),
      showDate: this.showDate(),
      militaryTime: this.militaryTime(),
      mode: this.mode(),
      sound: this.sound()
    };
  }

  /** Writes only what changed in this window, on top of whatever is in storage now. */
  private saveChanges(current: ClockSettings): void {
    const changed: Partial<ClockSettings> = {};
    for (const key of SETTING_KEYS) {
      if (current[key] !== this.known[key]) (changed as Record<string, unknown>)[key] = current[key];
    }
    if (Object.keys(changed).length === 0) return;

    const stored = parseJson(readStorage(STORAGE_KEY));
    const base = isRecord(stored) ? stored : {};
    if (writeStorage(STORAGE_KEY, JSON.stringify({ ...base, ...changed }))) {
      Object.assign(this.known, changed);
    }
  }

  private loadSettings() {
    this.applyRaw(readStorage(STORAGE_KEY));

    // Keep several open tabs/windows (app + /screen) in sync
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) this.applyRaw(event.newValue, true);
    };
    window.addEventListener('storage', onStorage);
    this.destroyRef.onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  /**
   * Applies stored settings. When `fromOtherTab` is true, `mode` and `sound` are skipped:
   * they drive per-tab side effects (audio, active panel) that must not leak between windows.
   */
  private applyRaw(data: string | null, fromOtherTab = false) {
    const parsed = sanitizeSettings(parseJson(data));
    const apply = <K extends keyof ClockSettings>(key: K, target: { set(v: ClockSettings[K]): void }) => {
      const value = parsed[key];
      if (value === undefined) return;
      target.set(value as ClockSettings[K]);
      this.known[key] = value; // already in storage: not ours to write back
    };
    apply('theme', this.theme);
    apply('position', this.position);
    apply('angle', this.angle);
    apply('scale', this.scale);
    apply('font', this.font);
    apply('showSeconds', this.showSeconds);
    apply('showDate', this.showDate);
    apply('militaryTime', this.militaryTime);
    if (!fromOtherTab) {
      apply('mode', this.mode);
      apply('sound', this.sound);
    }
  }

  resetToDefault() {
    this.theme.set(DEFAULT_SETTINGS.theme);
    this.position.set(DEFAULT_SETTINGS.position);
    this.angle.set(DEFAULT_SETTINGS.angle);
    this.scale.set(DEFAULT_SETTINGS.scale);
    this.font.set(DEFAULT_SETTINGS.font);
    this.showSeconds.set(DEFAULT_SETTINGS.showSeconds);
    this.showDate.set(DEFAULT_SETTINGS.showDate);
    this.militaryTime.set(DEFAULT_SETTINGS.militaryTime);
    this.mode.set(DEFAULT_SETTINGS.mode);
    this.sound.set(DEFAULT_SETTINGS.sound);
  }
}
