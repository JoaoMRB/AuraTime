import { Injectable, computed, inject } from '@angular/core';
import { SettingsService } from '../settings.service';
import { PomodoroService } from '../pomodoro.service';
import { TaskService } from '../task.service';
import { AnalyticsService } from '../analytics.service';
import { WeatherService } from '../weather.service';
import { DashboardService } from '../dashboard.service';
import { TranslationService } from '../translation.service';
import { TickService } from './tick.service';
import { DisplaySnapshot } from './display-snapshot';
import { formatClock } from './clock-format';
import { labelsFor, localeForLang, selectTodayTasks } from './screen-logic';
import { resolveFont, resolveThemeId } from './theme-tokens';

/**
 * Aggregates the existing services into one DisplaySnapshot. Read-only: it never changes
 * app state, so any number of outputs can consume it.
 */
@Injectable({
  providedIn: 'root'
})
export class DisplayStateService {
  private tick = inject(TickService);
  private settings = inject(SettingsService);
  private pomodoro = inject(PomodoroService);
  private tasks = inject(TaskService);
  private analytics = inject(AnalyticsService);
  private weatherService = inject(WeatherService);
  private dashboard = inject(DashboardService);
  private translation = inject(TranslationService);

  /** Recomputed every second (tick) and whenever a source signal changes. */
  readonly snapshot = computed<DisplaySnapshot>(() => {
    const now = this.tick.now();
    const lang = this.translation.currentLang();
    const use24h = this.settings.militaryTime();

    const clock = formatClock(now, { use24h, showSeconds: false });
    const running = this.pomodoro.isRunning();
    const pomoPhase = this.pomodoro.currentPhase();
    const phaseMinutes = pomoPhase === 'work' ? this.pomodoro.getWorkDuration() : this.pomodoro.getBreakDuration();

    const weather = this.weatherService.weather();
    const quote = this.dashboard.currentQuote();

    return {
      now,
      theme: resolveThemeId(this.settings.theme()),
      fontId: resolveFont(this.settings.font()).id,
      clock: {
        hhmm: `${clock.hours}:${clock.minutes}`,
        seconds: now.getSeconds(),
        ampm: clock.ampm.trim(),
        dateLabel: now.toLocaleDateString(localeForLang(lang), { weekday: 'long', day: 'numeric', month: 'long' }),
        use24h
      },
      focus: {
        phase: running ? pomoPhase : 'idle',
        remainingSec: this.pomodoro.totalSeconds(),
        totalSec: phaseMinutes * 60,
        tasks: selectTodayTasks(this.tasks.tasks(), this.tasks.activeTaskId())
      },
      weather: weather
        ? {
            tempC: weather.temperature,
            condition: weather.condition,
            description: weather.description,
            icon: weather.icon,
            city: weather.cityName
          }
        : undefined,
      quote: quote ? { text: quote.text, author: quote.author } : undefined,
      stats: {
        todayMin: this.analytics.todayStats().minutes,
        streak: this.analytics.currentStreak()
      },
      labels: labelsFor(lang)
    };
  });
}
