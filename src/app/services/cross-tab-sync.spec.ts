import { TestBed } from '@angular/core/testing';
import { SettingsService } from './settings.service';
import { TaskService } from './task.service';
import { AnalyticsService } from './analytics.service';
import { PomodoroService } from './pomodoro.service';
import { AudioService } from './audio.service';
import { AlarmService } from './alarm.service';
import { DashboardService } from './dashboard.service';
import { WorldClockService } from './world-clock.service';

/** Simulates another tab writing to localStorage (the browser only fires `storage` in the OTHER tabs). */
function otherTabWrites(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  localStorage.setItem(key, raw);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: raw, storageArea: localStorage }));
}

describe('cross-tab sync', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('settings: applies visual changes from another tab but not mode/sound', () => {
    const settings = TestBed.inject(SettingsService);
    settings.mode.set('clock');
    settings.sound.set('none');

    otherTabWrites('auratime_settings', {
      theme: 'liquid-glass', font: 'orbitron', militaryTime: true, showSeconds: false, mode: 'pomodoro', sound: 'rain'
    });

    expect(settings.theme()).toBe('liquid-glass');
    expect(settings.font()).toBe('orbitron');
    expect(settings.militaryTime()).toBeTrue();
    expect(settings.mode()).toBe('clock');
    expect(settings.sound()).toBe('none');
  });

  it('tasks: applies task list and active task from another tab', () => {
    const tasks = TestBed.inject(TaskService);
    otherTabWrites('auratime_tasks', {
      tasks: [{ id: 'x', text: 'From app', completed: false, pomodoros: 2, createdAt: 1 }],
      activeTaskId: 'x'
    });
    expect(tasks.tasks().length).toBe(1);
    expect(tasks.getActiveTask()?.text).toBe('From app');
  });

  it('analytics: applies records from another tab', () => {
    const analytics = TestBed.inject(AnalyticsService);
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    otherTabWrites('auratime_analytics', {
      dailyRecords: { [key]: { date: key, minutes: 75, pomodoros: 3 } }, currentStreak: 0, bestStreak: 0
    });
    expect(analytics.todayStats().minutes).toBe(75);
    expect(analytics.currentStreak()).toBe(1);
  });

  it('alarms: applies the list from another tab', () => {
    const alarms = TestBed.inject(AlarmService);
    alarms.stopChecker();
    otherTabWrites('auratime_alarms', [
      { id: 'a1', label: 'Wake up', time: '07:30', days: [], enabled: true, snoozeMinutes: 10, sound: 'chime' }
    ]);
    expect(alarms.allAlarms().map(a => a.label)).toEqual(['Wake up']);
  });

  it('alarms: stopChecker stops the ring check interval', () => {
    jasmine.clock().install();
    try {
      const alarms = TestBed.inject(AlarmService);
      const check = spyOn<any>(alarms, 'checkAlarms');
      jasmine.clock().tick(2000);
      expect(check).toHaveBeenCalledTimes(2);
      alarms.stopChecker();
      jasmine.clock().tick(5000);
      expect(check).toHaveBeenCalledTimes(2);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('dashboard: applies the countdown from another tab', () => {
    const dashboard = TestBed.inject(DashboardService);
    otherTabWrites('auratime_dashboard', {
      links: [], countdown: { title: 'Release', targetDateTime: '18:00', active: true }
    });
    expect(dashboard.countdown().title).toBe('Release');
    expect(dashboard.countdown().active).toBeTrue();
  });

  it('world clocks: applies the list from another tab', () => {
    const world = TestBed.inject(WorldClockService);
    otherTabWrites('auratime_worldclocks', [{ id: 'w1', label: 'Sydney', timezone: 'Australia/Sydney', offset: 11 }]);
    expect(world.allClocks().map(c => c.label)).toEqual(['Sydney']);
  });

  describe('pomodoro', () => {
    const START = new Date(2026, 0, 15, 10, 0, 0);
    let chimes = 0;

    function setup(): { pomodoro: PomodoroService; analytics: AnalyticsService } {
      TestBed.configureTestingModule({
        providers: [{
          provide: AudioService,
          useValue: { initAudioContext: () => Promise.resolve(), playChimeSound: () => chimes++ }
        }]
      });
      return { pomodoro: TestBed.inject(PomodoroService), analytics: TestBed.inject(AnalyticsService) };
    }

    beforeEach(() => {
      chimes = 0;
      jasmine.clock().install();
      jasmine.clock().mockDate(START);
    });
    afterEach(() => jasmine.clock().uninstall());

    it('follows a session started in another tab', () => {
      const { pomodoro } = setup();
      expect(pomodoro.isRunning()).toBeFalse();

      otherTabWrites('auratime_pomodoro', {
        phase: 'work', running: true, endTime: START.getTime() + 600_000, remainingSec: 1500,
        workDuration: 25, breakDuration: 5, lastCompletedEnd: 0
      });

      expect(pomodoro.isRunning()).toBeTrue();
      expect(pomodoro.currentTime()).toBe('10:00');

      jasmine.clock().tick(1000);
      expect(pomodoro.currentTime()).toBe('09:59');
    });

    it('follows a pause done in another tab', () => {
      const { pomodoro } = setup();
      pomodoro.start();
      otherTabWrites('auratime_pomodoro', {
        phase: 'work', running: false, endTime: null, remainingSec: 1234,
        workDuration: 25, breakDuration: 5, lastCompletedEnd: 0
      });
      expect(pomodoro.isRunning()).toBeFalse();
      expect(pomodoro.currentTime()).toBe('20:34');
    });

    it('does not credit a phase that another tab already completed', () => {
      const { pomodoro, analytics } = setup();
      pomodoro.start();
      const end = START.getTime() + 25 * 60_000;

      // The other tab hits 00:00 first: it credits the session and stores the next phase.
      localStorage.setItem('auratime_pomodoro', JSON.stringify({
        phase: 'break', running: true, endTime: end + 300_000, remainingSec: 300,
        workDuration: 25, breakDuration: 5, lastCompletedEnd: end
      }));

      jasmine.clock().tick(25 * 60_000); // this tab reaches 00:00 without having seen the storage event

      expect(analytics.todayStats().pomodoros).toBe(0); // nothing credited here
      expect(chimes).toBe(0);
      expect(pomodoro.currentPhase()).toBe('break');
      expect(pomodoro.currentTime()).toBe('05:00');
    });

    it('credits normally when no other tab completed the phase', () => {
      const { pomodoro, analytics } = setup();
      pomodoro.start();
      jasmine.clock().tick(25 * 60_000);
      expect(analytics.todayStats().pomodoros).toBe(1);
      expect(chimes).toBe(1);
      expect(JSON.parse(localStorage.getItem('auratime_pomodoro')!).lastCompletedEnd)
        .toBe(START.getTime() + 25 * 60_000);
    });
  });
});
