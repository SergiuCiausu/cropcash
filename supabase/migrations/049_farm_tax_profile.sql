-- 049: what the farm is for taxes (docs/contracts-plan.md step 6). Three answers on the Contracte „Taxe” tab, so the
-- contracts' VAT and the micro tax get an amount (packages/shared/src/contracts/taxes.ts, TaxProfile).
--
-- farmers.legal_form  pf | pfa | ii | if | srl (as farm_fiscal_profiles, 041). Null: not asked yet.
-- farmers.vat_status  payer | not_registered | special_agri. Null: not asked yet.
-- farmers.micro_tax   an SRL paying the micro tax; null when not asked or not an SRL.
--
-- Not farm_fiscal_profiles: that one needs the firm's name, CIF and address for invoices. These three are enough
-- for the plan and can be answered by a PF with nothing else.

alter table public.farmers add column if not exists legal_form text;
alter table public.farmers add column if not exists vat_status text;
alter table public.farmers add column if not exists micro_tax boolean;

do $$ begin
  alter table public.farmers add constraint farmers_legal_form_check check (legal_form is null or legal_form in ('pf', 'pfa', 'ii', 'if', 'srl'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.farmers add constraint farmers_vat_status_check check (vat_status is null or vat_status in ('payer', 'not_registered', 'special_agri'));
exception when duplicate_object then null; end $$;
do $$ begin
  -- Only an SRL can pay the micro tax.
  alter table public.farmers add constraint farmers_micro_tax_check check (micro_tax is null or legal_form = 'srl');
exception when duplicate_object then null; end $$;

grant update (legal_form, vat_status, micro_tax) on table public.farmers to authenticated;
