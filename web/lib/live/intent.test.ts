import { describe, expect, it } from 'vitest';
import { newIntentKey } from './intent';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newIntentKey', () => {
  it('uses randomUUID when the page is on https', () => {
    const api = { randomUUID: () => 'from-random-uuid', getRandomValues: crypto.getRandomValues.bind(crypto) };
    expect(newIntentKey(api)).toBe('from-random-uuid');
  });

  it('makes a v4 UUID from getRandomValues on plain http, where randomUUID is missing', () => {
    const key = newIntentKey({ getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(key).toMatch(UUID_V4);
  });

  it('gives a new key each time', () => {
    expect(newIntentKey()).not.toBe(newIntentKey());
  });
});
