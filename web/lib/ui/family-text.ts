/* The summary a farmer sends to family (docs/functions.md §18). It gets amounts already written for
   the screen, so the message says exactly what the page says, and the farmer reads it before sending. */

const FOOTER = 'Socotit cu CropCash. Sunt estimări, nu o promisiune.';

export function salaryShareText(s: { summary: string; yearLabel: string; salary: string; deficit: boolean; nextMoney: string | null; assumed: string[] }) {
  return [
    `Salariul din fermă (${s.summary})`,
    `${s.yearLabel}: ${s.deficit ? 'banii nu ajung' : `${s.salary} pe lună`}.`,
    ...(s.nextMoney ? [`Următorii bani: ${s.nextMoney}.`] : []),
    '',
    'Pe ce se bazează:',
    ...s.assumed.map((a) => `- ${a}`),
    '',
    FOOTER,
  ].join('\n');
}

export function subsidyShareText(s: { summary: string; year: number; total: string; range: string; advance: string; balance: string }) {
  return [
    `Subvenția APIA pentru ${s.year} (${s.summary})`,
    `În total: ${s.total}, ${s.range}.`,
    `Avansul: ${s.advance}.`,
    `Restul: ${s.balance}.`,
    '',
    'Planul socotește cu ultima zi în care pot veni banii, ca să țină și dacă întârzie.',
    '',
    FOOTER,
  ].join('\n');
}
