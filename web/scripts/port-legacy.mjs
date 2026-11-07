/* Copies the farm-app pages into web/ as React pages.
     node web/scripts/port-legacy.mjs
   Each farm-app/<page>.html becomes web/app/<route>/page.tsx (its body as JSX), and each page
   script becomes a module in web/legacy/ that runs once the page is on screen. The old
   `x.html` links become routes. Re-run it if a farm-app page changes; it overwrites what it wrote. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'htmlparser2';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(web, '..');
const farm = join(root, 'farm-app');

/* ---- Routes ---- */
const PAGES = ['subventii', 'calendar', 'prognoza', 'recolte', 'salariu', 'date-plan', 'pensie', 'bani', 'oportunitati', 'surse', 'onboarding', 'login'];
const routeOf = (name) => (name === '2-rail' ? '/acasa' : `/${name}`);
const NAMES = ['2-rail', ...PAGES].map((n) => n.replace('-', '\\-')).join('|');
const PREFIXED = new RegExp(`\\.\\./(?:farm-app/)?(?:desktop|subsidies)/(${NAMES})\\.html`, 'g');
const BARE = new RegExp(`(?<![\\w/.-])(${NAMES})\\.html\\b`, 'g');
/** `salariu.html`, `../desktop/2-rail.html` → `/salariu`, `/acasa`. External URLs are left alone. */
export const toRoutes = (s) => s.replace(PREFIXED, (_, n) => routeOf(n)).replace(BARE, (_, n) => routeOf(n));
/** The page's name, as the old code compared it, is now its route. */
const PATHNAME_POP = /location\.pathname\.split\('\/'\)\.pop\(\)/g;
const ROUTE_EXPR = "('/' + (location.pathname.split('/').filter(Boolean).pop() || '').replace(/\\.html$/, ''))";

function must(text, from, to, file) {
  if (!text.includes(from)) throw new Error(`${file}: expected to find ${from.slice(0, 60)}`);
  return text.replace(from, to);
}

/* ---- Scripts ---- */
const SCRIPT_PATCHES = {
  'app.js': (t, f) => {
    t = must(t, "const SUBSIDIES = new URL('.', document.currentScript.src).href;", "const SUBSIDIES = '/';", f);
    t = must(t, `const loadLive = () => (live ??= (async () => {
    await addScript(\`\${SUBSIDIES}../config.js\`);
    await addScript(\`\${SUBSIDIES}../live.js\`);
    return window.Live;
  })());`, '/* web/: boot.ts puts config and Live on window before this runs. */\n  const loadLive = () => (live ??= Promise.resolve(window.Live));', f);
    t = must(t, "const ION = { name: 'Ion', age: 55, county: 'Teleorman', region: 'Sud Muntenia', startBalanceBani: 3500000, summary: '15 ha, grâu și porumb', parcels: [{ cropId: 'grau', areaHa: 8, plantedMonth: '2026-10' }, { cropId: 'porumb', areaHa: 7 }] };",
      '/* web/: built by boot.ts from docs/data/demo-ion.json and counties.json. */\n  const ION = window.__ION;', f);
    t = must(t, "if (signedIn()) addEventListener('load', ", "if (signedIn()) (document.readyState === 'complete' ? (f) => f() : (f) => addEventListener('load', f))(", f);
    return t;
  },
  /* The "Dealu Verde" sample farm goes. The landing page puts Ion's figures, built by
     web/lib/landing-data.ts, in window.__LANDING; the app pages only use icons and palettes. */
  'shared.js': (t, f) => {
    const start = t.indexOf('  /* ---- Sample farm ---- */'), end = t.indexOf('  const freed = ');
    if (start < 0 || end < 0) throw new Error(`${f}: sample farm block not found`);
    const real = `  /* ---- The farm on the landing page: Ion, from the engine (web/lib/landing-data.ts) ---- */
  const L = window.__LANDING || { start: 0, months: [], series: { poor: [], expected: [], good: [] }, flows: { poor: [], expected: [], good: [] }, costs: [], crops: [], coming: [], income: [], salary: 0 };
  const START = L.start, GOAL = L.salary;
  const MONTHS = L.months.map((m) => m.short);
  const MONTHS_LONG = L.months.map((m) => m.long);
  const COMING = L.coming, RECENT = [], COSTS = L.costs, CROPS = L.crops, CLEAN = [], RULES = [];

  const S = { extra: 0, reserve: L.salary, path: "expected", tx: RECENT.slice(), sel: new Set(), moved: false, undo: null, view: "home" };
  const subs = [];
  const on = (fn) => { subs.push(fn); fn(); };
  const emit = () => subs.forEach((f) => f());

  const series = (path) => (L.series[path] || []).map((b) => b + S.extra);
  const lowOf = (a) => { let k = 0; a.forEach((v, i) => { if (v < a[k]) k = i; }); return { i: k, v: a[k], month: MONTHS_LONG[k] }; };
  function table(path) {
    const s = series(path), low = lowOf(s).i;
    return s.map((bal, i) => ({ m: MONTHS_LONG[i], low: i === low, in: L.flows[path][i].in, out: L.flows[path][i].out, bal }));
  }
  const balance = () => START + S.extra;
`;
    t = t.slice(0, start) + real + t.slice(end);
    t = t.replace('/* Sample farm model, palettes and shared interactions for the three mobile variations.\n   All figures are fictional.', '/* Palettes, icons, money formatting and shared interactions. The landing page\'s farm is Ion\'s, from the engine.');
    return t
      .replace('<span>Margin per hectare</span>', '<span>Rămâne pe hectar</span>')
      .replace('Projected cash for twelve months. Lowest in ${lowOf(series(S.path)).month} at ${lei(lowOf(series(S.path)).v)}.', 'Banii din cont, lună cu lună, pe douăsprezece luni. Cel mai puțin în ${lowOf(series(S.path)).month}: ${lei(lowOf(series(S.path)).v)}.');
  },
  'notifications.js':(t, f) => must(t, "const BASE = new URL('.', document.currentScript.src);", "const BASE = new URL('/', location.href);", f),
};

function portScript(src, name) {
  let text = readFileSync(src, 'utf8');
  const patch = SCRIPT_PATCHES[name];
  if (patch) text = patch(text, name);
  text = toRoutes(text).replace(PATHNAME_POP, ROUTE_EXPR);
  return `/* Ported from farm-app by web/scripts/port-legacy.mjs. Edit farm-app, or edit here and stop re-running the port. */
/* eslint-disable */
// @ts-nocheck
export default function install() {
${text}
}
`;
}

/* ---- HTML → JSX ---- */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const NO_TEXT = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup', 'select', 'ul', 'ol', 'dl', 'svg', 'g', 'defs', 'mask', 'clipPath', 'linearGradient', 'radialGradient', 'datalist', 'optgroup']);
const RENAME = {
  class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength',
  autocomplete: 'autoComplete', autofocus: 'autoFocus', inputmode: 'inputMode', enterkeyhint: 'enterKeyHint', colspan: 'colSpan',
  rowspan: 'rowSpan', novalidate: 'noValidate', srcset: 'srcSet', crossorigin: 'crossOrigin', spellcheck: 'spellCheck',
  contenteditable: 'contentEditable', datetime: 'dateTime', fetchpriority: 'fetchPriority', imagesrcset: 'imageSrcSet',
  imagesizes: 'imageSizes', 'xlink:href': 'xlinkHref', 'xml:space': 'xmlSpace', enctype: 'encType', formnovalidate: 'formNoValidate',
  accesskey: 'accessKey', autocapitalize: 'autoCapitalize', allowfullscreen: 'allowFullScreen', playsinline: 'playsInline', referrerpolicy: 'referrerPolicy',
};
const BOOLEAN = new Set(['hidden', 'disabled', 'required', 'multiple', 'open', 'inert', 'novalidate', 'readonly', 'autofocus', 'controls', 'muted', 'loop', 'autoplay', 'playsinline', 'defer', 'async', 'reversed', 'formnovalidate', 'allowfullscreen']);
const NUMERIC = new Set(['maxLength', 'minLength', 'tabIndex', 'rows', 'cols', 'size', 'colSpan', 'rowSpan', 'span', 'start']);
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const q = (s) => JSON.stringify(s);

function styleObject(css) {
  const parts = css.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    const prop = d.slice(0, i).trim(), value = d.slice(i + 1).trim();
    return `${q(prop.startsWith('--') ? prop : camel(prop))}: ${q(value)}`;
  });
  return `{{ ${parts.join(', ')} }}`;
}

function attrs(el) {
  const out = [];
  for (const [rawName, rawValue] of Object.entries(el.attribs)) {
    const lower = rawName.toLowerCase();
    let value = rawValue;
    if ((lower === 'href' || lower === 'action') && value) value = toRoutes(value);
    if (/^on[a-z]+$/.test(lower)) throw new Error(`inline handler ${rawName} on <${el.name}>: move it to the page script`);
    if (lower === 'style') { out.push(`style=${styleObject(value)}`); continue; }
    if (lower === 'checked') { out.push('defaultChecked'); continue; }
    if (lower === 'selected') { out.push('data-selected=""'); continue; } // React wants defaultValue on <select>; see below
    if (lower === 'value' && (el.name === 'input' || el.name === 'textarea')) { out.push(`defaultValue=${q(value)}`); continue; }
    let name = RENAME[lower] ?? rawName;
    if (!lower.startsWith('data-') && !lower.startsWith('aria-') && name.includes('-')) name = camel(name);
    if (BOOLEAN.has(lower) && (value === '' || value === lower)) { out.push(name); continue; }
    if (NUMERIC.has(name) && /^-?\d+$/.test(value)) { out.push(`${name}={${value}}`); continue; }
    out.push(`${name}=${q(value)}`);
  }
  if (el.name === 'select') {
    const chosen = el.children.find((c) => c.type === 'tag' && c.name === 'option' && 'selected' in c.attribs);
    if (chosen) out.push(`defaultValue=${q(chosen.attribs.value ?? textOf(chosen))}`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}
const textOf = (n) => (n.type === 'text' ? n.data : (n.children ?? []).map(textOf).join(''));

const BLOCK = new Set(['div', 'section', 'header', 'footer', 'main', 'nav', 'aside', 'article', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'form', 'fieldset', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'dialog', 'figure', 'figcaption', 'details', 'summary', 'hr', 'br', 'template', 'style', 'script', 'picture', 'canvas', 'video']);
const isBlock = (n) => !n || n.type === 'comment' || n.type === 'script' || n.type === 'style' || (n.type === 'tag' && BLOCK.has(n.name));
const SAFE_TEXT = /^[^{}<>&]*$/;
const kidsOf = (node) => (node.children ?? []).filter((c) => c.type !== 'comment' && c.type !== 'directive' && c.type !== 'script');

function jsx(node, depth, parent, prev, next) {
  const pad = '  '.repeat(depth);
  if (node.type === 'comment' || node.type === 'directive' || node.type === 'script') return '';
  if (node.type === 'text') {
    const t = node.data;
    if (!t.trim()) {
      // HTML keeps one space here; it only shows between inline things.
      if (parent === null || NO_TEXT.has(parent) || !prev || !next || (isBlock(prev) && isBlock(next))) return '';
      return `${pad}{" "}\n`;
    }
    return `${pad}{${q(t.replace(/\s+/g, ' '))}}\n`;
  }
  if (node.type === 'style') return `${pad}<style dangerouslySetInnerHTML={{ __html: ${q(textOf(node))} }} />\n`;
  if (node.name === 'template') return `${pad}<template dangerouslySetInnerHTML={{ __html: ${q(innerHtml(node))} }}${attrs(node)} />\n`;
  const open = `<${node.name}${attrs(node)}`;
  if (VOID.has(node.name)) return `${pad}${open} />\n`;
  const kids = kidsOf(node);
  if (!kids.length || (kids.length === 1 && kids[0].type === 'text' && !kids[0].data.trim())) return `${pad}${open}></${node.name}>\n`;
  if (kids.length === 1 && kids[0].type === 'text') {
    const t = kids[0].data.replace(/\s+/g, ' ');
    const inner = SAFE_TEXT.test(t) && t === t.trim() ? t : `{${q(t)}}`;
    return `${pad}${open}>${inner}</${node.name}>\n`;
  }
  const body = kids.map((c, i) => jsx(c, depth + 1, node.name, kids[i - 1], kids[i + 1])).join('');
  if (!body.trim()) return `${pad}${open}></${node.name}>\n`;
  return `${pad}${open}>\n${body}${pad}</${node.name}>\n`;
}
function innerHtml(node) {
  return node.children.map((c) => {
    if (c.type === 'text') return c.data;
    if (c.type === 'comment') return '';
    const a = Object.entries(c.attribs).map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v.replace(/"/g, '&quot;')}"`)).join('');
    return VOID.has(c.name) ? `<${c.name}${a}>` : `<${c.name}${a}>${innerHtml(c)}</${c.name}>`;
  }).join('');
}

const find = (n, name) => (n.name === name ? n : (n.children ?? []).map((c) => find(c, name)).find(Boolean));
const findAll = (n, name, out = []) => { if (n.name === name) out.push(n); (n.children ?? []).forEach((c) => findAll(c, name, out)); return out; };

/* What each <script src> becomes. Globals the old pages loaded as files are set up by boot.ts. */
const SCRIPT_KEYS = {
  '../mobile/shared.js': 'shared', '../farm-app/mobile/shared.js': 'shared', '../config.js': 'config', '../live.js': 'live', 'engine.js': 'engine',
  '../vendor/react.production.min.js': 'react', '../vendor/react-dom.production.min.js': 'react', '../vendor/react-is.production.min.js': 'react', '../vendor/Recharts.js': 'recharts',
};
const CSS_FILES = { '../farm-app/mobile/shared.css': 'shared.css', '../farm-app/desktop/desktop.css': 'desktop.css', '../mobile/shared.css': 'shared.css', '../desktop/desktop.css': 'desktop.css', '../desktop/rail.css': 'rail.css', 'subsidies.css': 'subsidies.css', 'notifications.css': 'notifications.css' };

function portPage(file, route, { cssBase = '' } = {}) {
  const html = readFileSync(file, 'utf8');
  const doc = parseDocument(html, { lowerCaseAttributeNames: false, recognizeSelfClosing: true });
  const htmlEl = find(doc, 'html'), head = find(doc, 'head'), body = find(doc, 'body');
  const title = textOf(find(head, 'title') ?? { type: 'text', data: '' }).trim();
  const theme = findAll(head, 'meta').find((m) => m.attribs.name === 'theme-color')?.attribs.content;
  const css = findAll(head, 'link').filter((l) => l.attribs.rel === 'stylesheet').map((l) => CSS_FILES[cssBase + l.attribs.href] ?? CSS_FILES[l.attribs.href]);
  if (css.includes(undefined)) throw new Error(`${file}: unknown stylesheet`);
  const headStyles = findAll(head, 'style').map((s) => jsx(s, 3, 'head')).join('');
  const top = kidsOf(body);
  const scripts = [];
  for (const s of findAll(body, 'script')) {
    const src = s.attribs.src;
    if (!src) { scripts.push('inline'); continue; }
    const key = SCRIPT_KEYS[src] ?? src.replace(/\.js$/, '');
    if (!scripts.includes(key)) scripts.push(key);
  }
  const bodyJsx = top.map((c, i) => jsx(c, 3, null, top[i - 1], top[i + 1])).join('');
  const palette = htmlEl.attribs['data-default-palette'];
  const dir = join(web, 'app', route === '/' ? '' : route.slice(1));
  mkdirSync(dir, { recursive: true });
  const name = route === '/' ? 'Landing' : camel(`-${route.slice(1)}`);
  writeFileSync(join(dir, 'page.tsx'), `/* Ported from ${file.slice(root.length + 1).replace(/\\/g, '/')} by web/scripts/port-legacy.mjs. */
import type { Metadata, Viewport } from 'next';
import LegacyPage from '${route === '/' ? '.' : '..'}/../components/LegacyPage';
${css.map((c) => `import '${route === '/' ? '.' : '..'}/../styles/${c}';`).join('\n')}

export const metadata: Metadata = { title: ${q(title)} };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover'${theme ? `, themeColor: ${q(theme)}` : ''} };

export default function ${name}Page() {
  return (
    <LegacyPage scripts={${JSON.stringify(scripts)}}${palette ? ` palette=${q(palette)}` : ''}${htmlEl.attribs['data-variant'] ? ` variant=${q(htmlEl.attribs['data-variant'])}` : ''}>
${headStyles}${bodyJsx}    </LegacyPage>
  );
}
`);
  const inline = findAll(body, 'script').filter((s) => !s.attribs.src).map(textOf);
  return { scripts, inline };
}

/* ---- Run ---- */
const legacy = join(web, 'legacy');
mkdirSync(legacy, { recursive: true });
const SCRIPT_FILES = ['app', 'acasa', 'bani', 'calendar', 'chart', 'data-calls', 'data-sources', 'date-plan', 'login', 'notifications', 'onboarding', 'oportunitati', 'papers', 'pensie', 'pension-chart', 'prognoza', 'recolte', 'salariu', 'seasons', 'subventii', 'surse'];
for (const s of SCRIPT_FILES) writeFileSync(join(legacy, `${s}.js`), portScript(join(farm, 'subsidies', `${s}.js`), `${s}.js`));
writeFileSync(join(legacy, 'shared.js'), portScript(join(farm, 'mobile', 'shared.js'), 'shared.js'));

for (const p of PAGES) portPage(join(farm, 'subsidies', `${p}.html`), routeOf(p));
portPage(join(farm, 'desktop', '2-rail.html'), '/acasa', { cssBase: '../desktop/' });
if (process.argv.includes('--landing')) {
  if (existsSync(join(web, 'app', 'page.tsx'))) throw new Error('app/page.tsx exists and was edited by hand; move it away first');
  /* Once only: the landing page was then rewritten by hand in Romanian on Ion's figures. */
  const { inline } = portPage(join(root, 'landing-variations', '10-harvest.html'), '/');
  writeFileSync(join(web, 'scripts', 'landing-inline.js'), inline.join('\n'));
}
console.log(`ported ${PAGES.length + 1} pages and ${SCRIPT_FILES.length + 1} scripts`);
