import { useCallback, useEffect, useState } from 'react';
import type { SubsidyResult } from '@cropcash/shared';
import { t } from './i18n';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { api } from './api/client';
import { Onboarding, type OnboardingDone } from './screens/Onboarding/Onboarding';
import { SubsidyResultScreen } from './screens/SubsidyResult';
import { Alert, SecondaryButton } from './components/ui';

interface Me {
  userId: string;
  farmer: { name: string } | null;
}

type FarmState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'onboarding' }
  | { kind: 'ready'; name: string; subsidies: SubsidyResult };

function FarmGate() {
  const { signOut } = useAuth();
  const [state, setState] = useState<FarmState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const me = await api<Me>('/api/me');
      if (!me.farmer) {
        setState({ kind: 'onboarding' });
        return;
      }
      const subsidies = await api<SubsidyResult>('/api/subsidies');
      setState({ kind: 'ready', name: me.farmer.name, subsidies });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  switch (state.kind) {
    case 'loading':
      return <main className="flex min-h-dvh items-center justify-center text-xl">{t('common.wait')}</main>;
    case 'error':
      return (
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
          <Alert>{t('home.loadError')}</Alert>
          <SecondaryButton onClick={load}>{t('common.retry')}</SecondaryButton>
          <SecondaryButton onClick={signOut}>{t('auth.logout')}</SecondaryButton>
        </main>
      );
    case 'onboarding':
      return (
        <Onboarding
          onDone={(r: OnboardingDone) => setState({ kind: 'ready', name: r.name, subsidies: r.subsidies })}
        />
      );
    case 'ready':
      // Step 4 replaces this with the tabbed home (Bani / Calendar / Îmi ajung? / De făcut).
      return (
        <>
          <SubsidyResultScreen name={state.name} result={state.subsidies} />
          <div className="mx-auto max-w-md px-4 pb-8">
            <SecondaryButton className="w-full" onClick={signOut}>
              {t('auth.logout')}
            </SecondaryButton>
          </div>
        </>
      );
  }
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center text-xl">{t('common.wait')}</main>;
  }
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
