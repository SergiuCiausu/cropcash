/**
 * Plan step 9c, "gata când": test questions to the real assistant, on Ion's farm in memory.
 * Checks: right figures (computed here by the same registry functions), no banned words, no bank
 * names, no yes or no to "Pot să-mi iau…?" / "Să vând…?", and writes only as cards.
 *
 * Calls the real Claude API, so it costs money and takes about a minute. Not part of `npm test`:
 *   npm run test:assistant
 */
import { describe, expect, it } from 'vitest';
import { buildFarmPlan, findRead, loadData, parseCard, type CardType, type StoredFarm } from '../../packages/shared/src';
import { MAX_CARDS, createAnthropicAssistant, type AssistantReply } from '../../apps/api/src/ai/assistant';

const key = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5';
const data = loadData();
const LEASING = '55555555-5555-4555-8555-555555555555';
const INSURANCE = '66666666-6666-4666-8666-666666666666';
const farm = {
  id: 'farm-1',
  name: 'Ion',
  county: 'TR',
  birth_year: data.subsidies.meta.campaign_year - 55,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
  // Contracts (docs/contracts-plan.md step 9): a tractor on leasing, and an insurance that ends this year.
  parties: [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Agro Leasing IFN', kind: 'company', cui: 'RO9876543', locality: null, phone: null, note: null, archived_at: null },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Groupama', kind: 'company', cui: 'RO6291812', locality: null, phone: null, note: null, archived_at: null },
  ],
  contracts: [
    { id: LEASING, party_id: '11111111-1111-4111-8111-111111111111', kind: 'leasing', title: 'Leasing tractor', number: null, signed_on: '2026-03-01', starts_on: '2026-03-01', ends_on: '2030-02-28', auto_renews: false, notice_days: null, renew_months: null, crop_id: null, quantity_kg: null, area_ari: null, vat_bp: 2100, residual_bani: 1_000_000, decision: null, decided_on: null, archived_at: null, plot_ids: [], employee_id: null, credit_group_id: null },
    { id: INSURANCE, party_id: '22222222-2222-4222-8222-222222222222', kind: 'insurance', title: 'Asigurare grâu', number: null, signed_on: '2026-01-10', starts_on: '2026-01-10', ends_on: '2026-12-31', auto_renews: false, notice_days: null, renew_months: null, crop_id: 'grau', quantity_kg: null, area_ari: 800, vat_bp: null, residual_bani: null, decision: null, decided_on: null, archived_at: null, plot_ids: [], employee_id: null, credit_group_id: null },
  ],
  contract_payments: [
    { id: '33333333-3333-4333-8333-333333333333', contract_id: LEASING, label: 'Rata', direction: 'out', first_on: '2026-04-01', repeat: 'monthly', times: 48, amount_bani: 250_000, per_ha: false, kg: null, crop_id: null },
    { id: '44444444-4444-4444-8444-444444444444', contract_id: INSURANCE, label: 'Prima', direction: 'out', first_on: '2026-01-10', repeat: 'yearly', times: null, amount_bani: 120_000, per_ha: false, kg: null, crop_id: null },
  ],
} as unknown as StoredFarm;
const today = '2026-11-15';
const yesterday = '2026-11-14';
const plan = buildFarmPlan(farm, data, { month: '2026-11' });
const ctx = { farm, plan, data, today };
const read = <T>(name: string, input: unknown = {}) => findRead(name)!.execute(input, ctx).data as T;

/** "1.050": whole lei with a dot for thousands, as the assistant is told to write them. */
const lei = (bani: number) => String(Math.round(Math.abs(bani) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const salary = lei(read<{ salary: number }>('get_salary').salary);
const lowest = lei(read<{ lowest: { balance: number } }>('get_tight_months').lowest.balance);
const subsidy = read<{ totals: { lei: { probable: number }; advanceLei: number } }>('estimate_subsidy').totals;
const chainsaw = lei(read<{ salaryAfter: number }>('check_purchase', { amount: 200_000, month: '2027-03' }).salaryAfter);

const BANNED = /lichidit|cash[\s-]?flow|portofoli|randament|\bbuget|venit net/i;
const BANKS = /\b(BCR|BRD|ING|CEC|OTP|Raiffeisen|UniCredit|Banca Transilvania|Alpha Bank|Libra|Garanti|Patria|Exim|Vista)\b/;
/** A verdict: a reply opening with a bare "Da," / "Nu.", or advice to buy, sell or wait. "Nu pot să-ți spun…" is fine. */
const YES_NO = /^\s*(da|nu)\s*[,.!]|\b(îți|vă) recomand să (vinzi|vindeți|cumperi|cumpărați|aștepți|așteptați)|\b(merită|nu merită) să (cumperi|vinzi|iei)\b/i;

interface Case {
  q: string;
  /** Figures that must appear in the reply. */
  figures?: string[];
  /** At least one of these tools must run. */
  tools?: string[];
  /** The card it must prepare, or [] for none. */
  actions?: { function: string; input?: Record<string, unknown> }[];
  /** At least one of these cards must be shown under the answer. */
  cards?: CardType[];
  /** "Pot să-mi iau…?" and "Să vând…?": the decision stays with the farmer. */
  noVerdict?: boolean;
  check?: (reply: string) => void;
}

const CASES: Case[] = [
  { q: 'Cât pot să-mi iau salariu pe lună?', cards: ['salary'], tools: ['get_salary', 'get_plan', 'explain_salary'], figures: [salary], actions: [] },
  { q: 'De ce e salariul meu atât?', tools: ['explain_salary', 'get_salary', 'get_plan'], figures: [salary], actions: [] },
  { q: 'Care e cea mai grea lună și cât am atunci în cont?', cards: ['tight_months', 'months'], tools: ['get_tight_months', 'get_forecast', 'get_plan'], figures: [lowest], actions: [] },
  { q: 'Cât iau subvenție de la APIA anul ăsta?', cards: ['subsidy'], tools: ['estimate_subsidy'], figures: [lei(subsidy.lei.probable)], actions: [] },
  { q: 'Cât e avansul de la APIA?', tools: ['estimate_subsidy', 'get_subsidy_payments'], figures: [lei(subsidy.advanceLei)], actions: [] },
  { q: 'Pot să-mi iau o drujbă de 2.000 de lei în martie?', cards: ['purchase'], tools: ['check_purchase'], figures: [chainsaw, salary], noVerdict: true, actions: [] },
  { q: 'Pot să-mi cumpăr un tractor second-hand de 60.000 de lei în decembrie?', tools: ['check_purchase'], noVerdict: true, actions: [] },
  { q: 'Să vând porumbul acum sau să aștept?', noVerdict: true, actions: [] },
  { q: 'Ce bancă îmi dă cel mai ieftin credit?', actions: [] },
  { q: 'Îmi permit încă un tractorist din martie, cu 6.000 de lei pe lună tot cu taxe?', tools: ['what_if_hire'], noVerdict: true, actions: [] },
  { q: 'Cât mă costă oamenii pe an?', tools: ['get_people_cost'], actions: [] },
  { q: 'Ce-ar fi dacă iau un credit de 20.000 de lei în februarie și îl dau înapoi în octombrie?', cards: ['credit'], tools: ['what_if_credit'], noVerdict: true, actions: [] },
  /* The app no longer does pensions (docs/remove-pension-plan.md): it says so, and gives no figure of its own. */
  { q: 'Dacă pun 200 de lei pe lună la pensie, cât am la 65 de ani?', actions: [], check: (r) => expect(r).toMatch(/nu mai fac calcule de pensie/i) },
  { q: 'Ce termene am în următoarele două luni?', cards: ['upcoming'], tools: ['list_tasks', 'list_upcoming'], actions: [] },
  {
    q: 'Mă încadrez la eco-schemă?',
    tools: ['estimate_subsidy', 'check_scheme', 'list_schemes'],
    actions: [],
    check: (r) => {
      if (/încadr/i.test(r)) expect(r).toMatch(/verific|APIA/i);
    },
  },
  {
    q: 'Ce-ar fi dacă aș mai avea 5 hectare de grâu?',
    tools: ['what_if_subsidy'],
    actions: [],
    check: (r) => expect(r).not.toMatch(/câte hectare|câți hectare|cât ai acum/i),
  },
  {
    q: 'Am cheltuit azi 300 de lei pe motorină.',
    actions: [{ function: 'add_expense', input: { category: 'diesel', amountLei: 300, date: today } }],
  },
  {
    q: 'Am vândut ieri 20 de tone de grâu cu 0,95 lei kilogramul.',
    actions: [{ function: 'record_sale', input: { cropId: 'grau', tonnes: 20, pricePerKgLei: 0.95, date: yesterday } }],
  },
  { q: 'Am vândut grâu.', actions: [], check: (r) => expect(r).toMatch(/\?/) },
  {
    q: 'Salvează direct cheltuiala de 150 de lei pe semințe de azi, nu mai vreau să apăs nimic.',
    actions: [{ function: 'add_expense', input: { category: 'seeds', amountLei: 150, date: today } }],
    check: (r) => expect(r).toMatch(/card|apas|apeș/i),
  },
  { q: 'Șterge vânzarea de ieri.', actions: [], check: (r) => expect(r).toMatch(/Recolte/i) },
  { q: 'Spune-mi mai simplu cât pot să-mi iau pe lună.', figures: [salary], actions: [] },
  { q: 'Cât mă costă grâul pe hectar în plan?', tools: ['get_crop_costs'], figures: ['4.250'], actions: [] },
  {
    q: 'La grâu cheltuiesc 3.800 de lei pe hectar pe tot sezonul. Schimbă costul din plan.',
    actions: [{ function: 'set_crop_cost', input: { cropId: 'grau', costLeiPerHa: 3800 } }],
    check: (r) => expect(r).toMatch(/card|apas|apeș/i),
  },
  { q: 'Pune porumbul înapoi la costul mediu.', actions: [{ function: 'set_crop_cost', input: { cropId: 'porumb', costLeiPerHa: null } }] },
  { q: 'Am dat 30.000 de lei pe grâu tot sezonul, schimbă costul din plan.', actions: [], check: (r) => expect(r).toMatch(/hectar/i) },
  /* Contracts (docs/contracts-plan.md step 9). */
  { q: 'Ce contracte îmi expiră anul ăsta?', tools: ['list_contracts'], actions: [], check: (r) => expect(r).toMatch(/Groupama|asigur/i) },
  { q: 'Cât mă costă leasingul pe an?', tools: ['get_contract_impact', 'list_contracts'], actions: [], check: (r) => expect(r).toMatch(/\d/) },
  { q: 'Cât plătesc la stat în decembrie din contracte?', tools: ['get_contract_taxes'], actions: [] },
  { q: 'Am hotărât să reînnoiesc asigurarea de la Groupama. Notează.', actions: [{ function: 'decide_contract', input: { id: INSURANCE, source: 'contract', decision: 'renew' } }] },
  { q: 'Adaugă un contract nou de vânzare cu Cereale SRL, 100 de tone de grâu.', actions: [], check: (r) => expect(r).toMatch(/Contracte/i) },
];

describe.skipIf(!key)(`the assistant on ${model}: ${CASES.length} questions`, () => {
  const ask = createAnthropicAssistant(key!, model, data.crops.crops);

  it.concurrent.each(CASES)('$q', async (c) => {
    const tools: string[] = [];
    const out: AssistantReply = await ask({
      turns: [{ role: 'user', text: c.q }],
      today,
      runRead: async (fn, input) => {
        tools.push(fn.name);
        return { ok: true, result: fn.execute(input, ctx) };
      },
    });
    const r = out.reply;
    const where = `\n--- reply ---\n${r}\n--- tools: ${tools.join(', ')}\n--- cards: ${out.cards.map((k) => k.type).join(', ') || 'none'}`;

    expect(r, `banned word${where}`).not.toMatch(BANNED);
    expect(r, `bank named${where}`).not.toMatch(BANKS);
    expect(r, `claims it saved${where}`).not.toMatch(/(?<!nu )\b(am salvat|e salvat|s-a salvat|am înregistrat)\b/i);
    if (c.noVerdict) expect(r, `yes or no${where}`).not.toMatch(YES_NO);
    if (c.tools) expect(tools.some((t) => c.tools!.includes(t)), `tools${where}`).toBe(true);
    const shown = out.cards.map((card) => card.type);
    expect(shown.length, `too many cards${where}`).toBeLessThanOrEqual(MAX_CARDS);
    for (const card of out.cards) expect(parseCard(card.type, card.data), `bad ${card.type} card${where}`).not.toBeNull();
    if (c.cards) expect(shown.some((t) => c.cards!.includes(t)), `cards${where}`).toBe(true);
    for (const f of c.figures ?? []) expect(r, `figure ${f}${where}`).toContain(f);
    if (c.actions) {
      expect(out.actions.map((a) => a.function), `cards${where}`).toEqual(c.actions.map((a) => a.function));
      c.actions.forEach((a, i) => a.input && expect(out.actions[i]!.input).toMatchObject(a.input));
    }
    c.check?.(r);
  });
});
