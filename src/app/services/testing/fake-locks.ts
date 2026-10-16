/**
 * In-memory stand-in for navigator.locks: exclusive locks, `ifAvailable`, a FIFO queue and abort signals.
 * Callbacks always run asynchronously (like the real API). `beforeGrant` lets a test simulate another
 * window doing work in the instant between "asked for the lock" and "got it".
 */
export class FakeLockManager {
  readonly requests: string[] = [];
  /** Called right before the callback of a granted request runs. */
  beforeGrant: ((name: string) => void) | null = null;

  private held = new Set<string>();
  private queues = new Map<string, Array<() => void>>();

  isHeld(name: string): boolean {
    return this.held.has(name);
  }

  request<T>(name: string, a: unknown, b?: unknown): Promise<T> {
    const options = (typeof a === 'function' ? {} : a) as { ifAvailable?: boolean; signal?: AbortSignal };
    const callback = (typeof a === 'function' ? a : b) as (lock: unknown) => T | Promise<T>;
    this.requests.push(name);

    return new Promise<T>((resolve, reject) => {
      const grant = () => {
        this.held.add(name);
        Promise.resolve()
          .then(() => {
            this.beforeGrant?.(name);
            return callback({ name, mode: 'exclusive' });
          })
          .then(resolve, reject)
          .finally(() => {
            this.held.delete(name);
            this.queues.get(name)?.shift()?.();
          });
      };

      if (!this.held.has(name)) {
        grant();
        return;
      }
      if (options.ifAvailable) {
        Promise.resolve().then(() => callback(null)).then(resolve, reject);
        return;
      }
      const queue = this.queues.get(name) ?? this.queues.set(name, []).get(name)!;
      const entry = () => grant();
      queue.push(entry);
      options.signal?.addEventListener('abort', () => {
        const i = queue.indexOf(entry);
        if (i >= 0) queue.splice(i, 1);
        reject(new DOMException('The request was aborted.', 'AbortError'));
      });
    });
  }
}

/** Lets the promise callbacks of the fake lock manager run. */
export async function flushLocks(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
