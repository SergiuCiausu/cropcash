/* A ReportModel laid out as an A4 PDF. The page loads this file only when the farmer asks for a
   report (import() in components/pages/Rapoarte.tsx), so the PDF library never slows the other pages.
   The font is Geist with Romanian letters (ș, ț), embedded in the file: the PDF's own fonts have none. */
import { Document, Font, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { Column, ReportModel, Section, TableRow } from './model';

/** Where the two weights of Geist are: URLs in the browser, file paths in tests. */
export interface PdfFonts {
  regular: string;
  semibold: string;
}

/* The app's palette (styles/shared.css): ink, the field green and its tint, hairlines. */
const FAMILY = 'Geist';
const INK = '#18201C';
const MUTED = '#4A524E';
const GREEN = '#3D7A13';
const TINT = '#E9F7D3';
const HAIR = '#DADDD8';

/**
 * Registered afresh for every PDF. A font loaded for one PDF carries that PDF's glyph subset into the
 * next, and text copied from the second file comes out garbled ("Pri1it"). Font.reset() doesn't help
 * (it keeps the old load) and Font.clear() drops the built-in Helvetica too, so only Geist is dropped,
 * from the live map getRegisteredFonts() returns. The service worker or the browser cache serves the
 * font files again.
 */
function registerFonts(fonts: PdfFonts) {
  delete (Font.getRegisteredFonts() as Record<string, unknown>)[FAMILY];
  Font.register({ family: FAMILY, fonts: [{ src: fonts.regular, fontWeight: 400 }, { src: fonts.semibold, fontWeight: 600 }] });
  /* Words are never split: the default hyphenation is for English. */
  Font.registerHyphenationCallback((word) => [word]);
}

const s = StyleSheet.create({
  page: { fontFamily: FAMILY, fontSize: 9, color: INK, paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, lineHeight: 1.35 },
  brand: { fontSize: 8, fontWeight: 600, color: GREEN, letterSpacing: 1, marginBottom: 6 },
  /* Big text sets its own line height: the page's would be too short for it. */
  title: { fontSize: 18, fontWeight: 600, lineHeight: 1.25, marginBottom: 3 },
  subtitle: { fontSize: 10, color: MUTED, lineHeight: 1.35, marginBottom: 12 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: HAIR, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 14 },
  metaItem: { width: '50%', flexDirection: 'row', paddingVertical: 2 },
  metaLabel: { width: 62, color: MUTED },
  metaValue: { flex: 1 },
  section: { marginBottom: 14 },
  h2: { fontSize: 11, fontWeight: 600, lineHeight: 1.3, marginBottom: 5 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: HAIR },
  factStrong: { fontWeight: 600 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 3, marginBottom: 1 },
  thText: { fontWeight: 600, color: MUTED, fontSize: 8 },
  tr: { flexDirection: 'row', paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: HAIR },
  subtotal: { backgroundColor: TINT, fontWeight: 600 },
  total: { fontWeight: 600, borderTopWidth: 1, borderTopColor: INK, borderBottomWidth: 0 },
  cell: { paddingHorizontal: 3 },
  empty: { color: MUTED, paddingVertical: 4 },
  notes: { marginTop: 6, borderTopWidth: 0.5, borderTopColor: HAIR, paddingTop: 6 },
  note: { fontSize: 7.5, color: MUTED, marginBottom: 2 },
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
  missing: { borderWidth: 1, borderColor: INK, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 14 },
  missingItem: { paddingVertical: 1 },
  signature: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, marginBottom: 8 },
  signLine: { width: '30%', borderTopWidth: 0.75, borderTopColor: INK, paddingTop: 3, color: MUTED, fontSize: 8 },
  watermark: { position: 'absolute', top: 360, left: 0, right: 0, textAlign: 'center', fontSize: 90, lineHeight: 1.1, fontWeight: 600, color: '#000000', opacity: 0.06, transform: 'rotate(-30deg)' },
});

function Cells({ columns, cells, header = false }: { columns: Column[]; cells: string[]; header?: boolean }) {
  return (
    <>
      {columns.map((c, i) => (
        <Text key={i} style={[s.cell, { width: `${c.width * 100}%`, textAlign: c.align }, header ? s.thText : {}]}>
          {cells[i] ?? ''}
        </Text>
      ))}
    </>
  );
}

function Table({ section }: { section: Extract<Section, { kind: 'table' }> }) {
  const tone = (r: TableRow) => (r.tone === 'subtotal' ? [s.tr, s.subtotal] : r.tone === 'total' ? [s.tr, s.total] : [s.tr]);
  const hasHeader = section.columns.some((c) => c.label);
  return (
    <View style={s.section}>
      {/* The title stays with the table's first rows. */}
      <View wrap={false}>
        <Text style={s.h2}>{section.title}</Text>
        {hasHeader && (
          <View style={s.th}>
            <Cells columns={section.columns} cells={section.columns.map((c) => c.label)} header />
          </View>
        )}
        {!section.rows.length && <Text style={s.empty}>{section.empty}</Text>}
      </View>
      {section.rows.map((r, i) => (
        <View key={i} style={tone(r)} wrap={false}>
          <Cells columns={section.columns} cells={r.cells} />
        </View>
      ))}
    </View>
  );
}

function Facts({ section }: { section: Extract<Section, { kind: 'facts' }> }) {
  return (
    <View style={s.section} wrap={false}>
      <Text style={s.h2}>{section.title}</Text>
      {section.rows.map((r, i) => (
        <View key={i} style={s.fact}>
          <Text style={r.strong ? s.factStrong : {}}>{r.label}</Text>
          <Text style={r.strong ? s.factStrong : {}}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function ReportDocument({ model }: { model: ReportModel }) {
  return (
    <Document title={`${model.title} · ${model.subtitle}`} author="CropCash" creator="CropCash" producer="CropCash" language="ro">
      <Page size="A4" style={s.page}>
        {model.watermark && (
          <Text style={s.watermark} fixed>
            {model.watermark}
          </Text>
        )}
        <Text style={s.brand}>CROPCASH</Text>
        <Text style={s.title}>{model.title}</Text>
        <Text style={s.subtitle}>{model.subtitle}</Text>
        <View style={s.meta}>
          {model.meta.map(([label, value]) => (
            <View key={label} style={s.metaItem}>
              <Text style={s.metaLabel}>{label}</Text>
              <Text style={s.metaValue}>{value}</Text>
            </View>
          ))}
        </View>
        {!!model.missing?.length && (
          <View style={s.missing} wrap={false}>
            <Text style={s.h2}>De completat de mână</Text>
            {model.missing.map((m, i) => (
              <Text key={i} style={s.missingItem}>
                • {m.text}
              </Text>
            ))}
          </View>
        )}
        {model.sections.map((section, i) => (section.kind === 'facts' ? <Facts key={i} section={section} /> : <Table key={i} section={section} />))}
        {model.signature && (
          <View style={s.signature} wrap={false}>
            {['Numele și prenumele', 'Data', 'Semnătura'].map((label) => (
              <Text key={label} style={s.signLine}>
                {label}
              </Text>
            ))}
          </View>
        )}
        <View style={s.notes}>
          {model.notes.map((n, i) => (
            <Text key={i} style={s.note}>
              {n}
            </Text>
          ))}
        </View>
        <View style={s.footer} fixed>
          <Text>
            CropCash · {model.title}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} din ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** The report as a PDF file, ready to share or save. */
export async function reportPdf(model: ReportModel, fonts: PdfFonts): Promise<Blob> {
  registerFonts(fonts);
  return pdf(<ReportDocument model={model} />).toBlob();
}
