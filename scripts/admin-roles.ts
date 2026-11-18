/*
 * Who is an admin or a catalogue editor (app_roles, migration 035; docs/admin-opportunities-plan.md step 4).
 *   npm run admin:grant  -- someone@x.ro [admin|catalogue_editor] ["why"]   (default role: admin)
 *   npm run admin:revoke -- someone@x.ro [admin|catalogue_editor]
 *   npm run admin:list
 * The person must have signed up first. The API notices within a minute (its role cache).
 * The same rows can be edited by hand in the Supabase Table Editor (table app_roles).
 * Needs in .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { grantRole, isRole, listRoles, NoSuchUser, revokeRole, ROLES, userIdByEmail } from '../apps/api/src/db/roles';

const [command, email, roleArg = 'admin', note] = process.argv.slice(2);
const usage = `usage: admin-roles.ts grant|revoke <email> [${ROLES.join('|')}] ["note"]  ·  admin-roles.ts list`;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)');
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  if (command === 'list') {
    const rows = await listRoles(sb);
    if (!rows.length) console.log('nobody has a role yet');
    for (const r of rows) console.log(`${r.role.padEnd(17)} ${r.email ?? r.userId}  (since ${r.grantedAt.slice(0, 10)}${r.note ? `, ${r.note}` : ''})`);
    return;
  }
  if ((command !== 'grant' && command !== 'revoke') || !email) throw new Error(usage);
  if (!isRole(roleArg)) throw new Error(`unknown role "${roleArg}". ${usage}`);
  const userId = await userIdByEmail(sb, email);
  if (!userId) throw new NoSuchUser(email);
  if (command === 'grant') {
    await grantRole(sb, userId, roleArg, note);
    console.log(`${email} is now ${roleArg}`);
  } else {
    const had = await revokeRole(sb, userId, roleArg);
    console.log(had ? `${email} is no longer ${roleArg}` : `${email} did not have ${roleArg}: nothing changed`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  // Not process.exit(): on Windows it can abort while fetch's sockets are still closing.
  process.exitCode = 1;
});
