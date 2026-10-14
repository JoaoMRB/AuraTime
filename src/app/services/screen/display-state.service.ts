import { Injectable, computed, inject } from '@angular/core';
import { SettingsService } from '../settings.service';
import { PomodoroService } from '../pomodoro.service';
import { TaskService } from '../task.service';
import { AnalyticsService } from '../analytics.service';
import { WeatherService } from '../weather.service';
import { DashboardService } from '../dashboard.service';
import { AlarmService } from '../alarm.service';
import { WorldClockService } from '../world-clock.service';
import { TranslationService } from '../translation.service';
import { TickService } from './tick.service';
import { DisplaySnapshot } from './display-snapshot';
import { formatClock } from './clock-format';
import { labelsFor, localeForLang, selectTodayTasks } from './screen-logic';
import { buildWeek, findNextAlarm, resolveCountdown, zonedTime } from './screen-data';
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
  private alarms = inject(AlarmService);
  private worldClocks = inject(WorldClockService);

  /** Recomputed every second (tick) and whenever a source signal changes. */
  readonly snapshot = computed<DisplaySnapshot>(() => {
    const now = this.tick.now();
    const lang = this.translation.currentLang();
    const use24h = this.settings.militaryTime();

    const clock = formatClock(now, { use24h, showSeconds: false });
    const running = this.pomodoro.isRunning();
    const pomoPhase = this.pomodoro.currentPhase();
    const phaseMinutes = pomoPhase === 'work' ? this.pomodoro.getWorkDuration() : this.pomodoro.getBreakDuration();

    const labels = labelsFor(lang);
    const locale = localeForLang(lang);
    const clockOptions = { use24h, showSeconds: false };

    const week = buildWeek(this.analytics.dailyRecords(), now, locale);

    const next = findNextAlarm(this.alarms.allAlarms(), now);
    const nextClock = next ? formatClock(next.at, clockOptions) : null;
    const countdown = resolveCountdown(this.dashboard.countdown(), now);

    const worldClocks: DisplaySnapshot['worldClocks'] = [];
    for (const wc of this.worldClocks.allClocks()) {
      const zoned = zonedTime(now, wc.timezone);
      if (!zoned) continue;
      const shown = formatClock(new Date(2000, 0, 1, zoned.hours, zoned.minutes), clockOptions);
      worldClocks.push({
        label: wc.label,
        hhmm: `${shown.hours}:${shown.minutes}`,
        ampm: shown.ampm.trim(),
        dayOffset: zoned.dayOffset,
        utc: `UTC${this.worldClocks.getUtcOffsetLabel(wc.timezone)}`
      });
      if (worldClocks.length === 3) break;
    }

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
      week: {
        days: week.map(d => ({ label: d.label, minutes: d.minutes, isToday: d.isToday })),
        totalMin: week.reduce((sum, d) => sum + d.minutes, 0),
        streak: this.analytics.currentStreak()
      },
      alarm: next && nextClock
        ? {
            label: next.label,
            hhmm: `${nextClock.hours}:${nextClock.minutes}`,
            ampm: nextClock.ampm.trim(),
            minutesUntil: next.minutesUntil,
            whenLabel:
              next.dayOffset === 0 ? labels.dayToday
              : next.dayOffset === 1 ? labels.dayTomorrow
              : capitalize(next.at.toLocaleDateString(locale, { weekday: 'long' }))
          }
        : undefined,
      countdown: countdown ?? undefined,
      worldClocks,
      weather: weather
        ? {
            tempC: weather.temperature,
            condition: weather.condition,
            // Translated from the condition; the service's own text is Portuguese-only.
            description: labels.weather[weather.condition] ?? weather.description,
            icon: weather.icon,
            city: weather.cityName
          }
        : undefined,
      quote: quote ? { text: quote.text, author: quote.author } : undefined,
      stats: {
        todayMin: this.analytics.todayStats().minutes,
        streak: this.analytics.currentStreak()
      },
      labels
    };
  });
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
