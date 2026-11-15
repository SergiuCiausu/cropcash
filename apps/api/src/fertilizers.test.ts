import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadData } from '@cropcash/shared';
import { createApp } from './app';
import type { Repo } from './db/repo';
import { CatalogueConflict, type FertilizerStore } from './db/fertilizers';

const data = loadData();
const verifyToken = async (token: string) =>
  token === 'editor' ? { userId: 'u-demo', email: 'Demo@Example.com' } : { userId: 'u1', email: 'ion@example.com' };
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const product = { type_id: 'a1-urea', brand: 'Uree 46', manufacturer: 'Azomureș', form: 'solid', n_total_bp: 4600 };

function setup(store: Partial<FertilizerStore> = {}) {
  const fertilizers: FertilizerStore = {
    read: vi.fn(async () => ({ types: [], products: [] })),
    addProduct: vi.fn(async () => {}),
    ...store,
  };
  const app = createApp({
    corsOrigins: [],
    verifyToken,
    repo: {} as Repo,
    data,
    getRates: async () => null,
    fertilizers: { store: fertilizers, editors: ['demo@example.com'] },
  });
  return { app, fertilizers };
}

describe('fertilizer catalogue', () => {
  it('is read by anyone signed in, and says who may edit', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/fertilizers')).status).toBe(401);
    expect((await request(app).get('/api/fertilizers').set(as('farmer'))).body).toMatchObject({ canEdit: false });
    expect((await request(app).get('/api/fertilizers').set(as('editor'))).body).toMatchObject({ canEdit: true });
  });

  it('takes new products only from an editor', async () => {
    const { app, fertilizers } = setup();
    const refused = await request(app).post('/api/fertilizers/products').set(as('farmer')).send(product);
    expect(refused.status).toBe(403);
    expect(fertilizers.addProduct).not.toHaveBeenCalled();

    const added = await request(app).post('/api/fertilizers/products').set(as('editor')).send(product);
    expect(added.status).toBe(201);
    expect(added.body).toEqual({ id: 'azomures-uree-46' });
    expect(fertilizers.addProduct).toHaveBeenCalledWith('azomures-uree-46', expect.objectContaining({ n_total_bp: 4600 }), 'u-demo');
  });

  it('refuses bad input and duplicates', async () => {
    const { app } = setup({ addProduct: vi.fn(async () => { throw new CatalogueConflict('dup'); }) });
    const bad = await request(app).post('/api/fertilizers/products').set(as('editor')).send({ ...product, n_total_bp: 46.5 });
    expect(bad.status).toBe(400);
    const dup = await request(app).post('/api/fertilizers/products').set(as('editor')).send(product);
    expect(dup.status).toBe(409);
  });
});
