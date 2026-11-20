'use client';
/* „Accize” on /subventii (docs/accize-plan.md §4): the excise schemes from docs/data/excise-schemes.json, in two
   groups. „Îți aduce bani” is money the state pays back (the diesel refund): an approved acord puts it in the
   salary. „Plătești mai puțin” lowers a cost and is never income. The farmer's answer is saved on the farm, or
   waits in the queue without internet (it only notes the acord); on Ion's farm it stays on the phone. */
import { useState } from 'react';
import type { ExciseEnrollmentStatus, ExciseScheme } from '../../../packages/shared/src/data/excise';
import { exciseEnrollmentRefusal, groupExcise } from '../../../packages/shared/src/data/excise';
import { date, exact, failText } from '../../lib/cc/format';
import { useFarm, useMoney, useOnline, useStore, useView } from '../../lib/cc/react';
import { useHref, Verify } from '../app/bits';
import { PageLink } from '../app/Frame';
import { usePapers } from '../app/Papers';

/** What the farm said about a refund, as the three buttons name it. */
const REFUND_CHOICES: { status: ExciseEnrollmentStatus; label: string }[] = [
  { status: 'left', label: 'Nu' },
  { status: 'acord_filed', label: 'Am depus acordul' },
  { status: 'approved', label: 'Am primit acordul' },
];

const isUnverified = (s: ExciseScheme) => s.status === 'DE-VERIFICAT' || s.payment_lag_months?.status === 'DE-VERIFICAT' || s.join_deadline?.status === 'DE-VERIFICAT';

export function ExciseCard() {
  const view = useView('picked')!;
  const farm = useFarm()!;
  const store = useStore()!;
  const online = useOnline();
  const papers = usePapers();
  const href = useHref();
  const { text: t } = useMoney();
  const [saving, setSaving] = useState<string | null>(null);

  const data = view.data();
  const file = data.excise;
  const { revenue, savings } = groupExcise(file);
  const year = Number(view.today.slice(0, 4));
  const statusOf = (id: string, y: number) => farm.excise.find((e) => e.scheme_id === id && e.year === y)?.status ?? null;

  /* The refunds the plan counts this year and after: the money the switch puts in the salary. */
  const refunds = view
    .farmPlan()
    .timelines.medium.months.flatMap((m) => m.entries)
    .filter((e) => e.kind === 'excise_refund');
  const refundBani = refunds.reduce((s, e) => s + e.value, 0);

  async function set(schemeId: string, y: number, status: ExciseEnrollmentStatus) {
    setSaving(`${schemeId}:${y}`);
    try {
      await store.setExcise({ schemeId, year: y, status });
    } catch (e) {
      void papers.tell('Nu am putut salva', failText(e, online));
    } finally {
      setSaving(null);
    }
  }

  const refund = (s: ExciseScheme) => {
    const current = statusOf(s.id, year);
    const next = year + 1;
    const nextOpen = !exciseEnrollmentRefusal(file, { schemeId: s.id, year: next, status: 'acord_filed' });
    return (
      <div className="reason" key={s.id}>
        <div className="r-top">
          <b>
            {s.name_ro}
            {isUnverified(s) ? (
              <>
                {' '}
                <Verify />
              </>
            ) : null}
          </b>
          {current === 'approved' && <span className="tag ok">În salariu</span>}
        </div>
        <small>{s.what_ro}</small>
        {s.who_ro && <small>Cine: {s.who_ro}</small>}
        {s.how_to_join_ro && <small>Cum: {s.how_to_join_ro}</small>}
        <div className="chips" role="group" aria-label={`${s.name_ro}, ${year}`}>
          {REFUND_CHOICES.map((c) => (
            <button
              key={c.status}
              type="button"
              className="chip"
              aria-pressed={(current ?? 'left') === c.status}
              disabled={saving === `${s.id}:${year}`}
              onClick={() => (current ?? 'left') !== c.status && set(s.id, year, c.status)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <small>Pentru {year}.</small>
        {current === 'approved' &&
          (refundBani > 0 ? (
            <small>
              {t(`În plan: ${exact(refundBani)} lei`)}, {refunds.length === 1 ? 'o plată' : `${refunds.length} plăți`}. Intră în salariul tău.
            </small>
          ) : (
            <small>
              Încă nu intră nimic în salariu: notează litrii de motorină la cheltuieli, pe{' '}
              <PageLink path="/recolte" href={href('/recolte')}>
                Recolte
              </PageLink>
              . Banii se socotesc doar din litrii notați.
            </small>
          ))}
        {current === 'acord_filed' && <small>Când primești acordul de la APIA, apasă „Am primit acordul”, ca banii să intre în salariu.</small>}
        {s.valid_to && !nextOpen && (
          <small>
            Schema merge până pe {date(s.valid_to, true)}. Pentru {next} nu s-a anunțat încă nimic; când apare, o punem aici.
          </small>
        )}
      </div>
    );
  };

  const savingCard = (s: ExciseScheme) => {
    const following = statusOf(s.id, year) === 'interested';
    return (
      <div className="reason" key={s.id}>
        <div className="r-top">
          <b>
            {s.name_ro}
            {isUnverified(s) ? (
              <>
                {' '}
                <Verify />
              </>
            ) : null}
          </b>
          {s.status === 'propunere' ? <span className="tag d">Doar propunere, nu e lege</span> : <span className="tag n">Nu primești bani</span>}
        </div>
        <small>{s.what_ro}</small>
        {s.who_ro && <small>Cine: {s.who_ro}</small>}
        {s.how_to_join_ro && <small>Cum: {s.how_to_join_ro}</small>}
        <div className="chips">
          <button
            type="button"
            className="chip"
            aria-pressed={following}
            disabled={saving === `${s.id}:${year}`}
            onClick={() => set(s.id, year, following ? 'left' : 'interested')}
          >
            Mă interesează
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="card s12 excise">
      <div className="card-h">
        <h2>Accize: bani înapoi de la stat</h2>
      </div>
      <p className="note">Doar banii pe care statul ți-i dă înapoi intră în salariu. Restul te ajută să plătești mai puțin.</p>
      <h3 className="lab">Îți aduce bani</h3>
      {revenue.map(refund)}
      <h3 className="lab">Plătești mai puțin</h3>
      {savings.map(savingCard)}
      <p className="note gap">Verificat pe {date(file.meta.read_on, true)}, din lege și de la APIA.</p>
    </section>
  );
}
