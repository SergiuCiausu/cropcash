/*
 * npm run geo:import runs this last (docs/harta-plan.md, step 1b): a report on what the import found, in
 * data-cache/geo-report.md, and the run's date and counts in docs/data/lpis.json (`import`).
 * Reads the database at SUPABASE_DB_URL; changes nothing there.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE, DATA, counties, db } from './common';

/** Blocs farther than this from their village are listed for a look (plan: 5 km). */
const FAR_M = 5000;

const client = await db();
const lines: string[] = [`# Geo import report (${new Date().toISOString().slice(0, 10)})`, ''];
const record: Record<string, unknown> = {};
const table = (head: string[], rows: unknown[][]) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)];

try {
  for (const county of counties()) {
    const q = async (sql: string) => (await client.query(sql, [county])).rows;
    const [{ blocs, ha }] = await q(`select count(*)::int as blocs, round(sum(net_area_m2) / 10000.0)::int as ha from lpis_blocs where county = $1`);
    const [{ units }] = await q(`select count(*)::int as units from siruta_units where county = $1`);
    lines.push(`## ${county}: ${blocs} blocs, ${ha} ha net, ${units} SIRUTA codes`, '');

    const odd = await q(`select b.siruta, count(*)::int as n, u.kind, u.name, u.commune_siruta
                           from lpis_blocs b left join siruta_units u on u.siruta = b.siruta
                          where b.county = $1 and (u.siruta is null or u.kind not in ('commune','town','municipality'))
                          group by b.siruta, u.kind, u.name, u.commune_siruta order by n desc`);
    lines.push('### LPIS codes that are not a UAT', '', odd.length ? 'Raised to their commune when SIRUTA knows them; the rest need a manual look.' : 'None.', '');
    if (odd.length) lines.push(...table(['code', 'blocs', 'SIRUTA kind', 'name', 'raised to'], odd.map((r) => [r.siruta, r.n, r.kind ?? '**not in SIRUTA**', r.name ?? '', r.commune_siruta ?? '**none**'])), '');

    const empty = await q(`select u.siruta, u.name, u.kind from siruta_units u where u.county = $1 and u.kind in ('commune','town','municipality')
                              and not exists (select 1 from lpis_blocs b where b.uat_siruta = u.siruta) order by u.name`);
    lines.push('### Communes and towns with no blocs', '', empty.length ? empty.map((r) => `- ${r.name} (${r.kind}, ${r.siruta})`).join('\n') : 'None.', '');

    const [{ invalid }] = await q(`select count(*)::int as invalid from lpis_blocs where county = $1 and (not extensions.st_isvalid(geom) or extensions.st_isempty(geom))`);
    lines.push(`### Invalid or empty outlines after ST_MakeValid: ${invalid}`, '');

    const methods = await q(`select coalesce(village_method, 'none') as method, count(*)::int as n from lpis_blocs where county = $1 group by 1 order by 2 desc`);
    lines.push('### Village, by method', '', ...table(['method', 'blocs'], methods.map((r) => [r.method, r.n])), '');

    const noPoint = await q(`select siruta, name from siruta_units where county = $1 and kind in ('village','component_locality') and location is null order by name`);
    lines.push('### Villages with no point', '', noPoint.length ? noPoint.map((r) => `- ${r.name} (${r.siruta})`).join('\n') : 'None.', '');

    const far = await client.query(
      `select b.fbid, v.name, b.village_distance_m from lpis_blocs b join siruta_units v on v.siruta = b.village_siruta
        where b.county = $1 and b.village_distance_m > $2 order by b.village_distance_m desc limit 50`,
      [county, FAR_M],
    );
    lines.push(`### Blocs more than ${FAR_M / 1000} km from their village (first 50)`, '', far.rows.length ? far.rows.map((r) => `- ${r.fbid}: ${r.name}, ${(r.village_distance_m / 1000).toFixed(1)} km`).join('\n') : 'None.', '');

    const per = await q(`select u.name, count(*)::int as n from lpis_blocs b join siruta_units u on u.siruta = b.uat_siruta where b.county = $1 group by u.name order by u.name`);
    lines.push('### Blocs per commune', '', ...table(['commune', 'blocs'], per.map((r) => [r.name, r.n])), '');
    lines.push('UAT outlines (ANCPI) aren\'t imported yet, so "bloc outside its own UAT" isn\'t checked.', '');

    record[county] = { blocs, net_ha: ha, siruta_codes: units, not_uat_codes: odd.length, villages_by_method: Object.fromEntries(methods.map((r) => [r.method, r.n])) };
  }
} finally {
  await client.end();
}

await writeFile(join(CACHE, 'geo-report.md'), `${lines.join('\n')}\n`);
const lpisFile = join(DATA, 'lpis.json');
const lpis = JSON.parse(await readFile(lpisFile, 'utf8'));
lpis.import = { run_on: new Date().toISOString().slice(0, 10), counties: { ...(lpis.import?.counties ?? {}), ...record } };
await writeFile(lpisFile, `${JSON.stringify(lpis, null, 2)}\n`);
console.log(`wrote ${join(CACHE, 'geo-report.md')} and the counts in docs/data/lpis.json`);
