import { Injectable, signal, computed, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AudioService } from './audio.service';
import { TaskService } from './task.service';
import { AnalyticsService } from './analytics.service';
import { TickService } from './screen/tick.service';
import { LOCKS_API, LOCK_POMODORO_CREDIT } from './web-locks';

export type PomodoroPhase = 'work' | 'break';

export interface PomodoroSession {
  id: string;
  startTime: Date;
  endTime: Date;
  phase: PomodoroPhase;
  duration: number;
}

/** Shape stored under `auratime_pomodoro`. */
interface PomodoroPersistedState {
  phase: PomodoroPhase;
  running: boolean;
  /** Epoch ms when the current phase ends; only meaningful while running. */
  endTime: number | null;
  remainingSec: number;
  workDuration: number;
  breakDuration: number;
  /**
   * End time of the last phase whose credit (task + analytics) was already granted.
   * Shared between tabs so two open windows never credit the same phase twice.
   */
  lastCompletedEnd?: number;
}

const STORAGE_KEY = 'auratime_pomodoro';
/** Safety cap when catching up after a long suspension (sleep, throttled tab). */
const MAX_CATCH_UP_PHASES = 20;

@Injectable({
  providedIn: 'root'
})
export class PomodoroService {
  private audioService = inject(AudioService);
  private taskService = inject(TaskService);
  private analyticsService = inject(AnalyticsService);
  private tickService = inject(TickService);
  private locks = inject(LOCKS_API);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** A phase end is being settled (maybe waiting for the cross-window lock). */
  private completing = false;
  private catchUpDepth = 0;

  // Timer State
  private remaining = signal<number>(25 * 60); // seconds left in the current phase
  private running = signal<boolean>(false);
  private phase = signal<PomodoroPhase>('work');
  /** Epoch ms at which the running phase ends. Source of truth while running. */
  private endTime = signal<number | null>(null);
  private lastCompletedEnd = signal<number>(0);

  // Configuration
  private workDuration = signal<number>(25);
  private breakDuration = signal<number>(5);

  // Session History
  private sessions = signal<PomodoroSession[]>([]);

  // Computed values
  currentTime = computed(() => {
    const total = this.remaining();
    const mins = String(Math.floor(total / 60)).padStart(2, '0');
    const secs = String(total % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  });

  isRunning = computed(() => this.running());
  currentPhase = computed(() => this.phase());
  totalSeconds = computed(() => this.remaining());
  /** Epoch ms when the running phase ends, or null when paused. */
  phaseEndTime = computed(() => this.endTime());
  sessionHistory = computed(() => this.sessions());

  constructor() {
    if (this.isBrowser) {
      this.restore();

      effect(() => this.persist());

      // Keep several open tabs/windows (app + /screen) in sync
      window.addEventListener('storage', (event: StorageEvent) => {
        if (event.key === STORAGE_KEY && event.newValue) {
          this.applyRaw(event.newValue);
          this.syncRemaining();
        }
      });

      // The app was closed while a phase ran and that phase has ended since: settle it once and stop.
      this.settleRestoredPhase();

      // Driven by the shared tick so it keeps running without any component mounted.
      this.tickService.onTick(() => this.tick());
      this.tick();
    }
  }

  private persist(): void {
    const state: PomodoroPersistedState = {
      phase: this.phase(),
      running: this.running(),
      endTime: this.endTime(),
      remainingSec: this.remaining(),
      workDuration: this.workDuration(),
      breakDuration: this.breakDuration(),
      lastCompletedEnd: this.lastCompletedEnd()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  private restore(): void {
    try {
      this.applyRaw(localStorage.getItem(STORAGE_KEY));
    } catch (e) {}
  }

  private applyRaw(data: string | null): void {
    try {
      if (!data) return;
      const s = JSON.parse(data) as Partial<PomodoroPersistedState>;

      if (typeof s.workDuration === 'number' && s.workDuration > 0) this.workDuration.set(s.workDuration);
      if (typeof s.breakDuration === 'number' && s.breakDuration > 0) this.breakDuration.set(s.breakDuration);
      if (s.phase === 'work' || s.phase === 'break') this.phase.set(s.phase);
      if (typeof s.remainingSec === 'number' && s.remainingSec >= 0) this.remaining.set(Math.floor(s.remainingSec));

      if (typeof s.lastCompletedEnd === 'number') this.lastCompletedEnd.set(s.lastCompletedEnd);

      if (s.running && typeof s.endTime === 'number') {
        this.endTime.set(s.endTime);
        this.running.set(true);
      } else {
        this.running.set(false);
        this.endTime.set(null);
      }
    } catch (e) {}
  }

  // Timer Operations
  toggle(): void {
    if (this.running()) {
      this.pause();
    } else {
      this.start();
    }
  }

  start(): void {
    if (this.running()) return;
    this.endTime.set(Date.now() + this.remaining() * 1000);
    this.running.set(true);
    this.audioService.initAudioContext();
  }

  pause(): void {
    if (!this.running()) return;
    this.syncRemaining();
    this.running.set(false);
    this.endTime.set(null);
  }

  reset(): void {
    this.running.set(false);
    this.endTime.set(null);
    this.phase.set('work');
    this.remaining.set(this.workDuration() * 60);
  }

  /**
   * Recomputes the remaining time from the absolute end time and settles phases that have ended. Safe to call
   * as often as needed. While the app stays open, a long gap (throttled tab, sleep) is caught up phase by phase.
   */
  tick(): void {
    if (!this.running() || this.completing) return;
    const end = this.endTime();
    if (end === null) return;

    if (Date.now() < end) {
      this.catchUpDepth = 0;
      this.syncRemaining();
      return;
    }

    this.completing = true;
    this.runExclusive(
      () => {
        // Checked again INSIDE the lock: another window may have credited this phase while we waited for it,
        // and the user may have paused or reset meanwhile.
        if (!this.running() || this.endTime() !== end) return;
        if (!this.adoptIfCompletedElsewhere(end)) this.completePhase(end);
      },
      () => {
        this.completing = false;
        if (this.catchUpDepth++ < MAX_CATCH_UP_PHASES) this.tick();
        else this.catchUpDepth = 0;
      }
    );
  }

  /**
   * Runs `work` while holding the cross-window credit lock, so two open windows can never both credit the
   * same phase. Without the Web Locks API it just runs the work directly.
   */
  private runExclusive(work: () => void, done?: () => void): void {
    const locks = this.locks;
    if (!locks) {
      try {
        work();
      } finally {
        done?.();
      }
      return;
    }
    locks
      .request(LOCK_POMODORO_CREDIT, () => work())
      .catch(error => console.warn('[Pomodoro] could not settle the phase end', error))
      .finally(() => done?.());
  }

  /**
   * Restoring after the app was closed: if the phase that was running has ended, credit at most that one phase
   * (only a finished focus phase counts), dated to the day it ended, without a chime, and leave the timer
   * stopped on the next phase instead of replaying everything that happened while the app was closed.
   */
  private settleRestoredPhase(): void {
    const end = this.endTime();
    if (!this.running() || end === null || Date.now() < end) return;

    this.completing = true;
    this.runExclusive(
      () => {
        if (this.endTime() !== end) return;
        const alreadyCredited = this.adoptIfCompletedElsewhere(end) || this.lastCompletedEnd() >= end;
        const wasWork = this.phase() === 'work';
        if (!alreadyCredited) {
          const duration = wasWork ? this.workDuration() : this.breakDuration();
          this.saveSession(duration, end);
          if (wasWork) {
            this.taskService.incrementActiveTaskPomodoro();
            this.analyticsService.recordFocusSession(duration, new Date(end));
          }
        }
        // Whatever the other window did, this one ends up stopped on the phase that follows.
        const nextIsWork = (alreadyCredited ? this.phase() : (wasWork ? 'break' : 'work')) === 'work';
        this.phase.set(nextIsWork ? 'work' : 'break');
        this.remaining.set((nextIsWork ? this.workDuration() : this.breakDuration()) * 60);
        this.running.set(false);
        this.endTime.set(null);
        this.lastCompletedEnd.set(Math.max(this.lastCompletedEnd(), end));
        this.persist();
      },
      () => (this.completing = false)
    );
  }

  /** If the shared state shows this phase was already completed, adopt it instead of crediting again. */
  private adoptIfCompletedElsewhere(phaseEnd: number): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const stored = JSON.parse(raw) as Partial<PomodoroPersistedState>;
      if (typeof stored.lastCompletedEnd === 'number' && stored.lastCompletedEnd >= phaseEnd) {
        this.applyRaw(raw);
        return true;
      }
    } catch (e) {}
    return false;
  }

  private syncRemaining(): void {
    const end = this.endTime();
    if (this.running() && end !== null) {
      this.remaining.set(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    }
  }

  private completePhase(phaseEnd: number): void {
    const wasWork = this.phase() === 'work';
    const duration = wasWork ? this.workDuration() : this.breakDuration();

    // Save session to history
    this.saveSession(duration, phaseEnd);

    if (wasWork) {
      this.taskService.incrementActiveTaskPomodoro();
      this.analyticsService.recordFocusSession(duration);
    }

    // Play chime sound
    this.audioService.playChimeSound();

    // Switch phase; the next one starts exactly where this one ended (no drift).
    const nextPhase: PomodoroPhase = wasWork ? 'break' : 'work';
    const nextDuration = wasWork ? this.breakDuration() : this.workDuration();
    this.phase.set(nextPhase);
    this.remaining.set(nextDuration * 60);
    this.endTime.set(phaseEnd + nextDuration * 60000);
    this.lastCompletedEnd.set(phaseEnd);
    // Write synchronously so other tabs see it before their own next tick
    this.persist();
  }

  // Configuration
  setWorkDuration(minutes: number): void {
    this.workDuration.set(minutes);
    if (this.phase() === 'work' && !this.running()) {
      this.remaining.set(minutes * 60);
    }
  }

  setBreakDuration(minutes: number): void {
    this.breakDuration.set(minutes);
    if (this.phase() === 'break' && !this.running()) {
      this.remaining.set(minutes * 60);
    }
  }

  getWorkDuration(): number {
    return this.workDuration();
  }

  getBreakDuration(): number {
    return this.breakDuration();
  }

  // Session History
  private saveSession(duration: number, phaseEnd: number): void {
    const session: PomodoroSession = {
      id: phaseEnd.toString(),
      startTime: new Date(phaseEnd - duration * 60000),
      endTime: new Date(phaseEnd),
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
