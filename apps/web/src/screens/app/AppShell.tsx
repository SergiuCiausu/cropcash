import { useEffect, useState } from 'react';
import type { AmountScenario } from '@cropcash/shared';
import { t } from '../../i18n';
import { Sheet } from '../../components/ui';
import { usePalette } from '../../lib/palette';
import { useFarmPlan, type Farm, type FarmPlan } from '../../lib/plan';
import { useAuth } from '../../auth/AuthProvider';
import { SubsidyResultContent } from '../SubsidyResult';
import { CreditSheet } from './blocks';
import { DeckApp } from './DeckApp';
import { RailApp } from './RailApp';

export type View = 'home' | 'forecast' | 'fields' | 'reserve';

export interface ShellProps {
  plan: FarmPlan;
  farm: Farm;
  view: View;
  go: (v: View) => void;
  scenario: AmountScenario;
  setScenario: (s: AmountScenario) => void;
  palette: string;
  setPalette: (id: string) => void;
  initials: string;
  openSubsidy: () => void;
  openCredit: () => void;
  openAccount: () => void;
  onChanged: () => Promise<void>;
}

/** Phone layout below 760 px wide (or short landscape screens), as in the prototype. */
const PHONE_QUERY = '(max-width: 760px), (max-height: 500px)';

function useIsPhone() {
  const [phone, setPhone] = useState(() => matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Logged-in app: c-deck on phones, 2-rail on laptops (team prototype). */
export function AppShell({ farm, onChanged }: { farm: Farm; onChanged: () => Promise<void> }) {
  const plan = useFarmPlan(farm);
  const phone = useIsPhone();
  const { session, signOut } = useAuth();
  const { id: palette, choose: setPalette } = usePalette();
  const [view, setView] = useState<View>('home');
  const [scenario, setScenario] = useState<AmountScenario>('medium');
  const [subsidyOpen, setSubsidyOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const props: ShellProps = {
    plan,
    farm,
    view,
    go: (v) => {
      setView(v);
      scrollTo(0, 0);
    },
    scenario,
    setScenario,
    palette,
    setPalette,
    initials: initialsOf(farm.name),
    openSubsidy: () => setSubsidyOpen(true),
    openCredit: () => setCreditOpen(true),
    openAccount: () => setAccountOpen(true),
    onChanged,
  };

  return (
    <>
      {phone ? <DeckApp {...props} /> : <RailApp {...props} />}

      <Sheet open={subsidyOpen} onClose={() => setSubsidyOpen(false)} title={t('fields.subsidyTitle')}>
        <SubsidyResultContent result={plan.subsidies} />
      </Sheet>
      {creditOpen && <CreditSheet onClose={() => setCreditOpen(false)} onSaved={onChanged} suggestion={plan.creditSuggestion} />}
      <Sheet open={accountOpen} onClose={() => setAccountOpen(false)} title={farm.name}>
        <p className="muted">{session?.user.email}</p>
        <button type="button" className="btn btn-dark btn-block" style={{ marginTop: 14 }} onClick={() => void signOut()}>
          {t('auth.logout')}
        </button>
      </Sheet>
    </>
  );
}
