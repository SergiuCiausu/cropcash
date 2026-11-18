-- 046: every APIA paper fills the app (docs/apia-documents-autofill-plan.md §5, step 3). Needs 041. Safe to run again.
--
--   farm_documents.kind        every kind of paper in the plan's §1 (PAPER_KINDS in packages/shared/src/documents/proposals.ts)
--   farm_documents.sha256      one paper, all pages: the same paper uploaded twice is read once; pile_id = one upload
--   save_cerere_document       takes the paper's sha256 and pile id too (same rules as 041 otherwise)
--   document_proposals         what a paper wants to change (ProposalSchema), and what happened to it
--   save_document_proposals    a paper's proposals, written again each time it is read; applied ones are kept
--   set_proposal_status        „Nu salva” and back, before „Salvează tot”
--   subsidy_decisions (+ lines)  an APIA decision per campaign and round, line by line; replaces farmers.apia_decision
--                              (016), which stays until the app reads this table (step 6)
--   source_document_id         on transactions, lease_contracts, farm_events and subsidy_decisions: which paper a row came from
--
-- Who: owner and manager read and write proposals (like the cerere's fields); workers and accountants see none of it.
-- Writes go only through the functions (no insert/update/delete grants). Applying proposals is step 6.
-- Money in bani, areas in ari, litres in centilitres: integers only. A CNP or IBAN never sits in these tables.

-- ── farm_documents: more kinds, the paper's fingerprint, the upload it came in ─────────────────

alter table public.farm_documents drop constraint if exists farm_documents_kind_check;
alter table public.farm_documents add constraint farm_documents_kind_check check (kind in (
  'apia_cerere', 'apia_decizie', 'invoice', 'sale_paper', 'other',
  'apia_cerere_change', 'lease', 'registru_agricol', 'seed_proof', 'coupled_sales_proof',
  'fuel_prior_request', 'fuel_quarter_request', 'organic_cert', 'state_aid_request', 'apia_rejection',
  'apia_notice', 'apia_credit_cert', 'fuel_prior_approval', 'bank_statement', 'tax_return'
));

-- sha256 of the pages' sha256s in order (hex). Set by the API, never by the phone alone.
alter table public.farm_documents add column if not exists sha256 text;
alter table public.farm_documents drop constraint if exists farm_documents_sha256_check;
alter table public.farm_documents add constraint farm_documents_sha256_check check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
alter table public.farm_documents add column if not exists pile_id uuid;
-- The same paper twice on a farm is one paper. A replaced one doesn't count, so a cerere can be replaced by the same pages.
create unique index if not exists farm_documents_same_paper on public.farm_documents (farmer_id, sha256)
  where sha256 is not null and superseded_by is null;
create index if not exists farm_documents_pile on public.farm_documents (farmer_id, pile_id) where pile_id is not null;

-- 041's function with two more arguments at the end. Dropped first: two versions would make named calls ambiguous.
-- A paper already on the farm (same sha256): 23505 hint same_paper, detail = its id.
drop function if exists public.save_cerere_document(uuid, uuid, text, int, text, jsonb, jsonb, text, jsonb, jsonb, uuid);
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
  p_replaces uuid default null,
  p_sha256 text default null,
  p_pile_id uuid default null
) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_current uuid;
  v_same uuid;
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
  if p_sha256 is not null then
    select id into v_same from farm_documents
     where farmer_id = p_farmer_id and sha256 = p_sha256 and superseded_by is null and id is distinct from v_current;
    if found then
      raise exception 'this paper is already on the farm' using errcode = '23505', hint = 'same_paper', detail = v_same::text;
    end if;
  end if;
  v_id := gen_random_uuid();
  if v_current is not null then
    update farm_documents set superseded_by = v_id, updated_at = now() where id = v_current;
  end if;
  insert into farm_documents (id, farmer_id, kind, campaign_year, title, files, reading, reader_version, client_id, sha256, pile_id)
  values (v_id, p_farmer_id, p_kind, p_campaign_year, nullif(btrim(p_title), ''), coalesce(p_files, '[]'), p_reading,
          p_reader_version, p_client_id, p_sha256, p_pile_id);
  if p_kind = 'apia_cerere' then
    perform public.cerere_write_fields(v_id, p_farmer_id, coalesce(p_fields, '{}'));
    perform public.cerere_write_rows(v_id, p_farmer_id, coalesce(p_rows, '[]'));
  end if;
  return v_id;
end $$;
revoke all on function public.save_cerere_document(uuid, uuid, text, int, text, jsonb, jsonb, text, jsonb, jsonb, uuid, text, uuid) from public, anon;
grant execute on function public.save_cerere_document(uuid, uuid, text, int, text, jsonb, jsonb, text, jsonb, jsonb, uuid, text, uuid) to authenticated;

-- ── Proposals ─────────────────────────────────────────────────────────────────────

create table if not exists public.document_proposals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  farmer_id uuid not null,
  -- The proposal's place in its paper's list, so a re-read writes the same rows again.
  position int not null check (position between 0 and 999),
  target text not null check (target in ('farm_profile', 'plot_season', 'livestock', 'lease', 'expense', 'sale',
    'subsidy_decision', 'subsidy_expected', 'subsidy_received', 'fuel_quota', 'calendar_event', 'start_balance')),
  -- ProposalSchema's payload for the target, checked by the API before it gets here.
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and not public.has_personal_number(payload::text)),
  quality text not null check (quality in ('xml', 'paper', 'summary')),
  status text not null default 'proposed' check (status in ('proposed', 'skipped', 'duplicate', 'applied', 'undone')),
  -- What dedupeProposals found: {duplicateOf: {index}|{existingId}, replaces: id, pays: {index}|{existingId}}.
  -- Ids of rows in several tables, so a jsonb and not foreign keys.
  links jsonb not null default '{}' check (jsonb_typeof(links) = 'object'),
  -- What „Salvează tot” made (step 6), for undo and the „din hârtie” link. Where the diesel quota, the expected
  -- subsidy and the animals are kept is decided in step 6 (plan A6); their tables join this list then.
  applied_table text check (applied_table in ('farmers', 'plot_seasons', 'lease_contracts', 'transactions',
    'subsidy_decisions', 'farm_events')),
  applied_id uuid,
  issues text[] not null default '{}' check (cardinality(issues) <= 20),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (document_id, position),
  foreign key (document_id, farmer_id) references public.farm_documents (id, farmer_id) on delete cascade,
  check ((status in ('applied', 'undone')) = (applied_at is not null))
);
create index if not exists document_proposals_farm on public.document_proposals (farmer_id, status);

-- ── Decisions, line by line ───────────────────────────────────────────────────────

create table if not exists public.subsidy_decisions (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  campaign_year int not null check (campaign_year between 2000 and 2100),
  round text not null check (round in ('advance', 'balance', 'extra', 'state_aid')),
  decided_on date,
  -- As printed. Negative when the paper is a cut or an amount owed back.
  total_bani bigint not null check (total_bani between -100000000000 and 100000000000),
  received_on date,
  source_document_id uuid,
  created_at timestamptz not null default now(),
  -- One per round: a new decision for the same round replaces the old one.
  unique (farmer_id, campaign_year, round),
  unique (id, farmer_id)
);

create table if not exists public.subsidy_decision_lines (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null,
  farmer_id uuid not null,
  line_no int not null check (line_no between 1 and 200),
  -- As printed: PD-01, DR-04, ANTZ 7…
  scheme text not null check (char_length(btrim(scheme)) between 1 and 20),
  area_ari int check (area_ari > 0 and area_ari <= 100000000),
  heads int check (heads > 0),
  amount_bani bigint not null check (amount_bani between -100000000000 and 100000000000),
  unique (decision_id, line_no),
  foreign key (decision_id, farmer_id) references public.subsidy_decisions (id, farmer_id) on delete cascade
);

-- ── Which paper a row came from ───────────────────────────────────────────────────

-- On the same farm only; the paper going away leaves the row, without its link.
do $$
declare t text;
begin
  foreach t in array array['transactions', 'lease_contracts', 'farm_events', 'subsidy_decisions'] loop
    execute format('alter table public.%I add column if not exists source_document_id uuid', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_source_document_fkey');
    execute format('alter table public.%I add constraint %I foreign key (source_document_id, farmer_id)
                    references public.farm_documents (id, farmer_id) on delete set null (source_document_id)',
                   t, t || '_source_document_fkey');
    execute format('create index if not exists %I on public.%I (source_document_id) where source_document_id is not null',
                   t || '_source_document', t);
  end loop;
end $$;

-- ── Who reads ─────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['document_proposals', 'subsidy_decisions', 'subsidy_decision_lines'] loop
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

-- ── Writing proposals ─────────────────────────────────────────────────────────────

-- A paper's proposals, from a fresh reading. Those not applied yet are replaced; applied (and undone) ones stay as they
-- are, so a re-read never loses what was saved. p_proposals = [{position, target, payload, quality, status?, links?,
-- issues?}], status only 'proposed' or 'duplicate' (dedupeProposals' verdict). Returns how many were written.
create or replace function public.save_document_proposals(p_farmer_id uuid, p_document_id uuid, p_proposals jsonb) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  perform public.require_farm_role(p_farmer_id, array['owner', 'manager']);
  if not exists (select 1 from farm_documents where id = p_document_id and farmer_id = p_farmer_id) then
    raise exception 'unknown document' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_proposals) <> 'array' or jsonb_array_length(p_proposals) > 1000 then
    raise exception 'proposals must be an array of at most 1000' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_proposals) x
             where coalesce(x->>'status', 'proposed') not in ('proposed', 'duplicate')) then
    raise exception 'a new proposal is proposed or a duplicate' using errcode = '22023';
  end if;
  delete from document_proposals
   where document_id = p_document_id and farmer_id = p_farmer_id and status in ('proposed', 'skipped', 'duplicate');
  insert into document_proposals (document_id, farmer_id, position, target, payload, quality, status, links, issues)
  select p_document_id, p_farmer_id, (x->>'position')::int, x->>'target', x->'payload', x->>'quality',
         coalesce(x->>'status', 'proposed'), coalesce(x->'links', '{}'),
         coalesce(array(select jsonb_array_elements_text(coalesce(x->'issues', '[]'))), '{}')
    from jsonb_array_elements(p_proposals) x
   -- A position already applied keeps its applied row.
   where not exists (select 1 from document_proposals d where d.document_id = p_document_id and d.position = (x->>'position')::int);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.save_document_proposals(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_document_proposals(uuid, uuid, jsonb) to authenticated;

-- „Nu salva” (skipped) and back (proposed). Nothing else is set here.
create or replace function public.set_proposal_status(p_farmer_id uuid, p_proposal_id uuid, p_status text) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  perform public.require_farm_role(p_farmer_id, array['owner', 'manager']);
  if p_status not in ('proposed', 'skipped') then
    raise exception 'status % is not set here', p_status using errcode = '22023';
  end if;
  update document_proposals set status = p_status
   where id = p_proposal_id and farmer_id = p_farmer_id and status in ('proposed', 'skipped');
  if not found then
    raise exception 'unknown proposal, or already saved' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.set_proposal_status(uuid, uuid, text) from public, anon;
grant execute on function public.set_proposal_status(uuid, uuid, text) to authenticated;
