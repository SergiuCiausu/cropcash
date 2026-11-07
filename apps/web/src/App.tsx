import { useEffect, useState } from 'react';
import { t } from './i18n';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { api } from './api/client';

interface Me {
  userId: string;
  farmer: { name: string } | null;
}

function Home() {
  const { session, signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>('/api/me').then(setMe).catch(() => setMe(null));
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold text-field-700">{t('app.name')}</h1>
      <p className="text-xl">{t('home.loggedInAs', { email: session?.user.email ?? '' })}</p>
      {me && !me.farmer && <p className="text-lg">{t('home.noFarmYet')}</p>}
      <button onClick={signOut} className="mt-6 rounded-2xl border-2 border-field-700 px-6 py-4 text-xl">
        {t('auth.logout')}
      </button>
    </main>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center text-xl">{t('common.wait')}</main>;
  }
  return session ? <Home /> : <LoginScreen />;
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
