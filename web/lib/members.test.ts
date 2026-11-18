/* What a member gets: the farm as the farmer's own pages read it, the reports their role allows, and the
   words that go with an invitation. */
import { describe, expect, it, vi } from 'vitest';
import { loadData } from '../../packages/shared/src/data/index';
import { periodOf } from '../../packages/shared/src/reports/index';
import { viewFor } from './cc/plan';
import { memoryStore } from './cc/storage';
import { createStore, type LiveCalls } from './cc/store';
import type { MeFarm } from './live/farm';
import { inviteCodeFrom, inviteMessage, memberFarmState, reportsFor, whatsappUrl } from './members';
import { makeReport } from './reports/inputs';

const NOW = new Date('2026-11-15T10:00:00Z');
const me = {
  id: 'farm-1',
  name: 'Ion',
  county: 'TR',
  birth_year: 1971,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  envelopes: [],
  expected_payments: [],
  transactions: [
    { id: 't1', kind: 'sale', amount_bani: 2_500_000, occurred_at: '2026-11-10T12:00:00Z', crop_id: 'porumb', note: null, category: null, doc_no: 'F 12', counterparty: 'Agro SRL' },
    { id: 't2', kind: 'expense', amount_bani: -123_400, occurred_at: '2026-11-03T12:00:00Z', crop_id: 'grau', note: null, category: 'seeds' },
  ],
} as unknown as MeFarm;

/** The farmer's own phone, with the same copy of /api/me. */
async function farmersOwn() {
  const live: LiveCalls = { api: vi.fn(async () => ({ farmer: me }) as never), read: vi.fn(async () => ({ data: [] }) as never), write: vi.fn(async () => ({}) as never) };
  const store = createStore({
    mode: 'farm',
    store: memoryStore({ 'cropcash-me': JSON.stringify(me), 'cropcash-me-at': NOW.toISOString(), 'sb-x-auth-token': '{}' }),
    data: loadData(),
    live,
    now: () => NOW,
    net: { apiUrl: 'http://api.test', browserOnline: () => false, fetchFn: (async () => ({ ok: true })) as unknown as typeof fetch, setTimer: () => 0, clearTimer: () => undefined },
  });
  await store.start();
  return store.getState().farm!;
}

describe('the member’s copy of the farm', () => {
  it('makes the same ledger the farmer makes on their own phone', async () => {
    const own = await farmersOwn();
    const member = memberFarmState({ role: 'accountant', farmer: me, plots: { plots: [], seasons: [], operations: [] }, at: NOW.toISOString() }, NOW);
    const q = periodOf('quarter', '2026-Q4');
    const theirs = makeReport('ledger', q, member, viewFor(member, 'farm'), NOW.getTime());
    const ours = makeReport('ledger', q, own, viewFor(own, 'farm'), NOW.getTime());
    expect(theirs.sections).toEqual(ours.sections);
    expect(JSON.stringify(theirs.sections)).toContain('F 12 · Agro SRL');
    expect(theirs.watermark).toBeNull();
  });
});

describe('what each role may open', () => {
  it('gives the accountant the accountant’s and institutions’ reports, and someone of the farm the farmer’s', () => {
    expect(reportsFor('accountant').map((r) => r.id)).toEqual(['ledger', 'subsidies', 'crop-margins', 'fuel-excise', 'phyto-register', 'land-summary']);
    expect(reportsFor('viewer').map((r) => r.id)).toEqual(['farm-summary', 'subsidies', 'crop-margins', 'fuel-excise', 'phyto-register', 'land-summary']);
  });
});

describe('the invitation', () => {
  it('reads the code from the link, and nothing else', () => {
    const code = 'Ab_-'.repeat(10) + 'xyz';
    expect(inviteCodeFrom(`?cod=${code}`)).toBe(code);
    expect(inviteCodeFrom('?cod=scurt')).toBeNull();
    expect(inviteCodeFrom('')).toBeNull();
  });

  it('says what the link is for, in a WhatsApp message', () => {
    const text = inviteMessage('Ion', 'accountant', 'https://cropcash.ro/invitatie?cod=x');
    expect(text).toContain('rapoartele pentru contabilitate fermei Ion');
    expect(text).toContain('7 zile');
    expect(whatsappUrl(text)).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
  });
});

describe('the county', () => {
  it('is written out, as farms keep only its code', async () => {
    const { countyLabel } = await import('./members');
    expect(countyLabel('TR')).toBe('Teleorman');
    expect(countyLabel('Teleorman')).toBe('Teleorman');
  });
});
