/*
 * npm run seed:fertilizers — loads docs/data/fertilizers.json into fertilizer_types and
 * fertilizer_products (migration 024). Safe to run again: rows are upserted by id. Products an
 * editor added through the API (origin 'added') are never touched, and nothing is deleted.
 *
 * Needs in .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { FertilizersFileSchema } from '../packages/shared/src/fertilizers/model';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set (see .env.example)`);
  return v;
};
const db = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const file = FertilizersFileSchema.parse(
  JSON.parse(readFileSync(join(import.meta.dirname, '../docs/data/fertilizers.json'), 'utf8')),
);
const now = new Date().toISOString();

const types = await db
  .from('fertilizer_types')
  .upsert(file.types.map((t) => ({ ...t, updated_at: now })), { onConflict: 'id' });
if (types.error) throw new Error(`types: ${types.error.message}`);

// An id an editor already took stays theirs.
const added = await db.from('fertilizer_products').select('id').eq('origin', 'added');
if (added.error) throw new Error(`products: ${added.error.message}`);
const taken = new Set(added.data.map((r) => r.id as string));
const skipped = file.products.filter((p) => taken.has(p.id)).map((p) => p.id);

const products = await db.from('fertilizer_products').upsert(
  file.products.filter((p) => !taken.has(p.id)).map((p) => ({ ...p, origin: 'seed', updated_at: now })),
  { onConflict: 'id' },
);
if (products.error) throw new Error(`products: ${products.error.message}`);

console.log(`[seed:fertilizers] ${file.types.length} types, ${file.products.length - skipped.length} products`);
if (skipped.length) console.log(`[seed:fertilizers] left alone (added by an editor): ${skipped.join(', ')}`);
