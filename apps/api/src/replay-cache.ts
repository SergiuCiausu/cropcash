import { createHash } from 'node:crypto';

/** A short key for any request: the parts are JSON-encoded, then hashed. */
export const requestKey = (...parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

/**
 * Remembers the answer to a costly request for a few minutes, so the same request sent again (a tap
 * after a 502, a second tab) gets that answer instead of paying for another one
 * (docs/idempotency-plan.md, IDEM-13/14). A request still running is shared, not started twice.
 * Only answers are kept: a failure is forgotten at once, so a retry really retries.
 * Kept in memory: an API restart empties it, which only costs one more call.
 * `ttlMs: 0` keeps nothing after the call ends; it only joins calls that overlap.
 */
export class ReplayCache<T> {
  private done = new Map<string, { value: T; until: number }>();
  private running = new Map<string, Promise<T>>();

  constructor(
    private ttlMs: number,
    private max = 500,
    private now: () => number = Date.now,
  ) {}

  /** The answer kept or being made for this key, or undefined when there is none. */
  get(key: string): Promise<T> | undefined {
    const inFlight = this.running.get(key);
    if (inFlight) return inFlight;
    const hit = this.done.get(key);
    if (!hit) return undefined;
    if (hit.until <= this.now()) {
      this.done.delete(key);
      return undefined;
    }
    return Promise.resolve(hit.value);
  }

  /** The kept answer if there is one; otherwise runs `make` once, however many callers ask. */
  run(key: string, make: () => Promise<T>): Promise<T> {
    const known = this.get(key);
    if (known) return known;
    const p = make().then(
      (value) => {
        this.running.delete(key);
        if (this.ttlMs > 0) this.keep(key, value);
        return value;
      },
      (err: unknown) => {
        this.running.delete(key);
        throw err;
      },
    );
    this.running.set(key, p);
    return p;
  }

  private keep(key: string, value: T) {
    const now = this.now();
    for (const [k, v] of this.done) if (v.until <= now) this.done.delete(k);
    // Oldest first: a Map keeps insertion order.
    while (this.done.size >= this.max) this.done.delete(this.done.keys().next().value!);
    this.done.set(key, { value, until: now + this.ttlMs });
  }
}
