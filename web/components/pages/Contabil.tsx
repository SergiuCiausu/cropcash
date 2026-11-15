'use client';
/* /contabil: the farms an accountant (or someone of the farm) was let in to, and their reports
   (migration 028; docs/rapoarte-pdf-plan.md §6). The farm comes from the API once, then stays on this
   phone like the farmer's own copy, so the PDFs still come out without internet, from the last copy.
   Read-only: nothing here writes to the farm. */
import { useEffect, useMemo, useState } from 'react';
import * as Live from '../../lib/live/index';
import { viewFor } from '../../lib/cc/plan';
import { date } from '../../lib/cc/format';
import {
  fetchMemberFarm,
  countyLabel,
  forgetMemberCopy,
  leaveFarm,
  memberFarmState,
  memberships,
  reportsFor,
  ROLE_ABOUT,
  ROLE_NAMES,
  saveMemberCopy,
  saveMemberships,
  savedMemberCopy,
  savedMemberships,
  type MemberCopy,
  type Membership,
} from '../../lib/members';
import { appHref } from '../../lib/paths';
import { ErrorLine, Icon } from '../app/bits';
import { ReportCards } from '../reports/ReportCards';
import '../../styles/reports.css';

function useNavigatorOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const set = () => setOnline(navigator.onLine);
    set();
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    return () => {
      window.removeEventListener('online', set);
      window.removeEventListener('offline', set);
    };
  }, []);
  return online;
}

export default function Contabil() {
  const online = useNavigatorOnline();
  const [farms, setFarms] = useState<Membership[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [copy, setCopy] = useState<MemberCopy | null>(null);
  const [ownFarm, setOwnFarm] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  /* Signed in, or off to sign in and back. */
  useEffect(() => {
    if (!Live.hasSession(localStorage)) {
      location.replace(`/login?next=${encodeURIComponent(Live.MEMBER_HOME)}`);
      return;
    }
    setOwnFarm(Live.hasFarmCopy(localStorage));
    const kept = savedMemberships(localStorage);
    if (kept) setFarms(kept);
    if (!navigator.onLine) return;
    memberships(Live.api)
      .then(({ farms: fresh }) => {
        saveMemberships(localStorage, fresh);
        setFarms(fresh);
      })
      .catch(() => kept || setError('Nu am putut aduce fermele. Încearcă din nou cu internet.'));
  }, []);

  const farmerId = picked ?? farms?.[0]?.farmerId ?? null;

  useEffect(() => {
    if (!farmerId) return;
    setSaved(false);
    const kept = savedMemberCopy(localStorage, farmerId);
    setCopy(kept);
    if (!navigator.onLine) return;
    fetchMemberFarm(Live.api, farmerId, new Date())
      .then((fresh) => {
        saveMemberCopy(localStorage, farmerId, fresh);
        setCopy(fresh);
        setError('');
      })
      .catch((e) => {
        if (e instanceof Live.ApiError && e.status === 404) {
          /* The farmer took the access back. */
          forgetMemberCopy(localStorage, farmerId);
          setCopy(null);
          setFarms((was) => was?.filter((f) => f.farmerId !== farmerId) ?? was);
          return setError('Fermierul nu îți mai dă acces la ferma asta.');
        }
        if (!kept) setError('Nu am putut aduce datele fermei. Încearcă din nou cu internet.');
      });
  }, [farmerId]);

  const state = useMemo(() => (copy ? memberFarmState(copy, new Date()) : null), [copy]);
  const view = useMemo(() => (state?.baseFarm ? viewFor(state, 'farm') : null), [state]);
  const farm = farms?.find((f) => f.farmerId === farmerId) ?? null;

  async function leave() {
    if (!farm || !navigator.onLine) return setError('Ai nevoie de internet ca să renunți la acces.');
    try {
      await leaveFarm(Live.api, farm.farmerId);
      forgetMemberCopy(localStorage, farm.farmerId);
      const rest = (farms ?? []).filter((f) => f.farmerId !== farm.farmerId);
      saveMemberships(localStorage, rest);
      setFarms(rest);
      setPicked(null);
      setCopy(null);
    } catch {
      setError('Nu s-a putut. Încearcă din nou.');
    }
  }

  return (
    <main className="member-page">
      <div className="member-wrap">
        <div className="member-top">
          <a className="auth-brand" href="/">
            <span className="mark">
              <Icon name="sprout" />
            </span>
            CropCash
          </a>
          <nav aria-label="Cont">
            {ownFarm && (
              <a className="ob-small" href={appHref('/acasa', 'farm')}>
                Ferma mea
              </a>
            )}
            <a className="ob-small" href="/login?signout">
              Ieși din cont
            </a>
          </nav>
        </div>
        <header className="page-h">
          <div>
            <h1>Rapoartele fermelor</h1>
            <p className="lead">Fermele care te-au invitat. Alegi ferma și perioada, apoi descarci PDF-ul. Doar vezi: nu poți schimba nimic în fermă.</p>
          </div>
        </header>
        {!online && <p className="offline">Fără internet. Rapoartele ies din datele aduse ultima dată{copy ? `, pe ${date(copy.at.slice(0, 10), true)}` : ''}.</p>}
        <ErrorLine>{error}</ErrorLine>
        {farms && farms.length === 0 && (
          <section className="card">
            <p>Nicio fermă nu te-a invitat încă. Când un fermier îți trimite linkul, îl deschizi și ferma apare aici.</p>
          </section>
        )}
        {farms && farms.length > 0 && (
          <div className="member-farm">
            {farms.length > 1 ? (
              <label className="ob-field">
                Ferma
                <select value={farmerId ?? ''} onChange={(e) => setPicked(e.target.value)}>
                  {farms.map((f) => (
                    <option key={f.farmerId} value={f.farmerId}>
                      {f.farmName}, {countyLabel(f.county)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <h2>
                {farm?.farmName}, județul {farm ? countyLabel(farm.county) : ''}
              </h2>
            )}
            {farm && <p className="note">{ROLE_NAMES[farm.role]}: {ROLE_ABOUT[farm.role]}</p>}
          </div>
        )}
        {saved && (
          <p className="ob-info" role="status">
            Raportul e gata. Îl găsești în Descărcări.
          </p>
        )}
        {farm && state && view && copy && (
          <ReportCards key={farm.farmerId} reports={reportsFor(copy.role)} plots={copy.plots} farm={state} view={view} onSaved={() => setSaved(true)} />
        )}
        {farm && !copy && !error && <p className="note">Se aduc datele fermei…</p>}
        {farm && (
          <p className="note">
            <button type="button" className="ob-small" onClick={() => void leave()}>
              Nu mai vreau acces la {farm.farmName}
            </button>
          </p>
        )}
      </div>
    </main>
  );
}
