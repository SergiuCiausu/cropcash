/* Renders a React page in the frame with a fake server, for the page tests. */
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';
import { loadData } from '../../../packages/shared/src/data/index';
import { FarmProvider } from '../../lib/cc/react';
import { memoryStore } from '../../lib/cc/storage';
import { createStore, type LiveCalls } from '../../lib/cc/store';
import type { Mode } from '../../lib/paths';
import { SCREENS, type ScreenName } from '../../screens';
import Frame from '../app/Frame';
import { PapersProvider } from '../app/Papers';
import { OnboardingFlow } from './Onboarding';

const data = loadData();
const NOW = new Date('2026-11-15T10:00:00Z');
export const ME = {
  name: 'Maria',
  county: 'TR',
  birth_year: 1970,
  start_balance_bani: 2_000_000,
  parcels: [
    { crop_id: 'grau', area_ari: 500, planted_month: '2026-10' },
    { crop_id: 'porumb', area_ari: 300 },
  ],
  transactions: [],
  task_completions: [],
  pension_plans: [],
  opportunity_follows: [],
};
export const SIGNED_IN = { 'sb-x-auth-token': '{}', 'cropcash-me': JSON.stringify(ME), 'cropcash-me-at': '2026-11-14T10:00:00Z' };

function fakeStore(mode: Mode, saved: Record<string, string>, online: boolean, me: object = ME) {
  const live: LiveCalls = {
    api: vi.fn(async (path: string) => (path === '/api/me' ? { farmer: me } : {}) as never),
    read: vi.fn(async () => ({ data: [] }) as never),
    write: vi.fn(async () => ({}) as never),
  };
  const store = createStore({
    mode,
    store: memoryStore(saved),
    data,
    live,
    now: () => NOW,
    net: { apiUrl: 'http://api.test', browserOnline: () => online, fetchFn: (async () => ({ ok: online })) as unknown as typeof fetch, setTimer: () => 0, clearTimer: () => undefined },
  });
  return { store, live };
}

/** Onboarding on a signed-in phone, without the page's own provider. */
export async function showOnboarding(saved: Record<string, string> = SIGNED_IN, online = true, me: object = ME) {
  const { store, live } = fakeStore('farm', saved, online, me);
  await act(async () => {
    render(
      <FarmProvider mode="farm" store={store}>
        <PapersProvider>
          <OnboardingFlow />
        </PapersProvider>
      </FarmProvider>,
    );
  });
  await act(async () => undefined);
  return { store, live };
}

export async function showPage(name: ScreenName, mode: Mode, saved: Record<string, string> = {}, online = true, me: object = ME) {
  const { store, live } = fakeStore(mode, saved, online, me);
  const App = SCREENS[name].App!;
  await act(async () => {
    render(
      <FarmProvider mode={mode} store={store}>
        <Frame page={`/${name}`} mode={mode}>
          <App />
        </Frame>
      </FarmProvider>,
    );
  });
  await act(async () => undefined);
  return { store, live };
}

