import { loadData } from '@cropcash/shared';

/** City for the test address: the county name (good enough for Stripe test identity data). */
export function countyCity(code: string): string {
  return loadData().counties.counties.find((c) => c.code === code)?.name_ro ?? 'București';
}
