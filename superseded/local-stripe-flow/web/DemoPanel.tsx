import { useEffect, useRef, useState } from 'react';
import { advanceClock, saveEnvelopes, simulateApiaAdvance, startPension } from '@cropcash/shared';
import type { Envelopes } from '@cropcash/shared';
import { t } from '../../i18n';
import { Sheet } from '../../components/ui';
import { callWrite } from '../../functions/call';
import { formatMoney } from '../../lib/format';
import { pensionSuggestion, type Farm, type FarmPlan } from '../../lib/plan';

const MONTHS_FORWARD = 6;
const WATCH_MS = 2_500;
const WATCH_LIMIT_MS = 180_000;

interface Arrival {
  amount: number;
  split: Envelopes;
  monthsCovered: number;
}

/** The two stage buttons, the "Au intrat bani!" sheet, and what was paid. Needs internet. */
export function DemoPanel({ farm, plan, onChanged }: { farm: Farm; plan: FarmPlan; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const watching = useRef<number | null>(null);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    addEventListener('online', sync);
    addEventListener('offline', sync);
    return () => {
      removeEventListener('online', sync);
      removeEventListener('offline', sync);
      if (watching.current !== null) clearInterval(watching.current);
    };
  }, []);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch {
      setError(t('demo.failed'));
    } finally {
      setBusy(false);
    }
  };

  const receive = () =>
    run(async () => {
      setArrival((await callWrite(simulateApiaAdvance, {})) as Arrival);
      await onChanged();
    });

  const pension = pensionSuggestion(plan, farm);
  const startThePension = () => run(async () => {
    await callWrite(startPension, { monthly: pension.monthly });
    await onChanged();
  });

  // The server works in the background, so the page refreshes until the months have arrived.
  const moveOn = () =>
    run(async () => {
      await callWrite(advanceClock, { months: MONTHS_FORWARD });
      await new Promise<void>((resolve) => {
        const started = Date.now();
        watching.current = window.setInterval(() => {
          void onChanged();
          if (Date.now() - started > WATCH_LIMIT_MS) {
            clearInterval(watching.current!);
            watching.current = null;
            resolve();
          }
        }, WATCH_MS);
      });
    });

  const accept = () =>
    run(async () => {
      if (!arrival) return;
      const balances = Object.fromEntries(
        Object.entries(plan.envelopes).map(([k, v]) => [k, v + arrival.split[k as keyof Envelopes]]),
      ) as unknown as Envelopes;
      await callWrite(saveEnvelopes, balances);
      setArrival(null);
      await onChanged();
    });

  const salaries = [...(farm.payouts ?? [])].sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  const pensions = (farm.transactions ?? []).filter((x) => x.source === 'subscription');
  const noPension = ![farm.pension_plans ?? []].flat().some((p) => p.status === 'active');

  return (
    <section className="demo" aria-label={t('demo.label')}>
      <div className="demo-row">
        <button type="button" className="btn btn-line" disabled={busy || !online} onClick={() => void receive()}>
          {t('demo.advance')}
        </button>
        {noPension && pension.monthly > 0 && (
          <button type="button" className="btn btn-line" disabled={busy || !online} onClick={() => void startThePension()}>
            {t('demo.pension', { amount: formatMoney(pension.monthly) })}
          </button>
        )}
        <button type="button" className="btn btn-dark" disabled={busy || !online} onClick={() => void moveOn()}>
          {busy ? t('demo.running') : t('demo.forward', { months: MONTHS_FORWARD })}
        </button>
      </div>
      {!online && <p className="muted">{t('demo.offline')}</p>}
      {error && <p role="alert" className="err">{error}</p>}
      {(salaries.length > 0 || pensions.length > 0) && (
        <ol className="demo-paid">
          {salaries.map((s) => (
            <li key={s.id}>
              <span>{s.scheduled_for.slice(0, 7)}</span>
              <span>{t(`demo.salary.${s.status}`, { amount: formatMoney(s.amount_bani) })}</span>
            </li>
          ))}
          {pensions.length > 0 && (
            <li>
              <span>{t('demo.pensionPaid')}</span>
              <span>{t('demo.pensionCount', { count: pensions.length })}</span>
            </li>
          )}
        </ol>
      )}

      <Sheet open={arrival !== null} onClose={() => setArrival(null)} title={t('demo.arrivedTitle')}>
        {arrival && (
          <>
            <p>{t('demo.arrived', { amount: formatMoney(arrival.amount) })}</p>
            <ul className="demo-split">
              {Object.entries(arrival.split)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => (
                  <li key={k}>
                    <span>{t(`envelopes.kinds.${k}`)}</span>
                    <strong>{formatMoney(v)} {t('common.currency')}</strong>
                  </li>
                ))}
            </ul>
            <button type="button" className="btn btn-dark btn-block" disabled={busy || !online} onClick={() => void accept()}>
              {t('envelopes.confirm')}
            </button>
            <button type="button" className="linkbtn" onClick={() => setArrival(null)}>
              {t('demo.later')}
            </button>
          </>
        )}
      </Sheet>
    </section>
  );
}
