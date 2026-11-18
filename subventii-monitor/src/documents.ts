// What the monitor hands to the app: official text cut into searchable passages,
// and a change short enough to read on a phone.

const PASSAGE_CHARS = 900;
const SHORT_DIFF_CHARS = 1_200;

/** Cuts text at line ends, and only cuts inside a line when one line is too long. */
export function splitPassages(text: string, size = PASSAGE_CHARS): string[] {
  const passages: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) passages.push(current.trim());
    current = '';
  };
  // Postgres text can't hold a NUL, and PDF extraction sometimes produces one.
  for (const raw of text.replaceAll('\u0000', '').split('\n')) {
    let line = raw;
    while (line.length > size) {
      flush();
      passages.push(line.slice(0, size).trim());
      line = line.slice(size);
    }
    if (current.length + line.length + 1 > size) flush();
    current += `${line}\n`;
  }
  flush();
  return passages.filter(Boolean);
}

/** Only the added and removed lines of a unified diff, cut to a readable size. */
export function shortDiff(diff: string, size = SHORT_DIFF_CHARS): string {
  const lines = diff
    .split('\n')
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  const joined = lines.join('\n');
  return joined.length > size ? `${joined.slice(0, size).trimEnd()}…` : joined;
}
