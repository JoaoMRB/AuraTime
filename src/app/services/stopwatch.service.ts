import { Injectable, signal, computed, inject } from '@angular/core';
import { AudioService } from './audio.service';

export interface Lap {
  id: string;
  lapNumber: number;
  splitTime: number; // Time when lap was recorded
  totalTime: number; // Total elapsed time
}

@Injectable({
  providedIn: 'root'
})
export class StopwatchService {
  private audioService = inject(AudioService);

  // Timer State
  private elapsed = signal<number>(0); // in milliseconds
  private running = signal<boolean>(false);
  private startTime = signal<number>(0);
  private lastLapTime = signal<number>(0);
  
  // Laps
  private laps = signal<Lap[]>([]);
  private lapCounter = signal<number>(0);

  // Computed values
  currentTime = computed(() => this.formatTime(this.elapsed()));
  isRunning = computed(() => this.running());
  allLaps = computed(() => this.laps());
  lapCount = computed(() => this.laps().length);

  // Private interval reference
  private intervalId: any = null;

  constructor() {}

  // Timer Operations
  start(): void {
    if (this.running()) return;
    
    this.running.set(true);
    this.startTime.set(Date.now() - this.elapsed());
    this.audioService.initAudioContext();
    
    this.intervalId = setInterval(() => {
      this.elapsed.set(Date.now() - this.startTime());
    }, 10); // Update every 10ms for precision
  }

  pause(): void {
    if (!this.running()) return;
    
    this.running.set(false);
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  reset(): void {
    this.pause();
    this.elapsed.set(0);
    this.startTime.set(0);
    this.lastLapTime.set(0);
    this.laps.set([]);
    this.lapCounter.set(0);
  }

  toggle(): void {
    if (this.running()) {
      this.pause();
    } else {
      this.start();
    }
  }

  // Lap Operations
  recordLap(): void {
    if (!this.running() && this.elapsed() === 0) return;

    const currentElapsed = this.elapsed();
    const splitTime = currentElapsed - this.lastLapTime();
    
    const lap: Lap = {
      id: Date.now().toString(),
      lapNumber: this.lapCounter() + 1,
      splitTime,
      totalTime: currentElapsed
    };

    this.laps.update(laps => [...laps, lap]);
    this.lapCounter.update(c => c + 1);
    this.lastLapTime.set(currentElapsed);
  }

  clearLaps(): void {
    this.laps.set([]);
    this.lapCounter.set(0);
    this.lastLapTime.set(0);
  }

  // Get formatted time string
  private formatTime(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((milliseconds % 1000) / 10);

    const minsStr = String(minutes).padStart(2, '0');
    const secsStr = String(seconds).padStart(2, '0');
    const centisStr = String(centiseconds).padStart(2, '0');

    return `${minsStr}:${secsStr}.${centisStr}`;
  }

  // Get lap time difference
  getLapDifference(lapId: string): string {
    const laps = this.laps();
    const index = laps.findIndex(l => l.id === lapId);
    if (index === -1) return '';

    const currentLap = laps[index];
    if (index === 0) {
      return this.formatTime(currentLap.splitTime);
    }

    const prevLap = laps[index - 1];
    const diff = currentLap.splitTime - prevLap.splitTime;
    return this.formatTime(diff);
  }

  // Get best lap
  getBestLap(): Lap | null {
    const laps = this.laps();
    if (laps.length === 0) return null;

    return laps.reduce((best, lap) => 
      lap.splitTime < best.splitTime ? lap : best
    );
  }

  // Get worst lap
  getWorstLap(): Lap | null {
    const laps = this.laps();
    if (laps.length === 0) return null;

    return laps.reduce((worst, lap) => 
      lap.splitTime > worst.splitTime ? lap : worst
    );
  }

  // Get average lap time
  getAverageLapTime(): number {
    const laps = this.laps();
    if (laps.length === 0) return 0;

    const total = laps.reduce((sum, lap) => sum + lap.splitTime, 0);
    return total / laps.length;
  }

  // Cleanup
  destroy(): void {
    this.pause();
  }
}
