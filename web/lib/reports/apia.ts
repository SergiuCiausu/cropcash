/* The APIA papers the app fills (docs/rapoarte-apia-plan.md, phase 1): the sheet to copy the surface
   declaration from, the diesel claim's Anexa 9 and the areas with their normed diesel (Anexa 2). Each
   builder takes what inputs.ts read off the farm and says, in `missing`, what the farm's data lacks, so
   the card and the PDF tell the farmer what to add or write by hand. Pure, like build.ts. */
import { capFor, fuelLines, type AnimalFuelRow, type FuelCap, type FuelExcise, type Period, type ReportRecord } from '../../../packages/shared/src/reports/index';
import { commonNotes, header, LAND_USES, periodLabel } from './build';
import { dayNumeric, dayWords, hectares, leiCents, litres } from './format';
import type { Missing, ReportContext, ReportModel, TableRow } from './model';

/** "3 parcele", "o parcelă". */
const parcels = (n: number) => (n === 1 ? 'o parcelă' : `${n} parcele`);
const invoices = (n: number) => (n === 1 ? 'o factură' : `${n} facturi`);

/* ---- Fișa pentru declarația de suprafață ---- */

/** One row of the declaration (II.A in the cerere), as the map holds it. */
export interface SurfaceRow {
  /** "satul Măldăeni, comuna Măldăeni", or null when the parcel has no SIRUTA. */
  place: string | null;
  siruta: number | null;
  bloc: string | null;
  parcelNo: string | null;
  landUse: string | null;
  code: number | null;
  crop: string;
  ari: number;
  secondCrop: string | null;
}

export interface SurfaceInput {
  rows: SurfaceRow[];
  /** True when the rows come from the map; false when only the harvest's crops are known. */
  fromMap: boolean;
}

/** APIA leaves out parcels under 0,1 ha if they add up to 1 ha or less (Ord. 67/2026, art. 2). */
const SMALL_ARI = 10;

export function surfaceSheetReport(ctx: ReportContext, input: SurfaceInput, period: Period): ReportModel {
  const rows = [...input.rows].sort(
    (a, b) => (a.bloc ?? '~').localeCompare(b.bloc ?? '~', 'ro', { numeric: true }) || (a.parcelNo ?? '~').localeCompare(b.parcelNo ?? '~', 'ro', { numeric: true }) || a.crop.localeCompare(b.crop, 'ro'),
  );
  const total = rows.reduce((s, r) => s + r.ari, 0);
  const lacking = (pick: (r: SurfaceRow) => unknown) => rows.filter((r) => !pick(r)).length;
  const missing: Missing[] = [];
  if (!input.fromMap) {
    missing.push({ text: 'Parcelele nu sunt pe hartă. Pune-le pe Hartă și apar aici blocul fizic, localitatea și folosința.', screen: 'harta' });
  } else {
    const gaps: [number, string][] = [
      [lacking((r) => r.bloc), 'fără bloc fizic'],
      [lacking((r) => r.parcelNo), 'fără numărul parcelei'],
      [lacking((r) => r.siruta), 'fără localitate (SIRUTA)'],
      [lacking((r) => r.landUse), 'fără categoria de folosință'],
    ];
    for (const [n, what] of gaps) if (n) missing.push({ text: `${capitalFirst(parcels(n))} ${what}.`, screen: 'harta' });
  }
  const noCode = lacking((r) => r.code);
  if (noCode) missing.push({ text: `${capitalFirst(parcels(noCode))} fără codul culturii din lista APIA.`, screen: 'harta' });
  const small = rows.filter((r) => r.ari < SMALL_ARI);

  const byCrop = new Map<string, { code: number | null; crop: string; ari: number }>();
  for (const r of rows) {
    const key = `${r.code ?? ''}|${r.crop}`;
    const c = byCrop.get(key) ?? { code: r.code, crop: r.crop, ari: 0 };
    c.ari += r.ari;
    byCrop.set(key, c);
  }
  const crops = [...byCrop.values()].sort((a, b) => b.ari - a.ari);

  return {
    ...header(ctx, 'apia-surface', period, 'declaratia-de-suprafata'),
    subtitle: `${ctx.farmName} · Campania APIA ${period.key}`,
    sections: [
      {
        kind: 'facts',
        title: 'Pe scurt',
        rows: [
          { label: 'Suprafața totală folosită (rubrica 44 din cerere)', value: hectares(total), strong: true },
          { label: 'Parcele', value: String(rows.length) },
          ...(small.length ? [{ label: 'Parcele sub 0,1 ha', value: String(small.length) }] : []),
        ],
      },
      {
        kind: 'table',
        title: 'Rândurile declarației de suprafață',
        columns: [
          { label: 'Nr.', align: 'right', width: 0.04 },
          { label: 'Localitatea', align: 'left', width: 0.18 },
          { label: 'Bloc fizic', align: 'left', width: 0.1 },
          { label: 'Parcela', align: 'left', width: 0.07 },
          { label: 'Folosința', align: 'left', width: 0.07 },
          { label: 'Cod', align: 'right', width: 0.06 },
          { label: 'Cultura', align: 'left', width: 0.2 },
          { label: 'Suprafața', align: 'right', width: 0.1 },
          { label: 'Cultura secundară', align: 'left', width: 0.18 },
        ],
        rows: rows.map((r, i) => ({
          cells: [
            String(i + 1),
            r.place ?? (r.siruta ? `SIRUTA ${r.siruta}` : ''),
            r.bloc ?? '',
            r.parcelNo ?? '',
            r.landUse ?? '',
            r.code ? String(r.code) : '',
            r.crop,
            hectares(r.ari),
            r.secondCrop ?? '',
          ],
        })),
        empty: 'Nicio cultură în campania asta.',
      },
      {
        kind: 'table',
        title: 'Pe culturi',
        columns: [
          { label: 'Cod', align: 'right', width: 0.12 },
          { label: 'Cultura', align: 'left', width: 0.58 },
          { label: 'Suprafața', align: 'right', width: 0.3 },
        ],
        rows: [
          ...crops.map((c) => ({ cells: [c.code ? String(c.code) : '', c.crop, hectares(c.ari)] })),
          ...(crops.length > 1 ? [{ tone: 'total' as const, cells: ['', 'Total', hectares(total)] }] : []),
        ],
        empty: '',
      },
    ],
    missing,
    notes: [
      'E o fișă din care copiezi în AGI-Online, nu cererea. Cererea se face și se semnează în AGI-Online, până pe 5 iunie.',
      'Schemele de plată (sprijinul de bază, redistributiv, eco-schemele, sprijinul cuplat) le bifezi în AGI-Online pe fiecare parcelă.',
      `Folosința: ${Object.entries(LAND_USES)
        .map(([k, v]) => `${k} = ${v}`)
        .join(', ')}.`,
      'Codul culturii e cel din cererea citită, iar unde lipsește, cel al culturii din lista APIA. Verifică-l: la unele culturi contează soiul sau dacă e de toamnă sau de primăvară.',
      ...(small.length ? ['Parcelele sub 0,1 ha pe care nu ceri plată pot lipsi din cerere dacă, toate la un loc, au cel mult 1 ha.'] : []),
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Situația centralizatoare a motorinei (Anexa 9) ---- */

export function fuelClaimReport(ctx: ReportContext, records: ReportRecord[], fuel: FuelExcise, period: Period): ReportModel {
  const f = fuelLines(records, fuel);
  const diesel = records.filter((r) => r.kind === 'expense' && r.category === 'diesel').sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const lacking = (pick: (r: ReportRecord) => unknown) => diesel.filter((r) => !pick(r)).length;
  const missing: Missing[] = [];
  if (!diesel.length) missing.push({ text: 'Nicio factură de motorină în trimestrul ăsta. Le notezi în Recolte, ca cheltuială pe motorină, cu litrii.', screen: 'recolte' });
  const gaps: [number, string][] = [
    [lacking((r) => r.counterparty), 'fără furnizor'],
    [lacking((r) => r.docNo), 'fără numărul facturii'],
    [lacking((r) => (r.fuelLitersCl ?? 0) > 0), 'fără litri'],
  ];
  for (const [n, what] of gaps) if (n) missing.push({ text: `${capitalFirst(invoices(n))} ${what}.`, screen: 'recolte' });
  const claim = fuel.claims.find((c) => c.period === period.key) ?? null;
  const total: TableRow[] = diesel.length ? [{ tone: 'total', cells: ['', 'Total', '', '', litres(f.litresCl), litres(f.litresCl)] }] : [];

  return {
    ...header(ctx, 'apia-fuel-claim', period, 'motorina-anexa-9'),
    sections: [
      {
        kind: 'facts',
        title: 'Pe scurt',
        rows: [
          { label: 'Facturi', value: String(diesel.length) },
          { label: 'Litri de motorină', value: litres(f.litresCl), strong: true },
          { label: 'Acciză de primit înapoi (estimare)', value: leiCents(f.refundBani) },
          ...(claim ? [{ label: 'Depui până pe', value: `${dayWords(claim.deadline)}${claim.status === 'DE-VERIFICAT' ? ' (de verificat)' : ''}` }] : []),
        ],
      },
      {
        kind: 'table',
        title: 'Situația centralizatoare a cantităților de motorină și a documentelor de achiziție',
        columns: [
          { label: 'Nr. crt.', align: 'right', width: 0.08 },
          { label: 'Furnizorul', align: 'left', width: 0.28 },
          { label: 'Nr. factură', align: 'left', width: 0.17 },
          { label: 'Data facturii', align: 'left', width: 0.15 },
          { label: 'Litri facturați', align: 'right', width: 0.16 },
          { label: 'Litri folosiți', align: 'right', width: 0.16 },
        ],
        rows: [
          ...diesel.map((r, i) => {
            const l = r.fuelLitersCl ? litres(r.fuelLitersCl) : '';
            return { cells: [String(i + 1), r.counterparty ?? '', r.docNo ?? '', dayNumeric(r.date), l, l] };
          }),
          ...total,
        ],
        empty: 'Nicio factură de motorină în perioada asta.',
      },
    ],
    missing,
    signature: true,
    notes: [
      'Litrii folosiți sunt trecuți egali cu cei facturați. Dacă n-ai folosit toată motorina în trimestru, scrie de mână cât ai folosit.',
      `Duci la APIA: ${fuel.claim_documents_ro.map((d) => d.replace(/\.$/, '')).join('; ')}.`,
      'Acciza de primit e o estimare, cu cota zilei în care ai cumpărat. Suma exactă o stabilește APIA din facturi.',
      'Tabelul are rubricile Anexei 9 (OMADR 1727/2015). Dacă centrul APIA îți cere formularul lui, copiază rândurile pe el.',
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Motorina: suprafețele și consumul normat (Anexa 2) ---- */

/** A crop as the cap needs it: its APIA line and the area. */
export interface PriorCrop {
  cropId?: string | null;
  code: number | null;
  heading: string | null;
  section: string | null;
  name: string;
  ari: number;
}

/** UVM in thousandths, as „1,5”. */
export const uvmText = (milli: number) => (milli / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 2 });

/** Anexa 3, from the animals noted (lib/reports/animals.ts). Empty: no animals noted, the section is left out. */
export function fuelPriorReport(ctx: ReportContext, crops: PriorCrop[], fuel: FuelExcise, period: Period, animals: AnimalFuelRow[] = []): ReportModel {
  const merged = new Map<string, PriorCrop>();
  for (const c of crops) {
    const key = `${c.code ?? ''}|${c.name}`;
    const m = merged.get(key);
    merged.set(key, m ? { ...m, ari: m.ari + c.ari } : { ...c });
  }
  const lines = [...merged.values()]
    .sort((a, b) => b.ari - a.ari)
    .map((c) => {
      const cap: FuelCap | null = capFor(c, fuel.caps_l_per_ha);
      /* l/ha × ari = hundredths of a litre: whole numbers all the way. */
      return { crop: c, cap, cl: cap ? cap.value * c.ari : null };
    });
  const totalAri = lines.reduce((s, l) => s + l.crop.ari, 0);
  const cropsCl = lines.reduce((s, l) => s + (l.cl ?? 0), 0);
  const animalsCl = animals.reduce((s, a) => s + a.litresCl, 0);
  const totalCl = cropsCl + animalsCl;
  const uncapped = lines.filter((l) => !l.cap);
  const missing: Missing[] = [];
  if (!lines.length) missing.push({ text: 'Nicio cultură pentru anul ăsta. Pune parcelele pe Hartă.', screen: 'harta' });
  for (const l of uncapped) missing.push({ text: `${l.crop.name}: nu are consum normat în anexa HG 1174/2014. Întreabă la APIA în ce grupă intră.` });
  const acord = fuel.acord.deadlines.find((d) => d.for_year === +period.key) ?? null;
  /* The scheme's last day is before the year asked for: the acord is only worth filing if it's extended. */
  const notCovered = fuel.scheme_end.value < `${period.key}-01-01`;

  return {
    ...header(ctx, 'apia-fuel-prior', period, 'motorina-anexa-2'),
    subtitle: `${ctx.farmName} · Motorina pentru ${capitalFirst(periodLabel(period))}`,
    sections: [
      {
        kind: 'facts',
        title: 'Pe scurt',
        rows: [
          { label: 'Suprafața', value: hectares(totalAri) },
          { label: 'Motorină pe an, după consumul normat', value: litres(totalCl), strong: true },
          ...(acord?.date ? [{ label: 'Ceri acordul până pe', value: dayWords(acord.date) }] : []),
        ],
      },
      {
        kind: 'table',
        title: 'Situația suprafețelor și a structurii culturilor',
        columns: [
          { label: 'Nr.', align: 'right', width: 0.06 },
          { label: 'Cultura', align: 'left', width: 0.3 },
          { label: 'Cod', align: 'right', width: 0.08 },
          { label: 'Suprafața', align: 'right', width: 0.14 },
          { label: 'Consum normat (l/ha)', align: 'right', width: 0.2 },
          { label: 'Litri pe an', align: 'right', width: 0.22 },
        ],
        rows: [
          ...lines.map((l, i) => ({
            cells: [String(i + 1), l.crop.name, l.crop.code ? String(l.crop.code) : '', hectares(l.crop.ari), l.cap ? String(l.cap.value) : '—', l.cl === null ? '—' : litres(l.cl)],
          })),
          ...(lines.length ? [{ tone: 'total' as const, cells: ['', 'Total', '', hectares(totalAri), '', litres(cropsCl)] }] : []),
        ],
        empty: 'Nicio cultură în anul ăsta.',
      },
      ...(animals.length
        ? [
            {
              kind: 'table' as const,
              title: 'Anexa 3: animalele, în UVM',
              columns: [
                { label: 'Specia', align: 'left' as const, width: 0.34 },
                { label: 'UVM (sau familii)', align: 'right' as const, width: 0.2 },
                { label: 'Consum normat (l/UVM)', align: 'right' as const, width: 0.24 },
                { label: 'Litri pe an', align: 'right' as const, width: 0.22 },
              ],
              rows: [
                ...animals.map((a) => ({ cells: [a.label, a.perFamily ? `${a.amount} familii` : uvmText(a.amount), litres(a.perUnitCl), litres(a.litresCl)] })),
                { tone: 'total' as const, cells: ['Total', '', '', litres(animalsCl)] },
              ],
              empty: '',
            },
          ]
        : []),
    ],
    missing,
    signature: true,
    notes: [
      ...(notCovered
        ? [`Ajutorul la motorină merge până pe ${dayWords(fuel.scheme_end.value)}. Pentru ${period.key} nu e anunțat încă: depune doar dacă APIA îl prelungește.`]
        : []),
      `${fuel.acord.rule_ro}`,
      `Consumul normat pe hectar e din anexa HG 1174/2014${fuel.caps_status === 'DE-VERIFICAT' ? ' (cifre încă de verificat)' : ''}. Culturile sunt grupate ca în tabelul APIA.`,
      animals.length
        ? 'Animalele sunt socotite în UVM cu coeficienții din livestock.json (de verificat). Irigațiile (Anexa 4) nu sunt în raport: aplicația nu le ține încă.'
        : 'Anexa 3 (animalele) apare când notezi animalele fermei pe fila Pentru APIA. Irigațiile (Anexa 4) nu sunt în raport: aplicația nu le ține încă.',
      ...commonNotes(ctx),
    ],
  };
}

function capitalFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
