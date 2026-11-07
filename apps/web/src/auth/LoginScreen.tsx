import { useState, type FormEvent } from 'react';
import { AuthError } from '@supabase/supabase-js';
import { t } from '../i18n';
import { supabase } from './supabase';
import { Logo } from '../components/ui';

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

  return (
    <div className="solo">
      <div className="solo-top field">
        <Logo />
      </div>
      <div className="card">
        <h1 className="title">{t(mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')}</h1>
        <p className="lead">{t('app.tagline')}</p>

        <form onSubmit={submit}>
          <label className="field-l">
            {t('auth.email')}
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field-l">
            {t('auth.password')}
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'register' && <span className="hint">{t('auth.passwordHint')}</span>}
          </label>

          {error && (
            <p role="alert" className="err">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="ok">
              {info}
            </p>
          )}

          <button type="submit" className="btn btn-dark btn-block" disabled={busy} style={{ marginTop: 18 }}>
            {busy ? t('common.wait') : t(mode === 'login' ? 'auth.loginButton' : 'auth.registerButton')}
          </button>
        </form>

        <button
          type="button"
          className="textbtn"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
            setInfo(null);
          }}
        >
          {t(mode === 'login' ? 'auth.switchToRegister' : 'auth.switchToLogin')}
        </button>
      </div>
    </div>
  );
}
