'use client';
/* The landing page: its HTML as JSX, then its scripts once it's on screen (lib/boot.ts).
   Links between pages are plain <a>, so each page loads fresh, as the scripts expect.
   Loading (docs/13 §B1): a page with a skeleton shows it until boot() marks <html data-ready>;
   if boot() fails, a card says so and offers to try again, instead of a page that never fills. */
import { useEffect, useState, type ReactNode } from 'react';
import { boot } from '../lib/boot';
import { bootWorked, reloadOnce, tabStore } from '../lib/boot-retry';
import type { Mode } from '../lib/paths';
import { markReady } from '../lib/ui/ready';
import { ModeContext } from './AppLink';
import PageFailed from './PageFailed';
import BootSkeleton from './skeleton/BootSkeleton';
import '../styles/skeleton.css';

/** globals: data the page computed at build time (the landing page's farm), set on window before the scripts run.
    mode: which farm the page shows, so its AppLinks stay there. boot() reads it again from the address.
    skeleton: what to show while the scripts start (components/skeleton). Pages without one show their HTML at once. */
export default function LegacyPage({ scripts, variant, globals, mode = 'farm', skeleton, children }: { scripts: string[]; variant?: string; globals?: Record<string, unknown>; mode?: Mode; skeleton?: ReactNode; children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    boot(scripts, { variant, globals }).then(
      () => bootWorked(tabStore()),
      (e) => {
        console.error('page failed to start', e);
        if (reloadOnce(e, tabStore(), () => location.reload())) return;
        markReady();
        setFailed(true);
      },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ModeContext.Provider value={mode}>
      {skeleton ? <BootSkeleton>{skeleton}</BootSkeleton> : null}
      {children}
      {failed ? <PageFailed /> : null}
    </ModeContext.Provider>
  );
}
