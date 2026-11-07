import type { FUNCTIONS, FunctionResult } from '@cropcash/shared';
import { ApiError, type Api } from './client';

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

    /** The page calls this after the farmer's tap. A failed write is never retried here. */
    async write<T = unknown>(name: string, input: unknown = {}): Promise<T> {
      const fn = find(name);
      if (!fn || fn.access === 'read') throw new ApiError(0, 'unknown_function');
      checkInput(fn, input);
      const { method, path, body } = fn.request(input);
      return api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    },
  };
}
