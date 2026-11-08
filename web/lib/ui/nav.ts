/* The app's navigation, as app.js's frame() draws it: the tabs, the subsidy sub-pages, and which tab
   a page belongs to. Pure, so the React frame and its tests share it. */
import type { IconName } from './icons';

/**
 * The rail on a computer shows them all. A phone's bottom bar shows four, with big labels, and puts the
 * `railOnly` ones under "Mai mult" (MoreMenu in Frame.tsx), so Ion's buttons stay wide enough to read.
 */
export const TABS: { path: string; icon: IconName; label: string; railOnly?: true }[] = [
  { path: '/acasa', icon: 'home', label: 'Acasă' },
  { path: '/subventii', icon: 'bank', label: 'Subvenții' },
  { path: '/calendar', icon: 'cal', label: 'Calendar', railOnly: true },
  { path: '/prognoza', icon: 'chart', label: 'Prognoză', railOnly: true },
  { path: '/recolte', icon: 'sprout', label: 'Recolte' },
  { path: '/salariu', icon: 'sack', label: 'Salariu' },
  { path: '/pensie', icon: 'hourglass', label: 'Pensie', railOnly: true },
];

/** The three pages under the Subvenții tab, in its sub-navigation. */
export const SUBSIDY_PAGES: { path: string; label: string }[] = [
  { path: '/subventii', label: 'Subvenția ta' },
  { path: '/oportunitati', label: 'Oportunități' },
  { path: '/surse', label: 'Ce s-a schimbat' },
];

/** The Salariu pages link to each other; on a phone Pensie and Contul tău are also under "Mai mult". */
export const SALARY_PAGES: { path: string; label: string }[] = [
  { path: '/salariu', label: 'Salariul' },
  { path: '/pensie', label: 'Pensie' },
  { path: '/bani', label: 'Contul tău' },
];

/** The tab a page sits under: the subsidy pages under Subvenții, Datele planului and Bani under Salariu. */
export function sectionOf(page: string): string {
  if (SUBSIDY_PAGES.some((p) => p.path === page)) return '/subventii';
  if (page === '/date-plan' || page === '/bani') return '/salariu';
  return page;
}

/** Pages with the strip of crop tabs: the ones whose figures can be told crop by crop. */
export const CROP_TAB_PAGES: readonly string[] = ['/acasa', '/subventii', '/calendar', '/prognoza', '/recolte'];

/**
 * Pages already drawn by React (web/screens with `App`). A link between two of them moves without a
 * page load; a link to a legacy page loads it, because its scripts run once per load (lib/boot.ts).
 * screens.test.ts checks this list against web/screens.
 */
export const REACT_PAGES: readonly string[] = ['/salariu', '/date-plan', '/subventii', '/calendar', '/recolte', '/prognoza', '/pensie', '/bani', '/oportunitati', '/surse', '/acasa'];

export const isReactPage = (page: string) => REACT_PAGES.includes(page);
