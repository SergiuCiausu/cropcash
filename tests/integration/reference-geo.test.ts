/* The local copy of SIRUTA and the blocs (migration 034, docs/harta-plan.md step 1b) on the database in
   .env, after `npm run geo:import`. Read-only. Skipped while the copy is empty, so it doesn't fail on a
   database the import hasn't run on (production, until APIA's terms are answered). */
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { dbLpisSource } from '../../apps/api/src/lpis/db';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { count } = await admin.from('lpis_blocs').select('fbid', { count: 'exact', head: true }).eq('county', 'TR');
const imported = (count ?? 0) > 0;

describe.skipIf(!imported)('the local copy of the blocs', () => {
  const lpis = dbLpisSource(admin);

  it('finds 153277-286 by the code and number on the paper, with its commune and village', async () => {
    const b = await lpis.bloc(153277, '286');
    expect(b).toMatchObject({ fbid: '153277-286', county: 'TR', uatSiruta: 153277, villageSiruta: 153286, villageMethod: 'only_village' });
    // By the village's code too: the paper may carry it.
    expect((await lpis.bloc(153286, '286'))?.fbid).toBe('153277-286');
  });

  it('finds it by a point inside it, and nothing at a point outside every bloc', async () => {
    const b = await lpis.bloc(153277, '286');
    const ring = (b!.geometry.type === 'Polygon' ? b!.geometry.coordinates : b!.geometry.coordinates[0]!)[0]!;
    const inside: [number, number] = [ring.reduce((s, p) => s + p[0]!, 0) / ring.length, ring.reduce((s, p) => s + p[1]!, 0) / ring.length];
    expect((await lpis.at(inside)).map((x) => x.fbid)).toContain('153277-286');
    expect(await lpis.at([28.65, 44.2])).toEqual([]); // the Black Sea, off Constanța
  });

  it('knows the communes of Teleorman and the middle of Măldăeni', async () => {
    expect((await lpis.communes('TR')).some((c) => c.siruta === 153277 && c.name === 'Măldăeni')).toBe(true);
    expect(await lpis.communeCentre(153277)).toEqual([expect.any(Number), expect.any(Number)]);
  });
});
