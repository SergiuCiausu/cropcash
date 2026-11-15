'use client';
/* „Arendă”: the landowners, their contracts, the year's rent and what needs doing (docs/employees-arenda-plan.md §3,
   docs/15-arenda.md). Shared by /arenda and /ferma-lui-ion/arenda (screens/arenda.tsx).
   Offline: the list, the rent and the warnings read from the copy on the phone. Adding or changing a landowner, a
   contract or a parcel's tenure needs internet, like the people on Oameni. The parcels come from the server, so
   their tenure shows only with internet. */
import { useContext, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ContractInputSchema,
  coverage,
  expiringContracts,
  LandownerInputSchema,
  landownerYears,
  rentPayments,
  unplannedContracts,
  type LandTaxBy,
  type LeaseDirection,
  type RentPayment,
  type StoredContract,
  type StoredLandowner,
} from '../../../packages/shared/src/arenda/index';
import type { PlotTenure, StoredPlot } from '../../../packages/shared/src/plots/model';
import { parseWholeLei } from '../../../packages/shared/src/money/index';
import { accountantCsv, leiWithBani, priceFor, rentWords, yearRent, type YearRent } from '../../lib/cc/arenda';
import { date, exact, failText, group, ha, MONTHS } from '../../lib/cc/format';
import { loadPlots } from '../../lib/cc/plots';
import { useFarm, useOnline, useStore, useView } from '../../lib/cc/react';
import { newIntentKey } from '../../lib/live/intent';
import { ErrorLine, NetButton, OfflineNote, Sheet } from '../app/bits';
import { FrameContext } from '../app/context';
import '../../styles/events.css';
import '../../styles/people.css';
import '../../styles/arenda.css';

const PAYMENT_WORDS: [RentPayment, string][] = [
  ['in_kind', 'În produse'],
  ['cash', 'În bani'],
  ['mixed', 'Și și'],
];
const DIRECTION_WORDS: [LeaseDirection, string, string][] = [
  ['taken', 'Iau pământul lui', 'Lucrezi pământul lui și îi plătești arenda.'],
  ['given', 'Îi dau pământul meu', 'El lucrează pământul tău și îți plătește arenda.'],
];
const TENURE_WORDS: [PlotTenure, string][] = [
  ['own', 'Al meu'],
  ['leased_in', 'Luat în arendă'],
  ['leased_out', 'Dat în arendă'],
];
const plotName = (p: Pick<StoredPlot, 'name' | 'parcel_no' | 'bloc_fizic'>) => p.name ?? (p.parcel_no ? `Parcela ${p.parcel_no}${p.bloc_fizic ? `, bloc ${p.bloc_fizic}` : ''}` : 'Parcelă fără nume');
const kgWords = (kg: Map<string, number>, cropName: (id: string) => string) =>
  [...kg].map(([id, n]) => `${group(n)} kg ${cropName(id).toLocaleLowerCase('ro')}`).join(', ');

type Editing = { owner: StoredLandowner | null; contract?: StoredContract | 'new' } | null;

export default function Arenda() {
  const farm = useFarm()!;
  const view = useView('farm')!;
  const store = useStore()!;
  const online = useOnline();
  const me = farm.me;
  const data = view.data();
  const today = view.today;
  const [editing, setEditing] = useState<Editing>(null);
  const [query, setQuery] = useState('');

  /* Parcels come from the server: with internet only (like Calendar). */
  const [plots, setPlots] = useState<StoredPlot[] | null>(null);
  const onServer = !!me;
  useEffect(() => {
    if (!onServer || !online) return;
    let live = true;
    loadPlots(store.live)
      .then((p) => live && setPlots(p.plots.filter((x) => !x.archived_at && !x.auto_crop_id)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [onServer, online, store]);

  const owners = me?.landowners ?? [];
  const contracts = me?.lease_contracts ?? [];
  const county = me?.county ?? '';
  const cropName = (id: string) => data.crops.crops.find((c) => c.id === id)?.name_ro ?? data.catalogue.find((c) => c.id === id)?.name_ro ?? id;
  const cover = useMemo(() => coverage(plots ?? [], contracts, today), [plots, contracts, today]);
  const expiring = useMemo(() => expiringContracts(contracts, today), [contracts, today]);
  const taken = yearRent(contracts, 'taken', county, data, today);
  const given = yearRent(contracts, 'given', county, data, today);
  const active = owners.filter((o) => !o.archived_at);
  const past = owners.filter((o) => o.archived_at);
  const ownerName = (id: string) => owners.find((o) => o.id === id)?.name ?? '';
  const countyPrices = data.arenda.county_prices[county];
  const payDay = data.params.forecast.entry_day.value;
  /* This calendar year's payments, per landowner: what the accountant declares (§3.4). */
  const year = Number(today.slice(0, 4));
  const owed = useMemo(() => landownerYears(rentPayments(contracts, `${year}-01`, `${year}-12`, county, data, payDay)), [contracts, year, county, data, payDay]);
  const unplanned = unplannedContracts(contracts, data);
  function downloadCsv() {
    const csv = accountantCsv(contracts, owners, year, county, data, cropName, payDay);
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `arenda-${year}-pentru-contabil.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ro');
    const hit = q ? active.filter((o) => `${o.name} ${o.locality ?? ''}`.toLocaleLowerCase('ro').includes(q)) : active;
    const byVillage = new Map<string, StoredLandowner[]>();
    for (const o of [...hit].sort((a, b) => a.name.localeCompare(b.name, 'ro'))) byVillage.set(o.locality ?? '', [...(byVillage.get(o.locality ?? '') ?? []), o]);
    return [...byVillage].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'ro')));
  }, [active, query]);

  const todo = [
    ...expiring.map((e) => ({
      key: `exp:${e.contract.id}`,
      text: e.renews
        ? `Contractul cu ${ownerName(e.contract.landowner_id)} se reînnoiește singur pe ${date(e.endsOn, true)}, dacă nu l-ați refuzat în scris până pe ${date(e.refuseBy, true)}.`
        : `Contractul cu ${ownerName(e.contract.landowner_id)} se termină pe ${date(e.endsOn, true)}. Dacă nu vrei să-l reînnoiești, spune-i în scris până pe ${date(e.refuseBy, true)}.`,
    })),
    ...unplanned.map((c) => ({
      key: `unpl:${c.id}`,
      text: `Contractul cu ${ownerName(c.landowner_id)} nu are luna în care plătești arenda, așa că nu e în plan. Scrie luna în contract.`,
    })),
    ...(cover.unregistered.length
      ? [{ key: 'unreg', text: `${cover.unregistered.length === 1 ? 'Un contract nu are' : `${cover.unregistered.length} contracte nu au`} numărul de la primărie. Fără înregistrare, APIA poate să nu plătească pentru acele hectare.` }]
      : []),
    ...cover.leasedWithoutContract.map((p) => ({ key: `plot:${p.id}`, text: `Parcela ${plotName(p as StoredPlot)} e trecută în arendă, dar nu e în niciun contract.` })),
    ...cover.tenureMismatch.map((m) => ({ key: `mis:${m.plot.id}:${m.contract.id}`, text: `Parcela ${plotName(m.plot as StoredPlot)} e în contractul cu ${ownerName(m.contract.landowner_id)}, dar e trecută ca ${TENURE_WORDS.find(([t]) => t === (m.plot.tenure ?? 'own'))![1].toLocaleLowerCase('ro')}.` })),
  ];

  return (
    <>
      <header className="page-h">
        <div>
          <h1>Arendă</h1>
          <p className="lead">Proprietarii, contractele și arenda pe an. Fără CNP: actele le face contabilul.</p>
        </div>
        {me && (
          <div className="acts">
            <NetButton reason="Un proprietar nou se adaugă când ai internet." className="btn btn-dark" onClick={() => setEditing({ owner: null })}>
              Adaugă un proprietar
            </NetButton>
          </div>
        )}
      </header>

      {!me && <p className="note">Ferma lui Ion e toată pe pământul lui. Pe ferma ta treci aici proprietarii și contractele de arendă.</p>}

      <div className="bento">
        <section className="card s7" aria-labelledby="ar-land">
          <div className="card-h">
            <h2 id="ar-land">Pământul în arendă</h2>
          </div>
          <dl className="ar-facts">
            <div>
              <dt>Iei în arendă</dt>
              <dd>{ha(cover.takenAri)} ha</dd>
            </div>
            {(cover.givenAri > 0 || (me?.leased_out_ari ?? 0) > 0) && (
              <div>
                <dt>Dai în arendă</dt>
                <dd>{ha(cover.givenAri)} ha</dd>
              </div>
            )}
            <div>
              <dt>Proprietari</dt>
              <dd>{me?.landowner_count ? `${active.length} din ${group(me.landowner_count)}` : active.length}</dd>
            </div>
          </dl>
          {me?.leased_in_ari ? (
            <p className="note">
              {me.leased_in_ari > cover.takenAri
                ? `Ai spus că iei ${ha(me.leased_in_ari)} ha în arendă. În contracte sunt ${ha(cover.takenAri)} ha: mai ai de trecut ${ha(me.leased_in_ari - cover.takenAri)} ha.`
                : `Toate cele ${ha(me.leased_in_ari)} ha luate în arendă sunt în contracte.`}
            </p>
          ) : null}
        </section>

        <section className="card s5" aria-labelledby="ar-rent">
          <div className="card-h">
            <h2 id="ar-rent">Arenda pe an</h2>
          </div>
          <RentSummary label="De dat" rent={taken} cropName={cropName} />
          {given.contracts > 0 && <RentSummary label="De primit" rent={given} cropName={cropName} />}
          {taken.taxBani !== null && taken.contracts > 0 && (
            <p className="note">
              Din ea reții impozitul proprietarilor, în jur de {exact(taken.taxBani)} lei, și îl plătești până pe 25 a lunii de după plată.
            </p>
          )}
          {taken.contracts + given.contracts > 0 && (
            <p className="note">
              E în plan: arenda în bani iese în luna plății, cea în produse scade ce ai de vândut, iar impozitul apare în calendar.
            </p>
          )}
          {owed.length > 0 && (
            <button type="button" className="btn ar-csv" onClick={downloadCsv}>
              Lista pentru contabil, {year}
            </button>
          )}
          {[...taken.unpriced, ...given.unpriced].length > 0 && (
            <p className="note">
              {countyPrices?.prices_bani_per_kg ? 'Prețul județului tău' : 'Prețurile pentru arenda în natură din județul tău'} pentru {[...new Set([...taken.unpriced, ...given.unpriced])].map((id) => cropName(id).toLocaleLowerCase('ro')).join(', ')} nu{' '}
              {countyPrices?.prices_bani_per_kg ? 'e' : 'sunt'} în aplicație. Le găsești în hotărârea consiliului județean sau la primărie.
            </p>
          )}
        </section>

        {todo.length > 0 && (
          <section className="card s12" aria-labelledby="ar-todo">
            <div className="card-h">
              <h2 id="ar-todo">De făcut</h2>
            </div>
            <ul className="ar-todo">
              {todo.map((t) => (
                <li key={t.key}>{t.text}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="card s12" aria-labelledby="ar-owners">
          <div className="card-h">
            <h2 id="ar-owners">Proprietarii</h2>
          </div>
          {active.length > 6 && (
            <label className="ar-search">
              Caută după nume sau sat
              <input type="search" value={query} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
            </label>
          )}
          {active.length === 0 ? (
            <p className="empty">Adaugă proprietarii de la care iei pământ, cu satul și cum vor arenda.</p>
          ) : shown.length === 0 ? (
            <p className="empty">Niciun proprietar nu se potrivește.</p>
          ) : (
            shown.map(([village, list]) => (
              <div key={village} className="ar-village">
                <h3>{village || 'Fără sat'}</h3>
                <div className="rows">
                  {list.map((o) => (
                    <OwnerRow key={o.id} o={o} row={cover.byLandowner.get(o.id)} cropName={cropName} onOpen={() => setEditing({ owner: o })} />
                  ))}
                </div>
              </div>
            ))
          )}
          {past.length > 0 && (
            <details className="more">
              <summary>Foști proprietari ({past.length})</summary>
              <div className="rows">
                {past.map((o) => (
                  <OwnerRow key={o.id} o={o} cropName={cropName} onOpen={() => setEditing({ owner: o })} />
                ))}
              </div>
            </details>
          )}
          <OfflineNote>Fără internet vezi proprietarii, contractele și arenda. Ca să adaugi sau să schimbi ceva, ai nevoie de internet.</OfflineNote>
        </section>

        {plots && plots.length > 0 && (
          <section className="card s12" aria-labelledby="ar-plots">
            <div className="card-h">
              <h2 id="ar-plots">Parcelele: al cui e pământul</h2>
            </div>
            <div className="rows">
              {plots.map((p) => (
                <TenureRow key={p.id} plot={p} onSaved={(tenure) => setPlots(plots.map((x) => (x.id === p.id ? { ...x, tenure } : x)))} />
              ))}
            </div>
          </section>
        )}
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} className="detail ev-sheet" label={editing?.contract ? 'Contractul' : editing?.owner ? 'Proprietarul' : 'Adaugă un proprietar'} keepOnBackdrop>
        {editing === null ? null : editing.contract ? (
          <ContractForm
            key={editing.contract === 'new' ? 'new' : editing.contract.id}
            owner={editing.owner!}
            contract={editing.contract === 'new' ? null : editing.contract}
            plots={plots}
            county={county}
            cropIds={[...new Set([...(me?.parcels ?? []).map((p) => p.crop_id), 'grau', 'porumb', 'floarea-soarelui'])]}
            cropName={cropName}
            onClose={() => setEditing({ owner: editing.owner })}
          />
        ) : (
          <OwnerForm
            key={editing.owner?.id ?? 'new'}
            owner={editing.owner}
            contracts={contracts.filter((c) => c.landowner_id === editing.owner?.id)}
            cropName={cropName}
            owed={owed.find((r) => r.landownerId === editing.owner?.id) ?? null}
            year={year}
            onContract={(contract) => setEditing({ owner: editing.owner, contract })}
            onSaved={(owner) => setEditing(owner ? { owner } : null)}
            onClose={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  );
}

function RentSummary({ label, rent, cropName }: { label: string; rent: YearRent; cropName: (id: string) => string }) {
  const parts = [rent.bani ? `${exact(rent.bani)} lei` : '', kgWords(rent.kg, cropName)].filter(Boolean);
  return (
    <div className="ar-rent">
      <span>{label}</span>
      <b>{parts.length ? parts.join(' și ') : '—'}</b>
      {rent.kg.size > 0 && rent.leiEquivalentBani !== null && <small>în total cam {exact(rent.leiEquivalentBani)} lei, la prețul județului</small>}
    </div>
  );
}

function OwnerRow({ o, row, cropName, onOpen }: { o: StoredLandowner; row?: { takenAri: number; givenAri: number; contracts: StoredContract[] }; cropName: (id: string) => string; onOpen: () => void }) {
  const first = row?.contracts[0];
  return (
    <button type="button" className="row" onClick={onOpen}>
      <span className="r-main">
        <b>{o.name}</b>
        <small>{[o.note, first ? rentWords(first, cropName) : 'fără contract', row && row.contracts.length > 1 ? `${row.contracts.length} contracte` : ''].filter(Boolean).join(' · ')}</small>
      </span>
      <span className="r-side">
        <b>{row ? `${ha(row.takenAri + row.givenAri)} ha` : '—'}</b>
        <small>{row?.givenAri && !row.takenAri ? 'dat în arendă' : 'în arendă'}</small>
      </span>
    </button>
  );
}

function TenureRow({ plot, onSaved }: { plot: StoredPlot; onSaved: (t: PlotTenure) => void }) {
  const store = useStore()!;
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function set(tenure: PlotTenure) {
    setBusy(true);
    setErr(null);
    try {
      await store.send(({ write }) => write('set_plot_tenure', { plotId: plot.id, tenure }));
      onSaved(tenure);
    } catch (e) {
      setErr(failText(e, online));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="row ar-tenure">
      <span className="r-main">
        <b>{plotName(plot)}</b>
      </span>
      <div className="chips" role="group" aria-label={`Al cui e pământul: ${plotName(plot)}`}>
        {TENURE_WORDS.map(([t, label]) => (
          <NetButton key={t} reason="Se salvează când ai internet." className="chip" aria-pressed={(plot.tenure ?? 'own') === t} disabled={busy} onClick={() => void set(t)}>
            {label}
          </NetButton>
        ))}
      </div>
      <ErrorLine>{err}</ErrorLine>
    </div>
  );
}

function OwnerForm({
  owner,
  contracts,
  cropName,
  owed,
  year,
  onContract,
  onSaved,
  onClose,
}: {
  owner: StoredLandowner | null;
  contracts: StoredContract[];
  cropName: (id: string) => string;
  owed: ReturnType<typeof landownerYears>[number] | null;
  year: number;
  onContract: (c: StoredContract | 'new') => void;
  onSaved: (owner: StoredLandowner | null) => void;
  onClose: () => void;
}) {
  const store = useStore()!;
  const online = useOnline();
  const { notify } = useContext(FrameContext);
  const [f, setF] = useState({ name: owner?.name ?? '', locality: owner?.locality ?? '', phone: owner?.phone ?? '', payment: owner?.payment ?? null, note: owner?.note ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useRef(newIntentKey());
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const gone = !!owner?.archived_at;

  const input = () => ({
    name: f.name.trim(),
    ...(f.locality.trim() ? { locality: f.locality.trim() } : {}),
    ...(f.phone.trim() ? { phone: f.phone.trim() } : {}),
    ...(f.payment ? { payment: f.payment } : {}),
    ...(f.note.trim() ? { note: f.note.trim() } : {}),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Scrie numele.');
    if (!LandownerInputSchema.safeParse(input()).success) return setErr(f.phone.trim() ? 'Telefonul are doar cifre, de la 6 la 20.' : 'Ceva nu se potrivește. Verifică numele și satul.');
    setErr(null);
    setBusy(true);
    try {
      let saved = owner?.id ?? '';
      await store.send(async ({ write }) => {
        if (owner) await write('update_landowner', { ...input(), id: owner.id });
        else {
          /* Never queued (it needs internet), so the answer always has the id. */
          const res = await write<{ id: string }>('add_landowner', { ...input(), clientId: clientId.current });
          if ('id' in res) saved = res.id;
        }
      });
      notify({ tone: 'info', title: owner ? 'Am schimbat' : `Am adăugat pe ${f.name.trim()}`, body: owner ? '' : 'Acum adaugă contractul cu el.' });
      if (owner) onClose();
      /* A new landowner stays open, so the contract is one tap away. */
      else onSaved(saved ? { id: saved, name: f.name.trim(), locality: f.locality.trim() || null, phone: f.phone.trim() || null, payment: f.payment, note: f.note.trim() || null, archived_at: null } : null);
    } catch (e2) {
      setErr(failText(e2, online));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    setErr(null);
    try {
      await store.send(({ write }) => write('archive_landowner', { id: owner!.id }));
      notify({ tone: 'info', title: `${owner!.name} e la foștii proprietari`, body: 'Contractele lui se încheie. Nu se șterge nimic.' });
      onClose();
    } catch (e2) {
      setErr(failText(e2, online));
      setBusy(false);
    }
  }

  return (
    <form className="ev-form" noValidate onSubmit={(e) => void submit(e)}>
      <div className="top">
        <h2 tabIndex={-1} autoFocus>
          {owner ? owner.name : 'Un proprietar nou'}
        </h2>
        <button type="button" className="x" aria-label="Închide" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="ev-fields">
        <label>
          Numele
          <input value={f.name} maxLength={80} autoComplete="off" disabled={gone} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          Satul
          <input value={f.locality} maxLength={80} autoComplete="off" disabled={gone} onChange={(e) => set({ locality: e.target.value })} />
        </label>
        <label>
          Telefon <small>(dacă are)</small>
          <input type="tel" value={f.phone} maxLength={20} autoComplete="off" disabled={gone} onChange={(e) => set({ phone: e.target.value })} />
        </label>
        <label>
          O notă <small>(dacă vrei)</small>
          <input value={f.note} maxLength={200} placeholder="moștenitorii lui…" disabled={gone} onChange={(e) => set({ note: e.target.value })} />
        </label>
        <fieldset className="ev-wide">
          <legend>Cum vrea arenda</legend>
          <div className="chips">
            {PAYMENT_WORDS.map(([p, label]) => (
              <button key={p} type="button" className="chip" aria-pressed={f.payment === p} disabled={gone} onClick={() => set({ payment: f.payment === p ? null : p })}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <ErrorLine>{err}</ErrorLine>
      {!gone && (
        <div className="ob-actions">
          <NetButton reason="Se salvează când ai internet." type="submit" className="btn btn-dark" disabled={busy} aria-busy={busy}>
            {busy ? 'Se salvează…' : owner ? 'Salvează' : 'Adaugă'}
          </NetButton>
        </div>
      )}

      {owner && (
        <fieldset className="ar-contracts">
          <legend>Contractele</legend>
          {contracts.length === 0 ? (
            <p className="note">Niciun contract încă.</p>
          ) : (
            <div className="rows">
              {contracts.map((c) => (
                <button key={c.id} type="button" className="row" onClick={() => onContract(c)}>
                  <span className="r-main">
                    <b>
                      {c.direction === 'taken' ? 'Iei' : 'Dai'} {ha(c.area_ari)} ha{c.locality ? `, ${c.locality}` : ''}
                    </b>
                    <small>
                      {[rentWords(c, cropName), `${date(c.starts_on, true)} – ${c.ends_on ? date(c.ends_on, true) : 'fără sfârșit scris'}`, c.archived_at ? 'încheiat' : c.registration_no ? `nr. ${c.registration_no}` : 'neînregistrat'].join(' · ')}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {!gone && (
            <NetButton reason="Un contract se adaugă când ai internet." className="btn" onClick={() => onContract('new')}>
              Adaugă un contract
            </NetButton>
          )}
        </fieldset>
      )}

      {owner && owed && (
        <fieldset className="ar-contracts">
          <legend>Arenda lui în {year}</legend>
          <dl className="ar-owed">
            <div>
              <dt>Arenda</dt>
              <dd>{[owed.grossBani ? `${leiWithBani(owed.grossBani)} lei` : '', ...owed.kg.map((k) => `${group(k.grossKg)} kg ${cropName(k.cropId).toLocaleLowerCase('ro')}`)].filter(Boolean).join(' și ')}</dd>
            </div>
            <div>
              <dt>Impozitul pe care îl reții</dt>
              <dd>{owed.taxBani === null ? 'nu știm prețul județului' : `${leiWithBani(owed.taxBani)} lei`}</dd>
            </div>
            <div>
              <dt>Primește</dt>
              <dd>{[owed.paidBani ? `${leiWithBani(owed.paidBani)} lei` : '', ...owed.kg.map((k) => `${group(k.paidKg)} kg ${cropName(k.cropId).toLocaleLowerCase('ro')}`)].filter(Boolean).join(' și ')}</dd>
            </div>
          </dl>
          <small className="note">Impozitul e 10% din arendă după ce scazi 20% cheltuieli, adică 8% din ea. Pentru produse, socotit la prețul județului.</small>
        </fieldset>
      )}

      {owner && !gone && (
        <fieldset className="pp-leave">
          <legend>Nu mai lucrezi pământul lui?</legend>
          <NetButton reason="Se salvează când ai internet." className="btn" disabled={busy} onClick={() => void archive()}>
            Mută la foștii proprietari
          </NetButton>
          <small className="note">Nu se șterge: rămâne cu contractele și plățile lui.</small>
        </fieldset>
      )}
    </form>
  );
}

const optionalInt = (s: string) => (s.trim() === '' ? undefined : (parseWholeLei(s) ?? NaN));

function ContractForm({
  owner,
  contract,
  plots,
  county,
  cropIds,
  cropName,
  onClose,
}: {
  owner: StoredLandowner;
  contract: StoredContract | null;
  plots: StoredPlot[] | null;
  county: string;
  cropIds: string[];
  cropName: (id: string) => string;
  onClose: () => void;
}) {
  const store = useStore()!;
  const view = useView('farm')!;
  const online = useOnline();
  const { notify } = useContext(FrameContext);
  const c = contract;
  const [f, setF] = useState({
    direction: c?.direction ?? ('taken' as LeaseDirection),
    area: c ? String(c.area_ari / 100).replace('.', ',') : '',
    locality: c?.locality ?? owner.locality ?? '',
    plotIds: c?.plot_ids ?? ([] as string[]),
    startsOn: c?.starts_on ?? view.today,
    endsOn: c?.ends_on ?? '',
    lei: c?.rent_bani_per_ha ? String(Math.round(c.rent_bani_per_ha / 100)) : '',
    kg: c?.rent_kg_per_ha ? String(c.rent_kg_per_ha) : '',
    cropId: c?.rent_crop_id ?? (owner.payment === 'cash' ? null : 'grau'),
    payMonth: c?.pay_month ? String(c.pay_month) : '',
    landTaxBy: c?.land_tax_by ?? (null as LandTaxBy | null),
    regNo: c?.registration_no ?? '',
    regDate: c?.registration_date ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useRef(newIntentKey());
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const ended = !!c?.archived_at;
  const kg = optionalInt(f.kg);
  const price = priceFor(view.data(), county, f.cropId, view.today);

  function input() {
    const kgPerHa = optionalInt(f.kg);
    return {
      landownerId: owner.id,
      direction: f.direction,
      areaHa: Number(f.area.replace(',', '.')),
      ...(f.locality.trim() ? { locality: f.locality.trim() } : {}),
      plotIds: f.plotIds,
      startsOn: f.startsOn,
      ...(f.endsOn ? { endsOn: f.endsOn } : {}),
      ...(optionalInt(f.lei) !== undefined ? { rentLeiPerHa: optionalInt(f.lei) } : {}),
      ...(kgPerHa !== undefined ? { rentKgPerHa: kgPerHa, ...(f.cropId ? { rentCropId: f.cropId } : {}) } : {}),
      ...(f.payMonth ? { payMonth: Number(f.payMonth) } : {}),
      ...(f.landTaxBy ? { landTaxBy: f.landTaxBy } : {}),
      ...(f.regNo.trim() ? { registrationNo: f.regNo.trim() } : {}),
      ...(f.regDate ? { registrationDate: f.regDate } : {}),
    };
  }

  function check(): string | null {
    const area = Number(f.area.replace(',', '.'));
    if (!(area > 0)) return 'Scrie câte hectare are contractul.';
    if (!f.startsOn) return 'Alege de când e contractul.';
    if (f.endsOn && f.endsOn < f.startsOn) return 'Sfârșitul nu poate fi înaintea începutului.';
    if (f.lei.trim() === '' && f.kg.trim() === '') return 'Scrie arenda: lei pe hectar, kilograme pe hectar, sau amândouă.';
    if (Number.isNaN(optionalInt(f.lei)) || Number.isNaN(optionalInt(f.kg))) return 'Scrie arenda în numere întregi.';
    if (f.kg.trim() !== '' && !f.cropId) return 'Alege cultura în care se dă arenda.';
    return ContractInputSchema.safeParse(input()).success ? null : 'Ceva nu se potrivește. Verifică hectarele și sumele.';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = check();
    if (problem) return setErr(problem);
    setErr(null);
    setBusy(true);
    try {
      await store.send(({ write }) => (c ? write('update_lease_contract', { ...input(), id: c.id }) : write('add_lease_contract', { ...input(), clientId: clientId.current })));
      notify({ tone: 'info', title: c ? 'Am schimbat contractul' : 'Am adăugat contractul', body: `Cu ${owner.name}.` });
      onClose();
    } catch (e2) {
      setErr(failText(e2, online));
      setBusy(false);
    }
  }

  async function end() {
    setBusy(true);
    setErr(null);
    try {
      await store.send(({ write }) => write('archive_lease_contract', { id: c!.id }));
      notify({ tone: 'info', title: 'Contractul e încheiat', body: 'Rămâne în listă, ca încheiat.' });
      onClose();
    } catch (e2) {
      setErr(failText(e2, online));
      setBusy(false);
    }
  }

  return (
    <form className="ev-form" noValidate onSubmit={(e) => void submit(e)}>
      <div className="top">
        <h2 tabIndex={-1} autoFocus>
          {c ? 'Contractul' : 'Un contract nou'} cu {owner.name}
        </h2>
        <button type="button" className="x" aria-label="Înapoi la proprietar" onClick={onClose}>
          ×
        </button>
      </div>

      <fieldset>
        <legend>Cine lucrează pământul</legend>
        <div className="chips">
          {DIRECTION_WORDS.map(([d, label]) => (
            <button key={d} type="button" className="chip" aria-pressed={f.direction === d} disabled={ended} onClick={() => set({ direction: d })}>
              {label}
            </button>
          ))}
        </div>
        <small className="note">{DIRECTION_WORDS.find(([d]) => d === f.direction)![2]}</small>
      </fieldset>

      <div className="ev-fields">
        <label>
          Hectare
          <input inputMode="decimal" autoComplete="off" value={f.area} disabled={ended} onChange={(e) => set({ area: e.target.value })} />
        </label>
        <label>
          Unde e pământul <small>(satul)</small>
          <input value={f.locality} maxLength={80} disabled={ended} onChange={(e) => set({ locality: e.target.value })} />
        </label>
        <label>
          De pe
          <input type="date" value={f.startsOn} disabled={ended} onChange={(e) => set({ startsOn: e.target.value })} />
        </label>
        <label>
          Până pe <small>(cum scrie în contract)</small>
          <input type="date" min={f.startsOn} value={f.endsOn} disabled={ended} onChange={(e) => set({ endsOn: e.target.value })} />
        </label>
        <label>
          Arenda în bani, lei pe ha <small>(dacă e)</small>
          <input inputMode="numeric" autoComplete="off" value={f.lei} disabled={ended} onChange={(e) => set({ lei: e.target.value })} />
        </label>
        <label>
          Arenda în produse, kg pe ha <small>(dacă e)</small>
          <input inputMode="numeric" autoComplete="off" value={f.kg} disabled={ended} onChange={(e) => set({ kg: e.target.value })} />
        </label>
        {f.kg.trim() !== '' && (
          <fieldset className="ev-wide">
            <legend>În ce</legend>
            <div className="chips">
              {cropIds.map((id) => (
                <button key={id} type="button" className="chip" aria-pressed={f.cropId === id} disabled={ended} onClick={() => set({ cropId: id })}>
                  {cropName(id)}
                </button>
              ))}
            </div>
            {kg && price !== null ? (
              <small className="note">
                La prețul județului, {(price / 100).toFixed(2).replace('.', ',')} lei/kg, {group(kg)} kg pe ha fac {exact(kg * price)} lei pe ha.
              </small>
            ) : f.cropId ? (
              <small className="note">Prețul județului tău pentru {cropName(f.cropId).toLocaleLowerCase('ro')} nu e în aplicație.</small>
            ) : null}
          </fieldset>
        )}
        <label>
          Luna în care o plătești
          <select value={f.payMonth} disabled={ended} onChange={(e) => set({ payMonth: e.target.value })}>
            <option value="">nu știu</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Impozitul pe teren îl plătește</legend>
          <div className="chips">
            {(
              [
                ['farm', 'Ferma'],
                ['owner', 'Proprietarul'],
              ] as [LandTaxBy, string][]
            ).map(([t, label]) => (
              <button key={t} type="button" className="chip" aria-pressed={f.landTaxBy === t} disabled={ended} onClick={() => set({ landTaxBy: f.landTaxBy === t ? null : t })}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          Nr. de înregistrare la primărie
          <input value={f.regNo} maxLength={40} disabled={ended} onChange={(e) => set({ regNo: e.target.value })} />
        </label>
        <label>
          Data înregistrării
          <input type="date" value={f.regDate} disabled={ended} onChange={(e) => set({ regDate: e.target.value })} />
        </label>
        {plots && plots.length > 0 && (
          <fieldset className="ev-wide">
            <legend>Parcelele din contract {f.plotIds.length === 0 && <small>(dacă sunt pe hartă)</small>}</legend>
            <div className="chips">
              {plots.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chip"
                  aria-pressed={f.plotIds.includes(p.id)}
                  disabled={ended}
                  onClick={() => set({ plotIds: f.plotIds.includes(p.id) ? f.plotIds.filter((x) => x !== p.id) : [...f.plotIds, p.id] })}
                >
                  {plotName(p)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      {!f.regNo.trim() && !ended && <p className="note">Arendașul depune contractul la primăria fiecărei comune unde e pământul. Fără el, APIA poate să nu plătească pentru aceste hectare.</p>}

      <ErrorLine>{err}</ErrorLine>
      {!ended && (
        <div className="ob-actions">
          <NetButton reason="Se salvează când ai internet." type="submit" className="btn btn-dark" disabled={busy} aria-busy={busy}>
            {busy ? 'Se salvează…' : c ? 'Salvează' : 'Adaugă contractul'}
          </NetButton>
          {c && (
            <NetButton reason="Se salvează când ai internet." className="btn" disabled={busy} onClick={() => void end()}>
              Contractul s-a încheiat
            </NetButton>
          )}
        </div>
      )}
    </form>
  );
}
