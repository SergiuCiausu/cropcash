/*
 * npm run test:oblio — checks CropCash's Oblio client against the real Oblio (docs/facturi-plan.md step 7), on an
 * account meant for testing. Needs in .env: OBLIO_EMAIL, OBLIO_SECRET (Oblio: Setări > Date cont), OBLIO_CIF.
 *
 * By default it only reads: token, the account's companies, the company's invoice series and VAT rates, and prints
 * the body CropCash would send for a sample invoice. It never sends anything to SPV.
 *
 * With OBLIO_ISSUE=1 and OBLIO_SERIES=<an invoice series of the company> it also creates that sample invoice in Oblio,
 * with the series' next number, reads it back from the list, and deletes it (Oblio deletes only the last one in a
 * series). Use a test company: the number is used for a moment.
 */
import {
  buildUbl,
  invoiceTotals,
  loadOblioConfig,
  oblioInvoiceBody,
  parseUbl,
  sameCif,
  type InvoiceDraft,
} from '../packages/shared/src/invoices/index';
import { OblioError, oblioClient } from '../apps/api/src/invoicing/oblio';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) {
    console.error(`${k} is not set. test:oblio needs OBLIO_EMAIL, OBLIO_SECRET and OBLIO_CIF in .env (see .env.example).`);
    process.exit(1);
  }
  return v;
};
const creds = { email: need('OBLIO_EMAIL'), secret: need('OBLIO_SECRET') };
const cif = need('OBLIO_CIF');
const issue = process.env.OBLIO_ISSUE === '1';
const seriesName = process.env.OBLIO_SERIES ?? '';

const config = loadOblioConfig();
const client = oblioClient({ config });
const t0 = Date.now();
const step = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

try {
  const companies = await client.companies(creds);
  step(`token ok; ${companies.length} companies: ${companies.map((c) => `${c.company} (${c.cif})`).join(', ')}`);
  const company = companies.find((c) => sameCif(c.cif, cif)) ?? null;
  if (!company) throw new Error(`no company with CIF ${cif} in this account`);

  const series = await client.series(creds, company.cif);
  step(`series: ${series.map((s) => `${s.type} ${s.name} next ${s.next ?? '?'}`).join(', ') || 'none'}`);
  const rates = await client.vatRates(creds, company.cif);
  step(`VAT rates: ${rates.map((r) => `${r.name} ${r.percent}%`).join(', ')}`);

  const invoiceSeries = series.find((s) => s.type.toLowerCase() === 'factura' && s.name === seriesName) ?? series.find((s) => s.type.toLowerCase() === 'factura');
  if (!invoiceSeries) throw new Error('the company has no invoice series');
  const standard = rates.find((r) => r.default) ?? rates[0];
  if (!standard) throw new Error('the company has no VAT rates');
  const payer = company.cif.toUpperCase().startsWith('RO');
  const number = Number(invoiceSeries.next ?? '1');
  const draft: InvoiceDraft = {
    seriesPrefix: invoiceSeries.name,
    issueDate: new Date().toISOString().slice(0, 10),
    currency: 'RON',
    seller: { legalForm: 'srl', name: company.company, cif: company.cif, vatStatus: payer ? 'payer' : 'not_registered', address: { city: 'Alexandria', county: 'TR', country: 'RO' } },
    // A public test CIF from ANAF's examples, never a real buyer.
    buyer: { name: 'Client test CropCash', cif: '2816464', address: { city: 'Alexandria', county: 'TR', country: 'RO' } },
    lines: [
      {
        description: 'Test CropCash (de șters)',
        quantityMilli: 1000,
        unitCode: 'C62',
        unitPriceBani: 100,
        vatCategory: payer ? 'S' : 'O',
        vatRateBp: payer ? Math.round(standard.percent * 100) : 0,
      },
    ],
    note: 'Factura de test CropCash, se șterge imediat.',
  };
  const id = `${invoiceSeries.name}${String(number).padStart(4, '0')}`;
  const made = oblioInvoiceBody(config, parseUbl(buildUbl(draft, id)), { cif: company.cif, rates, idempotencyKey: `test-oblio-${Date.now()}` });
  if ('problem' in made) throw new Error(`could not build the body: ${JSON.stringify(made.problem)}`);
  step(`body for ${id} (${invoiceTotals(draft.lines).grossBani / 100} lei): ${JSON.stringify(made.body)}`);

  if (!issue) {
    step('read-only run done. OBLIO_ISSUE=1 OBLIO_SERIES=<series> creates and deletes one invoice (never sent to SPV).');
  } else {
    if (!seriesName || invoiceSeries.name !== seriesName) throw new Error('OBLIO_ISSUE=1 needs OBLIO_SERIES set to one of the invoice series above');
    const doc = await client.createInvoice(creds, made.body);
    step(`created ${doc.seriesName} ${doc.number} ${doc.link ?? ''}`);
    if (Number(doc.number) !== number) console.warn(`  ! Oblio gave number ${doc.number}, CropCash sent ${number}: disableAutoSeries isn't kept`);
    const listed = await client.einvoiceStatus(creds, { cif: company.cif, seriesName: doc.seriesName, number: Number(doc.number) });
    step(`listed: ${JSON.stringify(listed)}`);
    const gone = await client.deleteInvoice(creds, { cif: company.cif, seriesName: doc.seriesName, number: Number(doc.number) });
    step(`deleted: ${gone}`);
  }
  console.log('\ntest:oblio passed.');
} catch (e) {
  console.error(`\ntest:oblio failed: ${e instanceof OblioError ? `${e.kind} ${e.httpStatus ?? ''} ${e.detail}` : (e as Error).message}`);
  process.exitCode = 1;
}
