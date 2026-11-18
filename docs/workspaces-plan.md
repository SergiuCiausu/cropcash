# Plan: several farms per account, several people per farm (Supabase only)

Status: **plan, nothing built.** Decisions marked **W?** need an answer before the step that uses them.
Extends `docs/employees-arenda-plan.md` §4 (one farm, several people) to **one person, several farms**.

Goal:
1. A person can own or belong to **several farms** (workspaces) and picks which one they're working on.
2. Each farm has a **list of people** with a role. The farmer who created it is the **owner**.
3. **Supabase** owns everything: sign-in (Supabase Auth, as today), farms, membership and all farm data. No Clerk (W1).

---

## 0. What exists today (checked 2026-11-17)

| Piece | Where | Today | What it means for this plan |
|---|---|---|---|
| Sign-in | `web/lib/live/auth.ts`, `apps/api/src/middleware/auth.ts` | Supabase Auth, email + password. API checks the Supabase JWT against the project JWKS (`jose`) | Stays (§2) |
| The farm | `farmers` (001) | `user_id uuid not null unique references auth.users` → **one farm per user**. Person fields (`birth_year`, salary, pension, Stripe customer) live on the farm row | The `unique` goes; person fields need a home (§3.3) |
| Access rule | `my_farmer_ids()` (001) | `select id from farmers where user_id = auth.uid()`. Every `*_own` policy goes through it | One function to change for RLS; good |
| SQL functions | 38 definitions, but most are redefinitions: only **4** live functions find "my farm" by themselves (`set_envelopes`, `record_expense`, `update_farm`, `save_plots`), plus one policy (`opportunity_follows`, 013) | `select id into v_farmer from farmers where user_id = auth.uid()` | Each must take the farm id and check the role (step 2, migration 036) |
| API | `repo.getMyFarm(token)`, used in 34 places across 12 files | "The farm" = the only row RLS returns | Becomes `getFarm(token, farmId)` with the farm from the request |
| Clients | `web/`, `mobile/` | **Never read Supabase directly**; everything goes through the Express API | The API is the single gate. Good: one place to pick the farm |
| Members | `farm_members`, `farm_invites`, `accept_farm_invite`, `my_memberships` (028); `/contabil`, `/invitatie` | Read-only roles `accountant`, `viewer`; invite links by hashed code; members get no RLS on farm tables, the API reads with the service key and filters | Reuse as-is: extend roles, add `owner`, keep the link flow |
| Payroll people | `employees` (026) | People the farm **pays** (cost, pay days). Not app users | Stays. Optional link `farm_members.employee_id` (§3.1) |
| Phone storage | `web/lib/cc/storage.ts`, `paths.ts` `storageKey` | Keys `cropcash-*`, one set for the real farm, one for Ion's demo | Must become one set **per farm** (§5.3) |
| Offline queue | `web/lib/live/outbox.ts` | Queued writes have no farm id; they go to "my farm" | Each item must carry its farm (§5.4). Otherwise a sale queued on farm A lands on farm B |
| Stripe | `farmers.stripe_account_id`, `stripe_customer_id`, `test_clock_id` | Per farm row | Connect account stays per farm; pension customer per W2 (§3.3) |
| Admins | `middleware/admin.ts` | By email from the token (`ADMIN_EMAILS`) | No change |

---

## 1. The model in one picture

```
auth.users (uuid) ──1:1── profiles            (person: name, birth year, last farm opened)
        │
        └──< farm_members >── farmers (= the workspace / "ferma")
               role: owner | manager | worker | accountant | viewer
               employee_id → employees (optional: "this member is also this paid person")

All farm data (plots, transactions, envelopes, employees, lease_contracts, …) keeps its farmer_id.
```

- The **workspace is the existing `farmers` row**. No rename of the table (34 migrations, every query). In UI and
  new code it's called "ferma" / `farm`; in SQL it stays `farmer_id`.
- **Membership is the only source of truth for access**, owner included. `farmers.user_id` becomes
  `farmers.created_by` (history only, never used for access).
- **Exactly one owner per farm**, enforced by a partial unique index. Ownership can be handed over (§4.5).

### Roles

| Role | Sees | Writes | Money that moves (Stripe) | People |
|---|---|---|---|---|
| `owner` | everything | everything | **yes, only them** | invites, changes roles, removes, hands over, deletes the farm |
| `manager` | everything except the owner's salary/pension | plan, plots, harvests, expenses, sales, employees, arendă, calendar | no | invites `worker`/`accountant`/`viewer` (**W4**) |
| `worker` | Azi, calendar, plots/map, own tasks | fuel log, finished task, hours, expense notes **without amounts** (**W5**) | no | no |
| `accountant` | reports (as `/contabil` today) | nothing | no | no |
| `viewer` | reports | nothing | no | no |

Same rule as CLAUDE.md: anything that moves money is never queued and is owner-only.

---

## 2. Identity: stay on Supabase Auth (W1, decided 2026-11-17: no Clerk)

Sign-in stays as it is: Supabase Auth, email + password; the API checks the Supabase JWT (`middleware/auth.ts`);
`db.forUser(token)` keeps RLS per request. User ids stay `uuid` with `references auth.users`. `auth.uid()` is used
everywhere, as today.

- **Workers without email** (employees plan §4.2): later, turn on Supabase **phone sign-in (SMS one-time code)**
  with a provider (Twilio / MessageBird / Vonage); costs per SMS. Not needed for the first version: invite links
  work with an email account too.
- **Profiles:** a trigger on `auth.users` insert creates the `profiles` row. No webhook.
- **Deleting an account:** refused while the user is the only owner of a farm with data (hand over first, §4.5).

---

## 3. Database (Supabase)

One new migration per step, safe to run again, like the existing ones (`if not exists`, `drop policy if exists`).

### 3.1 Farms and membership

```sql
-- farmers: no longer one per user
alter table farmers drop constraint farmers_user_id_key;
alter table farmers rename column user_id to created_by;
alter table farmers add column archived_at timestamptz;

-- farm_members: owner joins the existing roles
alter table farm_members drop constraint farm_members_role_check;
alter table farm_members add constraint farm_members_role_check
  check (role in ('owner', 'manager', 'worker', 'accountant', 'viewer'));
alter table farm_members add column employee_id uuid references employees(id) on delete set null;
alter table farm_members add column invited_by uuid references auth.users(id) on delete set null;
create unique index farm_one_owner on farm_members (farmer_id) where role = 'owner';

-- backfill: every farm's creator becomes its owner
insert into farm_members (farmer_id, user_id, role)
select id, created_by, 'owner' from farmers
on conflict (farmer_id, user_id) do update set role = 'owner';

-- farm_invites: same roles minus owner
-- (check (role in ('manager','worker','accountant','viewer')))
```

### 3.2 Who may do what, in SQL

```sql
-- Farms where I hold one of these roles. SECURITY DEFINER to avoid RLS recursion (as my_farmer_ids today).
create function public.my_farm_ids(roles text[] default null) returns setof uuid
  language sql stable security definer set search_path = public as $$
  select farmer_id from farm_members
  where user_id = auth.uid() and (roles is null or role = any(roles))
$$;

-- For SQL functions: raises 42501 unless I have one of the roles on that farm.
create function public.require_farm_role(p_farm uuid, roles text[]) returns text ...;
```

- **`my_farmer_ids()` is redefined** as `my_farm_ids(array['owner','manager'])`. Every existing `*_own` policy
  keeps working unchanged and opens the farm's full data to owner + manager only.
- **Worker policies** added per table, only where a worker acts: `plots`, `plot_seasons`, `farm_events`
  (select), `fuel_logs`, `tasks_done`, hours (select + insert own rows). No select on `transactions`,
  `envelopes`, `payouts`, `pension_plans`, `employees`, `lease_contracts`, `landowners`.
- **accountant / viewer** keep today's rule (028): **no** RLS on farm tables; the API checks the role and reads
  through the service key with `memberFarmView`. Unchanged.
- **Owner-only**: `pension_plans`, `payouts`, Stripe columns on `farmers` → separate policies on
  `my_farm_ids(array['owner'])`.
- RLS stays **defense in depth**. The API (§4) is the first gate, since clients never talk to Supabase.

### 3.3 Person vs farm (decision W2)

`farmers` mixes the person and the farm. With several farms per person:

| Field | Today | Proposed |
|---|---|---|
| `name`, `county`, plots, crops, envelopes, `stripe_account_id`, `test_clock_id`, `apia_decision`, `farm_mode` | farm | stays on the farm |
| `birth_year` | farm | → `profiles.birth_year` (pension age is the person's) |
| `salary_bani` | farm | **stays on the farm**: each farm pays its owner a monthly salary. Two farms = two salaries in the plan |
| `pension_plans`, `pension_fund_id`, `stripe_customer_id` | farm | **W2:** one pension per person (fed by all their farms) or one per farm? Recommendation: keep **per farm** now (no change, smallest), revisit |

```sql
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  birth_year int check (birth_year between 1920 and 2010),
  last_farm_id uuid references farmers(id) on delete set null,   -- the farm opened last, for the next sign-in
  created_at timestamptz not null default now()
);
-- RLS: each user reads/updates their own row; members of a shared farm see display_name only via a function.
-- Filled by a trigger on auth.users insert; backfilled from farmers (name, birth_year) for existing users.
```

### 3.4 SQL functions: take the farm, check the role

The 4 live functions that do `select id into v_farmer from farmers where user_id = auth.uid()` (`set_envelopes`,
`record_expense`, `update_farm`, `save_plots`) change to (done in `036_functions_take_the_farm.sql`, which also lists
why every other function is left alone):

```sql
create or replace function public.record_expense(p_farmer_id uuid, p_amount_bani bigint, …)
…
begin
  perform public.require_farm_role(p_farmer_id, array['owner','manager']);
  v_farmer := p_farmer_id;
  …
```

- Keep the **old signature** for one release (it resolves the user's only farm, errors `ambiguous_farm` if
  they have several) so the deployed web keeps working during rollout. Drop it after.
- `create_farm(...)`: no longer unique per user; inserts the farm **and** the owner membership in one transaction.
  Cap at **W3** farms per user (proposal 10) to stop abuse.
- `accept_farm_invite`: `own_farm` check becomes "already a member" → returns the farm, no error.
- `my_memberships()` → `my_farms()`: every farm I'm in, with name, county, my role, archived flag. Used by the picker.
- Make a checklist from: `grep -n "auth.uid()" supabase/migrations/*.sql`. Each function gets a test in
  `test:integration`: owner OK, manager OK/refused per §1 table, worker refused, stranger refused, wrong farm id refused.

---

## 4. API (`apps/api`)

### 4.1 Which farm a request is for

- Header **`X-Farm-Id: <uuid>`** on every farm request. Not a path segment: `web/out` is a static export and
  `/f/[farmId]/acasa` would need every farm id at build time.
- New middleware after `requireAuth`:
  ```ts
  requireFarm(roles: Role[])  // reads X-Farm-Id, loads membership (one query, cached per request),
                              // 400 no_farm_selected | 404 not_a_member | 403 role_not_allowed
                              // → res.locals.farm = { id, role }
  ```
- Routes declare roles: `router.post('/sales', requireFarm(['owner','manager']), …)`,
  `router.post('/fuel', requireFarm(['owner','manager','worker']), …)`, Stripe routes `requireFarm(['owner'])`.
- `repo.getMyFarm(token)` → `repo.getFarm(token, farmId)`; every repo method already takes `farmerId`, now it
  comes from `res.locals.farm.id`, never from the body. 34 call sites in 12 files.
- **Shape the response by role**: `GET /api/me` for a worker strips money fields (a `farmViewFor(role)` pure
  function in `packages/shared`, tested, like `memberFarmView` today).
- Idempotency/replay cache (`replay-cache.ts`, 018): key includes the farm id.
- Rate limits / assistant daily cap (`ASSISTANT_DAILY_LIMIT`): per user, not per farm (**W6**).

### 4.2 New routes

| Route | Who | Does |
|---|---|---|
| `GET /api/farms` | any signed-in user | `my_farms()`: list for the picker |
| `POST /api/farms` | any signed-in user | new farm (the current onboarding, `create_farm`) |
| `PATCH /api/farms/:id` | owner | rename, county, archive |
| `DELETE /api/farms/:id` | owner | only with typed confirmation; refuses while Stripe money is pending |
| `GET /api/farm/members` | owner, manager | exists; now also lists `owner`, `manager`, `worker` |
| `POST /api/farm/invites` | owner (manager per W4) | exists; new roles |
| `PATCH /api/farm/members/:id` | owner | change role, link `employee_id` |
| `DELETE /api/farm/members/:id` | owner (manager for worker) | remove |
| `POST /api/farm/transfer` | owner | hand ownership to an existing manager (§4.5) |
| `POST /api/farm/leave` | any member except owner | exists as `/farms/:farmerId/leave` |
| `PUT /api/profile/last-farm` | self | remembers the farm for the next sign-in |

### 4.3 Webhooks and jobs

Stripe webhooks and scheduled jobs use the service key and already find the farm by `stripe_account_id` or
`farmer_id`. No change, except anything that looked up `farmers.user_id` (e.g. the contact email for Stripe) now
reads the **owner** from `farm_members` → `auth.users.email`.

### 4.4 Audit

Add `created_by uuid` to `transactions`, `fuel_logs`, `tasks_done`, `farm_events`, `plot_operations`
(filled by the SQL functions from `auth.uid()`). With several people on a farm, "who noted this sale?" is the
first question. Shown as a small name on the record.

### 4.5 Handing over and leaving

- Owner can't leave or delete their account while owning a farm: hand over first (to a `manager`), or archive.
- Transfer is one SQL function: old owner → `manager`, new → `owner`, in one transaction (the unique index keeps it at one).
- Stripe Connect account belongs to the farm's legal person, so it stays with the farm; the new owner must
  re-confirm Stripe onboarding (**W7**: check what Stripe requires when the representative changes).

---

## 5. Web and mobile

### 5.1 Picking the farm

- After sign-in: `GET /api/farms`.
  - 0 farms → `/onboarding` (as today) **or**, if they arrived from an invite link, `/invitatie`.
  - 1 farm → straight into `/acasa`.
  - several → `profiles.last_farm_id` if still a member, else a new screen **`/ferme`** ("Alege ferma"):
    one big card per farm (name, county, ha, my role), plus "Adaugă o fermă".
- The active farm id is kept in `localStorage` `cropcash-active-farm` and sent as `X-Farm-Id` by `createApi`.
- **Switcher**: farm name at the top of the app shell (`web/components/app/`) → sheet with the farm list; also in
  "Mai mult". Switching clears in-memory state and reloads the farm's cached data (§5.3). Show the farm name on
  every screen header so nobody writes on the wrong farm.
- `/ferme` goes into `SCREENS` (`web/screens/index.ts`) with a skeleton in `web/components/skeleton/screens.tsx`.
  No `/ferma-lui-ion` copy: Ion's demo is a single farm.
- Offline: the picker shows the farms from the last `GET /api/farms` saved on the phone; switching works offline.

### 5.2 Screens per role

- `owner`/`manager`: the app as today. `/oameni` gets a "Cine folosește aplicația" section (members + invites +
  roles), next to the payroll list it already has. A member row can link to a payroll person.
- `worker`: the small app from employees plan §4.3 (Azi, Am terminat, Motorină, Ore). Navigation hides money tabs;
  routes guard on role too (a typed URL shows "Nu ai acces la pagina asta").
- `accountant`/`viewer`: `/contabil` as today, now reached through the same picker.

### 5.3 Phone storage per farm

- `storageKey(key, mode)` → `storageKey(key, mode, farmId)`: `cropcash-harvests` becomes
  `cropcash-f-<farmId>-harvests` for farm data. Ion's demo keys stay `cropcash-demo-*`.
- Keys that are the person's, not the farm's (`currency`, `rates`, assistant history?) stay global.
- `clearFarmData()` on sign-out still clears every `cropcash*` key. On **leaving or being removed** from a farm,
  clear only that farm's prefix.
- Service worker cache of `/api/me`: keyed by farm (the header isn't part of the cache key by default; add the
  farm id as a query param on cached GETs or key the cache manually).

### 5.4 Offline queue

- Every outbox item stores **`farmId` at the moment it was recorded** and is sent with that `X-Farm-Id`, whatever
  farm is open when the network comes back.
- If the server answers `not_a_member` (removed while offline), the item goes to `refused` with the text
  "Nu mai faci parte din ferma X. Înregistrarea nu a fost trimisă." and stays visible to copy.
- Outbox UI shows the farm name on each pending item when the user has more than one farm.

### 5.5 Copy (Romanian, plain)

"Ferma", "Alege ferma", "Adaugă o fermă", "Oamenii care folosesc aplicația", roles as "Proprietar", "Administrator",
"Lucrător", "Contabil", "Doar vede". Avoid "workspace", "spațiu de lucru".

---

## 6. Steps, in order

Each step ends with `npm test` green and `npm run test:integration` green; nothing ships half a step.

| # | Step | Touches | Done when |
|---|---|---|---|
| 0 | Answer W2–W7 | this doc | decisions written in §8 |
| 1 | **Membership is the access rule**: owner role + backfill, `profiles` + trigger, `my_farm_ids`, `require_farm_role`, `my_farmer_ids()` redefined. *Written 2026-11-17 (`035_farm_owner_membership.sql`, `tests/integration/farm-membership.test.ts`); applied 2026-11-17* | migration 035 | integration tests: owner sees everything; nothing else changes visibly |
| 2 | **SQL functions take the farm**: the 4 that looked up "my farm", with the old signatures kept as shims over `only_farm()`. *Written 2026-11-17 (`036_functions_take_the_farm.sql`, `tests/integration/functions-take-farm.test.ts`); applied 2026-11-17* | migration 036 + RLS tests per function | checklist from the grep is fully ticked |
| 3 | **API picks the farm**: `X-Farm-Id`, `requireFarm(roles)`, `getFarm`, role-shaped `/api/me`, replay cache key. *Built 2026-11-17 as: `pickFarm()` (`middleware/farm.ts`) reads the header; without it, the only farm I run, or 409 `farm_required`. `getMyFarm(token, farmId)` + `farmIdFor` + `myRole`; RLS does the role check (only owner/manager reach farm tables). `/api/me` → `{ farmer, role }` shaped by `farmViewFor`. Money: owner only, via `farm_members`. People: owner only (403 `owner_only`). Tests: `app.test.ts`, `plots.test.ts`, `tests/integration/api-farm-choice.test.ts`. The web doesn't send the header yet (step 4)* | `apps/api/src/**` | `app.test.ts`: every route tested with no header / stranger / each role |
| 4 | **Several farms**: drop `unique(user_id)`, `create_farm` adds owner, `/api/farms`, `/ferme` picker, switcher, `profiles.last_farm_id`. *Built 2026-11-17, applied: `039_several_farms.sql` drops the key (`user_id` stays, as the creator), `create_farm(…, p_client_id)` gives the same farm for the same tap (the unique key used to do that), `my_farms()`. The owner row was already 035's trigger. API: `GET /api/farms`, `PUT /api/profile/last-farm`; no `POST /api/farms`: `POST /api/farmers` makes every farm. Web: `lib/live/farms.ts` (open farm in `cropcash-active-farm`, sent as `X-Farm-Id`; a phone from before falls back to its copy's farm), landing via `/api/farms`, `/ferme` (a standalone page like `/contabil`, not in `SCREENS`: it has no farm and no Ion copy), „Fermele tale” in the rail and „Mai mult”, the farm's name in the phone's top bar with 2+ farms, `/onboarding?ferma=noua`. Until step 5 the phone holds one farm: a switch clears the farm's keys and waits while the outbox has records. Opening another farm needs internet. Tests: `farms.test.ts`, `ferme.test.tsx`, `onboarding.test.tsx`, `Frame.test.tsx`, `app.test.ts`, `tests/integration/several-farms.test.ts`* | migration 039, web shell, onboarding | a user creates a 2nd farm, switches, data never mixes |
| 5 | **Per-farm phone storage + outbox farm id**. *Built 2026-11-17: not by changing every `storageKey()` call but in one place, `farmStore()` in `web/lib/cc/storage.ts`: `browserStore()` maps a farm's keys to `cropcash-f-<farmId>…` (`isFarmKey`: every `cropcash*` key except the queue, session, currency, published figures, onboarding typing, Ion's demo and the accountant's copies). The farm is this page's (`pageFarmOf`), so a tab left on A keeps writing to A. A phone from before moves its plain keys under its farm once (`openFarmOnPhone`). The outbox stays one list; each record has `farmId`, is sent with it, a plan save only replaces its own farm's, and shows (with the refused ones) only on its farm; the banner says when records wait on another farm. Switching clears nothing and doesn't wait; a farm the phone holds opens offline. Service worker: unchanged, it never caches the API (another origin). Tests: `storage-farms.test.ts`, `store.test.ts` (the done-when case), `farms.test.ts`, `ferme.test.tsx`, `onboarding.test.tsx`* | `storage.ts`, `outbox.ts`, `store.ts`, `farm.ts` | test: queue a sale on farm A offline, switch to B, go online → sale on A |
| 6 | **People on the farm**: new roles in invites, role changes, removal, transfer, member ↔ payroll link, `/oameni` section. *Built 2026-11-17, not yet applied: `040_people_on_the_farm.sql`. Links for manager and worker too (`invited_by` kept); W4 as recommended: the owner invites/removes anyone, a manager workers, accountants, viewers (RLS and API). `set_member_role`, `link_member_employee` (one account per payroll person, this farm only) and `transfer_farm` (to a manager only; the old owner becomes a manager; `farmers.user_id` follows the owner; Stripe stays with the farm, W7 still open) are owner-only definer functions. `accept_farm_invite` never changes the role of someone already on the farm. `pension_plans`/`payouts` policies: owner only. Grants sweep (§7). API: `GET /farm/members` (owner and managers, owner listed first, `myRole`, `manages`), `PATCH /farm/members/:id`, `POST /farm/transfer`; the reports card keeps showing only accountants and viewers. Web: „Cine folosește aplicația” on `/oameni` (`components/app/FarmPeople.tsx`, internet only), `/invitatie` sends a manager to the farm, a worker to `/ferme` (their app is step 7), an accountant/viewer to `/contabil`. Tests: `members.test.ts` (shared, API), `web/lib/members.test.ts`, `farm-people.test.tsx`, `tests/integration/people-on-the-farm.test.ts`. Done-when holds up to „sees the small app”: that screen is step 7* | migration 040, `routes/members.ts`, `/oameni` | owner invites a worker by link over WhatsApp, worker signs up, sees the small app |
| 7 | **Worker app** (employees plan §4.3) + `created_by` audit. *Built 2026-11-17, not yet applied: `042_worker_app.sql` (needs 040 first). A standalone page `/lucru` (like `/ferme`, `/contabil`; outside SCREENS, since the store hangs on the owner's `/api/me` copy): „De făcut” with „Am terminat”, „Motorină” in litres only (W5 as recommended, not confirmed). Its own offline queue (`cropcash-work-queue`, each tap with its farm, kept on sign-out like the outbox). API: `GET /api/worker`, `POST /api/worker/work/:id/done`, `POST /api/worker/fuel`, `GET /api/farm/noted`. `created_by` stamped by a trigger on transactions, fuel_logs, farm_events, plot_operations, task_completions. `plot_operations.assigned_to` (payroll person), chosen on the parcel card („Cine o face”). Owner/manager see „Ce au notat oamenii” on /oameni. Workers land on /lucru. Workers don't read farm_events (they carry amounts). „Ore lucrate” deferred.* | screens, migration 042 | worker can log fuel and finish a task, sees no money anywhere (API + UI) |
| 8 | Drop old SQL signatures; update docs `07-architecture.md` §3 & §9, `13-auth-demo-loading-plan.md`. *Built 2026-11-17, not yet applied: `043_drop_old_signatures.sql` drops the four one-farm shims and `only_farm()` (checked on the live database: nothing else calls them; dry run twice, then rolled back). On the live functions, no `from farmers where user_id = auth.uid()` is left. `farmers_own` stays: `user_id` is the owner (kept by `transfer_farm`) and creating a farm needs it; written down in 043 and 07 §3. API: `getMyFarm` → `getFarm` (the header-less "only farm I run" fallback stays, through RLS). Integration tests: `functions-take-farm` now checks the old forms are gone (PGRST202); `rls.test.ts` names the farm. Docs: 07 §3 (FarmMember, Profile, FarmInvite, RLS by membership, `created_by`), §7 (`X-Farm-Id`, worker routes), §8 (per-farm keys, queues), §9 ("Mai multe ferme și oamenii fermei", who lands where); 13 gets a closing section. Also: the guard sends a worker's phone to `/lucru` when the open farm has a saved day, so the installed app (start page `/acasa`) opens offline for a worker.* | migration 043, docs | grep finds no `where user_id = auth.uid()` farm lookup and no `getMyFarm` |
| later | Phone sign-in (SMS) for workers | Supabase Auth settings, `/login` | a worker signs in with a code by SMS |

---

## 7. Risks

- **Writing on the wrong farm.** Biggest real-world risk. Mitigated by the farm name on every header, the outbox
  pinning the farm, and the API taking the farm from the header only.
- **A missed `auth.uid()` farm lookup in a SQL function** silently returns "no farm" or, worse, the wrong one.
  Mitigated by the grep checklist and per-function integration tests; step 8 asserts zero matches.
- **Leaking money to workers** through `/api/me` or a report. `farmViewFor(role)` is pure and unit-tested with a
  snapshot of allowed keys per role.
- **Automatic table grants (found 2026-11-17).** Tables made before Supabase stopped auto-granting still give
  `anon` and `authenticated` every privilege (delete, truncate included). RLS is on everywhere and no policy lets
  `anon` write, so nothing is open to the public key; but an owner or manager can delete their own farm's rows
  straight through the REST API, past the API's rules. `038` (applied) fixes `employees`; `040` sweeps the rest: anon
  keeps only reading the public reference tables, nobody signed in writes reference or server-only tables, and
  delete stays only where the API or a SECURITY INVOKER function deletes. Insert/update on farm tables stay (the
  owner or a manager can still write rows directly past the API's checks; RLS keeps it to their own farm).
- **Demo/pitch.** `DEMO_EMAIL`, `seed:demo`, `demo:rehearse`, `admin:rehearse` assume one farm per user; they must
  send `X-Farm-Id` after step 3. Ion's farm (`/ferma-lui-ion`) doesn't touch the API and is unaffected.

---

## 8. Decisions

| # | Question | Recommendation | Answer |
|---|---|---|---|
| W1 | Move sign-in to Clerk? | — | **No. Supabase Auth only (2026-11-17)** |
| W2 | Pension and owner salary: per person or per farm? | Per farm for now | |
| W3 | Max farms per user | 10 | |
| W4 | May a manager invite people? | Yes, but only worker / accountant / viewer | Built as recommended in step 6 (2026-11-17); not confirmed yet |
| W5 | May a worker record expenses with amounts (e.g. bought fuel)? | Fuel litres yes, lei no; manager adds the amount | |
| W6 | Assistant daily cap per user or per farm? | Per user | |
| W7 | Stripe Connect when ownership changes | Check Stripe's rules before step 6 | |
