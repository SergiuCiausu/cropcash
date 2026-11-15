/* Who else sees the farm's reports (migration 028; docs/rapoarte-pdf-plan.md §6, faza 3): the farmer's
   side (invite, list, remove) and the member's side (accept, the farms, a farm's copy). Calls take the
   API as an argument, so the tests give them their own. All of it needs internet, except reading the
   copy of a farm already opened once, which stays on the phone like the farmer's own. */
import { audiencesFor, INVITE_CODE, type MemberRole } from '../../packages/shared/src/members/index';
import type { FarmPlots } from '../../packages/shared/src/plots/wire';
import { loadData } from '../../packages/shared/src/data/index';
import { readFarmState, type FarmState } from './cc/farm';
import { KEYS, memoryStore } from './cc/storage';
import type { MeFarm } from './live/farm';
import { REPORTS } from './reports/build';

type Api = <T>(path: string, init?: { method?: string; body?: string; timeout?: 'read' | 'write' }) => Promise<T>;

export const ROLE_NAMES: Record<MemberRole, string> = { accountant: 'Contabil', viewer: 'Cineva din fermă' };
export const ROLE_ABOUT: Record<MemberRole, string> = {
  accountant: 'Vede registrul, motorina, subvențiile, culturile și registrele pentru instituții.',
  viewer: 'Vede rapoartele tale: rezumatul fermei, subvențiile, culturile, terenul și tratamentele.',
};

/** The reports a member may make on the farm. */
export const reportsFor = (role: MemberRole) => REPORTS.filter((r) => r.audiences.some((a) => audiencesFor(role).includes(a)));

/* ---- The farmer ---- */

export interface MemberRow {
  id: string;
  role: MemberRole;
  email: string | null;
  since: string;
}
export interface InviteRow {
  id: string;
  role: MemberRole;
  email: string | null;
  expiresAt: string;
  createdAt: string;
}

export const listMembers = (api: Api) => api<{ members: MemberRow[]; invites: InviteRow[] }>('/api/farm/members');
export const createInvite = (api: Api, role: MemberRole, email?: string) =>
  api<{ id: string; link: string; emailed: boolean | null }>('/api/farm/invites', { method: 'POST', body: JSON.stringify(email ? { role, email } : { role }), timeout: 'write' });
export const revokeInvite = (api: Api, id: string) => api<void>(`/api/farm/invites/${id}`, { method: 'DELETE', timeout: 'write' });
export const removeMember = (api: Api, id: string) => api<void>(`/api/farm/members/${id}`, { method: 'DELETE', timeout: 'write' });

/** The words that go with the link, for WhatsApp or anything else the phone shares to. */
export function inviteMessage(farmName: string, role: MemberRole, link: string): string {
  const what = role === 'accountant' ? 'rapoartele pentru contabilitate' : 'rapoartele';
  return `Bună ziua! Vă invit să vedeți ${what} fermei ${farmName} în CropCash. Linkul merge o singură dată, timp de 7 zile: ${link}`;
}
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/* ---- The member ---- */

export interface Membership {
  farmerId: string;
  farmName: string;
  county: string;
  role: MemberRole;
  since: string;
}

/** "TR" → "Teleorman": farms keep the county's code. */
export function countyLabel(county: string): string {
  return loadData().counties.counties.find((c) => c.code === county || c.name_ro === county)?.name_ro ?? county;
}

/** The code from /invitatie?cod=…, when it looks like one. */
export function inviteCodeFrom(search: string): string | null {
  const code = new URLSearchParams(search).get('cod');
  return code && INVITE_CODE.test(code) ? code : null;
}

export const INVITE_ERRORS: Record<string, string> = {
  not_found: 'Linkul nu e bun. Cere fermierului unul nou.',
  used: 'Linkul a fost deja folosit de altcineva sau a fost anulat. Cere fermierului unul nou.',
  expired: 'Linkul a expirat (merge 7 zile). Cere fermierului unul nou.',
  own_farm: 'Ăsta e linkul pentru ferma ta. Trimite-l persoanei pe care vrei s-o inviți.',
  offline: 'Ai nevoie de internet ca să accepți invitația.',
};

export const acceptInvite = (api: Api, code: string) => api<{ farmerId: string; farmName: string; role: MemberRole }>('/api/invites/accept', { method: 'POST', body: JSON.stringify({ code }), timeout: 'write' });
export const memberships = (api: Api) => api<{ farms: Membership[] }>('/api/memberships');
export const leaveFarm = (api: Api, farmerId: string) => api<void>(`/api/memberships/${farmerId}`, { method: 'DELETE', timeout: 'write' });

export interface MemberCopy {
  role: MemberRole;
  farmer: MeFarm;
  plots: FarmPlots;
  /** When it came from the server (ISO). */
  at: string;
}
export const fetchMemberFarm = async (api: Api, farmerId: string, now: Date): Promise<MemberCopy> => ({
  ...(await api<Omit<MemberCopy, 'at'>>(`/api/memberships/${farmerId}`)),
  at: now.toISOString(),
});

/* What a member saved on this phone. The keys start with "cropcash-", so signing out clears them. */
export const MEMBER_FARMS_KEY = 'cropcash-member-farms';
export const memberCopyKey = (farmerId: string) => `cropcash-member-farm-${farmerId}`;

type Kv = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const read = <T,>(kv: Kv, key: string): T | null => {
  try {
    const raw = kv.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (kv: Kv, key: string, value: unknown) => {
  try {
    kv.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the page still has what it just loaded.
  }
};
export const savedMemberships = (kv: Kv) => read<Membership[]>(kv, MEMBER_FARMS_KEY);
export const saveMemberships = (kv: Kv, farms: Membership[]) => write(kv, MEMBER_FARMS_KEY, farms);
export const savedMemberCopy = (kv: Kv, farmerId: string) => read<MemberCopy>(kv, memberCopyKey(farmerId));
export const saveMemberCopy = (kv: Kv, farmerId: string, copy: MemberCopy) => write(kv, memberCopyKey(farmerId), copy);
export const forgetMemberCopy = (kv: Kv, farmerId: string) => {
  try {
    kv.removeItem(memberCopyKey(farmerId));
  } catch {
    // Nothing to do.
  }
};

/**
 * The farm as the farmer's own pages would read it, from the member's copy: same plan, same records,
 * so the accountant's PDF says what the farmer's says. Kept apart from this phone's own farm.
 */
export function memberFarmState(copy: MemberCopy, now: Date): FarmState {
  const store = memoryStore({ [KEYS.me]: JSON.stringify(copy.farmer), [KEYS.meAt]: copy.at });
  return readFarmState('farm', store, loadData(), now);
}
