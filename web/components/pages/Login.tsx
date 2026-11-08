'use client';
/* "Intră în cont": sign in, sign up, and the end of sign-out (was web/legacy/login.js).
   Needs internet, and says so. A farmer already signed in never stops here, online or not. */
import { useEffect, useRef, useState } from 'react';
import * as Live from '../../lib/live/index';
import { AUTH_TEXT as TEXT } from '../../lib/live/auth';
import { FlowFrame } from '../app/FlowFrame';
import { ErrorLine } from '../app/bits';

type Mode = 'login' | 'register';

export default function Login() {
  const [mode, setModeState] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const next = useRef<string | null>(null);
  const login = mode === 'login';

  const setMode = (m: Mode) => {
    setModeState(m);
    document.title = `${TEXT[m === 'login' ? 'loginTitle' : 'registerTitle']} · CropCash`;
  };
  const clear = () => {
    setError(null);
    setInfo(null);
  };
  const enterApp = async () => location.replace(await Live.landingPage(next.current));

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    next.current = Live.safeNext(params.get('next'));
    /* "Fă-ți cont" (the landing page, Ion's farm) opens the form ready to sign up. */
    setMode(params.get('mode') === 'register' ? 'register' : 'login');
    const auth = Live.auth();
    void (async () => {
      if (params.has('signout')) {
        await auth.signOut();
        history.replaceState(null, '', location.pathname);
        return;
      }
      const failed = Live.linkErrorKey(location.hash);
      if (failed) return setError(TEXT.errors[failed]);
      if (await auth.isSignedIn()) await enterApp();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    clear();
    if (!navigator.onLine) return setError(TEXT.errors.offline);
    setBusy(true);
    const auth = Live.auth();
    try {
      if (login) {
        await auth.signIn(email.trim(), password);
        return await enterApp();
      }
      const ready = await auth.signUp(email.trim(), password, new URL('/login', location.href).href);
      if (ready) return await enterApp();
      setMode('login');
      setInfo(TEXT.checkEmail);
    } catch (e) {
      setError(TEXT.errors[Live.authErrorKey(e, navigator.onLine)]);
    }
    setBusy(false);
  }

  const pick = (m: string) => {
    if (busy) return;
    clear();
    setMode(m as Mode);
    emailRef.current?.focus();
  };

  return (
    <FlowFrame
      label="Cont"
      onPick={pick}
      steps={[
        { id: 'login', label: TEXT.loginTitle, icon: 'home', current: login },
        { id: 'register', label: TEXT.registerTitle, icon: 'sprout', current: !login },
      ]}
      aside={
        <div className="farm glass">
          <b>Vrei doar să te uiți?</b>
          Vezi cum arată aplicația pe ferma lui Ion, fără cont.
          <a className="ob-look" href="/ferma-lui-ion">
            Vezi ferma lui Ion
          </a>
        </div>
      }
    >
      <form
        className="ob-main"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <header className="page-h">
          <div>
            <p className="eyebrow">CropCash</p>
            <h1 tabIndex={-1}>{TEXT[login ? 'loginTitle' : 'registerTitle']}</h1>
            <p className="lead">{TEXT.tagline}</p>
          </div>
        </header>
        <section className="card">
          <h2>Contul tău</h2>
          <label className="ob-field">
            <span>{TEXT.email}</span>
            <input ref={emailRef} type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="ob-field">
            <span>{TEXT.password}</span>
            <input type="password" autoComplete={login ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {!login && <p className="note">{TEXT.passwordHint}</p>}
          <ErrorLine>{error}</ErrorLine>
          {info && (
            <p className="ob-info" role="status">
              {info}
            </p>
          )}
        </section>
        <div className="ob-actions">
          <button type="submit" className="btn btn-dark" disabled={busy}>
            {busy ? TEXT.wait : TEXT[login ? 'loginButton' : 'registerButton']}
          </button>
          <button
            type="button"
            className="btn btn-line"
            disabled={busy}
            onClick={() => {
              clear();
              setMode(login ? 'register' : 'login');
            }}
          >
            {TEXT[login ? 'switchToRegister' : 'switchToLogin']}
          </button>
        </div>
        <p className="note ob-look-m">
          Vrei doar să te uiți? <a href="/ferma-lui-ion">Vezi ferma lui Ion</a>, fără cont.
        </p>
      </form>
    </FlowFrame>
  );
}
