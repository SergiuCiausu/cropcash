'use client';
/* A screen drawn by React: the farm store (lib/cc/react.tsx) and the frame around the page's content.
   components/Screen.tsx picks this when a screen in web/screens has `App` instead of legacy scripts. */
import { useEffect, type ReactNode } from 'react';
import { FarmProvider, useFarmState } from '../../lib/cc/react';
import type { MonitorSnapshot } from '../../lib/cc/monitor';
import snapshot from '../../lib/cc/monitor-snapshot.json';
import type { Mode } from '../../lib/paths';
import { markReady } from '../../lib/ui/ready';
import BootSkeleton from '../skeleton/BootSkeleton';
import Frame from './Frame';

/** The skeleton stays until the farm is here. With no farm on the phone the guard takes over: it
    redirects, fetches the farm (this then fires), or shows a card and marks the page ready itself. */
function Loading({ skeleton }: { skeleton: ReactNode }) {
  const { ready, farm } = useFarmState();
  const here = ready && !!farm?.baseFarm;
  useEffect(() => {
    if (here) markReady();
  }, [here]);
  return <BootSkeleton>{skeleton}</BootSkeleton>;
}

export default function ReactScreen({ page, mode, skeleton, children }: { page: string; mode: Mode; skeleton: ReactNode; children: ReactNode }) {
  return (
    <FarmProvider mode={mode} snapshot={snapshot as unknown as MonitorSnapshot}>
      <Loading skeleton={skeleton} />
      <Frame page={page} mode={mode}>
        {children}
      </Frame>
    </FarmProvider>
  );
}
