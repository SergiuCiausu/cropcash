import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { appHref, DEMO_BASE, DEMO_PAGES, isDemoPath, modeOf, pageOf, storageKey } from './paths';

describe('isDemoPath and modeOf', () => {
  it('knows Ion’s farm by its prefix', () => {
    expect(isDemoPath('/ferma-lui-ion')).toBe(true);
    expect(isDemoPath('/ferma-lui-ion/salariu')).toBe(true);
    expect(isDemoPath('/ferma-lui-ion/salariu.html')).toBe(true);
    expect(modeOf('/ferma-lui-ion/acasa')).toBe('demo');
  });

  it('keeps the farmer’s app and look-alike paths out', () => {
    expect(isDemoPath('/salariu')).toBe(false);
    expect(isDemoPath('/')).toBe(false);
    expect(isDemoPath('/ferma-lui-ionel/acasa')).toBe(false);
    expect(modeOf('/acasa')).toBe('farm');
  });
});

describe('pageOf', () => {
  it('gives the same page with or without the prefix and .html', () => {
    for (const p of ['/salariu', '/salariu.html', '/ferma-lui-ion/salariu', '/ferma-lui-ion/salariu.html', '/salariu/']) {
      expect(pageOf(p)).toBe('/salariu');
    }
  });

  it('gives "/" on the landing page, as app.js always did', () => {
    expect(pageOf('/')).toBe('/');
    expect(pageOf('')).toBe('/');
  });
});

describe('appHref', () => {
  it('leaves every link alone in the farmer’s app', () => {
    expect(appHref('/salariu', 'farm')).toBe('/salariu');
    expect(appHref('/recolte#cultura', 'farm')).toBe('/recolte#cultura');
  });

  it('keeps Ion’s visitors on Ion’s farm, with search and hash', () => {
    expect(appHref('/salariu', 'demo')).toBe('/ferma-lui-ion/salariu');
    expect(appHref('/recolte#cultura', 'demo')).toBe('/ferma-lui-ion/recolte#cultura');
    expect(appHref('/bani?tab=plati', 'demo')).toBe('/ferma-lui-ion/bani?tab=plati');
    for (const page of DEMO_PAGES) expect(appHref(page, 'demo')).toBe(`${DEMO_BASE}${page}`);
  });

  it('never prefixes twice, nor pages that have no copy on Ion’s farm', () => {
    expect(appHref('/ferma-lui-ion/salariu', 'demo')).toBe('/ferma-lui-ion/salariu');
    expect(appHref('/login?next=/acasa', 'demo')).toBe('/login?next=/acasa');
    expect(appHref('/onboarding', 'demo')).toBe('/onboarding');
    expect(appHref('/', 'demo')).toBe('/');
    expect(appHref('/salariul', 'demo')).toBe('/salariul');
  });

  it('leaves hashes, relative links and other sites alone', () => {
    expect(appHref('#nou', 'demo')).toBe('#nou');
    expect(appHref('https://apia.org.ro/salariu', 'demo')).toBe('https://apia.org.ro/salariu');
  });
});

describe('storageKey', () => {
  it('keeps a real farm’s keys as they are', () => {
    expect(storageKey('cropcash-harvests', 'farm')).toBe('cropcash-harvests');
  });

  it('gives Ion’s farm its own keys, which sign-out still clears', () => {
    expect(storageKey('cropcash-harvests', 'demo')).toBe('cropcash-demo-harvests');
    expect(storageKey('cropcash-outbox-refused', 'demo')).toBe('cropcash-demo-outbox-refused');
    expect(storageKey('cropcash-harvests', 'demo').startsWith('cropcash')).toBe(true);
  });

  it('never prefixes twice, and leaves other keys alone', () => {
    expect(storageKey('cropcash-demo-harvests', 'demo')).toBe('cropcash-demo-harvests');
    expect(storageKey('farm-palette:2-rail', 'demo')).toBe('farm-palette:2-rail');
  });
});

/* Every link to an app page has to go through appHref (CC.href in the scripts, <AppLink> in the
   pages), or Ion's visitors fall out of the demo. This finds the ones that don't. The landing page
   links to both places on purpose, so it isn't searched. Lists that only name a page
   (WHOLE_FARM_PAGES, PAGES, TABS) aren't links and aren't matched; where they become links, they
   go through href() too. */
const web = join(import.meta.dirname, '..');
const PAGE = DEMO_PAGES.map((p) => p.slice(1)).join('|');
const LINK = new RegExp(String.raw`(?:<a\s[^>]*?\bhref\s*=\s*\{?\s*|\bhref:\s*|\.href\s*=\s*|location\.(?:replace|assign)\(\s*|\bpage\(\s*)['"\`]/(?:${PAGE})\b`, 'g');
const SKIP = new Set(['app/page.tsx', 'legacy/landing.js']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|js)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('links to app pages', () => {
  it('finds the links the scan is written for', () => {
    expect('<a class="btn" href="/recolte#nou">'.match(LINK)).toHaveLength(1);
    expect('<a href={"/salariu"}>'.match(LINK)).toHaveLength(1);
    expect("el('x').href = '/pensie';".match(LINK)).toHaveLength(1);
    expect("location.href = '/salariu';".match(LINK)).toHaveLength(1);
    expect("location.replace('/acasa')".match(LINK)).toHaveLength(1);
    expect("action: { href: '/bani' }".match(LINK)).toHaveLength(1);
    expect("href: page('/salariu')".match(LINK)).toHaveLength(1);
  });

  it('leaves links that already go through the helper', () => {
    expect('<a href="${CC.href(\'/recolte\')}">'.match(LINK)).toBeNull();
    expect('<AppLink href="/recolte">'.match(LINK)).toBeNull();
    expect("href: page(CC.href('/salariu'))".match(LINK)).toBeNull();
    expect("const PAGES = ['/acasa', '/bani'];".match(LINK)).toBeNull();
    expect('<a href="/login?signout=1">'.match(LINK)).toBeNull();
  });

  it('has no hard-coded link to an app page', () => {
    const hits: string[] = [];
    for (const file of ['app', 'legacy', 'components', 'screens'].flatMap((r) => files(join(web, r)))) {
      const name = relative(web, file).split('\\').join('/');
      if (SKIP.has(name)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const m of line.match(LINK) ?? []) hits.push(`${name}:${i + 1} ${m}`);
        });
    }
    expect(hits).toEqual([]);
  });
});

/* /salariu and /ferma-lui-ion/salariu share one body (web/screens). A route file that grows its
   own HTML would make the two drift apart, so each one only picks its screen. */
describe('app routes', () => {
  for (const page of DEMO_PAGES) {
    it(`${page} only picks its screen`, () => {
      const name = page.slice(1);
      const src = readFileSync(join(web, 'app', name, 'page.tsx'), 'utf8');
      expect(src).toContain(`<Screen name="${name}" />`);
      expect(src).toContain(`screenMetadata('${name}')`);
      expect(src).not.toMatch(/<main\b|LegacyPage/);
      expect(statSync(join(web, 'screens', `${name}.tsx`)).isFile()).toBe(true);
    });
  }
});

describe('Ion’s farm route', () => {
  const src = readFileSync(join(web, 'app', 'ferma-lui-ion', '[page]', 'page.tsx'), 'utf8');

  it('is built for exactly the pages in DEMO_PAGES, and nothing else', () => {
    expect(src).toContain('DEMO_PAGES.map');
    expect(src).toMatch(/export const dynamicParams = false/);
  });

  it('shows each screen in demo mode', () => {
    expect(src).toContain('mode="demo"');
    expect(src).toContain("screenMetadata((await params).page as ScreenName, 'demo')");
  });
});

/* What a visitor does on Ion's farm must not land in a real farm's keys. Every cropcash-* key in
   the scripts goes through key() (CC.key in page scripts). Currency and its rates are the
   visitor's own choice, not farm data, so they're shared on purpose. */
describe('saved keys', () => {
  const SHARED = new Set(["'cropcash-currency'", "'cropcash-rates'"]);
  it('go through key()', () => {
    const hits: string[] = [];
    for (const file of files(join(web, 'legacy'))) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const m of line.matchAll(/(key\(\s*)?(['"`]cropcash-[a-z-]+['"`])/gi)) {
            if (!m[1] && !SHARED.has(m[2]!)) hits.push(`${relative(web, file).split('\\').join('/')}:${i + 1} ${m[2]}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});

/* The landing page is for visitors. A link straight to a page of the farmer's app would only bounce
   them to /login, so it offers an account (/login) or Ion's farm. landing.js turns the account
   buttons into "Mergi la ferma ta" (/acasa) for someone already signed in. */
describe('landing page links', () => {
  const src = readFileSync(join(web, 'app', 'page.tsx'), 'utf8');
  const hrefs = [...src.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1]!).filter((h) => h.startsWith('/') && !h.startsWith('/img/'));

  it('never sends a visitor straight to the farmer’s app', () => {
    expect(hrefs.filter((h) => DEMO_PAGES.includes(pageOf(h.split(/[?#]/)[0]!) as (typeof DEMO_PAGES)[number]) && !isDemoPath(h))).toEqual([]);
  });

  it('offers an account and Ion’s farm', () => {
    expect(hrefs).toContain('/login');
    expect(hrefs).toContain('/login?mode=register');
    expect(hrefs).toContain('/ferma-lui-ion/acasa');
  });

  it('marks every account button, so a signed-in farmer gets their farm instead', () => {
    const buttons = [...src.matchAll(/<a [^>]*href="\/login[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).toContain('data-account');
    expect(readFileSync(join(web, 'legacy', 'landing.js'), 'utf8')).toContain('[data-account]');
  });
});
