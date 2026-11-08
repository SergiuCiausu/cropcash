'use client';
/* The app frame for React screens: the rail on a computer, the top bar and bottom tabs on a phone,
   the harvest picker, notifications, "Întreabă", and around the page's content: the offline banner,
   Ion's demo strip and the sign-out links. It's web/legacy/app.js's frame(), netBanner(),
   demoStrip(), closedView() and futureNote(), drawn by React. */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { date } from '../../lib/cc/format';
import { scopeOf } from '../../lib/cc/plan';
import { useFarmState, useStore, useView } from '../../lib/cc/react';
import { appHref, storageKey, type Mode } from '../../lib/paths';
import '../../lib/ui/install';
import { CROP_TAB_PAGES, isReactPage, SALARY_PAGES, sectionOf, SUBSIDY_PAGES, TABS } from '../../lib/ui/nav';
import { Icon } from './bits';
import { FrameContext, type FrameInfo } from './context';
import { CropTabs } from './CropTabs';
import { Guard } from './Guard';
import { NetBanner } from './NetBanner';
import { Bell, NotificationPanel, Toaster, useToaster } from './Notifications';
import { Assistant } from './Assistant';
import { takeFlash } from './useSaved';
import { ClosedView } from './PageNotes';
import { PapersProvider } from './Papers';

/** A link to an app page: client-side between the app's screens, a full load anywhere else. */
export function PageLink({ path, href, children, ...rest }: { path: string; href: string; children: ReactNode; className?: string; 'aria-current'?: 'page' }) {
  const page = path.split(/[?#]/)[0];
  return isReactPage(page) ? (
    <Link href={href} {...rest}>
      {children}
    </Link>
  ) : (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

/** Only these pages swap to "Plan și realitate" for a finished harvest. Recolte and Pensie stay themselves. */
const CLOSED_PAGES = ['/subventii', '/calendar', '/prognoza'];

export const Logo = () => (
  <span className="logo">
    <span className="mark">
      <Icon name="sprout" />
    </span>
    <span>CropCash</span>
  </span>
);

export default function Frame({ page, mode, children }: { page: string; mode: Mode; children: ReactNode }) {
  const scope = scopeOf(page);
  const store = useStore();
  const { ready, farm } = useFarmState();
  const view = useView(scope);
  const [panel, setPanel] = useState(false);
  const toaster = useToaster();

  const href = useCallback((path: string) => appHref(path, mode), [mode]);
  const info: FrameInfo = useMemo(() => ({ page, mode, scope, href, notify: toaster.notify }), [page, mode, scope, href, toaster.notify]);
  const section = sectionOf(page);
  useEffect(() => {
    const note = takeFlash(mode);
    if (note) toaster.notify(note);
  }, [mode, toaster.notify]);

  /* A farm page with no farm on the phone waits for the guard, and draws nothing of the farm. */
  if (ready && farm && !farm.baseFarm) return <Guard />;

  const bell = (where: string) => <Bell key={where} open={panel} mode={mode} onToggle={() => setPanel((o) => !o)} />;
  const isDemo = mode === 'demo';
  const signedIn = !isDemo && !!farm?.signedIn;

  return (
    <FrameContext.Provider value={info}>
      <PapersProvider>
      <div className="app">
        <header className="m-top field">
          <Logo />
          {view && bell('top')}
        </header>
        <div className="shell">
          <aside className="rail field">
            <Logo />
            <nav aria-label="Principal">
              {TABS.map((t) => (
                <PageLink key={t.path} path={t.path} href={href(t.path)} className={t.railOnly ? 'rail-only' : undefined} aria-current={t.path === section ? 'page' : undefined}>
                  <Icon name={t.icon} />
                  {t.label}
                </PageLink>
              ))}
              <MoreMenu page={page} section={section} href={href} signedIn={signedIn} />
            </nav>
            {view && bell('rail')}
            {view && (
              <div className="farm glass">
                <b>
                  {view.farm.name}, {view.farm.county}
                </b>
                {view.farm.summary}
                <br />
                Date din {date(view.today, true)}
                <br />
                {isDemo ? (
                  <button type="button" className="link" onClick={() => resetDemo(store, view.farm.name)}>
                    Pornește din nou
                  </button>
                ) : (
                  <a href="/onboarding">Schimbă ferma</a>
                )}
              </div>
            )}
          </aside>
          <main className="main">
            {view?.closed && CLOSED_PAGES.includes(page) ? (
              <div>
                {/* The tabs stay above a finished crop, so the farmer can move on from it. */}
                <CropTabs view={view} />
                <ClosedView view={view} />
              </div>
            ) : (
              <div>
                <NetBanner />
                {isDemo && view && <DemoStrip name={view.farm.name} onReset={() => resetDemo(store, view.farm.name)} />}
                {view && CROP_TAB_PAGES.includes(page) && <CropTabs view={view} />}
                {view && SALARY_PAGES.some((p) => p.path === page) && <SubNav page={page} href={href} pages={SALARY_PAGES} label="Salariu" className="phone-only" />}
                {view ? children : null}
              </div>
            )}
            {/* Phones hide the rail, so this sits at the end of the page. */}
            {signedIn && page !== '/bani' && (
              <p className="sign-out">
                <PageLink path="/bani" href={href('/bani')}>Contul tău</PageLink>
              </p>
            )}
          </main>
        </div>
      </div>
      {view && <NotificationPanel view={view} open={panel} onClose={() => setPanel(false)} />}
      <Toaster toaster={toaster} />
      {view && <Assistant />}
      </PapersProvider>
    </FrameContext.Provider>
  );
}

/**
 * A phone's bottom bar has four tabs and "Mai mult", which opens the rail-only pages (Calendar, Prognoză,
 * Pensie, and Contul tău when signed in) just above the bar. A small menu, not a Sheet: a Sheet adds a
 * history entry, and leaving the page from inside one would make Back land on the wrong page.
 */
function MoreMenu({ page, section, href, signedIn }: { page: string; section: string; href: (p: string) => string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [page]);
  useEffect(() => {
    /* "Întreabă" floats above the bottom bar and would cover the menu's last row. */
    document.documentElement.classList.toggle('more-open', open);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);
  const items = [
    ...TABS.filter((t) => t.railOnly),
    ...(signedIn ? [{ path: '/bani', icon: 'shield' as const, label: 'Contul tău' }] : []),
  ];
  const here = items.some((t) => t.path === section || t.path === page);
  return (
    <>
      <button
        type="button"
        className={here ? 'more-tab m-current' : 'more-tab'}
        aria-expanded={open}
        aria-controls="more-menu"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" />
        Mai mult
      </button>
      {open && (
        <>
          <div className="more-backdrop" onClick={() => setOpen(false)} />
          <div className="more-menu" id="more-menu">
            {items.map((t) => (
              <PageLink key={t.path} path={t.path} href={href(t.path)} aria-current={t.path === page ? 'page' : undefined}>
                <Icon name={t.icon} />
                {t.label}
              </PageLink>
            ))}
          </div>
        </>
      )}
    </>
  );
}

const STRIP_SEEN = storageKey('cropcash-demo-strip-seen', 'demo');

/** Ion's farm says it's an example, offers an account, and can throw away what the visitor changed.
    After the first page it shrinks to one line, so the farm itself fits on a phone's first screen. */
function DemoStrip({ name, onReset }: { name: string; onReset: () => void }) {
  const [compact] = useState(() => {
    try {
      return !!sessionStorage.getItem(STRIP_SEEN);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(STRIP_SEEN, '1');
    } catch {
      /* Private mode: the strip just stays full size. */
    }
  }, []);
  if (compact)
    return (
      <aside className="demo-strip compact" aria-label="Exemplu">
        <p>
          <b>Ferma lui {name}, un exemplu.</b>
        </p>
        <a href="/login?mode=register">Fă-ți cont</a>
        <button type="button" className="link" onClick={onReset}>
          Pornește din nou
        </button>
      </aside>
    );
  return (
    <aside className="demo-strip" aria-label="Exemplu">
      <p>
        <b>Asta e ferma lui {name}, un exemplu.</b> Ce schimbi aici rămâne doar pe acest dispozitiv.
      </p>
      <div className="demo-acts">
        <a className="btn btn-dark" href="/login?mode=register">
          Fă-ți cont
        </a>
        <button type="button" className="btn btn-line" onClick={onReset}>
          Pornește din nou
        </button>
      </div>
    </aside>
  );
}

function resetDemo(store: ReturnType<typeof useStore>, name: string) {
  if (store && confirm(`Ștergi tot ce ai schimbat în ferma lui ${name}?`)) store.resetDemo();
}

/** The sub-navigation of the Subvenții tab, for screens that have one. */
export function SubNav({ page, href, pages = SUBSIDY_PAGES, label = 'Subvenții', className = '' }: { page: string; href: (p: string) => string; pages?: { path: string; label: string }[]; label?: string; className?: string }) {
  return (
    <nav className={`subnav ${className}`.trim()} aria-label={label}>
      {pages.map((p) => (
        <PageLink key={p.path} path={p.path} href={href(p.path)} aria-current={p.path === page ? 'page' : undefined}>
          {p.label}
        </PageLink>
      ))}
    </nav>
  );
}
