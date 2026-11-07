import { useState, type FormEvent } from 'react';
import { AuthError } from '@supabase/supabase-js';
import { t } from '../i18n';
import { supabase } from './supabase';

type Mode = 'login' | 'register';

const KNOWN_ERRORS = new Set([
  'invalid_credentials',
  'user_already_exists',
  'weak_password',
  'email_not_confirmed',
  'over_email_send_rate_limit',
  'validation_failed',
]);

function errorKey(err: unknown): string {
  if (err instanceof AuthError && err.code && KNOWN_ERRORS.has(err.code)) return `auth.errors.${err.code}`;
  if (!navigator.onLine) return 'offline.needed.login';
  return 'auth.errors.generic';
}

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // With "Confirm email" enabled, there is no session until the link is clicked.
        if (!data.session) setInfo(t('auth.checkEmail'));
      }
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full rounded-xl border-2 border-field-600/40 bg-white px-4 py-4 text-xl focus:border-field-700 focus:outline-none';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-8">
      <header className="text-center">
        <h1 className="text-4xl font-bold text-field-700">{t('app.name')}</h1>
        <p className="mt-1 text-lg">{t('app.tagline')}</p>
      </header>

      <h2 className="text-2xl font-semibold">{t(mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')}</h2>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-lg">{t('auth.email')}</span>
          <input
            className={input}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-lg">{t('auth.password')}</span>
          <input
            className={input}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'register' && <span className="text-base text-field-900/70">{t('auth.passwordHint')}</span>}
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-red-100 px-4 py-3 text-lg text-red-900">
            {error}
          </p>
        )}
        {info && (
          <p role="status" className="rounded-xl bg-field-600/10 px-4 py-3 text-lg">
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-2xl bg-field-700 px-6 py-5 text-2xl font-semibold text-white disabled:opacity-60"
        >
          {busy ? t('common.wait') : t(mode === 'login' ? 'auth.loginButton' : 'auth.registerButton')}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError(null);
          setInfo(null);
        }}
        className="py-3 text-lg text-field-700 underline"
      >
        {t(mode === 'login' ? 'auth.switchToRegister' : 'auth.switchToLogin')}
      </button>
    </main>
  );
}
