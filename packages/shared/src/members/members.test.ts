import { describe, expect, it } from 'vitest';
import { audiencesFor, INVITE_CODE, InviteInputSchema, inviteExpiry, memberFarmView } from './index';

describe('farm members', () => {
  it('lets the accountant and someone of the farm in, and no other role', () => {
    expect(InviteInputSchema.parse({ role: 'accountant', email: 'Ana@Firma.RO' })).toEqual({ role: 'accountant', email: 'ana@firma.ro' });
    expect(InviteInputSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(InviteInputSchema.safeParse({ role: 'viewer', extra: 1 }).success).toBe(false);
  });

  it('opens the reports each role is for', () => {
    expect(audiencesFor('accountant')).toEqual(['accountant', 'institution']);
    expect(audiencesFor('viewer')).toEqual(['farmer']);
  });

  it('never hands out the Stripe account, and hides the people’s names from someone of the farm', () => {
    const farm = { id: 'f', stripe_account_id: 'acct_1', employees: [{ name: 'Nelu', cost_bani: 1 }] };
    expect(memberFarmView(farm, 'accountant')).toEqual({ id: 'f', employees: [{ name: 'Nelu', cost_bani: 1 }] });
    expect(memberFarmView(farm, 'viewer')).toEqual({ id: 'f', employees: [{ name: '', cost_bani: 1 }] });
  });

  it('makes links good for a week, with 43-character codes', () => {
    expect(inviteExpiry(new Date('2026-11-14T10:00:00Z'))).toBe('2026-11-21T10:00:00.000Z');
    expect(INVITE_CODE.test('A'.repeat(43))).toBe(true);
    expect(INVITE_CODE.test('A'.repeat(42))).toBe(false);
  });
});
