import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface ClockSettings {
  theme: string;
  position: string;
  angle: number;
  scale: number;
  font: string;
  showSeconds: boolean;
  showDate: boolean;
  militaryTime: boolean;
  mode: string; // 'clock' | 'pomodoro'
  sound: string; // 'none' | 'tick' | 'rain'
}

const DEFAULT_SETTINGS: ClockSettings = {
  theme: 'emerald-gold', // The premium default
  position: 'center',
  angle: -4, // Elegant slight luxury tilt
  scale: 1.0,
  font: 'outfit',
  showSeconds: true,
  showDate: true,
  militaryTime: false,
  mode: 'clock',
  sound: 'none'
};

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // Settings Signals
  theme = signal<string>(DEFAULT_SETTINGS.theme);
  position = signal<string>(DEFAULT_SETTINGS.position);
  angle = signal<number>(DEFAULT_SETTINGS.angle);
  scale = signal<number>(DEFAULT_SETTINGS.scale);
  font = signal<string>(DEFAULT_SETTINGS.font);
  showSeconds = signal<boolean>(DEFAULT_SETTINGS.showSeconds);
  showDate = signal<boolean>(DEFAULT_SETTINGS.showDate);
  militaryTime = signal<boolean>(DEFAULT_SETTINGS.militaryTime);
  mode = signal<string>(DEFAULT_SETTINGS.mode);
  sound = signal<string>(DEFAULT_SETTINGS.sound);

  constructor() {
    if (this.isBrowser) {
      this.loadSettings();

      // Automatically sync settings to localStorage when any signal changes
      effect(() => {
        const settings: ClockSettings = {
          theme: this.theme(),
          position: this.position(),
          angle: this.angle(),
          scale: this.scale(),
          font: this.font(),
          showSeconds: this.showSeconds(),
          showDate: this.showDate(),
          militaryTime: this.militaryTime(),
          mode: this.mode(),
          sound: this.sound()
        };
        localStorage.setItem('auratime_settings', JSON.stringify(settings));
      });
    }
  }

  private loadSettings() {
    try {
      const data = localStorage.getItem('auratime_settings');
      if (data) {
        const parsed = JSON.parse(data) as Partial<ClockSettings>;
        if (parsed.theme) this.theme.set(parsed.theme);
        if (parsed.position) this.position.set(parsed.position);
        if (parsed.angle !== undefined) this.angle.set(parsed.angle);
        if (parsed.scale !== undefined) this.scale.set(parsed.scale);
        if (parsed.font) this.font.set(parsed.font);
        if (parsed.showSeconds !== undefined) this.showSeconds.set(parsed.showSeconds);
        if (parsed.showDate !== undefined) this.showDate.set(parsed.showDate);
        if (parsed.militaryTime !== undefined) this.militaryTime.set(parsed.militaryTime);
        if (parsed.mode) this.mode.set(parsed.mode);
        if (parsed.sound) this.sound.set(parsed.sound);
      }
    } catch (e) {
      console.error('Error loading settings from localStorage', e);
    }
  }

  resetToDefault() {
    this.theme.set(DEFAULT_SETTINGS.theme);
    this.position.set(DEFAULT_SETTINGS.position);
    this.angle.set(DEFAULT_SETTINGS.angle);
    this.scale.set(DEFAULT_SETTINGS.scale);
    this.font.set(DEFAULT_SETTINGS.font);
    this.showSeconds.set(DEFAULT_SETTINGS.showSeconds);
    this.showDate.set(DEFAULT_SETTINGS.showDate);
    this.militaryTime.set(DEFAULT_SETTINGS.militaryTime);
    this.mode.set(DEFAULT_SETTINGS.mode);
    this.sound.set(DEFAULT_SETTINGS.sound);
  }
}
