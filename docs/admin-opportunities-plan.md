# Admin panel, part 2: the funding calls and official sources, all in Supabase

**What for:** an admin, or the demo account (`DEMO_EMAIL`), opens `/admin` → tab „Oportunități și surse” and sees everything the monitor (`subventii-monitor/`) found in the official sources and saved in the database: every funding call (AFIR, MIPE, EC), including the ones farmers never see, its change history, what changed on the official pages, and whether each of the ~179 sources can still be read. Next to them sits a read-only summary of the APIA subsidy rates (`docs/data/subsidies-2026.json`), so every source of money is on one screen.

**No Clerk.** Who is an admin lives in Supabase, in a table. Postgres (RLS) enforces it, and the API reads the same table. The `ADMIN_EMAILS` / `CATALOGUE_EDITORS` env lists go away.

Status: all 7 steps done (2026-11-17). Still to do: run `npm run admin:rehearse` end to end, and look at the tab in a real browser. Written 2026-11-17 from the code. Decisions at the end need a yes before building (CLAUDE.md: architecture that differs from docs → ask first).

## What already exists and shapes this

| Fact | Where | What it means |
|---|---|---|
| Sign-in is Supabase email/password; the API verifies the Supabase JWT | `apps/api/src/middleware/auth.ts` | `auth.uid()` already works in every policy. Nothing to add for identity. |
| Admins today = an email list in the env, `ADMIN_EMAILS`, else `DEMO_EMAIL` | `apps/api/src/env.ts:49`, `middleware/admin.ts` | Replaced by the `app_roles` table (step 1–3). |
| Fertilizer editors = admins + `CATALOGUE_EDITORS` | `env.ts`, `routes/fertilizers.ts` | Becomes a second role in the same table. |
| `/admin` exists (the forecast figures); its link shows when `/api/prediction-data` says `admin: true` | `web/components/pages/Admin.tsx`, `Frame.tsx:79` | The new tab goes inside this page; the flag gets its answer from the table. |
| `opportunities`, `opportunity_events`, `source_changes`, `documents`: readable by every signed-in user | migrations 006, 007, 013 | The admin tab can read them with the user's own session. No new policy needed for them. |
| `sources`, `runs`, `change_events`, `snapshots`: RLS on, **no policies** (only the monitor's secret key) | migration 004 | Add admin-only `select` policies (step 2). |
| Farmers' view hides `relevance = 'not_relevant'` | `packages/shared/src/opportunities/index.ts:134` | The admin view shows everything, with filters. |
| The web already holds a supabase-js client with the user's session | `web/lib/live/index.ts` | The tab reads straight from Supabase; no new Express routes. |
| `seed:demo` deletes and recreates the demo user, so its id changes each time | `scripts/seed-demo.ts:52-67` | The seed must give the demo user its role again after recreating it. |
| APIA rates are in JSON, not the DB | `docs/data/subsidies-2026.json` | Shown read-only from the bundled data; editing stays in the existing figures tab. |

## Architecture

```
auth.users ──► app_roles (user_id, role)          ◄── Supabase dashboard / npm run admin:grant / seed:demo
                    │
              public.has_role('admin')  (security definer, used by RLS and by the API)
                    │
   ┌────────────────┼──────────────────────────────────────────┐
   │ RLS: admin-only select on sources, runs, change_events,    │
   │      views admin_source_health, admin_opportunities        │
   └────────────────┼──────────────────────────────────────────┘
                    │
 web /admin tab ── supabase-js (user's JWT) ── reads directly; Postgres decides
 API requireAdmin ── rpc('has_role') with the user's token (cached 60 s) ── publish figures, fertilizers
```

Postgres is the one gate. The web hides the tab for non-admins as a courtesy only: a non-admin who calls Supabase directly gets zero rows from the admin views.

## Steps

### 1. Migration `035_app_roles.sql`: roles in a table ✅
- `app_roles (user_id uuid references auth.users on delete cascade, role text check (role in ('admin','catalogue_editor')), granted_at timestamptz default now(), granted_by uuid, note text, primary key (user_id, role))`.
- RLS on. One policy: a user reads **their own** rows (`user_id = auth.uid()`). No insert/update/delete policy, so nobody can make themselves an admin through the API. Grants: `select` to authenticated, everything to service_role. Edited only from the dashboard, the service role or SQL.
- `public.has_role(p_role text) returns boolean`: `language sql stable security definer set search_path = public`, `exists (select 1 from app_roles where user_id = auth.uid() and role = p_role)`. It also says yes for `catalogue_editor` when the user is an `admin`. `revoke all from public`, `grant execute to authenticated`. Same pattern as `my_farmer_ids()` in 001.
- Shortcut: `public.is_admin()` = `has_role('admin')`.

### 2. Migration `037_admin_reads.sql`: what an admin may read ✅ (036 was taken)
- Admin-only policies: `create policy x_admin_read on sources|runs|change_events for select to authenticated using (public.is_admin())`, plus `grant select` to authenticated. Leave out `snapshots` and `robots_cache` (internal).
- View `admin_source_health` (`with (security_invoker = on)`, so the policies above apply): each source with institution, title, url, type, state, last_checked, failure_count, next_due, and the latest `change_events` kind/detail.
- View `admin_opportunities` (`security_invoker = on`, with `where public.is_admin()` as belt and braces): every opportunity + `first_seen` + count of `opportunity_events` + last change date + count of farmers following it (`opportunity_follows`, a count only, no farmer ids).
- `runs` gives the "last monitor run: when, how many requests, errors" strip.
- The monitor keeps writing with the service role, untouched.

### 3. The API reads the same table ✅
- `requireAdmin` / `isAdmin`: instead of the email list, `db.forUser(token).rpc('is_admin')`, cached per user id for 60 s, so one publish click doesn't cost a round trip per call. Same for the fertilizer gate with `has_role('catalogue_editor')`.
- `/api/prediction-data` keeps its `admin` flag (the phone caches it, so the link survives offline). The answer now comes from the table.
- Delete `adminEmails`, `catalogueEditors`, `ADMIN_EMAILS`, `CATALOGUE_EDITORS` from `env.ts` and `.env.example`; update `env-editors.test.ts`, `admin.test.ts` and the fertilizer tests to use a fake role lookup.

### 4. Who gets the role ✅
- **Demo account:** `scripts/seed-demo.ts` inserts `(demo user id, 'admin')` right after `createUser`, because the reseed gives the demo user a new id and the cascade drops the old row.
- **Real admins:** `npm run admin:grant -- someone@x.ro [admin|catalogue_editor]` and `admin:revoke`: a small script with the service key that looks up the user by email and writes the row. Or add a row in the Supabase Table Editor.
- `scripts/rehearse-admin.ts`: replace the "DEMO_EMAIL is not in ADMIN_EMAILS" check with "the demo user has the admin row".

### 5. Web: the tab „Oportunități și surse” in `/admin` ✅
- Two tabs in `Admin.tsx`: „Cifrele calculelor” (today's panel) and „Oportunități și surse”. Same route, so no new `SCREENS` entry and no new skeleton. The data code goes in `web/lib/cc/admin-opportunities.ts` (pure filters/sorting, tested), and the UI in a new component.
- **Apeluri de finanțare:** from `admin_opportunities`. Filters: program (AFIR/MIPE/EC), status, relevance (incl. „nerelevant pentru fermieri”), confidence, „deschise acum”, deadline before a date, text search on the title. Table on desktop, cards on the phone. Each row shows title, program, status, deadline, budget in EUR (`null` → „nepublicat”), relevance and confidence badges, how many farmers follow it, and a link to the official page. Expanded: `evidence`, `relevance_note`, history from `opportunity_events`.
- **Surse oficiale:** from `admin_source_health`, grouped by state (`active`, `needs_manual`, `blocked`, `error`, `gone`, `suspicious`), with counts at the top, last check, and the latest change. Plus the last run strip from `runs`.
- **Ce s-a schimbat:** latest `source_changes` (kind, short diff, link).
- **Subvenții APIA:** read-only from the bundled data with any published overrides applied (`usePredictions`): scheme, €/ha, advance %, status label (`confirmat-2026` / `DE-VERIFICAT`), and a link to the figures tab to change one.
- UI in Romanian with diacritics and plain words, per CLAUDE.md.

### 6. Offline ✅
- On a successful read, keep the result in `localStorage` under `storageKey('cropcash-admin-opps')` and show it offline with „Date din {dată}”.
- „Reîncarcă” is a `NetButton` with `reason="Datele noi cer internet."`. Nothing here writes, so nothing goes in the outbox.

### 7. Tests ✅
- **Integration** (`npm run test:integration`, real Supabase): a plain farmer gets 0 rows from `admin_opportunities`, `admin_source_health` and `sources`, and `is_admin()` returns false; a farmer can't insert into `app_roles`; a user with the row gets everything; the demo user is an admin after `seed:demo`.
- **Unit:** the API gate with a fake role lookup (403 / 200, and the cache), plus the filters and sorting in `lib/cc/admin-opportunities.ts`.
- **Web:** the tab renders, filters narrow the list, and the empty and offline states show.
- `npm run admin:rehearse`: add "the demo account opens the opportunities tab and sees ≥ 1 call and ≥ 1 source".

## Not in this step
- **Editing a call by hand** (hiding it, correcting a deadline, changing relevance). The monitor rewrites those rows, so a manual edit needs its own table (`opportunity_reviews`, admin-only writes through RLS) that's laid on top when reading, like `prediction_overrides`. Natural next step.
- **Reading snapshot text or diffs from Storage.** That would need a storage policy for admins.
- **Ion's farm without an account** never gets the tab (it never calls the API or Supabase).

## Decisions to confirm
1. **What the demo account may do.** (a) Full admin, like today: it can also publish forecast figures. (b) A read-only `demo_viewer` role: it sees both tabs but publishing is refused. Recommended: **(b)** if the demo login is shared outside the team, otherwise (a).
2. **Move fertilizer editors into the table too** (`catalogue_editor`) so no access list stays in the env. Recommended: yes.
3. **Roles keyed by user id** (safe; the person must have signed up first, and reseeding must re-grant) rather than by email (can be granted ahead, but trusts the email in the token). Recommended: user id.
