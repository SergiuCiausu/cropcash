import { useEffect, useState } from 'react';
import type { FunctionResult } from '@cropcash/shared';
import { api } from '../api/client';

const PREFIX = 'cropcash.read.';

interface Saved<T> {
  data: T;
  savedAt: string;
}

export type ReadState<T> =
  | { status: 'loading'; data: null; savedAt: null }
  | { status: 'fresh'; data: T; savedAt: null }
  /** The last copy, because there's no internet or the server didn't answer. */
  | { status: 'saved'; data: T; savedAt: string }
  | { status: 'offline' | 'failed'; data: null; savedAt: null };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** Storage can be blocked, so nothing here may throw. */
export function readSaved<T>(store: Store, key: string): Saved<T> | null {
  try {
    return JSON.parse(store.getItem(PREFIX + key) ?? 'null') as Saved<T> | null;
  } catch {
    return null;
  }
}

export function saveRead(store: Store, key: string, data: unknown, savedAt: string) {
  try {
    store.setItem(PREFIX + key, JSON.stringify({ data, savedAt }));
  } catch {
    // Only the offline copy is lost.
  }
}

/** Runs on sign-out: a match list says something about the farm. */
export function clearSavedReads(store: Store = localStorage) {
  try {
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k) => k?.startsWith(PREFIX));
    keys.forEach((k) => store.removeItem(k!));
  } catch {
    // Nothing was saved.
  }
}

/** A read that needs the server, with the last copy to fall back on. */
export function useSavedRead<T>(name: string, input: object | null): ReadState<T> {
  const [state, setState] = useState<ReadState<T>>({ status: 'loading', data: null, savedAt: null });
  const body = input ? JSON.stringify(input) : null;

  useEffect(() => {
    if (body === null) return;
    let live = true;
    const key = `${name}:${body}`;
    const fallBack = (status: 'offline' | 'failed') => {
      const saved = readSaved<T>(localStorage, key);
      if (!live) return;
      setState(saved ? { status: 'saved', ...saved } : { status, data: null, savedAt: null });
    };
    setState({ status: 'loading', data: null, savedAt: null });
    if (!navigator.onLine) {
      fallBack('offline');
      return;
    }
    api<FunctionResult<T>>(`/api/functions/${name}`, { method: 'POST', body })
      .then((result) => {
        if (!live) return;
        saveRead(localStorage, key, result.data, new Date().toISOString());
        setState({ status: 'fresh', data: result.data as T, savedAt: null });
      })
      .catch(() => fallBack('failed'));
    return () => {
      live = false;
    };
  }, [name, body]);

  return state;
}
