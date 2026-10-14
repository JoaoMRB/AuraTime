import { FontId, ThemeId } from './theme-tokens';

/** Views the screen can show, in rotation order. */
export const ALL_SCREEN_VIEWS = ['clock', 'focus', 'week', 'alarm', 'world', 'weather'] as const;
export type ScreenView = (typeof ALL_SCREEN_VIEWS)[number];

/** What the user picked: a fixed view, or automatic rotation. */
export type ScreenViewMode = 'auto' | ScreenView;

export interface ScreenLabels {
  focus: string;
  break: string;
  paused: string;
  ready: string;
  noTasks: string;
  today: string;
  streak: string;
  minutes: string;
  last7Days: string;
  nextAlarm: string;
  countdown: string;
  worldClocks: string;
  dayToday: string;
  dayTomorrow: string;
  inWord: string;
  /** Weather description by WeatherService condition (sunny, cloudy, rainy, ...). */
  weather: Record<string, string>;
}

export interface ScreenTask {
  text: string;
  done: boolean;
  active: boolean;
}

/**
 * Everything any output (USB screen, PiP, ...) needs to draw one frame.
 * Built from the existing services by DisplayStateService; outputs never read the DOM.
 */
export interface DisplaySnapshot {
  now: Date;
  theme: ThemeId;
  fontId: FontId;
  clock: {
    /** "HH:MM" without AM/PM. */
    hhmm: string;
    seconds: number;
    /** '' in 24h mode, otherwise 'AM' | 'PM'. */
    ampm: string;
    dateLabel: string;
    use24h: boolean;
  };
  focus: {
    /** 'idle' when the Pomodoro is not running (paused or never started). */
    phase: 'work' | 'break' | 'idle';
    remainingSec: number;
    totalSec: number;
    /** "Today's 3": the active task first, then the next unfinished ones. */
    tasks: ScreenTask[];
  };
  /** Last 7 days of focus, oldest first. */
  week: {
    days: { label: string; minutes: number; isToday: boolean }[];
    totalMin: number;
    streak: number;
  };
  /** Next enabled alarm. */
  alarm?: { label: string; hhmm: string; ampm: string; minutesUntil: number; whenLabel: string };
  /** Active dashboard countdown. */
  countdown?: { title: string; remainingSec: number };
  /** Up to 3 world clocks. */
  worldClocks: { label: string; hhmm: string; ampm: string; dayOffset: number; utc: string }[];
  weather?: { tempC: number; condition: string; description: string; icon: string; city: string };
  quote?: { text: string; author: string };
  stats: { todayMin: number; streak: number };
  labels: ScreenLabels;
  /** Phase 2: LibreHardwareMonitor data. */
  pc?: { cpuTemp: number; cpuLoad: number; gpuTemp: number; gpuLoad: number; ramPct: number };
}
