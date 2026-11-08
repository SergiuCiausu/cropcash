'use client';
/* A farm page with no farm on the phone: the React side of boot.ts allowed(). guardTarget
   (lib/live/auth.ts) decides; signed out goes to /login, signed in brings the farm from /api/me (or
   sends a farmer with none to onboarding), and offline asks for internet once. */
import { useEffect, useState } from 'react';
import { useFarmState, useStore } from '../../lib/cc/react';
import * as Live from '../../lib/live/index';
import { AUTH_TEXT as text } from '../../lib/live/auth';
import { pageOf } from '../../lib/paths';
import { markReady } from '../../lib/ui/ready';

export function Guard() {
  const { farm, online } = useFarmState();
  const store = useStore();
  const [failed, setFailed] = useState(false);
  const guard = Live.guardTarget({ pathname: location.pathname, hash: location.hash, hasSession: !!farm?.signedIn, hasFarmCopy: !!farm?.baseFarm, online });

  useEffect(() => {
    if (guard.action === 'redirect') location.replace(guard.to);
    if (guard.action !== 'load-farm' || failed) return;
    void Live.landingPage(guard.next).then((to) => {
      if (pageOf(new URL(to, location.href).pathname) !== pageOf(location.pathname)) location.replace(to);
      else {
        store?.reload();
        /* Still no farm after /api/me: say so instead of a blank page. */
        if (!store?.getState().farm?.baseFarm) setFailed(true);
      }
    });
  }, [guard.action, guard.action === 'redirect' ? guard.to : '', failed, store]);

  /* Waits for the internet to come back, as the legacy pages do. */
  useEffect(() => {
    if (guard.action !== 'need-net') return;
    const back = () => store?.reload();
    addEventListener('online', back, { once: true });
    return () => removeEventListener('online', back);
  }, [guard.action, store]);

  const blocked = guard.action === 'need-net' ? [text.farmNeedsNet, text.farmNeedsNetWhy] : failed ? [text.farmFailed, text.farmFailedWhy] : null;
  /* The card is what's on screen now, so the skeleton has to leave it. */
  useEffect(() => {
    if (blocked) markReady();
  }, [!!blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!blocked) return null;
  return (
    <main className="ob">
      <div className="ob-card">
        <h1 tabIndex={-1}>{blocked[0]}</h1>
        <p className="lead">{blocked[1]}</p>
        <div className="ob-actions">
          <button type="button" className="btn btn-dark" onClick={() => location.reload()}>
            {text.retry}
          </button>
        </div>
      </div>
    </main>
  );
}
