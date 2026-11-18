// Main-content selector per host. Selectors were chosen from saved copies of
// real pages; hosts not listed here use the automatic extraction in html.ts.
export const SELECTORS: Record<string, string> = {
  'afir.ro': 'main.page-container',
  'ansvsa.ro': '#content',
};

export function selectorFor(url: string): string | undefined {
  return SELECTORS[new URL(url).hostname.replace(/^www\./, '')];
}
