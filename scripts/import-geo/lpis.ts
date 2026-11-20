/*
 * npm run geo:lpis [-- --county TR] [--db] — APIA's blocuri fizice for a county (docs/harta-plan.md, step 1b).
 * 1. Asks how many blocs the county has, then pages through them (1 000 at a time, 1 request a second,
 *    retries with backoff). Each raw page is kept in data-cache/lpis/<year>/<county>/, so a failed run
 *    resumes where it stopped.
 * 2. Checks that the pages add up to the count before writing anything.
 * 3. With --db, writes lpis_blocs (migration 034) to SUPABASE_DB_URL in batches of 500, then fills each
 *    bloc's commune and village (geo_fill_places).
 *
 * APIA's terms for keeping a bulk copy are still open (docs/harta-plan.md, open question 1; lpis.json
 * terms_status). Until APIA answers, point SUPABASE_DB_URL at a dev database, never production.
 */
import { join } from 'node:path';
import { countyCountQuery, countyPageQuery, LPIS_SERVICE_URL, pageOffsets, parseBlocPage, parseCount, type LpisBlocRow, type ParsedPage } from '../../packages/shared/src/plots/index';
import lpisInfo from '../../docs/data/lpis.json';
import { CACHE, cachedText, counties, db, flag, politeJsonText, wait } from './common';

const YEAR = lpisInfo.layer_year;
const BATCH = 500;

async function county(code: string): Promise<{ rows: LpisBlocRow[]; skipped: ParsedPage['skipped'] }> {
  const dir = join(CACHE, 'lpis', String(YEAR), code);
  const count = parseCount(JSON.parse(await cachedText(join(dir, 'count.json'), async () => politeJsonText(countyCountQuery(LPIS_SERVICE_URL, code)))));
  const rows: LpisBlocRow[] = [];
  const skipped: ParsedPage['skipped'] = [];
  for (const offset of pageOffsets(count)) {
    const file = join(dir, `page-${String(offset).padStart(6, '0')}.json`);
    let fetched = false;
    const text = await cachedText(file, async () => {
      fetched = true;
      return politeJsonText(countyPageQuery(LPIS_SERVICE_URL, code, offset));
    });
    const page = parseBlocPage(JSON.parse(text), code);
    rows.push(...page.rows);
    skipped.push(...page.skipped);
    process.stdout.write(`\r${code}: ${rows.length + skipped.length} / ${count}`);
    if (fetched) await wait(1000);
  }
  process.stdout.write('\n');
  const seen = new Set(rows.map((r) => r.fbid));
  if (rows.length + skipped.length !== count || seen.size !== rows.length) {
    throw new Error(`${code}: the pages hold ${rows.length + skipped.length} blocs (${seen.size} distinct), the count says ${count}. Delete ${dir} and run again.`);
  }
  return { rows, skipped };
}

const write = flag('db');
const client = write ? await db() : null;
try {
  for (const code of counties()) {
    const { rows, skipped } = await county(code);
    console.log(`${code}: ${rows.length} blocs, ${skipped.length} left out (${[...new Set(skipped.map((s) => s.why))].join(', ') || 'none'})`);
    if (!client) continue;
    await client.query('begin');
    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        await client.query(
          `insert into public.lpis_blocs (fbid, siruta, county, uat_name, land_use, land_use_2, net_area_m2, geom, layer_year)
           select r.fbid, r.siruta, r.county, r.uat_name, r.land_use, r.land_use_2, r.net_area_m2,
                  extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(r.geometry::text), 4326)), 3)),
                  $2
             from jsonb_to_recordset($1::jsonb) as r(fbid text, siruta int, county text, uat_name text, land_use text, land_use_2 text, net_area_m2 bigint, geometry jsonb)
           on conflict (fbid) do update set siruta = excluded.siruta, county = excluded.county, uat_name = excluded.uat_name,
             land_use = excluded.land_use, land_use_2 = excluded.land_use_2, net_area_m2 = excluded.net_area_m2,
             geom = excluded.geom, layer_year = excluded.layer_year, imported_at = now()`,
          [JSON.stringify(batch), YEAR],
        );
        process.stdout.write(`\r${code}: wrote ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
      }
      process.stdout.write('\n');
      const filled = await client.query('select public.geo_fill_places($1) as counts', [code]);
      await client.query('commit');
      console.log(`${code}: villages by method`, filled.rows[0].counts);
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  }
} finally {
  await client?.end();
}

