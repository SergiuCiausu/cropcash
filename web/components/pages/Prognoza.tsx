'use client';
/* "Prognoză": get_forecast and get_tight_months, plus crop figures from the plan (was
   web/legacy/prognoza.js). It's all calculated on the phone, from the saved data, so it works offline. */
import { useEffect, useMemo, useState } from 'react';
import { firstYearsTotal } from '../../../packages/shared/src/cashflow/scenarios';
import { cropSeason } from '../../../packages/shared/src/cashflow/seasons';
import { about, cents, exact, ha } from '../../lib/cc/format';
import { useMoney, useView } from '../../lib/cc/react';
import { chartRows, monthName, YEARS, yearEnds, yearName, type ChartRow, type Year } from '../../lib/ui/chart';
import { monthLabel } from '../../lib/ui/seasons';
import { OfflineNote, useHref } from '../app/bits';
import { CropBreakdown } from '../app/CropBreakdown';
import FarmChart from '../app/FarmChart';
import { PageLink } from '../app/Frame';
import { CompareTable, FutureNote } from '../app/PageNotes';

const KIND: Record<Year, string> = { bad: 'Ani slabi', medium: 'Ani normali', good: 'Ani buni' };
const anii = (n: number) => (n === 1 ? '1 an' : `${n} ${n >= 20 ? 'de ' : ''}ani`);
const shortMonth = (key: string) => monthLabel(key).split(' ')[0];

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function YearChips({ year, onPick }: { year: Year; onPick: (y: Year) => void }) {
  return (
    <>
      {YEARS.map(([k, label]) => (
        <button key={k} type="button" className="chip" aria-pressed={k === year} onClick={() => onPick(k)}>
          {label}
        </button>
      ))}
    </>
  );
}

type Entry = { direction: string; kind: string; cropId?: string; what?: string; value: number };

export default function Prognoza() {
  const view = useView('picked')!;
  const money = useMoney();
  const { text: t, signed: lei } = money;
  const href = useHref();
  const data = view.data();
  const plan = useMemo(() => view.farmPlan(), [view]);
  const long = view.longForecast();
  const maxYears = data.params.long_forecast.max_years.value;
  const [year, setYear] = useState<Year>('medium');
  const [n, setN] = useState(maxYears);
  const crop = view.crop;
  const h = view.selected;
  const cropsById = new Map(data.crops.crops.map((c) => [c.id, c]));
  const nameOf = (id: string | undefined) => (id ? cropsById.get(id)?.name_ro : undefined);

  useEffect(() => {
    if (location.hash === '#ani') document.getElementById('ani')?.scrollIntoView();
  }, []);

  const sum = (months: { in: number; out: number }[], key: 'in' | 'out') => months.reduce((s, m) => s + m[key], 0);
  function totals(entries: Entry[], direction: 'in' | 'out') {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.direction !== direction) continue;
      const label = e.kind === 'apia_advance' || e.kind === 'apia_balance' ? 'APIA' : (crop && e.direction === 'out' && e.what) || nameOf(e.cropId) || 'Altele';
      map.set(label, (map.get(label) ?? 0) + e.value);
    }
    return [...map].sort((a, b) => b[1] - a[1]);
  }
  const bars = (list: [string, number][], total: number) =>
    list.map(([label, value]) => (
      <li key={label}>
        <span>{label}</span>
        <b>{t(`${exact(value)} lei`)}</b>
        <span className="meter">
          <i style={{ width: `${Math.round((value / (total || 1)) * 100)}%` }} />
        </span>
      </li>
    ));

  const t12 = plan.timelines[year];
  const normal = plan.timelines.medium;
  const name = yearName(year);
  const months = crop ? crop.months(t12) : t12.months;
  const entries = months.flatMap((m) => m.entries) as Entry[];
  const inSum = sum(months, 'in');
  const outSum = sum(months, 'out');
  const last = t12.months[t12.months.length - 1];

  /* The next years. A crop has no balance of its own: the account is under Toată ferma. */
  const upTo = (k: Year, count: number) => firstYearsTotal(long[k], count);
  const longTotal = upTo(year, n);
  const longLast = long[year][n - 1];

  const rows = chartRows(plan, year);
  const low = rows.find((r) => r.long === monthName(t12.lowest.key))!;
  const longRows: ChartRow[] = [
    { m: 'azi', long: 'Azi', v: 0, bad: 0, medium: 0, good: 0 },
    ...long[year].slice(0, n).map((y, i) => ({
      m: y.to.slice(0, 4),
      long: `Până în ${monthName(y.to)}`,
      v: upTo(year, i + 1).in,
      bad: upTo('bad', i + 1).in,
      medium: upTo('medium', i + 1).in,
      good: upTo('good', i + 1).in,
    })),
  ];
  const longEnd = longRows[longRows.length - 1];

  /* Each crop has its own time: the first money from each one, from what was sown. */
  const firstSales = plan.economics.flatMap((c) => {
    const m = normal.months.find((x) => x.entries.some((e) => e.kind === 'crop_sale' && e.cropId === c.cropId && e.id.startsWith('sale:')));
    /* Sown late, the sale can fall after these 12 months. */
    const sown = view.farm.parcels.find((p) => p.cropId === c.cropId)?.plantedMonth;
    const known = cropsById.get(c.cropId);
    const key = m?.key ?? (sown && known ? cropSeason(known, sown).sale : null);
    return key ? [`${nameOf(c.cropId)} în ${shortMonth(key)} ${key.slice(0, 4)}`] : [];
  });

  const hasReal = h.records.some((r) => !crop || r.cropId === crop.id);
  const shownEconomics = crop ? plan.economics.filter((c) => c.cropId === crop.id) : plan.economics;
  const own = view.harvests.gathered.length > 0;
  /* What this kind of year means: the county's real harvests, or the country's where it has too few. */
  const yh = data.params.yield_history;
  const sownIds = new Set(view.farm.parcels.map((p) => p.cropId));
  const bases = data.crops.crops.filter((c) => sownIds.has(c.id) && c.yield_basis).map((c) => c.yield_basis!);
  const ownCost = view.harvests.expected.some((e) => e.costLeiPerHa != null && sownIds.has(e.cropId));
  const foot = crop
    ? `Subvenția e împărțită după hectare. Costurile, producția și prețurile sunt medii estimate, unde nu le-ai notat tu. Cel mai jos nivel al banilor și anii următori sunt la ${view.projectName(h, null)}.`
    : t(
        `Am pornit de la ${exact(view.farm.startBalanceBani)} lei în cont. ${
          ownCost
            ? `${own ? 'Producția, prețul și costurile sunt ce ai notat tu, unde le-ai notat.' : `${bases.length > 0 ? 'Producția vine din istoricul INS. ' : ''}Costurile sunt cele scrise de tine, unde le-ai schimbat.`} Restul sunt medii estimate.`
            : own
              ? 'Producția și prețul sunt ce ai notat tu, unde le-ai notat. Restul, inclusiv costurile, sunt medii estimate.'
              : `${bases.length > 0 ? 'Producția vine din istoricul INS. Costurile și prețurile sunt medii estimate' : 'Costurile, producția și prețurile sunt medii estimate'}, nu cifrele tale.`
        }`,
      );
  const left = inSum - outSum;

  const countyName = bases.some((b) => b.area !== 'RO') ? `județul ${view.farm.county}` : 'țară';
  const yearMeaning = {
    bad: `recolte ca în cei mai slabi ${yh.extreme_years.value} ani din ultimii ${yh.window_years.value}`,
    medium: `o recoltă obișnuită din ultimii ${yh.window_years.value} ani`,
    good: `recolte ca în cei mai buni ${yh.extreme_years.value} ani din ultimii ${yh.window_years.value}`,
  }[year];
  const afterBad = !crop && year === 'bad' ? view.afterBadHarvest() : null;

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Prognoză</h1>
          <p className="lead">{crop ? `Cât aduce și cât costă cultura de ${crop.name.toLowerCase()}, într-un an întreg.` : 'Cum arată banii tăi în următoarele 12 luni.'}</p>
        </div>
      </header>
      <FutureNote />
      <OfflineNote>Nu ai internet. Prognoza se calculează pe telefon, din datele salvate.</OfflineNote>
      <div className="vtabs page-tabs" role="group" aria-label="Ce fel de an">
        <YearChips year={year} onPick={setYear} />
      </div>
      {bases.length > 0 && (
        <p className="note">
          {name} înseamnă {yearMeaning}, în {countyName}. Sursa: INS, recoltele {bases[0].from}–{bases[0].to}. Prețul și costurile sunt aceleași în toți cei trei ani.
          {own && ' Unde ai notat recolta ta, ea ține locul anului normal.'}
        </p>
      )}
      <div className={`fc-pair${crop ? ' solo' : ''}`}>
        <section className="card fc-main">
          <div className="card-h">
            <h2>{crop ? `${name}: ${view.projectName(h, crop.id)}` : `${name}: banii tăi, lună de lună`}</h2>
            {!crop && <span>Cel mai jos: {lei(t12.lowest.balance)}, în {shortMonth(t12.lowest.key)}</span>}
          </div>
          {!crop && (
            <>
              <FarmChart className="chart fc-chart" id="fc" rows={rows} low={low} year={year} label={`Banii tăi lună de lună. Cel mai jos: ${lei(low.v)}, în ${low.long}. La final, ${yearEnds(rows, year, lei)}.`} />
              <p className="note">Linia plină e anul ales, înainte de salariu și pensie. Liniile punctate sunt ceilalți doi ani.</p>
            </>
          )}
          <div className="fc-keys">
            {crop ? (
              <>
                <Tile label="Intră" value={lei(inSum)} />
                <Tile label="Costă" value={lei(outSum)} />
                <Tile label="Rămâne" value={lei(left)} />
                <Tile label="Rămâne pe hectar" value={lei(Math.round((left * 100) / crop.ari))} />
              </>
            ) : (
              <>
                <Tile label="Intră" value={lei(inSum)} />
                <Tile label="Ies" value={lei(outSum)} />
                <Tile label="Cel mai jos" value={lei(t12.lowest.balance)} sub={monthName(t12.lowest.key)} />
                <Tile label="Rămân la final" value={lei(last.balanceEnd)} sub={monthName(last.key)} />
              </>
            )}
          </div>
        </section>
        {!crop && (
          <section className="card" id="ani">
            <div className="card-h">
              <h2>Următorii ani</h2>
              <span>{KIND[year]}</span>
            </div>
            <div className="vtabs" role="group" aria-label="Ce fel de ani">
              <YearChips year={year} onPick={setYear} />
            </div>
            <div className="ha-row l-range">
              <label htmlFor="l-years">
                {'În câți ani? '}
                <output htmlFor="l-years">{anii(n)}</output>
              </label>{' '}
              <input type="range" id="l-years" min={1} step={1} max={maxYears} value={n} aria-valuetext={anii(n)} onChange={(e) => setN(+e.target.value)} />
            </div>
            <p className="l-head">
              În {anii(n)} intră <b>{t(`${about(longTotal.in)} lei`)}</b>
            </p>
            <p className="lead">{t(`Între ${about(upTo('bad', n).in)} și ${about(upTo('good', n).in)} lei, la prețurile de azi, până în ${monthName(longLast.to)}.`)}</p>
            <FarmChart className="chart fc-chart" id="l-chart" rows={longRows} low={longEnd} year={year} label={`Banii care intră în ${anii(n)}: ${lei(longEnd.v)}. ${yearEnds(longRows, year, lei)}.`} />
            <div className="fc-keys l-keys">
              <Tile label="Intră" value={lei(longTotal.in)} />
              <Tile label="Ies" value={lei(longTotal.out)} />
              <Tile label="Rămân înainte de salariu" value={lei(longTotal.left)} />
            </div>
            {firstSales.length > 0 && <p className="note">Următoarea vânzare: {firstSales.join(', ')}.</p>}
            <p className="note">
              {'O estimare, nu o promisiune. Fiecare an e la fel ca cel ales, cu prețurile, costurile și subvențiile de azi, deci „ani slabi” înseamnă că toți ar ieși slabi. Regulile pentru subvenții sunt stabilite până în '}
              {data.params.long_forecast.subsidy_rules_until_year.value}
              {'. „Rămân” e înainte de salariu și pensie.'}
            </p>
            <div className="ob-actions">
              <PageLink className="btn btn-line" path="/recolte" href={href('/recolte#strans')}>
                Schimbă recolta
              </PageLink>
            </div>
          </section>
        )}
      </div>
      {!crop && year === 'bad' && (
        <section className="cta field verdict" id="bad">
          <div>
            <p className="eyebrow">Într-un an slab</p>
            <h2>Intră cu {lei(sum(normal.months, 'in') - sum(plan.timelines.bad.months, 'in'))} mai puțin decât într-un an normal.</h2>
            <p>La sfârșitul celor 12 luni ai cu {lei(normal.months[normal.months.length - 1].balanceEnd - last.balanceEnd)} mai puțin.</p>
            {afterBad && (
              <p>
                {afterBad.missing > 0
                  ? `Se simte în primăvara de după: în ${monthName(afterBad.lowest.key)} îți lipsesc ${lei(afterBad.missing)}, înainte de salariu și pensie.`
                  : `Se simte în primăvara de după: în ${monthName(afterBad.lowest.key)} mai ai ${lei(afterBad.lowest.balance)}, înainte de salariu și pensie.`}{' '}
                {`Salariul care ține ${afterBad.months} de luni: ${lei(afterBad.salary)}, față de ${lei(afterBad.normalSalary)} în ani normali.`}
              </p>
            )}
          </div>
        </section>
      )}
      {hasReal && (
        <section className="card">
          <div className="card-h">
            <h2>Plan și realitate</h2>
            <span>
              <PageLink path="/recolte" href={href('/recolte')}>
                Notează
              </PageLink>
            </span>
          </div>
          <CompareTable view={view} harvestId={h.id} cropId={crop?.id ?? null} realLabel="Până acum" />
        </section>
      )}
      <div className={`bento${crop ? ' h-gap' : ''}`}>
        <section className="card s6">
          <h2>De unde vin banii</h2>
          <ul className="bars">{bars(totals(entries, 'in'), inSum)}</ul>
        </section>
        <section className="card s6">
          <h2>Unde se duc banii</h2>
          <ul className="bars out">{bars(totals(entries, 'out'), outSum)}</ul>
        </section>
        {!crop && <CropBreakdown view={view} year={year} className="s12" />}
        <section className="card s12">
          <div className="card-h">
            <h2>{crop ? 'Doar din vânzare, într-un an normal' : 'Culturile tale, într-un an normal'}</h2>
            <span>
              <PageLink path="/date-plan" href={href('/date-plan')}>
                Schimbă costurile
              </PageLink>
            </span>
          </div>
          <table className="crop-table">
            <thead>
              <tr>
                <th scope="col">Cultura</th>
                <th scope="col">Hectare</th>
                <th scope="col">Intră</th>
                <th scope="col">Costă</th>
                <th scope="col">Rămâne pe hectar</th>
                <th scope="col">Prețul la care nu pierzi</th>
              </tr>
            </thead>
            <tbody>
              {shownEconomics.map((c) => (
                <tr key={c.cropId}>
                  <th scope="row">{nameOf(c.cropId)}</th>
                  <td data-l="Hectare">{ha(c.areaAri)}</td>
                  <td data-l="Intră">{lei(c.income)}</td>
                  <td data-l="Costă">{lei(c.cost)}</td>
                  <td data-l="Rămâne pe hectar">{lei(c.marginPerHa)}</td>
                  <td data-l="Prețul la care nu pierzi">{t(`${cents(c.breakEvenPerKg)} lei/kg`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <p className="note gap">{foot}</p>{' '}
      <PageLink className="btn btn-dark next-step" path="/salariu" href={href('/salariu')}>
        Mai departe: cât poți scoate pe lună
      </PageLink>
    </>
  );
}
