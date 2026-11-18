/* A page whose code won't load (docs/failure-handling-plan.md, FAIL-06). After a new deploy, a phone
   holding the old HTML asks for scripts that no longer exist. One reload fixes that, so it gets
   one, and a mark in this tab stops it from turning into a loop. */
export const BOOT_RETRY_KEY = 'cropcash-boot-retry';

type TabStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The ways browsers and bundlers say a script file could not be loaded. */
export function isChunkError(e: unknown): boolean {
  const { name = '', message = '' } = (e ?? {}) as { name?: string; message?: string };
  return name === 'ChunkLoadError' || /load(ing)? (css )?chunk|dynamically imported module|importing a module script failed/i.test(message);
}

/** Reloads once for a script that wouldn't load. False means the page should say it failed. */
export function reloadOnce(e: unknown, store: TabStore | null, reload: () => void): boolean {
  if (!store || !isChunkError(e)) return false;
  try {
    if (store.getItem(BOOT_RETRY_KEY)) return false;
    store.setItem(BOOT_RETRY_KEY, '1');
  } catch {
    return false; // Without the mark there would be no way to stop.
  }
  reload();
  return true;
}

/** The page started, so a later failure gets its own reload. */
export function bootWorked(store: TabStore | null) {
  try {
    store?.removeItem(BOOT_RETRY_KEY);
  } catch {
    /* no storage */
  }
}

/** sessionStorage, or null where the browser blocks it. */
export function tabStore(): TabStore | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}
