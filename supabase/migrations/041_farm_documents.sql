-- 041: the cerere de plată kept in the app (docs/cerere-documents-google-map-plan.md, step 2). Safe to run again.
--
--   farm_documents         a paper the farm keeps: kind, year, the reading as the reader returned it (never
--                          edited), the stored files (empty when the farmer chose not to keep them), a version
--                          for edits, and which newer paper replaced it
--   cerere_fields          the cerere's header as the farmer has it now (no CNP, IBAN, address or phone)
--   cerere_rows            one row per II.A line as the farmer has it now, and the parcel it went on
--   plot_seasons.source_row_id   the cerere row a season came from
--   save_cerere_document   keeps a new paper; the same client id gives the same paper back; a second current
--                          cerere for the same year is refused (cerere_exists) unless it says which one it replaces
--   update_cerere          writes the edited header and rows, only on the version the caller read (stale otherwise)
--   apply_cerere           puts rows on the map through save_plots and links rows ↔ seasons
--   delete_farm_document   the owner removes a paper, or only its files; returns the storage paths to remove
--   storage                private bucket farm-documents, folder = farm id; only the farm's owner reads,
--                          adds or removes files (they hold the CNP and IBAN)
--
-- Who: owner and manager read and edit the fields and rows; only the owner adds files, opens them, or deletes.
-- Writes go only through the functions below (no insert/update/delete grants), so the API's rules can't be skipped
-- through the REST API. Areas are whole ari, as everywhere.

-- ── A CNP or IBAN never sits in these tables ─────────────────────────────────────

-- The same rule as hasPersonalNumber (packages/shared/src/documents/index.ts): a 13-digit run, or a Romanian
-- IBAN, once spaces and dots are taken out. A second guard behind the API, not the first.
create or replace function public.has_personal_number(p_text text) returns boolean
  language sql immutable set search_path = public
as $$
  select p_text is not null and (
    regexp_replace(p_text, '[[:space:].]', '', 'g') ~ '(^|[^0-9])[0-9]{13}([^0-9]|$)'
    or regexp_replace(p_text, '[[:space:].]', '', 'g') ~* 'RO[0-9]{2}[A-Z]{4}[0-9A-Z]{16}'
  )
$$;
grant execute on function public.has_personal_number(text) to authenticated, service_role;

-- ── Tables ────────────────────────────────────────────────────────────────────────

create table if not exists public.farm_documents (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  kind text not null check (kind in ('apia_cerere', 'apia_decizie', 'invoice', 'sale_paper', 'other')),
  campaign_year int check (campaign_year between 2000 and 2100),
  title text check (title is null or char_length(btrim(title)) between 1 and 120),
  -- [{path, mediaType, bytes, sha256}] in page order; [] when the file wasn't kept.
  files jsonb not null default '[]' check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 20),
  -- What the reader returned, normalised. Kept as it was, so the farmer can see what the paper said.
  reading jsonb not null check (jsonb_typeof(reading) = 'object' and not public.has_personal_number(reading::text)),
  reader_version text not null check (char_length(reader_version) between 1 and 40),
  status text not null default 'to_check' check (status in ('to_check', 'checked', 'applied')),
  -- Goes up on every edit; update_cerere refuses a write made on an older one.
  version int not null default 1 check (version > 0),
  superseded_by uuid,
  client_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, farmer_id)
);
-- The newer paper is made in the same call that marks the old one, so the check waits for the end of it.
alter table public.farm_documents drop constraint if exists farm_documents_superseded_by_fkey;
alter table public.farm_documents add constraint farm_documents_superseded_by_fkey
  foreign key (superseded_by, farmer_id) references public.farm_documents (id, farmer_id)
  on delete set null (superseded_by) deferrable initially deferred;
create unique index if not exists farm_documents_client_id on public.farm_documents (farmer_id, client_id) where client_id is not null;
-- One current cerere per farm and campaign; the replaced ones stay as history.
create unique index if not exists farm_documents_one_cerere on public.farm_documents (farmer_id, campaign_year)
  where kind = 'apia_cerere' and superseded_by is null;
create index if not exists farm_documents_farm on public.farm_documents (farmer_id, kind, campaign_year);

create table if not exists public.cerere_fields (
  document_id uuid primary key,
  farmer_id uuid not null,
  applicant_type text check (applicant_type in ('pf', 'pfa', 'ii', 'if', 'pj')),
  last_name text check (char_length(last_name) between 1 and 80),
  first_name text check (char_length(first_name) between 1 and 80),
  company_name text check (char_length(company_name) between 1 and 120),
  birth_year int check (birth_year between 1900 and 2100),
  county text check (char_length(county) between 1 and 4),
  apia_centre text check (char_length(apia_centre) between 1 and 120),
  total_area_ari int check (total_area_ari > 0 and total_area_ari <= 10000000),
  schemes text[] not null default '{}' check (cardinality(schemes) <= 40),
  -- {field: true} for each field the farmer changed (the „din cerere” tag).
  edited jsonb not null default '{}' check (jsonb_typeof(edited) = 'object'),
  foreign key (document_id, farmer_id) references public.farm_documents (id, farmer_id) on delete cascade,
  check (not public.has_personal_number(concat_ws(' ', last_name, first_name, company_name, apia_centre, array_to_string(schemes, ' '))))
);

create table if not exists public.cerere_rows (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  farmer_id uuid not null,
  row_no int not null check (row_no between 1 and 1000),
  county text check (char_length(county) between 1 and 4),
  locality text check (char_length(locality) between 1 and 60),
  siruta int check (siruta > 0 and siruta <= 999999),
  bloc_fizic text check (bloc_fizic ~ '^[0-9A-Za-z/]{1,20}$'),
  parcel_no text check (parcel_no ~ '^[0-9a-z/-]{1,10}$'),
  farmer_code text check (char_length(farmer_code) between 1 and 20),
  land_use text check (land_use ~ '^[A-Z]{2,4}$'),
  apia_crop_code int check (apia_crop_code > 0),
  crop_name text not null default '' check (char_length(crop_name) <= 80),
  crop_id text check (char_length(crop_id) between 1 and 40),
  area_ari int check (area_ari > 0 and area_ari <= 100000),
  second_crop_code int check (second_crop_code > 0),
  second_area_ari int check (second_area_ari > 0 and second_area_ari <= 100000),
  plot_id uuid,
  excluded boolean not null default false,
  edited jsonb not null default '{}' check (jsonb_typeof(edited) = 'object'),
  unique (document_id, row_no),
  unique (id, farmer_id),
  foreign key (document_id, farmer_id) references public.farm_documents (id, farmer_id) on delete cascade,
  -- A row can only point at its own farm's parcel; the parcel going away leaves the row.
  foreign key (plot_id, farmer_id) references public.plots (id, farmer_id) on delete set null (plot_id),
  check (not public.has_personal_number(concat_ws(' ', locality, farmer_code, crop_name)))
);
create index if not exists cerere_rows_plot on public.cerere_rows (plot_id) where plot_id is not null;

alter table public.plot_seasons add column if not exists source_row_id uuid;
alter table public.plot_seasons drop constraint if exists plot_seasons_source_row_fkey;
alter table public.plot_seasons add constraint plot_seasons_source_row_fkey
  foreign key (source_row_id, farmer_id) references public.cerere_rows (id, farmer_id) on delete set null (source_row_id);

-- ── Who reads ─────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['farm_documents', 'cerere_fields', 'cerere_rows'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_team_read', t);
    -- my_farmer_ids(): owner and manager (035).
    execute format('create policy %I on public.%I for select to authenticated using (farmer_id in (select public.my_farmer_ids()))',
                   t || '_team_read', t);
  end loop;
end $$;

-- ── Writing ───────────────────────────────────────────────────────────────────────

-- Header fields from a jsonb object in the API's snake_case. Unknown keys are ignored.
create or replace function public.cerere_write_fields(p_document uuid, p_farmer uuid, p_fields jsonb) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  insert into cerere_fields (document_id, farmer_id, applicant_type, last_name, first_name, company_name, birth_year,
                             county, apia_centre, total_area_ari, schemes, edited)
  values (p_document, p_farmer, p_fields->>'applicant_type', p_fields->>'last_name', p_fields->>'first_name',
          p_fields->>'company_name', (p_fields->>'birth_year')::int, p_fields->>'county', p_fields->>'apia_centre',
          (p_fields->>'total_area_ari')::int,
          coalesce(array(select jsonb_array_elements_text(coalesce(p_fields->'schemes', '[]'))), '{}'),
          coalesce(p_fields->'edited', '{}'))
  on conflict (document_id) do update set
    applicant_type = excluded.applicant_type, last_name = excluded.last_name, first_name = excluded.first_name,
    company_name = excluded.company_name, birth_year = excluded.birth_year, county = excluded.county,
    apia_centre = excluded.apia_centre, total_area_ari = excluded.total_area_ari, schemes = excluded.schemes,
    edited = excluded.edited;
end $$;
revoke all on function public.cerere_write_fields(uuid, uuid, jsonb) from public, anon, authenticated;

-- Rows by row_no: new ones are added, known ones updated. plot_id is never taken from the caller (apply_cerere
-- sets it). Rows are never deleted here: the farmer excludes them.
create or replace function public.cerere_write_rows(p_document uuid, p_farmer uuid, p_rows jsonb) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'rows must be an array of at most 500' using errcode = '22023';
  end if;
  insert into cerere_rows (document_id, farmer_id, row_no, county, locality, siruta, bloc_fizic, parcel_no, farmer_code,
                           land_use, apia_crop_code, crop_name, crop_id, area_ari, second_crop_code, second_area_ari,
                           excluded, edited)
  select p_document, p_farmer, (r->>'row_no')::int, r->>'county', r->>'locality', (r->>'siruta')::int, r->>'bloc_fizic',
         r->>'parcel_no', r->>'farmer_code', r->>'land_use', (r->>'apia_crop_code')::int, coalesce(r->>'crop_name', ''),
         r->>'crop_id', (r->>'area_ari')::int, (r->>'second_crop_code')::int, (r->>'second_area_ari')::int,
         coalesce((r->>'excluded')::boolean, false), coalesce(r->'edited', '{}')
    from jsonb_array_elements(p_rows) r
  on conflict (document_id, row_no) do update set
    county = excluded.county, locality = excluded.locality, siruta = excluded.siruta, bloc_fizic = excluded.bloc_fizic,
    parcel_no = excluded.parcel_no, farmer_code = excluded.farmer_code, land_use = excluded.land_use,
    apia_crop_code = excluded.apia_crop_code, crop_name = excluded.crop_name, crop_id = excluded.crop_id,
    area_ari = excluded.area_ari, second_crop_code = excluded.second_crop_code, second_area_ari = excluded.second_area_ari,
    excluded = excluded.excluded, edited = excluded.edited;
end $$;
revoke all on function public.cerere_write_rows(uuid, uuid, jsonb) from public, anon, authenticated;

-- Keeps a new paper. Owner or manager; with files, owner only (the files hold the CNP and IBAN).
-- The same client id on the same farm gives the same paper back without writing anything.
-- A second current cerere for the same campaign: 23505 hint cerere_exists, detail = the current one's id; sent
-- again with p_replaces = that id, the old one is kept as history (superseded_by) and the new one is current.
create or replace function public.save_cerere_document(
  p_farmer_id uuid,
  p_client_id uuid,
  p_kind text,
  p_campaign_year int,
  p_title text,
  p_files jsonb,
  p_reading jsonb,
  p_reader_version text,
  p_fields jsonb,
  p_rows jsonb,
  p_replaces uuid default null
) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_current uuid;
begin
  perform public.require_farm_role(p_farmer_id,
    case when jsonb_array_length(coalesce(p_files, '[]')) > 0 then array['owner'] else array['owner', 'manager'] end);
  if p_client_id is not null then
    select id into v_id from farm_documents where farmer_id = p_farmer_id and client_id = p_client_id;
    if found then
      return v_id;
    end if;
  end if;
  if p_kind = 'apia_cerere' then
    select id into v_current from farm_documents
     where farmer_id = p_farmer_id and kind = 'apia_cerere' and campaign_year is not distinct from p_campaign_year
       and superseded_by is null
     for update;
    if found and p_replaces is distinct from v_current then
      raise exception 'this farm already has a cerere for %', p_campaign_year
        using errcode = '23505', hint = 'cerere_exists', detail = v_current::text;
    end if;
  end if;
  v_id := gen_random_uuid();
  if v_current is not null then
    update farm_documents set superseded_by = v_id, updated_at = now() where id = v_current;
  end if;
  insert into farm_documents (id, farmer_id, kind, campaign_year, title, files, reading, reader_version, client_id)
  values (v_id, p_farmer_id, p_kind, p_campaign_year, nullif(btrim(p_title), ''), coalesce(p_files, '[]'), p_reading,
          p_reader_version, p_client_id);
  if p_kind = 'apia_cerere' then
    perform public.cerere_write_fields(v_id, p_farmer_id, coalesce(p_fields, '{}'));
    perform public.cerere_write_rows(v_id, p_farmer_id, coalesce(p_rows, '[]'));
  end if;
  return v_id;
end $$;
revoke all on function public.save_cerere_document(uuid, uuid, text, int, text, jsonb, jsonb, text, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_cerere_document(uuid, uuid, text, int, text, jsonb, jsonb, text, jsonb, jsonb, uuid) to authenticated;

-- Writes the header (when p_fields isn't null) and the rows given, on the version the caller read. A write made on
-- an older version is refused (40001 hint stale), so two people editing at once never undo each other silently.
-- p_status: 'checked' when the farmer says „Am verificat”; never 'applied' (apply_cerere does that).
-- Returns the new version.
create or replace function public.update_cerere(
  p_farmer_id uuid,
  p_document_id uuid,
  p_version int,
  p_fields jsonb,
  p_rows jsonb,
  p_status text default null
) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  v_doc farm_documents%rowtype;
begin
  perform public.require_farm_role(p_farmer_id, array['owner', 'manager']);
  select * into v_doc from farm_documents where id = p_document_id and farmer_id = p_farmer_id for update;
  if not found or v_doc.kind <> 'apia_cerere' then
    raise exception 'unknown document' using errcode = 'P0002';
  end if;
  if v_doc.version <> p_version then
    raise exception 'the cerere changed since it was read' using errcode = '40001', hint = 'stale';
  end if;
  if p_status is not null and p_status not in ('to_check', 'checked') then
    raise exception 'status % is not set here', p_status using errcode = '22023';
  end if;
  if p_fields is not null then
    perform public.cerere_write_fields(p_document_id, p_farmer_id, p_fields);
  end if;
  if p_rows is not null then
    perform public.cerere_write_rows(p_document_id, p_farmer_id, p_rows);
  end if;
  update farm_documents set
    version = version + 1,
    updated_at = now(),
    -- An applied cerere stays applied; „Am verificat” only moves it forward from to_check.
    status = case when p_status is not null and status <> 'applied' then p_status else status end
  where id = p_document_id
  returning version into v_doc.version;
  return v_doc.version;
end $$;
revoke all on function public.update_cerere(uuid, uuid, int, jsonb, jsonb, text) from public, anon;
grant execute on function public.update_cerere(uuid, uuid, int, jsonb, jsonb, text) to authenticated;

-- Puts rows on the map. p_items = [{row_no, plot: <save_plots item>}]: the plots go through save_plots (same
-- rules: unplaced hectares absorbed, crop totals rebuilt), then each row gets its parcel and the parcel's season
-- its row. Runs as the caller (security invoker) so save_plots checks the role as it always does. Returns the
-- {row_no: plot_id} map.
create or replace function public.apply_cerere(
  p_farmer_id uuid,
  p_document_id uuid,
  p_harvest_year int,
  p_items jsonb
) returns jsonb
  language plpgsql security invoker set search_path = public
as $$
declare
  v_ids jsonb;
  v_map jsonb := '{}'::jsonb;
  i int;
  v_row_no int;
  v_plot uuid;
begin
  perform public.require_farm_role(p_farmer_id, array['owner', 'manager']);
  if not exists (select 1 from farm_documents where id = p_document_id and farmer_id = p_farmer_id and kind = 'apia_cerere') then
    raise exception 'unknown document' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;
  -- Every row named must be a live row of this paper, once.
  if (select count(distinct (x->>'row_no')::int) from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items)
     or exists (select 1 from jsonb_array_elements(p_items) x
                where not exists (select 1 from cerere_rows r where r.document_id = p_document_id
                                    and r.row_no = (x->>'row_no')::int and not r.excluded)) then
    raise exception 'unknown or excluded row' using errcode = '22023';
  end if;

  v_ids := public.save_plots(p_farmer_id, p_harvest_year,
                             (select jsonb_agg(x->'plot' order by o) from jsonb_array_elements(p_items) with ordinality t(x, o)));

  for i in 0 .. jsonb_array_length(p_items) - 1 loop
    v_row_no := (p_items->i->>'row_no')::int;
    v_plot := (v_ids->>i)::uuid;
    perform public.cerere_link_row(p_document_id, p_farmer_id, v_row_no, v_plot, p_harvest_year);
    v_map := v_map || jsonb_build_object(v_row_no::text, v_plot);
  end loop;
  perform public.cerere_mark_applied(p_document_id, p_farmer_id);
  return v_map;
end $$;

-- The links apply_cerere sets. Definer: the caller has no update grant on cerere_rows or farm_documents.
create or replace function public.cerere_link_row(p_document uuid, p_farmer uuid, p_row_no int, p_plot uuid, p_year int) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_row uuid;
begin
  perform public.require_farm_role(p_farmer, array['owner', 'manager']);
  update cerere_rows set plot_id = p_plot where document_id = p_document and farmer_id = p_farmer and row_no = p_row_no
  returning id into v_row;
  update plot_seasons set source_row_id = v_row where plot_id = p_plot and farmer_id = p_farmer and harvest_year = p_year;
end $$;
revoke all on function public.cerere_link_row(uuid, uuid, int, uuid, int) from public, anon;
grant execute on function public.cerere_link_row(uuid, uuid, int, uuid, int) to authenticated;

create or replace function public.cerere_mark_applied(p_document uuid, p_farmer uuid) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  perform public.require_farm_role(p_farmer, array['owner', 'manager']);
  update farm_documents set status = 'applied', version = version + 1, updated_at = now()
   where id = p_document and farmer_id = p_farmer;
end $$;
revoke all on function public.cerere_mark_applied(uuid, uuid) from public, anon;
grant execute on function public.cerere_mark_applied(uuid, uuid) to authenticated;

revoke all on function public.apply_cerere(uuid, uuid, int, jsonb) from public, anon;
grant execute on function public.apply_cerere(uuid, uuid, int, jsonb) to authenticated;

-- The owner deletes a paper (p_only_files false) or only its files (true: the fields and rows stay).
-- Returns the storage paths that were listed, for the API to remove; a leftover object is swept later.
create or replace function public.delete_farm_document(p_farmer_id uuid, p_document_id uuid, p_only_files boolean default false)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_files jsonb;
begin
  perform public.require_farm_role(p_farmer_id, array['owner']);
  select files into v_files from farm_documents where id = p_document_id and farmer_id = p_farmer_id for update;
  if not found then
    raise exception 'unknown document' using errcode = 'P0002';
  end if;
  if p_only_files then
    update farm_documents set files = '[]', version = version + 1, updated_at = now() where id = p_document_id;
  else
    -- A paper this one replaced becomes current again: the superseded_by key is set to null once this row is gone
    -- (doing it first would make two current cereri for a moment, which farm_documents_one_cerere refuses).
    delete from farm_documents where id = p_document_id;
  end if;
  return coalesce((select jsonb_agg(f->>'path') from jsonb_array_elements(v_files) f), '[]');
end $$;
revoke all on function public.delete_farm_document(uuid, uuid, boolean) from public, anon;
grant execute on function public.delete_farm_document(uuid, uuid, boolean) to authenticated;

-- ── Storage: the files ───────────────────────────────────────────────────────────

-- Private: no public URL ever. Size and type limits are checked by the API from docs/data/plan-params.json;
-- the bucket only takes the reader's types (DOCUMENT_TYPES).
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('farm-documents', 'farm-documents', false, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;

-- Paths are <farm id>/<document id>/<n>.<ext>. Only the farm's owner reads, adds or removes; nobody updates.
drop policy if exists farm_documents_owner_read on storage.objects;
create policy farm_documents_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'farm-documents'
         and (storage.foldername(name))[1] in (select f::text from public.my_farm_ids(array['owner']) f));
drop policy if exists farm_documents_owner_add on storage.objects;
create policy farm_documents_owner_add on storage.objects for insert to authenticated
  with check (bucket_id = 'farm-documents'
              and (storage.foldername(name))[1] in (select f::text from public.my_farm_ids(array['owner']) f));
drop policy if exists farm_documents_owner_remove on storage.objects;
create policy farm_documents_owner_remove on storage.objects for delete to authenticated
  using (bucket_id = 'farm-documents'
         and (storage.foldername(name))[1] in (select f::text from public.my_farm_ids(array['owner']) f));
