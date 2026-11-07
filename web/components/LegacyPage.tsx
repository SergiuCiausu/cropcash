'use client';
/* A ported farm-app page: its HTML as JSX, then its scripts once it's on screen (lib/boot.ts).
   Links between pages are plain <a>, so each page loads fresh, as the scripts expect. */
import { useEffect, type ReactNode } from 'react';
import { boot } from '../lib/boot';

/** globals: data the page computed at build time (the landing page's farm), set on window before the scripts run. */
export default function LegacyPage({ scripts, palette, variant, globals, children }: { scripts: string[]; palette?: string; variant?: string; globals?: Record<string, unknown>; children: ReactNode }) {
  useEffect(() => {
    boot(scripts, { palette, variant, globals }).catch((e) => console.error('page failed to start', e));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{children}</>;
}
