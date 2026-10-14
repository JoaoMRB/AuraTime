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

export interface ViewInputs {
  mode: ScreenViewMode;
  /** True while a Pomodoro is running: the focus view stays pinned. */
  focusRunning: boolean;
  /** Views the user allows in the automatic rotation. */
  enabled: readonly ScreenView[];
  hasContent: Record<ScreenView, boolean>;
  nowMs: number;
}

/**
 * Chooses the view for the current second. A fixed mode wins (falling back to the clock when it has
 * nothing to show); otherwise rotate through the enabled views that have content, pinning Focus
 * during a Pomodoro.
 */
export function pickView(input: ViewInputs): ScreenView {
  if (input.mode !== 'auto') {
    return input.hasContent[input.mode] ? input.mode : 'clock';
  }
  if (input.focusRunning && input.enabled.includes('focus')) return 'focus';

  const views = ALL_SCREEN_VIEWS.filter(v => input.enabled.includes(v) && input.hasContent[v]);
  if (views.length === 0) return 'clock';
  const slot = Math.floor(input.nowMs / 1000 / VIEW_ROTATION_SECONDS);
  return views[slot % views.length];
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
  return LOCALES[lang] ?? 'en-US';
}

const LABELS: Record<'en' | 'pt', ScreenLabels> = {
  en: {
    focus: 'FOCUS', break: 'BREAK', paused: 'PAUSED', ready: 'READY',
    noTasks: 'No open tasks', today: 'TODAY', streak: 'DAY STREAK', minutes: 'min',
    last7Days: 'LAST 7 DAYS', nextAlarm: 'NEXT ALARM', countdown: 'COUNTDOWN', worldClocks: 'WORLD CLOCKS',
    dayToday: 'Today', dayTomorrow: 'Tomorrow', inWord: 'in'
  },
  pt: {
    focus: 'FOCO', break: 'PAUSA', paused: 'EM PAUSA', ready: 'PRONTO',
    noTasks: 'Sem tarefas abertas', today: 'HOJE', streak: 'DIAS SEGUIDOS', minutes: 'min',
    last7Days: 'ÚLTIMOS 7 DIAS', nextAlarm: 'PRÓXIMO ALARME', countdown: 'CONTAGEM DECRESCENTE',
    worldClocks: 'RELÓGIOS MUNDIAIS', dayToday: 'Hoje', dayTomorrow: 'Amanhã', inWord: 'em'
  }
};

export function labelsFor(lang: string): ScreenLabels {
  return lang === 'pt' ? LABELS.pt : LABELS.en;
}
