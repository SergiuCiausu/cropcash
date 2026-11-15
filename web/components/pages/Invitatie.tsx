'use client';
/* /invitatie?cod=…: the link a farmer sent (migration 028). Someone without an account makes one, or
   signs in, and comes back here; the invite email signs a new account in at once and only asks for a
   password. Accepting needs internet and is never queued. Then /contabil. */
import { useEffect, useState } from 'react';
import * as Live from '../../lib/live/index';
import { acceptInvite, INVITE_ERRORS, inviteCodeFrom } from '../../lib/members';
import { ErrorLine, Icon } from '../app/bits';
import '../../styles/reports.css';

type Step = 'loading' | 'signed-out' | 'password' | 'accept' | 'bad';

export default function Invitatie() {
  const [step, setStep] = useState<Step>('loading');
  const [code, setCode] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const c = inviteCodeFrom(location.search);
    setCode(c);
    if (!c) {
      setStep('bad');
      return setError(INVITE_ERRORS.not_found!);
    }
    /* Read before the sign-in library takes the hash away. */
    const hash = location.hash;
    const fromInviteEmail = /[#&]type=invite(&|$)/.test(hash);
    void (async () => {
      if (Live.linkErrorKey(hash)) {
        setError('Linkul din e-mail a expirat. Intră în cont sau fă-ți unul, apoi deschide din nou linkul de la fermier.');
      }
      const auth = Live.auth();
      const signedIn = await auth.isSignedIn().catch(() => false);
      if (!signedIn) return setStep('signed-out');
      const { data } = await Live.supabase().auth.getUser();
      setEmail(data.user?.email ?? null);
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      setStep(fromInviteEmail ? 'password' : 'accept');
    })();
  }, []);

  const back = code ? encodeURIComponent(`/invitatie?cod=${code}`) : '';

  async function accept() {
    if (!code) return;
    if (!navigator.onLine) return setError(INVITE_ERRORS.offline!);
    setBusy(true);
    setError('');
    try {
      if (step === 'password') await Live.auth().setNewPassword(password);
      await acceptInvite(Live.api, code);
      location.replace(Live.MEMBER_HOME);
    } catch (e) {
      const key = e instanceof Live.ApiError ? (e.code === 'offline' ? 'offline' : e.code) : null;
      setError((key && INVITE_ERRORS[key]) || (step === 'password' ? Live.AUTH_TEXT.errors[Live.authErrorKey(e, navigator.onLine)] : 'Nu s-a putut. Încearcă din nou.'));
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <a className="auth-brand" href="/">
        <span className="mark">
          <Icon name="sprout" />
        </span>
        CropCash
      </a>
      <form
        className="auth-card"
        onSubmit={(e) => {
          e.preventDefault();
          void accept();
        }}
      >
        <header className="auth-head">
          <h1>Ai primit o invitație</h1>
          <p className="lead">Un fermier te lasă să vezi rapoartele fermei lui în CropCash: registrul, subvențiile, motorina, terenul. Doar le vezi; nu poți schimba nimic.</p>
        </header>
        {step === 'signed-out' && (
          <div className="invite-actions">
            <p className="note">Ca să le vezi, intră în contul tău CropCash sau fă-ți unul. Apoi te întorci aici.</p>
            <a className="btn btn-dark" href={`/login?mode=register&next=${back}`}>
              Fă-ți cont
            </a>
            <a className="btn" href={`/login?next=${back}`}>
              Am deja cont
            </a>
          </div>
        )}
        {step === 'password' && (
          <div className="auth-fields">
            <p className="note">Contul tău e făcut{email ? ` (${email})` : ''}. Alege o parolă, ca să poți intra și altă dată.</p>
            <label className="ob-field">
              <span>{Live.AUTH_TEXT.newPassword}</span>
              <input type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <p className="note">{Live.AUTH_TEXT.passwordHint}</p>
          </div>
        )}
        {step === 'accept' && <p className="note">Intri ca {email ?? 'contul tău'}. Dacă nu ești tu, ieși din cont și intră cu contul potrivit.</p>}
        <ErrorLine>{error}</ErrorLine>
        {(step === 'accept' || step === 'password') && (
          <button type="submit" className="btn btn-dark auth-submit" disabled={busy}>
            {busy ? Live.AUTH_TEXT.wait : 'Acceptă invitația'}
          </button>
        )}
        {step === 'accept' && (
          <a className="ob-small auth-back" href={`/login?signout&next=${back}`}>
            Nu sunt eu
          </a>
        )}
      </form>
    </main>
  );
}
