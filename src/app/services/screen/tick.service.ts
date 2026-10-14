import { Injectable, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Single source of time for the app: one 1 s interval shared by every consumer.
 * `now` is a signal for reactive reads; `onTick` is for imperative per-second work.
 */
@Injectable({
  providedIn: 'root'
})
export class TickService implements OnDestroy {
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(now: Date) => void>();

  readonly now = signal<Date>(new Date());

  constructor() {
    if (this.isBrowser) {
      this.intervalId = setInterval(() => this.emit(), 1000);
    }
  }

  /** Subscribe to the per-second tick. Returns an unsubscribe function. */
  onTick(listener: (now: Date) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const now = new Date();
    this.now.set(now);
    this.listeners.forEach(listener => listener(now));
  }

  ngOnDestroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
