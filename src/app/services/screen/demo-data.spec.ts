import { createBaseSnapshot, fillDemoData } from './demo-data';
import { DisplaySnapshot } from './display-snapshot';
import { viewHasContent } from './screen-logic';
import { englishLabels } from './testing/english-labels';
import { zoneOffsetMinutes, formatUtcOffset } from './screen-data';

describe('demo data', () => {
  const NOW = new Date(2026, 0, 15, 21, 5, 33);
  const empty = (over: Partial<Parameters<typeof createBaseSnapshot>[0]> = {}) =>
    createBaseSnapshot({
      now: NOW, theme: 'emerald-gold', fontId: 'outfit', labels: englishLabels(), locale: 'en-US', use24h: true, ...over
    });

  it('an empty snapshot has nothing but the clock and the focus view', () => {
    const content = viewHasContent(empty());
    expect(content).toEqual({ clock: true, focus: true, week: false, alarm: false, world: false, weather: false });
  });

  it('fills every view with sample data', () => {
    const filled = fillDemoData(empty());
    expect(Object.values(viewHasContent(filled)).every(Boolean)).toBeTrue();
  });

  it('uses the app texts for the samples (task, alarm, countdown, city)', () => {
    const filled = fillDemoData(empty());
    expect(filled.focus.tasks.map(t => t.text)).toEqual([
      'Write the weekly report', 'Review the open pull requests', 'Plan tomorrow'
    ]);
    expect(filled.focus.tasks[0].active).toBeTrue();
    expect(filled.alarm!.label).toBe('Morning run');
    expect(filled.countdown!.title).toBe('Team meeting');
    expect(filled.weather!.city).toBe('Lisbon');
    expect(filled.weather!.description).toBe('Clear sky');
  });

  it('builds a plausible week with today highlighted', () => {
    const { week } = fillDemoData(empty());
    expect(week.days.length).toBe(7);
    expect(week.days.filter(d => d.isToday).length).toBe(1);
    expect(week.totalMin).toBe(week.days.reduce((s, d) => s + d.minutes, 0));
    expect(week.totalMin).toBeGreaterThan(0);
    expect(week.streak).toBe(3);
  });

  it('sets the sample alarm at 07:30, today or tomorrow, in the clock format of the app', () => {
    const tomorrow = fillDemoData(empty()).alarm!;
    expect(tomorrow.hhmm).toBe('07:30');
    expect(tomorrow.whenLabel).toBe('Tomorrow');
    expect(tomorrow.minutesUntil).toBe(10 * 60 + 24 + 27 / 60 > 0 ? Math.ceil((10 * 3600 + 24 * 60 + 27) / 60) : 0);

    const today = fillDemoData(empty({ now: new Date(2026, 0, 15, 6, 0, 0) })).alarm!;
    expect(today.whenLabel).toBe('Today');
    expect(today.minutesUntil).toBe(90);

    const twelve = fillDemoData(empty({ use24h: false })).alarm!;
    expect(twelve.hhmm).toBe('07:30');
    expect(twelve.ampm).toBe('AM');
  });

  it('makes the sample countdown move and restart', () => {
    const at = (s: number) => fillDemoData(empty({ now: new Date(2026, 0, 15, 12, 0, s) })).countdown!.remainingSec;
    expect(at(1) - at(2)).toBe(1);
    for (let s = 0; s < 60; s += 7) {
      const value = at(s);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(25 * 60);
    }
  });

  it('lists 3 world clocks with UTC offsets', () => {
    const { worldClocks } = fillDemoData(empty());
    expect(worldClocks.map(c => c.label)).toEqual(['New York', 'London', 'Tokyo']);
    expect(worldClocks.every(c => /^UTC[+-]\d/.test(c.utc))).toBeTrue();
    expect(worldClocks[2].utc).toBe('UTC+9');
  });

  it('never replaces real data', () => {
    const real: DisplaySnapshot = {
      ...empty(),
      focus: { phase: 'work', remainingSec: 100, totalSec: 1500, tasks: [{ text: 'Mine', done: false, active: true }] },
      week: { days: empty().week.days.map(d => ({ ...d, minutes: 10 })), totalMin: 70, streak: 5 },
      alarm: { label: 'Real alarm', hhmm: '06:00', ampm: '', minutesUntil: 5, whenLabel: 'Today' },
      countdown: { title: 'Real countdown', remainingSec: 77 },
      worldClocks: [{ label: 'Oslo', hhmm: '10:00', ampm: '', dayOffset: 0, utc: 'UTC+1' }],
      weather: { tempC: 3, condition: 'snowy', description: 'Snow', icon: '❄️', city: 'Oslo' },
      stats: { todayMin: 20, streak: 5 }
    };
    const out = fillDemoData(real);
    expect(out.focus.tasks[0].text).toBe('Mine');
    expect(out.focus.phase).toBe('work');
    expect(out.week.streak).toBe(5);
    expect(out.alarm!.label).toBe('Real alarm');
    expect(out.countdown!.remainingSec).toBe(77);
    expect(out.worldClocks.map(c => c.label)).toEqual(['Oslo']);
    expect(out.weather!.city).toBe('Oslo');
    expect(out.stats).toEqual({ todayMin: 20, streak: 5 });
  });

  it('does not modify the snapshot it receives', () => {
    const base = empty();
    const copy = JSON.stringify(base);
    fillDemoData(base);
    expect(JSON.stringify(base)).toBe(copy);
  });

  it('can show a Pomodoro in progress for the marketing mock-up', () => {
    const running = empty({ focusRunning: true }).focus;
    expect(running.phase).toBe('work');
    expect(running.remainingSec).toBeLessThanOrEqual(running.totalSec);
    expect(empty().focus.phase).toBe('idle');
  });

  describe('time zone helpers', () => {
    it('computes UTC offsets in minutes and formats them', () => {
      const winter = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
      const summer = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
      expect(zoneOffsetMinutes(winter, 'UTC')).toBe(0);
      expect(zoneOffsetMinutes(winter, 'Asia/Tokyo')).toBe(540);
      expect(zoneOffsetMinutes(winter, 'America/New_York')).toBe(-300);
      expect(zoneOffsetMinutes(summer, 'America/New_York')).toBe(-240); // daylight saving
      expect(zoneOffsetMinutes(winter, 'Asia/Kolkata')).toBe(330);
      expect(zoneOffsetMinutes(winter, 'Not/AZone')).toBe(0);
      expect(formatUtcOffset(540)).toBe('+9');
      expect(formatUtcOffset(-300)).toBe('-5');
      expect(formatUtcOffset(330)).toBe('+5:30');
      expect(formatUtcOffset(0)).toBe('+0');
    });
  });
});
