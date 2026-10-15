import { Injectable, signal, computed, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface FocusDayRecord {
  date: string; // YYYY-MM-DD
  minutes: number;
  pomodoros: number;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // Daily records: Map date string -> FocusDayRecord
  dailyRecords = signal<Record<string, FocusDayRecord>>({});
  currentStreak = signal<number>(0);
  bestStreak = signal<number>(0);

  // Computed today's stats
  todayKey = computed(() => this.formatDateKey(new Date()));

  todayStats = computed(() => {
    const key = this.todayKey();
    const records = this.dailyRecords();
    return records[key] || { date: key, minutes: 0, pomodoros: 0 };
  });

  totalFocusMinutes = computed(() => {
    const records = Object.values(this.dailyRecords());
    return records.reduce((acc, r) => acc + r.minutes, 0);
  });

  totalPomodoros = computed(() => {
    const records = Object.values(this.dailyRecords());
    return records.reduce((acc, r) => acc + r.pomodoros, 0);
  });

  // Last 7 days for the chart
  weeklySummary = computed(() => {
    const days: { label: string; date: string; minutes: number; pomodoros: number; heightPercent: number }[] = [];
    const now = new Date();
    const records = this.dailyRecords();

    let maxMinutes = 60; // baseline minimum scale
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = this.formatDateKey(d);
      const rec = records[key] || { date: key, minutes: 0, pomodoros: 0 };
      if (rec.minutes > maxMinutes) maxMinutes = rec.minutes;
    }

    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = this.formatDateKey(d);
      const rec = records[key] || { date: key, minutes: 0, pomodoros: 0 };
      const label = dayNames[d.getDay()];
      const heightPercent = Math.min(100, Math.round((rec.minutes / maxMinutes) * 100));

      days.push({
        label,
        date: key,
        minutes: rec.minutes,
        pomodoros: rec.pomodoros,
        heightPercent: Math.max(8, heightPercent) // minimum visible bar
      });
    }

    return days;
  });

  constructor() {
    if (this.isBrowser) {
      this.loadAnalytics();

      effect(() => {
        const state = {
          dailyRecords: this.dailyRecords(),
          currentStreak: this.currentStreak(),
          bestStreak: this.bestStreak()
        };
        try {
          localStorage.setItem('auratime_analytics', JSON.stringify(state));
        } catch (e) {}
      });
    }
  }

  private loadAnalytics() {
    // Keep several open tabs/windows (app + /screen) in sync
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key === 'auratime_analytics' && event.newValue) {
        this.applyRaw(event.newValue);
      }
    });

    this.applyRaw(localStorage.getItem('auratime_analytics'));
  }

  private applyRaw(data: string | null) {
    try {
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.dailyRecords) this.dailyRecords.set(parsed.dailyRecords);
        if (parsed.currentStreak !== undefined) this.currentStreak.set(parsed.currentStreak);
        if (parsed.bestStreak !== undefined) this.bestStreak.set(parsed.bestStreak);
      }
      this.calculateStreak();
    } catch (e) {}
  }

  private formatDateKey(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  recordFocusSession(durationMinutes: number): void {
    const today = this.formatDateKey(new Date());

    this.dailyRecords.update(records => {
      const existing = records[today] || { date: today, minutes: 0, pomodoros: 0 };
      return {
        ...records,
        [today]: {
          date: today,
          minutes: existing.minutes + durationMinutes,
          pomodoros: existing.pomodoros + 1
        }
      };
    });

    this.calculateStreak();
  }

  private calculateStreak(): void {
    const records = this.dailyRecords();
    const now = new Date();
    let streak = 0;

    // Check today
    const todayKey = this.formatDateKey(now);
    let checkDate = new Date(now);

    if (records[todayKey] && records[todayKey].minutes > 0) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      // If haven't focused yet today, see if yesterday had a session to preserve streak
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
      const key = this.formatDateKey(checkDate);
      if (records[key] && records[key].minutes > 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    this.currentStreak.set(streak);
    if (streak > this.bestStreak()) {
      this.bestStreak.set(streak);
    }
  }
}
