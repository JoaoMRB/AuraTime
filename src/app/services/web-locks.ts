import { InjectionToken } from '@angular/core';

/**
 * The Web Locks API (navigator.locks): locks shared by every window of the same origin. Injectable so
 * tests can use a fake; null where the API does not exist (very old browsers, insecure pages), in which
 * case callers fall back to doing the work directly.
 */
export const LOCKS_API = new InjectionToken<LockManager | null>('LOCKS_API', {
  providedIn: 'root',
  factory: () => (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null)
});

/** Lock names used by the app. */
export const LOCK_POMODORO_CREDIT = 'auratime-pomodoro-credit';
export const LOCK_DESK_DISPLAY = 'auratime-desk-display';
