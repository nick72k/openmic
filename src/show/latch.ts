/**
 * One-shot value that waiters can poll with a bounded wait.
 *
 *   fire(v) ──► resolves every current wait() with v; later wait()s return v at once
 *   reset()  ──► forgets v
 *   wait()   ──► v, or null after timeoutMs / abort
 */
export class Latch<T> {
  private value: T | null = null;
  private waiters: ((value: T | null) => void)[] = [];

  reset(): void {
    this.value = null;
  }

  fire(value: T): void {
    this.value = value;
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((w) => w(value));
  }

  wait(timeoutMs: number, signal?: AbortSignal): Promise<T | null> {
    if (this.value !== null) {
      return Promise.resolve(this.value);
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => finish(null), timeoutMs);

      const finish = (value: T | null): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.waiters = this.waiters.filter((w) => w !== finish);
        resolve(value);
      };

      const onAbort = (): void => finish(null);

      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(finish);
    });
  }
}
