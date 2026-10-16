import type { TaskItem } from './task.service';
import type { Alarm } from './alarm.service';
import type { QuickLink, CountdownTarget } from './dashboard.service';
import type { WorldClock } from './world-clock.service';
import type { TimerPreset } from './timer.service';
import type { FocusDayRecord } from './analytics.service';
import { isFiniteNumber, isRecord } from './safe-storage';

/**
 * Checks for everything the app reads back from localStorage or receives in a `storage` event. Any other
 * window, an older version of the app or the user (devtools) can have written anything there, so each
 * entry is validated on its own: a valid one is kept, a broken one is dropped, and one broken entry never
 * takes the good ones, or the page, down with it.
 */

const str = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const nonEmpty = (value: unknown, max: number): value is string => str(value, max) && value.length > 0;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Keeps the entries that pass `check` (which returns the cleaned entry or null). Null if `list` is not an array. */
function entries<T>(list: unknown, check: (entry: unknown) => T | null, max = 1000): T[] | null {
  if (!Array.isArray(list)) return null;
  const out: T[] = [];
  for (const entry of list.slice(0, max)) {
    const ok = check(entry);
    if (ok) out.push(ok);
  }
  return out;
}

/** Entries must have distinct ids: the lists are tracked and edited by id. */
function uniqueById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter(item => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/**
 * True when validation lost something: the value was unusable (`clean` is null) or entries were dropped.
 * `rawList` is the list as it was stored.
 */
export function lostEntries(rawList: unknown, clean: unknown[] | null): boolean {
  return clean === null || (Array.isArray(rawList) && rawList.length !== clean.length);
}

/* -------------------------------- tasks -------------------------------- */

export function sanitizeTasks(raw: unknown): { tasks: TaskItem[]; activeTaskId: string | null } | null {
  if (!isRecord(raw)) return null;
  const tasks = entries<TaskItem>(raw['tasks'], e => {
    if (!isRecord(e) || !nonEmpty(e['id'], 100) || !str(e['text'], 2000)) return null;
    return {
      id: e['id'],
      text: e['text'],
      completed: e['completed'] === true,
      pomodoros: isFiniteNumber(e['pomodoros']) && e['pomodoros'] >= 0 ? Math.floor(e['pomodoros']) : 0,
      createdAt: isFiniteNumber(e['createdAt']) ? e['createdAt'] : 0
    };
  });
  if (!tasks) return null;
  const unique = uniqueById(tasks);
  const active = raw['activeTaskId'];
  return { tasks: unique, activeTaskId: typeof active === 'string' && unique.some(t => t.id === active) ? active : null };
}

/* ------------------------------- analytics ------------------------------ */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeAnalytics(raw: unknown): {
  dailyRecords?: Record<string, FocusDayRecord>;
  currentStreak?: number;
  bestStreak?: number;
} {
  if (!isRecord(raw)) return {};
  const out: ReturnType<typeof sanitizeAnalytics> = {};
  if (isRecord(raw['dailyRecords'])) {
    const records: Record<string, FocusDayRecord> = {};
    for (const [key, value] of Object.entries(raw['dailyRecords'])) {
      if (!DATE_KEY.test(key) || !isRecord(value)) continue;
      const minutes = value['minutes'];
      const pomodoros = value['pomodoros'];
      if (!isFiniteNumber(minutes) || minutes < 0 || !isFiniteNumber(pomodoros) || pomodoros < 0) continue;
      records[key] = { date: key, minutes, pomodoros: Math.floor(pomodoros) };
    }
    out.dailyRecords = records;
  }
  for (const key of ['currentStreak', 'bestStreak'] as const) {
    const v = raw[key];
    if (isFiniteNumber(v) && v >= 0) out[key] = Math.floor(v);
  }
  return out;
}

/* --------------------------------- alarms -------------------------------- */

const ALARM_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ALARM_SOUNDS = ['chime', 'bell', 'digital'] as const;

export function sanitizeAlarms(raw: unknown): Alarm[] | null {
  const list = entries<Alarm>(raw, e => {
    if (!isRecord(e) || !nonEmpty(e['id'], 100) || typeof e['time'] !== 'string' || !ALARM_TIME.test(e['time'])) return null;
    const days = Array.isArray(e['days'])
      ? [...new Set(e['days'].filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))]
      : [];
    const sound = ALARM_SOUNDS.find(s => s === e['sound']) ?? 'chime';
    return {
      id: e['id'],
      label: str(e['label'], 200) ? e['label'] : '',
      time: e['time'],
      days,
      enabled: e['enabled'] === true,
      snoozeMinutes: isFiniteNumber(e['snoozeMinutes']) ? clamp(Math.round(e['snoozeMinutes']), 1, 120) : 5,
      sound
    };
  }, 200);
  return list ? uniqueById(list) : null;
}

/* -------------------------------- dashboard ------------------------------- */

/** Only web links: a stored "javascript:" or "data:" address must never become a clickable link. */
export function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeLinks(raw: unknown): QuickLink[] | null {
  const list = entries<QuickLink>(raw, e => {
    if (!isRecord(e) || !nonEmpty(e['id'], 100) || !str(e['title'], 200) || !isWebUrl(e['url'])) return null;
    return { id: e['id'], title: e['title'], url: e['url'], icon: str(e['icon'], 16) && e['icon'] ? e['icon'] : '🔗' };
  }, 200);
  return list ? uniqueById(list) : null;
}

export function sanitizeCountdown(raw: unknown): CountdownTarget | null {
  if (!isRecord(raw) || !str(raw['title'], 200) || !str(raw['targetDateTime'], 64)) return null;
  return { title: raw['title'], targetDateTime: raw['targetDateTime'], active: raw['active'] === true };
}

/* ------------------------------ world clocks ------------------------------ */

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function sanitizeWorldClocks(raw: unknown): WorldClock[] | null {
  const list = entries<WorldClock>(raw, e => {
    if (!isRecord(e) || !nonEmpty(e['id'], 100) || !nonEmpty(e['label'], 100) || !isTimeZone(e['timezone'])) return null;
    return {
      id: e['id'],
      label: e['label'],
      timezone: e['timezone'],
      offset: isFiniteNumber(e['offset']) ? clamp(e['offset'], -14, 14) : 0
    };
  }, 50);
  return list ? uniqueById(list) : null;
}

/* ------------------------------ timer presets ----------------------------- */

export function sanitizeTimerPresets(raw: unknown): TimerPreset[] | null {
  const list = entries<TimerPreset>(raw, e => {
    if (!isRecord(e) || !nonEmpty(e['id'], 100) || !str(e['label'], 100)) return null;
    const duration = e['duration'];
    if (!isFiniteNumber(duration) || duration <= 0 || duration > 24 * 60) return null;
    return { id: e['id'], label: e['label'], duration };
  }, 100);
  return list ? uniqueById(list) : null;
}

/* ------------------------------- soundscape ------------------------------- */

export function sanitizeSoundscape(raw: unknown): { masterVolume?: number; tracks?: { id: string; volume: number }[] } {
  if (!isRecord(raw)) return {};
  const out: ReturnType<typeof sanitizeSoundscape> = {};
  if (isFiniteNumber(raw['masterVolume'])) out.masterVolume = clamp(raw['masterVolume'], 0, 100);
  const tracks = entries<{ id: string; volume: number }>(raw['tracks'], e => {
    if (!isRecord(e) || !nonEmpty(e['id'], 50) || !isFiniteNumber(e['volume'])) return null;
    return { id: e['id'], volume: clamp(e['volume'], 0, 100) };
  }, 50);
  if (tracks) out.tracks = tracks;
  return out;
}
