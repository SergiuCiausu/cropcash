/* The APIA papers of phase 3 (docs/rapoarte-apia-plan.md): the animal declaration (field 47), the hay proof
   (Anexa 26), the PD-07 / PD-27 decont and, from campaign 2027, the proof that an arable farm is active. Pure,
   like build.ts: each builder takes what inputs.ts read off the farm and says, in `missing`, what's lacking. */
import type { Livestock, LivestockFile, Period, ReportRecord } from '../../../packages/shared/src/reports/index';
import { uvmText } from './apia';
import { commonNotes, header } from './build';
import { cell, dayNumeric, dayWords, hectares } from './format';
import type { Missing, ReportContext, ReportModel, Section } from './model';

const campaign = (ctx: ReportContext, period: Period) => `${ctx.farmName} · Campania APIA ${period.key}`;
const capitalFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const parcels = (n: number) => (n === 1 ? 'o parcelă' : `${n} parcele`);
const ANIMALS_LINK = 'Notează animalele pe fila Pentru APIA, la „Animalele fermei”.';

/** The herd in UVM, from livestock.json. */
export interface Herd {
  livestock: Livestock | null;
  file: LivestockFile;
  /** UVM in thousandths, per category with heads. */
  uvm: { total: number; byCategory: { id: string; label: string; heads: number; uvmMilli: number }[] };
}

/* ---- Declarația pentru animale (câmpul 47) ---- */

export function livestockReport(ctx: ReportContext, herd: Herd, period: Period): ReportModel {
  const l = herd.livestock;
  const rows = herd.file.categories.filter((c) => c.field47);
  const heads = rows.reduce((s, c) => s + (l?.counts[c.id] ?? 0), 0);
  const missing: Missing[] = [];
  if (!l || !heads) missing.push({ text: `Nicio vită, oaie, capră, porc sau pasăre notată. ${ANIMALS_LINK}` });
  if (!l?.ansvsaCode) missing.push({ text: 'Codul exploatației de la ANSVSA (îl ai de la medicul veterinar).' });
  if (heads) missing.push({ text: 'Lista animalelor pe crotalii (câmpul 52): aplicația nu ține crotaliile. O iei din Registrul Național al Exploatațiilor.' });
  const uvm = new Map(herd.uvm.byCategory.map((c) => [c.id, c.uvmMilli]));
  return {
    ...header(ctx, 'apia-livestock', period, 'declaratia-animale'),
    subtitle: campaign(ctx, period),
    sections: [
      {
        kind: 'facts',
        title: 'Pe scurt',
        rows: [
          { label: 'Codul exploatației (ANSVSA)', value: l?.ansvsaCode ?? '' },
          { label: 'Animale, în total', value: `${heads} capete` },
          { label: 'În UVM', value: uvmText(herd.uvm.total), strong: true },
          ...(l?.dairyCows ? [{ label: 'Din care vaci de lapte', value: `${l.dairyCows} capete` }] : []),
        ],
      },
      {
        kind: 'table',
        title: 'Câmpul 47: efectivul pe categorii',
        columns: [
          { label: 'Categoria', align: 'left', width: 0.5 },
          { label: 'Capete', align: 'right', width: 0.25 },
          { label: 'UVM', align: 'right', width: 0.25 },
        ],
        rows: [
          ...rows.map((c) => ({ cells: [c.label_ro, l?.counts[c.id] ? String(l.counts[c.id]) : '', uvm.has(c.id) ? uvmText(uvm.get(c.id)!) : ''] })),
          { tone: 'total' as const, cells: ['Total', String(heads), uvmText(herd.uvm.total)] },
        ],
        empty: '',
      },
    ],
    missing,
    notes: [
      'Declarația pentru animale se face la centrul APIA, cu programare, înainte de declarația de suprafață. Foaia asta te ajută să ai cifrele la tine.',
      `Coeficienții UVM sunt din Regulamentul (UE) 808/2014${herd.file.meta.uvm_status === 'DE-VERIFICAT' ? ', încă de verificat pentru 2026' : ''}.`,
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Dovada pentru fân (Anexa 26) ---- */

export interface HayInput {
  /** Permanent grassland, in ari, and its parcels. */
  grassland: { name: string; bloc: string | null; ari: number }[];
  herd: Herd;
  /** Hay noted for this campaign, in tenths of a tonne; null when not noted. */
  hayTenths: number | null;
}

export function hayReport(ctx: ReportContext, input: HayInput, period: Period): ReportModel {
  const ari = input.grassland.reduce((s, p) => s + p.ari, 0);
  const threshold = input.herd.file.meta.hay_below_uvm_per_ha.value;
  /* UVM per ha: thousandths of UVM × 100 / ari = thousandths per ha. */
  const perHaMilli = ari ? Math.round((input.herd.uvm.total * 100) / ari) : 0;
  const enough = ari > 0 && perHaMilli >= Math.round(threshold * 1000);
  const missing: Missing[] = [];
  if (!ari) missing.push({ text: 'Nicio pajiște permanentă pe hartă în anul ăsta.', screen: 'harta' });
  else if (!enough) {
    if (input.hayTenths === null) missing.push({ text: 'Câte tone de fân ai strâns. Scrie-le pe card, la „Fânul strâns”.' });
    missing.push({ text: 'Documentele de depozitare sau de vânzare a fânului (procesul-verbal, factura, bonul).' });
  }
  return {
    ...header(ctx, 'apia-hay', period, 'dovada-fan'),
    subtitle: campaign(ctx, period),
    sections: [
      {
        kind: 'facts',
        title: 'Pe scurt',
        rows: [
          { label: 'Pajiște permanentă', value: hectares(ari) },
          { label: 'Animale pe pajiște', value: `${uvmText(input.herd.uvm.total)} UVM (${uvmText(perHaMilli)} UVM/ha)` },
          {
            label: 'Ai nevoie de dovada fânului',
            value: !ari ? 'nu (fără pajiște)' : enough ? `nu: ai cel puțin ${uvmText(threshold * 1000)} UVM/ha` : `da: ai sub ${uvmText(threshold * 1000)} UVM/ha`,
            strong: true,
          },
          ...(input.hayTenths !== null ? [{ label: 'Fân strâns', value: `${uvmText(input.hayTenths * 100)} t` }] : []),
        ],
      },
      {
        kind: 'table',
        title: 'Parcelele de pajiște',
        columns: [
          { label: 'Parcela', align: 'left', width: 0.3 },
          { label: 'Bloc fizic', align: 'left', width: 0.18 },
          { label: 'Suprafața', align: 'right', width: 0.16 },
          { label: 'Cosit pe', align: 'left', width: 0.18 },
          { label: 'Fân (t)', align: 'right', width: 0.18 },
        ],
        rows: input.grassland.map((p) => ({ cells: [p.name, p.bloc ?? '', hectares(p.ari), '', ''] })),
        empty: 'Nicio parcelă de pajiște.',
      },
    ],
    missing,
    signature: !enough && ari > 0,
    notes: [
      'Cositul se face între 15 iunie și 1 octombrie. Dovada se depune până pe 15 octombrie.',
      'Zilele de cosit și fânul pe parcelă le scrii de mână: aplicația nu le ține.',
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Decontul PD-07 (bunăstarea vacilor de lapte) și PD-27 (pășunat extensiv) ---- */

export function animalDecontReport(ctx: ReportContext, herd: Herd, grassland: HayInput['grassland'], period: Period): ReportModel {
  const cows = herd.livestock?.dairyCows ?? 0;
  const grazers = herd.uvm.byCategory.filter((c) => c.id.startsWith('bovine') || c.id === 'sheep' || c.id === 'goats');
  const missing: Missing[] = [];
  if (!herd.livestock) missing.push({ text: `Nicio vacă sau oaie notată. ${ANIMALS_LINK}` });
  if (cows) missing.push({ text: `Crotaliile celor ${cows} vaci de lapte (Anexa 16¹).` });
  if (grassland.length && grazers.length) missing.push({ text: 'Zilele de pășunat pe fiecare parcelă și câte animale au pășunat (caietul de pășunat, Anexa 19¹).' });
  missing.push({ text: 'Facturile pentru cheltuielile cu bunăstarea animalelor din tot anul.' });
  const sections: Section[] = [
    {
      kind: 'facts',
      title: 'Pe scurt',
      rows: [
        { label: 'Codul exploatației (ANSVSA)', value: herd.livestock?.ansvsaCode ?? '' },
        { label: 'Vaci de lapte (PD-07)', value: cows ? `${cows} capete` : 'niciuna notată' },
        { label: 'Animale care pășunează (PD-27)', value: grazers.length ? `${uvmText(grazers.reduce((s, c) => s + c.uvmMilli, 0))} UVM` : 'niciunul notat' },
      ],
    },
  ];
  if (cows)
    sections.push({
      kind: 'table',
      title: 'Anexa 16¹: vacile de lapte, pe crotalii',
      columns: [
        { label: 'Nr.', align: 'right', width: 0.08 },
        { label: 'Crotalia', align: 'left', width: 0.3 },
        { label: 'Rasa', align: 'left', width: 0.22 },
        { label: 'Data nașterii', align: 'left', width: 0.18 },
        { label: 'Observații', align: 'left', width: 0.22 },
      ],
      rows: Array.from({ length: cows }, (_, i) => ({ cells: [String(i + 1), '', '', '', ''] })),
      empty: '',
    });
  if (grassland.length && grazers.length)
    sections.push({
      kind: 'table',
      title: 'Anexa 19¹: caietul de pășunat',
      columns: [
        { label: 'Parcela', align: 'left', width: 0.24 },
        { label: 'Bloc fizic', align: 'left', width: 0.16 },
        { label: 'Suprafața', align: 'right', width: 0.14 },
        { label: 'Intrat pe', align: 'left', width: 0.15 },
        { label: 'Ieșit pe', align: 'left', width: 0.15 },
        { label: 'Câte animale', align: 'right', width: 0.16 },
      ],
      rows: grassland.map((p) => ({ cells: [p.name, p.bloc ?? '', hectares(p.ari), '', '', ''] })),
      empty: '',
    });
  return {
    ...header(ctx, 'apia-animal-decont', period, 'decont-animale'),
    subtitle: campaign(ctx, period),
    sections,
    missing,
    signature: true,
    notes: [
      'Decontul se depune la centrul APIA în ianuarie, pentru tot anul de angajament (termen de verificat).',
      'Aplicația nu ține crotaliile și zilele de pășunat: rândurile sunt goale, de completat de mână.',
      ...commonNotes(ctx),
    ],
  };
}

/* ---- Dovada de fermier activ, din campania 2027 (Ord. 44/2026, art. 25¹) ---- */

export interface ActiveParcel {
  name: string;
  crop: string;
  cropId: string | null;
  ari: number;
  sownOn: string | null;
}

export function activeFarmerReport(ctx: ReportContext, rows: ActiveParcel[], invoices: ReportRecord[], deadline: string | null, period: Period): ReportModel {
  const noSowing = rows.filter((p) => !p.sownOn).length;
  const crops = [...new Map(rows.filter((p) => p.cropId).map((p) => [p.cropId!, p.crop])).entries()];
  const seedless = crops.filter(([id]) => !invoices.some((r) => r.category === 'seeds' && r.cropId === id)).map(([, name]) => name);
  const noDoc = invoices.filter((r) => !r.docNo).length;
  const missing: Missing[] = [];
  if (!rows.length) missing.push({ text: 'Nicio parcelă de teren arabil în anul ăsta. Pune parcelele pe Hartă.', screen: 'harta' });
  if (noSowing) missing.push({ text: `${capitalFirst(parcels(noSowing))} fără data semănatului.`, screen: 'harta' });
  if (seedless.length) missing.push({ text: `Factura de sămânță pentru ${seedless.map((n) => n.toLowerCase()).join(', ')}.`, screen: 'recolte' });
  if (noDoc) missing.push({ text: `Numărul facturii la ${noDoc === 1 ? 'o cheltuială' : `${noDoc} cheltuieli`}.`, screen: 'recolte' });
  return {
    ...header(ctx, 'apia-active-farmer', period, 'fermier-activ'),
    subtitle: campaign(ctx, period),
    sections: [
      {
        kind: 'facts',
        title: 'Pe scurt',
        rows: [
          { label: 'Teren arabil', value: hectares(rows.reduce((s, p) => s + p.ari, 0)) },
          { label: 'Facturi de sămânță, îngrășăminte și tratamente', value: String(invoices.length) },
          ...(deadline ? [{ label: 'Depui până pe', value: `${dayWords(deadline)} (de verificat)`, strong: true }] : []),
        ],
      },
      {
        kind: 'table',
        title: 'Parcelele și semănatul',
        columns: [
          { label: 'Parcela', align: 'left', width: 0.3 },
          { label: 'Cultura', align: 'left', width: 0.3 },
          { label: 'Suprafața', align: 'right', width: 0.2 },
          { label: 'Semănat pe', align: 'left', width: 0.2 },
        ],
        rows: rows.map((p) => ({ cells: [p.name, p.crop, hectares(p.ari), p.sownOn ? dayNumeric(p.sownOn) : ''] })),
        empty: 'Nicio parcelă.',
      },
      {
        kind: 'table',
        title: 'Facturile de inputuri',
        columns: [
          { label: 'Data', align: 'left', width: 0.14 },
          { label: 'Ce', align: 'left', width: 0.18 },
          { label: 'Cultura', align: 'left', width: 0.16 },
          { label: 'Furnizor', align: 'left', width: 0.2 },
          { label: 'Factura', align: 'left', width: 0.14 },
          { label: 'Suma (lei)', align: 'right', width: 0.18 },
        ],
        rows: invoices.map((r) => ({
          cells: [dayNumeric(r.date), ctx.categoryName(r.category) ?? '', r.cropId ? ctx.cropName(r.cropId) : '', r.counterparty ?? '', r.docNo ?? '', cell(Math.abs(r.amountBani))],
        })),
        empty: 'Nicio factură de sămânță, îngrășăminte sau tratamente notată.',
      },
    ],
    missing,
    signature: true,
    notes: [
      ...(+period.key < 2027 ? ['Regula se aplică din campania 2027. Pentru anii de dinainte foaia e doar un exemplu.'] : []),
      'Din campania 2027, fermele cu teren arabil dovedesc că sunt active cu facturile de inputuri și documentele de semănat (Ord. MADR 44/2026, art. 25¹). Cine trebuie s-o depună și termenul sunt încă de verificat.',
      ...commonNotes(ctx),
    ],
  };
}
