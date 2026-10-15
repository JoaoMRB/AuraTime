import { DestroyRef, inject } from '@angular/core';
/**
 * localStorage access that never throws. Browsers can refuse it (private windows, blocked site data,
 * a full quota) and every caller should simply carry on without saving, instead of crashing a page.
 */

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when the value could not be saved. */
export function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

/**
 * Calls `handler` with the new value when ANOTHER window changes `key` (a `storage` event), and stops when the
 * service that asked is destroyed. Must be called while the service is being constructed. Without the removal,
 * every destroyed instance (each test builds a fresh one) kept listening and reacting to later events.
 */
export function onStorageChange(key: string, handler: (newValue: string) => void): void {
  const listener = (event: StorageEvent) => {
    if (event.key === key && event.newValue) handler(event.newValue);
  };
  window.addEventListener('storage', listener);
  inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', listener));
}

const BACKUPS_KEPT = 3;

/**
 * Before a stored value is replaced by a fallback (or loses entries that failed validation), keep the raw text
 * under "<key>_corrupt_<timestamp>" so nothing the user had is lost for good. Only the newest few backups of a
 * key are kept, and the same text is never backed up twice (a `storage` event can repeat). Returns the backup
 * key, or null when nothing was written.
 */
export function backupCorrupt(key: string, raw: string | null): string | null {
  if (!raw) return null;
  try {
    const prefix = `${key}_corrupt_`;
    const existing: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (name && name.startsWith(prefix)) existing.push(name);
    }
    existing.sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));
    if (existing.some(name => localStorage.getItem(name) === raw)) return null;

    // strictly newer than every existing backup, even when several are made within the same millisecond
    const newest = existing.length ? Number(existing[existing.length - 1].slice(prefix.length)) : 0;
    const stamp = Math.max(Date.now(), newest + 1);
    const backupKey = prefix + stamp;
    localStorage.setItem(backupKey, raw);
    existing.push(backupKey);
    for (const old of existing.slice(0, Math.max(0, existing.length - BACKUPS_KEPT))) localStorage.removeItem(old);
    return backupKey;
  } catch {
    return null; // storage full or blocked: nothing more can be done
  }
}

/** JSON.parse that returns undefined instead of throwing. */
export function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** A plain object (not null, not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
