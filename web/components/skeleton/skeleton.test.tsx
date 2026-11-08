import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_PAGES } from '../../lib/paths';
import type { ScreenName } from '../../screens/types';
import { Bone, BoneCard, BoneText } from './Bone';
import AppSkeleton from './AppSkeleton';
import FlowSkeleton from './FlowSkeleton';
import { SCREEN_SKELETONS } from './screens';

const web = join(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
const text = (html: string) => html.replace(/<[^>]*>/g, '');
const NAMES = DEMO_PAGES.map((p) => p.slice(1) as ScreenName);

describe('skeleton pieces', () => {
  it('sizes a bone from numbers and CSS lengths', () => {
    expect(renderToStaticMarkup(createElement(Bone, { w: 40, h: 20, r: 8 }))).toContain('width:40px;height:20px;border-radius:8px');
    expect(renderToStaticMarkup(createElement(Bone, { w: '60%' }))).toContain('width:60%');
  });

  it('shortens only the last line of a paragraph', () => {
    const html = renderToStaticMarkup(createElement(BoneText, { lines: 3, last: '50%' }));
    expect(html.match(/class="bone"/g)).toHaveLength(3);
    expect(html.match(/width:50%/g)).toHaveLength(1);
  });

  it('puts a card in the bento grid', () => {
    expect(renderToStaticMarkup(createElement(BoneCard, { span: 's7' }))).toContain('class="card s7 bone-card"');
  });
});

describe('screen skeletons', () => {
  const page = (name: ScreenName, mode: 'farm' | 'demo' = 'farm') => renderToStaticMarkup(createElement(AppSkeleton, { mode, children: createElement(SCREEN_SKELETONS[name]) }));

  for (const name of NAMES) {
    it(`${name} uses the real frame, with shapes only`, () => {
      const html = page(name);
      for (const c of ['class="rail field"', 'class="m-top field"', 'class="shell"', 'class="main"', 'sk-head']) expect(html).toContain(c);
      expect(html).toContain('class="bone');
      /* No words or figures that could be mistaken for the farm's. */
      expect(text(html)).toBe('');
    });
  }

  it('shows Ion’s strip on his farm only, since it pushes the page down there', () => {
    expect(page('salariu', 'demo')).toContain('class="demo-strip"');
    expect(page('salariu', 'farm')).not.toContain('class="demo-strip"');
  });

  it('draws one rail row per tab', () => {
    // Seven on the rail, three of them only there, and "Mai mult" for a phone.
    expect(page('acasa').match(/class="sk-tab/g)).toHaveLength(8);
    expect(page('acasa').match(/sk-tab rail-only/g)).toHaveLength(3);
    expect(page('acasa').match(/sk-tab more-tab/g)).toHaveLength(1);
  });

  it('gives onboarding its own frame, with a status line and no rail tabs of the app', () => {
    const html = renderToStaticMarkup(createElement(FlowSkeleton));
    expect(html).toContain('app ob-flow');
    expect(html.match(/class="sk-tab/g)).toHaveLength(3);
    expect(html).toContain('role="status"');
  });
});

/* A skeleton that nothing takes away would sit over the page for ever, so every way a page can end
   up showing something has to mark it ready. */
describe('leaving the skeleton', () => {
  const boot = read('lib', 'boot.ts');
  const legacy = read('components', 'LegacyPage.tsx');
  const reactScreen = read('components', 'app', 'ReactScreen.tsx');
  const guard = read('components', 'app', 'Guard.tsx');
  const css = read('styles', 'skeleton.css');

  it('happens when the scripts finish, and on the guard’s own screens', () => {
    expect(boot).toMatch(/\.default\(\);\s+\}\s+markReady\(\);/);
  });

  it('happens when the scripts fail, with a way to try again', () => {
    expect(legacy).toMatch(/\(e\) => \{[\s\S]*?markReady\(\);[\s\S]*?setFailed/);
    expect(legacy).toContain('location.reload()');
  });

  it('waits for the farm on React screens, and for the guard’s card without one', () => {
    expect(reactScreen).toMatch(/const here = ready && !!farm\?\.baseFarm;[\s\S]*?if \(here\) markReady\(\);/);
    expect(guard).toMatch(/if \(blocked\) markReady\(\);/);
  });

  it('is not waited for without JavaScript, nor animated when motion is turned off', () => {
    expect(css).toMatch(/@media \(scripting: none\) \{\s+\.boot-skel \{ display: none; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s+\.bone \{[^}]*animation:/);
    expect(css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, '')).not.toMatch(/animation:/);
  });
});

describe('loading inside a page', () => {
  it('shows bones for the weather, and still says when it failed', () => {
    const acasa = read('components', 'pages', 'Acasa.tsx');
    expect(acasa).toContain('wx-wait');
    expect(acasa).toContain('Nu am putut aduce vremea acum.');
  });

  it('marks the buttons that move money as busy, and clears that on failure', () => {
    for (const file of ['Bani.tsx', 'Pensie.tsx']) {
      const src = read('components', 'pages', file);
      expect(src).toContain('aria-busy={busy');
    }
  });
});
