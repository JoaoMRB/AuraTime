import { Injectable, signal, computed, inject } from '@angular/core';
import { AudioService } from './audio.service';

export type PomodoroPhase = 'work' | 'break';

export interface PomodoroSession {
  id: string;
  startTime: Date;
  endTime: Date;
  phase: PomodoroPhase;
  duration: number;
}

@Injectable({
  providedIn: 'root'
})
export class PomodoroService {
  private audioService = inject(AudioService);

  // Timer State
  private minutes = signal<number>(25);
  private seconds = signal<number>(0);
  private running = signal<boolean>(false);
  private phase = signal<PomodoroPhase>('work');
  
  // Configuration
  private workDuration = signal<number>(25);
  private breakDuration = signal<number>(5);
  
  // Session History
  private sessions = signal<PomodoroSession[]>([]);
  
  // Computed values
  currentTime = computed(() => {
    const mins = String(this.minutes()).padStart(2, '0');
    const secs = String(this.seconds()).padStart(2, '0');
    return `${mins}:${secs}`;
  });

  isRunning = computed(() => this.running());
  currentPhase = computed(() => this.phase());
  totalSeconds = computed(() => this.minutes() * 60 + this.seconds());
  sessionHistory = computed(() => this.sessions());

  constructor() {}

  // Timer Operations
  toggle(): void {
    if (this.running()) {
      this.pause();
    } else {
      this.start();
    }
  }

  start(): void {
    this.running.set(true);
    this.audioService.initAudioContext();
  }

  pause(): void {
    this.running.set(false);
  }

  reset(): void {
    this.running.set(false);
    this.phase.set('work');
    this.minutes.set(this.workDuration());
    this.seconds.set(0);
  }

  tick(): void {
    if (!this.running()) return;

    let sec = this.seconds();
    let min = this.minutes();

    sec--;
    if (sec < 0) {
      sec = 59;
      min--;
    }

    if (min < 0) {
      // Phase Complete! Switch phase
      this.completePhase();
      return;
    }

    this.seconds.set(sec);
    this.minutes.set(min);
  }

  private completePhase(): void {
    const wasWork = this.phase() === 'work';
    
    // Save session to history
    this.saveSession(wasWork ? this.workDuration() : this.breakDuration());

    // Play chime sound
    this.audioService.playChimeSound();

    // Switch phase
    if (wasWork) {
      this.phase.set('break');
      this.minutes.set(this.breakDuration());
    } else {
      this.phase.set('work');
      this.minutes.set(this.workDuration());
    }
    this.seconds.set(0);
  }

  // Configuration
  setWorkDuration(minutes: number): void {
    this.workDuration.set(minutes);
    if (this.phase() === 'work' && !this.running()) {
      this.minutes.set(minutes);
      this.seconds.set(0);
    }
  }

  setBreakDuration(minutes: number): void {
    this.breakDuration.set(minutes);
    if (this.phase() === 'break' && !this.running()) {
      this.minutes.set(minutes);
      this.seconds.set(0);
    }
  }

  getWorkDuration(): number {
    return this.workDuration();
  }

  getBreakDuration(): number {
    return this.breakDuration();
  }

  // Session History
  private saveSession(duration: number): void {
    const session: PomodoroSession = {
      id: Date.now().toString(),
      startTime: new Date(Date.now() - duration * 60000),
      endTime: new Date(),
      phase: this.phase(),
      duration
    };
    
    this.sessions.update(sessions => [...sessions, session]);
    
    // Keep only last 100 sessions
    if (this.sessions().length > 100) {
      this.sessions.update(sessions => sessions.slice(-100));
    }
  }

  getSessionCount(): number {
    return this.sessions().length;
  }

  getTotalFocusTime(): number {
    return this.sessions()
      .filter(s => s.phase === 'work')
      .reduce((total, s) => total + s.duration, 0);
  }

  getTodaySessions(): PomodoroSession[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.sessions().filter(s => 
      new Date(s.startTime) >= today
    );
  }

  clearHistory(): void {
    this.sessions.set([]);
  }

  // Quick presets
  setPreset(preset: 'classic' | 'long' | 'short'): void {
    switch (preset) {
      case 'classic':
        this.setWorkDuration(25);
        this.setBreakDuration(5);
        break;
      case 'long':
        this.setWorkDuration(50);
        this.setBreakDuration(10);
        break;
      case 'short':
        this.setWorkDuration(15);
        this.setBreakDuration(3);
        break;
    }
  }
}
