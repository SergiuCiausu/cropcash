/* The farm's contracts other than arendă (migration 048, docs/contracts-plan.md §2): the other side, the contract and
   its money schedule, and the decision about a contract's end (arendă's too). Every call acts as the farmer, so RLS
   decides what they may see and change. Reading them comes with the farm (FARM_SELECT in repo.ts). */
import type { PostgrestError } from '@supabase/supabase-js';
import { decisionsFor, type ContractDecision, type StoredContractPayment, type StoredFarmContract, type StoredParty, type TaxProfile } from '@cropcash/shared';
import type { SupabaseFactory } from './supabase';

export class ContractError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type PartyRow = Omit<StoredParty, 'id' | 'archived_at'>;
export type FarmContractRow = Omit<StoredFarmContract, 'id' | 'archived_at' | 'decision' | 'decided_on'>;
export type PaymentRow = Omit<StoredContractPayment, 'id' | 'contract_id'>;

export interface ContractStore {
  /** Sent again with the same client id, they return the first id. */
  addParty(token: string, farmerId: string, row: PartyRow, clientId?: string): Promise<string>;
  /** False when the party isn't this farm's. */
  updateParty(token: string, id: string, row: PartyRow): Promise<boolean>;
  /** Archives the party and its contracts. False when not this farm's. */
  archiveParty(token: string, id: string, at: Date): Promise<boolean>;
  /** ContractError 404 `unknown_party` / `unknown_parcel` / `unknown_employee` when they aren't this farm's. */
  addContract(token: string, farmerId: string, row: FarmContractRow, payments: PaymentRow[], clientId?: string): Promise<string>;
  /** Replaces the row and its whole schedule. False when not this farm's. */
  updateContract(token: string, id: string, row: FarmContractRow, payments: PaymentRow[]): Promise<boolean>;
  archiveContract(token: string, id: string, at: Date): Promise<boolean>;
  /** „Am hotărât” (§3.2); null takes it back. ContractError 400 `decision_not_for_kind`. False when not this farm's. */
  decide(token: string, source: 'contract' | 'arenda', id: string, decision: ContractDecision | null, decidedOn: string): Promise<boolean>;
  /** „Ce fel de fermă ești?” (migration 049): the farm's legal form, VAT status and micro tax. */
  setTaxProfile(token: string, farmerId: string, profile: TaxProfile): Promise<void>;
}

export const PARTY_COLUMNS = 'id, name, kind, cui, locality, phone, note, archived_at';
export const FARM_CONTRACT_COLUMNS =
  'id, party_id, kind, title, number, signed_on, starts_on, ends_on, auto_renews, notice_days, renew_months, plot_ids, area_ari, crop_id, ' +
  'quantity_kg, employee_id, credit_group_id, vat_bp, residual_bani, decision, decided_on, archived_at';
export const PAYMENT_COLUMNS = 'id, contract_id, position, direction, label, first_on, repeat, times, amount_bani, per_ha, kg, crop_id';

/** bigint comes back as a number or a string, depending on its size. */
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
export const farmContractFromRow = (r: Record<string, unknown>): StoredFarmContract =>
  ({ ...r, quantity_kg: num(r.quantity_kg), residual_bani: num(r.residual_bani) }) as unknown as StoredFarmContract;
/** In the order the farmer typed them. */
export const paymentsFromRows = (rows: Record<string, unknown>[]): StoredContractPayment[] =>
  [...rows]
    .sort((a, b) => String(a.contract_id).localeCompare(String(b.contract_id)) || Number(a.position) - Number(b.position))
    .map(({ position: _p, ...r }) => ({ ...r, amount_bani: num(r.amount_bani), kg: num(r.kg) }) as unknown as StoredContractPayment);

function refusal(e: PostgrestError): Error {
  // 23514: a check in migration 048 (the same rules as the schemas).
  if (e.code === '22023' || e.code === '23514' || e.code === '22P02' || e.code === '22007') return new ContractError(400, 'invalid_input', e.message);
  // 23503: a party, person or paper of another farm (the foreign keys are on (id, farmer_id)).
  if (e.code === '23503') {
    if (e.message.includes('contracts_employee')) return new ContractError(404, 'unknown_employee', e.message);
    if (e.message.includes('contracts_document')) return new ContractError(404, 'unknown_document', e.message);
    return new ContractError(404, 'unknown_party', e.message);
  }
  if (e.code === '23505') return new ContractError(409, 'already_saved', e.message);
  if (e.code === 'P0002') return new ContractError(404, 'not_found', e.message);
  return new Error(e.message);
}

export function supabaseContracts(db: SupabaseFactory): ContractStore {
  /** A contract names only this farm's parcels. RLS hides other farms' rows, so they count as missing. */
  async function checkPlots(token: string, ids: string[]) {
    if (ids.length === 0) return;
    const { data, error } = await db.forUser(token).from('plots').select('id').in('id', ids);
    if (error) throw refusal(error);
    if ((data ?? []).length !== ids.length) throw new ContractError(404, 'unknown_parcel', 'a parcel is not this farm');
  }

  async function insertOnce(token: string, table: string, row: Record<string, unknown>, farmerId: string, clientId?: string): Promise<string> {
    const client = db.forUser(token);
    const { data, error } = await client.from(table).insert({ ...row, farmer_id: farmerId, client_id: clientId ?? null }).select('id').single();
    // Sent before (the answer was lost): the row already saved.
    if (error?.code === '23505' && clientId) {
      const again = await client.from(table).select('id').eq('farmer_id', farmerId).eq('client_id', clientId).maybeSingle();
      if (again.error) throw refusal(again.error);
      if (again.data) return again.data.id as string;
    }
    if (error) throw refusal(error);
    return data.id as string;
  }

  async function update(token: string, table: string, id: string, patch: Record<string, unknown>) {
    const { data, error } = await db.forUser(token).from(table).update(patch).eq('id', id).select('id');
    if (error) throw refusal(error);
    return !!data?.length;
  }

  async function replacePayments(token: string, contractId: string, payments: PaymentRow[]) {
    const { error } = await db.forUser(token).rpc('replace_contract_payments', { p_contract: contractId, p_rows: payments });
    if (error) throw refusal(error);
  }

  /** Archived again, a row keeps its first archive time. */
  async function archive(token: string, table: string, id: string, at: Date, before?: () => Promise<void>) {
    const { data: row, error } = await db.forUser(token).from(table).select('archived_at').eq('id', id).maybeSingle();
    if (error) throw refusal(error);
    if (!row) return false;
    if (row.archived_at) return true;
    await before?.();
    return update(token, table, id, { archived_at: at.toISOString() });
  }

  return {
    addParty: (token, farmerId, row, clientId) => insertOnce(token, 'parties', row, farmerId, clientId),
    updateParty: (token, id, row) => update(token, 'parties', id, row),
    archiveParty: (token, id, at) =>
      archive(token, 'parties', id, at, async () => {
        const { error } = await db.forUser(token).from('contracts').update({ archived_at: at.toISOString() }).eq('party_id', id).is('archived_at', null);
        if (error) throw refusal(error);
      }),

    async addContract(token, farmerId, row, payments, clientId) {
      await checkPlots(token, row.plot_ids);
      const id = await insertOnce(token, 'contracts', row, farmerId, clientId);
      // Also when sent again: the first send may have saved the row and lost the schedule.
      await replacePayments(token, id, payments);
      return id;
    },

    async updateContract(token, id, row, payments) {
      await checkPlots(token, row.plot_ids);
      if (!(await update(token, 'contracts', id, row))) return false;
      await replacePayments(token, id, payments);
      return true;
    },

    archiveContract: (token, id, at) => archive(token, 'contracts', id, at),

    async decide(token, source, id, decision, decidedOn) {
      const table = source === 'arenda' ? 'lease_contracts' : 'contracts';
      const { data: row, error } = await db
        .forUser(token)
        .from(table)
        .select(source === 'arenda' ? 'id' : 'id, kind')
        .eq('id', id)
        .maybeSingle();
      if (error) throw refusal(error);
      if (!row) return false;
      const kind = source === 'arenda' ? 'arenda' : (row as unknown as { kind: StoredFarmContract['kind'] }).kind;
      if (decision && !decisionsFor(kind).includes(decision)) throw new ContractError(400, 'decision_not_for_kind', `${kind} can't be decided ${decision}`);
      return update(token, table, id, decision ? { decision, decided_on: decidedOn } : { decision: null, decided_on: null });
    },

    async setTaxProfile(token, farmerId, p) {
      const { error } = await db
        .forUser(token)
        .from('farmers')
        .update({ legal_form: p.legalForm, vat_status: p.vatStatus, micro_tax: p.legalForm === 'srl' ? p.micro : null })
        .eq('id', farmerId);
      if (error) throw refusal(error);
    },
  };
}
