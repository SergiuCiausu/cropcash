import planParams from '../../../docs/data/plan-params.json';
import { fetchWithTimeout } from '../live/client';

/* Is the internet really there? navigator.onLine says yes on a WiFi with no internet, so a failed
   /api/health counts too, and it's tried again every 30 s while it fails (web/legacy/app.js ping). */

export const PING_RETRY_MS = planParams.network.ping_retry_s.value * 1000;
const PING_TIMEOUT_MS = planParams.network.health_timeout_s.value * 1000;

export interface NetDeps {
  apiUrl: string;
  /** navigator.onLine. */
  browserOnline: () => boolean;
  fetchFn: typeof fetch;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
}

export function createNet(deps: NetDeps, onChange: (online: boolean) => void) {
  let pingFailed = false;
  let timer: unknown = null;
  const isOnline = () => deps.browserOnline() && !pingFailed;

  async function ping(): Promise<boolean> {
    const before = isOnline();
    try {
      /* A phone with signal but no data never answers, so without a limit it would count as online. */
      const res = await fetchWithTimeout(deps.fetchFn, PING_TIMEOUT_MS)(`${deps.apiUrl}/api/health`, { cache: 'no-store' });
      pingFailed = !res.ok;
    } catch {
      pingFailed = true;
    }
    deps.clearTimer(timer);
    timer = null;
    if (pingFailed && deps.browserOnline()) timer = deps.setTimer(() => void ping(), PING_RETRY_MS);
    if (before !== isOnline()) onChange(isOnline());
    return isOnline();
  }

  /** The browser's online event: trust it, then check. */
  function browserOnline() {
    pingFailed = false;
    onChange(isOnline());
    return ping();
  }

  function browserOffline() {
    onChange(isOnline());
  }

  return { isOnline, ping, browserOnline, browserOffline, stop: () => deps.clearTimer(timer) };
}

export type Net = ReturnType<typeof createNet>;
