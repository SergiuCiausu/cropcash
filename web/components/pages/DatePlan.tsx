'use client';
/* "Datele planului": the figures behind the salary, with the salary recalculated on the phone as they
   change (was web/legacy/date-plan.js). The APIA date stays fixed (P13, P29). A signed-in farmer's
   pension is a Stripe subscription, so it only shows here. Offline the figures can be tried, and are
   saved once the phone is back online. */
import { useMemo, useState } from 'react';
import { isOwnCrop } from '../../../packages/shared/src/farm/index';
import type { FarmPlan } from '../../../packages/shared/src/functions/plan';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import { failText, group } from '../../lib/cc/format';
import { ionFarm } from '../../lib/cc/farm';
import { useFarm, useMoney, useOnline, useStore, useView } from '../../lib/cc/react';
import { AmountEcho, ErrorLine, OfflineNote, useHref } from '../app/bits';
import { PageLink } from '../app/Frame';

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const monthName = (key: string) => `${MONTHS[+key.split('-')[1] - 1]} ${key.slice(0, 4)}`;
const decimal = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const MAX_OPENING_LEI = 100000000;

/* Reading what's typed. Null means the text isn't a usable number. */
const wholeLei = parseWholeLei;
const decimalNumber = (text: string) => {
  const t = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};
const firstSale = (plan: FarmPlan, cropId: string) => plan.timelines.medium.months.find((m) => m.entries.some((e) => e.kind === 'crop_sale' && e.cropId === cropId && e.value > 0))?.key;

export default function DatePlan() {
  const view = useView('farm')!;
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const href = useHref();
  const { lei } = useMoney();
  const FARM = view.farm;
  const onServer = !!farm.me;
  const params = view.data().params;
  const PENSION = { min: params.pension.slider_min_lei.value, max: params.pension.slider_max_lei.value };

  /* What a figure falls back to without the farmer's own: Recolte, or the average. */
  const crops = useMemo(() => {
    const noted = view.dataWithout();
    const ids = [...new Set(FARM.parcels.map((p) => p.cropId))].filter((id) => !isOwnCrop(id));
    return ids.map((id) => {
      const own = view.harvests.expected.find((e) => e.cropId === id);
      const back = noted.crops.crops.find((c) => c.id === id)!;
      return {
        id,
        area: FARM.parcels.filter((p) => p.cropId === id).reduce((s, p) => s + p.areaHa, 0),
        name: view.cropName(id),
        backYield: decimal(back.yield_t_per_ha.mean),
        backPrice: decimal(back.price_lei_per_kg.mean),
        startYield: decimal(own?.yieldTPerHa ?? back.yield_t_per_ha.mean),
        startPrice: decimal(own?.priceLeiPerKg ?? back.price_lei_per_kg.mean),
        backWord: view.figureSource(id, false) === 'gathered' ? 'din Recolte' : 'media noastră',
      };
    });
  }, [view, FARM]);
  /* A crop of the farmer's own already holds their figures, so it's changed where it was described. */
  const ownIds = [...new Set(FARM.parcels.map((p) => p.cropId))].filter(isOwnCrop);

  const [opening, setOpening] = useState(group(Math.round(FARM.startBalanceBani / 100)));
  const [pensionText, setPensionText] = useState(group(Math.round(view.pensionBani() / 100)));
  const [figures, setFigures] = useState(() => Object.fromEntries(crops.map((c) => [c.id, { y: c.startYield, p: c.startPrice }])));
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const openingLei = wholeLei(opening);
  const openingOk = openingLei !== null && openingLei <= MAX_OPENING_LEI;
  const pensionLei = onServer ? null : wholeLei(pensionText);
  const pensionOk = onServer || (pensionLei !== null && (pensionLei === 0 || (pensionLei >= PENSION.min && pensionLei <= PENSION.max)));

  const rows = crops.map((c) => {
    const yieldText = figures[c.id].y.trim();
    const priceText = figures[c.id].p.trim();
    const y = decimalNumber(yieldText);
    const p = decimalNumber(priceText);
    const bad = !(y !== null && y > 0) || !(p !== null && p > 0);
    /* A figure left at its fallback isn't the farmer's own, so it keeps following Recolte. */
    const row = { cropId: c.id, yieldTPerHa: yieldText === c.backYield ? null : y, priceLeiPerKg: priceText === c.backPrice ? null : p };
    const own = row.yieldTPerHa !== null || row.priceLeiPerKg !== null;
    const range = view.baseData().crops.crops.find((x) => x.id === c.id)!;
    const yr = range.yield_t_per_ha;
    const pr = range.price_lei_per_kg;
    const unusual =
      !bad && row.yieldTPerHa !== null && (y! < yr.min || y! > yr.max)
        ? ` De obicei, ${decimal(yr.min)}–${decimal(yr.max)} t/ha.`
        : !bad && row.priceLeiPerKg !== null && (p! < pr.min || p! > pr.max)
          ? ` De obicei, ${decimal(pr.min)}–${decimal(pr.max)} lei/kg.`
          : '';
    const total = bad ? '' : `${decimal(y!)} t/ha × ${decimal(c.area)} ha = ${decimal(y! * c.area)} t, adică ${lei(Math.round(y! * c.area * 1000 * p! * 100))}.${unusual}`;
    const changed = yieldText !== c.startYield || priceText !== c.startPrice;
    return { c, bad, row, own, total, changed };
  });

  const ok = openingOk && pensionOk && !rows.some((r) => r.bad);
  const input = {
    openingBani: openingOk ? openingLei * 100 : 0,
    pension: !onServer && pensionOk ? pensionLei! * 100 : 0,
    expected: [...view.harvests.expected.filter((e) => !crops.some((c) => c.id === e.cropId)), ...rows.filter((r) => r.own).map((r) => r.row)],
  };
  const changedCrops = rows.filter((r) => r.changed).map((r) => r.c);

  /* The preview: why the salary moved, or why it didn't. */
  const before = view.farmPlan();
  let amount = '';
  let why = 'Verifică cifrele de mai jos.';
  if (ok) {
    const after = view.previewPlan(input);
    const was = before.monthlySalary;
    const now = after.monthlySalary;
    const touched = input.openingBani !== FARM.startBalanceBani || (!onServer && input.pension !== view.pensionBani()) || changedCrops.length > 0;
    amount = was === now ? `${lei(now)} pe lună` : `${lei(was)} → ${lei(now)} pe lună`;
    if (!touched) why = 'Schimbă o cifră și vezi aici efectul.';
    else if (was === now) {
      const limit = after.salary.bindingMonth;
      const same = input.openingBani === FARM.startBalanceBani && (onServer || input.pension === view.pensionBani());
      const late = changedCrops.filter((c) => (firstSale(after, c.id) ?? '') > limit);
      if (same && changedCrops.length && late.length === changedCrops.length) {
        const sale = late.length > 1 ? 'vânzarea recoltei vine' : `vânzarea de ${late[0].name.toLowerCase()} vine`;
        why = `Salariul depinde de banii de până în ${monthName(limit)}, iar ${sale} abia în ${monthName(firstSale(after, late[0].id)!)}. Se schimbă ce arată Prognoza.`;
      } else if (now === 0) why = `Banii nu ajung până în ${monthName(limit)}.`;
      else why = `Diferența e prea mică: salariul se rotunjește în jos la ${params.salary_round_lei.value} lei.`;
    } else why = onServer ? `Dacă salvezi, ${lei(now)} devine suma pe care ți-o plătim lunar.` : 'Cifrele nu sunt salvate încă.';
  }

  async function save() {
    if (!ok || saving) return;
    setSaving(true);
    setSaveErr('');
    try {
      await store.savePlanFigures(input);
      location.href = href('/salariu');
    } catch (e) {
      setSaveErr(failText(e, online));
      setSaving(false);
    }
  }
  const setFig = (id: string, patch: Partial<{ y: string; p: string }>) => setFigures((f) => ({ ...f, [id]: { ...f[id], ...patch } }));

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Datele planului</h1>
          <p className="lead">Din aceste cifre calculăm salariul. Schimbă ce nu se potrivește cu ferma ta.</p>
        </div>
      </header>
      {/* A farm that never reaches the server has nothing to save online. */}
      {onServer && <OfflineNote>Nu ai internet. Ce salvezi acum se trimite singur când revii online.</OfflineNote>}
      <section className="chart-card field hero-card plan-preview" aria-live="polite">
        <p className="eyebrow">Salariul cu aceste cifre</p>
        <p className="amount">{amount}</p>
        <p className="why">{why}</p>
      </section>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="bento">
          <section className="card s6">
            <h2>Bani la început</h2>
            <p className="note">Cât aveai în cont când a început recolta {view.baseYear}.</p>{' '}
            <label className="ob-field">
              Suma, în lei
              <input inputMode="numeric" autoComplete="off" value={opening} onChange={(e) => setOpening(e.target.value)} />
              <AmountEcho text={opening} />
            </label>{' '}
            {!openingOk && <ErrorLine>Scrie suma ca număr, de exemplu {group(ionFarm(view.baseData()).startBalanceBani / 100)}.</ErrorLine>}
          </section>
          <section className="card s6">
            <h2>Pensie</h2>
            {onServer ? (
              <p className="note">
                {view.pensionBani() ? (
                  <>
                    Pui deoparte {lei(view.pensionBani())} pe lună.{' '}
                    <PageLink path="/pensie" href={href('/pensie')}>
                      Suma se schimbă din pagina Pensie
                    </PageLink>
                    .
                  </>
                ) : (
                  <>
                    Nu ai pornit încă o pensie.{' '}
                    <PageLink path="/pensie" href={href('/pensie')}>
                      Vezi cât strângi
                    </PageLink>
                    .
                  </>
                )}
              </p>
            ) : (
              <>
                {/* What to type in the field, and fields are always in lei. */}
                <p className="note">
                  Între {PENSION.min} și {PENSION.max} lei pe lună, sau 0 dacă nu pui nimic deoparte.{farm.ownPension ? '' : ' Acum e un exemplu.'}
                </p>{' '}
                <label className="ob-field">
                  Suma pe lună, în lei
                  <input inputMode="numeric" autoComplete="off" value={pensionText} onChange={(e) => setPensionText(e.target.value)} />
                </label>{' '}
                {!pensionOk && <ErrorLine>Scrie 0 sau o sumă între {PENSION.min} și {PENSION.max} lei.</ErrorLine>}
              </>
            )}
          </section>
          <section className="card s12">
            <h2>Recolta, într-un an normal</h2>
            <p className="note">Anul slab și anul bun se schimbă odată cu aceste cifre. Costurile rămân cele medii.</p>
            <div className="crop-figs">
              {rows.map(({ c, bad, own, total }) => (
                <fieldset className="crop-fig" key={c.id}>
                  <legend>
                    {c.name}, {decimal(c.area)} ha <span className="tag n">{own ? 'cifrele tale' : c.backWord}</span>
                  </legend>
                  <label className="ob-field">
                    Tone la hectar
                    <input inputMode="decimal" autoComplete="off" value={figures[c.id].y} onChange={(e) => setFig(c.id, { y: e.target.value })} />
                  </label>
                  <label className="ob-field">
                    Preț, lei/kg
                    <input inputMode="decimal" autoComplete="off" value={figures[c.id].p} onChange={(e) => setFig(c.id, { p: e.target.value })} />
                  </label>
                  <p className="note">{total}</p>
                  {bad && <ErrorLine>Scrie un număr mai mare ca 0, de exemplu 5,5.</ErrorLine>}
                  {own && (
                    <button type="button" className="btn btn-line crop-reset" onClick={() => setFig(c.id, { y: c.backYield, p: c.backPrice })}>
                      Înapoi la {c.backWord}
                    </button>
                  )}
                </fieldset>
              ))}
            </div>
            {ownIds.length > 0 && (
              <p className="note gap">
                {ownIds.map((id) => view.cropName(id)).join(', ')}: cifrele se schimbă din <a href={href('/recolte#cultura')}>Recolte</a>.
              </p>
            )}
          </section>
        </div>
        {/* On a phone the preview scrolls away, so the result is repeated beside the button. */}
        <p className="plan-again">
          {amount}. {why}
        </p>
        <ErrorLine>{saveErr}</ErrorLine>
        <div className="ob-actions plan-actions">
          <button type="submit" className="btn btn-dark" disabled={!ok || saving}>
            {saving ? 'Se salvează…' : 'Salvează'}
          </button>{' '}
          <PageLink path="/salariu" href={href('/salariu')} className="btn btn-line">
            Renunță
          </PageLink>
        </div>
      </form>
    </>
  );
}
