/* The Contracte screen's data (docs/contracts-plan.md §3, §4.3, §5.3, §7). Everything here is pure: the contracts come
   with the farm (the server's copy on the phone, or Ion's in docs/data/demo-ion.json), so the screen, the Acasă card
   and the calendar work the same without internet. */
import demoIon from '../../../docs/data/demo-ion.json';
import { addMonths, lastDay, monthKey, type IsoDate } from '../../../packages/shared/src/cashflow/dates';
import type { AppData } from '../../../packages/shared/src/data/index';
import type { StoredContract, StoredLandowner } from '../../../packages/shared/src/arenda/contracts';
import type { ContractDecision, StoredContractPayment, StoredFarmContract, StoredParty } from '../../../packages/shared/src/contracts/model';
import { fromContract, fromLease, type ContractView, type ViewWindow } from '../../../packages/shared/src/contracts/view';
import { taxMonths, taxProfileOf, taxTotals, type LegalForm, type TaxLine, type TaxProfile, type TaxProfileRow, type VatStatus } from '../../../packages/shared/src/contracts/taxes';
import type { AnyContractKind, EndAction } from '../../../packages/shared/src/contracts/types';
import type { IconName } from '../ui/icons';
import type { MeFarm } from './farm';
import { date, exact, ha } from './format';

/** A farm's contracts as the pages read them: both tables, the parties, and what the farm is for taxes. */
export interface FarmContracts {
  parties: StoredParty[];
  contracts: StoredFarmContract[];
  payments: StoredContractPayment[];
  landowners: StoredLandowner[];
  leases: StoredContract[];
  profileRow: TaxProfileRow;
  profile: TaxProfile;
  county: string | null;
}

/** On Ion's farm a visitor's „Am hotărât” stays on the phone, per contract id. */
export type LocalDecisions = Record<string, { decision: ContractDecision | null; decidedOn: IsoDate }>;

export const NO_CONTRACTS: FarmContracts = { parties: [], contracts: [], payments: [], landowners: [], leases: [], profileRow: {}, profile: taxProfileOf({}), county: null };

type IonFile = { tax_profile: TaxProfileRow; parties: StoredParty[]; contracts: StoredFarmContract[]; contract_payments: StoredContractPayment[] };

/** Ion's example contracts, with what a visitor decided on this phone. */
export function ionContracts(decisions: LocalDecisions): FarmContracts {
  const file = demoIon.contracts as unknown as IonFile;
  const contracts = file.contracts.map((c) => (decisions[c.id] ? { ...c, decision: decisions[c.id]!.decision, decided_on: decisions[c.id]!.decision ? decisions[c.id]!.decidedOn : null } : c));
  return { ...NO_CONTRACTS, parties: file.parties, contracts, payments: file.contract_payments, profileRow: file.tax_profile, profile: taxProfileOf(file.tax_profile), county: demoIon.county };
}

/** The signed-in farm's contracts, from its copy (with the queue already applied). */
export function meContracts(me: MeFarm): FarmContracts {
  const profileRow = { legal_form: me.legal_form ?? null, vat_status: me.vat_status ?? null, micro_tax: me.micro_tax ?? null };
  return {
    parties: me.parties ?? [],
    contracts: me.contracts ?? [],
    payments: me.contract_payments ?? [],
    landowners: me.landowners ?? [],
    leases: me.lease_contracts ?? [],
    profileRow,
    profile: taxProfileOf(profileRow),
    county: me.county ?? null,
  };
}

/** The plan's months from today's: the stretch the money and the taxes cover. */
export function contractWindow(today: IsoDate, months: number): ViewWindow {
  const first = monthKey(today);
  return { today, from: `${first}-01`, to: lastDay(addMonths(first, months - 1)) };
}

type Data = Pick<AppData, 'crops' | 'catalogue' | 'arenda' | 'params' | 'contractTypes' | 'contractTaxes'>;

/** Every contract, arendă first in its own table's order, archived ones too (their status is 'ended'). */
export function contractViews(fc: FarmContracts, data: Data, w: ViewWindow): ContractView[] {
  const landowner = (id: string) => fc.landowners.find((o) => o.id === id)?.name ?? '';
  const party = (id: string) => fc.parties.find((p) => p.id === id) ?? { name: '', kind: 'company' as const, cui: null };
  return [
    ...fc.leases.map((c) => fromLease(c, landowner(c.landowner_id), fc.county, data, w, undefined, fc.profile)),
    ...fc.contracts.map((c) => fromContract(c, fc.payments, party(c.party_id), data, w, fc.profile)),
  ];
}

export const inForce = (v: ContractView) => v.end.status !== 'ended';

/** An insurance that ended in the last 60 days with nothing decided: the crop isn't insured any more. */
export function uninsured(v: ContractView, today: IsoDate): boolean {
  if (v.kind !== 'insurance' || v.end.status !== 'ended' || v.end.decision || !v.end.endsOn) return false;
  const days = (Date.parse(today) - Date.parse(v.end.endsOn)) / 86_400_000;
  return days > 0 && days <= 60;
}

/** „De hotărât”: what's due soon or overdue, then the uninsured, the closest day first. */
export function toDecide(views: readonly ContractView[], today: IsoDate): ContractView[] {
  const due = views.filter((v) => v.end.status === 'decide_soon' || v.end.status === 'overdue' || uninsured(v, today));
  const day = (v: ContractView) => v.end.actBy ?? v.end.endsOn ?? '9999';
  return due.sort((a, b) => day(a).localeCompare(day(b)));
}

// ── Words ─────────────────────────────────────────────────────────────────────────

export const KIND_ICONS: Record<AnyContractKind, IconName> = {
  arenda: 'land',
  sale: 'sack',
  supply: 'seed',
  service: 'tool',
  leasing: 'tool',
  insurance: 'shield',
  other: 'doc',
  comodat: 'land',
  credit: 'bank',
  employment: 'people',
};

export const kindName = (data: Pick<AppData, 'contractTypes'>, kind: AnyContractKind) => data.contractTypes.types[kind].name_ro;

export const ACTION_WORDS: Record<EndAction, string> = {
  let_renew: 'Las să se reînnoiască',
  refuse: 'Refuz în scris',
  renegotiate: 'Renegociez',
  deliver: 'Livrez',
  delivered: 'Am livrat',
  postpone: 'Amân',
  pay: 'Plătesc',
  pay_in_kind: 'Plătesc în natură',
  let_continue: 'Las să continue',
  announce_end: 'Anunț că închei',
  buy_out: 'Cumpăr utilajul',
  extend: 'Prelungesc',
  return: 'Îl dau înapoi',
  renew: 'Reînnoiesc',
  look_for_offer: 'Caut altă ofertă',
  stop: 'Nu mai asigur',
  new_contract: 'Fac un contract nou',
  hand_back: 'Predau terenul',
};

/** The decision an end button records. Null: a button that decides nothing (a delivery, looking for an offer). */
export const ACTION_DECISION: Partial<Record<EndAction, ContractDecision>> = {
  let_renew: 'renew',
  refuse: 'end',
  renegotiate: 'renegotiate',
  let_continue: 'renew',
  announce_end: 'end',
  buy_out: 'buy_out',
  extend: 'renew',
  return: 'return',
  renew: 'renew',
  stop: 'end',
};

/** What a decision says on the card. */
export function decisionWords(kind: AnyContractKind, d: ContractDecision): string {
  if (kind === 'arenda') return { renew: 'Lași arenda să se reînnoiască.', end: 'Refuzi reînnoirea. Trimite refuzul în scris.', renegotiate: 'Renegociezi. Schimbă contractul când ai noile condiții.', buy_out: '', return: '' }[d];
  if (kind === 'insurance') return { renew: 'Reînnoiești polița. Scrie prima nouă când o ai.', end: 'Nu mai asiguri cultura.', renegotiate: 'Cauți altă ofertă.', buy_out: '', return: '' }[d];
  if (kind === 'leasing') return { buy_out: 'Cumperi utilajul: valoarea reziduală e în plan.', return: 'Dai utilajul înapoi la sfârșit.', renew: 'Prelungești leasingul.', renegotiate: 'Renegociezi. Schimbă contractul când ai noile condiții.', end: '' }[d];
  return { renew: 'Îl lași să continue.', end: 'Anunți că închei. Fă-o în scris, cu preavizul din contract.', renegotiate: 'Renegociezi. Schimbă contractul când ai noile condiții.', buy_out: '', return: '' }[d];
}

/** The sentence under a contract that's due: what to decide and by when, and what happens without a decision. */
export function dueLine(v: ContractView, today: IsoDate): string {
  const e = v.end;
  if (uninsured(v, today)) return `Polița s-a terminat pe ${date(e.endsOn!, true)}. Cultura nu mai e asigurată.`;
  if (!e.actBy) return e.endsOn ? `Se termină pe ${date(e.endsOn, true)}.` : 'Fără sfârșit scris.';
  const by = date(e.actBy, true);
  const late = today > e.actBy;
  const notice = e.noticeKnown ? '' : ' Verifică preavizul din contract: aplicația socotește până la sfârșit.';
  switch (v.kind) {
    case 'arenda':
      return late ? `Termenul de refuz a trecut pe ${by}: arenda se reînnoiește.` : `Până pe ${by} spui dacă o mai vrei. Altfel se reînnoiește singură.`;
    case 'insurance':
      return `Polița se termină pe ${by}. Fără una nouă, cultura nu mai e asigurată.`;
    case 'leasing':
      return `${late ? `Trebuia să anunți până pe ${by}` : `Până pe ${by} anunți`} ce faci cu utilajul: îl cumperi, îl dai înapoi sau prelungești.${notice}`;
    case 'sale':
      return `Următoarea livrare: pe ${by}.`;
    case 'supply':
      return `Următoarea plată: pe ${by}.`;
    default:
      return e.renewsItself
        ? `Până pe ${by} anunți dacă închei. Altfel continuă.${notice}`
        : `${late ? 'Trebuia să hotărăști' : 'Hotărăști'} până pe ${by} dacă îl mai vrei. Se termină pe ${date(e.endsOn ?? e.actBy, true)}.${notice}`;
  }
}

/** Money with the other side in the window. */
export function windowMoney(v: Pick<ContractView, 'flows'>): { inBani: number; outBani: number; kg: number } {
  let inBani = 0;
  let outBani = 0;
  let kg = 0;
  for (const f of v.flows) {
    if (f.direction === 'in') inBani += f.amountBani ?? 0;
    else outBani += f.amountBani ?? 0;
    kg += f.kg;
  }
  return { inBani, outBani, kg };
}

/** The header (§5.3): contracts in force, money in and out in the window, taxes, the next decision. */
export function farmSummary(views: readonly ContractView[], today: IsoDate) {
  const live = views.filter(inForce);
  const money = live.map(windowMoney);
  return {
    count: live.length,
    inBani: money.reduce((a, m) => a + m.inBani, 0),
    outBani: money.reduce((a, m) => a + m.outBani, 0),
    taxes: taxTotals(live.flatMap((v) => v.taxes)),
    next: toDecide(views, today)[0] ?? null,
  };
}

// ── Taxes ─────────────────────────────────────────────────────────────────────────

export const LEGAL_FORM_WORDS: [LegalForm, string][] = [
  ['pf', 'Persoană fizică'],
  ['pfa', 'PFA'],
  ['ii', 'Întreprindere individuală'],
  ['if', 'Întreprindere familială'],
  ['srl', 'SRL'],
];
export const VAT_WORDS: [VatStatus, string][] = [
  ['not_registered', 'Nu plătesc TVA'],
  ['payer', 'Plătitor de TVA'],
  ['special_agri', 'Regimul special pentru fermieri'],
];

/** A tax line's name on the Taxe tab. */
export function taxName(l: Pick<TaxLine, 'tax' | 'effect'>): string {
  if (l.tax === 'rent_income_tax') return l.effect === 'other_side' ? 'Impozitul pe arendă (îl reține arendașul)' : 'Impozitul reținut din arendă';
  if (l.tax === 'land_tax') return 'Impozitul pe teren';
  if (l.tax === 'micro_tax') return 'Impozitul micro';
  return { owed: 'TVA de plătit', deductible: 'TVA de primit înapoi', withheld: 'TVA', cost: 'TVA pe factură', other_side: 'TVA (îl plătește cealaltă parte)' }[l.effect];
}

/** The lines the farm pays or gets back, by month (§4.3). VAT that's a cost and the other side's taxes are apart. */
export function taxRows(views: readonly ContractView[]) {
  const lines = views.flatMap((v) => v.taxes);
  const own = lines.filter((l) => l.effect === 'owed' || l.effect === 'withheld' || l.effect === 'deductible');
  return {
    months: taxMonths(own),
    totals: taxTotals(own),
    costBani: lines.filter((l) => l.effect === 'cost').reduce((a, l) => a + (l.amountBani ?? 0), 0),
    otherSide: lines.filter((l) => l.effect === 'other_side').length,
  };
}

const csvCell = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const lei = (bani: number) => (bani / 100).toFixed(2).replace('.', ',');

/** The Taxe tab as a CSV for the accountant (semicolons, as Excel in Romanian opens it). */
export function taxCsv(views: readonly ContractView[]): string {
  const who = new Map(views.map((v) => [v.id, v.party]));
  const rows = [['Scadența', 'Taxa', 'Cui', 'Formularul', 'Contractul cu', 'Suma (lei)', 'Stare', 'Sursa'].join(';')];
  for (const m of taxRows(views).months)
    for (const l of m.lines)
      rows.push(
        [
          l.dueOn ?? '',
          taxName(l),
          l.to === 'ANAF' ? 'ANAF' : 'primărie',
          l.form ?? '',
          who.get(l.contractId) ?? '',
          l.amountBani === null ? '' : `${l.effect === 'deductible' ? '-' : ''}${lei(l.amountBani)}`,
          l.amountBani === null ? 'necunoscută' : l.status === 'confirmed' ? 'confirmată' : 'de verificat',
          l.source,
        ]
          .map(csvCell)
          .join(';'),
      );
  return rows.join('\n') + '\n';
}

// ── The arendă refusal letter (§3.3) ──────────────────────────────────────────────

/** The text the farmer prints or sends. Art. 1848 asks for writing; the wording isn't reviewed by a lawyer yet. */
export function refusalLetter(c: StoredContract, landowner: Pick<StoredLandowner, 'name' | 'locality'>, farmName: string, today: IsoDate): string {
  const role = c.direction === 'taken' ? 'arendaș' : 'arendator';
  const reg = c.registration_no ? `, înregistrat la primărie sub nr. ${c.registration_no}${c.registration_date ? ` din ${date(c.registration_date, true)}` : ''}` : '';
  return [
    `Către: ${landowner.name}${landowner.locality ? `, ${landowner.locality}` : ''}`,
    `De la: ${farmName}`,
    '',
    'NOTIFICARE DE REFUZ AL REÎNNOIRII CONTRACTULUI DE ARENDĂ',
    '',
    `Subsemnatul ${farmName}, în calitate de ${role} în contractul de arendă încheiat pe ${date(c.starts_on, true)}${reg}, pentru ${ha(c.area_ari)} ha${c.locality ? ` în ${c.locality}` : ''}, valabil până pe ${c.ends_on ? date(c.ends_on, true) : '…'}, vă comunic că refuz reînnoirea contractului la împlinirea termenului, potrivit art. 1848 din Codul civil.`,
    '',
    `Data: ${date(today, true)}`,
    'Semnătura: ____________________',
  ].join('\n');
}

/** „15.000 lei”, or the kg when the payment is in kind. */
export const flowAmount = (f: { amountBani: number | null; kg: number }, cropName: (id: string) => string, cropId: string | null) =>
  f.amountBani !== null ? `${exact(f.amountBani)} lei` : f.kg ? `${f.kg.toLocaleString('ro-RO')} kg ${cropId ? cropName(cropId).toLocaleLowerCase('ro') : ''}`.trim() : '—';

/** What a contract's last day to act is called on the calendar. */
const ACT_BY_WORDS: Partial<Record<AnyContractKind, string>> = {
  arenda: 'ultima zi să refuzi reînnoirea',
  insurance: 'se termină polița',
  leasing: 'anunți ce faci cu utilajul',
};

/**
 * The calendar's contract days (§3.4): the last day to act and the end, inside [from, to]. Derived each time from the
 * contracts, never stored, so changing a contract can't leave an old day behind. A sale's or a supply's days are its
 * payments, which the plan already shows with their money.
 */
export function contractDays(views: readonly ContractView[], from: IsoDate, to: IsoDate): { id: string; date: IsoDate; title: string; contractId: string }[] {
  const out: { id: string; date: IsoDate; title: string; contractId: string }[] = [];
  const inside = (d: IsoDate | null): d is IsoDate => !!d && d >= from && d <= to;
  for (const v of views.filter(inForce)) {
    if (v.kind === 'sale' || v.kind === 'supply') continue;
    const who = v.party || 'cealaltă parte';
    const act = v.end.decision ? null : v.end.actBy;
    if (inside(act)) out.push({ id: `contract-act:${v.id}:${act}`, date: act, title: `Contractul cu ${who}: ${ACT_BY_WORDS[v.kind] ?? 'ultima zi să anunți dacă îl închei'}`, contractId: v.id });
    if (inside(v.end.endsOn) && v.end.endsOn !== act) out.push({ id: `contract-end:${v.id}:${v.end.endsOn}`, date: v.end.endsOn, title: `Se termină contractul cu ${who}`, contractId: v.id });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
