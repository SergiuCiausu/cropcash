import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

describe('api', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(createApp(['http://localhost:5173'])).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
