'use client';
/* "Intră în cont": sign in, sign up, a forgotten password, and the end of sign-out (was web/legacy/login.js).
   Needs internet, and says so. A farmer already signed in never stops here, online or not. */
import { useEffect, useRef, useState } from 'react';
import * as Live from '../../lib/live/index';
import { AUTH_TEXT as TEXT } from '../../lib/live/auth';
import { FlowFrame } from '../app/FlowFrame';
import { ErrorLine } from '../app/bits';

type Mode = 'login' | 'register' | 'forgot' | 'new-password';

const TITLE = { login: TEXT.loginTitle, register: TEXT.registerTitle, forgot: TEXT.forgotTitle, 'new-password': TEXT.newPasswordTitle };
const LEAD = { login: TEXT.tagline, register: TEXT.tagline, forgot: TEXT.forgotLead, 'new-password': TEXT.newPasswordLead };
const BUTTON = { login: TEXT.loginButton, register: TEXT.registerButton, forgot: TEXT.forgotButton, 'new-password': TEXT.newPasswordButton };
const hereUrl = (path: string) => new URL(path, location.href).href;

export default function Login() {
  const [mode, setModeState] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  /* Offered once the app knows the account is waiting for its link. */
  const [canResend, setCanResend] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const next = useRef<string | null>(null);
  const login = mode === 'login';

  const setMode = (m: Mode) => {
    setModeState(m);
    document.title = `${TITLE[m]} · CropCash`;
  };
  const clear = () => {
    setError(null);
    setInfo(null);
    setCanResend(false);
  };
  const enterApp = async () => location.replace(await Live.landingPage(next.current));

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    next.current = Live.safeNext(params.get('next'));
    /* "Fă-ți cont" (the landing page, Ion's farm) opens the form ready to sign up. */
    const recovering = params.get('mode') === 'new-password';
    setMode(params.get('mode') === 'register' ? 'register' : recovering ? 'new-password' : 'login');
    const auth = Live.auth();
    void (async () => {
      if (params.has('signout')) {
        await auth.signOut();
        history.replaceState(null, '', location.pathname);
        return;
      }
      const failed = Live.linkErrorKey(location.hash);
      if (failed) {
        if (recovering) setMode('forgot');
        return setError(TEXT.errors[failed]);
      }
      /* The recovery link signs the farmer in, and the new password still has to be asked. */
      const signedIn = await auth.isSignedIn();
      if (recovering) {
        if (signedIn) return;
        setMode('forgot');
        return setError(TEXT.errors.link_expired);
      }
      if (signedIn) await enterApp();
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
      if (mode === 'forgot') {
        await auth.sendPasswordReset(email.trim(), hereUrl('/login?mode=new-password'));
        setInfo(TEXT.forgotSent);
      } else if (mode === 'new-password') {
        await auth.setNewPassword(password);
        return await enterApp();
      } else {
        const ready = await auth.signUp(email.trim(), password, hereUrl('/login'));
        if (ready) return await enterApp();
        setMode('login');
        setInfo(TEXT.checkEmail);
        setCanResend(true);
      }
    } catch (e) {
      const key = Live.authErrorKey(e, navigator.onLine);
      setError(TEXT.errors[key]);
      if (key === 'email_not_confirmed') setCanResend(true);
    }
    setBusy(false);
  }

  async function resend() {
    setError(null);
    setInfo(null);
    if (!navigator.onLine) return setError(TEXT.errors.offline);
    setBusy(true);
    try {
      await Live.auth().resendConfirmation(email.trim(), hereUrl('/login'));
      setInfo(TEXT.resent);
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
            <h1 tabIndex={-1}>{TITLE[mode]}</h1>
            <p className="lead">{LEAD[mode]}</p>
          </div>
        </header>
        <section className="card">
          <h2>Contul tău</h2>
          {mode !== 'new-password' && (
            <label className="ob-field">
              <span>{TEXT.email}</span>
              <input ref={emailRef} type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {mode !== 'forgot' && (
            <>
              <label className="ob-field">
                <span>{mode === 'new-password' ? TEXT.newPassword : TEXT.password}</span>
                <input type={showPassword ? 'text' : 'password'} autoComplete={login ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <button type="button" className="ob-small" aria-pressed={showPassword} onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? TEXT.hidePassword : TEXT.showPassword}
              </button>
            </>
          )}
          {login && (
            <button type="button" className="ob-small" disabled={busy} onClick={() => (clear(), setMode('forgot'))}>
              {TEXT.forgotLink}
            </button>
          )}
          {(mode === 'register' || mode === 'new-password') && <p className="note">{TEXT.passwordHint}</p>}
          <ErrorLine>{error}</ErrorLine>
          {info && (
            <p className="ob-info" role="status">
              {info}
            </p>
          )}
          {canResend && (
            <button type="button" className="ob-small" disabled={busy || !email.trim()} onClick={() => void resend()}>
              {TEXT.resendButton}
            </button>
          )}
        </section>
        <div className="ob-actions">
          <button type="submit" className="btn btn-dark" disabled={busy}>
            {busy ? TEXT.wait : BUTTON[mode]}
          </button>
          {mode !== 'new-password' && (
            <button
              type="button"
              className="btn btn-line"
              disabled={busy}
              onClick={() => {
                clear();
                setMode(login ? 'register' : 'login');
              }}
            >
              {login ? TEXT.switchToRegister : mode === 'forgot' ? TEXT.backToLogin : TEXT.switchToLogin}
            </button>
          )}
        </div>
        <p className="note ob-look-m">
          Vrei doar să te uiți? <a href="/ferma-lui-ion">Vezi ferma lui Ion</a>, fără cont.
        </p>
      </form>
    </FlowFrame>
  );
}
