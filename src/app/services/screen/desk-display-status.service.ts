import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TickService } from './tick.service';

/** localStorage key used by the Desk Display page to tell the other windows whether a display is connected. */
export const DESK_STATUS_KEY = 'auratime_screen_status';
/** The page republishes its status this often while it is open. */
export const DESK_STATUS_HEARTBEAT_MS = 5000;
/** A status older than this is ignored: the Desk Display window was closed (or its PC went to sleep). */
export const DESK_STATUS_STALE_MS = 20000;

interface StoredStatus {
  connected: boolean;
  at: number;
}

/**
 * Cross-window "is the Desk Display connected?" signal.
 * The Desk Display page publishes a heartbeat; the clock window (a different tab, with its own
 * serial state) reads it to show a connected / not connected indicator.
 */
@Injectable({
  providedIn: 'root'
})
export class DeskDisplayStatusService {
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private tick = inject(TickService);
  private destroyRef = inject(DestroyRef);
  private last = signal<StoredStatus | null>(null);

  /** True while a display is connected in some window and that window is still alive. */
  readonly connected = computed(() => {
    const status = this.last();
    return !!status && status.connected && this.tick.now().getTime() - status.at < DESK_STATUS_STALE_MS;
  });

  constructor() {
    if (!this.isBrowser) return;
    this.last.set(this.parse(localStorage.getItem(DESK_STATUS_KEY)));

    const onStorage = (event: StorageEvent) => {
      if (event.key === DESK_STATUS_KEY) this.last.set(this.parse(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    this.destroyRef.onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  /** Called by the Desk Display page: on every change and as a heartbeat. */
  publish(connected: boolean): void {
    if (!this.isBrowser) return;
    const status: StoredStatus = { connected, at: Date.now() };
    this.last.set(status);
    try {
      localStorage.setItem(DESK_STATUS_KEY, JSON.stringify(status));
    } catch {
      /* storage unavailable */
    }
  }

  private parse(raw: string | null): StoredStatus | null {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<StoredStatus>;
      return typeof value.connected === 'boolean' && typeof value.at === 'number'
        ? { connected: value.connected, at: value.at }
        : null;
    } catch {
      return null;
    }
  }
}
