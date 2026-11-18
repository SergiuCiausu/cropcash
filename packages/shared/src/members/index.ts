/* People the farmer lets see the farm's reports (migration 028; docs/rapoarte-pdf-plan.md §6, faza 3).
   Read-only: an accountant, or someone of the farm (a partner, family, the bank). */
import { z } from 'zod';

export const MEMBER_ROLES = ['accountant', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** How long a link works. The farmer can make another one any time. */
export const INVITE_DAYS = 7;
/** Open links per farm, so a forgotten form can't fill anyone's inbox. */
export const MAX_OPEN_INVITES = 10;

export const InviteInputSchema = z.strictObject({
  role: z.enum(MEMBER_ROLES),
  /** Absent: the farmer sends the link themself (WhatsApp, SMS). */
  email: z.email().max(254).transform((e) => e.toLowerCase()).optional(),
});
export type InviteInput = z.infer<typeof InviteInputSchema>;

/** 32 random bytes as base64url: 43 characters. */
export const INVITE_CODE = /^[A-Za-z0-9_-]{43}$/;
export const AcceptInviteSchema = z.strictObject({ code: z.string().regex(INVITE_CODE) });

/** The reports' readers (web/lib/reports) each role may open. */
export function audiencesFor(role: MemberRole): readonly ('farmer' | 'accountant' | 'institution')[] {
  return role === 'accountant' ? ['accountant', 'institution'] : ['farmer'];
}

/** Why a link didn't work, as the database says it (accept_farm_invite's hints). */
export const INVITE_REFUSALS = ['not_found', 'used', 'expired', 'own_farm'] as const;
export type InviteRefusal = (typeof INVITE_REFUSALS)[number];

/** When a link made at `now` stops working. */
export const inviteExpiry = (now: Date) => new Date(now.getTime() + INVITE_DAYS * 864e5).toISOString();

/**
 * What a member's copy of the farm may hold. The farm's money plumbing (Stripe ids) never leaves the
 * server; someone of the farm also doesn't see the names of the people the farm pays.
 */
export function memberFarmView<T extends Record<string, unknown>>(farm: T, role: MemberRole): Omit<T, 'stripe_account_id'> {
  const { stripe_account_id: _stripe, ...rest } = farm;
  if (role === 'accountant' || !Array.isArray(rest.employees)) return rest;
  return { ...rest, employees: (rest.employees as Record<string, unknown>[]).map((e) => ({ ...e, name: '' })) };
}
