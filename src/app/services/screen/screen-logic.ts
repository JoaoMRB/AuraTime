import { ALL_SCREEN_VIEWS, DisplaySnapshot, ScreenLabels, ScreenTask, ScreenView, ScreenViewMode } from './display-snapshot';

/** How long each view stays on screen while rotating automatically. */
export const VIEW_ROTATION_SECONDS = 20;

/** Which views have something to show right now. Clock and focus always do. */
export function viewHasContent(snap: DisplaySnapshot): Record<ScreenView, boolean> {
  return {
    clock: true,
    focus: true,
    week: snap.week.totalMin > 0,
    alarm: !!snap.alarm || !!snap.countdown,
    world: snap.worldClocks.length > 0,
    weather: !!snap.weather
  };
}

/** Shortest and longest time one view may stay on screen during the automatic rotation. */
export const MIN_VIEW_SECONDS = 10;
export const MAX_VIEW_SECONDS = 60;

export type ViewDurations = Record<ScreenView, number>;

export const DEFAULT_VIEW_DURATIONS: ViewDurations = {
  clock: VIEW_ROTATION_SECONDS, focus: VIEW_ROTATION_SECONDS, week: VIEW_ROTATION_SECONDS,
  alarm: VIEW_ROTATION_SECONDS, world: VIEW_ROTATION_SECONDS, weather: VIEW_ROTATION_SECONDS
};

export function clampViewSeconds(value: number): number {
  return Math.min(MAX_VIEW_SECONDS, Math.max(MIN_VIEW_SECONDS, Math.round(value)));
}

export interface ViewInputs {
  mode: ScreenViewMode;
  /** True while a Pomodoro is running: the focus view stays pinned. */
  focusRunning: boolean;
  /** Views the user allows in the automatic rotation. */
  enabled: readonly ScreenView[];
  hasContent: Record<ScreenView, boolean>;
  nowMs: number;
  /** Rotation order (default: ALL_SCREEN_VIEWS). */
  order?: readonly ScreenView[];
  /** Seconds each view stays on screen (default: 20 for all). */
  durations?: Partial<Record<ScreenView, number>>;
  /** Shifts the rotation clock; the previous/next buttons use it to jump to another view. */
  offsetSec?: number;
}

export interface RotationInfo {
  view: ScreenView;
  /** True while the view is chosen by the rotation (not pinned, not forced by a running Pomodoro). */
  rotating: boolean;
  /** Seconds the view has been on screen, and how long it stays (0 when not rotating). */
  elapsedSec: number;
  durationSec: number;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The views taking part in the rotation right now, in order, and how long each one stays. */
function rotationViews(input: ViewInputs): { views: ScreenView[]; seconds: (v: ScreenView) => number } {
  const order = input.order ?? ALL_SCREEN_VIEWS;
  const views = order.filter(v => input.enabled.includes(v) && input.hasContent[v]);
  const seconds = (v: ScreenView) => clampViewSeconds(input.durations?.[v] ?? VIEW_ROTATION_SECONDS);
  return { views, seconds };
}

/**
 * Rotation offset (seconds) that makes `view` appear `elapsedSec` seconds into its slot at the time of
 * `input.nowMs`. Used to jump to the previous or next view and to resume a paused rotation where it stopped.
 */
export function offsetToShow(input: ViewInputs, view: ScreenView, elapsedSec = 0): number {
  const { views, seconds } = rotationViews({ ...input, offsetSec: 0 });
  const index = views.indexOf(view);
  if (index < 0) return input.offsetSec ?? 0;
  const total = views.reduce((n, v) => n + seconds(v), 0);
  const start = views.slice(0, index).reduce((n, v) => n + seconds(v), 0);
  return mod(start + elapsedSec - Math.floor(input.nowMs / 1000), total);
}

/**
 * Chooses the view for the current second. A fixed mode wins (falling back to the clock when it has
 * nothing to show); otherwise rotate through the enabled views that have content, pinning Focus
 * during a Pomodoro.
 */
export function pickView(input: ViewInputs): ScreenView {
  return rotationInfo(input).view;
}

/** Same choice as pickView, plus where in its slot the rotation currently is (for the progress bar). */
export function rotationInfo(input: ViewInputs): RotationInfo {
  const fixed = (view: ScreenView): RotationInfo => ({ view, rotating: false, elapsedSec: 0, durationSec: 0 });
  if (input.mode !== 'auto') return fixed(input.hasContent[input.mode] ? input.mode : 'clock');
  if (input.focusRunning && input.enabled.includes('focus')) return fixed('focus');

  const { views, seconds } = rotationViews(input);
  if (views.length === 0) return fixed('clock');
  const total = views.reduce((n, v) => n + seconds(v), 0);
  let t = mod(Math.floor(input.nowMs / 1000) + (input.offsetSec ?? 0), total);
  for (const view of views) {
    if (t < seconds(view)) return { view, rotating: views.length > 1, elapsedSec: t, durationSec: seconds(view) };
    t -= seconds(view);
  }
  return fixed('clock'); // unreachable: t is always inside the cycle
}

/**
 * "Today's 3": the active task first (if unfinished), then the next unfinished tasks in list order.
 */
export function selectTodayTasks(
  tasks: { id: string; text: string; completed: boolean }[],
  activeTaskId: string | null,
  limit = 3
): ScreenTask[] {
  const open = tasks.filter(t => !t.completed);
  const active = open.find(t => t.id === activeTaskId);
  const ordered = active ? [active, ...open.filter(t => t !== active)] : open;
  return ordered.slice(0, limit).map(t => ({ text: t.text, done: false, active: t.id === activeTaskId }));
}

/** Small deterministic offset that changes every minute, so static pixels move (anti burn-in). */
export function pixelShift(date: Date): { x: number; y: number } {
  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  return {
    x: Math.round(Math.sin(minuteOfDay * 0.7) * 6),
    y: Math.round(Math.cos(minuteOfDay * 0.5) * 5)
  };
}

export interface BrightnessConfig {
  /** Daytime backlight, 0..100. */
  base: number;
  nightEnabled: boolean;
  /** Hour (0..23) at which the night schedule starts. */
  nightFromHour: number;
  /** Hour (0..23) at which it ends. */
  nightToHour: number;
  /** Backlight during the night, 0..100. */
  nightLevel: number;
  /** Night shows a fully black frame (and backlight 0) instead of a dimmed UI. */
  nightBlack: boolean;
}

export const DEFAULT_BRIGHTNESS_CONFIG: BrightnessConfig = {
  base: 60,
  nightEnabled: true,
  nightFromHour: 23,
  nightToHour: 7,
  nightLevel: 10,
  nightBlack: false
};

export function isNight(date: Date, cfg: Pick<BrightnessConfig, 'nightFromHour' | 'nightToHour'>): boolean {
  const h = date.getHours();
  if (cfg.nightFromHour === cfg.nightToHour) return false;
  return cfg.nightFromHour > cfg.nightToHour
    ? h >= cfg.nightFromHour || h < cfg.nightToHour // window crosses midnight
    : h >= cfg.nightFromHour && h < cfg.nightToHour;
}

export function effectiveBrightness(date: Date, cfg: BrightnessConfig): { level: number; black: boolean } {
  if (cfg.nightEnabled && isNight(date, cfg)) {
    return cfg.nightBlack ? { level: 0, black: true } : { level: cfg.nightLevel, black: false };
  }
  return { level: cfg.base, black: false };
}

const LOCALES: Record<string, string> = {
  en: 'en-US',
  pt: 'pt-PT',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT'
};

export function localeForLang(lang: string): string {
  return Object.hasOwn(LOCALES, lang) ? LOCALES[lang] : 'en-US';
}

/** Looks a text up by its translation key (e.g. 'SCREEN.LABELS.FOCUS'). */
export type TextLookup = (path: string) => string;

/** Builds the texts the display draws from the app's translations, so the screen follows the app language. */
export function buildLabels(t: TextLookup): ScreenLabels {
  const l = (key: string) => t(`SCREEN.LABELS.${key}`);
  const w = (key: string) => t(`SCREEN.WEATHER.${key}`);
  const d = (key: string) => t(`SCREEN.DEMO.${key}`);
  return {
    focus: l('FOCUS'), break: l('BREAK'), paused: l('PAUSED'), ready: l('READY'), noTasks: l('NO_TASKS'),
    today: l('TODAY'), streak: l('STREAK'), minutes: l('MINUTES'), last7Days: l('LAST7'),
    nextAlarm: l('NEXT_ALARM'), countdown: l('COUNTDOWN'), worldClocks: l('WORLD_CLOCKS'),
    dayToday: l('DAY_TODAY'), dayTomorrow: l('DAY_TOMORROW'), inWord: l('IN'),
    weather: {
      sunny: w('SUNNY'), 'clear-night': w('CLEAR_NIGHT'), cloudy: w('CLOUDY'),
      rainy: w('RAINY'), snowy: w('SNOWY'), stormy: w('STORMY')
    },
    demo: {
      task1: d('TASK_1'), task2: d('TASK_2'), task3: d('TASK_3'),
      alarm: d('ALARM'), countdown: d('COUNTDOWN'), city: d('CITY')
    }
  };
}
