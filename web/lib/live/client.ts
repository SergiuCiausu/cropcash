/**
 * Status 0 means the request never got an answer. Its code says why:
 * 'offline' (not sent), 'network' (the connection failed), 'timeout' (sent, but no answer in time,
 * so the server may have done it).
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** From Retry-After on a 429 or 503: how long the server asked us to wait. */
    public retryAfterMs: number | null = null,
  ) {
    super(`API ${status}: ${code}`);
  }
}

/** How long a call may take depends on what it does (docs/failure-handling-plan.md, FAIL-01). */
export type TimeoutClass = 'read' | 'write' | 'money' | 'setup' | 'long' | 'health' | 'ai' | 'upload';
export type Timeouts = Record<TimeoutClass, number>;

type Seconds = { value: number };
/** The `network` block of plan-params.json, in milliseconds. */
export function timeoutsFrom(network: Record<`${TimeoutClass}_timeout_s`, Seconds>): Timeouts {
  const ms = (c: TimeoutClass) => network[`${c}_timeout_s`].value * 1000;
  return { read: ms('read'), write: ms('write'), money: ms('money'), setup: ms('setup'), long: ms('long'), health: ms('health'), ai: ms('ai'), upload: ms('upload') };
}

/** Retry-After is either seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** A fetch that gives up after `ms`, for callers outside the API client (Supabase, the ping, Surse). */
export function fetchWithTimeout(fetchFn: typeof fetch, ms: number): typeof fetch {
  return async (input, init = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new DOMException('No answer in time', 'TimeoutError')), ms);
    const outer = init.signal;
    const relay = () => ctrl.abort(outer?.reason);
    outer?.addEventListener('abort', relay, { once: true });
    try {
      return await fetchFn(input, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', relay);
    }
  };
}

export interface ApiOptions {
  apiUrl: string;
  /** The farmer's access token, or null when signed out. */
  getToken: () => Promise<string | null>;
  isOnline: () => boolean;
  fetchFn?: typeof fetch;
  /** Without them a call waits as long as the browser lets it (tests only). */
  timeouts?: Partial<Timeouts>;
}

export type ApiInit = RequestInit & { timeout?: TimeoutClass };
export type Api = <T = unknown>(path: string, init?: ApiInit) => Promise<T>;

/** Calls the API as the signed-in farmer. Nothing here retries or queues. */
export function createApi({ apiUrl, getToken, isOnline, fetchFn = fetch, timeouts = {} }: ApiOptions): Api {
  return async function api<T = unknown>(path: string, { timeout = 'read', ...init }: ApiInit = {}): Promise<T> {
    if (!isOnline()) throw new ApiError(0, 'offline');

    const headers = new Headers(init.headers);
    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    /* One clock for the whole call, the answer's body included: a body can stall too. */
    const ms = timeouts[timeout];
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = ms ? setTimeout(() => { timedOut = true; ctrl.abort(); }, ms) : undefined;
    const outer = init.signal;
    const relay = () => ctrl.abort(outer?.reason);
    outer?.addEventListener('abort', relay, { once: true });
    const failed = () => new ApiError(0, timedOut ? 'timeout' : 'network');

    try {
      let res: Response;
      try {
        res = await fetchFn(`${apiUrl}${path}`, { ...init, headers, signal: ctrl.signal });
      } catch {
        throw failed();
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (timedOut) throw failed();
        throw new ApiError(res.status, body.error ?? 'unknown', parseRetryAfter(res.headers.get('Retry-After')));
      }
      if (res.status === 204) return undefined as T;
      try {
        return (await res.json()) as T;
      } catch (e) {
        if (timedOut) throw failed();
        throw e;
      }
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', relay);
    }
  };
}
