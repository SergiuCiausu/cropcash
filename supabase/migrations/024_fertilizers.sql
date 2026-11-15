-- 024: the fertilizer catalogue, and which fertilizer (and how much) an expense or a field operation was.
-- Safe to run again.
--
-- fertilizer_types     the legal types (Reg. (EC) 2003/2003 Annex I): urea, CAN, UAN… Complete, rarely changes.
-- fertilizer_products  commercial products, each of one type. Seeded from docs/data/fertilizers.json by
--                      `npm run seed:fertilizers`; more can be added through the API by a catalogue editor
--                      (for now the demo account, see apps/api/src/routes/fertilizers.ts).
--
-- Nutrient contents are basis points (4600 = 46.00 %), like money they're whole numbers.
-- Everyone can read the catalogue; only the service role writes it, so an editor goes through the API.

-- ── Catalogue ──────────────────────────────────────────────────────────────────

create table if not exists public.fertilizer_types (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  section text not null check (char_length(section) between 1 and 10),
  annex_no text check (char_length(annex_no) between 1 and 10),
  name_ro text not null check (char_length(name_ro) between 1 and 160),
  name_en text check (char_length(name_en) between 1 and 160),
  form text not null check (form in ('solid', 'liquid')),
  n_min_bp int check (n_min_bp between 0 and 10000),
  n_forms text[] not null default '{}'
    check (n_forms <@ array['nitric', 'ammoniacal', 'ureic', 'cyanamide', 'organic']::text[]),
  p2o5_min_bp int check (p2o5_min_bp between 0 and 10000),
  k2o_min_bp int check (k2o_min_bp between 0 and 10000),
  s_min_bp int check (s_min_bp between 0 and 10000),
  so3_min_bp int check (so3_min_bp between 0 and 10000),
  mgo_min_bp int check (mgo_min_bp between 0 and 10000),
  cao_min_bp int check (cao_min_bp between 0 and 10000),
  total_min_bp int check (total_min_bp between 0 and 10000),
  is_nitrogen boolean not null,
  note text check (char_length(note) <= 1000),
  source text check (char_length(source) between 1 and 60),
  status text not null default 'DE-VERIFICAT' check (status in ('confirmat', 'DE-VERIFICAT')),
  updated_at timestamptz not null default now()
);

create table if not exists public.fertilizer_products (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  type_id text references public.fertilizer_types (id) on delete restrict,
  type_match text check (type_match in ('exact', 'aproximativ', 'niciunul')),
  brand text not null check (char_length(brand) between 1 and 120),
  manufacturer text check (char_length(manufacturer) between 1 and 120),
  sold_in_ro boolean default true, -- null: not confirmed on sale in Romania
  form text not null check (form in ('solid', 'liquid')),
  n_total_bp int check (n_total_bp between 0 and 10000),
  n_nitric_bp int check (n_nitric_bp between 0 and 10000),
  n_ammoniacal_bp int check (n_ammoniacal_bp between 0 and 10000),
  n_ureic_bp int check (n_ureic_bp between 0 and 10000),
  p2o5_bp int check (p2o5_bp between 0 and 10000),
  k2o_bp int check (k2o_bp between 0 and 10000),
  s_bp int check (s_bp between 0 and 10000),
  so3_bp int check (so3_bp between 0 and 10000),
  mgo_bp int check (mgo_bp between 0 and 10000),
  cao_bp int check (cao_bp between 0 and 10000),
  inhibitor text check (inhibitor in ('NBPT', 'DMPP', 'DCD', 'other')),
  -- Liquids are bought by the litre; this turns litres into kg.
  density_kg_l numeric(4, 2) check (density_kg_l > 0 and density_kg_l < 3),
  source_url text check (char_length(source_url) between 1 and 500),
  note text check (char_length(note) <= 1000),
  status text not null default 'DE-VERIFICAT' check (status in ('confirmat', 'DE-VERIFICAT')),
  -- 'seed': from docs/data/fertilizers.json. 'added': by an editor; added_by is who.
  origin text not null default 'seed' check (origin in ('seed', 'added')),
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(n_nitric_bp, 0) + coalesce(n_ammoniacal_bp, 0) + coalesce(n_ureic_bp, 0) <= coalesce(n_total_bp, 10000)),
  check (density_kg_l is null or form = 'liquid')
);
-- An earlier draft of this migration ran as 021_fertilizers.sql, without these columns.
alter table public.fertilizer_types add column if not exists so3_min_bp int check (so3_min_bp between 0 and 10000);
alter table public.fertilizer_types add column if not exists cao_min_bp int check (cao_min_bp between 0 and 10000);
alter table public.fertilizer_types add column if not exists total_min_bp int check (total_min_bp between 0 and 10000);
alter table public.fertilizer_types add column if not exists note text check (char_length(note) <= 1000);
alter table public.fertilizer_products add column if not exists type_match text
  check (type_match in ('exact', 'aproximativ', 'niciunul'));
alter table public.fertilizer_products add column if not exists so3_bp int check (so3_bp between 0 and 10000);
alter table public.fertilizer_products add column if not exists note text check (char_length(note) <= 1000);
alter table public.fertilizer_products alter column sold_in_ro drop not null;

create index if not exists fertilizer_products_type on public.fertilizer_products (type_id);
create unique index if not exists fertilizer_products_brand
  on public.fertilizer_products (lower(coalesce(manufacturer, '')), lower(brand));

do $$
declare t text;
begin
  foreach t in array array['fertilizer_types', 'fertilizer_products'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('grant select on table public.%I to anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

-- ── What was spread: on an expense and on a field operation ────────────────────
-- Quantity is whole kg (solids) or whole litres (liquids). All three fields go together.

do $$
declare t text;
begin
  foreach t in array array['transactions', 'plot_operations'] loop
    execute format('alter table public.%I add column if not exists fertilizer_product_id text
                      references public.fertilizer_products (id) on delete restrict', t);
    execute format('alter table public.%I add column if not exists fertilizer_qty int', t);
    execute format('alter table public.%I add column if not exists fertilizer_unit text', t);
    if not exists (select 1 from pg_constraint where conname = t || '_fertilizer_check') then
      execute format('alter table public.%I add constraint %I check (
          (fertilizer_product_id is null and fertilizer_qty is null and fertilizer_unit is null)
          or (fertilizer_product_id is not null and fertilizer_qty between 1 and 10000000
              and fertilizer_unit in (''kg'', ''l'')))', t, t || '_fertilizer_check');
    end if;
  end loop;
end $$;
create index if not exists transactions_fertilizer on public.transactions (fertilizer_product_id)
  where fertilizer_product_id is not null;

-- ── record_expense: as in 020, plus the fertilizer ─────────────────────────────

drop function if exists public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid, uuid);
create or replace function public.record_expense(
  p_amount_bani bigint,
  p_date date,
  p_category text,
  p_crop_id text,
  p_note text,
  p_envelope envelope_kind,
  p_harvest_year int default null,
  p_client_id uuid default null,
  p_plot_id uuid default null,
  p_fertilizer_product_id text default null,
  p_fertilizer_qty int default null,
  p_fertilizer_unit text default null
) returns uuid
  language plpgsql security invoker set search_path = public
as $$
declare
  v_farmer uuid;
  v_envelope uuid;
  v_taken bigint := 0;
  v_id uuid;
  v_crop text := p_crop_id;
begin
  select id into v_farmer from farmers where user_id = auth.uid();
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;
  if p_amount_bani <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if p_fertilizer_product_id is not null and p_category <> 'fertilizer' then
    raise exception 'a fertilizer goes on a fertilizer expense' using errcode = '22023';
  end if;

  -- Sent before: return the saved row and take nothing from the envelope again.
  if p_client_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));
    select id into v_id from transactions where farmer_id = v_farmer and client_id = p_client_id;
    if found then
      return v_id;
    end if;
  end if;

  if p_plot_id is not null then
    perform 1 from plots where id = p_plot_id and farmer_id = v_farmer;
    if not found then
      raise exception 'unknown parcel' using errcode = 'P0002';
    end if;
    if v_crop is null then
      select crop_id into v_crop from plot_seasons
       where plot_id = p_plot_id
         and harvest_year = coalesce(p_harvest_year,
               extract(year from p_date)::int + case when extract(month from p_date) >= 11 then 1 else 0 end);
    end if;
  end if;

  if p_envelope is not null then
    select id, least(balance_bani, p_amount_bani) into v_envelope, v_taken
      from envelopes where farmer_id = v_farmer and kind = p_envelope for update;
    update envelopes set balance_bani = balance_bani - v_taken where id = v_envelope;
  end if;

  insert into transactions (farmer_id, envelope_id, amount_bani, occurred_at, source, kind, category, crop_id, note,
                            envelope_taken_bani, harvest_year, client_id, plot_id,
                            fertilizer_product_id, fertilizer_qty, fertilizer_unit)
  values (v_farmer, v_envelope, -p_amount_bani, (p_date + time '12:00') at time zone 'UTC', 'manual', 'expense',
          p_category, v_crop, p_note, coalesce(v_taken, 0), p_harvest_year, p_client_id, p_plot_id,
          p_fertilizer_product_id, p_fertilizer_qty, p_fertilizer_unit)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid, uuid, text, int, text) from public, anon;
grant execute on function public.record_expense(bigint, date, text, text, text, envelope_kind, int, uuid, uuid, text, int, text) to authenticated;
