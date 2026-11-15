/*
 * npm run geo:siruta [-- --db] — the places of Teleorman and Constanța (docs/harta-plan.md, step 1b).
 * 1. Reads INS's SIRUTA register (docs/data/siruta-tr-ct.json → meta.source_url; kept in data-cache/siruta/).
 * 2. Reads the villages' points from OpenStreetMap through Overpass, matched by `siruta:code`
 *    (kept in data-cache/osm/<county>.json; ODbL, credited in the map's attribution).
 * 3. Writes docs/data/siruta-tr-ct.json, which ships with the app: the labels work offline and on Ion's farm.
 * 4. With --db, also writes siruta_units (migration 034) to SUPABASE_DB_URL.
 * The county numbers are read from the file, never typed. Safe to run again.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPlaces, displayName, parseOsmPlaces, parseSirutaCsv, plainName, type Place } from '../../packages/shared/src/plots/index';
import countiesFile from '../../docs/data/counties.json';
import { CACHE, DATA, arg, cachedText, counties, db, flag, politeFetch } from './common';

/** SIRUTA s1 2026 on data.gov.ro (INS), the newest release on 2026-11-15. */
const SIRUTA_URL = 'https://data.gov.ro/dataset/721c9059-5f87-4c79-9854-a1d5c18f58d5/resource/dac903f0-32b5-489a-89e7-2c80d96cf68d/download/siruta_s1_2026.csv';
const SIRUTA_VERSION = 'SIRUTA s1 2026';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const OUT = join(DATA, 'siruta-tr-ct.json');

const csvPath = arg('csv');
const csv = csvPath ? await readFile(csvPath, 'utf8') : await cachedText(join(CACHE, 'siruta', 'siruta_s1_2026.csv'), async () => (await politeFetch(SIRUTA_URL)).text());
const rows = parseSirutaCsv(csv);

/* INS's county number for each two-letter code, from the county rows (TIP 40) and docs/data/counties.json. */
const wanted = counties();
const jud: Record<number, string> = {};
for (const code of wanted) {
  const name = countiesFile.counties.find((c) => c.code === code)?.name_ro;
  const row = rows.find((r) => r.tip === 40 && name && plainName(displayName(r.name)) === plainName(name));
  if (!row) throw new Error(`county ${code} not found in the SIRUTA file`);
  jud[row.jud] = code;
}

const osm = [];
for (const code of wanted) {
  const query = `[out:json][timeout:120];area["ISO3166-2"="RO-${code}"]->.a;node(area.a)[place~"^(city|town|village|hamlet|suburb|locality)$"];out body;`;
  const text = await cachedText(join(CACHE, 'osm', `${code}.json`), async () => (await politeFetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: query }) })).text());
  osm.push(...parseOsmPlaces(JSON.parse(text)));
}

const { places, unknownTips, withoutPoint } = buildPlaces(rows, jud, osm);
if (unknownTips.length) throw new Error(`TIP codes not in docs/data/siruta-types.json: ${unknownTips.join(', ')}. Check INS's legend.`);

const columns = ['siruta', 'name', 'kind', 'seat', 'county', 'parent', 'commune', 'lng', 'lat'] as const;
const compact = (p: Place) => [p.siruta, p.name, p.kind, p.seat ? 1 : 0, p.county, p.parent, p.commune, p.at?.[0] ?? null, p.at?.[1] ?? null];
const counts = Object.fromEntries(wanted.map((c) => [c, places.filter((p) => p.county === c).length]));
const file = {
  meta: {
    description:
      'Localitățile din Teleorman și Constanța (docs/harta-plan.md, pasul 1b): codul SIRUTA, numele, ce e (sat, comună, oraș…), comuna de care ține și punctul de pe hartă. Fișierul e generat de npm run geo:siruta, nu se scrie de mână. Îl citește aplicația, ca să spună „satul Măldăeni, comuna Măldăeni” și fără internet.',
    source: `INS, ${SIRUTA_VERSION} (data.gov.ro)`,
    source_url: SIRUTA_URL,
    source_version: SIRUTA_VERSION,
    points_source: 'OpenStreetMap (© OpenStreetMap contributors, ODbL), prin Overpass, potrivit după eticheta siruta:code',
    names_note: 'INS scrie numele cu majuscule. Când OSM are același nume scris corect („Măldăeni”), îl luăm de acolo; altfel îl scriem noi din cel de la INS (displayName). Ș și Ț cu virgulă, nu cu sedilă.',
    generated_on: new Date().toISOString().slice(0, 10),
    counts,
    without_point: withoutPoint,
    status: 'oficial',
  },
  columns,
  places: places.sort((a, b) => a.siruta - b.siruta).map(compact),
};
await writeFile(OUT, `${JSON.stringify({ ...file, places: '__PLACES__' }, null, 2).replace('"__PLACES__"', `[\n${file.places.map((p) => `    ${JSON.stringify(p)}`).join(',\n')}\n  ]`)}\n`);
console.log(`wrote ${OUT}: ${places.length} places (${Object.entries(counts).map(([c, n]) => `${c} ${n}`).join(', ')}), ${withoutPoint.length} without a point: ${withoutPoint.join(', ')}`);

if (flag('db')) {
  const client = await db();
  const byCode = new Map(rows.map((r) => [r.siruta, r]));
  try {
    await client.query('begin');
    for (const p of places) {
      const r = byCode.get(p.siruta)!;
      await client.query(
        `insert into public.siruta_units (siruta, name, name_ins, name_search, tip, kind, seat, county, parent_siruta, commune_siruta, urban, location, source_version)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, case when $12::float8 is null then null else extensions.st_setsrid(extensions.st_point($12, $13), 4326) end, $14)
         on conflict (siruta) do update set name = excluded.name, name_ins = excluded.name_ins, name_search = excluded.name_search, tip = excluded.tip,
           kind = excluded.kind, seat = excluded.seat, county = excluded.county, parent_siruta = excluded.parent_siruta,
           commune_siruta = excluded.commune_siruta, urban = excluded.urban, location = excluded.location, source_version = excluded.source_version`,
        [p.siruta, p.name, r.name, plainName(p.name), r.tip, p.kind, p.seat, p.county, p.parent, p.commune, r.urban, p.at?.[0] ?? null, p.at?.[1] ?? null, SIRUTA_VERSION],
      );
    }
    await client.query('commit');
    console.log(`siruta_units: ${places.length} rows`);
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    await client.end();
  }
}
