/** Status 0 means the request never got an answer. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(`API ${status}: ${code}`);
  }
}

export interface ApiOptions {
  apiUrl: string;
  /** The farmer's access token, or null when signed out. */
  getToken: () => Promise<string | null>;
  isOnline: () => boolean;
  fetchFn?: typeof fetch;
}

export type Api = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

/** Calls the API as the signed-in farmer. Nothing here retries or queues. */
export function createApi({ apiUrl, getToken, isOnline, fetchFn = fetch }: ApiOptions): Api {
  return async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    if (!isOnline()) throw new ApiError(0, 'offline');

    const headers = new Headers(init.headers);
    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    let res: Response;
    try {
      res = await fetchFn(`${apiUrl}${path}`, { ...init, headers });
    } catch {
      throw new ApiError(0, 'network');
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? 'unknown');
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  };
}
