-- Money moved through Stripe (test mode), the demo clock and the fixed salary.
-- Replaces the team's 010_stripe_money, 011_expense_kind and 012_fixed_salary_credit, which
-- clashed with 010_records_tasks, and the older local 012_stripe_money. Safe to run again,
-- on a fresh database or on one that already has any of those.

-- The demo clock: the farmer's Stripe Test Clock time, used as "today" by the app.
alter table farmers add column if not exists demo_now timestamptz;

-- Fixed when the farmer accepts the plan ("Bine așa", or a declared credit). Each month we pay
-- min(fixed, safe salary). NULL = not fixed yet (pay the safe salary).
alter table farmers add column if not exists salary_bani bigint check (salary_bani >= 0);

-- Links a received credit or a repayment to its declared row.
alter table transactions add column if not exists expected_payment_id uuid references expected_payments(id);

-- Both the farmer's own records and what the server writes.
alter table transactions
  drop constraint if exists transactions_kind_check,
  drop constraint if exists transactions_sign;
alter table transactions
  add constraint transactions_kind_check check (kind in (
    'sale', 'expense', 'apia_advance', 'apia_balance', 'crop_sale', 'salary', 'pension', 'credit', 'loan_repayment'
  )),
  add constraint transactions_sign check (
    kind is null
    or kind not in ('sale', 'expense')
    or (kind = 'sale' and amount_bani > 0)
    or (kind = 'expense' and amount_bani < 0)
  );

-- ── Only the server writes money facts and Stripe ids ─────────────────────
revoke insert, update on table public.farmers from authenticated;
grant insert (user_id, name, birth_year, county, dairy_cows, beef_cattle, start_balance_bani, pension_fund_id)
  on table public.farmers to authenticated;
-- salary_bani: paying more than the safe salary is impossible, the payout takes the minimum.
grant update (name, birth_year, county, dairy_cows, beef_cattle, start_balance_bani, pension_fund_id, salary_bani)
  on table public.farmers to authenticated;

revoke insert, update, delete on table public.payouts from authenticated;
revoke insert, update, delete on table public.pension_plans from authenticated;
revoke all on table public.transactions, public.payouts, public.pension_plans from anon;

-- Farmers keep recording their own sales and expenses, and nothing else.
revoke update on table public.transactions from authenticated;
grant insert, delete on table public.transactions to authenticated;
drop policy if exists transactions_insert_manual on transactions;
create policy transactions_insert_manual on transactions as restrictive for insert to authenticated
  with check (source = 'manual' and stripe_object_id is null);
drop policy if exists transactions_delete_manual on transactions;
create policy transactions_delete_manual on transactions as restrictive for delete to authenticated
  using (source = 'manual');

-- ── Money in the envelopes ────────────────────────────────────────
-- Everything recorded counts. Replaces the one from 010.
create or replace function public.farmer_money(p_farmer uuid) returns bigint
  language sql stable security invoker set search_path = public
as $$
  select f.start_balance_bani + coalesce(
    (select sum(t.amount_bani) from transactions t
      where t.farmer_id = f.id and (t.kind is not null or t.source in ('stripe_transfer', 'payout'))), 0)
  from farmers f where f.id = p_farmer
$$;

-- Replaces the one from 010: farmers can't update transactions, so FOR UPDATE would fail there.
-- Deleting first is atomic, and the policy above keeps it to manual rows.
create or replace function public.undo_transaction(p_id uuid) returns boolean
  language plpgsql security invoker set search_path = public
as $$
declare
  v_tx transactions%rowtype;
begin
  delete from transactions where id = p_id and kind in ('sale', 'expense') returning * into v_tx;
  if not found then
    return false;
  end if;
  if v_tx.envelope_id is not null then
    update envelopes set balance_bani = balance_bani + v_tx.envelope_taken_bani where id = v_tx.envelope_id;
  end if;
  return true;
end $$;
