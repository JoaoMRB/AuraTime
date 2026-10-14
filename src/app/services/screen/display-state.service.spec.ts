import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DisplayStateService } from './display-state.service';
import { SettingsService } from '../settings.service';
import { PomodoroService } from '../pomodoro.service';
import { TaskService } from '../task.service';
import { AudioService } from '../audio.service';
import { WeatherService } from '../weather.service';
import { AnalyticsService } from '../analytics.service';
import { AlarmService } from '../alarm.service';
import { DashboardService } from '../dashboard.service';
import { TranslationService } from '../translation.service';

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

  describe('screen views data', () => {
    it('builds the last 7 days of focus with the streak', () => {
      const analytics = TestBed.inject(AnalyticsService);
      analytics.dailyRecords.set({
        '2026-01-15': { date: '2026-01-15', minutes: 50, pomodoros: 2 },
        '2026-01-13': { date: '2026-01-13', minutes: 25, pomodoros: 1 },
        '2025-12-01': { date: '2025-12-01', minutes: 999, pomodoros: 9 } // outside the window
      });
      analytics.currentStreak.set(4);
      const week = service.snapshot().week;
      expect(week.days.length).toBe(7);
      expect(week.days.map(d => d.minutes)).toEqual([0, 0, 0, 0, 25, 0, 50]);
      expect(week.days[6].isToday).toBeTrue();
      expect(week.totalMin).toBe(75);
      expect(week.streak).toBe(4);
    });

    it('reports the next alarm (12h and 24h) with a relative day label', () => {
      TestBed.inject(AlarmService).stopChecker();
      TestBed.inject(AlarmService).addAlarm({
        label: 'Evening', time: '22:00', days: [], enabled: true, snoozeMinutes: 10, sound: 'chime'
      });
      TestBed.inject(AlarmService).addAlarm({
        label: 'Early', time: '07:30', days: [], enabled: true, snoozeMinutes: 10, sound: 'chime'
      });

      settings.militaryTime.set(true);
      let alarm = service.snapshot().alarm!;
      expect(alarm.label).toBe('Evening'); // 21:05 -> 22:00 is sooner than tomorrow 07:30
      expect(alarm.hhmm).toBe('22:00');
      expect(alarm.minutesUntil).toBe(55);
      expect(alarm.whenLabel).toBe('Today');

      settings.militaryTime.set(false);
      alarm = service.snapshot().alarm!;
      expect(alarm.hhmm).toBe('10:00');
      expect(alarm.ampm).toBe('PM');
    });

    it('has no alarm without enabled alarms', () => {
      TestBed.inject(AlarmService).stopChecker();
      expect(service.snapshot().alarm).toBeUndefined();
    });

    it('reports an active dashboard countdown and drops it when inactive', () => {
      const dashboard = TestBed.inject(DashboardService);
      expect(service.snapshot().countdown).toBeUndefined();
      dashboard.setCountdown('Standup', '22:30', true);
      expect(service.snapshot().countdown).toEqual({ title: 'Standup', remainingSec: 5067 });
      dashboard.setCountdown('Standup', '22:30', false);
      expect(service.snapshot().countdown).toBeUndefined();
    });

    it('lists at most 3 world clocks with the right local time', () => {
      settings.militaryTime.set(true);
      const utcHour = START.getUTCHours();
      const utcMin = String(START.getUTCMinutes()).padStart(2, '0');
      const hh = (h: number) => String((h + 24) % 24).padStart(2, '0');

      const clocks = service.snapshot().worldClocks;
      expect(clocks.map(c => c.label)).toEqual(['New York', 'London', 'Tokyo']);
      expect(clocks.map(c => c.hhmm)).toEqual([
        `${hh(utcHour - 5)}:${utcMin}`, `${hh(utcHour)}:${utcMin}`, `${hh(utcHour + 9)}:${utcMin}`
      ]);
      expect(clocks.map(c => c.utc)).toEqual(['UTC-5', 'UTC+0', 'UTC+9']);
      expect(clocks.every(c => [-1, 0, 1].includes(c.dayOffset))).toBeTrue();
    });
  });

  it('describes the weather in the app language, not in the service language', () => {
    const weatherService = TestBed.inject(WeatherService) as unknown as { weather: () => unknown };
    weatherService.weather = () => ({ temperature: 18, condition: 'rainy', description: 'Chuva', icon: 'x', cityName: 'Lisboa' });
    expect(service.snapshot().weather!.description).toBe('Rain');

    TestBed.inject(TranslationService).currentLang.set('pt');
    expect(service.snapshot().weather!.description).toBe('Chuva');

    weatherService.weather = () => ({ temperature: 5, condition: 'something-new', description: 'Raw', icon: 'x', cityName: 'x' });
    TestBed.inject(TranslationService).currentLang.set('en'); // changes a signal, so the snapshot is recomputed
    expect(service.snapshot().weather!.description).toBe('Raw'); // unknown condition: keep the service text
  });

  it('omits weather when unavailable and always provides a quote and labels', () => {
    const s = service.snapshot();
    expect(s.weather).toBeUndefined();
    expect(s.quote?.text.length).toBeGreaterThan(0);
    expect(s.labels.focus).toBe('FOCUS');
  });
});
