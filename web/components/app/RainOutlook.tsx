'use client';
/* "Cât plouă în anii următori" (docs/rain-outlook-plan.md, step 5), under the next years in Prognoză.
   The years are calculated on the phone, from docs/data/rain-climatology.json and today's plan-params,
   so they work offline and on Ion's farm. The file is loaded on its own (~230 KB) so it doesn't slow
   the other pages; the service worker keeps it like every other file. The next months need a farm on
   the server (GET /api/rain-outlook); offline they show the last saved copy, like the weather card. */
import { useEffect, useMemo, useState } from 'react';
import { countyRainOutlook, rainYieldLink, RainOutlookSchema, type RainClimatology, type RainOutlook, type RainYieldLink } from '../../../packages/shared/src/weather/rain-climatology';
import type { MonthLean } from '../../../packages/shared/src/weather/rain-outlook';
import { date, num } from '../../lib/cc/format';
import { useFarm, useOnline, useStore, useView } from '../../lib/cc/react';
import { monthName, shortMonth } from '../../lib/ui/chart';

const MONTHS_KEY = 'cropcash.rain-outlook';

type View = NonNullable<ReturnType<typeof useView>>;
type Season = NonNullable<ReturnType<typeof countyRainOutlook>>['seasons'][number];

const monthWord = (m: number) => monthName(`2000-${String(m).padStart(2, '0')}`).split(' ')[0];
const ani = (n: number) => (n === 1 ? '1 an' : `${n} ${n >= 20 ? 'de ' : ''}ani`);
const LEAN: Record<MonthLean, string> = { drier: 'mai secetoasă', usual: 'ca de obicei', wetter: 'mai ploioasă' };

/** One row per set of months: crops that need rain in the same months share it. */
function rows(seasons: Season[], seasonDefs: { id: string; from_month: number; to_month: number }[], names: Map<string, string>, wanted: Set<string>) {
  const groups = new Map<string, { season: Season; crops: string[]; cropIds: string[]; from: number; to: number }>();
  for (const s of seasons) {
    if (!wanted.has(s.seasonId)) continue;
    const def = seasonDefs.find((d) => d.id === s.seasonId)!;
    const key = `${def.from_month}-${def.to_month}`;
    const g = groups.get(key);
    const isCrop = s.seasonId !== 'an';
    if (g) {
      g.crops.push(names.get(s.seasonId) ?? s.label);
      g.cropIds.push(s.seasonId);
    } else
      groups.set(key, {
        season: s,
        crops: isCrop ? [names.get(s.seasonId) ?? s.label] : [],
        cropIds: isCrop ? [s.seasonId] : [],
        from: def.from_month,
        to: def.to_month,
      });
  }
  return [...groups.values()].map((g) => ({
    ...g,
    title: g.crops.length === 0 ? 'Tot anul' : `${g.crops.join(' și ')}, ${monthWord(g.from)}–${monthWord(g.to)}`,
  }));
}

function Range({ s, top }: { s: Season; top: number }) {
  const pct = (mm: number) => `${Math.min(100, (mm / top) * 100).toFixed(1)}%`;
  return (
    <div className="rain-bar" aria-hidden="true">
      <span className="rain-dry" style={{ width: pct(s.dryBelowMm) }} />
      <span className="rain-band" style={{ left: pct(s.lowMm), width: `calc(${pct(s.highMm)} - ${pct(s.lowMm)})` }} />
      <span className="rain-usual" style={{ left: pct(s.usualMm) }} />
    </div>
  );
}

const tHa = (kg: number) => num(Math.round(kg / 100) / 10);
const joinRo = (xs: (string | number)[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} și ${xs[xs.length - 1]}` : String(xs[0] ?? ''));

/** Step 6: what the county's harvest did in dry seasons. Only where it clearly follows the rain. */
function YieldLinks({ links }: { links: { name: string; link: RainYieldLink }[] }) {
  return (
    <>
      {links.map(({ name, link }) => (
        <p key={link.cropId} className="rain-link">
          În anii secetoși ({joinRo(link.dryYears)}), recolta de {name.toLowerCase()} din județ a fost de {tHa(link.dryYieldKgHa!)} t/ha, față de {tHa(link.otherYieldKgHa!)} t/ha în ceilalți ani.
        </p>
      ))}
    </>
  );
}

function SeasonRow({ title, s, inTen, links }: { title: string; s: Season; inTen: number; links: { name: string; link: RainYieldLink }[] }) {
  const t = s.trend;
  const change = t ? Math.round(Math.abs(t.median) * 100) : 0;
  return (
    <li className="rain-row">
      <div className="rain-h">
        <h3>{title}</h3>
        <p>
          <b>{s.usualMm} mm</b> <small>de obicei</small>
        </p>
      </div>
      <Range s={s} top={s.highMm * 1.15} />
      <p>
        Între {s.lowMm} și {s.highMm} mm în {inTen} ani din 10, cel mai probabil {s.usualMm} mm.
      </p>
      <p className="note">
        Secetă, sub {s.dryBelowMm} mm: {ani(s.dryYears)} din {s.years}. Cei mai secetoși: {s.driest.map((d) => `${d.year} (${d.mm} mm)`).join(', ')}.
      </p>
      <YieldLinks links={links} />
      {t && (
        <p className="note">
          {t.applied && change > 0
            ? `${t.agreeing} din ${t.models} modele climatice arată ${t.median > 0 ? 'mai multă' : 'mai puțină'} ploaie, cam ${change}%. Cifrele de mai sus țin cont de asta.`
            : 'Modelele climatice nu se înțeleg încotro merge ploaia, așa că arătăm doar ce a fost.'}
        </p>
      )}
    </li>
  );
}

/** The next months, for a farm on the server only. */
function NextMonths({ county }: { county: string }) {
  const store = useStore()!;
  const online = useOnline();
  const kept = useMemo(() => {
    try {
      const parsed = RainOutlookSchema.safeParse(JSON.parse(localStorage.getItem(MONTHS_KEY) ?? 'null'));
      return parsed.success && parsed.data.countyCode === county && parsed.data.months ? parsed.data : null;
    } catch {
      return null;
    }
  }, [county]);
  const [state, setState] = useState<{ got: RainOutlook | null; failed: boolean }>({ got: kept, failed: false });
  useEffect(() => {
    let live = true;
    store.live
      .api('/api/rain-outlook')
      .then((raw) => {
        const fresh = RainOutlookSchema.parse(raw);
        if (fresh.months) {
          try {
            localStorage.setItem(MONTHS_KEY, JSON.stringify(fresh));
          } catch {
            /* shown for this visit */
          }
        }
        if (live) setState({ got: fresh.months ? fresh : kept, failed: !fresh.months });
      })
      .catch(() => live && setState({ got: kept, failed: true }));
    return () => {
      live = false;
    };
  }, [store, kept]);

  const { got, failed } = state;
  /* An old copy may hold months already gone. */
  const thisMonth = new Date().toISOString().slice(0, 7);
  const months = (got?.months ?? []).filter((m) => m.month > thisMonth);
  return (
    <div className="rain-months">
      <h3>Lunile următoare</h3>
      {months.length === 0 ? (
        <p className="note">{failed ? (online ? 'Nu am putut aduce prognoza pe luni acum. Încearcă mai târziu.' : 'Pornește internetul ca să vezi prognoza pe luni.') : 'Se încarcă…'}</p>
      ) : (
        <>
          <ul>
            {months.map((m) => (
              <li key={m.month} className={m.lean ? `lean-${m.lean}` : undefined}>
                <span>{shortMonth(m.month)}</span>
                <b>{m.lean ? LEAN[m.lean] : '–'}</b>
              </li>
            ))}
          </ul>
          <p className="note">Cum se arată luna față de cum e de obicei, după modelul european ECMWF. Pentru ploaie, o prognoză pe luni e doar o înclinație, nu o promisiune.</p>
          {(failed || got!.monthsStale) && got?.monthsFetchedAt && <p className="note">Date din {date(got.monthsFetchedAt.slice(0, 10))}. Pornește internetul ca să vezi ce e nou.</p>}
        </>
      )}
    </div>
  );
}

export function RainOutlookCard({ view, cropId }: { view: View; cropId?: string }) {
  const farm = useFarm();
  const data = view.data();
  const params = data.params.rain_outlook;
  const county = data.counties.counties.find((c) => c.code === view.farm.county || c.name_ro === view.farm.county);
  const [file, setFile] = useState<RainClimatology | null | 'failed'>(null);
  useEffect(() => {
    let live = true;
    import('../../../packages/shared/src/weather/rain-climatology-data')
      .then((m) => live && setFile(m.loadRainClimatology()))
      .catch(() => live && setFile('failed'));
    return () => {
      live = false;
    };
  }, []);

  if (!county) return null;
  const outlook = file && file !== 'failed' ? countyRainOutlook(file, county.code, params) : null;
  const names = new Map(data.crops.crops.map((c) => [c.id, c.name_ro]));
  const sown = cropId ? [cropId] : view.farm.parcels.map((p) => p.cropId);
  const seasonIds = new Set(params.seasons.items.map((s) => s.id));
  const wanted = new Set(['an', ...sown.filter((id) => seasonIds.has(id))]);
  const list = outlook ? rows(outlook.seasons, params.seasons.items, names, wanted) : [];
  /* Crop seasons first, then the whole year. */
  list.sort((a, b) => (a.crops.length === 0 ? 1 : 0) - (b.crops.length === 0 ? 1 : 0));
  const inTen = Math.round((params.high_percentile.value - params.low_percentile.value) / 10);
  /* Step 6: the county's harvests in dry seasons, only for crops whose yield clearly follows the rain. */
  const rainCounty = file && file !== 'failed' ? file.counties.find((c) => c.code === county.code) : undefined;
  const linksFor = (cropIds: string[]) =>
    rainCounty
      ? cropIds.flatMap((id) => {
          const link = rainYieldLink(rainCounty, id, data.crops.county_history, params, data.params.yield_history.min_years.value);          return link?.shown ? [{ name: names.get(id) ?? id, link }] : [];
        })
      : [];
  const yearsShown = params.outlook_years.value;
  const first = new Date().getFullYear() + 1;

  return (
    <section className="card s12 rain-card" id="ploaie">
      <div className="card-h">
        <h2>Cât plouă în anii următori</h2>
        <span>
          {first}–{first + yearsShown - 1}, județul {county.name_ro}
        </span>
      </div>
      <p className="lead">Nimeni nu știe cât va ploua într-un an anume. Îți arătăm cât plouă de obicei la tine, cât de des e secetă și încotro merge.</p>
      {file === null ? (
        <p className="note">Se încarcă…</p>
      ) : file === 'failed' ? (
        <p className="note">Pornește internetul o dată ca să se încarce istoricul de ploaie.</p>
      ) : !outlook ? (
        <p className="note">Încă strângem istoricul de ploaie pentru județul {county.name_ro}.</p>
      ) : (
        <>
          <ul className="rain-rows">
            {list.map((r) => (
              <SeasonRow key={r.title} title={r.title} s={r.season} inTen={inTen} links={linksFor(r.cropIds)} />
            ))}
          </ul>
          <p className="rain-key" aria-hidden="true">
            <span>
              <i className="k-dry" />
              secetă
            </span>
            <span>
              <i className="k-band" />
              {inTen} ani din 10
            </span>
            <span>
              <i className="k-usual" />
              de obicei
            </span>
          </p>
          <p className="note">
            Fiecare an din {first}–{first + yearsShown - 1} arată la fel aici, și e corect așa: nu se poate ști dinainte care dintre ei va fi secetos. Din ploaia din {list[0]?.season.fromYear}–{list[0]?.season.toYear}, la {county.seat_ro}. La câmp poate fi altfel.
          </p>
        </>
      )}
      {!!farm?.me && <NextMonths county={county.code} />}
      <p className="note">
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
          Date: Open-Meteo.com
        </a>
        {' · ERA5 (Copernicus) · modele climatice CMIP6 · ECMWF · recoltele din județ: INS'}
      </p>
    </section>
  );
}
