/* What a report says, before it is a PDF. The builders (build.ts) word and format everything; the
   renderer (pdf.tsx) only lays it out. So the same model can later become a CSV for an accountant
   without working anything out again. */

export type Audience = 'farmer' | 'accountant' | 'institution';

export interface FactRow {
  label: string;
  value: string;
  strong?: boolean;
}

export interface Column {
  label: string;
  align: 'left' | 'right';
  /** Share of the table's width; a table's columns add up to 1. */
  width: number;
}

export interface TableRow {
  cells: string[];
  tone?: 'subtotal' | 'total';
}

export type Section =
  | { kind: 'facts'; title: string; rows: FactRow[] }
  | { kind: 'table'; title: string; columns: Column[]; rows: TableRow[]; empty: string };

export interface ReportModel {
  id: string;
  audience: Audience;
  title: string;
  /** Under the title: whose farm and which span. */
  subtitle: string;
  /** Label and value pairs in the header box. */
  meta: [string, string][];
  sections: Section[];
  /** Small print at the end. */
  notes: string[];
  /** Printed across every page, for Ion's example farm. */
  watermark: string | null;
  /** The file name, without ".pdf". */
  fileName: string;
}

/** What every report needs to know about the farm and the moment it is made. */
export interface ReportContext {
  farmName: string;
  county: string;
  /** "15 ha, grâu și porumb". */
  farmSummary: string;
  /** The farm's day (the demo clock when set). */
  today: string;
  /** The day the phone's copy of the farm was saved, when that is more than a week ago. */
  staleSince: string | null;
  /** Ion's example farm. */
  example: boolean;
  cropName: (id: string) => string;
  categoryName: (category: string | null | undefined) => string | undefined;
}
