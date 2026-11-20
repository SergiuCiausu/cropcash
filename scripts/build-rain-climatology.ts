/* Builds docs/data/rain-climatology.json (docs/rain-outlook-plan.md, step 3): per county, the rain of each
   season in every past year (ERA5, Open-Meteo Historical API) and each CMIP6 model's change for the next years
   (Open-Meteo Climate API). Run by hand, about once a year, never by the app.

   npm run weather:climatology                 every county still missing
   npm run weather:climatology -- TR TM        only these
   npm run weather:climatology -- --rebuild    recompute every county from the cache (and fetch what's missing)

   Each county costs about 900 + 850 "calls" on Open-Meteo's free tier (more than 2 weeks of data counts as
   several), which allows 600 a minute, 5 000 an hour and 10 000 a day. So without a key the script waits
   between requests, waits out the hourly limit, and stops at the daily one: run it again the next day and it
   carries on, because every response is kept in data-cache/rain/. With OPEN_METEO_API_KEY (Professional plan)
   it uses the customer servers and doesn't wait. The free tier is for non-commercial use only. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildRainCounty,
  loadData,
  modelWindow,
  parseClimateModels,
  parseDailyRain,
  RainClimatologySchema,
  type RainClimatology,
} from '@cropcash/shared';

const ROOT = join(import.meta.dirname, '..');
const CACHE = join(ROOT, 'data-cache', 'rain');
const OUT = join(ROOT, 'docs', 'data', 'rain-climatology.json');
const USER_AGENT = 'cropcash-rain-climatology/0.1 (yearly reference build)';

const KEY = process.env.OPEN_METEO_API_KEY?.trim() || '';
const host = (name: 'archive' | 'climate') => `https://${KEY ? 'customer-' : ''}${name}-api.open-meteo.com`;
/** One heavy request uses more than the free minute allowance, so pause a full minute after each. */
const PACE_MS = KEY ? 0 : 65_000;
const MODELS = ['CMCC_CM2_VHR4', 'FGOALS_f3_H', 'HiRAM_SIT_HR', 'MRI_AGCM3_2_S', 'EC_Earth3P_HR', 'MPI_ESM1_2_XR', 'NICAM16_8S'];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

class DailyLimitError extends Error {}

/** Fetches a URL once and keeps the body, so a stopped run resumes where it left off. */
async function cachedJson(file: string, url: string): Promise<unknown> {
  const path = join(CACHE, file);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    // not cached yet
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const full = KEY ? `${url}&apikey=${encodeURIComponent(KEY)}` : url;
    let res: Response;
    try {
      res = await fetch(full, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(180_000) });
    } catch (err) {
      console.warn(`  ${stamp()} ${file}: ${(err as Error).message}, retrying in 30 s`);
      await wait(30_000);
      continue;
    }
    const text = await res.text();
    if (res.ok) {
      await mkdir(CACHE, { recursive: true });
      await writeFile(path, text);
      await wait(PACE_MS);
      return JSON.parse(text);
    }
    const reason = (() => {
      try {
        return String((JSON.parse(text) as { reason?: unknown }).reason ?? text);
      } catch {
        return text.slice(0, 200);
      }
    })();
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${file}: ${reason}`);
    if (/daily/i.test(reason)) throw new DailyLimitError(reason);
    if (/hourly/i.test(reason)) {
      const now = new Date();
      const ms = (60 - now.getMinutes()) * 60_000 + 60_000;
      console.log(`  ${stamp()} hourly limit, waiting ${Math.round(ms / 60_000)} min`);
      await wait(ms);
    } else {
      console.log(`  ${stamp()} ${res.status} (${reason.slice(0, 60)}), waiting 65 s`);
      await wait(65_000);
    }
  }
  throw new Error(`${file}: gave up after 8 tries`);
}

async function readExisting(): Promise<RainClimatology | null> {
  try {
    return RainClimatologySchema.parse(JSON.parse(await readFile(OUT, 'utf8')));
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const rebuild = args.includes('--rebuild');
  const only = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());

  const data = loadData();
  const params = data.params.rain_outlook;
  const counties = data.counties.counties;
  const unknown = only.filter((c) => !counties.some((k) => k.code === c));
  if (unknown.length) throw new Error(`unknown county code(s): ${unknown.join(', ')}`);

  const thisYear = new Date().getFullYear();
  const history = { from: params.history_from_year.value, to: thisYear - 1 };
  const reference = { from: params.model_reference_years.from, to: params.model_reference_years.to };
  const future = modelWindow(thisYear + 1, params);
  const seasons = params.seasons.items;
  const metaSeasons = seasons.map(({ id, from_month, to_month }) => ({ id, from_month, to_month }));

  // Keep counties already built with the same settings; anything else is rebuilt.
  const existing = await readExisting();
  const sameBuild =
    existing !== null &&
    JSON.stringify([existing.meta.history_years, existing.meta.model_reference, existing.meta.model_window, existing.meta.seasons]) ===
      JSON.stringify([history, reference, future, metaSeasons]);
  if (existing && !sameBuild) console.log('Settings changed since the last build: every county is rebuilt.');
  const built = new Map((sameBuild && !rebuild ? existing.counties : []).map((c) => [c.code, c]));

  // Ion's county first, so the demo has real data even after a short run.
  const order = [...counties].sort((a, b) => (a.code === 'TR' ? -1 : b.code === 'TR' ? 1 : 0));
  const todo = order.filter((c) => (only.length ? only.includes(c.code) : !built.has(c.code)));
  console.log(
    `${todo.length} county(ies) to do, ${built.size} already built. History ${history.from}–${history.to}, ` +
      `models ${reference.from}–${reference.to} vs ${future.from}–${future.to}. ${KEY ? 'Paid key.' : 'Free tier, paced.'}`,
  );

  const write = async () => {
    const file: RainClimatology = {
      meta: {
        built_at: new Date().toISOString(),
        history_years: history,
        model_reference: reference,
        model_window: future,
        seasons: metaSeasons,
        sources: [
          'ERA5 reanalysis (Copernicus C3S), via Open-Meteo Historical Weather API',
          `CMIP6 HighResMIP (${MODELS.join(', ')}), bias-corrected, via Open-Meteo Climate API`,
        ],
        attribution: 'Weather data by Open-Meteo.com (CC BY 4.0); ERA5 by Copernicus C3S; climate models by the CMIP6 programme.',
        missing: counties.filter((c) => !built.has(c.code)).map((c) => c.code),
      },
      counties: counties.filter((c) => built.has(c.code)).map((c) => built.get(c.code)!),
    };
    await writeFile(OUT, JSON.stringify(RainClimatologySchema.parse(file), null, 1) + '\n');
  };

  try {
    for (const [i, county] of todo.entries()) {
      console.log(`${stamp()} [${i + 1}/${todo.length}] ${county.code} ${county.name_ro}`);
      const point = `latitude=${county.lat}&longitude=${county.lon}`;
      const histRaw = await cachedJson(
        `hist_${county.code}_${history.from}-${history.to}.json`,
        `${host('archive')}/v1/archive?${point}&start_date=${history.from}-01-01&end_date=${history.to}-12-31&daily=precipitation_sum&timezone=Europe%2FBucharest`,
      );
      const climRaw = await cachedJson(
        `clim_${county.code}_${reference.from}-${future.to}.json`,
        `${host('climate')}/v1/climate?${point}&start_date=${reference.from}-01-01&end_date=${future.to}-12-31&daily=precipitation_sum&models=${MODELS.join(',')}`,
      );
      const grid = histRaw as { latitude: number; longitude: number };
      built.set(
        county.code,
        buildRainCounty(county.code, { lat: grid.latitude, lon: grid.longitude }, parseDailyRain(histRaw), parseClimateModels(climRaw), seasons, {
          history,
          reference,
          future,
        }),
      );
      await write();
    }
  } catch (err) {
    await write();
    if (err instanceof DailyLimitError) {
      console.log(`\nDaily limit reached (${err.message}). ${built.size}/${counties.length} counties done. Run again tomorrow.`);
      return;
    }
    throw err;
  }
  await write();
  console.log(`\nDone. ${built.size}/${counties.length} counties in ${OUT}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
