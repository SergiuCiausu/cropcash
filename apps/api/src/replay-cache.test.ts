import { describe, expect, it, vi } from 'vitest';
import { ReplayCache, requestKey } from './replay-cache';

describe('ReplayCache', () => {
  it('the same request again within the window gets the first answer, without a second call', async () => {
    const cache = new ReplayCache<string>(60_000);
    const make = vi.fn(async () => 'answer');
    expect(await cache.run('k', make)).toBe('answer');
    expect(await cache.run('k', make)).toBe('answer');
    expect(make).toHaveBeenCalledOnce();
  });

  it('two requests at once share one call', async () => {
    const cache = new ReplayCache<string>(60_000);
    let finish!: (v: string) => void;
    const make = vi.fn(() => new Promise<string>((done) => (finish = done)));
    const a = cache.run('k', make);
    const b = cache.run('k', make);
    finish('answer');
    expect(await Promise.all([a, b])).toEqual(['answer', 'answer']);
    expect(make).toHaveBeenCalledOnce();
  });

  it('forgets a failure, so a retry calls again', async () => {
    const cache = new ReplayCache<string>(60_000);
    const make = vi.fn().mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce('answer');
    await expect(cache.run('k', make)).rejects.toThrow('502');
    expect(cache.get('k')).toBeUndefined();
    expect(await cache.run('k', make)).toBe('answer');
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('calls again once the window has passed', async () => {
    let t = 0;
    const cache = new ReplayCache<string>(1_000, 10, () => t);
    const make = vi.fn(async () => `answer at ${t}`);
    await cache.run('k', make);
    t = 1_000;
    expect(await cache.run('k', make)).toBe('answer at 1000');
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('with ttl 0 it only joins calls that overlap', async () => {
    const cache = new ReplayCache<string>(0);
    const make = vi.fn(async () => 'answer');
    await cache.run('k', make);
    await cache.run('k', make);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('keeps at most `max` answers, dropping the oldest', async () => {
    const cache = new ReplayCache<string>(60_000, 2);
    for (const k of ['a', 'b', 'c']) await cache.run(k, async () => k);
    expect(cache.get('a')).toBeUndefined();
    expect(await cache.get('c')).toBe('c');
  });

  it('a key depends on every part', () => {
    expect(requestKey('u1', [1])).toBe(requestKey('u1', [1]));
    expect(requestKey('u1', [1])).not.toBe(requestKey('u2', [1]));
  });
});
