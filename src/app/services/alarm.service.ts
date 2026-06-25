import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AudioService } from './audio.service';

export interface Alarm {
  id: string;
  label: string;
  time: string; // HH:MM format (24h)
  days: number[]; // 0-6 (Sunday-Saturday)
  enabled: boolean;
  snoozeMinutes: number;
  sound: 'chime' | 'bell' | 'digital';
}

@Injectable({
  providedIn: 'root'
})
export class AlarmService {
  private audioService = inject(AudioService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // Alarms State
  private alarms = signal<Alarm[]>([]);
  private nextAlarm = signal<Alarm | null>(null);
  private isRinging = signal<boolean>(false);
  private currentRingingAlarm = signal<Alarm | null>(null);

  // Computed values
  allAlarms = computed(() => this.alarms());
  activeAlarms = computed(() => this.alarms().filter(a => a.enabled));
  nextAlarmTime = computed(() => {
    const alarm = this.nextAlarm();
    if (!alarm) return null;
    return alarm.time;
  });
  isAlarmRinging = computed(() => this.isRinging());

  // Private interval for checking alarms
  private checkInterval: any = null;
  private lastMinuteKey = '';
  private dismissedAlarmIds = new Set<string>();

  constructor() {
    if (this.isBrowser) {
      this.loadFromStorage();
      this.startAlarmChecker();
    }
  }

  // Alarm Operations
  addAlarm(alarm: Omit<Alarm, 'id'>): void {
    const newAlarm: Alarm = {
      ...alarm,
      id: Date.now().toString()
    };
    this.alarms.update(alarms => [...alarms, newAlarm]);
    this.calculateNextAlarm();
    this.saveToStorage();
  }

  updateAlarm(id: string, updates: Partial<Alarm>): void {
    this.alarms.update(alarms =>
      alarms.map(a => a.id === id ? { ...a, ...updates } : a)
    );
    this.calculateNextAlarm();
    this.saveToStorage();
  }

  deleteAlarm(id: string): void {
    this.alarms.update(alarms => alarms.filter(a => a.id !== id));
    this.calculateNextAlarm();
    this.saveToStorage();
  }

  toggleAlarm(id: string): void {
    this.alarms.update(alarms =>
      alarms.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a)
    );
    this.calculateNextAlarm();
    this.saveToStorage();
  }

  // Snooze current ringing alarm
  snooze(): void {
    if (!this.isRinging()) return;

    const alarm = this.currentRingingAlarm();
    if (!alarm) return;

    this.stopRinging();

    // Create a one-time alarm for snooze
    const now = new Date();
    const snoozeTime = new Date(now.getTime() + alarm.snoozeMinutes * 60000);
    const snoozeAlarm: Alarm = {
      id: Date.now().toString(),
      label: `${alarm.label} (Snooze)`,
      time: `${String(snoozeTime.getHours()).padStart(2, '0')}:${String(snoozeTime.getMinutes()).padStart(2, '0')}`,
      days: [], // One-time
      enabled: true,
      snoozeMinutes: alarm.snoozeMinutes,
      sound: alarm.sound
    };

    this.alarms.update(alarms => [...alarms, snoozeAlarm]);
    this.calculateNextAlarm();
    this.saveToStorage();
  }

  // Stop ringing
  stopRinging(): void {
    const alarm = this.currentRingingAlarm();
    if (alarm) {
      this.markDismissed(alarm.id);
    }
    this.isRinging.set(false);
    this.currentRingingAlarm.set(null);
  }

  private syncMinuteWindow(now: Date): void {
    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    if (minuteKey !== this.lastMinuteKey) {
      this.lastMinuteKey = minuteKey;
      this.dismissedAlarmIds.clear();
    }
  }

  private markDismissed(alarmId: string): void {
    this.dismissedAlarmIds.add(alarmId);
  }

  // Calculate next alarm to ring
  private calculateNextAlarm(): void {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTime = currentHours * 60 + currentMinutes;

    const enabledAlarms = this.alarms().filter(a => a.enabled);
    let nextAlarm: Alarm | null = null;
    let minDiff = Infinity;

    for (const alarm of enabledAlarms) {
      const [alarmHours, alarmMinutes] = alarm.time.split(':').map(Number);
      const alarmTime = alarmHours * 60 + alarmMinutes;

      // Check if alarm is for today or future days
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const targetDay = (currentDay + dayOffset) % 7;
        
        if (alarm.days.length === 0 || alarm.days.includes(targetDay)) {
          let diff = alarmTime - currentTime;
          
          if (dayOffset === 0 && diff <= 0) {
            // Already passed today, check next occurrence
            continue;
          }
          
          diff += dayOffset * 24 * 60;
          
          if (diff < minDiff) {
            minDiff = diff;
            nextAlarm = alarm;
          }
        }
      }
    }

    this.nextAlarm.set(nextAlarm);
  }

  // Start checking for alarms
  private startAlarmChecker(): void {
    this.checkInterval = setInterval(() => {
      this.checkAlarms();
    }, 1000); // Check every second
  }

  // Check if any alarm should ring
  private checkAlarms(): void {
    if (this.isRinging()) return;

    const now = new Date();
    this.syncMinuteWindow(now);

    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = now.getDay();

    const enabledAlarms = this.alarms().filter(a => a.enabled);

    for (const alarm of enabledAlarms) {
      if (this.dismissedAlarmIds.has(alarm.id)) {
        continue;
      }

      if (alarm.time === currentTime) {
        // Check if it's for today or one-time
        if (alarm.days.length === 0 || alarm.days.includes(currentDay)) {
          this.markDismissed(alarm.id);
          this.triggerAlarm(alarm);

          // If it's a one-time alarm, disable it
          if (alarm.days.length === 0) {
            this.updateAlarm(alarm.id, { enabled: false });
          }
          break;
        }
      }
    }
  }

  // Trigger alarm
  private triggerAlarm(alarm: Alarm): void {
    this.isRinging.set(true);
    this.currentRingingAlarm.set(alarm);
    this.audioService.initAudioContext();

    // Play alarm sound based on type
    this.playAlarmSound(alarm.sound);
  }

  // Play alarm sound
  private playAlarmSound(soundType: string): void {
    switch (soundType) {
      case 'chime':
        this.audioService.playChimeSound();
        setTimeout(() => this.audioService.playChimeSound(), 500);
        setTimeout(() => this.audioService.playChimeSound(), 1000);
        break;
      case 'bell':
        this.playBellSound();
        break;
      case 'digital':
        this.playDigitalSound();
        break;
    }
  }

  // Play bell sound
  private playBellSound(): void {
    // Repeated chimes for bell effect
    let count = 0;
    const interval = setInterval(() => {
      this.audioService.playChimeSound();
      count++;
      if (count >= 5) {
        clearInterval(interval);
      }
    }, 800);
  }

  // Play digital sound
  private playDigitalSound(): void {
    // Quick beeps
    let count = 0;
    const interval = setInterval(() => {
      this.audioService.playChimeSound();
      count++;
      if (count >= 10) {
        clearInterval(interval);
      }
    }, 300);
  }

  // Get time until next alarm
  getTimeUntilNextAlarm(): string {
    const alarm = this.nextAlarm();
    if (!alarm) return '';

    const now = new Date();
    const [alarmHours, alarmMinutes] = alarm.time.split(':').map(Number);
    
    let alarmDate = new Date();
    alarmDate.setHours(alarmHours, alarmMinutes, 0, 0);
    
    if (alarmDate <= now) {
      alarmDate.setDate(alarmDate.getDate() + 1);
    }

    const diff = alarmDate.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  // Persistence
  private saveToStorage(): void {
    try {
      localStorage.setItem('auratime_alarms', JSON.stringify(this.alarms()));
    } catch (e) {
      console.warn('Could not save alarms to localStorage', e);
    }
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem('auratime_alarms');
      if (data) {
        const parsed = JSON.parse(data) as Alarm[];
        this.alarms.set(parsed);
        this.calculateNextAlarm();
      }
    } catch (e) {
      console.warn('Could not load alarms from localStorage', e);
    }
  }

  // Cleanup
  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.stopRinging();
  }
}
