-- 041: invoices, Oblio and RO e-Factura (docs/facturi-plan.md §2, step 3). Safe to run again.
-- (Numbered 041: 040 is 040_people_on_the_farm.sql.)
--
--   farm_fiscal_profiles     „Datele firmei”: who the farm is on its invoices. One per farm.
--   invoice_series           the farm's series and the next number. Simulated ones start with "SIM-", real ones never
--                            with "SIM" (D5). next_number is moved only by issue_invoice().
--   invoices                 both directions: 'out' (the farm's own, numbered here) and 'in' (suppliers', from SPV or
--                            the simulator). Amounts in bani. Who issued, what, to whom and for how much never changes
--                            once written (invoices_guard); a status moves only along the allowed moves, each move
--                            logged in invoice_events.
--   invoice_lines            the lines, quantities in thousandths.
--   invoice_events           the history the screen shows: every status, with the provider's message.
--   integration_connections  which provider a farm uses (simulated, oblio, anaf) and in which mode. The credentials are
--                            encrypted by the API and never readable by signed-in users (column grants).
--   issue_invoice()          gives the next number and writes the invoice in one transaction, as the signed-in user
--                            (owner, manager or accountant). The API checks the invoice (validateInvoice) first.
--
-- Who: owner, manager and accountant read everything here and may keep „Datele firmei” and the series. Statuses,
-- incoming invoices and connections are written only by the API (service role). Viewers and workers see nothing.

-- ── „Datele firmei” ───────────────────────────────────────────────────────────────

create table if not exists public.farm_fiscal_profiles (
  farmer_id uuid primary key references public.farmers (id) on delete cascade,
  legal_form text not null check (legal_form in ('pf', 'pfa', 'ii', 'if', 'srl')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  cif text not null check (cif ~ '^(RO)?[0-9]{2,10}$'),
  reg_com text check (reg_com is null or char_length(btrim(reg_com)) between 1 and 40),
  vat_status text not null check (vat_status in ('payer', 'not_registered', 'special_agri')),
  street text check (street is null or char_length(btrim(street)) between 1 and 200),
  city text not null check (char_length(btrim(city)) between 1 and 100),
  county text not null check (county ~ '^[A-Z]{1,2}$'),
  iban text check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  bank text check (bank is null or char_length(btrim(bank)) between 1 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid()
);

create or replace function public.fiscal_profile_touch() returns trigger
  language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists fiscal_profile_touch on public.farm_fiscal_profiles;
create trigger fiscal_profile_touch before update on public.farm_fiscal_profiles
  for each row execute function public.fiscal_profile_touch();

alter table public.farm_fiscal_profiles enable row level security;
drop policy if exists fiscal_profiles_team on public.farm_fiscal_profiles;
create policy fiscal_profiles_team on public.farm_fiscal_profiles for all to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner', 'manager', 'accountant'])))
  with check (farmer_id in (select public.my_farm_ids(array['owner', 'manager', 'accountant'])));
revoke all on table public.farm_fiscal_profiles from anon, authenticated;
grant select on table public.farm_fiscal_profiles to authenticated;
grant insert (farmer_id, legal_form, name, cif, reg_com, vat_status, street, city, county, iban, bank),
      update (legal_form, name, cif, reg_com, vat_status, street, city, county, iban, bank)
  on table public.farm_fiscal_profiles to authenticated;
grant select, insert, update, delete on table public.farm_fiscal_profiles to service_role;

-- ── Series ────────────────────────────────────────────────────────────────────────

create table if not exists public.invoice_series (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  prefix text not null check (prefix ~ '^[A-Z]([A-Z0-9-]{0,8}[A-Z0-9])?$'),
  is_simulated boolean not null,
  -- A farm coming from another program starts where it left off.
  next_number int not null default 1 check (next_number between 1 and 99999999),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (farmer_id, prefix),
  -- D5: "SIM-" + something exactly when simulated; a real series never starts with "SIM".
  constraint invoice_series_simulated check (
    (is_simulated and prefix like 'SIM-_%') or (not is_simulated and prefix not like 'SIM%')
  )
);

alter table public.invoice_series enable row level security;
drop policy if exists invoice_series_team_read on public.invoice_series;
create policy invoice_series_team_read on public.invoice_series for select to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner', 'manager', 'accountant'])));
drop policy if exists invoice_series_team_insert on public.invoice_series;
create policy invoice_series_team_insert on public.invoice_series for insert to authenticated
  with check (farmer_id in (select public.my_farm_ids(array['owner', 'manager', 'accountant'])) and archived_at is null);
drop policy if exists invoice_series_team_archive on public.invoice_series;
create policy invoice_series_team_archive on public.invoice_series for update to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner', 'manager', 'accountant'])))
  with check (farmer_id in (select public.my_farm_ids(array['owner', 'manager', 'accountant'])));
revoke all on table public.invoice_series from anon, authenticated;
grant select on table public.invoice_series to authenticated;
-- Never next_number after the insert: only issue_invoice() moves it, so a number is never given twice.
grant insert (farmer_id, prefix, is_simulated, next_number), update (archived_at) on table public.invoice_series to authenticated;
grant select, insert, update, delete on table public.invoice_series to service_role;

-- ── Invoices ──────────────────────────────────────────────────────────────────────

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  provider text not null check (provider in ('simulated', 'oblio', 'anaf')),
  is_simulated boolean not null,
  status text not null,
  -- The provider's message for the last move (ANAF's errors on a rejection); copied into invoice_events.
  status_detail jsonb,
  series_id uuid references public.invoice_series (id),
  number int check (number >= 1),
  -- As on the paper: "FRM0042" for ours, the supplier's own for theirs.
  doc_id text not null check (char_length(doc_id) between 1 and 60),
  issue_date date not null,
  due_date date,
  currency text not null default 'RON' check (currency ~ '^[A-Z]{3}$'),
  -- Who sold and who bought, as written on the invoice (packages/shared/src/invoices: FiscalProfile / Party).
  seller jsonb not null,
  buyer jsonb not null,
  net_bani bigint,
  vat_bani bigint,
  gross_bani bigint not null,
  note text check (note is null or char_length(note) between 1 and 300),
  storno_of uuid references public.invoices (id),
  -- Ours: the sale it was made for. Theirs: the expense it became („Notează cheltuiala”).
  transaction_id uuid references public.transactions (id) on delete set null,
  client_id uuid,
  -- Theirs: seller CIF + their id (incomingKey), so the same invoice never comes in twice.
  incoming_key text check (incoming_key is null or char_length(incoming_key) between 3 and 200),
  xml text check (xml is null or octet_length(xml) <= 5000000),
  -- Oblio's id, ANAF's upload index and download id: whatever the provider hands back.
  provider_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  constraint invoices_status check (
    (direction = 'out' and status in ('draft', 'issuing', 'sent_to_spv', 'in_processing', 'accepted', 'rejected', 'cancelled'))
    or (direction = 'in' and status in ('new', 'proposed', 'recorded', 'dismissed'))
  ),
  constraint invoices_out_numbered check (direction <> 'out' or (series_id is not null and number is not null)),
  constraint invoices_in_keyed check (direction <> 'in' or (incoming_key is not null and series_id is null and number is null)),
  constraint invoices_simulated check (is_simulated = (provider = 'simulated')),
  constraint invoices_totals check (net_bani is null or vat_bani is null or gross_bani = net_bani + vat_bani),
  constraint invoices_due check (due_date is null or due_date >= issue_date),
  constraint invoices_storno check (storno_of is null or (direction = 'out' and storno_of <> id))
);
create unique index if not exists invoices_out_number on public.invoices (series_id, number) where direction = 'out';
create unique index if not exists invoices_in_key on public.invoices (farmer_id, incoming_key) where direction = 'in';
create unique index if not exists invoices_client on public.invoices (farmer_id, client_id) where client_id is not null;
create index if not exists invoices_farm_date on public.invoices (farmer_id, direction, issue_date desc);
create index if not exists invoices_transaction on public.invoices (transaction_id) where transaction_id is not null;

create table if not exists public.invoice_lines (
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position int not null check (position between 1 and 1000),
  description text not null check (char_length(description) between 1 and 200),
  crop_id text check (crop_id is null or char_length(crop_id) between 1 and 40),
  quantity_milli bigint not null check (quantity_milli <> 0),
  unit_code text check (unit_code is null or char_length(unit_code) between 1 and 10),
  -- Null on a supplier's line that had no price.
  unit_price_bani bigint check (unit_price_bani is null or unit_price_bani >= 0),
  net_bani bigint not null,
  vat_category text check (vat_category is null or char_length(vat_category) between 1 and 4),
  vat_rate_bp int check (vat_rate_bp is null or vat_rate_bp between 0 and 10000),
  exemption_reason text check (exemption_reason is null or char_length(exemption_reason) between 1 and 200),
  primary key (invoice_id, position)
);

create table if not exists public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  at timestamptz not null default now(),
  from_status text,
  to_status text not null,
  detail jsonb
);
create index if not exists invoice_events_invoice on public.invoice_events (invoice_id, at);

-- The moves a status may make. Same as canMoveOut / canMoveIn in packages/shared/src/invoices/model.ts; a test
-- reads this function and compares the two.
create or replace function public.invoice_move_allowed(p_direction text, p_from text, p_to text) returns boolean
  language sql immutable set search_path = public
as $$
  select case p_direction
    when 'out' then (p_from, p_to) in (
      ('draft', 'issuing'),
      ('issuing', 'sent_to_spv'), ('issuing', 'rejected'), ('issuing', 'draft'),
      ('sent_to_spv', 'in_processing'), ('sent_to_spv', 'accepted'), ('sent_to_spv', 'rejected'),
      ('in_processing', 'accepted'), ('in_processing', 'rejected'),
      ('rejected', 'issuing'),
      ('accepted', 'cancelled'))
    when 'in' then (p_from, p_to) in (
      ('new', 'proposed'), ('new', 'dismissed'),
      ('proposed', 'recorded'), ('proposed', 'dismissed'),
      ('dismissed', 'new'))
    else false
  end
$$;

-- What was issued never changes; a status only moves along the allowed moves, and every move is logged.
create or replace function public.invoices_guard() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into invoice_events (invoice_id, from_status, to_status, detail) values (new.id, null, new.status, new.status_detail);
    return new;
  end if;
  if (new.farmer_id, new.direction, new.provider, new.is_simulated, new.series_id, new.number, new.doc_id, new.issue_date,
      new.seller, new.buyer, new.net_bani, new.vat_bani, new.gross_bani, new.storno_of, new.incoming_key, new.created_at)
     is distinct from
     (old.farmer_id, old.direction, old.provider, old.is_simulated, old.series_id, old.number, old.doc_id, old.issue_date,
      old.seller, old.buyer, old.net_bani, old.vat_bani, old.gross_bani, old.storno_of, old.incoming_key, old.created_at) then
    raise exception 'an issued invoice does not change' using errcode = '22023', hint = 'invoice_immutable';
  end if;
  if new.status is distinct from old.status then
    if not public.invoice_move_allowed(new.direction, old.status, new.status) then
      raise exception 'invoice status % -> % not allowed', old.status, new.status using errcode = '22023', hint = 'status_move';
    end if;
    insert into invoice_events (invoice_id, from_status, to_status, detail) values (new.id, old.status, new.status, new.status_detail);
  end if;
  return new;
end $$;
-- Checked before an update; logged after an insert, since the event row needs the invoice to exist.
drop trigger if exists invoices_guard on public.invoices;
create trigger invoices_guard before update on public.invoices
  for each row execute function public.invoices_guard();
drop trigger if exists invoices_log_insert on public.invoices;
create trigger invoices_log_insert after insert on public.invoices
  for each row execute function public.invoices_guard();

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_events enable row level security;
drop policy if exists invoices_team_read on public.invoices;
create policy invoices_team_read on public.invoices for select to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner', 'manager', 'accountant'])));
drop policy if exists invoice_lines_team_read on public.invoice_lines;
create policy invoice_lines_team_read on public.invoice_lines for select to authenticated
  using (invoice_id in (select i.id from public.invoices i
                        where i.farmer_id in (select public.my_farm_ids(array['owner', 'manager', 'accountant']))));
drop policy if exists invoice_events_team_read on public.invoice_events;
create policy invoice_events_team_read on public.invoice_events for select to authenticated
  using (invoice_id in (select i.id from public.invoices i
                        where i.farmer_id in (select public.my_farm_ids(array['owner', 'manager', 'accountant']))));
revoke all on table public.invoices, public.invoice_lines, public.invoice_events from anon, authenticated;
-- Read only: numbers come from issue_invoice(), everything else from the API.
grant select on table public.invoices, public.invoice_lines, public.invoice_events to authenticated;
grant select, insert, update, delete on table public.invoices, public.invoice_lines, public.invoice_events to service_role;

-- ── Connections ───────────────────────────────────────────────────────────────────

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  provider text not null check (provider in ('simulated', 'oblio', 'anaf')),
  mode text not null check (mode in ('sim', 'test', 'prod')),
  status text not null default 'ok' check (status in ('ok', 'expired', 'error')),
  -- AES-GCM with INVOICING_KEY, base64. Never granted to signed-in users.
  credentials_enc text,
  expires_at timestamptz,
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb,
  unique (farmer_id, provider),
  constraint integration_sim check ((provider = 'simulated') = (mode = 'sim')),
  constraint integration_sim_creds check (provider <> 'simulated' or credentials_enc is null)
);

alter table public.integration_connections enable row level security;
drop policy if exists integration_connections_team_read on public.integration_connections;
create policy integration_connections_team_read on public.integration_connections for select to authenticated
  using (farmer_id in (select public.my_farm_ids(array['owner', 'manager', 'accountant'])));
revoke all on table public.integration_connections from anon, authenticated;
grant select (id, farmer_id, provider, mode, status, expires_at, connected_by, connected_at, detail)
  on table public.integration_connections to authenticated;
grant select, insert, update, delete on table public.integration_connections to service_role;

-- ── issue_invoice ─────────────────────────────────────────────────────────────────

drop function if exists public.issue_invoice(uuid, uuid, date, date, jsonb, jsonb, jsonb, bigint, bigint, bigint, text, uuid, uuid, uuid);
create or replace function public.issue_invoice(
  p_farm uuid,
  p_series uuid,
  p_issue_date date,
  p_due_date date,
  p_seller jsonb,
  p_buyer jsonb,
  -- [{description, crop_id, quantity_milli, unit_code, unit_price_bani, net_bani, vat_category, vat_rate_bp, exemption_reason}]
  p_lines jsonb,
  p_net_bani bigint,
  p_vat_bani bigint,
  p_gross_bani bigint,
  p_note text default null,
  p_storno_of uuid default null,
  p_transaction_id uuid default null,
  p_client_id uuid default null
) returns table (invoice_id uuid, doc_id text, number int, already boolean)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_series public.invoice_series%rowtype;
  v_provider text;
  v_id uuid;
  v_doc text;
  v_number int;
  v_sum bigint;
begin
  perform public.require_farm_role(p_farm, array['owner', 'manager', 'accountant']);

  -- The same tap again: the same invoice back.
  if p_client_id is not null then
    select i.id, i.doc_id, i.number into v_id, v_doc, v_number
    from public.invoices i where i.farmer_id = p_farm and i.client_id = p_client_id;
    if found then
      return query select v_id, v_doc, v_number, true;
      return;
    end if;
  end if;

  select s.* into v_series from public.invoice_series s
  where s.id = p_series and s.farmer_id = p_farm and s.archived_at is null
  for update;
  if not found then
    raise exception 'unknown series' using errcode = '22023', hint = 'series_invalid';
  end if;

  -- A simulated series goes to the simulator; a real one needs a working connection (Oblio first, D2).
  if v_series.is_simulated then
    v_provider := 'simulated';
  else
    select c.provider into v_provider from public.integration_connections c
    where c.farmer_id = p_farm and c.provider in ('oblio', 'anaf') and c.status = 'ok'
    order by (c.provider = 'oblio') desc
    limit 1;
    if v_provider is null then
      raise exception 'a real series needs a connection' using errcode = '22023', hint = 'not_connected';
    end if;
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'no lines' using errcode = '22023', hint = 'no_lines';
  end if;
  select sum((e ->> 'net_bani')::bigint) into v_sum from jsonb_array_elements(p_lines) e;
  if v_sum is distinct from p_net_bani or p_gross_bani is distinct from p_net_bani + p_vat_bani then
    raise exception 'totals do not add up' using errcode = '22023', hint = 'totals_mismatch';
  end if;

  if p_storno_of is not null and not exists (
    select 1 from public.invoices i
    where i.id = p_storno_of and i.farmer_id = p_farm and i.direction = 'out' and i.status = 'accepted'
  ) then
    raise exception 'can only reverse an accepted invoice of this farm' using errcode = '22023', hint = 'storno_invalid';
  end if;
  if p_transaction_id is not null and not exists (
    select 1 from public.transactions t where t.id = p_transaction_id and t.farmer_id = p_farm and t.kind = 'sale'
  ) then
    raise exception 'not a sale of this farm' using errcode = '22023', hint = 'transaction_invalid';
  end if;

  v_number := v_series.next_number;
  update public.invoice_series set next_number = next_number + 1 where id = v_series.id;
  -- Same as invoiceId() in packages/shared/src/invoices/numbering.ts: padded to four digits, never cut.
  v_doc := v_series.prefix || case when v_number < 10000 then lpad(v_number::text, 4, '0') else v_number::text end;

  insert into public.invoices (
    farmer_id, direction, provider, is_simulated, status, series_id, number, doc_id, issue_date, due_date,
    seller, buyer, net_bani, vat_bani, gross_bani, note, storno_of, transaction_id, client_id
  ) values (
    p_farm, 'out', v_provider, v_series.is_simulated, 'issuing', v_series.id, v_number, v_doc, p_issue_date, p_due_date,
    p_seller, p_buyer, p_net_bani, p_vat_bani, p_gross_bani, p_note, p_storno_of, p_transaction_id, p_client_id
  ) returning id into v_id;

  insert into public.invoice_lines (
    invoice_id, position, description, crop_id, quantity_milli, unit_code, unit_price_bani, net_bani,
    vat_category, vat_rate_bp, exemption_reason
  )
  select v_id, x.ord::int, x.e ->> 'description', x.e ->> 'crop_id', (x.e ->> 'quantity_milli')::bigint, x.e ->> 'unit_code',
         (x.e ->> 'unit_price_bani')::bigint, (x.e ->> 'net_bani')::bigint, x.e ->> 'vat_category',
         (x.e ->> 'vat_rate_bp')::int, x.e ->> 'exemption_reason'
  from jsonb_array_elements(p_lines) with ordinality as x(e, ord);

  return query select v_id, v_doc, v_number, false;
end $$;
revoke all on function public.issue_invoice(uuid, uuid, date, date, jsonb, jsonb, jsonb, bigint, bigint, bigint, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.issue_invoice(uuid, uuid, date, date, jsonb, jsonb, jsonb, bigint, bigint, bigint, text, uuid, uuid, uuid) to authenticated;
