import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DisplayStateService } from './display-state.service';
import { SettingsService } from '../settings.service';
import { PomodoroService } from '../pomodoro.service';
import { TaskService } from '../task.service';
import { AudioService } from '../audio.service';
import { WeatherService } from '../weather.service';

describe('DisplayStateService', () => {
  const START = new Date(2026, 0, 15, 21, 5, 33);
  let service: DisplayStateService;
  let settings: SettingsService;
  let pomodoro: PomodoroService;
  let tasks: TaskService;

  beforeEach(() => {
    localStorage.clear();
    jasmine.clock().install();
    jasmine.clock().mockDate(START);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AudioService, useValue: { initAudioContext: () => Promise.resolve(), playChimeSound: () => {} } },
        { provide: WeatherService, useValue: { weather: () => null } }
      ]
    });
    service = TestBed.inject(DisplayStateService);
    settings = TestBed.inject(SettingsService);
    pomodoro = TestBed.inject(PomodoroService);
    tasks = TestBed.inject(TaskService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  it('exposes the clock, following the 12h/24h setting', () => {
    jasmine.clock().tick(1000); // let the shared tick publish "now"
    settings.militaryTime.set(true);
    expect(service.snapshot().clock.hhmm).toBe('21:05');
    expect(service.snapshot().clock.ampm).toBe('');

    settings.militaryTime.set(false);
    expect(service.snapshot().clock.hhmm).toBe('09:05');
    expect(service.snapshot().clock.ampm).toBe('PM');
  });

  it('follows the theme and font from settings (resolving legacy ids)', () => {
    settings.theme.set('liquid-glass');
    settings.font.set('orbitron');
    expect(service.snapshot().theme).toBe('liquid-glass');
    expect(service.snapshot().fontId).toBe('orbitron');
    settings.theme.set('frosted-glass');
    expect(service.snapshot().theme).toBe('light-glass');
  });

  it('reflects the pomodoro within one tick', () => {
    expect(service.snapshot().focus.phase).toBe('idle');
    pomodoro.start();
    jasmine.clock().tick(1000);
    const focus = service.snapshot().focus;
    expect(focus.phase).toBe('work');
    expect(focus.totalSec).toBe(25 * 60);
    expect(focus.remainingSec).toBe(25 * 60 - 1);
  });

  it("builds today's tasks with the active one first", () => {
    tasks.tasks.set([
      { id: '1', text: 'one', completed: false, pomodoros: 0, createdAt: 1 },
      { id: '2', text: 'two', completed: false, pomodoros: 0, createdAt: 2 },
      { id: '3', text: 'three', completed: true, pomodoros: 0, createdAt: 3 }
    ]);
    tasks.activeTaskId.set('2');
    expect(service.snapshot().focus.tasks.map(t => t.text)).toEqual(['two', 'one']);
  });

  it('omits weather when unavailable and always provides a quote and labels', () => {
    const s = service.snapshot();
    expect(s.weather).toBeUndefined();
    expect(s.quote?.text.length).toBeGreaterThan(0);
    expect(s.labels.focus).toBe('FOCUS');
  });
});
