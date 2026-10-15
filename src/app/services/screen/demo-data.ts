import { DisplaySnapshot, ScreenLabels } from './display-snapshot';
import { formatClock } from './clock-format';
import { buildWeek, formatUtcOffset, zoneOffsetMinutes, zonedTime } from './screen-data';
import { FontId, ThemeId } from './theme-tokens';

/** Time zones used by the sample "world clocks" (display names are city names, left untranslated). */
const DEMO_ZONES = [
  { label: 'New York', timeZone: 'America/New_York' },
  { label: 'London', timeZone: 'Europe/London' },
  { label: 'Tokyo', timeZone: 'Asia/Tokyo' }
];

const DEMO_WEEK_MINUTES = [25, 50, 0, 75, 100, 50, 75];
const DEMO_COUNTDOWN_SECONDS = 25 * 60;

/**
 * Fills the gaps of a snapshot with sample data so every view has something to show.
 * Real data always wins: a part is only replaced when it is empty. Used by the demo mode of
 * /screen (no display connected) and by the animated mock-up on the landing page.
 */
export function fillDemoData(snap: DisplaySnapshot): DisplaySnapshot {
  const { labels, now } = snap;
  const next: DisplaySnapshot = { ...snap };

  if (snap.focus.tasks.length === 0) {
    next.focus = {
      ...snap.focus,
      tasks: [
        { text: labels.demo.task1, done: false, active: true },
        { text: labels.demo.task2, done: false, active: false },
        { text: labels.demo.task3, done: false, active: false }
      ]
    };
  }

  if (snap.week.totalMin === 0) {
    // keep the real weekday labels; build a generic week only if the snapshot has none
    const baseDays = snap.week.days.length === 7
      ? snap.week.days
      : buildWeek({}, now, 'en-US').map(d => ({ label: d.label, minutes: 0, isToday: d.isToday }));
    const days = baseDays.map((d, i) => ({ ...d, minutes: DEMO_WEEK_MINUTES[i % DEMO_WEEK_MINUTES.length] }));
    next.week = {
      days,
      totalMin: days.reduce((sum, d) => sum + d.minutes, 0),
      streak: snap.week.streak || 3
    };
  }

  if (!snap.alarm) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 30, 0, 0);
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
    const shown = formatClock(at, { use24h: snap.clock.use24h, showSeconds: false });
    const sameDay = at.getDate() === now.getDate();
    next.alarm = {
      label: labels.demo.alarm,
      hhmm: `${shown.hours}:${shown.minutes}`,
      ampm: shown.ampm.trim(),
      minutesUntil: Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 60000)),
      whenLabel: sameDay ? labels.dayToday : labels.dayTomorrow
    };
  }

  if (!snap.countdown) {
    // counts down and restarts, so the sample visibly moves
    const elapsed = Math.floor(now.getTime() / 1000) % DEMO_COUNTDOWN_SECONDS;
    next.countdown = { title: labels.demo.countdown, remainingSec: DEMO_COUNTDOWN_SECONDS - elapsed };
  }

  if (snap.worldClocks.length === 0) {
    next.worldClocks = DEMO_ZONES.flatMap(zone => {
      const zoned = zonedTime(now, zone.timeZone);
      if (!zoned) return [];
      const shown = formatClock(new Date(2000, 0, 1, zoned.hours, zoned.minutes), {
        use24h: snap.clock.use24h,
        showSeconds: false
      });
      return [{
        label: zone.label,
        hhmm: `${shown.hours}:${shown.minutes}`,
        ampm: shown.ampm.trim(),
        dayOffset: zoned.dayOffset,
        utc: `UTC${formatUtcOffset(zoneOffsetMinutes(now, zone.timeZone))}`
      }];
    });
  }

  if (!snap.weather) {
    next.weather = {
      tempC: 22,
      condition: 'sunny',
      description: labels.weather['sunny'] ?? '',
      icon: '☀️',
      city: labels.demo.city
    };
  }

  if (snap.stats.todayMin === 0 && snap.stats.streak === 0) {
    next.stats = { todayMin: 75, streak: 3 };
  }

  return next;
}

export interface BaseSnapshotOptions {
  now: Date;
  theme: ThemeId;
  fontId: FontId;
  labels: ScreenLabels;
  /** BCP 47 locale for the date and the weekday labels. */
  locale: string;
  use24h: boolean;
  /** Show a Pomodoro in progress in the focus view. */
  focusRunning?: boolean;
}

/** An empty snapshot (nothing of the user's), ready to be filled by fillDemoData. */
export function createBaseSnapshot(o: BaseSnapshotOptions): DisplaySnapshot {
  const { now } = o;
  const clock = formatClock(now, { use24h: o.use24h, showSeconds: false });
  const week = buildWeek({}, now, o.locale);
  const totalSec = 25 * 60;
  const elapsed = Math.floor(now.getTime() / 1000) % totalSec;

  return {
    now,
    theme: o.theme,
    fontId: o.fontId,
    clock: {
      hhmm: `${clock.hours}:${clock.minutes}`,
      seconds: now.getSeconds(),
      ampm: clock.ampm.trim(),
      dateLabel: now.toLocaleDateString(o.locale, { weekday: 'long', day: 'numeric', month: 'long' }),
      use24h: o.use24h
    },
    focus: {
      phase: o.focusRunning ? 'work' : 'idle',
      remainingSec: o.focusRunning ? totalSec - elapsed : totalSec,
      totalSec,
      tasks: []
    },
    week: { days: week.map(d => ({ label: d.label, minutes: 0, isToday: d.isToday })), totalMin: 0, streak: 0 },
    worldClocks: [],
    quote: { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
    stats: { todayMin: 0, streak: 0 },
    labels: o.labels
  };
}
