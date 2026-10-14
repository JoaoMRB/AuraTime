/**
 * Pure helpers that turn app data (analytics, alarms, countdown, world clocks) into what the
 * screen views show. No Angular, no I/O: everything is testable with plain dates.
 */

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Short upper-case weekday, e.g. "MON" / "SEG". */
export function weekdayLabel(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { weekday: 'short' }).replace(/[.,]/g, '').slice(0, 3).toUpperCase();
}

export interface WeekDay {
  label: string;
  date: string;
  minutes: number;
  isToday: boolean;
}

/** The last 7 days, oldest first, ending today. Days without a record count as 0. */
export function buildWeek(records: Record<string, { minutes: number }>, now: Date, locale: string): WeekDay[] {
  const days: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dateKey(d);
    days.push({ label: weekdayLabel(d, locale), date: key, minutes: records[key]?.minutes ?? 0, isToday: i === 0 });
  }
  return days;
}

export interface AlarmLike {
  label: string;
  /** "HH:MM" (24h). */
  time: string;
  /** 0..6 (Sunday..Saturday). Empty = one-time: the next occurrence of `time`. */
  days: number[];
  enabled: boolean;
}

export interface NextAlarm {
  label: string;
  at: Date;
  minutesUntil: number;
  /** Calendar days from today (0 = today, 1 = tomorrow...). */
  dayOffset: number;
}

/** The enabled alarm that rings soonest after `now`, looking up to a week ahead. */
export function findNextAlarm(alarms: AlarmLike[], now: Date): NextAlarm | null {
  let best: NextAlarm | null = null;
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    const match = /^(\d{1,2}):(\d{2})$/.exec(alarm.time);
    if (!match) continue;
    const hours = +match[1];
    const minutes = +match[2];
    if (hours > 23 || minutes > 59) continue;

    for (let offset = 0; offset <= 7; offset++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hours, minutes, 0, 0);
      if (at.getTime() <= now.getTime()) continue;
      if (alarm.days.length > 0 && !alarm.days.includes(at.getDay())) continue;
      if (!best || at.getTime() < best.at.getTime()) {
        best = {
          label: alarm.label,
          at,
          minutesUntil: Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 60000)),
          dayOffset: offset
        };
      }
      break; // the first matching day is this alarm's next occurrence
    }
  }
  return best;
}

export interface CountdownLike {
  title: string;
  /** "HH:MM" (next occurrence) or an ISO date-time. */
  targetDateTime: string;
  active: boolean;
}

export interface ResolvedCountdown {
  title: string;
  remainingSec: number;
}

/** Remaining time of an active countdown, or null when inactive, invalid or already over. */
export function resolveCountdown(cd: CountdownLike, now: Date): ResolvedCountdown | null {
  if (!cd.active) return null;

  let target: Date;
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(cd.targetDateTime);
  if (hhmm) {
    target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +hhmm[1], +hhmm[2], 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  } else {
    target = new Date(cd.targetDateTime);
  }
  if (Number.isNaN(target.getTime())) return null;

  const remainingSec = Math.floor((target.getTime() - now.getTime()) / 1000);
  return remainingSec > 0 ? { title: cd.title, remainingSec } : null;
}

export interface ZonedTime {
  hours: number;
  minutes: number;
  /** Calendar days relative to the local date: -1 yesterday, 0 same day, +1 tomorrow. */
  dayOffset: number;
}

/** Wall-clock time in an IANA time zone, or null for an unknown zone. */
export function zonedTime(date: Date, timeZone: string): ZonedTime | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    }).formatToParts(date);
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? 'NaN', 10);
    const [y, m, d, h, min] = [get('year'), get('month'), get('day'), get('hour'), get('minute')];
    if ([y, m, d, h, min].some(Number.isNaN)) return null;

    const zonedDay = Date.UTC(y, m - 1, d);
    const localDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return { hours: h % 24, minutes: min, dayOffset: Math.round((zonedDay - localDay) / 86400000) };
  } catch {
    return null;
  }
}

/** "12m", "9h 12m", "2d 3h". */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

/** "MM:SS" under an hour, "H:MM:SS" above. */
export function formatHms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
