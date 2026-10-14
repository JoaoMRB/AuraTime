import { FontId, ThemeId } from './theme-tokens';

/** Views the screen can show. 'system' (PC stats) arrives with the hardware monitor. */
export type ScreenView = 'clock' | 'focus' | 'weather';

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
  weather?: { tempC: number; condition: string; description: string; icon: string; city: string };
  quote?: { text: string; author: string };
  stats: { todayMin: number; streak: number };
  labels: ScreenLabels;
  /** Phase 2: LibreHardwareMonitor data. */
  pc?: { cpuTemp: number; cpuLoad: number; gpuTemp: number; gpuLoad: number; ramPct: number };
}
