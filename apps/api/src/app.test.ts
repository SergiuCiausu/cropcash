import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app';
import type { SupabaseFactory } from './db/supabase';

const fakeDb = (farmer: unknown = null): SupabaseFactory => ({
  forUser: vi.fn(() => ({
    from: () => ({ select: () => ({ maybeSingle: async () => ({ data: farmer, error: null }) }) }),
  })) as unknown as SupabaseFactory['forUser'],
  admin: vi.fn() as unknown as SupabaseFactory['admin'],
});

const verifyToken = async (token: string) => {
  if (token !== 'good-token') throw new Error('bad token');
  return { userId: 'user-1' };
};

const app = (db = fakeDb()) => createApp({ corsOrigins: ['http://localhost:5173'], verifyToken, db });

describe('api', () => {
  it('GET /api/health is public', async () => {
    const res = await request(app()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects requests without a token', async () => {
    const res = await request(app()).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('rejects invalid tokens', async () => {
    const res = await request(app()).get('/api/me').set('Authorization', 'Bearer forged');
    expect(res.status).toBe(401);
  });

  it('GET /api/me returns the user and queries Supabase as that user', async () => {
    const db = fakeDb({ id: 'farm-1', name: 'Ion' });
    const res = await request(app(db)).get('/api/me').set('Authorization', 'Bearer good-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'user-1', farmer: { id: 'farm-1', name: 'Ion' } });
    expect(db.forUser).toHaveBeenCalledWith('good-token');
    expect(db.admin).not.toHaveBeenCalled();
  });
});
