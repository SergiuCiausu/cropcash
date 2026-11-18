import { describe, expect, it, vi } from 'vitest';
import { BOOT_RETRY_KEY, bootWorked, isChunkError, reloadOnce } from './boot-retry';

function tab() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
}
const chunk = Object.assign(new Error('Failed to fetch dynamically imported module: /_next/static/chunks/a.js'), { name: 'TypeError' });

describe('a page whose code will not load (FAIL-06)', () => {
  it('knows a missing script from any other failure', () => {
    expect(isChunkError(chunk)).toBe(true);
    expect(isChunkError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkError(new Error('Failed to load chunk /_next/a.js'))).toBe(true);
    expect(isChunkError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkError(new TypeError('x is not a function'))).toBe(false);
    expect(isChunkError(null)).toBe(false);
  });

  it('reloads once, then lets the page say it failed', () => {
    const store = tab();
    const reload = vi.fn();
    expect(reloadOnce(chunk, store, reload)).toBe(true);
    expect(reloadOnce(chunk, store, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload for a bug, which a reload would not fix', () => {
    const reload = vi.fn();
    expect(reloadOnce(new TypeError('boom'), tab(), reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload where it could not stop', () => {
    const reload = vi.fn();
    expect(reloadOnce(chunk, null, reload)).toBe(false);
    const full = { ...tab(), setItem: () => { throw new Error('quota'); } };
    expect(reloadOnce(chunk, full, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('allows another reload after a page that started', () => {
    const store = tab();
    reloadOnce(chunk, store, () => undefined);
    bootWorked(store);
    expect(store.getItem(BOOT_RETRY_KEY)).toBeNull();
  });
});
