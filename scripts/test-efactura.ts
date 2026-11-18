/*
 * npm run test:efactura — checks CropCash's ANAF e-Factura client against the real ANAF (docs/facturi-plan.md step 8).
 *
 * Part 1, always, no login: invoices built by CropCash (a sale, a storno, a buyer without CIF, an exempt line) go to
 * ANAF's public validator, and the sale to ANAF's XML → PDF. Nothing is filed: the public service only checks.
 *
 * Part 2, with EFACTURA_FARM_ID (a farm connected through „Conectează SPV”) and INVOICING_KEY + SUPABASE_* in .env:
 * opens the farm's tokens (refreshing them if due, and saving the new ones), lists its messages of the last days on
 * the connection's host. With EFACTURA_UPLOAD=1 it also uploads the sample sale to ANAF's TEST host and follows its
 * state. A connection in production refuses the upload here.
 */
import { createClient } from '@supabase/supabase-js';
import { buildUbl, loadAnafConfig, type InvoiceDraft } from '../packages/shared/src/invoices/index';
import { AnafError, anafClient, anafSessions, type AnafSealed } from '../apps/api/src/invoicing/anaf';
import { SecretBox } from '../apps/api/src/invoicing/secrets';

const config = loadAnafConfig();
const t0 = Date.now();
const step = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const today = new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const seller = { legalForm: 'srl' as const, name: 'Ferma Test CropCash SRL', cif: 'RO1590082', vatStatus: 'payer' as const, address: { street: 'Str. Mare 1', city: 'Alexandria', county: 'TR', country: 'RO' } };
const buyer = { name: 'Moara Exemplu SA', cif: 'RO2816464', address: { street: 'Str. Gării 2', city: 'Roșiorii de Vede', county: 'TR', country: 'RO' } };
const sale: InvoiceDraft = {
  seriesPrefix: 'TST',
  issueDate: today,
  dueDate: inDays(30),
  currency: 'RON',
  seller,
  buyer,
  lines: [{ description: 'Grâu', quantityMilli: 12_500, unitCode: 'TNE', unitPriceBani: 100_000, vatCategory: 'S', vatRateBp: 1100 }],
};
const SAMPLES: [string, string][] = [
  ['vânzare', buildUbl(sale, 'TST0001')],
  [
    'stornare (380, cantități negative)',
    buildUbl({ ...sale, dueDate: undefined, stornoOf: { id: 'TST0001', issueDate: today }, lines: sale.lines.map((l) => ({ ...l, quantityMilli: -l.quantityMilli })) }, 'TST0002'),
  ],
  ['cumpărător fără CIF (persoană fizică)', buildUbl({ ...sale, buyer: { name: 'Ion Popescu', address: { street: 'Str. Lungă 3', city: 'Măldăeni', county: 'TR', country: 'RO' } } }, 'TST0003')],
  [
    'rând scutit (E)',
    buildUbl({ ...sale, lines: [{ description: 'Arendă teren', quantityMilli: 1000, unitCode: 'C62', unitPriceBani: 50_000, vatCategory: 'E', vatRateBp: 0, exemptionReason: 'Scutit conform art. 292 alin. (2) lit. e) Cod fiscal' }] }, 'TST0004'),
  ],
];

const pub = anafClient({ config });
let failed = false;

step('part 1: ANAF’s public validator (no login, nothing filed)');
for (const [name, xml] of SAMPLES) {
  try {
    const v = await pub.validate(xml);
    step(`  ${v.ok ? 'ok ' : 'NOK'} ${name}${v.ok ? '' : `: ${v.messages.join(' | ')}`} (trace ${v.traceId ?? '-'})`);
    if (!v.ok) failed = true;
  } catch (e) {
    failed = true;
    step(`  ERR ${name}: ${e instanceof AnafError ? `${e.kind} ${e.detail}` : (e as Error).message}`);
  }
}
try {
  const pdf = await pub.pdf(SAMPLES[0]![1]);
  step(`  PDF of the sale: ${pdf.length} bytes`);
} catch (e) {
  failed = true;
  step(`  PDF failed: ${e instanceof AnafError ? `${e.kind} ${e.detail}` : (e as Error).message}`);
}

const farmId = process.env.EFACTURA_FARM_ID;
if (!farmId) {
  step('part 2 skipped: EFACTURA_FARM_ID is not set (a farm connected through „Conectează SPV”).');
} else {
  const need = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} is not set (see .env.example)`);
    return v;
  };
  const app = { clientId: need('ANAF_CLIENT_ID'), clientSecret: need('ANAF_CLIENT_SECRET'), redirectUri: need('ANAF_REDIRECT_URI') };
  const box = new SecretBox(need('INVOICING_KEY'));
  const sb = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const client = anafClient({ config, app });
  const sessions = anafSessions({
    config,
    client,
    load: async (id) => {
      const { data } = await sb.from('integration_connections').select('mode, status, credentials_enc').eq('farmer_id', id).eq('provider', 'anaf').maybeSingle();
      const sealed = data?.credentials_enc ? box.open<AnafSealed>(id, data.credentials_enc) : null;
      return data && sealed ? { mode: data.mode === 'prod' ? 'prod' : 'test', status: data.status, sealed } : null;
    },
    saved: async (id, sealed) => {
      step('  tokens refreshed: saving the new ones (ANAF rotates the refresh token)');
      await sb.from('integration_connections').update({ credentials_enc: box.seal(id, sealed), expires_at: sealed.refreshUntil }).eq('farmer_id', id).eq('provider', 'anaf');
    },
    authFailed: async () => step('  ANAF refused the refresh token: connect the farm again'),
  });
  try {
    const s = await sessions.get(farmId);
    if (!s) throw new Error('the farm has no working ANAF connection');
    step(`part 2: farm ${farmId}, ${s.mode} host, CIF ${s.cif}`);
    const now = Date.now();
    const list = await client.list(s.mode, s.access, { cif: s.cif, startMs: now - 7 * 86_400_000, endMs: now, page: 1 });
    step(`  messages, last 7 days: ${list.kind === 'messages' ? `${list.messages.length} on page 1 of ${list.pages} (${[...new Set(list.messages.map((m) => m.tip))].join(', ')})` : JSON.stringify(list)}`);
    if (process.env.EFACTURA_UPLOAD === '1') {
      if (s.mode !== 'test') throw new Error('EFACTURA_UPLOAD only goes to the test host; this connection is in production');
      const xml = buildUbl({ ...sale, seller: { ...sale.seller, cif: s.cif.toUpperCase().startsWith('RO') ? s.cif : `RO${s.cif}` } }, `TST${String(now % 10_000).padStart(4, '0')}`);
      const up = await client.upload('test', s.access, { cif: s.cif, xml });
      step(`  upload (test host): ${JSON.stringify(up)}`);
      if (up.ok) {
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 10_000));
          const st = await client.state('test', s.access, up.index);
          step(`  state: ${st.stare} ${st.downloadId ? `(download ${st.downloadId})` : ''} ${st.errors.join(' ')}`);
          if (st.status && st.status !== 'in_processing') break;
        }
      }
    }
  } catch (e) {
    failed = true;
    step(`part 2 failed: ${e instanceof AnafError ? `${e.kind} ${e.httpStatus ?? ''} ${e.detail}` : (e as Error).message}`);
  }
}

console.log(failed ? '\ntest:efactura found problems (above).' : '\ntest:efactura passed.');
process.exitCode = failed ? 1 : 0;
