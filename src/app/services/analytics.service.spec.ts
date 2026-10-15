import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from './analytics.service';

function dateKey(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function seed(daysWithFocus: number[]): void {
  const dailyRecords: Record<string, unknown> = {};
  for (const ago of daysWithFocus) {
    const key = dateKey(ago);
    dailyRecords[key] = { date: key, minutes: 25, pomodoros: 1 };
  }
  localStorage.setItem('auratime_analytics', JSON.stringify({ dailyRecords, currentStreak: 0, bestStreak: 0 }));
}

describe('AnalyticsService (characterization)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('starts with an empty day and no streak', () => {
    const service = TestBed.inject(AnalyticsService);
    expect(service.todayStats().minutes).toBe(0);
    expect(service.currentStreak()).toBe(0);
  });

  it('records a focus session into today and starts a streak', () => {
    const service = TestBed.inject(AnalyticsService);
    service.recordFocusSession(25);
    service.recordFocusSession(25);
    expect(service.todayStats().minutes).toBe(50);
    expect(service.todayStats().pomodoros).toBe(2);
    expect(service.currentStreak()).toBe(1);
    expect(service.bestStreak()).toBe(1);
  });

  it('counts consecutive past days including today', () => {
    seed([1, 2]);
    const service = TestBed.inject(AnalyticsService);
    service.recordFocusSession(25);
    expect(service.currentStreak()).toBe(3);
  });

  it('keeps the streak alive when only yesterday had focus', () => {
    seed([1, 2]);
    const service = TestBed.inject(AnalyticsService);
    expect(service.currentStreak()).toBe(2);
  });

  it('breaks the streak after a gap day', () => {
    seed([2, 3]);
    const service = TestBed.inject(AnalyticsService);
    expect(service.currentStreak()).toBe(0);
  });

  it('weekly summary covers the last 7 days ending today', () => {
    seed([0, 3]);
    const service = TestBed.inject(AnalyticsService);
    const week = service.weeklySummary();
    expect(week.length).toBe(7);
    expect(week[6].date).toBe(dateKey(0));
    expect(week[6].minutes).toBe(25);
    expect(week[3].minutes).toBe(25);
  });
});
