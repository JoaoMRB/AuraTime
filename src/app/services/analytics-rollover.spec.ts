import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from './analytics.service';
import { TickService } from './screen/tick.service';

describe('AnalyticsService: "today" rolls over at midnight', () => {
  let tick: { emit(): void };

  beforeEach(() => {
    localStorage.clear();
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 0, 15, 23, 59, 50));
    tick = TestBed.inject(TickService) as unknown as { emit(): void };
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  /** Moves the clock and lets the app notice (the shared tick, then the effects that follow the new day). */
  const at = (y: number, m: number, d: number, h = 0, min = 0, s = 5) => {
    jasmine.clock().mockDate(new Date(y, m, d, h, min, s));
    tick.emit();
    TestBed.flushEffects();
  };

  it("yesterday's focus stops being today's the moment the clock passes midnight", () => {
    const analytics = TestBed.inject(AnalyticsService);
    analytics.recordFocusSession(25);
    expect(analytics.todayKey()).toBe('2026-01-15');
    expect(analytics.todayStats().minutes).toBe(25);

    at(2026, 0, 16);
    expect(analytics.todayKey()).toBe('2026-01-16');
    expect(analytics.todayStats().minutes).toBe(0);
    expect(analytics.todayStats().pomodoros).toBe(0);
  });

  it('a session after midnight is counted on the new day', () => {
    const analytics = TestBed.inject(AnalyticsService);
    analytics.recordFocusSession(25);
    at(2026, 0, 16);
    analytics.recordFocusSession(50);
    expect(analytics.todayStats().minutes).toBe(50);
    expect(analytics.dailyRecords()['2026-01-15'].minutes).toBe(25);
    expect(analytics.currentStreak()).toBe(2);
  });

  it('the streak survives one idle day (yesterday still counts) and breaks after two, with no reload', () => {
    const analytics = TestBed.inject(AnalyticsService);
    analytics.recordFocusSession(25);
    expect(analytics.currentStreak()).toBe(1);

    at(2026, 0, 16);
    expect(analytics.currentStreak()).toBe(1); // you can still extend it today

    at(2026, 0, 17);
    expect(analytics.currentStreak()).toBe(0); // a whole day without focus: broken
    expect(analytics.bestStreak()).toBe(1); // the record stays
  });

  it('the 7-day chart moves along with the day', () => {
    const analytics = TestBed.inject(AnalyticsService);
    analytics.recordFocusSession(25);
    expect(analytics.weeklySummary()[6].date).toBe('2026-01-15');
    at(2026, 0, 16);
    const week = analytics.weeklySummary();
    expect(week[6].date).toBe('2026-01-16');
    expect(week[5].minutes).toBe(25);
  });

  it('can date a session to a past day', () => {
    const analytics = TestBed.inject(AnalyticsService);
    analytics.recordFocusSession(25, new Date(2026, 0, 12, 10, 0, 0));
    expect(analytics.dailyRecords()['2026-01-12'].minutes).toBe(25);
    expect(analytics.todayStats().minutes).toBe(0);
  });
});
