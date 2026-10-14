import { TestBed } from '@angular/core/testing';
import { PomodoroService } from './pomodoro.service';
import { TaskService } from './task.service';
import { AnalyticsService } from './analytics.service';
import { AudioService } from './audio.service';

describe('PomodoroService (characterization)', () => {
  let service: PomodoroService;
  let tasks: TaskService;
  let analytics: AnalyticsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{
        provide: AudioService,
        useValue: { initAudioContext: () => Promise.resolve(), playChimeSound: () => {} }
      }]
    });
    service = TestBed.inject(PomodoroService);
    tasks = TestBed.inject(TaskService);
    analytics = TestBed.inject(AnalyticsService);
  });

  afterEach(() => localStorage.clear());

  function tickSeconds(n: number): void {
    for (let i = 0; i < n; i++) service.tick();
  }

  // Current behaviour: the phase only flips on the tick AFTER 00:00 is shown,
  // so a full phase takes duration + 1 ticks.
  const WORK_TICKS = 25 * 60 + 1;
  const BREAK_TICKS = 5 * 60 + 1;

  it('starts idle on a 25:00 work phase', () => {
    expect(service.currentTime()).toBe('25:00');
    expect(service.currentPhase()).toBe('work');
    expect(service.isRunning()).toBeFalse();
  });

  it('does not count down while paused', () => {
    tickSeconds(5);
    expect(service.currentTime()).toBe('25:00');
  });

  it('counts down one second per tick while running', () => {
    service.start();
    tickSeconds(1);
    expect(service.currentTime()).toBe('24:59');
    tickSeconds(59);
    expect(service.currentTime()).toBe('24:00');
  });

  it('switches to break and keeps running when work completes', () => {
    service.start();
    tickSeconds(25 * 60);
    expect(service.currentTime()).toBe('00:00');
    expect(service.currentPhase()).toBe('work');
    tickSeconds(1);
    expect(service.currentPhase()).toBe('break');
    expect(service.currentTime()).toBe('05:00');
    expect(service.isRunning()).toBeTrue();
  });

  it('credits the active task and analytics only after a work phase', () => {
    const active = tasks.getActiveTask()!;
    service.start();
    tickSeconds(WORK_TICKS);
    expect(tasks.getActiveTask()!.pomodoros).toBe(active.pomodoros + 1);
    expect(analytics.todayStats().pomodoros).toBe(1);
    expect(analytics.todayStats().minutes).toBe(25);

    tickSeconds(BREAK_TICKS); // break completes, back to work
    expect(service.currentPhase()).toBe('work');
    expect(analytics.todayStats().pomodoros).toBe(1);
  });

  it('reset returns to a stopped 25:00 work phase', () => {
    service.start();
    tickSeconds(100);
    service.reset();
    expect(service.isRunning()).toBeFalse();
    expect(service.currentPhase()).toBe('work');
    expect(service.currentTime()).toBe('25:00');
  });

  it('applies presets to the idle timer', () => {
    service.setPreset('long');
    expect(service.currentTime()).toBe('50:00');
    expect(service.getBreakDuration()).toBe(10);
  });
});
