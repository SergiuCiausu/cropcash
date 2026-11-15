/* The reports, worded. Sums come from packages/shared/src/reports; the farm's figures from the same
   view the pages read (inputs.ts), so a report never says something the screen doesn't. */
import {
  fuelLines,
  ledgerOf,
  subsidiesOf,
  type ExpectedSubsidy,
  type FuelExcise,
  type GroupKey,
  type LandRow,
  type Period,
  type PeriodKind,
  type ReportRecord,
  type TreatmentRow,
} from '../../../packages/shared/src/reports/index';
import { cell, dayNumeric, dayWords, hectares, leiCents, leiWhole, litres } from './format';
import type { Audience, ReportContext, ReportModel, Section, TableRow } from './model';

export type ReportId = 'farm-summary' | 'ledger' | 'subsidies' | 'crop-margins' | 'fuel-excise' | 'phyto-register' | 'land-summary';

export interface ReportDef {
  id: ReportId;
  audiences: Audience[];
  title: string;
  /** One line under the title in the list. */
  about: string;
  /** The first is the one picked when the report is opened. */
  periods: PeriodKind[];
}

export const REPORTS: ReportDef[] = [
  { id: 'farm-summary', audiences: ['farmer'], title: 'Rezumatul fermei', about: 'Cât a intrat, cât a ieșit, salariul tău și ce urmează.', periods: ['harvest'] },
  { id: 'ledger', audiences: ['accountant'], title: 'Registrul încasărilor și plăților', about: 'Fiecare vânzare, cheltuială și plată APIA, cu totaluri pe lună și pe categorie.', periods: ['quarter', 'month', 'year', 'harvest'] },
  { id: 'subsidies', audiences: ['farmer', 'accountant'], title: 'Situația subvențiilor APIA', about: 'Ce ai primit de la APIA și ce mai urmează.', periods: ['harvest', 'year'] },
  { id: 'crop-margins', audiences: ['farmer', 'accountant'], title: 'Cât a rămas pe fiecare cultură', about: 'Intrat, ieșit și rămas pe cultură și pe hectar.', periods: ['harvest'] },
  { id: 'fuel-excise', audiences: ['accountant', 'farmer'], title: 'Motorina și acciza de recuperat', about: 'Litrii de motorină cumpărați și cât poți primi înapoi din acciză.', periods: ['quarter', 'year'] },
  { id: 'phyto-register', audiences: ['institution', 'farmer'], title: 'Registrul tratamentelor', about: 'Erbicidele, fungicidele și insecticidele date, pe parcele.', periods: ['harvest', 'year'] },
  { id: 'land-summary', audiences: ['institution', 'farmer'], title: 'Terenul și culturile', about: 'Parcelele, ce e pe ele și suprafețele, pentru primărie sau APIA.', periods: ['harvest'] },
];

export const PERIOD_KIND_NAMES: Record<PeriodKind, string> = { month: 'Lună', quarter: 'Trimestru', year: 'An', harvest: 'Recoltă' };

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const SHORT = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];

const monthName = (key: string) => `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;

/** "martie 2026", "trimestrul 3 din 2026 (iul.–sept.)", "anul 2026", "Recolta 2026 (nov. 2025 – oct. 2026)". */
export function periodLabel(p: Period): string {
  const y = p.key.slice(0, 4);
  if (p.kind === 'month') return monthName(p.key);
  if (p.kind === 'quarter') {
    const first = +p.start.slice(5, 7) - 1;
    return `trimestrul ${p.key.slice(6)} din ${y} (${SHORT[first]}–${SHORT[first + 2]})`;
  }
  if (p.kind === 'year') return `anul ${y}`;
  return `Recolta ${y} (nov. ${+y - 1} – oct. ${y})`;
}

/** For file names: "2026-03", "2026-T3", "2026", "recolta-2026". */
const periodSlug = (p: Period) => (p.kind === 'quarter' ? p.key.replace('-Q', '-T') : p.kind === 'harvest' ? `recolta-${p.key}` : p.key);

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---- Common parts ---- */

function header(ctx: ReportContext, id: ReportId, period: Period, slug: string): Pick<ReportModel, 'id' | 'audience' | 'title' | 'subtitle' | 'meta' | 'watermark' | 'fileName'> {
  const def = REPORTS.find((r) => r.id === id)!;
  return {
    id,
    audience: def.audiences[0],
    title: def.title,
    subtitle: `${ctx.farmName} · ${capital(periodLabel(period))}`,
    meta: [
      ['Ferma', `${ctx.farmName}, județul ${ctx.county}`],
      ['Suprafața', ctx.farmSummary],
      ['Perioada', `${dayNumeric(period.start)} – ${dayNumeric(period.end)}`],
      ['Generat', dayWords(ctx.today)],
    ],
    watermark: ctx.example ? 'EXEMPLU' : null,
    fileName: `cropcash-${slug}-${periodSlug(period)}`,
  };
}

function commonNotes(ctx: ReportContext): string[] {
  return [
    ...(ctx.example ? ['Ferma lui Ion e un exemplu. Cifrele nu sunt ale unei ferme reale.'] : []),
    ...(ctx.staleSince ? [`Datele sunt din ${dayWords(ctx.staleSince)}. Ce s-a întâmplat după nu apare aici.`] : []),
    `Generat de CropCash pe ${dayWords(ctx.today)}, din datele de pe telefon. Nu este un document oficial.`,
  ];
}

/** What a record is, in two parts: its type and the detail beside it. */
function recordWords(ctx: ReportContext, r: ReportRecord): [string, string] {
  const via = r.fixed ? ' (prin cont)' : '';
  const crop = r.cropId ? ctx.cropName(r.cropId).toLowerCase() : '';
  if (r.kind === 'sale') return ['Vânzare', `${crop || 'fără cultură'}${via}`];
  if (r.kind === 'apia_advance') return ['Subvenție APIA', `avans${via}`];
  if (r.kind === 'apia_balance') return ['Subvenție APIA', `restul${via}`];
  const category = ctx.categoryName(r.category) ?? 'fără categorie';
  return ['Cheltuială', `${category}${crop ? `, ${crop}` : ''}${via}`];
}

function groupName(ctx: ReportContext, key: GroupKey): string {
  if (key.kind === 'apia') return 'Subvenții APIA';
  if (key.kind === 'sale') return key.cropId ? `Vânzări ${ctx.cropName(key.cropId).toLowerCase()}` : 'Vânzări fără cultură';
  return ctx.categoryName(key.category) ?? 'Cheltuieli fără categorie';
}

/* ---- Registrul încasărilor și plăților (for the accountant) ---- */

export function ledgerReport(ctx: ReportContext, records: ReportRecord[], period: Period): ReportModel {
  const l = ledgerOf(records);
  const subtotals = period.kind !== 'month' && l.months.length > 1;
  /* The document column only when something was noted in it (migration 027), so old registers keep their room. */
  const docs = l.rows.some((r) => r.docNo || r.counterparty);
  const docCell = (r: ReportRecord | null) => (docs ? [r ? [r.docNo, r.counterparty].filter(Boolean).join(' · ') : ''] : []);
  const rows: TableRow[] = [];
  let n = 0;
  for (const m of l.months) {
    for (const r of m.rows) {
      const [type, detail] = recordWords(ctx, r);
      rows.push({ cells: [String(++n), dayNumeric(r.date), type, detail, ...docCell(r), cell(Math.max(r.amountBani, 0)), cell(Math.max(-r.amountBani, 0))] });
    }
    if (subtotals) rows.push({ tone: 'subtotal', cells: ['', '', '', `Total ${monthName(m.key)}`, ...docCell(null), cell(m.inBani), cell(m.outBani)] });
  }
  if (l.rows.length) rows.push({ tone: 'total', cells: ['', '', '', 'Total perioadă', ...docCell(null), cell(l.inBani), cell(l.outBani)] });

  const sections: Section[] = [
    {
      kind: 'facts',
      title: 'Totaluri',
      rows: [
        { label: 'Încasări', value: leiCents(l.inBani) },
        { label: 'Plăți', value: leiCents(l.outBani) },
        { label: 'Diferența', value: leiCents(l.inBani - l.outBani), strong: true },
        { label: 'Înregistrări', value: String(l.rows.length) },
      ],
    },
    {
      kind: 'table',
      title: 'Pe categorii',
      columns: [
        { label: 'Categoria', align: 'left', width: 0.52 },
        { label: 'Încasări (lei)', align: 'right', width: 0.24 },
        { label: 'Plăți (lei)', align: 'right', width: 0.24 },
      ],
      rows: [
        ...l.groups.map((g) => ({ cells: [groupName(ctx, g.key), cell(g.inBani), cell(g.outBani)] })),
        ...(l.groups.length ? [{ tone: 'total' as const, cells: ['Total', cell(l.inBani), cell(l.outBani)] }] : []),
      ],
      empty: 'Nicio înregistrare în perioada asta.',
    },
    {
      kind: 'table',
      title: 'Înregistrări',
      columns: [
        ...(docs
          ? [
              { label: 'Nr.', align: 'right' as const, width: 0.05 },
              { label: 'Data', align: 'left' as const, width: 0.12 },
              { label: 'Tipul', align: 'left' as const, width: 0.14 },
              { label: 'Detalii', align: 'left' as const, width: 0.21 },
              { label: 'Document', align: 'left' as const, width: 0.2 },
              { label: 'Încasare (lei)', align: 'right' as const, width: 0.14 },
              { label: 'Plată (lei)', align: 'right' as const, width: 0.14 },
            ]
          : [
              { label: 'Nr.', align: 'right' as const, width: 0.06 },
              { label: 'Data', align: 'left' as const, width: 0.13 },
              { label: 'Tipul', align: 'left' as const, width: 0.18 },
              { label: 'Detalii', align: 'left' as const, width: 0.31 },
              { label: 'Încasare (lei)', align: 'right' as const, width: 0.16 },
              { label: 'Plată (lei)', align: 'right' as const, width: 0.16 },
            ]),
      ],
      rows,
      empty: 'Nicio vânzare, cheltuială sau plată APIA notată în perioada asta.',
    },
  ];
  return {
    ...header(ctx, 'ledger', period, 'registru'),
    sections,
    notes: [
      'Sumele sunt cele notate de fermier în CropCash și cele intrate prin contul CropCash (marcate „prin cont”). Fiecare sumă se verifică pe documentul justificativ (factură, chitanță, ordin de plată).',
      ...(period.kind === 'harvest' ? ['O recoltă cuprinde și cheltuielile făcute pentru culturile ei înainte de 1 noiembrie (de exemplu, sămânța de grâu semănat în octombrie).'] : []),
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Situația subvențiilor APIA ---- */

export function subsidiesReport(ctx: ReportContext, records: ReportRecord[], expected: ExpectedSubsidy[], period: Period, decisionBani: number | null): ReportModel {
  const s = subsidiesOf(records, expected, period, ctx.today);
  const which = (kind: string) => (kind === 'apia_advance' ? 'Avansul' : 'Restul');
  const when = (e: ExpectedSubsidy) => (e.window ? `${dayNumeric(e.window.start)} – ${dayNumeric(e.window.end)}` : dayNumeric(e.date));
  const flags = (e: ExpectedSubsidy) => [e.estimated ? 'dată estimată' : '', e.unverified ? 'sumă de verificat' : ''].filter(Boolean).join(', ');
  return {
    ...header(ctx, 'subsidies', period, 'subventii'),
    sections: [
      {
        kind: 'facts',
        title: 'Pe scurt',
        rows: [
          ...(decisionBani !== null ? [{ label: 'Suma din decizia APIA', value: leiCents(decisionBani) }] : []),
          { label: 'Primit', value: leiCents(s.receivedBani), strong: true },
          { label: 'Încă de primit (estimat)', value: leiCents(s.upcomingBani) },
        ],
      },
      {
        kind: 'table',
        title: 'Primite',
        columns: [
          { label: 'Data', align: 'left', width: 0.25 },
          { label: 'Plata', align: 'left', width: 0.45 },
          { label: 'Suma (lei)', align: 'right', width: 0.3 },
        ],
        rows: [
          ...s.received.map((r) => ({ cells: [dayNumeric(r.date), `${which(r.kind)} de la APIA${r.fixed ? ' (prin cont)' : ''}`, cell(r.amountBani)] })),
          ...(s.received.length > 1 ? [{ tone: 'total' as const, cells: ['', 'Total', cell(s.receivedBani)] }] : []),
        ],
        empty: 'Nicio plată APIA primită în perioada asta.',
      },
      {
        kind: 'table',
        title: 'Ce mai urmează',
        columns: [
          { label: 'Plata', align: 'left', width: 0.22 },
          { label: 'Când', align: 'left', width: 0.3 },
          { label: 'Suma estimată (lei)', align: 'right', width: 0.24 },
          { label: 'Observații', align: 'left', width: 0.24 },
        ],
        rows: s.upcoming.map((e) => ({ cells: [which(e.kind), when(e), cell(e.amountBani), flags(e)] })),
        empty: 'Nicio plată APIA așteptată în restul perioadei.',
      },
    ],
    notes: [
      'Sumele de primit sunt estimate de CropCash din suprafețe și cursul euro, pentru un an obișnuit. Suma exactă e cea din decizia APIA.',
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Rezumatul fermei (for the farmer) ---- */

export interface SummaryInput {
  /** The harvest's records. */
  records: ReportRecord[];
  parcels: { cropId: string; areaAri: number }[];
  /** "Plan și realitate", as the page shows it (FarmView.compare). */
  compare: { label: string; planned: number; real: number }[];
  closed: boolean;
  salaryBani: number;
  pensionBani: number;
  /** The next sums in the plan, from today on. */
  upcoming: { date: string; title: string; amountBani: number; direction: 'in' | 'out' }[];
}

export function farmSummaryReport(ctx: ReportContext, input: SummaryInput, period: Period): ReportModel {
  const l = ledgerOf(input.records);
  const totalAri = input.parcels.reduce((s, p) => s + p.areaAri, 0);
  const spent = l.groups.filter((g) => g.outBani > 0);
  const earned = l.groups.filter((g) => g.inBani > 0);
  return {
    ...header(ctx, 'farm-summary', period, 'rezumat'),
    sections: [
      {
        kind: 'facts',
        title: 'Pe scurt',
        rows: [
          { label: 'Salariul tău pe lună', value: leiWhole(input.salaryBani), strong: true },
          ...(input.pensionBani ? [{ label: 'Pui deoparte pentru pensie, pe lună', value: leiWhole(input.pensionBani) }] : []),
          { label: 'A intrat până acum', value: leiWhole(l.inBani) },
          { label: 'A ieșit până acum', value: leiWhole(l.outBani) },
          { label: 'Diferența', value: leiWhole(l.inBani - l.outBani) },
        ],
      },
      {
        kind: 'table',
        title: 'Culturile',
        columns: [
          { label: 'Cultura', align: 'left', width: 0.6 },
          { label: 'Suprafața', align: 'right', width: 0.4 },
        ],
        rows: [
          ...input.parcels.map((p) => ({ cells: [ctx.cropName(p.cropId), hectares(p.areaAri)] })),
          ...(input.parcels.length > 1 ? [{ tone: 'total' as const, cells: ['Toată ferma', hectares(totalAri)] }] : []),
        ],
        empty: 'Nicio cultură.',
      },
      {
        kind: 'table',
        title: 'Plan și realitate',
        columns: [
          { label: '', align: 'left', width: 0.4 },
          { label: 'Plănuit', align: 'right', width: 0.3 },
          { label: 'Până acum', align: 'right', width: 0.3 },
        ],
        rows: input.compare.map((r) => ({ cells: [r.label, leiWhole(r.planned), leiWhole(r.real)] })),
        empty: '',
      },
      {
        kind: 'table',
        title: 'De unde au venit banii',
        columns: [
          { label: '', align: 'left', width: 0.6 },
          { label: 'Suma', align: 'right', width: 0.4 },
        ],
        rows: earned.map((g) => ({ cells: [groupName(ctx, g.key), leiWhole(g.inBani)] })),
        empty: 'Nu ai notat încă nicio vânzare și nu a venit nimic de la APIA.',
      },
      {
        kind: 'table',
        title: 'Pe ce s-au dus banii',
        columns: [
          { label: '', align: 'left', width: 0.6 },
          { label: 'Suma', align: 'right', width: 0.4 },
        ],
        rows: spent.map((g) => ({ cells: [groupName(ctx, g.key), leiWhole(g.outBani)] })),
        empty: 'Nu ai notat încă nicio cheltuială.',
      },
      {
        kind: 'table',
        title: 'Ce urmează',
        columns: [
          { label: 'Când', align: 'left', width: 0.22 },
          { label: 'Ce', align: 'left', width: 0.5 },
          { label: 'Suma', align: 'right', width: 0.28 },
        ],
        rows: input.upcoming.map((u) => ({ cells: [dayWords(u.date), u.title, `${u.direction === 'out' ? '−' : '+'}${leiWhole(u.amountBani)}`] })),
        empty: 'Nimic plănuit în perioada următoare.',
      },
    ],
    notes: [
      'Ce e plănuit e socotit pentru un an obișnuit, cu cifrele tale unde le-ai pus și cu media noastră în rest.',
      ...(input.closed ? [] : ['Recolta e încă în lucru: „Până acum” arată doar ce s-a întâmplat deja.']),
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Cât a rămas pe fiecare cultură ---- */

export interface CropMarginInput {
  cropId: string;
  areaAri: number;
  inBani: number;
  outBani: number;
  closed: boolean;
}

export function cropMarginsReport(ctx: ReportContext, crops: CropMarginInput[], whole: { inBani: number; outBani: number; areaAri: number }, period: Period): ReportModel {
  const perHa = (bani: number, ari: number) => (ari ? leiWhole(Math.round((bani * 100) / ari)) : '');
  const anyOpen = crops.some((c) => !c.closed);
  return {
    ...header(ctx, 'crop-margins', period, 'culturi'),
    sections: [
      {
        kind: 'table',
        title: 'Pe culturi',
        columns: [
          { label: 'Cultura', align: 'left', width: 0.2 },
          { label: 'Suprafața', align: 'right', width: 0.12 },
          { label: 'Intrat', align: 'right', width: 0.15 },
          { label: 'Ieșit', align: 'right', width: 0.15 },
          { label: 'Rămas', align: 'right', width: 0.15 },
          { label: 'Rămas pe ha', align: 'right', width: 0.12 },
          { label: 'Stare', align: 'left', width: 0.11 },
        ],
        rows: [
          ...crops.map((c) => ({
            cells: [ctx.cropName(c.cropId), hectares(c.areaAri), leiWhole(c.inBani), leiWhole(c.outBani), leiWhole(c.inBani - c.outBani), perHa(c.inBani - c.outBani, c.areaAri), c.closed ? 'încheiată' : 'în lucru'],
          })),
          ...(crops.length
            ? [{ tone: 'total' as const, cells: ['Toată ferma', hectares(whole.areaAri), leiWhole(whole.inBani), leiWhole(whole.outBani), leiWhole(whole.inBani - whole.outBani), perHa(whole.inBani - whole.outBani, whole.areaAri), ''] }]
            : []),
        ],
        empty: 'Nicio cultură în recolta asta.',
      },
    ],
    notes: [
      'Subvenția APIA și ce nu e pus pe o cultură anume sunt împărțite după hectare.',
      ...(anyOpen ? ['La o cultură în lucru, cheltuielile comune nu sunt încă împărțite: ele apar doar în rândul „Toată ferma”, așa că rândurile pot să nu adune cât totalul.'] : []),
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Motorina și acciza de recuperat ---- */

export function fuelExciseReport(ctx: ReportContext, records: ReportRecord[], rate: FuelExcise, period: Period): ReportModel {
  const f = fuelLines(records, rate);
  const perLitre = `${(rate.refund_bani_per_10_l.value / 1000).toFixed(3).replace('.', ',')} lei pe litru`;
  const unverified = rate.refund_bani_per_10_l.status === 'DE-VERIFICAT';
  return {
    ...header(ctx, 'fuel-excise', period, 'motorina'),
    sections: [
      {
        kind: 'facts',
        title: 'Pe scurt',
        rows: [
          { label: 'Litri de motorină', value: litres(f.litresCl) },
          { label: 'Plătit pe ei', value: leiCents(f.paidBani) },
          { label: `Acciză de primit înapoi (${perLitre})`, value: leiCents(f.refundBani), strong: true },
          ...(f.missing.length ? [{ label: 'Cheltuieli pe motorină fără litri', value: String(f.missing.length) }] : []),
        ],
      },
      {
        kind: 'table',
        title: 'Facturile și bonurile',
        columns: [
          { label: 'Nr.', align: 'right', width: 0.06 },
          { label: 'Data', align: 'left', width: 0.13 },
          { label: 'Document', align: 'left', width: 0.18 },
          { label: 'Furnizor', align: 'left', width: 0.21 },
          { label: 'Litri', align: 'right', width: 0.12 },
          { label: 'Plătit (lei)', align: 'right', width: 0.15 },
          { label: 'Acciză (lei)', align: 'right', width: 0.15 },
        ],
        rows: [
          ...f.lines.map((l, i) => ({
            cells: [String(i + 1), dayNumeric(l.record.date), l.record.docNo ?? '', l.record.counterparty ?? '', litres(l.record.fuelLitersCl!), cell(-l.record.amountBani), cell(l.refundBani)],
          })),
          ...(f.lines.length ? [{ tone: 'total' as const, cells: ['', '', '', 'Total', litres(f.litresCl), cell(f.paidBani), cell(f.refundBani)] }] : []),
        ],
        empty: 'Nicio cheltuială pe motorină cu litri notați în perioada asta.',
      },
      ...(f.missing.length
        ? [
            {
              kind: 'table' as const,
              title: 'De completat: motorină fără litri',
              columns: [
                { label: 'Data', align: 'left' as const, width: 0.2 },
                { label: 'Document', align: 'left' as const, width: 0.3 },
                { label: 'Plătit (lei)', align: 'right' as const, width: 0.2 },
                { label: 'Litri', align: 'left' as const, width: 0.3 },
              ],
              rows: f.missing.map((r) => ({ cells: [dayNumeric(r.date), r.docNo ?? '', cell(-r.amountBani), 'lipsă'] })),
              empty: '',
            },
          ]
        : []),
    ],
    notes: [
      `Acciza e socotită cu ${perLitre}${unverified ? ', o cifră încă de verificat' : ''}. Suma de primit e o estimare: cea exactă se stabilește la depunerea cererii, pe baza facturilor.`,
      'Intră doar cheltuielile pe motorină la care s-au notat litrii. Cele fără litri sunt în tabelul „De completat”.',
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Registrul tratamentelor ---- */

const TREATMENT_NAMES: Record<string, string> = { herbicide: 'Erbicid', fungicide: 'Fungicid', insecticide: 'Insecticid' };

/** As /harta names a parcel (components/plots/plot-text.ts), without pulling the map's code into the PDF. */
function parcelName(p: LandRow['plot'] | null): string {
  if (!p) return 'Parcelă ștearsă';
  if (p.name) return p.name;
  if (p.bloc_fizic) return p.parcel_no ? `Bloc ${p.bloc_fizic} · parcela ${p.parcel_no}` : `Bloc ${p.bloc_fizic}`;
  if (p.parcel_no) return `Parcela ${p.parcel_no}`;
  return 'Parcelă fără nume';
}

export function phytoRegisterReport(ctx: ReportContext, rows: TreatmentRow[], period: Period): ReportModel {
  return {
    ...header(ctx, 'phyto-register', period, 'tratamente'),
    sections: [
      {
        kind: 'table',
        title: 'Tratamente făcute',
        columns: [
          { label: 'Nr.', align: 'right', width: 0.05 },
          { label: 'Data', align: 'left', width: 0.12 },
          { label: 'Parcela', align: 'left', width: 0.17 },
          { label: 'Cultura', align: 'left', width: 0.12 },
          { label: 'Tipul', align: 'left', width: 0.11 },
          { label: 'Produsul', align: 'left', width: 0.17 },
          { label: 'Doza', align: 'left', width: 0.11 },
          { label: 'Suprafața', align: 'right', width: 0.15 },
        ],
        rows: rows.map((r, i) => ({
          cells: [
            String(i + 1),
            r.operation.on_date ? dayNumeric(r.operation.on_date) : 'fără dată',
            parcelName(r.plot),
            r.season?.crop_id ? ctx.cropName(r.season.crop_id) : '',
            TREATMENT_NAMES[r.operation.kind] ?? r.operation.kind,
            r.operation.product ?? '',
            r.operation.dose ?? '',
            r.season?.area_ari ? hectares(r.season.area_ari) : '',
          ],
        })),
        empty: 'Niciun tratament notat ca făcut în perioada asta.',
      },
    ],
    notes: [
      'Sunt lucrările de pe hartă notate ca făcute. Suprafața e a parcelei întregi în anul ei.',
      'Verifică ce alte rubrici cere modelul oficial de registru și completează-le de pe etichetele produselor.',
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Terenul și culturile ---- */

const LAND_USES: Record<string, string> = { TA: 'teren arabil', PP: 'pajiște permanentă', CP: 'culturi permanente', VI: 'vie', LI: 'livadă' };

export interface LandInput {
  /** The parcels on the map in that year. Empty when the farm has none placed. */
  rows: LandRow[];
  /** Hectares per crop: from the map, or the harvest's own when nothing is on the map. */
  crops: { cropId: string | null; ari: number }[];
}

export function landSummaryReport(ctx: ReportContext, input: LandInput, period: Period): ReportModel {
  const total = input.crops.reduce((s, c) => s + c.ari, 0);
  const cropName = (id: string | null) => (id ? ctx.cropName(id) : 'fără cultură');
  return {
    ...header(ctx, 'land-summary', period, 'teren'),
    sections: [
      {
        kind: 'table',
        title: 'Pe culturi',
        columns: [
          { label: 'Cultura', align: 'left', width: 0.6 },
          { label: 'Suprafața', align: 'right', width: 0.4 },
        ],
        rows: [
          ...input.crops.map((c) => ({ cells: [cropName(c.cropId), hectares(c.ari)] })),
          ...(input.crops.length > 1 ? [{ tone: 'total' as const, cells: ['Total', hectares(total)] }] : []),
        ],
        empty: 'Nicio cultură în anul ăsta.',
      },
      ...(input.rows.length
        ? [
            {
              kind: 'table' as const,
              title: 'Pe parcele',
              columns: [
                { label: 'Nr.', align: 'right' as const, width: 0.06 },
                { label: 'Parcela', align: 'left' as const, width: 0.24 },
                { label: 'Bloc fizic', align: 'left' as const, width: 0.13 },
                { label: 'Nr. parcelă', align: 'left' as const, width: 0.12 },
                { label: 'Folosința', align: 'left' as const, width: 0.16 },
                { label: 'Cultura', align: 'left' as const, width: 0.15 },
                { label: 'Suprafața', align: 'right' as const, width: 0.14 },
              ],
              rows: input.rows.map((r, i) => ({
                cells: [
                  String(i + 1),
                  parcelName(r.plot),
                  r.plot.bloc_fizic ?? '',
                  r.plot.parcel_no ?? '',
                  r.plot.land_use ? (LAND_USES[r.plot.land_use] ?? r.plot.land_use) : '',
                  cropName(r.season.crop_id),
                  hectares(r.season.area_ari),
                ],
              })),
              empty: '',
            },
          ]
        : []),
    ],
    notes: [
      input.rows.length
        ? 'Parcelele sunt cele de pe hartă, cu suprafața din anul recoltei. Blocul fizic și numărul parcelei sunt cele din cererea APIA, unde au fost citite sau scrise.'
        : 'Parcelele nu sunt încă puse pe hartă, așa că raportul arată doar suprafața pe fiecare cultură.',
      ...commonNotes(ctx),
    ],
  };
}
