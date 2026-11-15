'use client';
/* „În [luna] nu ajung banii de salariile oamenilor” (plan.payrollShort, docs/employees-arenda-plan.md §1.3).
   It comes before any warning about the farmer's own salary: the people are paid first. Nothing when the
   money is enough, or the farm has no people. Read from the plan on the phone, so it shows offline too. */
import { exact } from '../../lib/cc/format';
import { useHref } from './bits';
import { PageLink } from './Frame';
import type { FarmPlan } from '../../../packages/shared/src/functions/plan';
import '../../styles/people.css';

const MONTH_NAMES = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export const monthName = (key: string) => MONTH_NAMES[Number(key.slice(5, 7)) - 1]!;

/** `link`: a link to Oameni under the text (on Acasă and Salariu). */
export function PayrollWarn({ plan, link = false }: { plan: FarmPlan; link?: boolean }) {
  const href = useHref();
  const short = plan.payrollShort.medium;
  if (short.length === 0) return null;
  const first = short[0]!;
  const more = short.length - 1;
  return (
    <section className="card s12 pp-warn" role="status">
      <h2>În {monthName(first.key)} nu ajung banii de salariile oamenilor</h2>
      <p className="note">
        Lipsesc cam {exact(first.missing)} lei din {exact(first.payroll)} lei de plătit
        {more > 0 ? `, și la fel în încă ${more === 1 ? 'o lună' : `${more} luni`}` : ''}. E înainte de salariul tău, într-un an normal.
        {link && (
          <>
            {' '}
            <PageLink path="/oameni" href={href('/oameni')}>
              Vezi oamenii
            </PageLink>
          </>
        )}
      </p>
    </section>
  );
}
