/*
 * Removes uploaded cerere pages that no kept paper lists (docs/cerere-documents-google-map-plan.md §3.4): an
 * upload whose save failed and whose cleanup didn't run, or a page a deleted paper left behind. Only pages
 * older than plan-params.json → documents.orphan_file_hours, so an upload still being saved is never touched.
 *   npm run documents:sweep
 * Meant to run once a day (pm2 cron on the VPS, see deploy/ecosystem.config.cjs).
 * Needs in .env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 */
import { loadData } from '../packages/shared/src';
import { supabaseFactory } from '../apps/api/src/db/supabase';
import { supabaseFarmDocuments } from '../apps/api/src/db/farm-documents';

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !key) throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)');

const hours = loadData().params.documents.orphan_file_hours.value;
const before = new Date(Date.now() - hours * 3600_000);
const removed = await supabaseFarmDocuments(supabaseFactory(url, anon, key)).sweep(before);
console.log(`removed ${removed} page(s) no paper lists, older than ${hours} h`);
