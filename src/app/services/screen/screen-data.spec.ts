import {
  buildWeek, findNextAlarm, formatDuration, formatHms, resolveCountdown, zonedTime
} from './screen-data';

describe('screen-data', () => {
  describe('buildWeek', () => {
    const now = new Date(2026, 0, 15, 10, 0, 0); // Thursday

    it('returns 7 days ending today, oldest first, with missing days as 0', () => {
      const week = buildWeek({ '2026-01-15': { minutes: 50 }, '2026-01-12': { minutes: 25 } }, now, 'en-US');
      expect(week.map(d => d.date)).toEqual([
        '2026-01-09', '2026-01-10', '2026-01-11', '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15'
      ]);
      expect(week.map(d => d.minutes)).toEqual([0, 0, 0, 25, 0, 0, 50]);
      expect(week[6].isToday).toBeTrue();
      expect(week.filter(d => d.isToday).length).toBe(1);
      expect(week.map(d => d.label)).toEqual(['FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU']);
    });

    it('uses localised, three-letter weekday labels', () => {
      const labels = buildWeek({}, now, 'pt-PT').map(d => d.label);
      expect(labels.every(l => l.length <= 3 && l === l.toUpperCase())).toBeTrue();
      expect(labels[6]).toBe('QUI');
    });

    it('crosses month and year boundaries', () => {
      const week = buildWeek({}, new Date(2026, 0, 2), 'en-US');
      expect(week[0].date).toBe('2025-12-27');
      expect(week[6].date).toBe('2026-01-02');
    });
  });

  describe('findNextAlarm', () => {
    const now = new Date(2026, 0, 15, 10, 0, 0); // Thursday 10:00
    const alarm = (time: string, days: number[] = [], enabled = true, label = time) => ({ label, time, days, enabled });

    it('returns null without enabled alarms', () => {
      expect(findNextAlarm([], now)).toBeNull();
      expect(findNextAlarm([alarm('11:00', [], false)], now)).toBeNull();
    });

    it('picks the soonest and reports minutes and day offset', () => {
      const next = findNextAlarm([alarm('18:00'), alarm('10:30'), alarm('07:00')], now)!;
      expect(next.label).toBe('10:30');
      expect(next.minutesUntil).toBe(30);
      expect(next.dayOffset).toBe(0);
    });

    it('rolls a time that already passed to tomorrow', () => {
      const next = findNextAlarm([alarm('07:00')], now)!;
      expect(next.dayOffset).toBe(1);
      expect(next.minutesUntil).toBe(21 * 60);
    });

    it('treats the current minute as already ringing, not upcoming', () => {
      const next = findNextAlarm([alarm('10:00')], new Date(2026, 0, 15, 10, 0, 20))!;
      expect(next.dayOffset).toBe(1);
    });

    it('respects the weekdays (0 = Sunday)', () => {
      const monday = findNextAlarm([alarm('07:00', [1])], now)!; // Thursday -> Monday
      expect(monday.dayOffset).toBe(4);
      expect(monday.at.getDay()).toBe(1);
    });

    it('finds the same weekday next week when today already passed', () => {
      const next = findNextAlarm([alarm('07:00', [4])], now)!; // Thursdays only, 07:00 passed
      expect(next.dayOffset).toBe(7);
    });

    it('ignores malformed times', () => {
      expect(findNextAlarm([alarm('25:00'), alarm('abc')], now)).toBeNull();
    });
  });

  describe('resolveCountdown', () => {
    const now = new Date(2026, 0, 15, 10, 0, 0);

    it('is null when inactive or invalid', () => {
      expect(resolveCountdown({ title: 'x', targetDateTime: '18:00', active: false }, now)).toBeNull();
      expect(resolveCountdown({ title: 'x', targetDateTime: 'nope', active: true }, now)).toBeNull();
    });

    it('counts down to the next HH:MM, rolling over midnight', () => {
      expect(resolveCountdown({ title: 'Standup', targetDateTime: '10:30', active: true }, now))
        .toEqual({ title: 'Standup', remainingSec: 1800 });
      expect(resolveCountdown({ title: 'x', targetDateTime: '09:00', active: true }, now)!.remainingSec).toBe(23 * 3600);
    });

    it('accepts an ISO date-time and drops it once over', () => {
      expect(resolveCountdown({ title: 'x', targetDateTime: '2026-01-15T12:00:00', active: true }, now)!.remainingSec).toBe(7200);
      expect(resolveCountdown({ title: 'x', targetDateTime: '2026-01-15T09:00:00', active: true }, now)).toBeNull();
    });
  });

  describe('zonedTime', () => {
    it('gives the wall-clock time of a zone and the day offset', () => {
      const instant = new Date(Date.UTC(2026, 0, 15, 23, 30)); // 23:30 UTC
      const tokyo = zonedTime(instant, 'Asia/Tokyo')!; // UTC+9 -> 08:30 next day (in UTC terms)
      expect(tokyo.hours).toBe(8);
      expect(tokyo.minutes).toBe(30);
      const utc = zonedTime(instant, 'UTC')!;
      expect(utc.hours).toBe(23);
      expect(utc.minutes).toBe(30);
      expect(tokyo.dayOffset - utc.dayOffset).toBe(1);
    });

    it('never returns hour 24 at midnight', () => {
      const midnightUtc = new Date(Date.UTC(2026, 0, 15, 0, 5));
      expect(zonedTime(midnightUtc, 'UTC')!.hours).toBe(0);
    });

    it('returns null for an unknown zone', () => {
      expect(zonedTime(new Date(), 'Not/AZone')).toBeNull();
    });
  });

  it('formats durations and countdowns', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(75)).toBe('1h 15m');
    expect(formatDuration(9 * 60 + 5)).toBe('9h 05m');
    expect(formatDuration(2 * 1440 + 3 * 60 + 10)).toBe('2d 3h');
    expect(formatHms(65)).toBe('01:05');
    expect(formatHms(3725)).toBe('1:02:05');
    expect(formatHms(-4)).toBe('00:00');
  });
});
