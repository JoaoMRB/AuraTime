import { TestBed } from '@angular/core/testing';
import { PomodoroService } from './pomodoro.service';
import { TaskService } from './task.service';
import { AnalyticsService } from './analytics.service';
import { AudioService } from './audio.service';

describe('PomodoroService', () => {
  const START = new Date(2026, 0, 15, 10, 0, 0);
  let chimes = 0;

  function setup(): { service: PomodoroService; tasks: TaskService; analytics: AnalyticsService } {
    TestBed.configureTestingModule({
      providers: [{
        provide: AudioService,
        useValue: { initAudioContext: () => Promise.resolve(), playChimeSound: () => chimes++ }
      }]
    });
    return {
      service: TestBed.inject(PomodoroService),
      tasks: TestBed.inject(TaskService),
      analytics: TestBed.inject(AnalyticsService)
    };
  }

  /** Moves the mocked clock forward; the shared 1 s TickService interval fires as time passes. */
  function advance(seconds: number): void {
    jasmine.clock().tick(seconds * 1000);
  }

  beforeEach(() => {
    chimes = 0;
    localStorage.clear();
    jasmine.clock().install();
    jasmine.clock().mockDate(START);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  it('starts idle on a 25:00 work phase', () => {
    const { service } = setup();
    expect(service.currentTime()).toBe('25:00');
    expect(service.currentPhase()).toBe('work');
    expect(service.isRunning()).toBeFalse();
  });

  it('does not count down while paused', () => {
    const { service } = setup();
    advance(5);
    expect(service.currentTime()).toBe('25:00');
  });

  it('counts down one second per elapsed second while running', () => {
    const { service } = setup();
    service.start();
    advance(1);
    expect(service.currentTime()).toBe('24:59');
    advance(59);
    expect(service.currentTime()).toBe('24:00');
  });

  it('is not affected by missed ticks (throttled tab): one big jump lands on the right time', () => {
    const { service } = setup();
    service.start();
    jasmine.clock().mockDate(new Date(START.getTime() + 10_000)); // no intervals fired
    service.tick();
    expect(service.currentTime()).toBe('24:50');
  });

  it('keeps the remaining time when paused and resumes from it', () => {
    const { service } = setup();
    service.start();
    advance(30);
    service.pause();
    advance(120);
    expect(service.currentTime()).toBe('24:30');
    service.start();
    advance(30);
    expect(service.currentTime()).toBe('24:00');
  });

  it('switches to break exactly when work reaches 00:00 and keeps running', () => {
    const { service } = setup();
    service.start();
    advance(25 * 60 - 1);
    expect(service.currentTime()).toBe('00:01');
    expect(service.currentPhase()).toBe('work');
    advance(1);
    expect(service.currentPhase()).toBe('break');
    expect(service.currentTime()).toBe('05:00');
    expect(service.isRunning()).toBeTrue();
    expect(chimes).toBe(1);
  });

  it('credits the active task and analytics only after a work phase', () => {
    const { service, tasks, analytics } = setup();
    const before = tasks.getActiveTask()!.pomodoros;
    service.start();
    advance(25 * 60);
    expect(tasks.getActiveTask()!.pomodoros).toBe(before + 1);
    expect(analytics.todayStats().pomodoros).toBe(1);
    expect(analytics.todayStats().minutes).toBe(25);

    advance(5 * 60); // break completes, back to work
    expect(service.currentPhase()).toBe('work');
    expect(analytics.todayStats().pomodoros).toBe(1);
  });

  it('catches up several completed phases after a long suspension', () => {
    const { service, analytics } = setup();
    service.start();
    jasmine.clock().mockDate(new Date(START.getTime() + 61 * 60_000)); // 61 min asleep, no ticks
    service.tick();
    // 25 work + 5 break + 25 work + 5 break = 60 min, then 1 min into the next work phase
    expect(analytics.todayStats().pomodoros).toBe(2);
    expect(service.currentPhase()).toBe('work');
    expect(service.currentTime()).toBe('24:00');
  });

  it('reset returns to a stopped 25:00 work phase', () => {
    const { service } = setup();
    service.start();
    advance(100);
    service.reset();
    expect(service.isRunning()).toBeFalse();
    expect(service.currentPhase()).toBe('work');
    expect(service.currentTime()).toBe('25:00');
  });

  it('applies presets to the idle timer', () => {
    const { service } = setup();
    service.setPreset('long');
    expect(service.currentTime()).toBe('50:00');
    expect(service.getBreakDuration()).toBe(10);
  });

  it('restores a running phase from localStorage after a reload', () => {
    localStorage.setItem('auratime_pomodoro', JSON.stringify({
      phase: 'break',
      running: true,
      endTime: START.getTime() + 90_000,
      remainingSec: 300,
      workDuration: 50,
      breakDuration: 10
    }));
    const { service } = setup();
    expect(service.currentPhase()).toBe('break');
    expect(service.isRunning()).toBeTrue();
    expect(service.currentTime()).toBe('01:30');
    expect(service.getWorkDuration()).toBe(50);
  });

  it('restores a paused phase without running', () => {
    localStorage.setItem('auratime_pomodoro', JSON.stringify({
      phase: 'work', running: false, endTime: null, remainingSec: 754, workDuration: 25, breakDuration: 5
    }));
    const { service } = setup();
    expect(service.isRunning()).toBeFalse();
    expect(service.currentTime()).toBe('12:34');
  });

  it('ignores corrupted persisted state', () => {
    localStorage.setItem('auratime_pomodoro', '{not json');
    const { service } = setup();
    expect(service.currentTime()).toBe('25:00');
  });
});
