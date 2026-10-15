import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TickService } from './tick.service';

/** localStorage key used by the Desk Display page to tell the other windows whether a display is connected. */
export const DESK_STATUS_KEY = 'auratime_screen_status';
/** The page republishes its status this often while it is open. */
export const DESK_STATUS_HEARTBEAT_MS = 5000;
/** A status older than this is ignored: the Desk Display window was closed (or its PC went to sleep). */
export const DESK_STATUS_STALE_MS = 20000;
/**
 * Same, while the Desk Display page reports that it is hidden. Browsers then run its timers at most once a
 * second and, after a few minutes, about once a minute ("intensive throttling"), so the heartbeat arrives late
 * without anything being wrong. Three missed throttled beats are tolerated.
 */
export const DESK_STATUS_STALE_HIDDEN_MS = 180000;

interface StoredStatus {
  connected: boolean;
  at: number;
  /** The page was hidden (background tab, minimized) when it last reported. */
  hidden: boolean;
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
    if (!status || !status.connected) return false;
    const limit = status.hidden ? DESK_STATUS_STALE_HIDDEN_MS : DESK_STATUS_STALE_MS;
    return this.tick.now().getTime() - status.at < limit;
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
  publish(connected: boolean, hidden = false): void {
    if (!this.isBrowser) return;
    const status: StoredStatus = { connected, at: Date.now(), hidden };
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
      return typeof value.connected === 'boolean' && typeof value.at === 'number' && Number.isFinite(value.at)
        ? { connected: value.connected, at: value.at, hidden: value.hidden === true }
        : null;
    } catch {
      return null;
    }
  }
}
