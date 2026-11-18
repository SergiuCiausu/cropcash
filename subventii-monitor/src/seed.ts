// Parses the source tables in section 4 of subventii-surse.md.
export interface SeedSource {
  url: string;
  institution: string;
  title: string;
  type: 'index' | 'pagina' | 'pdf';
  frequency: 'daily' | 'weekly';
  verified: boolean;
}

// Plan: anything announcing funding is daily; legislation, registers and
// reference pages are weekly.
const WEEKLY = /legisla|registr|regulament|legea |\bhg \d|omadr|acte normative|oficii|centre|contact|structuri|direcții|proceduri|sesizează|bănci partenere|helpdesk|beneficiari fega|beneficiarii pac|ajutoarelor de stat/i;

export function frequencyFor(title: string): 'daily' | 'weekly' {
  return WEEKLY.test(title) ? 'weekly' : 'daily';
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

export function parseSpec(markdown: string): SeedSource[] {
  const start = markdown.search(/^## 4\. /m);
  if (start < 0) throw new Error('Section 4 not found in the spec');

  const sources: SeedSource[] = [];
  let institution = '';
  let header: string[] | null = null;

  for (const line of markdown.slice(start).split(/\r?\n/)) {
    const heading = line.match(/^### 4\.\d+ (.+)$/);
    if (heading) {
      const name = heading[1]!;
      const acronym = name.match(/\(([A-Z]{2,})\)\s*$/);
      institution = acronym ? acronym[1]! : name.split(' – ')[0]!.trim();
      header = null;
      continue;
    }
    if (!line.startsWith('|')) {
      header = null;
      continue;
    }
    const row = cells(line);
    if (row.every((c) => /^-+$/.test(c))) continue;
    if (!header) {
      header = row;
      continue;
    }

    const columns = header;
    const at = (name: string): string => row[columns.indexOf(name)] ?? '';
    const url = at('URL');
    if (!/^https?:\/\//.test(url)) continue; // e.g. Neamț has no site

    const county = at('Județ');
    const title = county ? `DAJ ${county}` : at('Titlu');
    const type = county ? 'index' : at('Tip');
    if (type !== 'index' && type !== 'pagina' && type !== 'pdf') {
      throw new Error(`Unknown type "${type}" for ${url}`);
    }
    sources.push({
      url,
      institution,
      title,
      type,
      frequency: frequencyFor(title),
      verified: at('Verificat').startsWith('da'),
    });
  }
  return sources;
}
