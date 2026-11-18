import type { FUNCTIONS, FunctionResult } from '@cropcash/shared';
import { ApiError, type Api } from './client';

export interface WriteOptions {
  key?: string;
  version?: number | null;
}

function checkInput(fn: { input: { safeParse(value: unknown): { success: boolean } } }, input: unknown) {
  if (!fn.input.safeParse(input).success) throw new ApiError(0, 'invalid_input');
}

/**
 * The registry is the only way in, so the pages and the API check input the same way.
 * It arrives from engine.js, which keeps live.js small enough for the login page.
 */
export function createFunctions(api: Api, getFunctions: () => typeof FUNCTIONS) {
  const find = (name: string) => getFunctions().find((fn) => fn.name === name);

  return {
    async read<T = unknown>(name: string, input: unknown = {}): Promise<FunctionResult<T>> {
      const fn = find(name);
      if (!fn || fn.access !== 'read') throw new ApiError(0, 'unknown_function');
      checkInput(fn, input);
      return api<FunctionResult<T>>(`/api/functions/${name}`, { method: 'POST', body: JSON.stringify(input) });
    },

    /**
     * The page calls this after the farmer's tap. A failed write is never retried here.
     * `key` is the intent key (see intent.ts): sent as Idempotency-Key, the same on every retry.
     * `version` is what the page last saw (If-Match): a save over someone else's newer one gets 409.
     * A delete marked repeatSafe 'gone' that answers 404 was already done, so it resolves.
     */
    async write<T = unknown>(name: string, input: unknown = {}, options: WriteOptions = {}): Promise<T> {
      const fn = find(name);
      if (!fn || fn.access === 'read') throw new ApiError(0, 'unknown_function');
      checkInput(fn, input);
      const { method, path, body } = fn.request(input);
      const headers: Record<string, string> = {};
      if (options.key) headers['Idempotency-Key'] = options.key;
      if (options.version !== undefined && options.version !== null) headers['If-Match'] = String(options.version);
      try {
        return await api<T>(path, { method, headers, timeout: ('timeout' in fn && fn.timeout) || 'write', body: body === undefined ? undefined : JSON.stringify(body) });
      } catch (e) {
        if ('repeatSafe' in fn && fn.repeatSafe === 'gone' && e instanceof ApiError && e.status === 404) return undefined as T;
        throw e;
      }
    },
  };
}
