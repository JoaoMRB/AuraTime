import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AudioService } from './audio.service';

export interface TimerPreset {
  id: string;
  label: string;
  duration: number; // in minutes
}

@Injectable({
  providedIn: 'root'
})
export class TimerService {
  private audioService = inject(AudioService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // Timer State
  private totalDuration = signal<number>(0); // in seconds
  private remaining = signal<number>(0); // in seconds
  private running = signal<boolean>(false);
  private endTime: number | null = null;

  // Presets
  private presets = signal<TimerPreset[]>([
    { id: '1', label: '5 min', duration: 5 },
    { id: '2', label: '10 min', duration: 10 },
    { id: '3', label: '15 min', duration: 15 },
    { id: '4', label: '25 min', duration: 25 },
    { id: '5', label: '30 min', duration: 30 },
    { id: '6', label: '45 min', duration: 45 },
    { id: '7', label: '60 min', duration: 60 }
  ]);

  // Computed values
  currentTime = computed(() => this.formatTime(this.remaining()));
  isRunning = computed(() => this.running());
  progress = computed(() => {
    if (this.totalDuration() === 0) return 0;
    return ((this.totalDuration() - this.remaining()) / this.totalDuration()) * 100;
  });
  allPresets = computed(() => this.presets());

  // Private interval reference
  private intervalId: any = null;

  constructor() {
    if (this.isBrowser) {
      this.loadFromStorage();
    }
  }

  // Timer Operations
  start(durationMinutes: number): void {
    if (this.running()) return;

    const durationSeconds = durationMinutes * 60;
    this.totalDuration.set(durationSeconds);
    this.remaining.set(durationSeconds);
    this.running.set(true);
    
    this.endTime = Date.now() + durationSeconds * 1000;
    this.audioService.initAudioContext();

    this.intervalId = setInterval(() => {
      const now = Date.now();
      const remainingMs = (this.endTime || 0) - now;
      
      if (remainingMs <= 0) {
        this.complete();
      } else {
        this.remaining.set(Math.ceil(remainingMs / 1000));
      }
    }, 100);
  }

  pause(): void {
    if (!this.running()) return;

    this.running.set(false);
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.endTime = null;
  }

  resume(): void {
    if (this.running() || this.remaining() === 0) return;

    this.running.set(true);
    this.endTime = Date.now() + this.remaining() * 1000;
    this.audioService.initAudioContext();

    this.intervalId = setInterval(() => {
      const now = Date.now();
      const remainingMs = (this.endTime || 0) - now;
      
      if (remainingMs <= 0) {
        this.complete();
      } else {
        this.remaining.set(Math.ceil(remainingMs / 1000));
      }
    }, 100);
  }

  reset(): void {
    this.pause();
    this.totalDuration.set(0);
    this.remaining.set(0);
    this.endTime = null;
  }

  toggle(): void {
    if (this.running()) {
      this.pause();
    } else if (this.remaining() > 0) {
      this.resume();
    }
  }

  // Add time
  addTime(seconds: number): void {
    const newRemaining = this.remaining() + seconds;
    this.remaining.set(newRemaining);
    
    if (this.running() && this.endTime) {
      this.endTime = Date.now() + newRemaining * 1000;
    }
  }

  // Remove time
  removeTime(seconds: number): void {
    const newRemaining = Math.max(0, this.remaining() - seconds);
    this.remaining.set(newRemaining);
    
    if (this.running() && this.endTime) {
      this.endTime = Date.now() + newRemaining * 1000;
    }

    if (newRemaining === 0) {
      this.complete();
    }
  }

  private complete(): void {
    this.pause();
    this.remaining.set(0);
    this.audioService.playChimeSound();
    
    // Play alarm sound (multiple chimes)
    setTimeout(() => this.audioService.playChimeSound(), 500);
    setTimeout(() => this.audioService.playChimeSound(), 1000);
  }

  // Preset Operations
  addPreset(label: string, duration: number): void {
    const preset: TimerPreset = {
      id: Date.now().toString(),
      label,
      duration
    };
    this.presets.update(presets => [...presets, preset]);
    this.saveToStorage();
  }

  removePreset(id: string): void {
    this.presets.update(presets => presets.filter(p => p.id !== id));
    this.saveToStorage();
  }

  usePreset(duration: number): void {
    this.start(duration);
  }

  // Format time
  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      const hrsStr = String(hours).padStart(2, '0');
      const minsStr = String(minutes).padStart(2, '0');
      const secsStr = String(secs).padStart(2, '0');
      return `${hrsStr}:${minsStr}:${secsStr}`;
    }

    const minsStr = String(minutes).padStart(2, '0');
    const secsStr = String(secs).padStart(2, '0');
    return `${minsStr}:${secsStr}`;
  }

  // Persistence
  private saveToStorage(): void {
    try {
      localStorage.setItem('auratime_timer_presets', JSON.stringify(this.presets()));
    } catch (e) {
      console.warn('Could not save timer presets to localStorage', e);
    }
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem('auratime_timer_presets');
      if (data) {
        const parsed = JSON.parse(data) as TimerPreset[];
        if (parsed.length > 0) {
          this.presets.set(parsed);
        }
      }
    } catch (e) {
      console.warn('Could not load timer presets from localStorage', e);
    }
  }

  // Cleanup
  destroy(): void {
    this.pause();
  }
}
