/* The APIA papers of phase 2 (docs/rapoarte-apia-plan.md): the proofs for coupled support, the PD-04
   eco-scheme notebook, the fertilizing plan and register, the notice to APIA and the list of what to bring.
   Pure, like build.ts: each builder takes what inputs.ts read off the farm and says, in `missing`, what the
   farm's data lacks. */
import type { CoupledScheme, Filing, Period, ReportRecord } from '../../../packages/shared/src/reports/index';
import { commonNotes, header } from './build';
import { cell, dayNumeric, dayWords, hectares } from './format';
import type { Missing, ReportContext, ReportModel, Section } from './model';

const parcels = (n: number) => (n === 1 ? 'o parcelă' : `${n} parcele`);
const capitalFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** kg per hectare, whole: kg × 100 / ari. */
const kgPerHa = (kg: number, ari: number) => (ari > 0 ? Math.round((kg * 100) / ari) : 0);
const kgText = (kg: number) => `${String(kg).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kg`;
const campaign = (ctx: ReportContext, period: Period) => `${ctx.farmName} · Campania APIA ${period.key}`;

/* ---- Dovezile pentru sprijinul cuplat ---- */

export interface CoupledCrop {
  scheme: CoupledScheme;
  /** The farm's crops under the scheme this campaign, with their area. */
  crops: { name: string; ari: number }[];
  /** What the farmer noted as harvested and still stored (Recolte), in kg. Null: not noted. */
  harvestedKg: number | null;
  storedKg: number | null;
  /** Sales of the crops in the campaign, and seed bought for them. */
  sales: ReportRecord[];
  seeds: ReportRecord[];
}

function docTable(title: string, rows: ReportRecord[], empty: string): Section {
  return {
    kind: 'table',
    title,
    columns: [
      { label: 'Data', align: 'left', width: 0.16 },
      { label: 'Cu cine', align: 'left', width: 0.36 },
      { label: 'Document', align: 'left', width: 0.26 },
      { label: 'Suma (lei)', align: 'right', width: 0.22 },
    ],
    rows: rows.map((r) => ({ cells: [dayNumeric(r.date), r.counterparty ?? '', r.docNo ?? '', cell(Math.abs(r.amountBani))] })),
    empty,
  };
}

export function coupledProofReport(ctx: ReportContext, input: CoupledCrop[], period: Period): ReportModel {
  const missing: Missing[] = [];
  const sections: Section[] = [];
  for (const c of input) {
    const ari = c.crops.reduce((s, x) => s + x.ari, 0);
    const sold = c.harvestedKg === null ? null : Math.max(0, c.harvestedKg - (c.storedKg ?? 0));
    const min = c.scheme.minimum_kg_ha;
    const name = c.scheme.name_ro;
    if (c.harvestedKg === null) missing.push({ text: `${name}: cât ai recoltat. Notează recolta în Recolte.`, screen: 'recolte' });
    else if (min !== null && sold !== null && kgPerHa(sold, ari) < min)
      missing.push({ text: `${name}: ai vândut sau folosit ${kgText(kgPerHa(sold, ari))}/ha, APIA cere cel puțin ${kgText(min)}/ha.` });
    if (!c.seeds.length) missing.push({ text: `${name}: factura de sămânță certificată.`, screen: 'recolte' });
    if (!c.sales.length) missing.push({ text: `${name}: facturile sau bonurile pentru ce ai vândut (sau nota de recepție, dacă ai folosit-o la animale).`, screen: 'recolte' });
    else {
      const noDoc = c.sales.filter((r) => !r.docNo).length;
      if (noDoc) missing.push({ text: `${name}: numărul documentului la ${noDoc === 1 ? 'o vânzare' : `${noDoc} vânzări`}.`, screen: 'recolte' });
    }
    sections.push(
      {
        kind: 'facts',
        title: `${name} (${c.scheme.id})`,
        rows: [
          { label: 'Suprafața', value: hectares(ari) },
          { label: 'Recoltat', value: c.harvestedKg === null ? 'nenotat' : `${kgText(c.harvestedKg)} (${kgText(kgPerHa(c.harvestedKg, ari))}/ha)` },
          ...(sold !== null ? [{ label: 'Vândut sau folosit (recoltat minus ce e în magazie)', value: `${kgText(sold)} (${kgText(kgPerHa(sold, ari))}/ha)`, strong: true }] : []),
          { label: 'Ce cere APIA', value: min === null ? 'de verificat' : `cel puțin ${kgText(min)}/ha` },
          { label: 'Depui dovezile până pe', value: `${dayWords(c.scheme.deadline)}${c.scheme.deadline_status === 'DE-VERIFICAT' ? ' (de verificat)' : ''}` },
        ],
      },
      docTable(`${name}: vânzările`, c.sales, 'Nicio vânzare notată.'),
      docTable(`${name}: sămânța`, c.seeds, 'Nicio cheltuială pe sămânță notată.'),
    );
  }
  return {
    ...header(ctx, 'apia-coupled', period, 'sprijin-cuplat'),
    subtitle: campaign(ctx, period),
    sections: sections.length ? sections : [{ kind: 'facts', title: 'Pe scurt', rows: [{ label: 'Culturi cu sprijin cuplat în campania asta', value: 'niciuna' }] }],
    missing,
    signature: true,
    notes: [
      ...input.map((c) => `${c.scheme.name_ro}: ${c.scheme.minimum_ro} Duci: ${c.scheme.proof_ro.join('; ')}.`),
      'Vândut sau folosit e socotit din ce ai notat ca recoltat și ce mai ai în magazie. APIA se uită la facturi, bonuri și note de recepție, nu la cifra asta.',
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Caietul eco-schemei pentru teren arabil (PD-04) ---- */

export interface EcoParcel {
  name: string;
  crop: string;
  /** The diversification key: two lines of the same crop count once. */
  cropKey: string;
  ari: number;
  sownOn: string | null;
  harvestedOn: string | null;
  /** What covers the land after harvest (a second crop, stubble), if noted. */
  cover: string | null;
  soilWork: string[];
}

export interface EcoRules {
  /** The least arable land the scheme takes, in ari. */
  minArableAri: number | null;
  /** Distinct crops needed, up to `cropsUpToAri` of arable land. */
  minCrops: number | null;
  cropsUpToAri: number | null;
  parcelMinAri: number | null;
}

export function ecoPd04Report(ctx: ReportContext, rows: EcoParcel[], rules: EcoRules, period: Period): ReportModel {
  const arable = rows.reduce((s, p) => s + p.ari, 0);
  const byKey = new Map<string, { name: string; ari: number }>();
  for (const p of rows) {
    const c = byKey.get(p.cropKey) ?? { name: p.crop, ari: 0 };
    c.ari += p.ari;
    byKey.set(p.cropKey, c);
  }
  const crops = [...byKey.values()].sort((a, b) => b.ari - a.ari);
  const pct = (ari: number) => (arable ? `${Math.round((ari * 100) / arable)}%` : '');
  const missing: Missing[] = [];
  if (!rows.length) missing.push({ text: 'Nicio parcelă de teren arabil în anul ăsta. Pune parcelele pe Hartă.', screen: 'harta' });
  if (rules.minArableAri !== null && arable && arable < rules.minArableAri)
    missing.push({ text: `Ai ${hectares(arable)} teren arabil; eco-schema cere cel puțin ${hectares(rules.minArableAri)}.` });
  if (rules.minCrops !== null && rows.length && crops.length < rules.minCrops && (rules.cropsUpToAri === null || arable <= rules.cropsUpToAri))
    missing.push({ text: `Ai ${crops.length === 1 ? 'o singură cultură' : `${crops.length} culturi`}; eco-schema cere cel puțin ${rules.minCrops}.` });
  const small = rules.parcelMinAri === null ? 0 : rows.filter((p) => p.ari < rules.parcelMinAri!).length;
  if (small) missing.push({ text: `${capitalFirst(parcels(small))} sub ${hectares(rules.parcelMinAri!)}: nu intră în eco-schemă.` });
  const noSowing = rows.filter((p) => !p.sownOn).length;
  if (noSowing) missing.push({ text: `${capitalFirst(parcels(noSowing))} fără data semănatului.`, screen: 'harta' });
  const bare = rows.filter((p) => p.harvestedOn && !p.cover).length;
  if (bare) missing.push({ text: `${capitalFirst(parcels(bare))} recoltate, fără ce acoperă terenul după (cultură secundară sau miriște).` });

  return {
    ...header(ctx, 'apia-eco-pd04', period, 'eco-schema-pd04'),
    subtitle: campaign(ctx, period),
    sections: [
      {
        kind: 'facts',
        title: 'Pe scurt',
        rows: [
          { label: 'Teren arabil', value: hectares(arable), strong: true },
          { label: 'Culturi diferite', value: String(crops.length) },
          ...(rules.minCrops !== null
            ? [{ label: 'Diversificarea cerută', value: `cel puțin ${rules.minCrops} culturi${rules.cropsUpToAri !== null ? ` (până la ${hectares(rules.cropsUpToAri)})` : ''}` }]
            : []),
        ],
      },
      {
        kind: 'table',
        title: 'Diversificarea culturilor',
        columns: [
          { label: 'Cultura', align: 'left', width: 0.6 },
          { label: 'Suprafața', align: 'right', width: 0.22 },
          { label: 'Din arabil', align: 'right', width: 0.18 },
        ],
        rows: crops.map((c) => ({ cells: [c.name, hectares(c.ari), pct(c.ari)] })),
        empty: 'Nicio cultură.',
      },
      {
        kind: 'table',
        title: 'Pe parcele',
        columns: [
          { label: 'Parcela', align: 'left', width: 0.19 },
          { label: 'Cultura', align: 'left', width: 0.17 },
          { label: 'Suprafața', align: 'right', width: 0.11 },
          { label: 'Semănat', align: 'left', width: 0.11 },
          { label: 'Lucrări de sol', align: 'left', width: 0.17 },
          { label: 'Recoltat', align: 'left', width: 0.11 },
          { label: 'Acoperit după', align: 'left', width: 0.14 },
        ],
        rows: rows.map((p) => ({
          cells: [p.name, p.crop, hectares(p.ari), p.sownOn ? dayNumeric(p.sownOn) : '', p.soilWork.map(dayNumeric).join(', '), p.harvestedOn ? dayNumeric(p.harvestedOn) : '', p.cover ?? (p.harvestedOn ? '' : 'cultura în câmp')],
        })),
        empty: 'Nicio parcelă.',
      },
    ],
    missing,
    notes: [
      'Caietul îl ții la fermă și îl arăți la control. Cerințele sunt din lista de subvenții a aplicației; cele pentru peste 30 ha sunt încă de verificat.',
      'O cultură încă în câmp acoperă terenul. După recoltare, notează de mână cultura secundară sau miriștea lăsată.',
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Planul și registrul de fertilizare ---- */

export interface FertPlanRow {
  crop: string;
  ari: number;
  /** Confirmed limit (nitrogen-limits.json); null when it isn't confirmed. */
  limitKgHa: number | null;
}

export interface FertRow {
  onDate: string | null;
  parcel: string;
  crop: string;
  product: string | null;
  dose: string | null;
  ari: number | null;
}

export function fertilizerRegisterReport(ctx: ReportContext, plan: FertPlanRow[], rows: FertRow[], period: Period): ReportModel {
  const missing: Missing[] = [];
  const noProduct = rows.filter((r) => !r.product).length;
  const noDose = rows.filter((r) => !r.dose).length;
  if (noProduct) missing.push({ text: `${noProduct === 1 ? 'O fertilizare' : `${noProduct} fertilizări`} fără produs.`, screen: 'harta' });
  if (noDose) missing.push({ text: `${noDose === 1 ? 'O fertilizare' : `${noDose} fertilizări`} fără doză.`, screen: 'harta' });
  for (const p of plan.filter((x) => x.limitKgHa === null)) missing.push({ text: `${p.crop}: limita de azot nu e confirmată; scrie doza planificată de mână.` });
  return {
    ...header(ctx, 'fertilizer-register', period, 'fertilizare'),
    sections: [
      {
        kind: 'table',
        title: 'Planul de fertilizare: cel mult cât azot dă legea',
        columns: [
          { label: 'Cultura', align: 'left', width: 0.34 },
          { label: 'Suprafața', align: 'right', width: 0.18 },
          { label: 'Azot maxim (kg N/ha)', align: 'right', width: 0.24 },
          { label: 'Azot maxim pe cultură', align: 'right', width: 0.24 },
        ],
        rows: plan.map((p) => ({ cells: [p.crop, hectares(p.ari), p.limitKgHa === null ? '' : String(p.limitKgHa), p.limitKgHa === null ? '' : kgText(Math.round((p.limitKgHa * p.ari) / 100))] })),
        empty: 'Nicio cultură în anul ăsta.',
      },
      {
        kind: 'table',
        title: 'Registrul fertilizărilor',
        columns: [
          { label: 'Nr.', align: 'right', width: 0.05 },
          { label: 'Data', align: 'left', width: 0.12 },
          { label: 'Parcela', align: 'left', width: 0.2 },
          { label: 'Cultura', align: 'left', width: 0.15 },
          { label: 'Produsul', align: 'left', width: 0.2 },
          { label: 'Doza', align: 'left', width: 0.14 },
          { label: 'Suprafața', align: 'right', width: 0.14 },
        ],
        rows: rows.map((r, i) => ({ cells: [String(i + 1), r.onDate ? dayNumeric(r.onDate) : 'fără dată', r.parcel, r.crop, r.product ?? '', r.dose ?? '', r.ari ? hectares(r.ari) : ''] })),
        empty: 'Nicio fertilizare notată ca făcută în perioada asta.',
      },
    ],
    missing,
    notes: [
      'Limitele sunt din Programul de acțiune pentru nitrați (obligatoriu în toată țara din 2021): azot chimic, fără studiu agrochimic, pe pantă sub 12%. Gunoiul de grajd: cel mult 170 kg N/ha pe an.',
      'Fertilizările sunt lucrările de pe hartă notate ca făcute. Suprafața e a parcelei întregi.',
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Notificarea către APIA (forță majoră sau o schimbare) ---- */

export interface NoticeParcel {
  bloc: string | null;
  parcelNo: string | null;
  crop: string;
  ari: number;
}

export function noticeReport(ctx: ReportContext, rows: NoticeParcel[], what: string, period: Period): ReportModel {
  const text = what.trim();
  return {
    ...header(ctx, 'apia-notice', period, 'notificare-apia'),
    subtitle: campaign(ctx, period),
    sections: [
      { kind: 'facts', title: 'Ce s-a întâmplat', rows: [{ label: text || '(de completat)', value: '' }] },
      {
        kind: 'table',
        title: 'Parcelele din cerere',
        columns: [
          { label: 'Bloc fizic', align: 'left', width: 0.16 },
          { label: 'Parcela', align: 'left', width: 0.12 },
          { label: 'Cultura', align: 'left', width: 0.32 },
          { label: 'Suprafața', align: 'right', width: 0.16 },
          { label: 'Afectat (ha)', align: 'right', width: 0.24 },
        ],
        rows: rows.map((p) => ({ cells: [p.bloc ?? '', p.parcelNo ?? '', p.crop, hectares(p.ari), ''] })),
        empty: 'Nicio parcelă.',
      },
    ],
    missing: [
      { text: 'Centrul APIA, numele, CNP-ul (sau CUI) și ID-ul de fermier din cerere.' },
      { text: 'Ziua în care s-a întâmplat și suprafața afectată pe fiecare parcelă.' },
      ...(text ? [] : [{ text: 'Ce s-a întâmplat: scrie pe card înainte să faci PDF-ul, sau de mână.' }]),
    ],
    signature: true,
    notes: [
      'Forța majoră (secetă, grindină, inundație, boală a animalelor): în 15 zile lucrătoare de când poți, în scris, cu dovezile (proces-verbal de la primărie, adeverință de la ANM, poze).',
      'O schimbare a datelor din cerere: în 15 zile calendaristice.',
      'Duci notificarea la centrul APIA și ceri număr de înregistrare pe copia ta.',
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Ce duci la APIA (lista) ---- */

export function checklistReport(ctx: ReportContext, filings: Filing[], period: Period): ReportModel {
  const due = filings.filter((f) => f.section === 'next' || f.section === 'maybe');
  return {
    ...header(ctx, 'apia-checklist', period, 'ce-duci-la-apia'),
    subtitle: campaign(ctx, period),
    sections: due.length
      ? due.map((f) => ({
          kind: 'table' as const,
          title: `${f.paper.title_ro}${f.deadline ? `, până pe ${dayWords(f.deadline.end)}` : ''}${f.section === 'maybe' ? ' (dacă ți se aplică)' : ''}`,
          columns: [
            { label: 'Bifă', align: 'left' as const, width: 0.1 },
            { label: 'Ce duci', align: 'left' as const, width: 0.9 },
          ],
          rows: (f.paper.documents_ro.length ? f.paper.documents_ro : [f.paper.about_ro]).map((d) => ({ cells: ['', d] })),
          empty: '',
        }))
      : [{ kind: 'facts', title: 'Pe scurt', rows: [{ label: 'Nimic de dus acum', value: '' }] }],
    notes: [
      'Bifează pe hârtie ce ai pregătit. Lista e făcută din ce știe aplicația despre fermă; hârtiile care depind de animale sau de sprijinul cuplat sunt trecute „dacă ți se aplică”.',
      ...commonNotes(ctx),
    ],
  };
}
