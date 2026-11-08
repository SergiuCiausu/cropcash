/* Where each page lives. The farmer's app answers on /acasa, /salariu, …; Ion's example farm
   answers on the same pages under /ferma-lui-ion (docs/13-auth-demo-loading-plan.md §A).
   Pure: no window, no storage, so the pages and the tests use the same rules. */

export const DEMO_BASE = '/ferma-lui-ion';

/** The pages that exist in both places. /login and /onboarding have no copy under DEMO_BASE. */
export const DEMO_PAGES = [
  '/acasa',
  '/subventii',
  '/oportunitati',
  '/surse',
  '/calendar',
  '/prognoza',
  '/recolte',
  '/salariu',
  '/pensie',
  '/date-plan',
  '/bani',
] as const;

export type Mode = 'demo' | 'farm';

/** True on Ion's example farm. */
export function isDemoPath(pathname: string): boolean {
  return pathname === DEMO_BASE || pathname.startsWith(`${DEMO_BASE}/`);
}

export const modeOf = (pathname: string): Mode => (isDemoPath(pathname) ? 'demo' : 'farm');

/** The page, whatever the prefix: "/ferma-lui-ion/salariu" and "/salariu.html" are both "/salariu".
    Same rule app.js has used since farm-app: the last segment of the path. */
export function pageOf(pathname: string): string {
  const last = pathname.split('/').filter(Boolean).pop() ?? '';
  return `/${last.replace(/\.html$/, '')}`;
}

/** Where a page saves something on the phone. What a visitor does on Ion's farm stays apart from
    a real farm: "cropcash-harvests" becomes "cropcash-demo-harvests". It still starts with
    "cropcash", so signing out clears it too (clearFarmData in live/auth.ts). */
export function storageKey(key: string, mode: Mode): string {
  return mode === 'demo' && key.startsWith('cropcash-') && !key.startsWith(DEMO_KEY_PREFIX) ? `${DEMO_KEY_PREFIX}${key.slice('cropcash-'.length)}` : key;
}
export const DEMO_KEY_PREFIX = 'cropcash-demo-';

/** A link to an app page, kept inside the mode the visitor is in. Search and hash stay as they are.
    Anything that isn't one of DEMO_PAGES (login, the landing page, other sites) is left alone. */
export function appHref(path: string, mode: Mode): string {
  if (mode !== 'demo' || !path.startsWith('/') || isDemoPath(path)) return path;
  const cut = path.search(/[?#]/);
  const page = cut === -1 ? path : path.slice(0, cut);
  return (DEMO_PAGES as readonly string[]).includes(page) ? `${DEMO_BASE}${path}` : path;
}
