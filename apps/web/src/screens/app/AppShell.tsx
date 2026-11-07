import { useState } from 'react';
import { t } from '../../i18n';
import { Icon, type IconName } from '../../components/Icon';
import { Sheet } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { formatHa, formatToday } from '../../lib/format';
import { countyName, useFarmPlan, type Farm } from '../../lib/plan';
import { useAuth } from '../../auth/AuthProvider';
import { SubsidyResultContent } from '../SubsidyResult';
import { HomeView } from './HomeView';
import { ForecastView } from './ForecastView';
import { FieldsView } from './FieldsView';
import { ReservesView } from './ReservesView';

export type View = 'home' | 'forecast' | 'fields' | 'reserve';

const VIEWS: { id: View; icon: IconName }[] = [
  { id: 'home', icon: 'home' },
  { id: 'forecast', icon: 'bars' },
  { id: 'fields', icon: 'sprout' },
  { id: 'reserve', icon: 'shield' },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Logged-in app: sidebar on laptops, glass tab bar on phones (team prototype layout). */
export function AppShell({ farm, onChanged }: { farm: Farm; onChanged: () => Promise<void> }) {
  const plan = useFarmPlan(farm);
  const { session, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const [view, setView] = useState<View>('home');
  const [subsidyOpen, setSubsidyOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const go = (v: View) => {
    setView(v);
    scrollTo(0, 0);
  };

  const nav = (cls: string) =>
    VIEWS.map((v) => (
      <button
        key={v.id}
        type="button"
        className={cls}
        aria-current={view === v.id ? 'page' : undefined}
        onClick={() => go(v.id)}
      >
        <Icon name={v.icon} />
        <span>{t(`nav.${v.id}`)}</span>
      </button>
    ));

  const firstName = farm.name.split(/\s+/)[0] ?? farm.name;

  return (
    <div className="app">
      <aside className="side" aria-label={t('nav.menu')}>
        <div className="brand">
          <span className="orb" />
          {t('app.name')}
        </div>
        <div>{nav('nav')}</div>
        <div className="farm">
          <b>{farm.name}</b>
          {t('nav.farmSide', { ha: formatHa(plan.totalHa), county: countyName(farm.county) })}
          <br />
          <span>{t('nav.asOf', { date: formatToday() })}</span>
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <div className="who">
            <h1>{t(`pages.${view}.title`, { name: firstName })}</h1>
            <p>{t(`pages.${view}.sub`)}</p>
          </div>
          <span className="sample only-wide">{t('common.sample')}</span>
          <button
            className="iconbtn"
            type="button"
            onClick={toggle}
            aria-label={t(theme === 'night' ? 'theme.toDay' : 'theme.toNight')}
          >
            <Icon name={theme === 'night' ? 'sun' : 'moon'} />
          </button>
          <button className="avatar" type="button" onClick={() => setAccountOpen(true)} aria-label={farm.name}>
            {initials(farm.name)}
          </button>
        </div>

        {view === 'home' && <HomeView plan={plan} go={go} openSubsidy={() => setSubsidyOpen(true)} onChanged={onChanged} />}
        {view === 'forecast' && <ForecastView plan={plan} />}
        {view === 'fields' && <FieldsView plan={plan} openSubsidy={() => setSubsidyOpen(true)} />}
        {view === 'reserve' && <ReservesView plan={plan} onChanged={onChanged} />}
      </main>

      <nav className="tabs" aria-label={t('nav.menu')}>
        {nav('')}
      </nav>

      <Sheet open={subsidyOpen} onClose={() => setSubsidyOpen(false)} title={t('fields.subsidyTitle')}>
        <SubsidyResultContent result={plan.subsidies} />
      </Sheet>

      <Sheet open={accountOpen} onClose={() => setAccountOpen(false)} title={farm.name}>
        <p className="muted">{session?.user.email}</p>
        <button type="button" className="primary" onClick={() => void signOut()}>
          {t('auth.logout')}
        </button>
      </Sheet>
    </div>
  );
}
