'use client';
/* "Cine mai vede rapoartele" on /rapoarte (migration 028; docs/rapoarte-pdf-plan.md §6): the farmer
   invites the accountant or someone of the farm, by a link sent on WhatsApp or by email, sees who has
   access and takes it back. They only see; they never change anything or move money. Needs internet:
   the list loads when the card is opened, and nothing here is queued. */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MEMBER_ROLES, type MemberRole } from '../../../packages/shared/src/members/index';
import * as Live from '../../lib/live/index';
import { createInvite, inviteMessage, listMembers, removeMember, revokeInvite, ROLE_ABOUT, ROLE_NAMES, whatsappUrl, type InviteRow, type MemberRow } from '../../lib/members';
import { date } from '../../lib/cc/format';
import { useOnline } from '../../lib/cc/react';
import { ErrorLine, NetButton } from '../app/bits';

const NET = 'Invitațiile cer internet.';

const failed = (e: unknown) =>
  e instanceof Live.ApiError && e.code === 'too_many_invites'
    ? 'Ai deja 10 linkuri nefolosite. Anulează unul, apoi fă altul.'
    : e instanceof Live.ApiError && e.code === 'offline'
      ? NET
      : 'Nu s-a putut. Încearcă din nou.';

export function Sharing({ farmName }: { farmName: string }) {
  const online = useOnline();
  const [list, setList] = useState<{ members: MemberRow[]; invites: InviteRow[] } | null>(null);
  const [role, setRole] = useState<MemberRole>('accountant');
  const [email, setEmail] = useState('');
  const [made, setMade] = useState<{ link: string; role: MemberRole; emailed: boolean | null; email: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setList(await listMembers(Live.api));
    } catch (e) {
      setError(failed(e));
    }
  }, []);
  useEffect(() => {
    if (online) void load();
  }, [online, load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    const to = email.trim();
    if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return setError('Scrie adresa de e-mail întreagă, de exemplu contabil@firma.ro, sau las-o goală.');
    setBusy(true);
    setError('');
    try {
      const r = await createInvite(Live.api, role, to || undefined);
      setMade({ link: r.link, role, emailed: r.emailed, email: to });
      setEmail('');
      await load();
    } catch (err) {
      setError(failed(err));
    } finally {
      setBusy(false);
    }
  }

  async function act(run: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await run();
      await load();
    } catch (err) {
      setError(failed(err));
    } finally {
      setBusy(false);
    }
  }

  const message = made ? inviteMessage(farmName, made.role, made.link) : '';
  const share = async () => {
    try {
      await navigator.share({ text: message });
    } catch {
      // Closed the share sheet: nothing to do.
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(made!.link);
      setError('');
    } catch {
      setError('Nu s-a putut copia. Ține apăsat pe link și copiază-l.');
    }
  };

  return (
    <section className="card s12 share-card" aria-labelledby="r-share">
      <div className="card-h">
        <h2 id="r-share">Cine mai vede rapoartele</h2>
      </div>
      <p className="note">Contabilul sau cineva din fermă își pot face singuri rapoartele, din contul lor. Doar le văd: nu pot schimba nimic și nu ating banii.</p>

      {list && list.members.length > 0 && (
        <ul className="share-list" aria-label="Au acces">
          {list.members.map((m) => (
            <li key={m.id}>
              <span>
                <b>{m.email ?? 'Cont șters'}</b>
                <small>
                  {ROLE_NAMES[m.role]}, din {date(m.since.slice(0, 10), true)}
                </small>
              </span>
              <NetButton reason={NET} className="ob-small" disabled={busy} onClick={() => void act(() => removeMember(Live.api, m.id))}>
                Scoate
              </NetButton>
            </li>
          ))}
        </ul>
      )}
      {list && list.invites.length > 0 && (
        <ul className="share-list" aria-label="Invitații trimise">
          {list.invites.map((i) => (
            <li key={i.id}>
              <span>
                <b>{i.email ?? 'Link trimis de tine'}</b>
                <small>
                  {ROLE_NAMES[i.role]}, nefolosit, merge până pe {date(i.expiresAt.slice(0, 10), true)}
                </small>
              </span>
              <NetButton reason={NET} className="ob-small" disabled={busy} onClick={() => void act(() => revokeInvite(Live.api, i.id))}>
                Anulează
              </NetButton>
            </li>
          ))}
        </ul>
      )}

      {made ? (
        <div className="share-made" role="status">
          <p>
            {made.emailed === true
              ? `Am trimis invitația pe e-mail la ${made.email}. Poți trimite linkul și pe WhatsApp.`
              : made.emailed === false
                ? `E-mailul către ${made.email} nu a plecat. Trimite linkul pe WhatsApp sau altfel.`
                : 'Linkul e gata. Trimite-l persoanei, pe WhatsApp sau cum vrei. Merge o singură dată, 7 zile.'}
          </p>
          <input className="share-link" readOnly value={made.link} aria-label="Linkul invitației" onFocus={(e) => e.currentTarget.select()} />
          <div className="ob-actions">
            <a className="btn btn-dark" href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer">
              Trimite pe WhatsApp
            </a>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button type="button" className="btn" onClick={() => void share()}>
                Trimite altfel
              </button>
            )}
            <button type="button" className="btn" onClick={() => void copy()}>
              Copiază linkul
            </button>
            <button type="button" className="ob-small" onClick={() => setMade(null)}>
              Gata
            </button>
          </div>
        </div>
      ) : (
        <form className="share-form" noValidate onSubmit={(e) => void invite(e)}>
          <fieldset>
            <legend>Pe cine inviți</legend>
            {MEMBER_ROLES.map((r) => (
              <label key={r} className="share-role">
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
                <span>
                  <b>{ROLE_NAMES[r]}</b>
                  <small>{ROLE_ABOUT[r]}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="ob-field">
            E-mailul lui, dacă vrei să-i trimitem noi invitația
            <input type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <NetButton reason={NET} type="submit" className="btn btn-dark" disabled={busy}>
            {busy ? 'Se pregătește…' : 'Fă invitația'}
          </NetButton>
        </form>
      )}
      <ErrorLine>{error}</ErrorLine>
    </section>
  );
}
