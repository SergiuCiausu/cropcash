import { useCallback, useEffect, useState } from 'react';
import type { SubsidyResult } from '@cropcash/shared';
import { t } from './i18n';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { api } from './api/client';
import { Onboarding } from './screens/Onboarding/Onboarding';
import { SubsidyResultScreen } from './screens/SubsidyResult';
import { AppShell } from './screens/app/AppShell';
import type { Farm } from './lib/plan';

interface Me {
  userId: string;
  farmer: Farm | null;
}

type FarmState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'onboarding' }
  | { kind: 'firstResult'; name: string; subsidies: SubsidyResult }
  | { kind: 'ready'; farm: Farm };

const Loading = () => <main className="loading">{t('common.wait')}</main>;

function FarmGate() {
  const { signOut } = useAuth();
  const [state, setState] = useState<FarmState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const me = await api<Me>('/api/me');
      setState(me.farmer ? { kind: 'ready', farm: me.farmer } : { kind: 'onboarding' });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  switch (state.kind) {
    case 'loading':
      return <Loading />;
    case 'error':
      return (
        <div className="solo">
          <div className="card panel">
            <p role="alert" className="err">
              {t('home.loadError')}
            </p>
            <button type="button" className="primary" onClick={load}>
              {t('common.retry')}
            </button>
            <button type="button" className="textbtn" onClick={() => void signOut()}>
              {t('auth.logout')}
            </button>
          </div>
        </div>
      );
    case 'onboarding':
      return <Onboarding onDone={(r) => setState({ kind: 'firstResult', ...r })} />;
    case 'firstResult':
      return <SubsidyResultScreen name={state.name} result={state.subsidies} onNext={load} />;
    case 'ready':
      return <AppShell farm={state.farm} />;
  }
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  // key: remount (and refetch) when the user changes.
  return session ? <FarmGate key={session.user.id} /> : <LoginScreen />;
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
