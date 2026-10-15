import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PomodoroService } from './pomodoro.service';
import { TaskService } from './task.service';
import { AnalyticsService } from './analytics.service';
import { AudioService } from './audio.service';
import { LOCKS_API } from './web-locks';
import { FakeLockManager, flushLocks } from './testing/fake-locks';

const KEY = 'auratime_pomodoro';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** "Now" of the tests: 15 Jan 2026, 12:00 local time. */
const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime();

function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seedRunning(phase: 'work' | 'break', endTime: number, extra: Record<string, unknown> = {}): void {
  localStorage.setItem(KEY, JSON.stringify({
    phase, running: true, endTime, remainingSec: 60, workDuration: 25, breakDuration: 5, lastCompletedEnd: 0, ...extra
  }));
}

describe('PomodoroService: restoring after the app was closed', () => {
  let chimes: number;

  function setup(locks: FakeLockManager | null = null) {
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCKS_API, useValue: locks },
        { provide: AudioService, useValue: { initAudioContext: () => Promise.resolve(), playChimeSound: () => chimes++ } }
      ]
    });
    // services are created in this order, like the app does
    const analytics = TestBed.inject(AnalyticsService);
    const tasks = TestBed.inject(TaskService);
    const service = TestBed.inject(PomodoroService);
    return { service, analytics, tasks };
  }

  beforeEach(() => {
    chimes = 0;
    localStorage.clear();
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(NOW));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  it('credits the focus phase that ended while closed, to the day it ended, without a chime, and stops', () => {
    const endedAt = NOW - 3 * HOUR; // ended at 09:00 today
    seedRunning('work', endedAt);
    const { service, analytics } = setup();

    expect(analytics.dailyRecords()[dateKey(endedAt)]).toEqual({ date: dateKey(endedAt), minutes: 25, pomodoros: 1 });
    expect(chimes).toBe(0);
    expect(service.isRunning()).toBeFalse();
    expect(service.currentPhase()).toBe('break');
    expect(service.currentTime()).toBe('05:00');
  });

  it('after a long absence it still credits only the one phase that was in progress, on the day it ended', () => {
    const endedAt = NOW - 3 * DAY - 2 * HOUR; // the app was closed for three days
    seedRunning('work', endedAt);
    const { service, analytics } = setup();

    const records = Object.values(analytics.dailyRecords());
    expect(records.length).toBe(1);
    expect(records[0]).toEqual({ date: dateKey(endedAt), minutes: 25, pomodoros: 1 });
    expect(analytics.todayStats().minutes).toBe(0); // nothing is credited to today
    expect(service.isRunning()).toBeFalse();
    expect(service.sessionHistory().length).toBe(1);
  });

  it('does not credit the phase to the day the app was reopened when it ended before midnight', () => {
    const endedAt = new Date(2026, 0, 14, 23, 50, 0).getTime(); // yesterday, 23:50
    seedRunning('work', endedAt);
    const { analytics } = setup();
    expect(analytics.dailyRecords()['2026-01-14']?.pomodoros).toBe(1);
    expect(analytics.dailyRecords()['2026-01-15']).toBeUndefined();
  });

  it('credits the active task once', () => {
    seedRunning('work', NOW - HOUR);
    const { tasks } = setup();
    const active = tasks.getActiveTask()!;
    expect(active.pomodoros).toBe(1);
  });

  it('a break that ended while closed earns nothing, and the timer stops ready for the next focus phase', () => {
    seedRunning('break', NOW - 30 * MIN);
    const { service, analytics } = setup();
    expect(Object.keys(analytics.dailyRecords()).length).toBe(0);
    expect(service.isRunning()).toBeFalse();
    expect(service.currentPhase()).toBe('work');
    expect(service.currentTime()).toBe('25:00');
    expect(chimes).toBe(0);
  });

  it('a phase still in progress keeps running (and counting) after a reload', () => {
    seedRunning('work', NOW + 10 * MIN);
    const { service, analytics } = setup();
    expect(service.isRunning()).toBeTrue();
    expect(service.currentTime()).toBe('10:00');
    expect(Object.keys(analytics.dailyRecords()).length).toBe(0);
  });

  it('does not credit a phase another window already credited, and still stops', () => {
    const end = NOW - HOUR;
    seedRunning('work', end, { lastCompletedEnd: end });
    const { service, analytics } = setup();
    expect(Object.keys(analytics.dailyRecords()).length).toBe(0);
    expect(service.isRunning()).toBeFalse();
  });

  it('the restore is stored: reloading again does not credit it a second time', () => {
    seedRunning('work', NOW - HOUR);
    setup();
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.running).toBeFalse();
    expect(stored.lastCompletedEnd).toBe(NOW - HOUR);
  });

  it('works the same through the cross-window lock', async () => {
    seedRunning('work', NOW - 2 * HOUR);
    const locks = new FakeLockManager();
    const { service, analytics } = setup(locks);
    await flushLocks();
    expect(locks.requests).toContain('auratime-pomodoro-credit');
    expect(Object.values(analytics.dailyRecords())[0].pomodoros).toBe(1);
    expect(service.isRunning()).toBeFalse();
  });

  it('while the app stays open, a long gap is still caught up phase by phase (throttled tab)', () => {
    const { service, analytics } = setup();
    service.start();
    jasmine.clock().mockDate(new Date(NOW + 61 * MIN)); // 61 minutes without a single tick
    service.tick();
    expect(analytics.todayStats().pomodoros).toBe(2); // 25 + 5 + 25 + 5, then a minute into the next focus
    expect(service.isRunning()).toBeTrue();
    expect(service.currentPhase()).toBe('work');
  });
});

describe('PomodoroService: crediting a phase is atomic across windows', () => {
  let chimes: number;
  let locks: FakeLockManager;

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCKS_API, useValue: locks },
        { provide: AudioService, useValue: { initAudioContext: () => Promise.resolve(), playChimeSound: () => chimes++ } }
      ]
    });
    return {
      service: TestBed.inject(PomodoroService),
      analytics: TestBed.inject(AnalyticsService)
    };
  }

  beforeEach(() => {
    chimes = 0;
    locks = new FakeLockManager();
    localStorage.clear();
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(NOW));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  it('settles the end of a phase while holding the lock', async () => {
    const { service } = setup();
    service.start();
    jasmine.clock().tick(25 * MIN);
    await flushLocks();
    expect(locks.requests).toEqual(['auratime-pomodoro-credit']);
    expect(service.currentPhase()).toBe('break');
  });

  it('re-checks the shared state inside the lock: a window that got there first is adopted, not credited twice', async () => {
    const { service, analytics } = setup();
    const credit = spyOn(analytics, 'recordFocusSession').and.callThrough();
    service.start();
    const end = NOW + 25 * MIN;

    // Between asking for the lock and getting it, another window completes (and credits) the same phase.
    locks.beforeGrant = () => {
      localStorage.setItem(KEY, JSON.stringify({
        phase: 'break', running: true, endTime: end + 5 * MIN, remainingSec: 300,
        workDuration: 25, breakDuration: 5, lastCompletedEnd: end
      }));
      locks.beforeGrant = null;
    };
    jasmine.clock().tick(25 * MIN);
    await flushLocks();

    expect(credit).not.toHaveBeenCalled();
    expect(chimes).toBe(0);
    expect(service.currentPhase()).toBe('break');
    expect(service.isRunning()).toBeTrue();
  });

  it('two windows reaching 00:00 at the same moment credit exactly once', async () => {
    const { service, analytics } = setup();
    // a second "window": its own service instances, the same storage and the same lock manager
    const second = createEnvironmentInjector(
      [PomodoroService, TaskService, AnalyticsService],
      TestBed.inject(EnvironmentInjector)
    );
    const secondService = second.get(PomodoroService);
    const secondAnalytics = second.get(AnalyticsService);
    const credits = [spyOn(analytics, 'recordFocusSession').and.callThrough(), spyOn(secondAnalytics, 'recordFocusSession').and.callThrough()];

    // a third window starts a session: both windows follow through the storage event
    const started = JSON.stringify({
      phase: 'work', running: true, endTime: NOW + 25 * MIN, remainingSec: 1500, workDuration: 25, breakDuration: 5, lastCompletedEnd: 0
    });
    localStorage.setItem(KEY, started);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: started, storageArea: localStorage }));
    expect(service.isRunning()).toBeTrue();
    expect(secondService.isRunning()).toBeTrue();

    jasmine.clock().tick(25 * MIN); // both see the end of the phase
    await flushLocks(40);

    expect(credits[0].calls.count() + credits[1].calls.count()).toBe(1);
    expect(service.currentPhase()).toBe('break');
    expect(secondService.currentPhase()).toBe('break');
  });

  it('survives a failing lock request (it logs and the next tick tries again)', async () => {
    const { service } = setup();
    const warn = spyOn(console, 'warn');
    service.start();
    const original = locks.request.bind(locks);
    let first = true;
    spyOn(locks, 'request').and.callFake(((name: string, cb: unknown) => {
      if (first) {
        first = false;
        return Promise.reject(new Error('lock denied'));
      }
      return original(name, cb);
    }) as never);

    jasmine.clock().tick(25 * MIN);
    await flushLocks();
    expect(warn).toHaveBeenCalled();
    jasmine.clock().tick(1000);
    await flushLocks();
    expect(service.currentPhase()).toBe('break');
  });
});
